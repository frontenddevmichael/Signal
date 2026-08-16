/**
 * Calendar — PURE month-grid logic, ported verbatim from the product's
 * `convex/calendarLogic.ts` (which is Vitest-covered there). No data deps.
 * Monday-first, 6-week grid, local-time day keys.
 */

export const WEEK_STARTS_ON = 1; // JS getDay(): 1 = Monday

export function monthRange(year: number, month: number): { start: number; end: number } {
  const start = new Date(year, month, 1, 0, 0, 0, 0).getTime();
  const end = new Date(year, month + 1, 1, 0, 0, 0, 0).getTime();
  return { start, end };
}

export interface DayCell {
  date: Date;
  inMonth: boolean;
}

export function buildMonthGrid(year: number, month: number): DayCell[] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 7 - WEEK_STARTS_ON) % 7;
  const gridStart = new Date(year, month, 1 - offset);
  const cells: DayCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    cells.push({ date: d, inMonth: d.getMonth() === month });
  }
  return cells;
}

export function dayKey(ts: number): string {
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export interface CalendarEvent {
  id: string;
  kind: "deadline" | "followup" | "invoice" | "meeting";
  title: string;
  subtitle: string;
  at: number;
  contactId?: string;
  invoiceId?: string;
  status: "upcoming" | "overdue" | "partial";
}

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
