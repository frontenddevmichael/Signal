import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Modal } from "../ui/Modal";

export function ProjectForm({
  open,
  onClose,
  contactId,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  contactId: string;
  initial?: {
    projectId: string;
    name: string;
    status: "active" | "closed";
    deadline?: number;
    description?: string;
  };
}) {
  const create = useMutation(api.projects.create);
  const update = useMutation(api.projects.update);

  const [name, setName] = useState("");
  const [status, setStatus] = useState<"active" | "closed">("active");
  const [deadline, setDeadline] = useState("");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // `initial` is a fresh object on most parent renders (built inline from the
  // contact/project query) — keying on it would wipe in-progress edits on any
  // re-render. Snapshot only on the closed → open transition.
  const initialRef = useRef(initial);
  initialRef.current = initial;
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open && !wasOpen.current) {
      const init = initialRef.current;
      setName(init?.name ?? "");
      setStatus(init?.status ?? "active");
      setDeadline(init?.deadline ? new Date(init.deadline).toISOString().slice(0, 10) : "");
      setDescription(init?.description ?? "");
      setError(null);
    }
    wasOpen.current = open;
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    const deadlineMs = deadline ? new Date(deadline + "T23:59:59").getTime() : undefined;
    try {
      if (initial) {
        await update({ projectId: initial.projectId as Id<"projects">, name, status, deadline: deadlineMs, description: description || undefined });
      } else {
        await create({ contactId: contactId as Id<"contacts">, name, status, deadline: deadlineMs, description: description || undefined });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save project.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={initial ? "Edit project" : "Add project"}>
      <form onSubmit={(e) => void submit(e)} noValidate>
        <div className="field">
          <label htmlFor="pf-name" className="required">Project name</label>
          <input id="pf-name" className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="pf-status">Status</label>
            <select id="pf-status" className="input" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
              <option value="active">active</option>
              <option value="closed">closed</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="pf-deadline">Deadline</label>
            <input id="pf-deadline" type="date" className="input" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="pf-desc">Description</label>
          <textarea id="pf-desc" className="input textarea" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        {error && (
          <div className="field-error-message" role="alert" style={{ marginBottom: 12 }}>
            {error}
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={pending || !name.trim()}>
            {pending && <span className="spinner" aria-hidden="true" />}
            {initial ? "Save changes" : "Add project"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
