import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { GenericId } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  deriveInvoiceStatus,
  computeTotal,
  nextInvoiceNumber,
  canVoid,
  groupByCurrency,
} from "./invoiceLogic";
import type { InvoiceStatus } from "./invoiceLogic";
import { writeTimelineEvent } from "./timeline";
import { writeAuditLog } from "./audit";

async function userIdOrThrow(ctx: QueryCtx | MutationCtx): Promise<GenericId<"users">> {
  const userId = await getAuthUserId(ctx as any);
  if (userId === null) throw new Error("Not signed in");
  return userId;
}

async function ownedProject(
  ctx: QueryCtx | MutationCtx,
  userId: GenericId<"users">,
  projectId: GenericId<"projects">,
) {
  const project = await ctx.db.get(projectId);
  if (!project) return null;
  const contact = await ctx.db.get(project.contactId);
  if (!contact || contact.userId !== userId) return null;
  return { project, contact };
}

/** Line items carry real money — description required, amount > 0, subtotal sane. */
function validateLineItems(
  lineItems: { description: string; amount: bigint }[] | undefined,
  subtotal: bigint,
  taxAmount: bigint | undefined,
) {
  for (const item of lineItems ?? []) {
    if (!item.description.trim()) throw new Error("Every line item needs a description");
    if (item.amount <= 0n) throw new Error("Line item amounts must be positive");
  }
  if (subtotal < 0n) throw new Error("Subtotal can't be negative");
  if ((taxAmount ?? 0n) < 0n) throw new Error("Tax can't be negative");
  if (computeTotal(subtotal, taxAmount) <= 0n) throw new Error("Total must be positive");
}

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    currency: v.string(),
    subtotal: v.int64(),
    taxRate: v.optional(v.number()),
    taxAmount: v.optional(v.int64()),
    dueAt: v.optional(v.number()),
    lineItems: v.optional(
      v.array(
        v.object({
          description: v.string(),
          amount: v.int64(),
          source: v.union(v.literal("manual"), v.literal("github_activity")),
          sourceActivityId: v.optional(v.id("repoActivity")),
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await userIdOrThrow(ctx);
    const owned = await ownedProject(ctx, userId, args.projectId);
    if (!owned) throw new Error("Not found");

    // §21.5 — atomic per-user numbering inside THIS transaction: read the
    // counter row, increment, write back, all in one mutation. Convex
    // serializes concurrent writes to the same row, so two creations can't
    // collide (never a separate read-then-write).
    const year = new Date().getFullYear();
    const counter = await ctx.db
      .query("invoiceCounters")
      .withIndex("by_user_year", (q) => q.eq("userId", userId).eq("year", year))
      .first();
    const { number, seq } = nextInvoiceNumber(counter?.seq, year);
    if (counter) {
      await ctx.db.patch(counter._id, { seq });
    } else {
      await ctx.db.insert("invoiceCounters", { userId, year, seq });
    }

    const taxAmount = args.taxAmount ?? 0n;
    validateLineItems(args.lineItems, args.subtotal, args.taxAmount);
    const total = computeTotal(args.subtotal, taxAmount);
    const invoiceId = await ctx.db.insert("invoices", {
      projectId: args.projectId,
      invoiceNumber: number,
      status: "draft",
      currency: args.currency,
      subtotal: args.subtotal,
      taxRate: args.taxRate,
      taxAmount: args.taxAmount,
      total,
      amountPaid: 0n,
      amountRefunded: 0n,
      issuedAt: undefined,
      dueAt: args.dueAt,
      paidAt: undefined,
      voidedAt: undefined,
      refundedAt: undefined,
    });

    for (const item of args.lineItems ?? []) {
      await ctx.db.insert("invoiceLineItems", {
        invoiceId,
        description: item.description,
        amount: item.amount,
        source: item.source,
        sourceActivityId: item.sourceActivityId,
        included: true,
      });
    }

    await writeAuditLog(ctx, {
      userId,
      action: "invoice.create",
      entityType: "invoice",
      entityId: invoiceId,
      metadata: { number, projectId: args.projectId },
    });

    return { invoiceId, number };
  },
});

/**
 * §3/§18 — edit an existing DRAFT invoice: replace its fields and (optionally)
 * its full line-item set. Non-draft invoices are immutable (they've been sent).
 * Total is recomputed from subtotal + tax the same way creation does it.
 */
export const update = mutation({
  args: {
    invoiceId: v.id("invoices"),
    currency: v.optional(v.string()),
    subtotal: v.optional(v.int64()),
    taxRate: v.optional(v.number()),
    taxAmount: v.optional(v.int64()),
    dueAt: v.optional(v.number()),
    lineItems: v.optional(
      v.array(
        v.object({
          description: v.string(),
          amount: v.int64(),
          source: v.union(v.literal("manual"), v.literal("github_activity")),
          sourceActivityId: v.optional(v.id("repoActivity")),
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await userIdOrThrow(ctx);
    const inv = await ctx.db.get(args.invoiceId);
    if (!inv) throw new Error("Not found");
    const project = await ctx.db.get(inv.projectId);
    if (!project) throw new Error("Not found");
    const contact = await ctx.db.get(project.contactId);
    if (!contact || contact.userId !== userId) throw new Error("Not found");
    if (inv.status !== "draft") throw new Error("Only draft invoices can be edited");

    const subtotal = args.subtotal ?? inv.subtotal;
    const taxAmount = args.taxAmount ?? inv.taxAmount ?? 0n;
    validateLineItems(args.lineItems, subtotal, args.taxAmount ?? inv.taxAmount ?? 0n);
    const total = computeTotal(subtotal, taxAmount);

    await ctx.db.patch(args.invoiceId, {
      ...(args.currency !== undefined ? { currency: args.currency } : {}),
      ...(args.subtotal !== undefined ? { subtotal } : {}),
      ...(args.taxRate !== undefined ? { taxRate: args.taxRate } : {}),
      ...(args.taxAmount !== undefined ? { taxAmount: args.taxAmount } : {}),
      ...(args.dueAt !== undefined ? { dueAt: args.dueAt } : {}),
      total,
    });

    if (args.lineItems !== undefined) {
      const existing = await ctx.db
        .query("invoiceLineItems")
        .withIndex("by_invoice", (q) => q.eq("invoiceId", args.invoiceId))
        .collect();
      for (const row of existing) await ctx.db.delete(row._id);
      for (const item of args.lineItems) {
        await ctx.db.insert("invoiceLineItems", {
          invoiceId: args.invoiceId,
          description: item.description,
          amount: item.amount,
          source: item.source,
          sourceActivityId: item.sourceActivityId,
          included: true,
        });
      }
    }

    await writeAuditLog(ctx, {
      userId,
      action: "invoice.update",
      entityType: "invoice",
      entityId: args.invoiceId,
      metadata: { number: inv.invoiceNumber },
    });

    return { invoiceId: args.invoiceId };
  },
});

/** All invoices for the user's contacts, newest first, status derived. */
export const list = query({
  handler: async (ctx) => {
    const userId = await userIdOrThrow(ctx);
    const invoices = await ctx.db.query("invoices").collect();
    const rows = await Promise.all(
      invoices.map(async (inv) => {
        const project = await ctx.db.get(inv.projectId);
        if (!project) return null;
        const contact = await ctx.db.get(project.contactId);
        if (!contact || contact.userId !== userId) return null;
        return {
          ...inv,
          projectName: project.name,
          contactName: contact.name,
          status: deriveInvoiceStatus({
            status: inv.status,
            amountPaid: inv.amountPaid,
            amountRefunded: inv.amountRefunded,
            total: inv.total,
            dueAt: inv.dueAt,
            now: Date.now(),
          }),
        };
      }),
    );
    const filtered = rows.filter((r): r is NonNullable<typeof r> => r !== null);
    return filtered.sort((a, b) => (b.issuedAt ?? b._creationTime) - (a.issuedAt ?? a._creationTime));
  },
});

export const get = query({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, { invoiceId }) => {
    const userId = await userIdOrThrow(ctx);
    const invoice = await ctx.db.get(invoiceId);
    if (!invoice) return null;
    const project = await ctx.db.get(invoice.projectId);
    if (!project) return null;
    const contact = await ctx.db.get(project.contactId);
    if (!contact || contact.userId !== userId) return null;
    const lineItems = await ctx.db
      .query("invoiceLineItems")
      .withIndex("by_invoice", (q) => q.eq("invoiceId", invoiceId))
      .collect();
    return {
      invoice,
      project,
      contact,
      lineItems,
      status: deriveInvoiceStatus({
        status: invoice.status,
        amountPaid: invoice.amountPaid,
        amountRefunded: invoice.amountRefunded,
        total: invoice.total,
        dueAt: invoice.dueAt,
        now: Date.now(),
      }),
    };
  },
});

export const addLineItem = mutation({
  args: {
    invoiceId: v.id("invoices"),
    description: v.string(),
    amount: v.int64(),
    sourceActivityId: v.optional(v.id("repoActivity")),
  },
  handler: async (ctx, args) => {
    const userId = await userIdOrThrow(ctx);
    const inv = await ctx.db.get(args.invoiceId);
    if (!inv) throw new Error("Not found");
    const project = await ctx.db.get(inv.projectId);
    if (!project) return;
    const contact = await ctx.db.get(project.contactId);
    if (!contact || contact.userId !== userId) throw new Error("Not found");
    if (inv.status !== "draft") throw new Error("Only draft invoices can change");
    await ctx.db.insert("invoiceLineItems", {
      invoiceId: args.invoiceId,
      description: args.description,
      amount: args.amount,
      source: args.sourceActivityId ? "github_activity" : "manual",
      sourceActivityId: args.sourceActivityId,
      included: true,
    });
  },
});

export const removeLineItem = mutation({
  args: { lineItemId: v.id("invoiceLineItems") },
  handler: async (ctx, { lineItemId }) => {
    const userId = await userIdOrThrow(ctx);
    const item = await ctx.db.get(lineItemId);
    if (!item) return;
    const inv = await ctx.db.get(item.invoiceId);
    if (!inv) return;
    const project = await ctx.db.get(inv.projectId);
    if (!project) return;
    const contact = await ctx.db.get(project.contactId);
    if (!contact || contact.userId !== userId) throw new Error("Not found");
    if (inv.status !== "draft") throw new Error("Only draft invoices can change");
    await ctx.db.delete(lineItemId);
  },
});

/**
 * §9 — suggested line items from repo_activity where billable=true, for a
 * project. These are SUGGESTIONS: editable/removable, never auto-confirmed.
 * Each carries the "also linked to [other client]" flag when its repo has more
 * than one active project link (Phase 2's prep query).
 */
export const suggestedLineItems = query({
  // "_" is a client sentinel (InvoiceForm calls this unconditionally).
  args: { projectId: v.union(v.id("projects"), v.literal("_")) },
  handler: async (ctx, { projectId }) => {
    if (projectId === "_") return [];
    const userId = await userIdOrThrow(ctx);
    const owned = await ownedProject(ctx, userId, projectId);
    if (!owned) return [];
    const links = await ctx.db
      .query("projectRepos")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    const items: any[] = [];
    for (const link of links) {
      const activities = await ctx.db
        .query("repoActivity")
        .withIndex("by_project_repo", (q) => q.eq("projectRepoId", link._id))
        .collect();
      for (const a of activities) {
        if (!a.billable) continue;
        // §9 multi-link flag: count active project links on the repo.
        const repoLinks = await ctx.db
          .query("projectRepos")
          .withIndex("by_repo", (q) => q.eq("repoId", link.repoId))
          .collect();
        let active = 0;
        let otherContact: string | null = null;
        for (const rl of repoLinks) {
          const p = await ctx.db.get(rl.projectId);
          if (!p || p.status !== "active") continue;
          active++;
          if (rl.projectId !== projectId) {
            const c = await ctx.db.get(p.contactId);
            if (c) otherContact = c.name;
          }
        }
        items.push({
          activityId: a._id,
          title: a.title,
          url: a.url,
          occurredAt: a.occurredAt,
          multiLinked: active > 1,
          otherContact,
        });
      }
    }
    return items.sort((x, y) => y.occurredAt - x.occurredAt);
  },
});

/** §23.9 — sending is confirm-first (UI), the mutation just marks it sent. */
export const send = mutation({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, { invoiceId }) => {
    const userId = await userIdOrThrow(ctx);
    const inv = await ctx.db.get(invoiceId);
    if (!inv) throw new Error("Not found");
    const project = await ctx.db.get(inv.projectId);
    if (!project) return;
    const contact = await ctx.db.get(project.contactId);
    if (!contact || contact.userId !== userId) throw new Error("Not found");
    if (inv.status === "void" || inv.status === "refunded") throw new Error("Cannot send");
    const now = Date.now();
    await ctx.db.patch(invoiceId, { status: "sent", issuedAt: inv.issuedAt ?? now });
    await writeTimelineEvent(ctx, {
      contactId: contact._id,
      projectId: project._id,
      type: "invoice",
      sourceTable: "invoices",
      sourceId: invoiceId,
      occurredAt: now,
    });
    await writeAuditLog(ctx, {
      userId,
      action: "invoice.send",
      entityType: "invoice",
      entityId: invoiceId,
      metadata: { number: inv.invoiceNumber },
    });
  },
});

export const markViewed = mutation({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, { invoiceId }) => {
    const userId = await userIdOrThrow(ctx);
    const inv = await ctx.db.get(invoiceId);
    if (!inv) throw new Error("Not found");
    const project = await ctx.db.get(inv.projectId);
    if (!project) return;
    const contact = await ctx.db.get(project.contactId);
    if (!contact || contact.userId !== userId) throw new Error("Not found");
    if (inv.status === "sent") await ctx.db.patch(invoiceId, { status: "viewed" });
  },
});

/**
 * §18/§23.1 — void is a manual action, blocked in the MUTATION itself (not just
 * the UI) once amount_paid > 0. A partially-paid invoice gets refunded, not
 * voided.
 */
export const voidInvoice = mutation({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, { invoiceId }) => {
    const userId = await userIdOrThrow(ctx);
    const inv = await ctx.db.get(invoiceId);
    if (!inv) throw new Error("Not found");
    const project = await ctx.db.get(inv.projectId);
    if (!project) return;
    const contact = await ctx.db.get(project.contactId);
    if (!contact || contact.userId !== userId) throw new Error("Not found");
    if (!canVoid(inv.amountPaid)) {
      throw new Error("Cannot void: payments have been received. Refund instead.");
    }
    await ctx.db.patch(invoiceId, { status: "void", voidedAt: Date.now() });
    await writeAuditLog(ctx, {
      userId,
      action: "invoice.void",
      entityType: "invoice",
      entityId: invoiceId,
      metadata: { number: inv.invoiceNumber },
    });
  },
});

/** §21.6 — reporting primitive: totals grouped by currency, never blended. */
export const totalsByCurrency = query({
  handler: async (ctx) => {
    const userId = await userIdOrThrow(ctx);
    const invoices = await ctx.db.query("invoices").collect();
    const rows = [];
    for (const inv of invoices) {
      const project = await ctx.db.get(inv.projectId);
      if (!project) continue;
      const contact = await ctx.db.get(project.contactId);
      if (!contact || contact.userId !== userId) continue;
      const status = deriveInvoiceStatus({
        status: inv.status,
        amountPaid: inv.amountPaid,
        amountRefunded: inv.amountRefunded,
        total: inv.total,
        dueAt: inv.dueAt,
        now: Date.now(),
      });
      if (status === "void" || status === "refunded") continue;
      rows.push({ currency: inv.currency, amount: inv.total - inv.amountPaid });
    }
    return groupByCurrency(rows);
  },
});

interface PaymentArgs {
  provider: "stripe" | "paystack";
  externalId: string;
  invoiceId: string;
  amount: bigint;
  via: "webhook" | "reconciliation";
}

/**
 * §21.4 — the ONE payment write path (plain helper so Vitest can drive it with
 * a stubbed db; the internal mutation below is a thin wrapper). Both the
 * webhook handler and the daily reconciliation job call this: the callers
 * enforce signature-first, and idempotency lives here keyed on
 * processed_webhook_events — so there's never a second code path. amount_paid
 * is INCREMENTED (never set), letting §18 land on paid / partially_paid.
 */
export async function applyPaymentCore(ctx: { db: any }, args: PaymentArgs) {
  const { provider, externalId, invoiceId, amount, via } = args;
  // Money bounds — amount_paid is int64 minor units and must never go
  // backwards or past the total. A gateway might legitimately report an
  // overpayment; clamp to the remaining balance rather than corrupt state
  // (the surplus is refunded at the gateway, not recorded here).
  if (amount <= 0n) return { applied: false, reason: "non-positive-amount" };
  const existing = await ctx.db
    .query("processedWebhookEvents")
    .withIndex("by_provider_external", (q: any) => q.eq("provider", provider).eq("externalId", externalId))
    .first();
  if (existing) return { applied: false, reason: "already-processed" };

  const invoice = await ctx.db.get(invoiceId);
  if (!invoice) return { applied: false, reason: "invoice-not-found" };

  const now = Date.now();
  const remaining = invoice.total - invoice.amountPaid;
  const applied = remaining > 0n ? (amount > remaining ? remaining : amount) : 0n;
  if (applied <= 0n) return { applied: false, reason: "already-settled" };
  const becamePaid = invoice.amountPaid + applied >= invoice.total;
  await ctx.db.patch(invoiceId, {
    amountPaid: invoice.amountPaid + applied,
    paidAt: becamePaid ? now : invoice.paidAt,
  });
  await ctx.db.insert("processedWebhookEvents", {
    provider,
    externalId,
    processedAt: now,
  });
  const project = await ctx.db.get(invoice.projectId);
  const contact = project ? await ctx.db.get(project.contactId) : null;
  if (contact && project) {
    await writeTimelineEvent(ctx as any, {
      contactId: contact._id,
      projectId: project._id,
      type: "invoice",
      sourceTable: "invoices",
      sourceId: invoiceId,
      occurredAt: now,
    });
  }
  // §12 "Invoice paid" — fire on the transition to fully paid, AFTER the
  // transaction commits (webhook/reconciliation have no session, so this uses
  // the userId-targeted internal action).
  if (
    becamePaid &&
    contact?.userId &&
    typeof (ctx as any).scheduler?.runAfter === "function"
  ) {
    await (ctx as any).scheduler.runAfter(0, internal.push.notifyUser, {
      userId: contact.userId,
      title: "Invoice paid",
      body: `Invoice ${invoice.invoiceNumber} (${contact.name}) is fully paid`,
    });
  }
  await writeAuditLog(ctx as any, {
    userId: (contact?.userId ?? "") as GenericId<"users">,
    action: via === "webhook" ? "invoice.payment.webhook" : "invoice.payment.reconciliation",
    entityType: "invoice",
    entityId: invoiceId,
    metadata: { provider, externalId, amount: Number(applied), number: invoice.invoiceNumber },
  });
  return { applied: true, amount: Number(applied) };
}

export const applyPayment = internalMutation({
  args: {
    provider: v.union(v.literal("stripe"), v.literal("paystack")),
    externalId: v.string(),
    invoiceId: v.id("invoices"),
    amount: v.int64(),
    via: v.union(v.literal("webhook"), v.literal("reconciliation")),
  },
  handler: async (ctx, args) => applyPaymentCore(ctx, args),
});

/** §18 derived status for a single invoice (exported for the UI's read path). */
export const getStatus = query({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, { invoiceId }) => {
    const userId = await userIdOrThrow(ctx);
    const inv = await ctx.db.get(invoiceId);
    if (!inv) return null;
    const project = await ctx.db.get(inv.projectId);
    if (!project) return null;
    const contact = await ctx.db.get(project.contactId);
    if (!contact || contact.userId !== userId) return null;
    return deriveInvoiceStatus({
      status: inv.status,
      amountPaid: inv.amountPaid,
      amountRefunded: inv.amountRefunded,
      total: inv.total,
      dueAt: inv.dueAt,
      now: Date.now(),
    });
  },
});

export type { InvoiceStatus };
