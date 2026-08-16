/**
 * §6/§18 calendar_events write path — the meetings on the calendar screen and
 * the "call" timeline entries. Previously calendarEvents had NO writer at all
 * (the screen read a table nothing populated); this module gives meetings a
 * real producer and satisfies the §18 write-path rule: every calendar_events
 * write calls the shared writeTimelineEvent helper in the same transaction.
 *
 * Meetings are stored in calendarEvents with googleEventId as a manual marker
 * (real Google Calendar sync is a separate feature). They render as the
 * meeting chip on the Calendar month grid, anchored on startTime.
 */
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { GenericId } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { writeTimelineEvent } from "./timeline";
import { writeAuditLog } from "./audit";

async function userIdOrThrow(ctx: QueryCtx | MutationCtx): Promise<GenericId<"users">> {
  const userId = await getAuthUserId(ctx as any);
  if (userId === null) throw new Error("Not signed in");
  return userId;
}

async function ownedContact(ctx: MutationCtx, userId: GenericId<"users">, contactId: GenericId<"contacts">) {
  const contact = await ctx.db.get(contactId);
  if (!contact || contact.userId !== userId) return null;
  return contact;
}

/** All meetings for a contact, newest first, newest-relevant first. */
export const listForContact = query({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, { contactId }) => {
    const userId = await userIdOrThrow(ctx);
    const contact = await ctx.db.get(contactId);
    if (!contact || contact.userId !== userId) return [];
    const rows = await ctx.db
      .query("calendarEvents")
      .withIndex("by_contact", (q) => q.eq("contactId", contactId))
      .order("desc")
      .take(100);
    return rows.map((r) => ({
      _id: r._id,
      title: r.title,
      startTime: r.startTime,
      endTime: r.endTime,
      meetLink: r.meetLink ?? null,
    }));
  },
});

export const createMeeting = mutation({
  args: {
    contactId: v.id("contacts"),
    title: v.string(),
    startTime: v.number(),
    endTime: v.number(),
    meetLink: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await userIdOrThrow(ctx);
    const contact = await ownedContact(ctx, userId, args.contactId);
    if (!contact) throw new Error("Not found");
    const title = args.title.trim();
    if (!title) throw new Error("Meeting needs a title.");
    if (args.endTime <= args.startTime) throw new Error("End time must be after the start time.");
    const eventId = await ctx.db.insert("calendarEvents", {
      contactId: args.contactId,
      // Manual marker — distinguishes local meetings from future Calendar sync.
      googleEventId: `manual-${args.startTime}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      startTime: args.startTime,
      endTime: args.endTime,
      meetLink: args.meetLink?.trim() || undefined,
    });
    // §18 write-path rule — a meeting is the "call" timeline event, same
    // transaction as the calendarEvents insert.
    await writeTimelineEvent(ctx, {
      contactId: args.contactId,
      type: "call",
      sourceTable: "calendarEvents",
      sourceId: eventId,
      occurredAt: args.startTime,
    });
    await writeAuditLog(ctx, {
      userId,
      action: "meeting.create",
      entityType: "calendarEvents",
      entityId: eventId,
      metadata: { title },
    });
    return { eventId };
  },
});

export const removeMeeting = mutation({
  args: { eventId: v.id("calendarEvents") },
  handler: async (ctx, { eventId }) => {
    const userId = await userIdOrThrow(ctx);
    const event = await ctx.db.get(eventId);
    if (!event || event.contactId === undefined) return;
    const contactId = event.contactId;
    const contact = await ownedContact(ctx, userId, contactId);
    if (!contact) throw new Error("Not found");
    // Mirror the note-remove pattern: drop the timeline row the event wrote.
    const timelineRow = await ctx.db
      .query("timelineEvents")
      .withIndex("by_contact", (q) => q.eq("contactId", contactId))
      .filter((q) => q.and(q.eq(q.field("sourceTable"), "calendarEvents"), q.eq(q.field("sourceId"), eventId)))
      .first();
    await ctx.db.delete(eventId);
    if (timelineRow) await ctx.db.delete(timelineRow._id);
    await writeAuditLog(ctx, {
      userId,
      action: "meeting.remove",
      entityType: "calendarEvents",
      entityId: eventId,
      metadata: { title: event.title },
    });
  },
});