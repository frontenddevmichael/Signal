import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc, TableNames } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { GenericId } from "convex/values";
import { deriveInvoiceStatus } from "./invoiceLogic";

/**
 * §4 full-data export — one authenticated query returning EVERY row the
 * freelancer owns, assembled server-side so the browser never re-derives
 * schema or scoping. Read-only; the client bundles it into a downloadable
 * archive (settings/ExportSection.tsx).
 *
 * Reconciliation with the approved design (2026-08-16, flagged in the commit):
 * - There is no `meetings` table — meetings are `calendarEvents` rows written
 *   by meetings.ts (`googleEventId: "manual-…"`). They export as part of
 *   calendar_events.json, not a separate file.
 * - The design's `repo_links` maps to two real tables: `repos` (the repo rows)
 *   and `projectRepos` (the link table). Both are exported under their real
 *   names.
 * - Tables the design's file list omitted but decision A ("full dataset")
 *   requires: contactEmails, contactPhones, documents, followUpReminders,
 *   portalTokens, invoiceCounters, auditLog, contactUndo, documentUndo, gmailFilterSetup,
 *   repoActivity. All exported.
 * - apiKeys carries KEY METADATA ONLY (label/created/lastUsed) — keys are
 *   SHA-256 at rest and can never be reconstructed; the manifest states this.
 * - sessions/pushSubscriptions export as metadata rows (no raw credentials
 *   beyond what the schema stores for the push endpoint, which is the user's
 *   own subscription data).
 *
 * Determinstic ordering is applied CLIENT-SIDE by the pure bundle builder
 * (src/lib/export.ts) — the server returns raw rows.
 */
export const all = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");

    const [user, contacts, repos, defs] = await Promise.all([
      ctx.db.get(userId),
      ctx.db.query("contacts").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("repos").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db
        .query("customFieldDefinitions")
        .withIndex("by_user_entity", (q) => q.eq("userId", userId))
        .collect(),
    ]);

    const contactIds = new Set(contacts.map((c) => c._id));
    const defIds = new Set(defs.map((d) => d._id));

    const [
      emails,
      phones,
      notes,
      timelineEvents,
      messages,
      documents,
      calendarEvents,
      followUpReminders,
      projects,
      projectRepos,
      repoActivity,
      invoices,
      invoiceLineItems,
      cfv,
      portalTokens,
      pushSubscriptions,
      sessions,
      apiKeys,
      invoiceCounters,
      auditLog,
      contactUndo,
      documentUndo,
      allFilterSetups,
    ] = await Promise.all([
      contactQ(ctx, "contactEmails", contactIds),
      contactQ(ctx, "contactPhones", contactIds),
      contactQ(ctx, "notes", contactIds),
      contactQ(ctx, "timelineEvents", contactIds),
      ctx.db.query("messages").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      contactQ(ctx, "documents", contactIds),
      contactQ(ctx, "calendarEvents", contactIds),
      contactQ(ctx, "followUpReminders", contactIds),
      contactQ(ctx, "projects", contactIds),
      ctx.db.query("projectRepos").collect(),
      ctx.db.query("repoActivity").collect(),
      ctx.db.query("invoices").collect(),
      ctx.db.query("invoiceLineItems").collect(),
      ctx.db.query("customFieldValues").collect(),
      ctx.db.query("portalTokens").collect(),
      ctx.db.query("pushSubscriptions").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("sessions").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("apiKeys").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("invoiceCounters").collect(),
      ctx.db.query("auditLog").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("contactUndo").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("documentUndo").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("gmailFilterSetup").collect(),
    ]);

    // projectRepos/repoActivity/invoices/line items/cfv/portalTokens have no
    // user-level index — filter to rows owned by this user's subtree.
    const projectIds = new Set(projects.map((p) => p._id));
    const ownedProjectRepos = projectRepos.filter((r) => projectIds.has(r.projectId));
    const projectRepoIds = new Set(ownedProjectRepos.map((r) => r._id));
    const ownedRepoActivity = repoActivity.filter((r) => projectRepoIds.has(r.projectRepoId));
    const ownedInvoices = invoices.filter((i) => projectIds.has(i.projectId));
    const invoiceIds = new Set(ownedInvoices.map((i) => i._id));
    const ownedLineItems = invoiceLineItems.filter((l) => invoiceIds.has(l.invoiceId));
    const ownedCfv = cfv.filter((v) => defIds.has(v.definitionId));
    const ownedPortalTokens = portalTokens.filter(
      (t) => contactIds.has(t.contactId),
    );

    // gmailFilterSetup is keyed by contactEmail with no user index — scope to
    // this user's contact addresses.
    const emailSet = new Set(emails.map((e) => e.email));
    const ownedFilterSetups = allFilterSetups.filter((f) => emailSet.has(f.contactEmail));

    // §18 — invoices carry BOTH the raw counters and the derived status, so
    // the exported record is self-describing (the §18 derivation is applied
    // at read time; a stale stored status must not mislead the export).
    const now = Date.now();
    const ownedInvoicesWithStatus = ownedInvoices.map((inv) => ({
      ...inv,
      derivedStatus: deriveInvoiceStatus({
        status: inv.status,
        amountPaid: inv.amountPaid,
        amountRefunded: inv.amountRefunded,
        total: inv.total,
        dueAt: inv.dueAt,
        now,
      }),
    }));

    return {
      schemaVersion: 1,
      generatedAt: now,
      user: {
        _id: user?._id,
        name: user?.name ?? null,
        email: user?.email ?? null,
        timezone: user?.timezone ?? null,
        themePreference: user?.themePreference ?? null,
        aiTriageEnabled: user?.aiTriageEnabled ?? null,
        createdAt: user?.createdAt ?? null,
      },
      contacts,
      contactEmails: emails,
      contactPhones: phones,
      projects,
      notes,
      timelineEvents,
      messages,
      documents,
      calendarEvents,
      followUpReminders,
      repos,
      projectRepos: ownedProjectRepos,
      repoActivity: ownedRepoActivity,
      invoices: ownedInvoicesWithStatus,
      invoiceLineItems: ownedLineItems,
      customFieldDefinitions: defs,
      customFieldValues: ownedCfv,
      portalTokens: ownedPortalTokens,
      pushSubscriptions,
      sessions,
      apiKeys: apiKeys.map((k) => ({
        _id: k._id,
        label: k.label,
        createdAt: k.createdAt,
        lastUsedAt: k.lastUsedAt ?? null,
        revokedAt: k.revokedAt ?? null,
      })),
      invoiceCounters: invoiceCounters.filter((c) => c.userId === userId),
      auditLog,
      contactUndo,
      documentUndo,
      gmailFilterSetup: ownedFilterSetups,
    };
  },
});

/** Collect every row of a contact-scoped table whose contactId is in the set. */
async function contactQ<TName extends TableNames>(
  ctx: QueryCtx,
  table: TName,
  contactIds: Set<GenericId<"contacts">>,
): Promise<Doc<TName>[]> {
  const rows = await ctx.db.query(table).collect();
  return rows.filter(
    (r) => contactIds.has((r as unknown as { contactId: GenericId<"contacts"> }).contactId),
  );
}