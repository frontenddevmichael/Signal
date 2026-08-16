import type { ReactNode } from "react";

/**
 * §2.3 — an empty state is a real composition, not a placeholder line: an icon
 * tile, a 510-weight headline, one line of supporting copy at tertiary, and a
 * clear next action. It should match the quality bar of a populated screen so
 * the *absence* of data still reads as designed. Distinct from error states
 * (flat, quiet — see §4.5): this one is the opportunity, not the problem.
 */
export function EmptyState({
  title,
  body,
  action,
  icon,
}: {
  title: string;
  body: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-tile" aria-hidden="true">
        {icon ?? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
          >
            <circle cx="12" cy="8" r="3.5" />
            <path d="M5 20c0-3.5 3.1-5.5 7-5.5s7 2 7 5.5" />
          </svg>
        )}
      </div>
      <h2>{title}</h2>
      <p>{body}</p>
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}
