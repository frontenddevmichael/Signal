import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { cronJobs } from "convex/server";
import { stripeConfigured, paystackConfigured, listStripeCompletedSessions, listPaystackCompletedCharges } from "./paymentsClient";

/**
 * §21.4 part 2 — DAILY reconciliation job (explicitly mandatory, not optional).
 *
 * Webhook delivery isn't guaranteed forever; if the endpoint is down when a
 * provider fires, retries stop after a window. This job:
 * 1. finds invoices with status in (sent, overdue) that are stale
 * 2. calls each provider's list API for completed payments
 * 3. applies each through the EXACT SAME idempotent write path as the webhook
 *    handler (invoices.applyPayment, keyed on charge/session id via
 *    processed_webhook_events) — never a second code path
 * Reconciliation-triggered updates are logged distinctly (via:
 * "reconciliation" vs "webhook") so a high rate signals webhook uptime issues.
 */

export const reconcile = internalAction({
  args: {},
  handler: async (ctx): Promise<{ checked: number; reconciled: number }> => {
    const invoices = await ctx.runQuery(internal.reconciliation.staleInvoices, {});
    let reconciled = 0;
    for (const inv of invoices) {
      // A payment-link reference to look up (we tag it on the invoice).
      // The provider's list endpoints filter on metadata/fields containing
      // the invoice id — pass the invoice id itself as the reference.
      const reference = inv._id;

      if (inv.provider === "stripe" && stripeConfigured()) {
        const paid = await listStripeCompletedSessions(reference);
        for (const p of paid) {
          const res = await ctx.runMutation(internal.invoices.applyPayment, {
            provider: "stripe",
            externalId: p.externalId,
            invoiceId: inv._id as any,
            amount: p.amount,
            via: "reconciliation",
          });
          if (res.applied) reconciled++;
        }
      } else if (inv.provider === "paystack" && paystackConfigured()) {
        const paid = await listPaystackCompletedCharges(reference);
        for (const p of paid) {
          const res = await ctx.runMutation(internal.invoices.applyPayment, {
            provider: "paystack",
            externalId: p.externalId,
            invoiceId: inv._id as any,
            amount: p.amount,
            via: "reconciliation",
          });
          if (res.applied) reconciled++;
        }
      }
    }
    return { checked: invoices.length, reconciled };
  },
});

export const staleInvoices = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    // stale = updated more than 6h ago and not settled
    const sixHours = 6 * 3600_000;
    const invoices = await ctx.db.query("invoices").collect();
    const rows: { _id: string; provider: string }[] = [];
    for (const inv of invoices) {
      const status = inv.status as string;
      if (status !== "sent" && status !== "overdue") continue;
      const updated = Math.max(inv._creationTime, inv.issuedAt ?? 0, inv.paidAt ?? 0);
      if (now - updated < sixHours) continue;
      if (inv.amountPaid >= inv.total) continue; // already settled
      rows.push({ _id: inv._id, provider: (inv as any).provider ?? "stripe" });
    }
    return rows;
  },
});

/** Marks an invoice with its payment provider (set when a payment link is generated). */
export const setProvider = internalMutation({
  args: { invoiceId: v.id("invoices"), provider: v.string() },
  handler: async (ctx, { invoiceId, provider }) => {
    await ctx.db.patch(invoiceId, { provider: provider as any });
  },
});

const crons = cronJobs();
crons.daily("daily-reconciliation", { hourUTC: 3, minuteUTC: 0 }, internal.reconciliation.reconcile);
export default crons;
