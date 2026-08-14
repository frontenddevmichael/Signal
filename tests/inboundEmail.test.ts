import { afterEach, describe, expect, it } from "vitest";
import { handleInboundEmail } from "../convex/inboundEmail";
import { recordInboundLogic } from "../convex/inboundMutations";

/**
 * These tests drive the REAL handler (handleInboundEmail) with a stubbed
 * mutation runner — the same pattern as the GitHub webhook tests. Env gates
 * are set per-test so the real signature/guard code paths run.
 */

const POSTMARK_SECRET = "postmark-test-secret";

async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// The api refs are opaque proxies in this Convex version — identify the target
// mutation by its args shape instead of ref identity.
function identify(args: any): string | null {
  if (args && typeof args === "object" && "checkOnly" in args && "externalId" in args) {
    return "markProcessed";
  }
  if (args && typeof args === "object" && "reason" in args) return "logRejected";
  if (args && typeof args === "object" && "code" in args) return "markForwardingConfirmed";
  if (args && typeof args === "object" && "from" in args && "subject" in args && "body" in args) {
    return "recordInbound";
  }
  return null;
}

function makeCtx(overrides: Record<string, any> = {}) {
  const calls: { name: string | null; args: any }[] = [];
  const ctx = {
    calls,
    ctx: {
      runMutation: async (ref: any, args: any) => {
        const name = identify(args);
        calls.push({ name, args });
        if (name === "markProcessed") {
          return overrides.markProcessed ? overrides.markProcessed(args) : { processed: false };
        }
        if (name === "logRejected") {
          return overrides.logRejected ? overrides.logRejected(args) : {};
        }
        if (name === "markForwardingConfirmed") {
          return overrides.markForwardingConfirmed ? overrides.markForwardingConfirmed(args) : {};
        }
        if (name === "recordInbound") {
          return overrides.recordInbound ? overrides.recordInbound(args) : {};
        }
        return {};
      },
    },
  };
  return ctx;
}

function postmarkPayload(over: Record<string, any> = {}) {
  return {
    MessageID: "postmark-message-1",
    From: "client@acme.com",
    To: "client-ct123@inbound.signalapp.com",
    Subject: "Re: website",
    TextBody: "Hey, looks good.",
    Headers: [
      { Name: "Received-SPF", Value: "pass (google.com: domain of acme.com designates 1.2.3.4 as permitted sender)" },
      { Name: "Authentication-Results", Value: "mx.google.com; dkim=pass header.i=@acme.com; dmarc=pass" },
      { Name: "DKIM-Signature", Value: "v=1; a=rsa-sha256; d=acme.com; s=google; bh=abc;" },
    ],
    ...over,
  };
}

async function signedPostmarkRequest(payload: object): Promise<Request> {
  const body = JSON.stringify(payload);
  const sig = await hmacHex(POSTMARK_SECRET, body);
  return new Request("http://127.0.0.1:3211/inbound/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-postmark-signature": sig },
    body,
  });
}

describe("§17 inbound handler — Postmark signature gate", () => {
  afterEach(() => {
    delete process.env.MAILGUN_API_KEY;
    delete process.env.POSTMARK_WEBHOOK_SECRET;
  });

  it("rejects an unsigned payload before anything runs", async () => {
    process.env.POSTMARK_WEBHOOK_SECRET = POSTMARK_SECRET;
    const { ctx, calls } = makeCtx();
    const req = new Request("http://127.0.0.1:3211/inbound/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(postmarkPayload()),
    });
    const res = await handleInboundEmail(ctx, req);
    expect(res.status).toBe(401);
    expect(calls.length).toBe(0); // zero DB mutations attempted
  });

  it("rejects a wrong signature", async () => {
    process.env.POSTMARK_WEBHOOK_SECRET = POSTMARK_SECRET;
    const { ctx, calls } = makeCtx();
    const body = JSON.stringify(postmarkPayload());
    const req = new Request("http://127.0.0.1:3211/inbound/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-postmark-signature": "f".repeat(64),
      },
      body,
    });
    const res = await handleInboundEmail(ctx, req);
    expect(res.status).toBe(401);
    expect(calls.length).toBe(0);
  });

  it("acknowledges a valid signature", async () => {
    process.env.POSTMARK_WEBHOOK_SECRET = POSTMARK_SECRET;
    const { ctx } = makeCtx({
      markProcessed: () => ({ processed: false }),
      recordInbound: () => ({ written: true, messageId: "m1", classification: "important" }),
    });
    const req = await signedPostmarkRequest(postmarkPayload());
    const res = await handleInboundEmail(ctx, req);
    expect(res.status).toBe(200);
  });
});

