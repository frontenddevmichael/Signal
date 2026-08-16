import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useToasts } from "../ui/useToasts";

/**
 * §17 reply box — replies send via gmail.send from the freelancer's own
 * Gmail identity and land on the client's inbox as a normal email. Honest
 * disabled state when Gmail isn't connected (§23.2).
 */
export function ReplyBox({ contactId, to }: { contactId: Id<"contacts">; to: string | null }) {
  const status = useQuery(api.gmailClient.gmailStatus);
  const sendReply = useAction(api.gmailReply.sendReply);
  const { push } = useToasts();
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);

  if (status === undefined) {
    return <div className="reply-box surface-card"><div className="skeleton" style={{ height: 100 }} aria-hidden="true" /></div>;
  }

  const connected = status.connected && status.configured;
  const canSend = connected && to !== null && body.trim().length > 0;

  const send = async () => {
    if (!canSend) return;
    setPending(true);
    try {
      await sendReply({ contactId, to: to!, subject: "Re: your project", body: body.trim() });
      setBody("");
      push({ message: "Reply sent from your Gmail" });
    } catch (err) {
      push({ message: err instanceof Error ? err.message : "Reply failed to send." });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="reply-box surface-card">
      <div className="section-head">
        <h3>Reply</h3>
        {connected ? (
          <span className="status status-active" role="status">gmail</span>
        ) : (
          <span className="muted">Gmail not connected — replies disabled</span>
        )}
      </div>
      {to ? (
        <div className="muted" style={{ marginTop: 0 }}>
          To <strong>{to}</strong>
        </div>
      ) : (
        <div className="muted" style={{ marginTop: 0 }}>
          Add an email to this client first.
        </div>
      )}
      <textarea
        className="input reply-input"
        rows={3}
        placeholder="Reply to this client… (sends from your Gmail)"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        disabled={!connected || to === null}
        aria-label="Reply body"
      />
      <div className="gmail-actions">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => void send()}
          disabled={!canSend || pending}
        >
          {pending && <span className="spinner" aria-hidden="true" />}
          Send reply
        </button>
      </div>
    </div>
  );
}
