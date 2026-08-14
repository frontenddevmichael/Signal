import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { GenericId } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { writeTimelineEvent } from "./timeline";

async function userIdOrThrow(ctx: QueryCtx | MutationCtx): Promise<GenericId<"users">> {
  const userId = await getAuthUserId(ctx as any);
  if (userId === null) throw new Error("Not signed in");
  return userId;
}

/**
 * §18 write-path rule in action: creating a note MUST also write its timeline
 * event via the shared helper — same transaction, one shared function.
 */
export const create = mutation({
  args: {
    contactId: v.id("contacts"),
    projectId: v.optional(v.id("projects")),
    body: v.string(), // rich-text HTML
  },
  handler: async (ctx, args) => {
    const userId = await userIdOrThrow(ctx);
    const contact = await ctx.db.get(args.contactId);
    if (!contact || contact.userId !== userId) throw new Error("Not found");
    if (args.projectId) {
      const project = await ctx.db.get(args.projectId);
      if (!project || project.contactId !== args.contactId) throw new Error("Not found");
    }
    const now = Date.now();
    const noteId = await ctx.db.insert("notes", {
      contactId: args.contactId,
      projectId: args.projectId,
      body: args.body,
      createdAt: now,
    });
    await writeTimelineEvent(ctx, {
      contactId: args.contactId,
      projectId: args.projectId,
      type: "note",
      sourceTable: "notes",
      sourceId: noteId,
      occurredAt: now,
    });
  },
});

export const remove = mutation({
  args: { noteId: v.id("notes") },
  handler: async (ctx, { noteId }) => {
    const userId = await userIdOrThrow(ctx);
    const note = await ctx.db.get(noteId);
    if (!note) throw new Error("Not found");
    const contact = await ctx.db.get(note.contactId);
    if (!contact || contact.userId !== userId) throw new Error("Not found");
    await ctx.db.delete(noteId);
    // Timeline row is a projection of the note; removing it with the note keeps
    // the feed truthful. (Audit: note delete is a routine edit, not §21.8 scope.)
    const tle = await ctx.db
      .query("timelineEvents")
      .withIndex("by_contact", (q) => q.eq("contactId", contact._id))
      .filter((q) => q.and(q.eq(q.field("sourceTable"), "notes"), q.eq(q.field("sourceId"), noteId)))
      .first();
    if (tle) await ctx.db.delete(tle._id);
  },
});

/** For rendering note bodies in the timeline (§14) — notes are referenced by
 * timelineEvents.sourceId. */
export const getById = query({
  args: { noteId: v.id("notes") },
  handler: async (ctx, { noteId }) => {
    const userId = await userIdOrThrow(ctx);
    const note = await ctx.db.get(noteId);
    if (!note) return null;
    const contact = await ctx.db.get(note.contactId);
    if (!contact || contact.userId !== userId) return null;
    return note;
  },
});

export const listByContact = query({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, { contactId }) => {
    const userId = await userIdOrThrow(ctx);
    const contact = await ctx.db.get(contactId);
    if (!contact || contact.userId !== userId) return null;
    return await ctx.db
      .query("notes")
      .withIndex("by_contact", (q) => q.eq("contactId", contactId))
      .order("desc")
      .take(100);
  },
});