describe("§17 spoofing guard (the STOP-condition proof)", () => {
  afterEach(() => {
    delete process.env.POSTMARK_WEBHOOK_SECRET;
  });

  it("rejects a forged message — DKIM absent, only SPF present → logRejected, nothing written", async () => {
    process.env.POSTMARK_WEBHOOK_SECRET = POSTMARK_SECRET;
    let rejected = 0;
    const { ctx, calls } = makeCtx({
      markProcessed: () => ({ processed: false }),
      logRejected: () => {
        rejected++;
        return {};
      },
    });
    const forged = postmarkPayload({
      Headers: [
        { Name: "Received-SPF", Value: "pass (google.com: domain of acme.com designates 1.2.3.4)" },
      ],
    });
    const req = await signedPostmarkRequest(forged);
    const res = await handleInboundEmail(ctx, req);
    expect(res.status).toBe(200); // benign ack — no retry storm
    expect(rejected).toBe(1);
    const wroteMessage = calls.some((c) => c.name === "recordInbound");
    expect(wroteMessage).toBe(false);
  });

  it("rejects a forged message — no auth headers at all", async () => {
    process.env.POSTMARK_WEBHOOK_SECRET = POSTMARK_SECRET;
    let rejected = 0;
    const { ctx } = makeCtx({
      markProcessed: () => ({ processed: false }),
      logRejected: () => {
        rejected++;
        return {};
      },
    });
    const forged = postmarkPayload({ Headers: [] });
    const req = await signedPostmarkRequest(forged);
    const res = await handleInboundEmail(ctx, req);
    expect(res.status).toBe(200);
    expect(rejected).toBe(1);
  });

  it("accepts a properly authenticated forwarded message and routes it to the contact", async () => {
    process.env.POSTMARK_WEBHOOK_SECRET = POSTMARK_SECRET;
    let recorded: any = null;
    const { ctx } = makeCtx({
      markProcessed: () => ({ processed: false }),
      recordInbound: (args: any) => {
        recorded = args;
        return { written: true, messageId: "m1", classification: "important" };
      },
    });
    const req = await signedPostmarkRequest(postmarkPayload());
    const res = await handleInboundEmail(ctx, req);
    expect(res.status).toBe(200);
    expect(recorded).not.toBeNull();
    expect(recorded.contactId).toBe("ct123");
    expect(recorded.from).toBe("client@acme.com");
  });
});

describe("§17 forwarding confirmation routing", () => {
  afterEach(() => {
    delete process.env.POSTMARK_WEBHOOK_SECRET;
  });

  it("detects Google's confirmation email and stores the code on the contact", async () => {
    process.env.POSTMARK_WEBHOOK_SECRET = POSTMARK_SECRET;
    let confirmed: any = null;
    const { ctx } = makeCtx({
      markProcessed: () => ({ processed: false }),
      markForwardingConfirmed: (args: any) => {
        confirmed = args;
        return {};
      },
    });
    const confirmationMail = postmarkPayload({
      From: "mail-noreply@google.com",
      Subject: "Gmail Forwarding Confirmation - Confirm forwarding address",
      TextBody: "To confirm this request, click the confirmation code below:\n\n936152\n",
    });
    const req = await signedPostmarkRequest(confirmationMail);
    const res = await handleInboundEmail(ctx, req);
    expect(res.status).toBe(200);
    expect(confirmed).not.toBeNull();
    expect(confirmed.contactId).toBe("ct123");
    expect(confirmed.code).toBe("936152");
  });
});

describe("§17 recordInbound — the single write path", () => {
  it("writes messages + timeline in one transaction and marks the event processed", async () => {
    const db = {
      docs: new Map<string, any>(),
      next: 1,
      get: async (id: string) => (id === "contact-1" ? { _id: id, userId: "user-1" } : undefined),
      insert: async (table: string, doc: any) => {
        const id = `${table}-${db.next++}`;
        db.docs.set(id, { ...doc, _id: id });
        return id;
      },
      query: () => ({
        withIndex: () => ({ eq: () => ({ first: async () => undefined }), collect: async () => [] }),
      }),
    };
    const ctx = {
      db: db as any,
      auth: { getUserIdentity: async () => null },
    } as any;
    const result = await recordInboundLogic(ctx as any, {
      contactId: "contact-1",
      from: "client@acme.com",
      subject: "Re: website",
      body: "Looks good.",
      externalId: "postmark-msg-9",
      provider: "postmark",
    });
    expect(result.written).toBe(true);
    const tables = [...db.docs.values()].map((d) => d._id.split("-")[0]);
    expect(tables).toContain("messages");
    expect(tables).toContain("timelineEvents");
    expect(tables).toContain("processedWebhookEvents");
  });
});
