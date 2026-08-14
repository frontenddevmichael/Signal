import { describe, expect, it } from "vitest";
import {
  verifyGithubSignature,
  billableDefaultForLinks,
  isDeliveryAlreadyProcessed,
  extractActivity,
  splitFullName,
} from "../convex/githubLogic";

/** Compute the sha256= header the way GitHub does, for building test payloads. */
async function hmac(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

describe("verifyGithubSignature (§20.11 — authenticity first)", () => {
  it("accepts a correctly-signed body", async () => {
    const secret = "test-webhook-secret";
    const body = '{"action":"closed"}';
    const sig = `sha256=${await hmac(secret, body)}`;
    expect(await verifyGithubSignature(secret, body, sig)).toBe(true);
  });

  it("rejects a body signed with the wrong secret", async () => {
    const body = '{"action":"closed"}';
    const sig = `sha256=${await hmac("wrong-secret", body)}`;
    expect(await verifyGithubSignature("right-secret", body, sig)).toBe(false);
  });

  it("rejects a tampered body (valid signature for different content)", async () => {
    const secret = "s";
    const sig = `sha256=${await hmac(secret, '{"action":"closed"}')}`;
    expect(await verifyGithubSignature(secret, '{"action":"deleted"}', sig)).toBe(false);
  });

  it("rejects a missing header", async () => {
    expect(await verifyGithubSignature("s", "{}", null)).toBe(false);
    expect(await verifyGithubSignature("s", "{}", undefined)).toBe(false);
  });

  it("rejects a malformed header and a wrong-length digest", async () => {
    expect(await verifyGithubSignature("s", "{}", "not-a-signature")).toBe(false);
    expect(await verifyGithubSignature("s", "{}", "sha256=abc")).toBe(false);
  });
});

describe("billableDefaultForLinks (§9 — the flipped default)", () => {
  it("exactly one active link → billable true (the common case)", () => {
    expect(billableDefaultForLinks(1)).toBe(true);
  });

  it("more than one active link → billable false (multi-client case is opt-in)", () => {
    expect(billableDefaultForLinks(2)).toBe(false);
    expect(billableDefaultForLinks(3)).toBe(false);
  });

  it("zero links → false (nothing to bill against)", () => {
    expect(billableDefaultForLinks(0)).toBe(false);
  });
});

describe("isDeliveryAlreadyProcessed (§20.11 — idempotency)", () => {
  it("true when the delivery id was seen", () => {
    expect(isDeliveryAlreadyProcessed(["abc", "def"], "abc")).toBe(true);
  });
  it("false for a fresh delivery", () => {
    expect(isDeliveryAlreadyProcessed(["abc"], "xyz")).toBe(false);
  });
});

describe("extractActivity (payload → repo_activity mapping)", () => {
  it("records a merged PR", () => {
    const out = extractActivity({
      action: "closed",
      pull_request: { merged: true, title: "Fix billing", number: 42, merged_at: "2026-01-02T03:04:05Z", html_url: "https://github.com/o/r/pull/42" },
      repository: { id: 1, full_name: "o/r" },
    });
    expect(out).toEqual({
      type: "pr_merged",
      title: "Fix billing",
      url: "https://github.com/o/r/pull/42",
      occurredAt: Date.parse("2026-01-02T03:04:05Z"),
    });
  });

  it("ignores a closed-but-unmerged PR (no repo_activity row)", () => {
    expect(extractActivity({ action: "closed", pull_request: { merged: false } })).toBeNull();
  });

  it("records a closed issue", () => {
    const out = extractActivity({
      action: "closed",
      issue: { number: 7, title: "Bug: dark mode", closed_at: "2026-01-03T00:00:00Z", html_url: "https://github.com/o/r/issues/7" },
      repository: { id: 2, full_name: "o/r" },
    });
    expect(out?.type).toBe("issue_closed");
    expect(out?.title).toBe("Bug: dark mode");
  });

  it("ignores an issue that was merely opened", () => {
    expect(extractActivity({ action: "opened", issue: { number: 7 } })).toBeNull();
  });

  it("records a successful deploy and ignores failed ones", () => {
    const ok = extractActivity({
      deployment_status: { state: "success", created_at: "2026-01-04T00:00:00Z", target_url: "https://deploy.example" },
      deployment: { environment: "production" },
      repository: { id: 3, full_name: "o/r" },
    });
    expect(ok?.type).toBe("deploy");
    expect(ok?.title).toBe("production deploy succeeded");
    expect(extractActivity({ deployment_status: { state: "failure" } })).toBeNull();
  });

  it("ignores pushes entirely (not a repo_activity type in §18)", () => {
    expect(extractActivity({ action: "pushed", repository: { id: 4 } })).toBeNull();
  });
});

describe("splitFullName", () => {
  it("splits owner/repo", () => {
    expect(splitFullName("acme/app")).toEqual({ owner: "acme", name: "app" });
  });
});
