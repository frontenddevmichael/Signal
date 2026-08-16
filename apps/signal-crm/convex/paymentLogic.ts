/**
 * §21.4 payment webhook PURE logic — Stripe and Paystack signature
 * verification + event → payment mapping. Same pattern as githubLogic.ts
 * (§20.11): AUTHENTICITY first (reject before any write), then idempotency
 * (processed_webhook_events in the shared applyPayment mutation).
 */

/**
 * Stripe signs the raw body with HMAC-SHA256, keyed on the webhook signing
 * secret, prefixed "t=" with the timestamp. Constant-time compare.
 */
export async function verifyStripeSignature(
  secret: string,
  rawBody: string,
  signatureHeader: string | null | undefined,
): Promise<boolean> {
  if (!signatureHeader) return false;
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((p) => {
      const [k, ...rest] = p.trim().split("=");
      return [k, rest.join("=")];
    }),
  );
  const provided = parts["v1"];
  if (!provided) return false;
  const expected = await hmacSha256Hex(secret, `${parts["t"] ?? ""}.${rawBody}`);
  return constantTimeEqualHex(expected, provided);
}

/**
 * Paystack signs the raw body with HMAC-SHA512, keyed on the secret key, in
 * the `x-paystack-signature` header.
 */
export async function verifyPaystackSignature(
  secret: string,
  rawBody: string,
  signatureHeader: string | null | undefined,
): Promise<boolean> {
  if (!signatureHeader) return false;
  const expected = await hmacSha512Hex(secret, rawBody);
  return constantTimeEqualHex(expected, signatureHeader);
}

async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSha512Hex(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export interface PaymentEvent {
  /** Idempotency key (provider's own event/charge/session id). */
  externalId: string;
  /** Cents/kobo paid. */
  amount: bigint;
  /** Our invoice id reference. Stripe: metadata.invoice_id; Paystack: custom_fields. */
  invoiceId: string | null;
}

/**
 * Map a verified Stripe payload to a payment event. Only
 * checkout.session.completed counts. The invoice reference rides in
 * `metadata.invoice_id` on the session (we control the payment-link metadata).
 */
export function parseStripeEvent(payload: Record<string, any>): PaymentEvent | null {
  if (payload?.type !== "checkout.session.completed") return null;
  const session = payload.data?.object ?? {};
  if (session.payment_status === "unpaid") return null;
  return {
    externalId: session.id ?? payload.id,
    amount: BigInt(session.amount_total ?? 0),
    invoiceId: session.metadata?.invoice_id ?? null,
  };
}

/**
 * Map a verified Paystack payload to a payment event. Only
 * charge.success counts; the invoice reference comes from
 * `custom_fields[].value` where the field key is "invoice_id".
 */
export function parsePaystackEvent(payload: Record<string, any>): PaymentEvent | null {
  if (payload?.event !== "charge.success") return null;
  const data = payload.data ?? {};
  let invoiceId: string | null = null;
  for (const field of data.custom_fields ?? []) {
    if (field?.display_name === "invoice_id" || field?.variable_name === "invoice_id") {
      invoiceId = field.value ?? null;
    }
  }
  return {
    externalId: data.reference ?? data.id,
    amount: BigInt(data.amount ?? 0),
    invoiceId,
  };
}
