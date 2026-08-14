import { describe, expect, it } from "vitest";
import {
  buildFilterBlocks,
  evaluateSpoofingRisk,
  extractForwardingConfirmation,
  FILTER_CHAIN_MAX,
  forwardingAddress,
  ruleBasedTriage,
} from "../convex/gmailLogic";
import { decryptToken, encryptToken } from "../convex/tokenCrypto";

describe("§17 filter chain split", () => {
  it("groups addresses into blocks of at most FILTER_CHAIN_MAX", () => {
    const emails = Array.from({ length: 34 }, (_, i) => `client${i}@example.com`);
    const blocks = buildFilterBlocks(emails);
    expect(blocks.length).toBe(3); // 15 + 15 + 4
    expect(blocks[0].group).toBe(1);
    expect(blocks[1].group).toBe(2);
    expect(blocks[2].group).toBe(3);
    for (const b of blocks) {
      expect(b.filterText).toMatch(/^from:\(.*\)$/);
    }
  });

  it("produces a single block under the ceiling", () => {
    const emails = Array.from({ length: FILTER_CHAIN_MAX }, (_, i) => `c${i}@x.com`);
    expect(buildFilterBlocks(emails).length).toBe(1);
  });

  it("uses Gmail's uppercase OR syntax inside parentheses", () => {
    const [block] = buildFilterBlocks(["b@x.com", "a@x.com"]);
    expect(block.filterText).toBe("from:(a@x.com OR b@x.com)");
  });

  it("returns an empty list for no addresses", () => {
    expect(buildFilterBlocks([])).toEqual([]);
  });

  it("builds the per-contact forwarding address", () => {
    expect(forwardingAddress("abc123", "inbound.signalapp.com")).toBe(
      "client-abc123@inbound.signalapp.com"
    );
  });
});

describe("§17 forwarding-confirmation detection", () => {
  const googleConfirmation = {
    subject: "Gmail Forwarding Confirmation - Confirm forwarding address",
    from: "mail-noreply@google.com",
    body: "You have requested to forward mail from your Gmail account to:\nclient-xyz@inbound.signalapp.com\n\nTo confirm this request, click the confirmation code below:\n\n936152\n",
  };

  it("recognizes Google's confirmation email and extracts the code", () => {
    const result = extractForwardingConfirmation(googleConfirmation);
    expect(result.confirmed).toBe(true);
    expect(result.code).toBe("936152");
  });

  it("rejects non-confirmation mail even from Google", () => {
    expect(
      extractForwardingConfirmation({
        subject: "Your Gmail storage is almost full",
        from: "mail-noreply@google.com",
        body: "no code here 12345",
      }).confirmed
    ).toBe(false);
  });

  it("rejects a matching subject from a non-Google sender (spoofed)", () => {
    expect(
      extractForwardingConfirmation({
        subject: googleConfirmation.subject,
        from: "attacker@evil.com",
        body: googleConfirmation.body,
      }).confirmed
    ).toBe(false);
  });
});

describe("§17 inbound spoofing guard", () => {
  it("accepts when SPF and DKIM both pass", () => {
    const r = evaluateSpoofingRisk({ spf: "pass", dkim: "pass" });
    expect(r.spoofingSafe).toBe(true);
  });

  it("rejects when only one leg passes", () => {
    for (const input of [
      { spf: "pass", dkim: "neutral" },
      { spf: "neutral", dkim: "pass" },
      { spf: null, dkim: "pass" },
      { spf: "pass", dkim: null },
    ]) {
      const r = evaluateSpoofingRisk(input);
      expect(r.spoofingSafe).toBe(false);
      expect(r.reason).toContain("rejecting");
    }
  });

  it("rejects on explicit failure", () => {
    expect(evaluateSpoofingRisk({ spf: "fail", dkim: "pass" }).spoofingSafe).toBe(false);
    expect(evaluateSpoofingRisk({ spf: "pass", dkim: "fail" }).spoofingSafe).toBe(false);
  });

  it("rejects when nothing passes", () => {
    const r = evaluateSpoofingRisk({ spf: "none", dkim: "none", dmarc: "none" });
    expect(r.spoofingSafe).toBe(false);
  });
});

describe("§20.14 rule-based triage fallback", () => {
  it("flags obvious spam", () => {
    expect(
      ruleBasedTriage({
        from: "promo@spammer.com",
        subject: "You've won!",
        body: "Get rich quick, click here now! Limited time offer.",
      })
    ).toBe("spam");
  });

  it("flags important client mail", () => {
    expect(
      ruleBasedTriage({
        from: "client@acme.com",
        subject: "Invoice #12 is late",
        body: "Please review and approve.",
      })
    ).toBe("important");
  });

  it("returns ambiguous for everything else (LLM territory)", () => {
    expect(
      ruleBasedTriage({ from: "someone@somewhere.com", subject: "hi", body: "how are you" })
    ).toBe("ambiguous");
  });
});

describe("§20.9 token encryption (AES-256-GCM)", () => {
  const KEY = "test-encryption-key-1234";

  it("round-trips a token", async () => {
    const encrypted = await encryptToken("ya29.refresh-token-value", KEY);
    expect(encrypted).toMatch(/^v1\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/);
    expect(await decryptToken(encrypted, KEY)).toBe("ya29.refresh-token-value");
  });

  it("produces a different ciphertext each time (random IV)", async () => {
    const a = await encryptToken("same", KEY);
    const b = await encryptToken("same", KEY);
    expect(a).not.toBe(b);
    expect(await decryptToken(a, KEY)).toBe("same");
    expect(await decryptToken(b, KEY)).toBe("same");
  });

  it("refuses to decrypt with the wrong key (tamper detection)", async () => {
    const encrypted = await encryptToken("secret", KEY);
    await expect(decryptToken(encrypted, "wrong-key")).rejects.toThrow();
  });

  it("rejects a corrupted payload", async () => {
    const encrypted = await encryptToken("secret", KEY);
    const corrupted = encrypted.slice(0, -4) + "AAAA";
    await expect(decryptToken(corrupted, KEY)).rejects.toThrow();
  });

  it("throws when no key is configured", async () => {
    const old = process.env.GMAIL_TOKEN_ENCRYPTION_KEY;
    delete process.env.GMAIL_TOKEN_ENCRYPTION_KEY;
    await expect(encryptToken("x")).rejects.toThrow(/not configured/);
    if (old !== undefined) process.env.GMAIL_TOKEN_ENCRYPTION_KEY = old;
  });
});
