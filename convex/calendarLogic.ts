/**
 * Calendar screen — PURE month-grid logic, no Convex imports, Vitest-covered.
 * The month view shows project deadlines, follow-up due dates, and invoice due
 * dates on a Monday-first, 6-week grid. Everything time-shaped lives here so
 * the query stays thin and the grid math is provably right (month boundaries,
 * leap years, week starts).
 */

/** Monday-first weekday: 0 = Monday … 6 = Sunday (ISO 8601 convention). */
export const WEEK_STARTS_ON = 1; // JS getDay(): 1 = Monday

/** Inclusive [start, end) ms range for a calendar month (local time). */
export function monthRange(year: number, month: number): { start: number; end: number } {
  const start = new Date(year, month, 1, 0, 0, 0, 0).getTime();
  const end = new Date(year, month + 1, 1, 0, 0, 0, 0).getTime();
  return { start, end };
}

/**
 * A 42-cell (6-week) grid covering the month: the first row starts on the
 * Monday on/before the 1st, so leading/trailing cells bleed into adjacent
 * months. `inMonth` lets the UI dim out-of-month days.
 */
export interface DayCell {
  /** Local midnight of the cell's day. */
  date: Date;
  inMonth: boolean;
}

export function buildMonthGrid(year: number, month: number): DayCell[] {
  const first = new Date(year, month, 1);
  // Days since Monday for the 1st → how far back the first row must start.
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

/** Local calendar-day key ("2026-08-14") for grouping events by cell. */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * One calendar entry — the shared shape between the month query and the UI.
 * `status` drives the monochrome emphasis register: overdue = critical
 * (filled icon + 590 weight), partial = in-motion (warning), upcoming = plain.
 */
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

/** Calendar day labels — Monday-first per WEEK_STARTS_ON. */
export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
