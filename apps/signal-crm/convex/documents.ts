import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { GenericId } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

async function userIdOrThrow(ctx: QueryCtx | MutationCtx): Promise<GenericId<"users">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Not signed in");
  return userId;
}

/**
 * §documents — generated proposals/contracts. Documents belong to a contact
 * (optionally a project) and store the rendered body as plain-text paragraphs.
 *
 * create: from the template renderer (client-side, src/lib/documentTemplates)
 * — the mutation only persists. remove: reversible within the undo window —
 * the row snapshot is stored in a per-user undo bucket (same §23.3 shape as
 * contact delete) so an Undo toast can re-insert it.
 */

export const listByContact = query({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, { contactId }) => {
    const userId = await userIdOrThrow(ctx);
    const contact = await ctx.db.get(contactId);
    if (!contact || contact.userId !== userId) throw new Error("Not found");
    const rows = await ctx.db
      .query("documents")
      .withIndex("by_contact", (q) => q.eq("contactId", contactId))
      .collect();
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const create = mutation({
  args: {
    contactId: v.id("contacts"),
    projectId: v.optional(v.id("projects")),
    type: v.union(v.literal("proposal"), v.literal("contract"), v.literal("other")),
    title: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await userIdOrThrow(ctx);
    const contact = await ctx.db.get(args.contactId);
    if (!contact || contact.userId !== userId) throw new Error("Not found");
    if (args.projectId) {
      const project = await ctx.db.get(args.projectId);
      if (!project || project.contactId !== args.contactId) throw new Error("Not found");
    }
    if (!args.title.trim() || !args.content.trim()) throw new Error("Document is empty");
    return await ctx.db.insert("documents", {
      contactId: args.contactId,
      projectId: args.projectId,
      type: args.type,
      provider: "pdf", // generated locally; providerRef is a local placeholder
      providerRef: `gen:${args.type}`,
      title: args.title,
      content: args.content,
      status: "draft",
      createdAt: Date.now(),
    });
  },
});

/** Reversible delete — snapshot row, store in the undo bucket, delete. */
export const remove = mutation({
  args: { documentId: v.id("documents") },
  handler: async (ctx, { documentId }) => {
    const userId = await userIdOrThrow(ctx);
    const row = await ctx.db.get(documentId);
    if (!row) throw new Error("Not found");
    const contact = await ctx.db.get(row.contactId);
    if (!contact || contact.userId !== userId) throw new Error("Not found");

    // §23.3 — snapshot first so the delete is reversible.
    const snap = {
      contactId: row.contactId,
      projectId: row.projectId ?? undefined,
      type: row.type,
      provider: row.provider,
      providerRef: row.providerRef,
      title: row.title ?? undefined,
      content: row.content ?? undefined,
      status: row.status,
      createdAt: row.createdAt,
    };
    const now = Date.now();
    const undoId = await ctx.db.insert("documentUndo", {
      userId,
      label: row.title ?? row.type,
      snapshot: snap,
      createdAt: now,
    });
    await ctx.db.delete(documentId);
    return { undoId };
  },
});

/** Restore a removed document from its undo snapshot. */
export const undoRemove = mutation({
  args: { undoId: v.id("documentUndo") },
  handler: async (ctx, { undoId }) => {
    const userId = await userIdOrThrow(ctx);
    const row = await ctx.db.get(undoId);
    if (!row || row.userId !== userId) throw new Error("Not found");
    if (Date.now() - row.createdAt > 60_000 * 10) {
      await ctx.db.delete(undoId);
      throw new Error("Undo window expired");
    }
    const s = row.snapshot;
    const contact = await ctx.db.get(s.contactId);
    if (!contact) throw new Error("Contact no longer exists");
    await ctx.db.insert("documents", {
      contactId: s.contactId,
      projectId: s.projectId ?? undefined,
      type: s.type,
      provider: s.provider,
      providerRef: s.providerRef,
      title: s.title ?? undefined,
      content: s.content ?? undefined,
      status: s.status,
      createdAt: s.createdAt,
    });
    await ctx.db.delete(undoId);
  },
});
