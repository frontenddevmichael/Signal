import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { GenericId } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { pickSurvivor, buildMergePlan } from "./mergeLogic";
import type { MergePlan } from "./mergeLogic";
import { deriveInvoiceStatus } from "./invoiceLogic";
import {
  deserializeSnapshot,
  planDeleteRestore,
  planMergeUndo,
  serializeSnapshot,
  stripForInsert,
} from "./undoLogic";
import type { DeleteSnapshot, MergeSnapshot, RowData } from "./undoLogic";
import { writeAuditLog } from "./audit";

const CONTACT_STATUS = v.union(v.literal("lead"), v.literal("active"), v.literal("closed"));
const CONTACT_SOURCE = v.union(
  v.literal("referral"),
  v.literal("cold_outreach"),
  v.literal("platform"),
);

// §23.3 — snapshots are actionable for 24h; the toast itself only lives ~5s.
const UNDO_TTL_MS = 24 * 60 * 60 * 1000;

/** Drop undo rows past their window (called opportunistically on write paths). */
async function purgeExpiredUndo(ctx: MutationCtx, userId: GenericId<"users">): Promise<void> {
  const cutoff = Date.now() - UNDO_TTL_MS;
  const rows = await ctx.db
    .query("contactUndo")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  for (const r of rows) {
    if (r.createdAt < cutoff) await ctx.db.delete(r._id);
  }
}

async function userIdOrThrow(ctx: QueryCtx | MutationCtx): Promise<GenericId<"users">> {
  const userId = await getAuthUserId(ctx as any);
  if (userId === null) throw new Error("Not signed in");
  return userId;
}

/**
 * The §13 table view: sortable/filterable columns. Derived columns computed
 * here so the table renders without per-row client joins:
 * - lastContactDate — most recent timeline event (§14 health signal basis)
 * - nextDeadline — nearest active project deadline
 * - outstandingBalance — §18 derived from invoices; 0 until Phase 3 creates any
 * - primaryEmail/primaryPhone — for display, is_primary first
 */
export const list = query({
  args: {
    // Optional filter for the §22.14 filter bar; sorting is client-side for now
    // (solo scale) but the columns stay the spec's.
    status: v.optional(CONTACT_STATUS),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await userIdOrThrow(ctx);
    let contacts = await ctx.db
      .query("contacts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    if (args.search) {
      const term = args.search.trim().toLowerCase();
      contacts = contacts.filter(
        (c) =>
          c.name.toLowerCase().includes(term) ||
          (c.company ?? "").toLowerCase().includes(term),
      );
    }
    if (args.status) {
      contacts = contacts.filter((c) => c.status === args.status);
    }

    const rows = await Promise.all(
      contacts.map(async (c) => {
        const lastEvent = await ctx.db
          .query("timelineEvents")
          .withIndex("by_contact", (q) => q.eq("contactId", c._id))
          // A scheduled future meeting must not count as "last contact" —
          // health, the list column, and follow-up math all derive from this.
          .filter((q) => q.lte(q.field("occurredAt"), Date.now()))
          .order("desc")
          .first();
        const projects = await ctx.db
          .query("projects")
          .withIndex("by_contact", (q) => q.eq("contactId", c._id))
          .collect();
        const nextDeadline = projects
          .filter((p) => p.status === "active" && p.deadline !== undefined && p.deadline >= Date.now())
          .sort((p, q) => (p.deadline! - q.deadline!))[0]?.deadline;
        // outstandingBalance = sum(total - amount_paid) over not-settled
        // invoices across ALL of the contact's projects (§18 derivation).
        // int64 (BigInt) arithmetic, converted only for display.
        let outstanding = 0n;
        for (const p of projects) {
          const invoices = await ctx.db
            .query("invoices")
            .withIndex("by_project", (q) => q.eq("projectId", p._id))
            .collect();
          for (const inv of invoices) {
            if (inv.status === "paid" || inv.status === "void" || inv.status === "refunded") continue;
            outstanding += inv.total - inv.amountPaid;
          }
        }
        const emails = await ctx.db
          .query("contactEmails")
          .withIndex("by_contact", (q) => q.eq("contactId", c._id))
          .collect();
        const phones = await ctx.db
          .query("contactPhones")
          .withIndex("by_contact", (q) => q.eq("contactId", c._id))
          .collect();
        return {
          ...c,
          lastContactDate: lastEvent?.occurredAt ?? null,
          nextDeadline: nextDeadline ?? null,
          outstandingBalance: Number(outstanding),
          primaryEmail: emails.find((e) => e.isPrimary)?.email ?? emails[0]?.email ?? null,
          primaryPhone:
            phones.find((p) => p.isPrimary)?.phoneNumber ?? phones[0]?.phoneNumber ?? null,
          emailCount: emails.length,
          phoneCount: phones.length,
        };
      }),
    );

    return rows;
  },
});

