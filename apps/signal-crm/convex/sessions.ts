import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

/**
 * §18 sessions — the table backing §20.13 "sign out everywhere", populated from
 * day one so Phase 5's revocation has nothing to backfill.
 *
 * Called by the shell when auth state becomes authenticated and on window focus:
 * one row per device (keyed by a localStorage-generated deviceId), with
 * lastActiveAt touched on each app load. Revocation (revokedAt + sign-out
 * everywhere) is Phase 5 scope; this only keeps the table correct.
 */
export const recordSession = mutation({
  args: {
    deviceId: v.string(),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, { deviceId, userAgent }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");

    const existing = await ctx.db
      .query("sessions")
      .withIndex("by_user_device", (q) => q.eq("userId", userId).eq("deviceId", deviceId))
      .filter((q) => q.eq(q.field("revokedAt"), undefined))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { lastActiveAt: Date.now() });
      return;
    }

    await ctx.db.insert("sessions", {
      userId,
      deviceId,
      userAgent,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
    });
  },
});

/** §20.13 — the devices this user is signed in on (for the settings list). */
export const mySessions = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const rows = await ctx.db
      .query("sessions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("revokedAt"), undefined))
      .collect();
    return rows.map((r) => ({
      deviceId: r.deviceId ?? "unknown",
      lastActiveAt: r.lastActiveAt,
      userAgent: r.userAgent ?? null,
    }));
  },
});

/**
 * §20.13 "sign out everywhere" — revokes every session EXCEPT the current
 * device's. The Convex Auth session cookie itself is cleared client-side; the
 * sessions table is the source of truth for which device tokens still work.
 */
export const signOutEverywhere = mutation({
  args: { currentDeviceId: v.string() },
  handler: async (ctx, { currentDeviceId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    const rows = await ctx.db
      .query("sessions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("revokedAt"), undefined))
      .collect();
    const now = Date.now();
    let revoked = 0;
    for (const r of rows) {
      if (r.deviceId === currentDeviceId) continue;
      await ctx.db.patch(r._id, { revokedAt: now });
      revoked++;
    }
    return { revoked };
  },
});
