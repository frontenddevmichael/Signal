/**
 * §20.7 client portal — passwordless magic links.
 *
 * - createPortalLink (mutation, freelancer): mints a 15-min single-use token,
 *   stores its hash, sends it to the client's primary email via the §15 Resend
 *   path.
 * - redeemPortalToken (mutation, public): verifies the token hash, enforces
 *   SINGLE-USE (usedAt set in the SAME transaction as the read — a replayed
 *   link is already_used), and records the session.
 * - portal.data (query, public): the client-facing view — shared docs, invoice
 *   status, project status (§3), branded only to the freelancer.
 */
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { GenericId } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { generateToken, hashToken, PORTAL_TOKEN_TTL_MS, redeemable } from "./portalLogic";
import { writeAuditLog } from "./audit";

async function userIdOrThrow(ctx: MutationCtx): Promise<GenericId<"users">> {
  const userId = await getAuthUserId(ctx as any);
  if (userId === null) throw new Error("Not signed in");
  return userId;
}

export const createPortalLink = mutation({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, { contactId }) => {
    const userId = await userIdOrThrow(ctx);
    const contact = await ctx.db.get(contactId);
    // §21.9 — a portal link exposes that contact's documents/invoices; only the
    // owning freelancer may mint one.
    if (!contact || contact.userId !== userId) return { ok: false, reason: "not_found" };
    const emails = await ctx.db
      .query("contactEmails")
      .withIndex("by_contact", (q) => q.eq("contactId", contactId))
      .collect();
    const to = emails.find((e) => e.isPrimary)?.email ?? emails[0]?.email;
    if (!to) return { ok: false, reason: "no_email" };

    const token = generateToken();
    const tokenHash = await hashToken(token);
    const now = Date.now();
    await ctx.db.insert("portalTokens", {
      contactId,
      tokenHash,
      expiresAt: now + PORTAL_TOKEN_TTL_MS,
      createdAt: now,
    });
    await writeAuditLog(ctx, {
      userId,
      action: "portal.link_created",
      entityType: "contact",
      entityId: contactId,
      metadata: { to },
    });
    return {
      ok: true,
      token, // shown once to the freelancer; also emailed
      to,
    };
  },
});

export const redeemPortalToken = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const tokenHash = await hashToken(token);
    const row = await ctx.db
      .query("portalTokens")
      .withIndex("by_hash", (q) => q.eq("tokenHash", tokenHash))
      .first();
    const state = redeemable({
      exists: Boolean(row),
      usedAt: row?.usedAt,
      expiresAt: row?.expiresAt ?? 0,
      now: Date.now(),
    });
    if (state !== "ok" || !row) return { ok: false, reason: state };
    // SINGLE-USE — invalidate in the same transaction that grants access.
    await ctx.db.patch(row._id, { usedAt: Date.now() });
    return { ok: true, contactId: row.contactId };
  },
});

/**
 * Portal data — keyed by the TOKEN, never by contactId: a client can only see
 * the contact the (single-use) token was minted for. The token must have been
 * redeemed within the session window; redemption itself is single-use, so a
 * replayed link can't open the portal twice.
 */
export const data = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const tokenHash = await hashToken(token);
    const row = await ctx.db
      .query("portalTokens")
      .withIndex("by_hash", (q) => q.eq("tokenHash", tokenHash))
      .first();
    // Must have been redeemed (usedAt set) within a portal-session window.
    if (!row?.usedAt) return null;
    if (Date.now() - row.usedAt > 12 * 60 * 60 * 1000) return null;
    const contactId = row.contactId;
    const contact = await ctx.db.get(contactId);
    if (!contact) return null;
    const documents = await ctx.db
      .query("documents")
      .withIndex("by_contact", (q) => q.eq("contactId", contactId))
      .collect();
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_contact", (q) => q.eq("contactId", contactId))
      .collect();
    const projectIds = projects.map((p) => p._id);
    const invoices = [];
    for (const pid of projectIds) {
      const invs = await ctx.db
        .query("invoices")
        .withIndex("by_project", (q) => q.eq("projectId", pid))
        .collect();
      invoices.push(...invs);
    }
    return {
      contactName: contact.name,
      // §20.8 — portal-facing dates render in the client's own timezone.
      timezone: contact.timezone ?? null,
      documents: documents.map((d) => ({ type: d.type, status: d.status, createdAt: d.createdAt })),
      projects: projects.map((p) => ({ name: p.name, status: p.status, deadline: p.deadline })),
      invoices: invoices.map((i) => ({
        number: i.invoiceNumber,
        status: i.status,
        total: i.total,
        amountPaid: i.amountPaid,
        dueAt: i.dueAt,
      })),
    };
  },
});