/** Full contact record: the row plus emails/phones/projects (client detail header). */
export const get = query({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, { contactId }) => {
    const userId = await userIdOrThrow(ctx);
    const contact = await ctx.db.get(contactId);
    if (!contact || contact.userId !== userId) return null;
    const [emails, phones, projects] = await Promise.all([
      ctx.db
        .query("contactEmails")
        .withIndex("by_contact", (q) => q.eq("contactId", contactId))
        .collect(),
      ctx.db
        .query("contactPhones")
        .withIndex("by_contact", (q) => q.eq("contactId", contactId))
        .collect(),
      ctx.db
        .query("projects")
        .withIndex("by_contact", (q) => q.eq("contactId", contactId))
        .collect(),
    ]);
    return { contact, emails, phones, projects };
  },
});

/**
 * §14/§2.2 — per-contact aggregates for the client detail stats strip and tab
 * counts, in one round trip: total billed, open (unpaid) invoice count, project
 * counts, linked repo count, and the invoice rows for the Financials tab.
 * Status is derived per §18 (never trusts the stored union).
 */
export const stats = query({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, { contactId }) => {
    const userId = await userIdOrThrow(ctx);
    const contact = await ctx.db.get(contactId);
    if (!contact || contact.userId !== userId) return null;

    const projects = await ctx.db
      .query("projects")
      .withIndex("by_contact", (q) => q.eq("contactId", contactId))
      .collect();

    // Invoices attach to projects, so a per-contact list is a join. Solo scale:
    // N+1 per project is fine, and avoids a by_contact index on invoices.
    let repoCount = 0;
    const rawInvoices: Array<{
      _id: GenericId<"invoices">;
      invoiceNumber: string;
      status: string;
      total: bigint;
      amountPaid: bigint;
      amountRefunded: bigint;
      issuedAt?: number;
      dueAt?: number;
      currency: string;
    }> = [];
    for (const p of projects) {
      const links = await ctx.db
        .query("projectRepos")
        .withIndex("by_project", (q) => q.eq("projectId", p._id))
        .collect();
      repoCount += links.length;
      const invs = await ctx.db
        .query("invoices")
        .withIndex("by_project", (q) => q.eq("projectId", p._id))
        .collect();
      for (const inv of invs) rawInvoices.push(inv as any);
    }

    const now = Date.now();
    const invoices = rawInvoices.map((inv) => ({
      _id: inv._id,
      invoiceNumber: inv.invoiceNumber,
      currency: inv.currency,
      total: inv.total,
      amountPaid: inv.amountPaid,
      issuedAt: inv.issuedAt,
      dueAt: inv.dueAt,
      status: deriveInvoiceStatus({
        status: inv.status as any,
        amountPaid: inv.amountPaid,
        amountRefunded: inv.amountRefunded,
        total: inv.total,
        dueAt: inv.dueAt,
        now,
      }),
    }));

    const openInvoices = invoices.filter(
      (r) =>
        r.status !== "draft" &&
        r.status !== "paid" &&
        r.status !== "void" &&
        r.status !== "refunded",
    ).length;
    const totalBilled = invoices.reduce((acc, r) => acc + r.total, 0n);

    return {
      projectsCount: projects.length,
      activeProjects: projects.filter((p) => p.status === "active").length,
      repoCount,
      openInvoices,
      totalBilled,
      invoices,
    };
  },
});

/**
 * §20.5 — keyword search over name/company (Convex search indexes). Cross-entity
 * fan-out is explicitly deferred per the PRD.
 */
