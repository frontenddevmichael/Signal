import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { EmptyState } from "./EmptyState";

/**
 * §10 general inbox — messages from numbers/addresses that don't match any
 * contact. Landing here (rather than a client timeline) is the designed
 * behavior. The §20.14 classification badge assists triage (sort/label), never
 * silently hides.
 */
export function Inbox() {
  const messages = useQuery(api.whatsappMutations.inbox);

  if (messages === undefined) {
    return <div className="skeleton" style={{ height: 200 }} aria-hidden="true" />;
  }

  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <div className="page-head">
        <h2>Inbox</h2>
        <span className="row-count">{messages.length} unmatched</span>
      </div>
      <p className="muted" style={{ marginTop: -8, marginBottom: 16 }}>
        Unmatched inbound messages — add a contact to move them onto a timeline (§10).
      </p>
      {messages.length === 0 ? (
        <EmptyState title="Inbox is empty" body="Messages from unknown numbers and addresses land here." />
      ) : (
        <div className="inbox-list">
          {messages.map((m) => (
            <div key={m._id} className="inbox-row surface-card card-hover">
              <div className="inbox-head">
                <span className="client-cell">
                  <span className="avatar" aria-hidden="true">
                    {m.fromAddress.slice(0, 2).toUpperCase()}
                  </span>
                  <strong>{m.fromAddress}</strong>
                </span>
                <span className={`badge badge-${m.classification ?? "ambiguous"}`}>{m.classification ?? "unclassified"}</span>
              </div>
              <p className="inbox-body">{m.body}</p>
              <div className="muted">{new Date(m.occurredAt).toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
