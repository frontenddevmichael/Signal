import { describe, expect, it } from "vitest";
import { handlePaymentWebhook } from "../convex/paymentWebhook";
import { verifyStripeSignature, verifyPaystackSignature, parseStripeEvent, parsePaystackEvent } from "../convex/paymentLogic";
import { applyPaymentCore } from "../convex/invoices";

const STRIPE_SECRET = "whsec_test";
const PAYSTACK_SECRET = "sk_test_123";

async function hmac(secret: string, data: string, algo: "SHA-256" | "SHA-512"): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: algo }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

describe("verifyStripeSignature (§21.4 — authenticity first)", () => {
  it("accepts a valid signature", async () => {
    const body = '{"type":"checkout.session.completed"}';
    const v1 = await hmac(STRIPE_SECRET, `1621000000.${body}`, "SHA-256");
    const header = `t=1621000000,v1=${v1}`;
    expect(await verifyStripeSignature(STRIPE_SECRET, body, header)).toBe(true);
  });

  it("rejects a wrong secret, missing header, and tampered body", async () => {
    const body = '{"type":"checkout.session.completed"}';
    const v1 = await hmac("wrong", `1621000000.${body}`, "SHA-256");
    expect(await verifyStripeSignature(STRIPE_SECRET, body, `t=1621000000,v1=${v1}`)).toBe(false);
    expect(await verifyStripeSignature(STRIPE_SECRET, body, null)).toBe(false);
    const good = await hmac(STRIPE_SECRET, `1621000000.${body}`, "SHA-256");
    expect(await verifyStripeSignature(STRIPE_SECRET, body.replace("completed", "expired"), `t=1621000000,v1=${good}`)).toBe(false);
  });
});

describe("verifyPaystackSignature", () => {
  it("accepts a valid signature and rejects a wrong one", async () => {
    const body = '{"event":"charge.success"}';
    const good = await hmac(PAYSTACK_SECRET, body, "SHA-512");
    expect(await verifyPaystackSignature(PAYSTACK_SECRET, body, good)).toBe(true);
    const bad = await hmac("wrong", body, "SHA-512");
    expect(await verifyPaystackSignature(PAYSTACK_SECRET, body, bad)).toBe(false);
    expect(await verifyPaystackSignature(PAYSTACK_SECRET, body, null)).toBe(false);
  });
});

describe("parseStripeEvent / parsePaystackEvent (payload mapping)", () => {
  it("extracts session id, amount, and metadata.invoice_id from checkout.session.completed", () => {
    const ev = parseStripeEvent({
      type: "checkout.session.completed",
      data: { object: { id: "cs_123", amount_total: 5000, payment_status: "paid", metadata: { invoice_id: "inv-1" } } },
    });
    expect(ev).toEqual({ externalId: "cs_123", amount: 5000n, invoiceId: "inv-1" });
  });

  it("ignores non-payment events", () => {
    expect(parseStripeEvent({ type: "invoice.created", data: { object: {} } })).toBeNull();
  });

  it("extracts reference, amount, and custom_fields.invoice_id from charge.success", () => {
    const ev = parsePaystackEvent({
      event: "charge.success",
      data: { reference: "ref-9", amount: 75000, custom_fields: [{ display_name: "invoice_id", value: "inv-2" }] },
    });
    expect(ev).toEqual({ externalId: "ref-9", amount: 75000n, invoiceId: "inv-2" });
  });

  it("ignores non-charge.success events", () => {
    expect(parsePaystackEvent({ event: "transfer.success", data: {} })).toBeNull();
  });
});

describe("payment webhook httpAction (§21.4 — reject before any write)", () => {
  it("rejects an unsigned Stripe request with zero DB mutations", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = STRIPE_SECRET;
    const calls: unknown[] = [];
    const ctx = { runMutation: async (ref: unknown) => { calls.push(ref); return { applied: true }; } };
    const body = '{"type":"checkout.session.completed","data":{"object":{"id":"cs_x"}}}';
    const req = new Request("http://localhost/payments/webhook", { method: "POST", headers: { "stripe-signature": "t=1,v1=bad" }, body });
    const res = await handlePaymentWebhook(ctx as any, req);
    expect(res.status).toBe(401);
    expect(calls).toEqual([]);
  });

  it("processes a validly-signed payment through the shared applyPayment path", async () => {
    const body = JSON.stringify({
      type: "checkout.session.completed",
      data: { object: { id: "cs_ok", amount_total: 5000, payment_status: "paid", metadata: { invoice_id: "inv-1" } } },
    });
    const v1 = await hmac(STRIPE_SECRET, `1621000000.${body}`, "SHA-256");
    const calls: unknown[] = [];
    const ctx = { runMutation: async (ref: unknown, args: any) => { calls.push({ ref, args }); return { applied: true }; } };
    const req = new Request("http://localhost/payments/webhook", { method: "POST", headers: { "stripe-signature": `t=1621000000,v1=${v1}` }, body });
    const res = await handlePaymentWebhook(ctx as any, req);
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect((calls[0] as any).args).toMatchObject({ provider: "stripe", externalId: "cs_ok", amount: 5000n, via: "webhook" });
  });
});

