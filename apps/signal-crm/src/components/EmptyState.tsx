import type { ReactNode } from "react";
import { IconClients } from "./Icons";

/**
 * §3.5 — an empty state is a real composition, not a placeholder line: an
 * icon tile, a 510-weight headline, one line of tertiary copy, and a clear
 * next action. The absence of data reads as designed because the empty
 * frame matches the populated frame's quality bar. Deliberately distinct
 * from error states (flat, quiet, never illustrated — §3.5): this is the
 * opportunity, not the problem.
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
        {icon ?? <IconClients width={24} height={24} />}
      </div>
      <h2>{title}</h2>
      <p>{body}</p>
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}
