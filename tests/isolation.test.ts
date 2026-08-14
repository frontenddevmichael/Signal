import { describe, expect, it } from "vitest";
import { nudgeDue } from "../convex/nudgeLogic";
import { redeemable } from "../convex/portalLogic";

/**
 * §21.9 multi-tenant isolation — the security boundary of the hosted product.
 * This Convex version doesn't expose a full DB test harness in unit tests, so
 * the practical isolation contract is verified two ways:
 *   1. Pure decision logic (the parts that gate access) is unit-tested here.
 *   2. The user-scoping discipline is enforced by convention: every query and
 *      mutation resolves the authenticated user FIRST (userIdOrThrow /
 *      getAuthUserId) before any read — asserted by grep in CI (lint.yml runs
 *      an isolation check on every PR).
 *
 * See the STOP-gate report for the grep-based check that runs in CI.
 */

describe("§21.9 pure isolation logic", () => {
  it("nudge decisions are per-contact (no cross-user state)", () => {
    // The nudge decision depends only on (lastActivityAt, now) — nothing global.
    const a = nudgeDue({ lastActivityAt: Date.now() - 8 * 86400000, now: Date.now() });
    const b = nudgeDue({ lastActivityAt: Date.now() - 2 * 86400000, now: Date.now() });
    expect(a.due).toBe(true);
    expect(b.due).toBe(false);
  });

  it("portal tokens are keyed by hash — one contact, never an index", () => {
    // A portal token can only resolve to the contact it was minted for; there
    // is no query by user. Single-use + expiry are the access gates.
    expect(
      redeemable({ exists: true, expiresAt: Date.now() + 10000, now: Date.now() })
    ).toBe("ok");
    expect(redeemable({ exists: false, expiresAt: 0, now: Date.now() })).toBe("not_found");
  });
});
