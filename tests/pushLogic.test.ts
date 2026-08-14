/**
 * §12 daily-cron selection — pure logic tests (convex/pushLogic.ts).
 * Proves the once-per-transition discipline: overdue pings fire once per due
 * date (re-ping only when the due date moves later), deadlines ping within a
 * 2-day window, and settled/void/closed/draft rows are never pinged.
 */
import { describe, it, expect } from "vitest";
import { selectDueNotifications, type NotifyCandidate } from "../convex/pushLogic";

const now = 1_800_000_000_000; // fixed "today"
const DAY = 24 * 3600_000;

function inv(over: Partial<Parameters<typeof selectDueNotifications>[0]["invoices"][number]> = {}) {
  return {
    _id: "invoices_a",
    status: "sent",
    dueAt: now - DAY, // overdue since yesterday
    amountPaid: 0n,
    total: 125_000n,
    invoiceNumber: "INV-2026-0001",
    owner: { userId: "users_u" },
    ...over,
  } as Parameters<typeof selectDueNotifications>[0]["invoices"][number];
}

function proj(over: Partial<Parameters<typeof selectDueNotifications>[0]["projects"][number]> = {}) {
  return {
    _id: "projects_p",
    status: "active",
    deadline: now + DAY, // due tomorrow
    name: "Website",
    owner: { userId: "users_u" },
    ...over,
  } as Parameters<typeof selectDueNotifications>[0]["projects"][number];
}

describe("selectDueNotifications", () => {
  it("pings a newly overdue invoice", () => {
    const rows = selectDueNotifications({ now, invoices: [inv()], projects: [] });
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Invoice overdue");
    expect(rows[0].mark).toEqual({ table: "invoices", id: "invoices_a" });
  });

  it("does NOT re-ping the same overdue invoice on the next daily run", () => {
    const rows = selectDueNotifications({
      now,
      invoices: [inv({ overdueNotifiedAt: now - DAY / 2 })], // pinged yesterday
      projects: [],
    });
    expect(rows).toHaveLength(0);
  });

  it("re-pings when the due date is pushed out past the previous ping", () => {
    const rows = selectDueNotifications({
      now,
      invoices: [inv({ overdueNotifiedAt: now - 3 * DAY, dueAt: now - DAY })],
      projects: [],
    });
    expect(rows).toHaveLength(1);
  });

  it("never pings drafts, voids, refunded, or settled invoices", () => {
    const invoices = [
      inv({ status: "draft" }),
      inv({ status: "void" }),
      inv({ status: "refunded" }),
      inv({ status: "paid" }),
      inv({ amountPaid: 125_000n }), // settled despite stored status
    ];
    expect(selectDueNotifications({ now, invoices, projects: [] })).toHaveLength(0);
  });

  it("pings a project deadline within 2 days, once per deadline", () => {
    const rows = selectDueNotifications({
      now,
      invoices: [],
      projects: [
        proj({ deadline: now + DAY }),
        // already pinged for THIS deadline (marker >= deadline) — not re-pinged
        proj({ deadline: now + DAY, deadlineNotifiedAt: now + DAY }),
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Deadline approaching");
  });

  it("skips deadlines already past, too far out, or on closed projects", () => {
    const projects = [
      proj({ deadline: now - 1 }), // already past
      proj({ deadline: now + 3 * DAY }), // beyond the 2-day window
      proj({ status: "closed", deadline: now + DAY }),
      proj({ deadline: now + DAY, deadlineNotifiedAt: now + DAY }), // already pinged
    ];
    expect(selectDueNotifications({ now, invoices: [], projects })).toHaveLength(0);
  });

  it("skips rows whose owner can't be resolved", () => {
    const rows = selectDueNotifications({
      now,
      invoices: [inv({ owner: null }), inv({ owner: { userId: "users_u" } })],
      projects: [proj({ owner: undefined })],
    });
    expect(rows).toHaveLength(1);
  });

  it("returns a mix of overdue + deadline rows in one run", () => {
    const rows = selectDueNotifications({
      now,
      invoices: [inv({ _id: "invoices_a", invoiceNumber: "INV-1" })],
      projects: [proj({ _id: "projects_p" })],
    });
    expect(rows).toHaveLength(2);
    const byTable = Object.fromEntries(rows.map((r: NotifyCandidate) => [r.mark.table, r.mark.id]));
    expect(byTable).toEqual({ invoices: "invoices_a", projects: "projects_p" });
  });
});
