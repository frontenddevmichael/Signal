/**
 * §20.12 scoped API keys — free-from-day-one API access (§4/§19) with a real
 * auth mechanism. Keys are shown once at creation, hashed at rest (SHA-256,
 * never plaintext), revocable, and rate-limited per key (§21.10).
 *
 * Key format: "sk_signal_<random>" — the API client sends `Authorization:
 * Bearer sk_signal_...` to public queries/mutations marked with requireApiKey.
 */
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { writeAuditLog } from "./audit";

export async function hashApiKey(key: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function generateApiKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const rand = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `sk_signal_${rand}`;
}

/** List my keys (never the raw key — only label + last used + created). */
export const myKeys = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const rows = await ctx.db
      .query("apiKeys")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("revokedAt"), undefined))
      .collect();
    return rows.map((r) => ({
      _id: r._id,
      label: r.label,
      lastUsedAt: r.lastUsedAt ?? null,
      createdAt: r.createdAt,
    }));
  },
});

/** Create a key. Returns the RAW key exactly once — it is not retrievable again. */
export const createKey = mutation({
  args: { label: v.string() },
  handler: async (ctx, { label }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    const key = generateApiKey();
    const keyHash = await hashApiKey(key);
    const keyId = await ctx.db.insert("apiKeys", {
      userId,
      keyHash,
      label: label.trim() || "API key",
      createdAt: Date.now(),
    });
    await writeAuditLog(ctx, {
      userId,
      action: "api_key.created",
      entityType: "api_key",
      entityId: keyId,
      metadata: { label },
    });
    return { key, keyId };
  },
});

export const revokeKey = mutation({
  args: { keyId: v.id("apiKeys") },
  handler: async (ctx, { keyId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    const key = await ctx.db.get(keyId);
    if (!key || key.userId !== userId) throw new Error("Not found");
    await ctx.db.patch(keyId, { revokedAt: Date.now() });
    await writeAuditLog(ctx, {
      userId,
      action: "api_key.revoked",
      entityType: "api_key",
      entityId: keyId,
      metadata: { label: key.label },
    });
  },
});

/** Rate-limit check for key-authenticated calls (§21.10, keyed by api_key_id). */
export const consumeKeyRateLimit = mutation({
  args: { keyId: v.id("apiKeys"), actionType: v.string() },
  handler: async (ctx, { keyId, actionType }) => {
    const now = Date.now();
    // Hourly window BUCKETED to the top of the hour (§21.10 audit fix) — the
    // old `now - 1h` exact-match lookup never hit the same row twice, so the
    // cap silently never engaged.
    const windowStart = Math.floor(now / (60 * 60 * 1000)) * (60 * 60 * 1000);
    const row = await ctx.db
      .query("rateLimits")
      .withIndex("by_key_action_window", (q) =>
        q.eq("key", `apikey:${keyId}`).eq("actionType", actionType).eq("windowStart", windowStart)
      )
      .first();
    const count = row?.attemptCount ?? 0;
    if (count >= 100) return { allowed: false };
    if (row) await ctx.db.patch(row._id, { attemptCount: count + 1 });
    else
      await ctx.db.insert("rateLimits", {
        key: `apikey:${keyId}`,
        actionType,
        windowStart,
        attemptCount: 1,
      });
    await ctx.db.patch(keyId, { lastUsedAt: now });
    return { allowed: true, remaining: 100 - count - 1 };
  },
});
