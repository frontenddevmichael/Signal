import { query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { GenericId } from "convex/values";

/**
 * §18 write-path enforcement (locked): EVERY mutation that touches messages,
 * notes, invoices, calendar_events, or repo_activity must call writeTimelineEvent
 * in the same transaction. This is the ONLY write path to timeline_events —
 * never duplicated inline. Called directly (not via ctx.runMutation) so it runs
 * inside the caller's transaction.
 */
export type TimelineEventType =
  | "email"
  | "whatsapp"
  | "note"
  | "call"
  | "invoice"
  | "repo_activity"
  | "document";

export async function writeTimelineEvent(
  ctx: MutationCtx,
  args: {
    contactId: string;
    projectId?: string;
    type: TimelineEventType;
    sourceTable: string;
    sourceId: string;
    occurredAt: number;
  },
): Promise<void> {
  // contactId is a v.id("contacts") from every caller; cast past the generic
  // string arg to the branded id type the DB requires (Id === GenericId).
  const contactId = args.contactId as GenericId<"contacts">;
  const projectId = args.projectId ? (args.projectId as GenericId<"projects">) : undefined;
  await ctx.db.insert("timelineEvents", {
    contactId,
    ...(projectId ? { projectId } : {}),
    type: args.type,
    sourceTable: args.sourceTable,
    sourceId: args.sourceId,
    occurredAt: args.occurredAt,
  });
}

/**
 * A contact's unified feed (§14): chronological, source-agnostic, one scroll.
 */
export const getForContact = query({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, { contactId }) => {
    return await ctx.db
      .query("timelineEvents")
      .withIndex("by_contact", (q) => q.eq("contactId", contactId))
      .order("desc")
      .take(200);
  },
});
