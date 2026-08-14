/**
 * §21.4 part 2 — provider REST clients for the daily reconciliation job. These
 * call each provider's list API to find completed payments not yet reflected
 * locally. Signature auth is NOT used here (server-to-server with the secret
 * key); the returned charge/session ids still flow through the SAME idempotent
 * applyPayment path as webhooks, so there's no second code path.
 */

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function paystackConfigured(): boolean {
  return Boolean(process.env.PAYSTACK_SECRET_KEY);
}

/**
 * List completed checkout sessions for a payment link reference. The invoice
 * id rides in session metadata.invoice_id (we set it when generating the
 * link). Returns [{ externalId, amount, invoiceId }].
 */
export async function listStripeCompletedSessions(linkReference: string): Promise<{ externalId: string; amount: bigint; invoiceId: string }[]> {
  const key = process.env.STRIPE_SECRET_KEY!;
  // Sessions paid for a payment link (payment_link is the id of the link we
  // created — matched on metadata.invoice_id below regardless).
  const url = `https://api.stripe.com/v1/checkout/sessions?limit=100&payment_status=paid&expand[]=data.metadata`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`Stripe API ${res.status}`);
  const body = await res.json();
  const out: { externalId: string; amount: bigint; invoiceId: string }[] = [];
  for (const s of body.data ?? []) {
    const invoiceId = s.metadata?.invoice_id;
    if (!invoiceId || !String(invoiceId).includes(linkReference)) continue;
    out.push({
      externalId: s.id,
      amount: BigInt(s.amount_total ?? 0),
      invoiceId: String(invoiceId),
    });
  }
  return out;
}

/**
 * List successful charges for a Paystack transaction reference pattern.
 * Paystack charges carry custom_fields (display_name "invoice_id") — we set
 * them at link-generation time.
 */
export async function listPaystackCompletedCharges(linkReference: string): Promise<{ externalId: string; amount: bigint; invoiceId: string }[]> {
  const key = process.env.PAYSTACK_SECRET_KEY!;
  const url = `https://api.paystack.co/transaction?perPage=100&status=success`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`Paystack API ${res.status}`);
  const body = await res.json();
  const out: { externalId: string; amount: bigint; invoiceId: string }[] = [];
  for (const t of body.data ?? []) {
    let invoiceId: string | null = null;
    for (const f of t.metadata?.custom_fields ?? []) {
      if (f.display_name === "invoice_id" || f.variable_name === "invoice_id") invoiceId = String(f.value);
    }
    if (!invoiceId || !invoiceId.includes(linkReference)) continue;
    out.push({
      externalId: t.reference ?? t.id,
      amount: BigInt(t.amount ?? 0),
      invoiceId,
    });
  }
  return out;
}
