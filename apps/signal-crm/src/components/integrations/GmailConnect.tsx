import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useToasts } from "../ui/useToasts";
import { IconGoogle } from "../Icons";
import { friendlyError } from "../../lib/errors";

/**
 * §17 Gmail connection — settings entry point, one connect per account.
 * The flow: this card mints an authorize URL (server-side CSRF state stored on
 * the users row) → Google's consent screen (gmail.send only, §17) → callback
 * httpAction exchanges the code server-side, encrypts the refresh token (§20.9)
 * → redirect back to /settings?gmail=connected.
 */
export function GmailConnect() {
  const status = useQuery(api.gmailClient.gmailStatus);
  const authorize = useMutation(api.gmailClient.gmailAuthorizeUrl);
  const disconnect = useMutation(api.gmailClient.gmailDisconnect);
  const triage = useQuery(api.triage.triageEnabled);
  const setTriage = useMutation(api.triage.setTriageEnabled);
  const { push } = useToasts();
  const [connecting, setConnecting] = useState(false);
  const [triagePending, setTriagePending] = useState(false);

  if (status === undefined || triage === undefined) {
    return <div className="skeleton" style={{ height: 110 }} aria-hidden="true" />;
  }

  const connect = async () => {
    setConnecting(true);
    try {
      const { url } = await authorize();
      window.location.href = url;
    } catch (err) {
      push({ message: friendlyError(err, "Could not start Google sign-in.") });
      setConnecting(false);
    }
  };

  const doDisconnect = async () => {
    try {
      await disconnect();
      push({ message: "Gmail disconnected" });
    } catch {
      push({ message: "Could not disconnect Gmail." });
    }
  };

  const doSetTriage = async (enabled: boolean) => {
    setTriagePending(true);
    try {
      await setTriage({ enabled });
    } catch {
      push({ message: "Could not update triage." });
    } finally {
      setTriagePending(false);
    }
  };

  return (
    <div className="integration-card surface-card card-hover">
      <div className="integration-head">
        <span className="integration-icon">
          <IconGoogle />
        </span>
        <div>
          <strong>Gmail</strong>
          <div className="muted">
            {!status.configured
              ? "Not configured yet — needs the Google OAuth client + encryption key."
              : status.connected
                ? "Connected — client emails send from your own Gmail identity (§17)."
                : "Not connected."}
          </div>
        </div>
        {status.connected && <span className="status status-active" role="status">connected</span>}
      </div>
      <div className="integration-actions">
        {status.connected ? (
          <button type="button" className="btn btn-danger-ghost btn-sm" onClick={() => void doDisconnect()}>
            Disconnect
          </button>
        ) : (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void connect()} disabled={!status.configured || connecting}>
            {connecting && <span className="spinner" aria-hidden="true" />}
            {status.configured ? "Connect Gmail" : "Waiting for credentials"}
          </button>
        )}
      </div>

      <div className="integration-sub" style={{ marginTop: 14 }}>
        <label className="row-label" style={{ marginBottom: 4 }}>
          <input
            type="checkbox"
            checked={triage.enabled}
            disabled={!triage.configured || triagePending}
            onChange={(e) => void doSetTriage(e.target.checked)}
          />
          <span>AI message triage (spam / important) — rule-based first, LLM only for the ambiguous remainder, daily-capped (§20.14)</span>
        </label>
        {!triage.configured && (
          <p className="muted" style={{ margin: "4px 0 0" }}>
            Set LLM_TRIAGE_PROVIDER + a Groq/Gemini key to enable the LLM pass; rule-based filtering runs regardless.
          </p>
        )}
      </div>
    </div>
  );
}
