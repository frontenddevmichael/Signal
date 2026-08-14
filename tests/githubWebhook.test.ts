import { describe, expect, it } from "vitest";
import { handleGithubWebhook } from "../convex/githubWebhook";

/**
 * §20.11 STOP-CONDITION test: the webhook handler must reject unsigned /
 * invalid-signature payloads BEFORE touching the database — no repo_activity,
 * no processed_webhook_events, nothing. The httpAction is a plain
 * (ctx, request) function, so we drive the REAL handler with a stub
 * runMutation that fails the test if any mutation is attempted on an
 * unauthenticated request.
 */
async function hmac(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const BODY = JSON.stringify({
  action: "closed",
  pull_request: { merged: true, title: "Fix", number: 1, merged_at: "2026-01-02T00:00:00Z", html_url: "https://github.com/o/r/pull/1" },
  repository: { id: 101, full_name: "o/r" },
});

const SECRET = "test-secret";

process.env.GITHUB_WEBHOOK_SECRET = SECRET;

function stubCtx(calls: unknown[]) {
  return {
    runMutation: async (ref: unknown, _args: any) => {
      // FunctionReference objects have a __type field ("mutation") but their
      // other getters throw on access outside Convex — so track the ref itself.
      calls.push(ref);
      return { processed: false, linked: 0 };
    },
  };
}

function req(body: string, sig: string | null, delivery = "d-1"): Request {
  const headers: Record<string, string> = {
    "x-github-delivery": delivery,
    "x-github-event": "pull_request",
  };
  if (sig) headers["x-hub-signature-256"] = sig;
  return new Request("http://localhost/github/webhook", { method: "POST", headers, body });
}

describe("handleGithubWebhook (§20.11 — reject before any write)", () => {
  it("REJECTS a request with no signature — zero DB mutations attempted", async () => {
    const calls: string[] = [];
    const res = await handleGithubWebhook(stubCtx(calls) as any, req(BODY, null));
    expect(res.status).toBe(401);
    expect(calls).toEqual([]); // nothing touched the database
  });

  it("REJECTS a request with a wrong signature — zero DB mutations attempted", async () => {
    const calls: string[] = [];
    const wrong = `sha256=${await hmac("different-secret", BODY)}`;
    const res = await handleGithubWebhook(stubCtx(calls) as any, req(BODY, wrong));
    expect(res.status).toBe(401);
    expect(calls).toEqual([]);
  });

  it("REJECTS a valid signature on tampered content — zero DB mutations", async () => {
    const calls: string[] = [];
    const sig = `sha256=${await hmac(SECRET, BODY)}`;
    const tampered = BODY.replace("Fix", "Evil");
    const res = await handleGithubWebhook(stubCtx(calls) as any, req(tampered, sig));
    expect(res.status).toBe(401);
    expect(calls).toEqual([]);
  });

  it("ACCEPTS a correctly-signed merged-PR payload and records activity", async () => {
    const calls: unknown[] = [];
    const sig = `sha256=${await hmac(SECRET, BODY)}`;
    const res = await handleGithubWebhook(stubCtx(calls) as any, req(BODY, sig));
    expect(res.status).toBe(200);
    // Sequence: idempotency pre-check (githubMarkProcessed), then the record
    // mutation (githubRecordActivity) — both go through runMutation.
    expect(calls.length).toBe(2);
  });
});
