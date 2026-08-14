import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Modal } from "../ui/Modal";
import { useToasts } from "../ui/useToasts";
import { EmptyState } from "../EmptyState";
import { GithubConnect } from "../integrations/GithubConnect";
import { GmailConnect } from "../integrations/GmailConnect";
import { WhatsAppConnect } from "../integrations/WhatsAppConnect";
import { SecuritySettings } from "./SecuritySettings";

/**
 * §21.16 — weekly backup status card. Mirrors the integration-card shape: the
 * server reports whether S3-compatible env vars are set and on what schedule.
 * The job itself runs as a server-side cron (Mondays 02:00 UTC), not here.
 */
function BackupCard() {
  const status = useQuery(api.backup.status);
  if (status === undefined) {
    return <div className="skeleton" style={{ height: 90 }} aria-hidden="true" />;
  }
  return (
    <div className="integration-card surface-card card-hover">
      <div className="integration-head">
        <span className={`status ${status.configured ? "status-active" : ""}`}>
          {status.configured ? "configured" : "not configured"}
        </span>
        <div>
          <strong>Weekly backup</strong>
          <div className="muted">{status.schedule}</div>
        </div>
      </div>
      <p className="muted" style={{ margin: "8px 0 0" }}>{status.note}</p>
      {!status.configured && (
        <p className="muted" style={{ margin: "8px 0 0" }}>
          Set <code>BACKUP_S3_ENDPOINT</code>, <code>BACKUP_S3_BUCKET</code>,{" "}
          <code>BACKUP_S3_ACCESS_KEY_ID</code>, <code>BACKUP_S3_SECRET_ACCESS_KEY</code> to enable.
        </p>
      )}
    </div>
  );
}

/**
 * §23.6 — custom field management lives in settings, one level removed from
 * daily-use screens. §20.4: definitions are (label, entity_type, field_type);
 * values render on the detail pages. Also hosts the §9a GitHub connection
 * (settings entry point, once, not per-client).
 */
export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const installIdParam = searchParams.get("installation_id");
  const gmailParam = searchParams.get("gmail");
  const storeInstallation = useMutation(api.github.storeInstallation);
  const { push } = useToasts();
  const [justConnected, setJustConnected] = useState(false);

  // §9a step 3 — GitHub redirects back with ?installation_id=…
  useEffect(() => {
    if (!installIdParam) return;
    const id = Number(installIdParam);
    if (Number.isFinite(id)) {
      void storeInstallation({ installationId: id }).then(() => setJustConnected(true));
    }
    setSearchParams({}, { replace: true }); // strip the param
  }, [installIdParam, storeInstallation, setSearchParams]);

  // §17 — the OAuth callback redirects back with ?gmail=connected|error&msg=…
  useEffect(() => {
    if (!gmailParam) return;
    if (gmailParam === "connected") {
      push({ message: "Gmail connected — client emails now send from your own identity." });
    } else {
      const msg = searchParams.get("msg");
      push({ message: `Gmail connect failed: ${msg ?? "unknown error"}` });
    }
    setSearchParams({}, { replace: true });
  }, [gmailParam, searchParams, setSearchParams, push]);
  const definitions = useQuery(api.customFields.listDefinitions);
  const createDefinition = useMutation(api.customFields.createDefinition);
  const deleteDefinition = useMutation(api.customFields.deleteDefinition);

  const [formOpen, setFormOpen] = useState(false);
  const [entityType, setEntityType] = useState<"contact" | "project">("contact");
  const [label, setLabel] = useState("");
  const [fieldType, setFieldType] = useState<"text" | "number" | "date" | "select">("text");
  const [optionsText, setOptionsText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ _id: string; label: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const options =
        fieldType === "select"
          ? optionsText.split(",").map((o) => o.trim()).filter(Boolean)
          : undefined;
      await createDefinition({ entityType, label, fieldType, options });
      setFormOpen(false);
      setLabel("");
      setOptionsText("");
      push({ message: `Added “${label}”` });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add field.");
    } finally {
      setPending(false);
    }
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    await deleteDefinition({ definitionId: deleteTarget._id as Id<"customFieldDefinitions"> });
    push({ message: `Deleted “${deleteTarget.label}”` });
    setDeleteTarget(null);
  };

  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <div className="page-head">
        <h2>Settings</h2>
      </div>

      <section className="detail-section">
        <div className="section-head">
          <h3>Integrations</h3>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          External accounts connect here once, and their data flows onto client timelines (§9a).
        </p>
        <GithubConnect installationId={justConnected ? "just-connected" : null} />
        <GmailConnect />
        <WhatsAppConnect />
      </section>

      <section className="detail-section">
        <div className="section-head">
          <h3>Backup</h3>
        </div>
        <BackupCard />
      </section>

      <SecuritySettings />

      <section className="detail-section">
        <div className="section-head">
          <h3>Custom fields</h3>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setFormOpen(true)}>
            Add field
          </button>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          Define your own fields for clients and projects — they render and stay editable on the
          detail pages (§20.4).
        </p>
        {definitions === undefined ? (
          <div className="skeleton" style={{ height: 40 }} aria-hidden="true" />
        ) : definitions.length === 0 ? (
          <EmptyState title="No custom fields yet" body="Define the first one — e.g. “Retainer amount” on a project." />
        ) : (
          <div className="definition-list">
            {definitions.map((d) => (
              <div key={d._id} className="definition-row surface-card">
                <div>
                  <strong>{d.label}</strong>
                  <div className="muted">
                    {d.entityType} · {d.fieldType}
                    {d.fieldType === "select" && (d.options?.length ?? 0) > 0
                      ? ` · ${d.options!.join(", ")}`
                      : ""}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-danger-ghost btn-sm"
                  onClick={() => setDeleteTarget({ _id: d._id, label: d.label })}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title="Add custom field" width={460}>
        <form onSubmit={(e) => void submit(e)} noValidate>
          <div className="field">
            <label htmlFor="sf-label" className="required">Label</label>
            <input
              id="sf-label"
              className="input"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
            />
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="sf-entity">Applies to</label>
              <select id="sf-entity" className="input" value={entityType} onChange={(e) => setEntityType(e.target.value as typeof entityType)}>
                <option value="contact">Clients</option>
                <option value="project">Projects</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="sf-type">Type</label>
              <select id="sf-type" className="input" value={fieldType} onChange={(e) => setFieldType(e.target.value as typeof fieldType)}>
                <option value="text">text</option>
                <option value="number">number</option>
                <option value="date">date</option>
                <option value="select">select</option>
              </select>
            </div>
          </div>
          {fieldType === "select" && (
            <div className="field">
              <label htmlFor="sf-options" className="required">Options (comma-separated)</label>
              <input
                id="sf-options"
                className="input"
                value={optionsText}
                onChange={(e) => setOptionsText(e.target.value)}
                placeholder="e.g. inbound, retainer, one-off"
              />
            </div>
          )}
          {error && (
            <div className="field-error-message" role="alert" style={{ marginBottom: 12 }}>
              {error}
            </div>
          )}
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setFormOpen(false)} disabled={pending}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending || !label.trim()}>
              {pending && <span className="spinner" aria-hidden="true" />}
              Add field
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={doDelete}
        title="Delete custom field"
        body={
          <>
            This will delete <strong>{deleteTarget?.label}</strong> and every value stored under it.
            This can’t be undone.
          </>
        }
        confirmLabel="Delete field"
      />
    </div>
  );
}
