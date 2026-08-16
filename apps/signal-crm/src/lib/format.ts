/**
 * §22.2 — all numerals render in Geist Mono (handled by the .num/.money CSS
 * classes at the usage site). §20.8 — timestamps are stored in UTC; rendering
 * converts to the relevant party's timezone — Shell sets the freelancer's
 * users.timezone, the Portal sets the client's (see setActiveTimezone below).
 */

/** Money is always minor units (cents/kobo) — converted ONLY here, at render. */
export function formatMoney(minor: number | bigint | null | undefined, currency = "USD"): string {
  if (minor === null || minor === undefined) return "—";
  const amount = typeof minor === "bigint" ? Number(minor) : minor;
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
  }).format(amount / 100);
}

/**
 * §20.8 — every timestamp is stored in UTC; rendering converts to the relevant
 * party's timezone. The Shell (freelancer's own dashboard) sets the user's
 * timezone; the Portal sets the client's. Falls back to the browser default
 * when never set (the pre-sign-in screens).
 */
let _activeTimezone: string | undefined;

export function setActiveTimezone(tz?: string | null): void {
  _activeTimezone = tz && tz.trim() ? tz : undefined;
}

export function activeTimezone(): string | undefined {
  return _activeTimezone;
}

function tzOptions(opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormatOptions {
  if (_activeTimezone) return { ...opts, timeZone: _activeTimezone };
  return opts;
}

export function formatDate(ts: number | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString(undefined, tzOptions({
    year: "numeric",
    month: "short",
    day: "numeric",
  }));
}

export function formatDateTime(ts: number | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString(undefined, tzOptions({
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }));
}

/** Relative "2h ago" for the timeline (§22.7 rhythm). */
export function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(ts);
}

/**
 * Relative label for a timestamp that may be in the FUTURE (a scheduled
 * meeting, a pending deadline) — timeAgo alone renders those as "just now",
 * which is misleading. Future reads "in 2h" / "in 6d" (same voice as dueLabel).
 */
export function timeUntil(ts: number): string {
  const diff = ts - Date.now();
  if (diff < 0) return timeAgo(ts);
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `in ${Math.max(1, mins)}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `in ${days}d`;
  return formatDate(ts);
}

export function formatTags(tags: string[]): string {
  return tags.join(", ");
}

/**
 * Due-date register for lists: "today", "in 3d" (future), "2d overdue" (past).
 * timeAgo is past-only and would render future due dates as "just now".
 */
export function dueLabel(ts: number): string {
  const diff = ts - Date.now();
  const days = Math.floor(Math.abs(diff) / 86400000);
  if (diff < 0) return days <= 0 ? "overdue" : `${days}d overdue`;
  return days <= 0 ? "today" : `in ${days}d`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
