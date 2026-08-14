import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { EmptyState } from "./EmptyState";
import { useToasts } from "./ui/useToasts";

/**
 * §3 follow-up nudges — the highest-leverage feature for a solo operator,
 * surfaced with the §22.6 beacon motif (the near-black accent reserved for
 * things needing the freelancer's attention).
 */
export function FollowUps() {
  const nudges = useQuery(api.nudges.pendingNudges);
  const markDone = useMutation(api.nudges.markDone);
  const dismiss = useMutation(api.nudges.dismiss);
  const { push } = useToasts();

  if (nudges === undefined) {
    return <div className="skeleton" style={{ height: 200 }} aria-hidden="true" />;
  }

  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <div className="page-head">
        <h2>Follow-ups</h2>
        <span className="row-count">{nudges.length} due</span>
      </div>
      {nudges.length === 0 ? (
        <EmptyState
          title="Nothing needs a follow-up"
          body="Contacts with no activity in 7+ days appear here with the beacon. You're all caught up."
        />
      ) : (
        <div className="nudge-list">
          {nudges.map((n) => (
            <div key={n.contactId} className="nudge-row surface-card card-hover">
              <div className="nudge-beacon" aria-hidden="true">
                <span className="beacon-dot" />
              </div>
              <div className="nudge-body">
                <div className="client-cell">
                  <span className="avatar" aria-hidden="true">
                    {n.name.slice(0, 2).toUpperCase()}
                  </span>
                  <strong>{n.name}</strong>
                </div>
                <div className="muted">{n.reason}</div>
                <div className="muted">{Math.floor(n.days)} days since last contact</div>
              </div>
              <div className="nudge-actions">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    void markDone({ contactId: n.contactId as Id<"contacts"> });
                    push({ message: `Follow-up with ${n.name} marked done` });
                  }}
                >
                  Done
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => void dismiss({ contactId: n.contactId as Id<"contacts"> })}
                >
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
