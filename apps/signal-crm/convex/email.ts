import { action, internalMutation, internalQuery } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import { renderInvoicePdf } from "./invoicePdf";
import type { PdfInvoice } from "./invoicePdf";
import { writeAuditLog } from "./audit";
import { writeTimelineEvent } from "./timeline";

/**
 * §15 system-generated/transactional sends. Resend is the pick over Brevo:
 * zero-config from a single API key (no SMTP server setup), a free tier sized
 * for solo-scale transactional mail, and the simplest webhook-free flow for the
 * Phase 5 magic links. Sends come from the platform's domain (never the
 * freelancer's Gmail — that's Phase 4), and are SPF/DKIM'd via the domain
 * records in §21.11.
 */

export function resendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendEmailViaResend(args: {
  to: string;
  subject: string;
  html: string;
  from?: string;
}): Promise<{ id: string }> {
  const key = process.env.RESEND_API_KEY!;
  const from = args.from ?? process.env.RESEND_FROM ?? "Signal <invoices@signalapp.com>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: args.to, subject: args.subject, html: args.html }),
  });
  if (!res.ok) throw new Error(`Resend API ${res.status}: ${await res.text()}`);
  return await res.json();
}

export const sendInvoice = action({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, { invoiceId }): Promise<{ sent: boolean; to: string; via: string }> => {
    const data = await ctx.runQuery(internal.email.invoiceForSend, { invoiceId });
    if (!data) throw new Error("Invoice not found");
    const { invoice, contact } = data;

    // §21.9 — the action runs with the caller's auth; verify the invoice's
    // owner matches before sending anything to the outside world.
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not signed in");
    const ownerId = await ctx.runQuery(internal.email.userIdForEmail, {
      email: identity.email ?? "",
    });
    if (!ownerId || ownerId !== contact.userId) throw new Error("Not found");

    // Emails live in contact_emails (never on the contact row); send to the
    // primary one (§18).
    const emails = await ctx.runQuery(internal.email.contactEmails, {
      contactId: contact._id,
    });
    const email = emails.find((e) => e.isPrimary)?.email ?? emails[0]?.email;
    if (!email) throw new Error("Client has no email address on file.");

    const pdf: PdfInvoice = {
      invoiceNumber: invoice.invoiceNumber,
      currency: invoice.currency,
      subtotal: invoice.subtotal,
      taxAmount: invoice.taxAmount ?? 0n,
      taxRate: invoice.taxRate,
      total: invoice.total,
      amountPaid: invoice.amountPaid,
      issuedAt: invoice.issuedAt,
      dueAt: invoice.dueAt,
      fromName: "Signal",
      clientName: contact.name,
      lineItems: invoice.lineItems,
    };
    const html = renderInvoicePdf(pdf);

    // §17 — when Gmail is connected, send from the freelancer's own identity;
    // fall back to the §15 transactional path (Resend) when it isn't.
    const gmail = await ctx.runQuery(internal.email.gmailAvailable, {});
    if (gmail.connected) {
      await ctx.runAction(api.email.sendInvoiceViaGmail, {
        invoiceId,
        to: email,
        subject: `Invoice ${invoice.invoiceNumber} from Signal`,
        html,
      });
      await ctx.runMutation(internal.email.markSent, { invoiceId });
      return { sent: true, to: email, via: "gmail" };
    }

    if (!resendConfigured()) {
      throw new Error("Email sending is not configured yet (needs RESEND_API_KEY or a Gmail connection).");
    }
    await sendEmailViaResend({
      to: email,
      subject: `Invoice ${invoice.invoiceNumber} from Signal`,
      html,
    });

    await ctx.runMutation(internal.email.markSent, { invoiceId });
    return { sent: true, to: email, via: "resend" };
  },
});

export const invoiceForSend = internalQuery({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, { invoiceId }) => {
    const invoice = await ctx.db.get(invoiceId);
    if (!invoice) return null;
    const project = await ctx.db.get(invoice.projectId);
    if (!project) return null;
    const contact = await ctx.db.get(project.contactId);
    if (!contact) return null;
    const lineItems = await ctx.db
      .query("invoiceLineItems")
      .withIndex("by_invoice", (q) => q.eq("invoiceId", invoiceId))
      .collect();
    return {
      invoice: { ...invoice, lineItems },
      contact,
      project,
    };
  },
});

export const contactEmails = internalQuery({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, { contactId }) => {
    return await ctx.db
      .query("contactEmails")
      .withIndex("by_contact", (q) => q.eq("contactId", contactId))
      .collect();
  },
});

/** Whether the freelancer has Gmail connected (drives the §17 send path). */
export const gmailAvailable = internalQuery({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { connected: false };
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", identity.email ?? ""))
      .first();
    return { connected: Boolean(user?.googleRefreshTokenEncrypted) };
  },
});

/** Resolve a user's id from their verified email — used by the send action's ownership check. */
export const userIdForEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .first();
    return user?._id ?? null;
  },
});

/** §17 path — compose the invoice as a text email and send via gmail.send. */
export const sendInvoiceViaGmail = action({
  args: { invoiceId: v.id("invoices"), to: v.string(), subject: v.string(), html: v.string() },
  handler: async (ctx, { to, subject }) => {
    const user = await ctx.runQuery(internal.email.gmailAvailable, {});
    if (!user.connected) throw new Error("Gmail is not connected.");
    await ctx.runAction(api.gmailSend.sendEmailViaGmail, {
      to,
      from: "me", // gmail.send sends from the authenticated account's own address
      subject,
      text: `Your invoice is attached as a PDF in the client portal. (Invoice sent via Signal CRM.)`,
    });
  },
});

export const markSent = internalMutation({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, { invoiceId }) => {
    const invoice = await ctx.db.get(invoiceId);
    if (!invoice) return;
    const now = Date.now();
    await ctx.db.patch(invoiceId, { status: "sent", issuedAt: invoice.issuedAt ?? now });
    // §15 documents — the generated invoice PDF lives in the client's docs.
    const project = await ctx.db.get(invoice.projectId);
    if (project) {
      await ctx.db.insert("documents", {
        contactId: project.contactId,
        projectId: project._id,
        type: "invoice_pdf",
        provider: "pdf",
        providerRef: invoiceId,
        status: "sent",
        createdAt: now,
      });
      const contact = await ctx.db.get(project.contactId);
      if (contact) {
        // §18 write-path rule — a send is an invoice event on the client's
        // timeline. This is the REAL send path (the UI calls this action, not
        // the invoices.send mutation), so the event lands here, same
        // transaction as the status change.
        await writeTimelineEvent(ctx, {
          contactId: project.contactId,
          projectId: project._id,
          type: "invoice",
          sourceTable: "invoices",
          sourceId: invoiceId,
          occurredAt: now,
        });
        await writeAuditLog(ctx, {
          userId: contact.userId,
          action: "invoice.email_sent",
          entityType: "invoice",
          entityId: invoiceId,
          metadata: { number: invoice.invoiceNumber },
        });
      }
    }
  },
});
