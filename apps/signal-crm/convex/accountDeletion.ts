/**
 * §21.7 account deletion — a real Convex mutation, not a support ticket.
 *
 * Cascades a hard delete across every table scoped to this user, with the two
 * locked exceptions from §18/§21.7:
 *   1. If active (non-draft, non-void, non-refunded) invoices exist, the UI
 *      prompts "export first?" — the mutation refuses unless explicitly
 *      confirmed (exportFirst: true), because destroying financial records a
 *      client may still need is worse than a manual export step.
 *   2. audit_log rows for this account PERSIST as orphaned records (§18
 *      retention exception, stated in the privacy policy).
 */
import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

export const deletionStatus = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return { signedIn: false };
    // Projects scope through contacts (schema: projects.contactId), so derive
    // this user's projects from their contacts first.
    const myContacts = await ctx.db.query("contacts").collect();
    const myContactIds = new Set(myContacts.filter((c) => c.userId === userId).map((c) => c._id));
    const projects = await ctx.db.query("projects").collect();
    const userProjects = new Set(projects.filter((p) => myContactIds.has(p.contactId)).map((p) => p._id));
    const invoices = await ctx.db.query("invoices").collect();
    const active = invoices.filter(
      (i) =>
        userProjects.has(i.projectId) &&
        !["draft", "void", "refunded"].includes(i.status)
    );
    return { signedIn: true, activeInvoices: active.length };
  },
});

export const deleteAccount = mutation({
  args: { exportFirst: v.boolean() },
  handler: async (ctx, { exportFirst }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");

    // Exception 1 — active financial records require explicit export-first.
    const myContacts = await ctx.db.query("contacts").collect();
    const myContactIds = new Set(myContacts.filter((c) => c.userId === userId).map((c) => c._id));
    const projects = await ctx.db.query("projects").collect();
    const userProjects = new Set(projects.filter((p) => myContactIds.has(p.contactId)).map((p) => p._id));
    const invoices = await ctx.db.query("invoices").collect();
    const active = invoices.filter(
      (i) =>
        userProjects.has(i.projectId) &&
        !["draft", "void", "refunded"].includes(i.status)
    );
    if (active.length > 0 && !exportFirst) {
      throw new Error(
        `You have ${active.length} active invoice(s). Export them first, or confirm deletion with exportFirst: true.`
      );
    }

    // Collect every row scoped to this user. FKs hang off contacts/projects,
    // so we resolve those first, then delete child rows bottom-up.
    const contactChildren = [
      "contactEmails",
      "contactPhones",
      "messages",
      "documents",
      "notes",
      "calendarEvents",
      "followUpReminders",
      "customFieldValues",
      "timelineEvents",
      "portalTokens",
    ] as const;
    for (const table of contactChildren) {
      const rows = (await ctx.db.query(table).collect()) as any[];
      for (const r of rows) {
        if (r.contactId && myContactIds.has(r.contactId)) await ctx.db.delete(r._id);
      }
    }
    // Unmatched inbox rows (WhatsApp/email that didn't resolve to a contact)
    // scope by userId with contactId null — delete those too.
    const unmatchedMessages = await ctx.db.query("messages").collect();
    for (const m of unmatchedMessages as any[]) {
      if (!m.contactId && m.userId === userId) await ctx.db.delete(m._id);
    }

    const myProjectIds = new Set(userProjects);
    const projectRepos = (await ctx.db.query("projectRepos").collect()) as any[];
    const myProjectRepoIds = new Set(
      projectRepos.filter((r) => r.projectId && myProjectIds.has(r.projectId)).map((r) => r._id),
    );
    // backfill_jobs hang off project_repos — delete this user's queued jobs
    // BEFORE the projectRepo rows they reference are gone.
    const jobs = await ctx.db.query("backfillJobs").collect();
    for (const j of jobs.filter((j) => myProjectRepoIds.has(j.projectRepoId))) await ctx.db.delete(j._id);

    for (const table of ["projects", "projectRepos", "repoActivity"] as const) {
      const rows = table === "projectRepos" ? projectRepos : ((await ctx.db.query(table).collect()) as any[]);
      for (const r of rows) {
        if (r.projectId && myProjectIds.has(r.projectId)) await ctx.db.delete(r._id);
      }
    }
    // repos scope by userId directly.
    const myRepos = await ctx.db.query("repos").collect();
    for (const r of myRepos.filter((r) => r.userId === userId)) await ctx.db.delete(r._id);

    // gmail_filter_setup rows key by contact EMAIL, not contactId — delete the
    // rows belonging to this user's contacts.
    const filterRows = await ctx.db.query("gmailFilterSetup").collect();
    const myEmails = new Set<string>();
    for (const c of myContacts) {
      const emailRows = await ctx.db
        .query("contactEmails")
        .withIndex("by_contact", (q) => q.eq("contactId", c._id))
        .collect();
      for (const e of emailRows) myEmails.add(e.email);
    }
    for (const f of filterRows.filter((f) => myEmails.has(f.contactEmail))) await ctx.db.delete(f._id);

    for (const i of (invoices as any[]).filter((i: any) => userProjects.has(i.projectId))) {
      const items = (await ctx.db.query("invoiceLineItems").collect()) as any[];
      for (const li of items.filter((li: any) => li.invoiceId === i._id)) await ctx.db.delete(li._id);
      await ctx.db.delete(i._id);
    }

    const counters = (await ctx.db.query("invoiceCounters").collect()) as any[];
    for (const c of counters.filter((c) => c.userId === userId)) await ctx.db.delete(c._id);

    const sessions = await ctx.db.query("sessions").collect();
    for (const s of sessions.filter((s) => s.userId === userId)) await ctx.db.delete(s._id);

    // §12 — VAPID push subscriptions are per-user; clear them so no device keeps
    // a subscription pointing at a deleted account.
    const subs = await ctx.db.query("pushSubscriptions").collect();
    for (const s of subs.filter((s) => s.userId === userId)) await ctx.db.delete(s._id);

    // §23.3 — undo snapshots are user-scoped scratch data; gone with the account.
    const undoRows = await ctx.db.query("contactUndo").collect();
    for (const u of undoRows.filter((u) => u.userId === userId)) await ctx.db.delete(u._id);
    const docUndoRows = await ctx.db.query("documentUndo").collect();
    for (const u of docUndoRows.filter((u) => u.userId === userId)) await ctx.db.delete(u._id);

    const keys = await ctx.db.query("apiKeys").collect();
    for (const k of keys.filter((k) => k.userId === userId)) await ctx.db.delete(k._id);

    const definitions = await ctx.db.query("customFieldDefinitions").collect();
    for (const d of definitions.filter((d) => d.userId === userId)) await ctx.db.delete(d._id);

    const rateLimits = await ctx.db.query("rateLimits").collect();
    for (const r of rateLimits.filter((r) => r.key.startsWith(`user:${userId}`))) {
      await ctx.db.delete(r._id);
    }

    // audit_log PERSISTS by design (§18 retention exception) — log the deletion
    // itself, then delete the user row (orphaning the log).
    await ctx.db.insert("auditLog", {
      userId,
      action: "account.deleted",
      entityType: "user",
      entityId: userId,
      metadata: { exportFirst },
      occurredAt: Date.now(),
    });
    await ctx.db.delete(userId);
    return { deleted: true };
  },
});
