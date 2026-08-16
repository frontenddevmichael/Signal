/**
 * §2.7 shell counts — one cheap query for the whole navigation chrome:
 * unmatched inbox messages, due follow-up nudges, and derived-overdue
 * invoices (the topbar "N overdue" chip). Tiny payload (three numbers),
 * reused by the sidebar, the mobile tab bar, and the topbar.
 */
import { query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { nudgeDue } from "./nudgeLogic";
import { deriveInvoiceStatus } from "./invoiceLogic";

export const counts = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return { inbox: 0, followups: 0, overdue: 0, dueSoon: 0 };
    const now = Date.now();

    // §10 general inbox — unmatched inbound messages (same filter as the page).
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const inbox = messages.filter(
      (m) => m.contactId === undefined && m.direction === "inbound"
    ).length;

    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    // §3 follow-ups — contacts with no timeline activity past the threshold.
    let followups = 0;
    for (const c of contacts) {
      const events = await ctx.db
        .query("timelineEvents")
        .withIndex("by_contact", (q) => q.eq("contactId", c._id))
        .order("desc")
        .take(1);
      const last = events[0]?.occurredAt ?? null;
      if (nudgeDue({ lastActivityAt: last, now }).due) followups++;
    }

    // §18/§21.4 overdue + §3 deadlines within 7 days — derived status across
    // this user's projects and invoices.
    let overdue = 0;
    let dueSoon = 0;
    const soon = now + 7 * 24 * 60 * 60 * 1000;
    for (const c of contacts) {
      const projects = await ctx.db
        .query("projects")
        .withIndex("by_contact", (q) => q.eq("contactId", c._id))
        .collect();
      for (const p of projects) {
        if (p.status === "active" && p.deadline !== undefined && p.deadline >= now && p.deadline <= soon) {
          dueSoon++;
        }
        const invoices = await ctx.db
          .query("invoices")
          .withIndex("by_project", (q) => q.eq("projectId", p._id))
          .collect();
        for (const inv of invoices) {
          const st = deriveInvoiceStatus({
            status: inv.status,
            amountPaid: inv.amountPaid,
            amountRefunded: inv.amountRefunded,
            total: inv.total,
            dueAt: inv.dueAt,
            now,
          });
          if (st === "overdue") overdue++;
        }
      }
    }

    return { inbox, followups, overdue, dueSoon };
  },
});