export const search = query({
  args: { term: v.string() },
  handler: async (ctx, { term }) => {
    const userId = await userIdOrThrow(ctx);
    const byName = await ctx.db
      .query("contacts")
      .withSearchIndex("search_name", (q) => q.search("name", term))
      .collect();
    const byCompany = await ctx.db
      .query("contacts")
      .withSearchIndex("search_company", (q) => q.search("company", term))
      .collect();
    const seen = new Set<string>();
    return [...byCompany, ...byName]
      .filter((c) => {
        if (c.userId !== userId || seen.has(c._id)) return false;
        seen.add(c._id);
        return true;
      })
      .slice(0, 20);
  },
});

/**
 * §20.6 duplicate detection — check incoming emails/phones before creating.
 * Returns { duplicate } without writing when a match exists; the UI then offers
 * merge-or-create-anyway. `force` bypasses the check.
 */
export const create = mutation({
  args: {
    name: v.string(),
    company: v.optional(v.string()),
    status: CONTACT_STATUS,
    source: v.optional(CONTACT_SOURCE),
    tags: v.optional(v.array(v.string())),
    timezone: v.optional(v.string()),
    emails: v.optional(v.array(v.object({ email: v.string(), isPrimary: v.boolean() }))),
    phones: v.optional(v.array(v.object({ phoneNumber: v.string(), isPrimary: v.boolean() }))),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await userIdOrThrow(ctx);

    // Duplicate check: any incoming email/phone that already exists for THIS user.
    // The by_email/by_phone indexes are global, so a hit is only a duplicate when
    // the owning contact is ours — otherwise another tenant's data would leak
    // (their contactId + name) back to the caller.
    const duplicateIds = new Set<string>();
    for (const e of args.emails ?? []) {
      const hit = await ctx.db
        .query("contactEmails")
        .withIndex("by_email", (q) => q.eq("email", e.email.toLowerCase()))
        .first();
      if (hit) {
        const owner = await ctx.db.get(hit.contactId);
        if (owner && owner.userId === userId) duplicateIds.add(hit.contactId);
      }
    }
    for (const p of args.phones ?? []) {
      const hit = await ctx.db
        .query("contactPhones")
        .withIndex("by_phone", (q) => q.eq("phoneNumber", p.phoneNumber))
        .first();
      if (hit) {
        const owner = await ctx.db.get(hit.contactId);
        if (owner && owner.userId === userId) duplicateIds.add(hit.contactId);
      }
    }
    if (duplicateIds.size > 0 && !args.force) {
      const existing = await ctx.db.get([...duplicateIds][0] as GenericId<"contacts">);
      return {
        duplicate: existing
          ? { contactId: existing._id, name: existing.name, email: null as string | null }
          : null,
        created: null,
      };
    }

    const contactId = await ctx.db.insert("contacts", {
      userId,
      name: args.name.trim(),
      company: args.company,
      status: args.status,
      source: args.source,
      tags: args.tags ?? [],
      timezone: args.timezone,
      createdAt: Date.now(),
    });

    for (const [i, e] of (args.emails ?? []).entries()) {
      await ctx.db.insert("contactEmails", {
        contactId,
        email: e.email.toLowerCase(),
        isPrimary: e.isPrimary || (i === 0 && (args.emails ?? []).length === 1),
      });
    }
    for (const [i, p] of (args.phones ?? []).entries()) {
      await ctx.db.insert("contactPhones", {
        contactId,
        phoneNumber: p.phoneNumber,
        isPrimary: p.isPrimary || (i === 0 && (args.phones ?? []).length === 1),
      });
    }
    return { duplicate: null, created: contactId };
  },
});

export const update = mutation({
  args: {
    contactId: v.id("contacts"),
    name: v.string(),
    company: v.optional(v.string()),
    status: CONTACT_STATUS,
    source: v.optional(CONTACT_SOURCE),
    tags: v.array(v.string()),
    timezone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await userIdOrThrow(ctx);
    const contact = await ctx.db.get(args.contactId);
    if (!contact || contact.userId !== userId) throw new Error("Not found");
    await ctx.db.patch(args.contactId, {
      name: args.name.trim(),
      company: args.company,
      status: args.status,
      source: args.source,
      tags: args.tags,
      timezone: args.timezone,
    });
  },
});

