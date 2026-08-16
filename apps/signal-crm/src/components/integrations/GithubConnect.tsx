import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useToasts } from "../ui/useToasts";
import { IconGitHub } from "../Icons";

/**
 * §9a — "Connect GitHub" lives on the settings page, once, not per-client.
 * Same shape as every integration flow (§23): settings entry → provider's own
 * hosted consent screen → redirect back with a visible connected state.
 *
 * The redirect back arrives at /?installation_id=… — the callback is handled
 * at the top of this component's host page via the installation_id query
 * param (see SettingsPage), which calls storeInstallation.
 */
export function GithubConnect({ installationId }: { installationId: string | null }) {
  const status = useQuery(api.github.status);
  const disconnect = useMutation(api.github.disconnect);
  const { push } = useToasts();

  if (status === undefined) {
    return <div className="skeleton" style={{ height: 110 }} aria-hidden="true" />;
  }

  const connected = Boolean(status.installationId);

  const connect = () => {
    if (!status.installUrl) return;
    window.location.href = status.installUrl;
  };

  const doDisconnect = async () => {
    await disconnect();
    push({ message: "GitHub disconnected" });
  };

  return (
    <div className="integration-card surface-card card-hover">
      <div className="integration-head">
        <span className="integration-icon">
          <IconGitHub />
        </span>
        <div>
          <strong>GitHub</strong>
          <div className="muted">
            {!status.configured
              ? "Not configured yet — needs the GitHub App credentials."
              : connected
                ? "Connected — repos can be imported onto projects."
                : "Not connected."}
          </div>
        </div>
        {connected && <span className="status status-active">connected</span>}
      </div>
      <div className="integration-actions">
        {connected ? (
          <>
            <a className="btn btn-ghost btn-sm" href={status.configureUrl ?? "#"} target="_blank" rel="noreferrer">
              Manage access
            </a>
            <button type="button" className="btn btn-danger-ghost btn-sm" onClick={() => void doDisconnect()}>
              Disconnect
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-primary btn-sm" onClick={connect} disabled={!status.configured}>
            {status.configured ? "Connect GitHub" : "Waiting for credentials"}
          </button>
        )}
      </div>
      {installationId && (
        <p className="muted" style={{ margin: "8px 0 0" }}>
          Installation connected — refresh to see its repos.
        </p>
      )}
    </div>
  );
}
