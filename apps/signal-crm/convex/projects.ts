import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { GenericId } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { writeAuditLog } from "./audit";

async function userIdOrThrow(ctx: QueryCtx | MutationCtx): Promise<GenericId<"users">> {
  const userId = await getAuthUserId(ctx as any);
  if (userId === null) throw new Error("Not signed in");
  return userId;
}

async function projectBelongsToUser(
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

export const listByContact = query({
  // "_" is a client sentinel (InvoiceForm calls this unconditionally).
  args: { contactId: v.union(v.id("contacts"), v.literal("_")) },
  handler: async (ctx, { contactId }) => {
    if (contactId === "_") return [];
    const userId = await userIdOrThrow(ctx);
    const contact = await ctx.db.get(contactId);
    if (!contact || contact.userId !== userId) return null;
    return await ctx.db
      .query("projects")
      .withIndex("by_contact", (q) => q.eq("contactId", contactId))
      .collect();
  },
});

/** Command palette — every project with its owning contact name, one payload. */
export const listAll = query({
  handler: async (ctx) => {
    const userId = await userIdOrThrow(ctx);
    const projects = await ctx.db.query("projects").collect();
    const rows: Array<{
      _id: string;
      name: string;
      status: "active" | "closed";
      contactId: string;
      contactName: string;
    }> = [];
    for (const p of projects) {
      const contact = await ctx.db.get(p.contactId);
      if (!contact || contact.userId !== userId) continue;
      rows.push({
        _id: p._id,
        name: p.name,
        status: p.status,
        contactId: p.contactId,
        contactName: contact.name,
      });
    }
    return rows;
  },
});

export const create = mutation({
  args: {
    contactId: v.id("contacts"),
    name: v.string(),
    status: v.union(v.literal("active"), v.literal("closed")),
    deadline: v.optional(v.number()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await userIdOrThrow(ctx);
    const contact = await ctx.db.get(args.contactId);
    if (!contact || contact.userId !== userId) throw new Error("Not found");
    return await ctx.db.insert("projects", {
      contactId: args.contactId,
      name: args.name.trim(),
      status: args.status,
      deadline: args.deadline,
      description: args.description,
      createdAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
    status: v.union(v.literal("active"), v.literal("closed")),
    deadline: v.optional(v.number()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await userIdOrThrow(ctx);
    const owned = await projectBelongsToUser(ctx, userId, args.projectId);
    if (!owned) throw new Error("Not found");
    await ctx.db.patch(args.projectId, {
      name: args.name.trim(),
      status: args.status,
      deadline: args.deadline,
      description: args.description,
    });
  },
});

export const remove = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const userId = await userIdOrThrow(ctx);
    const owned = await projectBelongsToUser(ctx, userId, projectId);
    if (!owned) throw new Error("Not found");
    const notes = await ctx.db
      .query("notes")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    for (const n of notes) await ctx.db.delete(n._id);
    const links = await ctx.db
      .query("projectRepos")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    for (const l of links) await ctx.db.delete(l._id);
    const cfv = await ctx.db
      .query("customFieldValues")
      .withIndex("by_entity", (q) => q.eq("entityId", projectId))
      .collect();
    for (const row of cfv) await ctx.db.delete(row._id);
    await writeAuditLog(ctx, {
      userId,
      action: "project.delete",
      entityType: "project",
      entityId: projectId,
      metadata: { name: owned.project.name, contactId: owned.contact._id },
    });
    await ctx.db.delete(projectId);
  },
});
