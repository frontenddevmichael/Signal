import { useState } from "react";
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

  // Which action is in flight per contact — both row buttons disable while
  // one runs so a double-click can't double-fire (§5.3), and the running
  // button shows the inline spinner instead of vanishing its label.
  const [pending, setPending] = useState<Record<string, "done" | "dismiss">>({});

  const run = async (contactId: string, action: "done" | "dismiss", name: string) => {
    setPending((p) => ({ ...p, [contactId]: action }));
    try {
      if (action === "done") await markDone({ contactId: contactId as Id<"contacts"> });
      else await dismiss({ contactId: contactId as Id<"contacts"> });
      push({ message: action === "done" ? `Follow-up with ${name} marked done` : `Follow-up with ${name} dismissed` });
    } catch {
      push({
        message:
          action === "done"
            ? `Couldn't mark ${name}'s follow-up done — try again.`
            : "Couldn't dismiss the follow-up — try again.",
      });
    } finally {
      setPending((p) => {
        const next = { ...p };
        delete next[contactId];
        return next;
      });
    }
  };

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
          {nudges.map((n) => {
            const busy = pending[n.contactId];
            const disabled = busy !== undefined;
            return (
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
                    disabled={disabled}
                    onClick={() => void run(n.contactId, "done", n.name)}
                  >
                    {busy === "done" && <span className="spinner" aria-hidden="true" />}
                    Done
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={disabled}
                    onClick={() => void run(n.contactId, "dismiss", n.name)}
                  >
                    {busy === "dismiss" && <span className="spinner" aria-hidden="true" />}
                    Dismiss
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
