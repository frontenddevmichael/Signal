import { useState } from "react";
import { Modal } from "./Modal";

/**
 * §23.1 confirm-before-destructive: an explicit confirmation step that names
 * what's about to happen in plain language, never a bare "Are you sure?".
 * §23.2: the confirm button shows its in-flight state.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel,
  danger = true,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
}) {
  const [pending, setPending] = useState(false);

  const run = async () => {
    setPending(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={title} width={460}>
      <p className="confirm-body">{body}</p>
      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose} disabled={pending}>
          Cancel
        </button>
        <button
          type="button"
          className={danger ? "btn btn-danger" : "btn btn-primary"}
          onClick={() => void run()}
          disabled={pending}
        >
          {pending && <span className="spinner" aria-hidden="true" />}
          {pending ? "Working…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
