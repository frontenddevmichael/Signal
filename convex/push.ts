/**
 * §12 Web Push via VAPID — the free, no-third-party notification path.
 * The heavy lifting (aes128gcm payload encryption + VAPID JWT) lives in the
 * node-runtime file pushSender.ts, exactly like Phase 2's githubClient.ts —
 * node crypto goes in "use node" files, Web Crypto everywhere else.
 *
 * Triggers (§12): new message (WhatsApp/email inbound — fired by the write
 * mutations via scheduler.runAfter), invoice paid (applyPayment), invoice
 * newly overdue + project deadline approaching (the daily cron at the bottom).
 * All of them call the userId-targeted notifyUser action — webhooks and crons
 * have no browser session, so the trigger fires with the resolved userId.
 */
import { action, internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import type { GenericId } from "convex/values";
import { cronJobs } from "convex/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { selectDueNotifications } from "./pushLogic";

export const subscribe = mutation({
  args: { endpoint: v.string(), p256dh: v.string(), auth: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const s of existing) {
      if (s.endpoint === args.endpoint) return { ok: true }; // already subscribed
    }
    await ctx.db.insert("pushSubscriptions", {
      userId,
      endpoint: args.endpoint,
      p256dh: args.p256dh,
      auth: args.auth,
      createdAt: Date.now(),
    });
    return { ok: true };
  },
});

export const unsubscribe = mutation({
  args: { endpoint: v.string() },
  handler: async (ctx, { endpoint }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return;
    const subs = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const hit = subs.find((s) => s.endpoint === endpoint);
    if (hit) await ctx.db.delete(hit._id);
  },
});

/** Public VAPID key for the browser's push registration. */
export const vapidPublicKey = query({
  args: {},
  handler: async () => process.env.VAPID_PUBLIC_KEY ?? null,
});

export const subscriptionsForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const subs = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return subs.map((s) => ({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth }));
  },
});

/**
 * The userId-targeted notify — used by webhook/mutation/cron triggers that
 * resolved the user from data (no browser session). No-ops silently when VAPID
 * isn't configured or the user has no subscription.
 */
export const notifyUser = internalAction({
  args: { userId: v.id("users"), title: v.string(), body: v.string() },
  handler: async (ctx, { userId, title, body }): Promise<{ sent: number }> => {
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      return { sent: 0 };
    }
    const subs = await ctx.runQuery(internal.push.subscriptionsForUser, { userId });
    if (subs.length === 0) return { sent: 0 };
    return await ctx.runAction(api.pushSender.send, { subscriptions: subs, title, body });
  },
});

/** Session-based notify — used by UI actions (e.g. the Follow-ups page). */
export const notify = action({
  args: { title: v.string(), body: v.string() },
  handler: async (ctx, { title, body }): Promise<{ sent: number }> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return { sent: 0 };
    return await ctx.runAction(internal.push.notifyUser, { userId, title, body });
  },
});

/**
 * §12 daily scan — invoices newly overdue + project deadlines within 2 days.
 * Each candidate carries a marker instruction so the transition pings exactly
 * once (the marker timestamp is stored when the ping fires).
 */
export const dueNotifications = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const invoices = await ctx.db.query("invoices").collect();
    const projects = await ctx.db.query("projects").collect();

    const withOwners = invoices.map(async (inv) => {
      const project = await ctx.db.get(inv.projectId);
      const contact = project ? await ctx.db.get(project.contactId) : null;
      return { ...inv, owner: contact ? { userId: contact.userId } : null };
    });
    const projectsWithOwners = projects.map(async (p) => {
      const contact = await ctx.db.get(p.contactId);
      return { ...p, owner: contact ? { userId: contact.userId } : null };
    });

    return selectDueNotifications({
      now,
      invoices: await Promise.all(withOwners),
      projects: await Promise.all(projectsWithOwners),
    });
  },
});

/** Record that a §12 ping fired, so the daily cron doesn't re-ping. */
export const markNotified = internalMutation({
  args: { table: v.union(v.literal("invoices"), v.literal("projects")), id: v.string() },
  handler: async (ctx, { table, id }) => {
    const now = Date.now();
    if (table === "invoices") {
      await ctx.db.patch(id as GenericId<"invoices">, { overdueNotifiedAt: now });
    } else {
      await ctx.db.patch(id as GenericId<"projects">, { deadlineNotifiedAt: now });
    }
  },
});

/** Daily cron entry — notify each candidate, then mark it notified. */
export const runDueNotifications = internalAction({
  args: {},
  handler: async (ctx): Promise<{ candidates: number; sent: number }> => {
    const rows = await ctx.runQuery(internal.push.dueNotifications, {});
    let sent = 0;
    for (const row of rows) {
      if (row.userId) {
        const res = await ctx.runAction(internal.push.notifyUser, {
          userId: row.userId as GenericId<"users">,
          title: row.title,
          body: row.body,
        });
        sent += res.sent;
      }
      await ctx.runMutation(internal.push.markNotified, { table: row.mark.table, id: row.mark.id });
    }
    return { candidates: rows.length, sent };
  },
});

const crons = cronJobs();
crons.daily("push-due-and-overdue", { hourUTC: 9, minuteUTC: 0 }, internal.push.runDueNotifications);
export default crons;
