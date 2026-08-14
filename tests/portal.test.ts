import { describe, expect, it } from "vitest";
import {
  generateToken,
  hashToken,
  PORTAL_TOKEN_TTL_MS,
  redeemable,
} from "../convex/portalLogic";

describe("§20.7 magic-link tokens", () => {
  it("generates unique 64-char tokens", () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).toHaveLength(64);
    expect(a).not.toBe(b);
  });

  it("hashes deterministically", async () => {
    const h1 = await hashToken("abc");
    const h2 = await hashToken("abc");
    expect(h1).toBe(h2);
    expect(await hashToken("abd")).not.toBe(h1);
  });

  it("is redeemable only once — the §20.7 single-use rule", () => {
    const future = Date.now() + PORTAL_TOKEN_TTL_MS;
    const state1 = redeemable({ exists: true, expiresAt: future, now: Date.now() });
    expect(state1).toBe("ok");
    // Second redemption of the SAME token (usedAt set) → already_used, even
    // though it hasn't expired yet. This is the security-critical behavior.
    const state2 = redeemable({ exists: true, usedAt: Date.now(), expiresAt: future, now: Date.now() });
    expect(state2).toBe("already_used");
  });

  it("expires after 15 minutes", () => {
    const createdAt = 1000;
    const expiresAt = createdAt + PORTAL_TOKEN_TTL_MS;
    expect(redeemable({ exists: true, expiresAt, now: createdAt + PORTAL_TOKEN_TTL_MS })).toBe("ok");
    expect(redeemable({ exists: true, expiresAt, now: createdAt + PORTAL_TOKEN_TTL_MS + 1 })).toBe("expired");
  });

  it("rejects unknown tokens", () => {
    expect(redeemable({ exists: false, expiresAt: Date.now() + 1000, now: Date.now() })).toBe("not_found");
  });

  it("rejects a used AND expired token as already_used (used wins)", () => {
    expect(
      redeemable({ exists: true, usedAt: 1, expiresAt: 1, now: Date.now() })
    ).toBe("already_used");
  });
});
