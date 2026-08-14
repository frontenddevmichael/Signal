/**
 * §20.7 client portal magic-link PURE logic — the single-use rule is the
 * security-critical piece (a leaked link in an old email must be dead after
 * first use, not just time-expired). All pure; the DB write is in portal.ts.
 */

/** §20.7 — 15 minutes, per spec. */
export const PORTAL_TOKEN_TTL_MS = 15 * 60 * 1000;

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Redemption state machine. A token is valid ONLY when:
 *   - it exists,
 *   - not used before (usedAt undefined — SINGLE-USE),
 *   - not expired (now <= expiresAt).
 * Returns the new state; the caller writes it.
 */
export function redeemable(args: {
  exists: boolean;
  usedAt?: number;
  expiresAt: number;
  now: number;
}): "ok" | "already_used" | "expired" | "not_found" {
  if (!args.exists) return "not_found";
  if (args.usedAt !== undefined) return "already_used";
  if (args.now > args.expiresAt) return "expired";
  return "ok";
}

/** Portal-facing URL (the public route, no auth). */
export function portalUrl(token: string): string {
  const base = process.env.APP_URL ?? "http://localhost:5173";
  return `${base}/portal?token=${token}`;
}