export const addEmail = mutation({
  args: { contactId: v.id("contacts"), email: v.string(), isPrimary: v.optional(v.boolean()) },
  handler: async (ctx, { contactId, email, isPrimary }) => {
    const userId = await userIdOrThrow(ctx);
    const contact = await ctx.db.get(contactId);
    if (!contact || contact.userId !== userId) throw new Error("Not found");
    const existing = await ctx.db
      .query("contactEmails")
      .withIndex("by_email", (q) => q.eq("email", email.toLowerCase()))
      .first();
    if (existing && existing.contactId === contactId) return; // already there
    await ctx.db.insert("contactEmails", {
      contactId,
      email: email.toLowerCase(),
      isPrimary: isPrimary ?? false,
    });
    if (isPrimary) await clearOtherPrimaries(ctx, "contactEmails", contactId, email.toLowerCase(), "email");
  },
});

export const removeEmail = mutation({
  args: { contactId: v.id("contacts"), email: v.string() },
  handler: async (ctx, { contactId, email }) => {
    const userId = await userIdOrThrow(ctx);
    const contact = await ctx.db.get(contactId);
    if (!contact || contact.userId !== userId) throw new Error("Not found");
    const row = await ctx.db
      .query("contactEmails")
      .withIndex("by_email", (q) => q.eq("email", email.toLowerCase()))
      .first();
    if (row && row.contactId === contactId) await ctx.db.delete(row._id);
  },
});

export const addPhone = mutation({
  args: { contactId: v.id("contacts"), phoneNumber: v.string(), isPrimary: v.optional(v.boolean()) },
  handler: async (ctx, { contactId, phoneNumber, isPrimary }) => {
    const userId = await userIdOrThrow(ctx);
    const contact = await ctx.db.get(contactId);
    if (!contact || contact.userId !== userId) throw new Error("Not found");
    await ctx.db.insert("contactPhones", {
      contactId,
      phoneNumber,
      isPrimary: isPrimary ?? false,
    });
    if (isPrimary) await clearOtherPrimaries(ctx, "contactPhones", contactId, phoneNumber, "phoneNumber");
  },
});

export const removePhone = mutation({
  args: { contactId: v.id("contacts"), phoneNumber: v.string() },
  handler: async (ctx, { contactId, phoneNumber }) => {
    const userId = await userIdOrThrow(ctx);
    const contact = await ctx.db.get(contactId);
    if (!contact || contact.userId !== userId) throw new Error("Not found");
    const rows = await ctx.db
      .query("contactPhones")
      .withIndex("by_contact", (q) => q.eq("contactId", contactId))
      .collect();
    const hit = rows.find((r) => r.phoneNumber === phoneNumber);
    if (hit) await ctx.db.delete(hit._id);
  },
});

async function clearOtherPrimaries(
  ctx: any,
  table: "contactEmails" | "contactPhones",
  contactId: string,
  value: string,
  field: "email" | "phoneNumber",
) {
  const rows = await ctx.db
    .query(table)
    .withIndex("by_contact", (q: any) => q.eq("contactId", contactId))
    .collect();
  for (const r of rows) {
    if (r.isPrimary && r[field] !== value) await ctx.db.patch(r._id, { isPrimary: false });
  }
}

/**
 * Reconcile the FULL email list for a contact in one transaction — the edit
 * form sends the whole set, and add/remove are fine for single ops but drift
 * on multi-edit. Deletes rows no longer present, inserts new ones, and applies
 * the primary flag (single primary per contact, §18).
 */
export const syncEmails = mutation({
  args: {
    contactId: v.id("contacts"),
    emails: v.array(v.object({ email: v.string(), isPrimary: v.boolean() })),
  },
  handler: async (ctx, { contactId, emails }) => {
    const userId = await userIdOrThrow(ctx);
    const contact = await ctx.db.get(contactId);
    if (!contact || contact.userId !== userId) throw new Error("Not found");
    const rows = await ctx.db
      .query("contactEmails")
      .withIndex("by_contact", (q) => q.eq("contactId", contactId))
      .collect();
    const wanted = emails.map((e) => ({ email: e.email.trim().toLowerCase(), isPrimary: e.isPrimary }));
    const wantedSet = new Set(wanted.map((e) => e.email));
    for (const row of rows) {
      if (!wantedSet.has(row.email)) await ctx.db.delete(row._id);
    }
    const existingSet = new Set(rows.map((r) => r.email));
    const primary = wanted.find((e) => e.isPrimary);
    for (const w of wanted) {
      if (existingSet.has(w.email)) {
        await ctx.db
          .query("contactEmails")
          .withIndex("by_contact", (q) => q.eq("contactId", contactId))
          .filter((q) => q.eq(q.field("email"), w.email))
          .first()
          .then(async (row) => {
            if (row && row.isPrimary !== (primary?.email === w.email)) {
              await ctx.db.patch(row._id, { isPrimary: primary?.email === w.email });
            }
          });
      } else {
        await ctx.db.insert("contactEmails", {
          contactId,
          email: w.email,
          isPrimary: primary?.email === w.email,
        });
      }
    }
  },
});

