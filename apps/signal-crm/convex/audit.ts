import type { MutationCtx } from "./_generated/server";
import type { GenericId } from "convex/values";

/**
 * §21.8 — audit_log covers destructive and financial actions specifically
 * (invoice status changes, contact merges, account deletion, integration
 * disconnects), not routine reads or minor edits. One shared write helper so
 * every caller formats metadata consistently.
 */
export async function writeAuditLog(
  ctx: MutationCtx,
  args: {
    userId: GenericId<"users">;
    action: string;
    entityType: string;
    entityId: string;
    metadata?: unknown;
  },
): Promise<void> {
  await ctx.db.insert("auditLog", {
    userId: args.userId,
    action: args.action,
    entityType: args.entityType,
    entityId: args.entityId,
    metadata: args.metadata ?? {},
    occurredAt: Date.now(),
  });
}
