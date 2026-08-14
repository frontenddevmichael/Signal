/**
 * §12 daily-cron selection — PURE logic, no Convex imports, fully unit-testable.
 * The daily cron (push.ts) resolves owners via the DB, then calls this to pick
 * which users to ping: invoices newly overdue (once per due date) and project
 * deadlines within 2 days (once per deadline).
 */

export interface NotifyCandidate {
  userId: string;
  title: string;
  body: string;
  mark: { table: "invoices" | "projects"; id: string };
}

export type OwnerInfo = { userId: string } | null | undefined;

const DAY = 24 * 3600_000;

export function selectDueNotifications(params: {
  now: number;
  invoices: Array<{
    _id: string;
    status: string;
    dueAt?: number;
    amountPaid: bigint;
    total: bigint;
    invoiceNumber: string;
    overdueNotifiedAt?: number;
    owner: OwnerInfo;
  }>;
  projects: Array<{
    _id: string;
    status: string;
    deadline?: number;
    name: string;
    deadlineNotifiedAt?: number;
    owner: OwnerInfo;
  }>;
}): NotifyCandidate[] {
  const { now, invoices, projects } = params;
  const rows: NotifyCandidate[] = [];

  for (const inv of invoices) {
    if (inv.status === "draft" || inv.status === "void" || inv.status === "paid" || inv.status === "refunded") continue;
    if (!inv.dueAt || inv.dueAt >= now) continue; // not overdue yet
    if (inv.amountPaid >= inv.total) continue; // settled despite stored status
    // Ping once per due date — re-pings only if the due date moves later.
    if (inv.overdueNotifiedAt && inv.overdueNotifiedAt >= inv.dueAt) continue;
    if (!inv.owner?.userId) continue;
    rows.push({
      userId: inv.owner.userId,
      title: "Invoice overdue",
      body: `Invoice ${inv.invoiceNumber} is now overdue`,
      mark: { table: "invoices", id: inv._id },
    });
  }

  for (const p of projects) {
    if (p.status === "closed") continue;
    if (!p.deadline || p.deadline < now || p.deadline > now + 2 * DAY) continue;
    if (p.deadlineNotifiedAt && p.deadlineNotifiedAt >= p.deadline) continue;
    if (!p.owner?.userId) continue;
    rows.push({
      userId: p.owner.userId,
      title: "Deadline approaching",
      body: `Deadline for "${p.name}" is within 2 days`,
      mark: { table: "projects", id: p._id },
    });
  }
  return rows;
}
