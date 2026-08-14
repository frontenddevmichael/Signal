/**
 * §3 follow-up nudges — the highest-leverage feature for a solo operator.
 * Pure decision logic: when has the relationship gone cold enough to nudge?
 *
 * A nudge fires when the contact has NO timeline activity in the threshold
 * window (default 7 days), and is auto-cleared when new activity arrives.
 */

export const DEFAULT_NUDGE_DAYS = 7;

/** Days between lastActivityAt (ms) and now (ms), fractional — for tests. */
export function daysSince(lastActivityAt: number, now: number): number {
  return (now - lastActivityAt) / 86400000;
}

/**
 * Should a nudge be due for this contact?
 * - contacts with NO activity yet: nudge after a grace period too (they were
 *   just added — give them N days before nagging).
 * - otherwise: nudge when daysSince >= threshold.
 */
export function nudgeDue(args: {
  lastActivityAt: number | null;
  now: number;
  thresholdDays?: number;
}): { due: boolean; days: number | null } {
  const threshold = args.thresholdDays ?? DEFAULT_NUDGE_DAYS;
  if (args.lastActivityAt === null) return { due: false, days: null };
  const days = daysSince(args.lastActivityAt, args.now);
  return { due: days >= threshold, days };
}

/** Nudge reason string (§3 "you haven't followed up with X in N days"). */
export function nudgeReason(days: number): string {
  const rounded = Math.floor(days);
  return `No contact in ${rounded} day${rounded === 1 ? "" : "s"}`;
}
