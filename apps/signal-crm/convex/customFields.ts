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

export const listDefinitions = query({
  args: {},
  handler: async (ctx) => {
    const userId = await userIdOrThrow(ctx);
    return await ctx.db
      .query("customFieldDefinitions")
      .withIndex("by_user_entity", (q) => q.eq("userId", userId))
      .collect();
  },
});

export const createDefinition = mutation({
  args: {
    entityType: v.union(v.literal("contact"), v.literal("project")),
    label: v.string(),
    fieldType: v.union(v.literal("text"), v.literal("number"), v.literal("date"), v.literal("select")),
    options: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const userId = await userIdOrThrow(ctx);
    if (args.fieldType === "select") {
      const options = (args.options ?? []).map((o) => o.trim()).filter(Boolean);
      if (options.length === 0) {
        throw new Error("A select field needs at least one option.");
      }
      return await ctx.db.insert("customFieldDefinitions", {
        userId,
        entityType: args.entityType,
        label: args.label.trim(),
        fieldType: args.fieldType,
        options,
        createdAt: Date.now(),
      });
    }
    return await ctx.db.insert("customFieldDefinitions", {
      userId,
      entityType: args.entityType,
      label: args.label.trim(),
      fieldType: args.fieldType,
      createdAt: Date.now(),
    });
  },
});

/**
 * §23.1 — deleting a definition that has live values is destructive (values are
 * gone with it). Confirm-before-fire in the UI; the mutation guards nothing
 * extra since a definition delete is genuinely meant to cascade.
 */
export const deleteDefinition = mutation({
  args: { definitionId: v.id("customFieldDefinitions") },
  handler: async (ctx, { definitionId }) => {
    const userId = await userIdOrThrow(ctx);
    const def = await ctx.db.get(definitionId);
    if (!def || def.userId !== userId) throw new Error("Not found");
    const values = await ctx.db
      .query("customFieldValues")
      .withIndex("by_definition", (q) => q.eq("definitionId", definitionId))
      .collect();
    for (const row of values) await ctx.db.delete(row._id);
    await writeAuditLog(ctx, {
      userId,
      action: "custom_field_definition.delete",
      entityType: "customFieldDefinitions",
      entityId: definitionId,
      metadata: { label: def.label, entityType: def.entityType },
    });
    await ctx.db.delete(definitionId);
  },
});

/** All values for one entity (contact or project). */
export const listValues = query({
  args: { entityType: v.union(v.literal("contact"), v.literal("project")), entityId: v.string() },
  handler: async (ctx, { entityType, entityId }) => {
    const userId = await userIdOrThrow(ctx);
    const defs = await ctx.db
      .query("customFieldDefinitions")
      .withIndex("by_user_entity", (q) => q.eq("userId", userId).eq("entityType", entityType))
      .collect();
    const rows = await ctx.db
      .query("customFieldValues")
      .withIndex("by_entity", (q) => q.eq("entityId", entityId))
      .collect();
    // Join definition → value; only the user's own definitions render.
    const byDef = new Map(rows.map((r) => [r.definitionId, r]));
    return defs.map((d) => ({
      definition: d,
      value: byDef.get(d._id)?.fieldValue ?? null,
      valueId: byDef.get(d._id)?._id ?? null,
    }));
  },
});

export const setValue = mutation({
  args: {
    definitionId: v.id("customFieldDefinitions"),
    entityType: v.union(v.literal("contact"), v.literal("project")),
    entityId: v.string(),
    fieldValue: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await userIdOrThrow(ctx);
    const def = await ctx.db.get(args.definitionId);
    if (!def || def.userId !== userId || def.entityType !== args.entityType) {
      throw new Error("Not found");
    }
    // Ownership of the TARGET entity too — the definition being ours is not
    // enough. Projects have no userId; resolve via their owning contact.
    if (args.entityType === "contact") {
      const contact = await ctx.db.get(args.entityId as GenericId<"contacts">);
      if (!contact || contact.userId !== userId) throw new Error("Not found");
    } else {
      const project = await ctx.db.get(args.entityId as GenericId<"projects">);
      if (!project) throw new Error("Not found");
      const contact = await ctx.db.get(project.contactId);
      if (!contact || contact.userId !== userId) throw new Error("Not found");
    }
    const existing = await ctx.db
      .query("customFieldValues")
      .withIndex("by_entity", (q) => q.eq("entityId", args.entityId))
      .filter((q) => q.eq(q.field("definitionId"), args.definitionId))
      .first();
    if (existing) {
      if (args.fieldValue === "") {
        await ctx.db.delete(existing._id);
      } else {
        await ctx.db.patch(existing._id, { fieldValue: args.fieldValue });
      }
    } else if (args.fieldValue !== "") {
      await ctx.db.insert("customFieldValues", {
        definitionId: args.definitionId,
        entityType: args.entityType,
        entityId: args.entityId,
        fieldValue: args.fieldValue,
      });
    }
  },
});
