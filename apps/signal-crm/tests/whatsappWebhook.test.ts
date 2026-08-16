import { afterEach, describe, expect, it } from "vitest";
import { handleWhatsAppWebhook } from "../convex/whatsappWebhook";
import { recordWhatsAppMessageLogic } from "../convex/whatsappMutations";
import { extractWhatsAppMessage, normalizePhone, phonesMatch, verifyMetaSignature } from "../convex/whatsappLogic";

const SECRET = "meta-test-app-secret";

async function sign(body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return (
    "sha256=" +
    Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("")
  );
}

function payload(from: string, text: string, id = "wamid.ABC123") {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            value: {
              messages: [{ id, from, timestamp: "1786710000", type: "text", text: { body: text } }],
            },
          },
        ],
      },
    ],
  };
}

function makeCtx() {
  const calls: { name: string; args: any }[] = [];
  const ctx = {
    calls,
    ctx: {
      runMutation: async (ref: any, args: any) => {
        const name =
          args && "checkOnly" in args && "externalId" in args
            ? "markProcessed"
            : args && "from" in args && "body" in args
              ? "recordMessage"
              : "OTHER";
        calls.push({ name, args });
        if (name === "markProcessed") return { processed: false };
        return { written: true, messageId: "m1", matched: true, classification: "important" };
      },
    },
  };
  return ctx;
}

describe("§20.11 Meta signature verification", () => {
  it("rejects unsigned", async () => {
    expect(await verifyMetaSignature(SECRET, "body", null)).toBe(false);
    expect(await verifyMetaSignature(SECRET, "body", "sha256=abc")).toBe(false);
  });

  it("accepts a correct signature", async () => {
    const sig = await sign("hello");
    expect(await verifyMetaSignature(SECRET, "hello", sig)).toBe(true);
  });

  it("rejects a tampered body", async () => {
    const sig = await sign("hello");
    expect(await verifyMetaSignature(SECRET, "hell0", sig)).toBe(false);
  });
});

describe("§10 webhook handler", () => {
  afterEach(() => {
    delete process.env.WHATSAPP_APP_SECRET;
  });

  it("rejects unsigned payloads with zero mutations", async () => {
    process.env.WHATSAPP_APP_SECRET = SECRET;
    const { ctx, calls } = makeCtx();
    const res = await handleWhatsAppWebhook(
      ctx as any,
      new Request("http://127.0.0.1:3211/whatsapp/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload("15551234567", "hi")),
      })
    );
    expect(res.status).toBe(401);
    expect(calls.length).toBe(0);
  });

  it("rejects a wrong signature", async () => {
    process.env.WHATSAPP_APP_SECRET = SECRET;
    const { ctx, calls } = makeCtx();
    const body = JSON.stringify(payload("15551234567", "hi"));
    const res = await handleWhatsAppWebhook(
      ctx as any,
      new Request("http://127.0.0.1:3211/whatsapp/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-hub-signature-256": "sha256=" + "f".repeat(64) },
        body,
      })
    );
    expect(res.status).toBe(401);
    expect(calls.length).toBe(0);
  });

  it("processes a correctly signed message and routes it", async () => {
    process.env.WHATSAPP_APP_SECRET = SECRET;
    const { ctx, calls } = makeCtx();
    const body = JSON.stringify(payload("15551234567", "hi there"));
    const sig = await sign(body);
    const res = await handleWhatsAppWebhook(
      ctx as any,
      new Request("http://127.0.0.1:3211/whatsapp/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-hub-signature-256": sig },
        body,
      })
    );
    expect(res.status).toBe(200);
    expect(calls.some((c) => c.name === "recordMessage")).toBe(true);
    expect(calls.find((c) => c.name === "recordMessage")?.args.from).toBe("15551234567");
  });

  it("handles the GET verification handshake", async () => {
    process.env.WHATSAPP_VERIFY_TOKEN = "verify-token";
    const res = await handleWhatsAppWebhook(
      { runMutation: async () => ({}) } as any,
      new Request(
        "http://127.0.0.1:3211/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-token&hub.challenge=CHALLENGE"
      )
    );
    expect(await res.text()).toBe("CHALLENGE");
  });
});

describe("§10 message extraction + phone matching", () => {
  it("extracts a text message from the Meta payload shape", () => {
    const m = extractWhatsAppMessage(payload("15551234567", "hello"));
    expect(m?.id).toBe("wamid.ABC123");
    expect(m?.from).toBe("15551234567");
    expect(m?.text).toBe("hello");
  });

  it("ignores status updates (no message)", () => {
    expect(extractWhatsAppMessage({ entry: [{ changes: [{ value: { statuses: [] } }] }] })).toBeNull();
  });

  it("matches numbers with and without a country code", () => {
    expect(phonesMatch("+1 (555) 123-4567", "15551234567")).toBe(true);
    expect(phonesMatch("5551234567", "15551234567")).toBe(true);
    expect(phonesMatch("5551234567", "9999999999")).toBe(false);
    expect(phonesMatch("+44 20 7946 0958", "15551234567")).toBe(false); // different region
  });

  it("normalizes digits only", () => {
    expect(normalizePhone("+1 (555) 123-4567")).toBe("15551234567");
    expect(normalizePhone(" 0801-234-5678 ")).toBe("08012345678");
  });
});

describe("§10 recordWhatsAppMessageLogic — matched vs inbox", () => {
  function makeDb() {
    const docs: any[] = [];
    const builder = (rows: any[] = []) => ({
      withIndex: () => builder(rows),
      filter: () => builder(rows),
      first: async () => rows[0],
      collect: async () => rows,
    });
    return {
      docs,
      db: {
        // Convex's db.query is synchronous and returns a query builder.
        query: (table: string) => builder(table === "rateLimits" ? [] : []),
        insert: async (table: string, doc: any) => {
          const id = `${table}-${docs.length}`;
          docs.push({ table, ...doc, _id: id });
          return id;
        },
        get: async () => null,
      },
    } as any;
  }

  it("writes messages + timeline for a matched contact", async () => {
    const { db, docs } = makeDb();
    const contact = { _id: "c1", userId: "u1" };
    db.query = (table: string) => {
      const rows =
        table === "contactPhones"
          ? [{ _id: "p1", phoneNumber: "15551234567", contactId: "c1" }]
          : [];
      const builder = () => ({
        withIndex: () => builder(),
        filter: () => builder(),
        first: async () => rows[0],
        collect: async () => rows,
      });
      return builder();
    };
    db.get = async (id: string) => (id === "c1" ? contact : id === "u1" ? { _id: "u1", aiTriageEnabled: true } : null);
    const result = await recordWhatsAppMessageLogic({ db } as any, {
      from: "+1 (555) 123-4567",
      body: "hi",
      occurredAt: Date.now(),
      externalId: "wamid.1",
    });
    expect(result.matched).toBe(true);
    const tables = docs.map((d) => d.table);
    expect(tables).toContain("messages");
    expect(tables).toContain("timelineEvents");
    expect(tables).toContain("processedWebhookEvents");
  });

  it("writes to the inbox (contactId null) for an unmatched number", async () => {
    const { db, docs } = makeDb();
    db.get = async () => null;
    const result = await recordWhatsAppMessageLogic({ db } as any, {
      from: "9990001111",
      body: "who dis",
      occurredAt: Date.now(),
      externalId: "wamid.2",
    });
    expect(result.matched).toBe(false);
    const message = docs.find((d) => d.table === "messages");
    expect(message.contactId).toBeUndefined();
    expect(docs.some((d) => d.table === "timelineEvents")).toBe(false);
  });
});
