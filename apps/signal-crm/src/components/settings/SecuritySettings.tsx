import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Modal } from "../ui/Modal";
import { useToasts } from "../ui/useToasts";
import { getDeviceId } from "../../lib/device";

/**
 * §20.13/§20.12/§21.7 — the security/ownership settings: session revocation,
 * scoped API keys (shown once, hashed at rest), and cascading account deletion
 * with the export-first guard for active invoices.
 */
export function SecuritySettings() {
  const { push } = useToasts();
  const sessions = useQuery(api.sessions.mySessions);
  const signOutEverywhere = useMutation(api.sessions.signOutEverywhere);
  const revokeSession = useMutation(api.sessions.revokeSession);
  const keys = useQuery(api.apiKeys.myKeys);
  const createKey = useMutation(api.apiKeys.createKey);
  const revokeKey = useMutation(api.apiKeys.revokeKey);
  const deletionStatus = useMutation(api.accountDeletion.deletionStatus);
  const deleteAccount = useMutation(api.accountDeletion.deleteAccount);

  const [newKey, setNewKey] = useState<string | null>(null);
  const [keyLabel, setKeyLabel] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [activeCount, setActiveCount] = useState<number | null>(null);
  const currentDeviceId = getDeviceId();

  const openDelete = async () => {
    const status = await deletionStatus();
    setActiveCount(status.activeInvoices ?? 0);
    setDeleteOpen(true);
  };

  const doDelete = async () => {
    // Export-first guard: active invoices require the explicit DELETE typing.
    if (activeCount !== null && activeCount > 0 && deleteConfirm !== "DELETE") {
      push({ message: "Type DELETE to confirm you accept losing active financial records." });
      return;
    }
    try {
      const result = await deleteAccount({ exportFirst: activeCount === 0 });
      if (result.deleted) {
        push({ message: "Account deleted. Audit log retained per policy." });
        window.location.href = "/";
      }
    } catch (err) {
      push({ message: err instanceof Error ? err.message : "Deletion failed." });
      setDeleteOpen(false);
    }
  };

  const doCreateKey = async () => {
    const { key } = await createKey({ label: keyLabel });
    setNewKey(key); // shown once — never retrievable again
    setCreateOpen(false);
    setKeyLabel("");
  };

  return (
    <>
      <section className="detail-section">
        <div className="section-head">
          <h3>Sessions</h3>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          Devices signed in to your account (§20.13). Revoke all but this one if a device is lost or shared.
        </p>
        {sessions === undefined ? (
          <div className="skeleton" style={{ height: 40 }} aria-hidden="true" />
        ) : sessions.length === 0 ? (
          <p className="muted">No active sessions recorded.</p>
        ) : (
          <ul className="session-list">
            {sessions.map((s) => {
              const isCurrent = s.deviceId === currentDeviceId;
              return (
                <li key={s.deviceId} className="definition-row surface-card">
                  <div>
                    <strong>
                      {s.userAgent?.slice(0, 60) || "Device"}
                      {isCurrent && <span className="primary-tag">this device</span>}
                    </strong>
                    <div className="muted">
                      Last active {new Date(s.lastActiveAt).toLocaleString()}
                    </div>
                  </div>
                  {!isCurrent && (
                    <button
                      type="button"
                      className="btn btn-danger-ghost btn-sm"
                      onClick={() => {
                        void revokeSession({ deviceId: s.deviceId }).then((r) =>
                          push({ message: r.revoked ? "Session revoked" : "Session already revoked" })
                        );
                      }}
                    >
                      Revoke
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            void signOutEverywhere({ currentDeviceId }).then(
              (r) => push({ message: `Signed out ${r.revoked} other session(s)` })
            );
          }}
        >
          Sign out everywhere
        </button>
      </section>

      <section className="detail-section">
        <div className="section-head">
          <h3>API keys</h3>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreateOpen(true)}>
            Create key
          </button>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          Scoped to your account, hashed at rest, rate-limited per key (§20.12/§21.10). The raw key is shown once.
        </p>
        {keys === undefined ? (
          <div className="skeleton" style={{ height: 40 }} aria-hidden="true" />
        ) : keys.length === 0 ? (
          <p className="muted">No API keys yet.</p>
        ) : (
          <ul className="session-list">
            {keys.map((k) => (
              <li key={k._id} className="definition-row surface-card">
                <div>
                  <strong>{k.label}</strong>
                  <div className="muted">
                    Created {new Date(k.createdAt).toLocaleDateString()}
                    {k.lastUsedAt ? ` · last used ${new Date(k.lastUsedAt).toLocaleString()}` : " · never used"}
                  </div>
                </div>
                <button type="button" className="btn btn-danger-ghost btn-sm" onClick={() => void revokeKey({ keyId: k._id })}>
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="detail-section">
        <div className="section-head">
          <h3>Danger zone</h3>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          Delete your account and every record it owns (§21.7). Active invoices must be exported first. Audit log rows persist.
        </p>
        <button type="button" className="btn btn-danger-ghost btn-sm" onClick={() => void openDelete()}>
          Delete account…
        </button>
      </section>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create API key" width={440}>
        <div className="field">
          <label htmlFor="ak-label">Label</label>
          <input id="ak-label" className="input" value={keyLabel} onChange={(e) => setKeyLabel(e.target.value)} placeholder="e.g. zapier" />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setCreateOpen(false)}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void doCreateKey()} disabled={!keyLabel.trim()}>
            Create
          </button>
        </div>
      </Modal>

      {newKey && (
        <Modal open onClose={() => setNewKey(null)} title="Your API key — copy it now" width={480}>
          <p className="muted">This is the only time the full key is shown. Store it somewhere safe.</p>
          <code className="copy-text" style={{ display: "block", margin: "8px 0" }}>
            {newKey}
          </code>
          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                void navigator.clipboard.writeText(newKey);
                push({ message: "Copied" });
                setNewKey(null);
              }}
            >
              Copy & done
            </button>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => doDelete()}
        title="Delete account"
        confirmLabel="Delete everything"
        body={<>
            <p>
              This permanently deletes your account and every record it owns.{" "}
              {activeCount !== null && activeCount > 0 ? (
                <>
                  You have <strong>{activeCount} active invoice(s)</strong> — export them first, or type{" "}
                  <strong>DELETE</strong> to confirm you accept the loss of those financial records.
                  <input
                    className="input"
                    style={{ marginTop: 8 }}
                    value={deleteConfirm}
                    onChange={(e) => setDeleteConfirm(e.target.value)}
                    placeholder="Type DELETE to confirm"
                    aria-label="Type DELETE to confirm"
                  />
                </>
              ) : (
                <>Audit log rows are retained per the privacy policy (§18 retention exception).</>
              )}
            </p>
          </>
        }
      />
    </>
  );
}
