import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Modal } from "../ui/Modal";
import { useToasts } from "../ui/useToasts";
import { EmptyState } from "../EmptyState";
import { IconPlus } from "../Icons";
import { SettingsSection } from "./SettingsSection";

type FieldType = "text" | "number" | "date" | "select";

/**
 * §23.6 — custom field management. §20.4: definitions are (label, entity_type,
 * field_type); values render on the detail pages. One level removed from
 * daily-use screens per §20.3, but fully functional.
 */
export function CustomFieldsSection() {
  const { push } = useToasts();
  const definitions = useQuery(api.customFields.listDefinitions);
  const createDefinition = useMutation(api.customFields.createDefinition);
  const deleteDefinition = useMutation(api.customFields.deleteDefinition);

  const [formOpen, setFormOpen] = useState(false);
  const [entityType, setEntityType] = useState<"contact" | "project">("contact");
  const [label, setLabel] = useState("");
  const [fieldType, setFieldType] = useState<FieldType>("text");
  const [optionsText, setOptionsText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ _id: string; label: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    // §20.4 — a `select` field with no options is created broken (nothing to
    // pick later). Require at least one option before the mutation runs.
    if (fieldType === "select" && !optionsText.trim()) {
      setError("Select fields need at least one option.");
      setPending(false);
      return;
    }
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
    try {
      await deleteDefinition({ definitionId: deleteTarget._id as Id<"customFieldDefinitions"> });
      push({ message: `Deleted “${deleteTarget.label}”` });
      setDeleteTarget(null);
    } catch {
      push({ message: "Could not delete that field." });
    }
  };

  return (
    <SettingsSection
      title="Custom fields"
      description="Define your own fields for clients and projects — they render and stay editable on the detail pages (§20.4)."
      action={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setFormOpen(true)}>
          <IconPlus aria-hidden="true" style={{ width: 14, height: 14 }} />
          Add field
        </button>
      }
    >
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
              <select id="sf-type" className="input" value={fieldType} onChange={(e) => setFieldType(e.target.value as FieldType)}>
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
    </SettingsSection>
  );
}
