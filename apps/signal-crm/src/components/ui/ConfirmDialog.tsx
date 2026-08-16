import { useState } from "react";
import { Modal } from "./Modal";

/**
 * §5.1 confirm-before-destructive — an explicit step that NAMES what's about
 * to happen in plain language, never a bare "Are you sure?". Irreversible or
 * money-adjacent actions always route through this. §5.3 visibility of
 * system status — the confirm button shows its in-flight state (inline
 * spinner + working label); a throwing onConfirm surfaces an inline
 * role="alert" error instead of silently swallowing the rejection and
 * leaving the dialog open with no feedback.
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
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Something went wrong. Try again.");
      if (!(e instanceof Error) || !e.message) {
        // The bare-throw path loses its shape, but the inline message
        // already tells the user what to do next.
        console.error(e);
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={title} width={460}>
      <p className="confirm-body">{body}</p>
      {error && (
        <p className="field-error-message" role="alert">
          {error}
        </p>
      )}
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