/** Minimal in-memory db for applyPayment. */
function makeDb() {
  const tables: Record<string, Map<string, any>> = { invoices: new Map(), processedWebhookEvents: new Map(), timelineEvents: new Map(), auditLog: new Map(), projects: new Map(), contacts: new Map() };
  const db = {
    async get(id: string) {
      for (const t of Object.values(tables)) if (t.has(id)) return t.get(id);
      return null;
    },
    async insert(table: string, doc: any) {
      const id = `id-${table}-${(tables[table]?.size ?? 0) + 1}`;
      if (!tables[table]) tables[table] = new Map();
      tables[table].set(id, { _id: id, ...doc });
      return id;
    },
    async patch(id: string, patch: Record<string, any>) {
      for (const t of Object.values(tables)) {
        const row = t.get(id);
        if (row) { t.set(id, { ...row, ...patch }); return; }
      }
    },
    query(table: string) {
      const list = [...(tables[table]?.values() ?? [])];
      const filter = (f: any) => {
        if (!f) return list;
        return list.filter((row) => f(row) !== false);
      };
      return {
        withIndex: (_n: string, indexFn?: any) => {
          // indexFn builds a filter query like { eq(field, value) } — apply it
          // by extracting the equality constraints the handler used.
          const eqs: Record<string, unknown> = {};
          if (indexFn) {
            const q = {
              eq: (field: string, value: unknown) => { eqs[field] = value; return q; },
            };
            indexFn(q);
          }
          const rows = Object.keys(eqs).length
            ? list.filter((row) => Object.entries(eqs).every(([k, val]) => row[k] === val))
            : list;
          return { collect: async () => rows, first: async () => rows[0] ?? null };
        },
        filter: (f: any) => ({ collect: async () => filter(f) }),
        collect: async () => list,
        first: async () => list[0] ?? null,
      };
    },
  };
  return { db, tables };
}

describe("applyPayment (§21.4 — shared idempotent write path)", () => {
  it("increments amount_paid (never sets), marks processed, writes timeline, idempotent on replay", async () => {
    const { db, tables } = makeDb();
    tables.invoices.set("inv-1", { _id: "inv-1", projectId: "p-1", invoiceNumber: "INV-2026-0001", total: 100_00n, amountPaid: 0n, amountRefunded: 0n, status: "sent", currency: "USD" });
    tables.projects.set("p-1", { _id: "p-1", contactId: "c-1" });
    tables.contacts.set("c-1", { _id: "c-1", userId: "u-1" });

    const first = await applyPaymentCore({ db } as any, { provider: "stripe", externalId: "cs_1", invoiceId: "inv-1", amount: 60_00n, via: "webhook" });
    expect(first.applied).toBe(true);
    expect(tables.invoices.get("inv-1").amountPaid).toBe(60_00n); // incremented, not set

    // replay (webhook retry OR reconciliation finding the same charge) → no double-apply
    const replay = await applyPaymentCore({ db } as any, { provider: "stripe", externalId: "cs_1", invoiceId: "inv-1", amount: 60_00n, via: "webhook" });
    expect(replay.applied).toBe(false);
    expect(tables.invoices.get("inv-1").amountPaid).toBe(60_00n);

    expect(tables.processedWebhookEvents.size).toBe(1);
    expect(tables.timelineEvents.size).toBe(1);
  });

  it("partial payments accumulate to paid via derived status", async () => {
    const { db, tables } = makeDb();
    tables.invoices.set("inv-2", { _id: "inv-2", projectId: "p-2", invoiceNumber: "INV-2026-0002", total: 100_00n, amountPaid: 0n, amountRefunded: 0n, status: "sent", currency: "USD" });
    tables.projects.set("p-2", { _id: "p-2", contactId: "c-2" });
    tables.contacts.set("c-2", { _id: "c-2", userId: "u-1" });

    await applyPaymentCore({ db } as any, { provider: "stripe", externalId: "cs_a", invoiceId: "inv-2", amount: 40_00n, via: "webhook" });
    await applyPaymentCore({ db } as any, { provider: "stripe", externalId: "cs_b", invoiceId: "inv-2", amount: 60_00n, via: "reconciliation" });
    expect(tables.invoices.get("inv-2").amountPaid).toBe(100_00n);
    expect(tables.invoices.get("inv-2").paidAt).toBeTruthy();
  });
});
