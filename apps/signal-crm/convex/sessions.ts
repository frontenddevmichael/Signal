import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { getAuthSessionId, getAuthUserId } from "@convex-dev/auth/server";

/**
 * §18 sessions — the table backing §20.13 "sign out everywhere". Each device
 * row tracks the REAL Convex Auth session it signed in with (authSessionId),
 * so revocation actually invalidates the auth session — not a decorative flag.
 *
 * Called by the shell when auth state becomes authenticated and on window focus:
 * one row per device (keyed by a localStorage-generated deviceId), with
 * lastActiveAt touched on each app load.
 */

/** Invalidate a set of real auth sessions via the Convex Auth store mutation. */
async function invalidateAuthSessions(
  ctx: any,
  userId: any,
  except: any[] | undefined,
): Promise<void> {
  try {
    await ctx.runMutation(internal.auth.store, {
      type: "invalidateSessions",
      userId,
      ...(except && except.length > 0 ? { except } : {}),
    });
  } catch (err) {
    // §20.13 audit fix — never leave the device table and the auth sessions out
    // of sync silently: rethrow so the caller knows revocation didn't happen.
    throw err;
  }
}

export const recordSession = mutation({
  args: {
    deviceId: v.string(),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, { deviceId, userAgent }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    const authSessionId = await getAuthSessionId(ctx);

    const existing = await ctx.db
      .query("sessions")
      .withIndex("by_user_device", (q) => q.eq("userId", userId).eq("deviceId", deviceId))
      .filter((q) => q.eq(q.field("revokedAt"), undefined))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        lastActiveAt: Date.now(),
        ...(authSessionId ? { authSessionId } : {}),
      });
      return;
    }

    await ctx.db.insert("sessions", {
      userId,
      deviceId,
      userAgent,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      ...(authSessionId ? { authSessionId } : {}),
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

/** §20.13 — revoke a single device (a lost laptop, a shared kiosk). */
export const revokeSession = mutation({
  args: { deviceId: v.string() },
  handler: async (ctx, { deviceId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    const row = await ctx.db
      .query("sessions")
      .withIndex("by_user_device", (q) => q.eq("userId", userId).eq("deviceId", deviceId))
      .filter((q) => q.eq(q.field("revokedAt"), undefined))
      .first();
    if (!row) return { revoked: 0 };
    await ctx.db.patch(row._id, { revokedAt: Date.now() });
    // Invalidate the REAL auth session this device was using. Deleting all the
    // user's sessions except the CURRENT one and the one we just revoked would
    // also kill this device's own session; instead invalidate only the target.
    if (row.authSessionId) {
      const all = await ctx.db
        .query("authSessions")
        .withIndex("userId", (q) => q.eq("userId", userId))
        .collect();
      const except = all.filter((s) => s._id !== row.authSessionId).map((s) => s._id);
      await invalidateAuthSessions(ctx, userId, except);
    }
    return { revoked: 1 };
  },
});

/**
 * §20.13 "sign out everywhere" — revokes every session EXCEPT the current
 * device's. The Convex Auth session cookie is cleared client-side; here the
 * REAL auth sessions are invalidated so a stolen session actually dies.
 */
export const signOutEverywhere = mutation({
  args: { currentDeviceId: v.string() },
  handler: async (ctx, { currentDeviceId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    const currentAuthSessionId = await getAuthSessionId(ctx);

    const rows = await ctx.db
      .query("sessions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("revokedAt"), undefined))
      .collect();
    const now = Date.now();
    let revoked = 0;
    const keep = new Set<string>();
    for (const r of rows) {
      if (r.deviceId === currentDeviceId) {
        if (r.authSessionId) keep.add(r.authSessionId);
        continue;
      }
      await ctx.db.patch(r._id, { revokedAt: now });
      revoked++;
    }
    if (currentAuthSessionId) keep.add(currentAuthSessionId);
    // Invalidate every real session EXCEPT the current device's — a stolen
    // session elsewhere stops working immediately.
    await invalidateAuthSessions(ctx, userId, [...keep]);
    return { revoked };
  },
});
