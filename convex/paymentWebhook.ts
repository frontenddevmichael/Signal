/**
 * §21.4 part 1 — payment webhook HTTP action, mounted at /payments/webhook
 * (Stripe) and /payments/webhook/paystack (Paystack — same body parsing, the
 * provider is detected by which secret verifies).
 *
 * Order (locked, §20.11): AUTHENTICITY first — reject before touching the DB.
 * Then the shared idempotent write path (invoices.applyPayment, keyed on the
 * provider's charge/session id via processed_webhook_events) — the SAME path
 * the daily reconciliation job uses, so there's never a second code path.
 */
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { verifyStripeSignature, verifyPaystackSignature, parseStripeEvent, parsePaystackEvent } from "./paymentLogic";

type MutationRunner = {
  runMutation: (ref: any, args: any) => Promise<any>;
};

export async function handlePaymentWebhook(ctx: MutationRunner, request: Request): Promise<Response> {
  const rawBody = await request.text();
  const url = new URL(request.url);
  const isPaystack = url.pathname.endsWith("/paystack");

  // 1. AUTHENTICITY — reject before any write.
  if (isPaystack) {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) return new Response("Not configured", { status: 500 });
    const sig = request.headers.get("x-paystack-signature");
    if (!(await verifyPaystackSignature(secret, rawBody, sig))) {
      return new Response("Invalid signature", { status: 401 });
    }
  } else {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) return new Response("Not configured", { status: 500 });
    const sig = request.headers.get("stripe-signature");
    if (!(await verifyStripeSignature(secret, rawBody, sig))) {
      return new Response("Invalid signature", { status: 401 });
    }
  }

  const payload = JSON.parse(rawBody) as Record<string, any>;
  const event = isPaystack ? parsePaystackEvent(payload) : parseStripeEvent(payload);

  // Not a payment-completed event (e.g. invoice.created) — ack and stop.
  if (!event) return new Response("OK", { status: 200 });

  // 2. Idempotent write through the SHARED path.
  const result = await ctx.runMutation(internal.invoices.applyPayment, {
    provider: isPaystack ? "paystack" : "stripe",
    externalId: event.externalId,
    invoiceId: event.invoiceId ?? "",
    amount: event.amount,
    via: "webhook",
  });
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export const paymentsWebhook = httpAction(async (ctx, request) => {
  return await handlePaymentWebhook(ctx, request);
});
