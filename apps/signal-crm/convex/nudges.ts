/**
 * §3 follow-up reminders — the Follow-ups page, driven by the pure
 * nudgeLogic. A scheduled job recomputes reminders; the page lists pending
 * ones with the §22.6 beacon motif. Marking done/dismissed is per contact.
 */
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { GenericId } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { nudgeDue, nudgeReason } from "./nudgeLogic";

async function userIdOrThrow(ctx: QueryCtx | MutationCtx): Promise<GenericId<"users">> {
  const userId = await getAuthUserId(ctx as any);
  if (userId === null) throw new Error("Not signed in");
  return userId;
}

async function ownedContact(ctx: MutationCtx, userId: GenericId<"users">, contactId: string) {
  const contact = await ctx.db.get(contactId as GenericId<"contacts">);
  if (!contact || contact.userId !== userId) return null;
  return contact;
}

/** All contacts with their latest timeline activity, for nudge computation. */
export const pendingNudges = query({
  args: {},
  handler: async (ctx) => {
    const userId = await userIdOrThrow(ctx);
    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const out: {
      contactId: string;
      name: string;
      days: number;
      reason: string;
      status: string;
    }[] = [];
    for (const c of contacts) {
      const events = await ctx.db
        .query("timelineEvents")
        .withIndex("by_contact", (q) => q.eq("contactId", c._id))
        // Future-dated events (scheduled meetings) are not activity — they
        // must not suppress a follow-up nudge.
        .filter((q) => q.lte(q.field("occurredAt"), Date.now()))
        .order("desc")
        .take(1);
      const last = events[0]?.occurredAt ?? null;
      const { due, days } = nudgeDue({ lastActivityAt: last, now: Date.now() });
      if (!due) continue;
      const reminder = await ctx.db
        .query("followUpReminders")
        .withIndex("by_contact", (q) => q.eq("contactId", c._id))
        .filter((q) => q.eq(q.field("status"), "pending"))
        .first();
      out.push({
        contactId: c._id,
        name: c.name,
        days: days ?? 0,
        reason: reminder?.reason ?? nudgeReason(days ?? 0),
        status: reminder?.status ?? "pending",
      });
    }
    return out.sort((a, b) => b.days - a.days);
  },
});

export const markDone = mutation({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, { contactId }) => {
    const userId = await userIdOrThrow(ctx);
    if (!(await ownedContact(ctx, userId, contactId))) throw new Error("Not found");
    await upsertReminder(ctx, contactId, "done");
  },
});

export const dismiss = mutation({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, { contactId }) => {
    const userId = await userIdOrThrow(ctx);
    if (!(await ownedContact(ctx, userId, contactId))) throw new Error("Not found");
    await upsertReminder(ctx, contactId, "dismissed");
  },
});

async function upsertReminder(ctx: MutationCtx, contactId: string, status: "done" | "dismissed") {
  const existing = await ctx.db
    .query("followUpReminders")
    .withIndex("by_contact", (q) => q.eq("contactId", contactId as any))
    .filter((q) => q.eq(q.field("status"), "pending"))
    .first();
  const now = Date.now();
  if (existing) {
    await ctx.db.patch(existing._id, { status, dueAt: now });
  } else {
    await ctx.db.insert("followUpReminders", {
      contactId: contactId as any,
      dueAt: now,
      reason: "Manually resolved",
      status,
    });
  }
}