/** Same reconciliation for phones (matched on normalized number string). */
export const syncPhones = mutation({
  args: {
    contactId: v.id("contacts"),
    phones: v.array(v.object({ phoneNumber: v.string(), isPrimary: v.boolean() })),
  },
  handler: async (ctx, { contactId, phones }) => {
    const userId = await userIdOrThrow(ctx);
    const contact = await ctx.db.get(contactId);
    if (!contact || contact.userId !== userId) throw new Error("Not found");
    const rows = await ctx.db
      .query("contactPhones")
      .withIndex("by_contact", (q) => q.eq("contactId", contactId))
      .collect();
    const wanted = phones.map((p) => ({ phoneNumber: p.phoneNumber.trim(), isPrimary: p.isPrimary }));
    const wantedSet = new Set(wanted.map((p) => p.phoneNumber));
    for (const row of rows) {
      if (!wantedSet.has(row.phoneNumber)) await ctx.db.delete(row._id);
    }
    const existingSet = new Set(rows.map((r) => r.phoneNumber));
    const primary = wanted.find((p) => p.isPrimary);
    for (const w of wanted) {
      if (existingSet.has(w.phoneNumber)) {
        const row = rows.find((r) => r.phoneNumber === w.phoneNumber);
        if (row && row.isPrimary !== (primary?.phoneNumber === w.phoneNumber)) {
          await ctx.db.patch(row._id, { isPrimary: primary?.phoneNumber === w.phoneNumber });
        }
      } else {
        await ctx.db.insert("contactPhones", {
          contactId,
          phoneNumber: w.phoneNumber,
          isPrimary: primary?.phoneNumber === w.phoneNumber,
        });
      }
    }
  },
});

/**
 * §20.6 merge execution. The plan is built by pure mergeLogic (Vitest-tested);
 * this mutation applies it atomically and logs to audit_log with both contact
 * IDs in metadata.
 */
