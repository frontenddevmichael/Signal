import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { GenericId } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { monthRange } from "./calendarLogic";
import type { CalendarEvent } from "./calendarLogic";
import { deriveInvoiceStatus } from "./invoiceLogic";

async function userIdOrThrow(ctx: QueryCtx): Promise<GenericId<"users">> {
  const userId = await getAuthUserId(ctx as any);
  if (userId === null) throw new Error("Not signed in");
  return userId;
}

/**
 * Calendar screen (§22.7 layout reference) — one month of actionable dates:
 * project deadlines, pending follow-up due dates, invoice due dates that still
 * carry money (paid/void/refunded excluded; status derived per §18), and
 * contact-matched meetings (calendarEvents, §6/§12). Events are grouped
 * client-side onto the Monday-first grid by dayKey.
 */
export const month = query({
  args: {
    // JS convention: month 0-11. monthRange handles the boundaries.
    year: v.number(),
    month: v.number(),
  },
  handler: async (ctx, { year, month }): Promise<CalendarEvent[]> => {
    const userId = await userIdOrThrow(ctx);
    const { start, end } = monthRange(year, month);
    const now = Date.now();

    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const contactById = new Map(contacts.map((c) => [c._id, c]));

    const events: CalendarEvent[] = [];

    // §3 project deadlines.
    const projects = await ctx.db.query("projects").collect();
    for (const p of projects) {
      if (!p.deadline || p.deadline < start || p.deadline >= end) continue;
      const contact = contactById.get(p.contactId);
      if (!contact) continue;
      events.push({
        id: `deadline-${p._id}`,
        kind: "deadline",
        title: p.name,
        subtitle: contact.name,
        at: p.deadline,
        contactId: p.contactId,
        status: p.deadline < now ? "overdue" : "upcoming",
      });
    }

    // §3 follow-up due dates (pending only — done/dismissed are resolved).
    const reminders = await ctx.db
      .query("followUpReminders")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
    for (const r of reminders) {
      if (r.dueAt < start || r.dueAt >= end) continue;
      const contact = contactById.get(r.contactId);
      if (!contact) continue;
      events.push({
        id: `followup-${r._id}`,
        kind: "followup",
        title: r.reason,
        subtitle: `Follow up · ${contact.name}`,
        at: r.dueAt,
        contactId: r.contactId,
        status: r.dueAt < now ? "overdue" : "upcoming",
      });
    }

    // §18 invoice due dates — still-owed only, status derived (a stored "sent"
    // with amount_paid >= total is truthfully paid and drops off).
    const invoices = await ctx.db.query("invoices").collect();
    for (const inv of invoices) {
      if (!inv.dueAt || inv.dueAt < start || inv.dueAt >= end) continue;
      const project = await ctx.db.get(inv.projectId);
      if (!project) continue;
      const contact = contactById.get(project.contactId);
      if (!contact) continue;
      const status = deriveInvoiceStatus({
        status: inv.status,
        amountPaid: inv.amountPaid,
        amountRefunded: inv.amountRefunded,
        total: inv.total,
        dueAt: inv.dueAt,
        now,
      });
      if (status === "paid" || status === "void" || status === "refunded") continue;
      events.push({
        id: `invoice-${inv._id}`,
        kind: "invoice",
        title: inv.invoiceNumber,
        subtitle: `${contact.name} · ${status}`,
        at: inv.dueAt,
        invoiceId: inv._id,
        status: status === "overdue" ? "overdue" : status === "partially_paid" ? "partial" : "upcoming",
      });
    }

    // §6 meetings — synced calendarEvents matched to a contact. Anchored on the
    // start day; always the quiet register (a past meeting isn't "overdue", it
    // happened). The subtitle carries the local time range.
    const calendarEvents = await ctx.db.query("calendarEvents").collect();
    for (const ev of calendarEvents) {
      if (ev.startTime < start || ev.startTime >= end) continue;
      const contact = ev.contactId ? contactById.get(ev.contactId) : undefined;
      if (!contact) continue;
      events.push({
        id: `meeting-${ev._id}`,
        kind: "meeting",
        title: ev.title,
        subtitle: `${contact.name} · ${formatTimeRange(ev.startTime, ev.endTime)}`,
        at: ev.startTime,
        contactId: ev.contactId ?? undefined,
        status: "upcoming",
      });
    }

    events.sort((a, b) => a.at - b.at);
    return events;
  },
});

/** "14:00 – 15:00" in the viewer's local timezone. */
function formatTimeRange(startMs: number, endMs: number): string {
  const fmt = (ts: number) =>
    new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${fmt(startMs)} – ${fmt(endMs)}`;
}