export const merge = mutation({
  args: {
    survivorId: v.id("contacts"),
    otherId: v.id("contacts"),
    // Per-field explicit resolutions for conflicting single-value fields.
    resolutions: v.optional(
      v.object({
        name: v.optional(v.string()),
        timezone: v.optional(v.string()),
        company: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await userIdOrThrow(ctx);
    const survivor = await ctx.db.get(args.survivorId);
    const other = await ctx.db.get(args.otherId);
    if (!survivor || !other || survivor.userId !== userId || other.userId !== userId) {
      throw new Error("Not found");
    }
    // §20.6 — the OLDER contact survives, regardless of which id the UI passed.
    const a = pickSurvivor(survivor, other);
    const b = a._id === survivor._id ? other : survivor;
    const plan: MergePlan = buildMergePlan(a, b);
    const resolutions = args.resolutions ?? {};

    // §23.3 — capture the absorbed contact's subtree BEFORE anything moves, so
    // Undo can restore B and re-point its rows back. The same query feeds both
    // the snapshot's re-point list and the actual re-point below.
    const repoint: { table: string; field: string; entityType?: string; ids: string[] }[] = [];
    for (const { table, field } of plan.repoint) {
      const rows = await (ctx.db as any)
        .query(table)
        .filter((q: any) => q.eq(q.field(field), b._id))
        .collect();
      repoint.push({ table, field, ids: rows.map((r: any) => r._id) });
      for (const row of rows) {
        await (ctx.db as any).patch(row._id, { [field]: a._id });
      }
    }
    // contact-type custom field values (entityId stored as string).
    const cfvRows = await ctx.db
      .query("customFieldValues")
      .withIndex("by_entity", (q) => q.eq("entityId", b._id))
      .collect();
    const bCfvIds = cfvRows.filter((r) => r.entityType === "contact").map((r) => r._id);
    for (const row of cfvRows) {
      if (row.entityType === "contact") await ctx.db.patch(row._id, { entityId: a._id });
    }
    repoint.push({ table: "customFieldValues", field: "entityId", entityType: "contact", ids: bCfvIds });

    await purgeExpiredUndo(ctx, userId);
    const undoId = await ctx.db.insert("contactUndo", {
      userId,
      kind: "merge",
      label: b.name,
      snapshot: serializeSnapshot({
        kind: "merge",
        survivorId: a._id,
        survivorFields: {
          name: a.name,
          company: a.company,
          timezone: a.timezone,
          tags: a.tags,
        },
        absorbedContact: stripForInsert(b),
        repoint,
      } satisfies MergeSnapshot),
      createdAt: Date.now(),
    });

    // §20.6 — explicit per-field choices; fall back to survivor's value.
    const fields: Record<string, unknown> = {
      name: resolutions.name ?? conflictDefault(plan, "name", a.name),
      company: resolutions.company ?? conflictDefault(plan, "company", a.company),
      timezone: resolutions.timezone ?? conflictDefault(plan, "timezone", a.timezone),
      tags: plan.mergedTags,
    };
    await ctx.db.patch(a._id, fields);

    await writeAuditLog(ctx, {
      userId,
      action: "contact.merge",
      entityType: "contact",
      entityId: a._id,
      metadata: { survivorId: a._id, mergedId: b._id, resolutions },
    });

    // Cascade delete B (its emails/phones rows were re-pointed, not deleted).
    await ctx.db.delete(b._id);
    return { survivorId: a._id, undoId };
  },
});

function conflictDefault(
  plan: MergePlan,
  field: "name" | "timezone" | "company",
  fallback: string | undefined,
): string | undefined {
  return plan.conflicts.find((c) => c.field === field)?.survivorValue ?? fallback;
}

/**
 * §23.3 — contact delete is undoable: the full subtree is snapshotted first,
 * then cascade-deleted; Undo re-inserts everything (fresh ids, FKs remapped).
 * The cascade now also removes the contact's invoices + line items — previously
 * they were orphaned (invisible in every list but still occupying rows), which
 * made "everything attached" untrue; deleting them makes the dialog's wording
 * honest, and the snapshot makes it reversible.
 */
export const remove = mutation({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, { contactId }) => {
    const userId = await userIdOrThrow(ctx);
    const contact = await ctx.db.get(contactId);
    if (!contact || contact.userId !== userId) throw new Error("Not found");

    const projects = await ctx.db
      .query("projects")
      .withIndex("by_contact", (q) => q.eq("contactId", contactId))
      .collect();

    // §23.3 — snapshot first so the cascade below is reversible.
    const snap = await buildDeleteSnapshot(ctx, contact, projects);
    await purgeExpiredUndo(ctx, userId);
    const undoId = await ctx.db.insert("contactUndo", {
      userId,
      kind: "delete",
      label: contact.name,
      snapshot: serializeSnapshot(snap),
      createdAt: Date.now(),
    });

    for (const p of projects) {
      const notes = await ctx.db
        .query("notes")
        .withIndex("by_project", (q) => q.eq("projectId", p._id))
        .collect();
      for (const n of notes) await ctx.db.delete(n._id);
      const links = await ctx.db
        .query("projectRepos")
        .withIndex("by_project", (q) => q.eq("projectId", p._id))
        .collect();
      for (const l of links) await ctx.db.delete(l._id);
      const cfv = await ctx.db
        .query("customFieldValues")
        .withIndex("by_entity", (q) => q.eq("entityId", p._id))
        .collect();
      for (const row of cfv) await ctx.db.delete(row._id);
      const invs = await ctx.db
        .query("invoices")
        .withIndex("by_project", (q) => q.eq("projectId", p._id))
        .collect();
      for (const inv of invs) {
        const items = await ctx.db
          .query("invoiceLineItems")
          .withIndex("by_invoice", (q) => q.eq("invoiceId", inv._id))
          .collect();
        for (const li of items) await ctx.db.delete(li._id);
        await ctx.db.delete(inv._id);
      }
      await ctx.db.delete(p._id);
    }
    for (const table of ["contactEmails", "contactPhones", "notes", "messages", "documents", "calendarEvents", "followUpReminders", "timelineEvents"] as const) {
      const rows = await (ctx.db as any)
        .query(table)
        .withIndex("by_contact", (q: any) => q.eq("contactId", contactId))
        .collect();
      for (const row of rows) await (ctx.db as any).delete(row._id);
    }
    const cfv = await ctx.db
      .query("customFieldValues")
      .withIndex("by_entity", (q) => q.eq("entityId", contactId))
      .collect();
    for (const row of cfv) await ctx.db.delete(row._id);

    await writeAuditLog(ctx, {
      userId,
      action: "contact.delete",
      entityType: "contact",
      entityId: contactId,
      metadata: { name: contact.name },
    });
    await ctx.db.delete(contactId);
    return { undoId, name: contact.name };
  },
});

/**
 * §23.3 — full-subtree snapshot of a contact about to be cascade-deleted.
 * Every row is captured exactly once: rows carrying a projectId (documents,
 * timeline events, notes) are owned by their project group, everything else by
 * the contact group. Raw rows keep _id (the old→new mapping key); restore
 * strips it on insert.
 */
async function buildDeleteSnapshot(
  ctx: MutationCtx,
  contact: RowData & { _id: GenericId<"contacts"> },
  projects: RowData[],
): Promise<DeleteSnapshot> {
  const snap: DeleteSnapshot = {
    kind: "delete",
    contact: { ...contact },
    emails: [],
    phones: [],
    messages: [],
    documents: [],
    calendarEvents: [],
    followUpReminders: [],
    timelineEvents: [],
    contactNotes: [],
    contactCfv: [],
    projects: [],
  };
  const contactId = contact._id;
  const captured = new Set<string>();

  const contactTables: { table: string; key: keyof DeleteSnapshot }[] = [
    { table: "contactEmails", key: "emails" },
    { table: "contactPhones", key: "phones" },
    { table: "messages", key: "messages" },
    { table: "documents", key: "documents" },
    { table: "calendarEvents", key: "calendarEvents" },
    { table: "followUpReminders", key: "followUpReminders" },
    { table: "timelineEvents", key: "timelineEvents" },
    { table: "notes", key: "contactNotes" },
  ];
  for (const { table, key } of contactTables) {
    const rows = await (ctx.db as any)
      .query(table)
      .withIndex("by_contact", (q: any) => q.eq("contactId", contactId))
      .collect();
    for (const row of rows) {
      captured.add(row._id);
      (snap[key] as RowData[]).push(row);
    }
  }
  const cfv = await ctx.db
    .query("customFieldValues")
    .withIndex("by_entity", (q) => q.eq("entityId", contactId))
    .collect();
  for (const row of cfv) {
    if (row.entityType !== "contact") continue;
    captured.add(row._id);
    snap.contactCfv.push(row);
  }

  for (const p of projects) {
    const proj: DeleteSnapshot["projects"][number] = {
      data: p,
      notes: [],
      cfv: [],
      links: [],
      invoices: [],
    };
    const pId = p._id as string;
    const notes = await ctx.db
      .query("notes")
      .withIndex("by_project", (q) => q.eq("projectId", pId as any))
      .collect();
    for (const n of notes) {
      if (captured.has(n._id)) continue; // already captured via by_contact
      captured.add(n._id);
      proj.notes.push(n);
    }
    const links = await ctx.db
      .query("projectRepos")
      .withIndex("by_project", (q) => q.eq("projectId", pId as any))
      .collect();
    for (const l of links) {
      captured.add(l._id);
      proj.links.push(l);
    }
    const pcfv = await ctx.db
      .query("customFieldValues")
      .withIndex("by_entity", (q) => q.eq("entityId", pId as any))
      .collect();
    for (const row of pcfv) {
      if (row.entityType !== "project") continue;
      captured.add(row._id);
      proj.cfv.push(row);
    }
    const invs = await ctx.db
      .query("invoices")
      .withIndex("by_project", (q) => q.eq("projectId", pId as any))
      .collect();
    for (const inv of invs) {
      const items = await ctx.db
        .query("invoiceLineItems")
        .withIndex("by_invoice", (q) => q.eq("invoiceId", inv._id))
        .collect();
      captured.add(inv._id);
      for (const li of items) captured.add(li._id);
      proj.invoices.push({ data: inv, lineItems: items });
    }
    snap.projects.push(proj);
  }
  return snap;
}

/**
 * §23.3 — restore a delete from its snapshot: re-insert the contact, its
 * projects, and its invoices first (fresh ids become the FK maps), then replay
 * the ordered restore plan (children with remapped FKs).
 */
export const undoDelete = mutation({
  args: { undoId: v.id("contactUndo") },
  handler: async (ctx, { undoId }) => {
    const userId = await userIdOrThrow(ctx);
    const row = await ctx.db.get(undoId);
    if (!row || row.userId !== userId) throw new Error("Not found");
    if (row.kind !== "delete") throw new Error("Wrong undo type");
    if (Date.now() - row.createdAt > UNDO_TTL_MS) {
      await ctx.db.delete(undoId);
      throw new Error("Undo window expired");
    }
    const snap = deserializeSnapshot<DeleteSnapshot>(row.snapshot);

    // Parents first so the old→new maps exist for the child replay. The
    // snapshot rows came from the DB, so they carry every required field.
    const contactId = await ctx.db.insert("contacts", stripForInsert(snap.contact) as any);
    const projectIds = new Map<string, string>();
    for (const p of snap.projects) {
      const newId = await ctx.db.insert("projects", {
        ...(stripForInsert(p.data) as any),
        contactId,
      });
      projectIds.set(p.data._id as string, newId);
    }
    const invoiceIds = new Map<string, string>();
    for (const p of snap.projects) {
      const mappedProject = projectIds.get(p.data._id as string);
      if (!mappedProject) continue;
      for (const inv of p.invoices) {
        const newId = await ctx.db.insert("invoices", {
          ...(stripForInsert(inv.data) as any),
          projectId: mappedProject as any,
        });
        invoiceIds.set(inv.data._id as string, newId);
      }
    }

    const ops = planDeleteRestore(snap, { contactId, projectIds, invoiceIds });
    for (const op of ops) {
      if (op.table === "contacts" || op.table === "projects" || op.table === "invoices") {
        continue; // parents inserted above
      }
      await (ctx.db as any).insert(op.table, op.data);
    }

    await writeAuditLog(ctx, {
      userId,
      action: "contact.delete.undone",
      entityType: "contact",
      entityId: contactId,
      metadata: { restoredName: row.label },
    });
    await ctx.db.delete(undoId);
    return { contactId };
  },
});

/**
 * §23.3 — undo a merge: restore the absorbed contact's row (fresh id), re-point
 * every FK row the merge moved back to it, and restore the survivor's pre-merge
 * name/company/timezone/tags. Each re-point is guarded: the row must still
 * exist and still point at the survivor (the user may have moved it since).
 */
export const undoMerge = mutation({
  args: { undoId: v.id("contactUndo") },
  handler: async (ctx, { undoId }) => {
    const userId = await userIdOrThrow(ctx);
    const row = await ctx.db.get(undoId);
    if (!row || row.userId !== userId) throw new Error("Not found");
    if (row.kind !== "merge") throw new Error("Wrong undo type");
    if (Date.now() - row.createdAt > UNDO_TTL_MS) {
      await ctx.db.delete(undoId);
      throw new Error("Undo window expired");
    }
    const snap = deserializeSnapshot<MergeSnapshot>(row.snapshot);

    const restoredId = await ctx.db.insert("contacts", stripForInsert(snap.absorbedContact) as any);
    for (const op of planMergeUndo(snap, restoredId)) {
      if (op.table === "contacts") {
        // Survivor's own pre-merge fields — always safe to restore.
        const survivor = await (ctx.db as any).get(op.id);
        if (survivor && survivor.userId === userId) await (ctx.db as any).patch(op.id, op.data);
        continue;
      }
      const existing = await (ctx.db as any).get(op.id);
      if (!existing) continue; // row deleted since the merge
      if (op.table === "customFieldValues") {
        if (existing.entityType !== "contact" || existing.entityId !== snap.survivorId) continue;
      } else if (op.field && existing[op.field] !== snap.survivorId) {
        continue; // already re-pointed elsewhere by the user
      }
      await (ctx.db as any).patch(op.id, op.data);
    }

    await writeAuditLog(ctx, {
      userId,
      action: "contact.merge.undone",
      entityType: "contact",
      entityId: restoredId,
      metadata: { survivorId: snap.survivorId, restoredName: row.label },
    });
    await ctx.db.delete(undoId);
    return { contactId: restoredId };
  },
});
