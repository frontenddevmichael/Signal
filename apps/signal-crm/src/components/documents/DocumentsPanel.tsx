import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { EmptyState } from "../EmptyState";
import { Modal } from "../ui/Modal";
import { useToasts } from "../ui/useToasts";
import { NewDocumentModal } from "./NewDocumentModal";
import { IconDoc } from "../Icons";

/**
 * §documents — the Docs tab on the client detail. Lists generated
 * proposals/contracts (and invoice PDF links) newest-first, with a New
 * document CTA in both the empty state and the section header. Opening a
 * document shows its rendered body; deleting is reversible via Undo toast
 * (§23.3) — documents are not money-moving, so undo-as-default applies.
 */
export function DocumentsPanel({ contactId }: { contactId: string }) {
  const { push } = useToasts();
  const documents = useQuery(api.documents.listByContact, { contactId: contactId as any });
  const remove = useMutation(api.documents.remove);
  const undoRemove = useMutation(api.documents.undoRemove);

  const [createOpen, setCreateOpen] = useState(false);
  const [preview, setPreview] = useState<(typeof documents)[number] | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const doDelete = async (doc: NonNullable<typeof documents>[number]) => {
    setPendingId(doc._id);
    try {
      const res = await remove({ documentId: doc._id });
      // §23.3 — reversible: re-insert from the snapshot within the window.
      push({
        message: `${doc.title ?? doc.type} deleted`,
        undoLabel: "Undo",
        onUndo: () => {
          void undoRemove({ undoId: res.undoId })
            .then(() => push({ message: "Document restored" }))
            .catch(() => push({ message: "Could not restore the document." }));
        },
      });
    } catch {
      push({ message: "Could not delete the document." });
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="documents-panel">
      <div className="section-head">
        <h3>Documents</h3>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreateOpen(true)}>
          New document
        </button>
      </div>

      {documents === undefined ? (
        <div className="skeleton" style={{ height: 90 }} aria-hidden="true" />
      ) : documents.length === 0 ? (
        <EmptyState
          icon={<IconDoc aria-hidden="true" />}
          title="No documents yet"
          body="Generate a proposal or contract from a template — it's linked back to this client automatically."
          action={
            <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
              New document
            </button>
          }
        />
      ) : (
        <ul className="document-list">
          {documents.map((d) => (
            <li key={d._id} className="definition-row surface-card">
              <button
                type="button"
                className="document-open"
                onClick={() => setPreview(d)}
              >
                <strong>{d.title ?? d.type}</strong>
                <span className="muted">
                  {d.type}
                  {d.createdAt ? ` · ${new Date(d.createdAt).toLocaleDateString()}` : ""}
                </span>
              </button>
              <span className={`status status-${d.status}`}>{d.status}</span>
              <button
                type="button"
                className="btn btn-danger-ghost btn-sm"
                disabled={pendingId === d._id}
                onClick={() => void doDelete(d)}
              >
                {pendingId === d._id && <span className="spinner" aria-hidden="true" />}
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      {createOpen && <NewDocumentModal contactId={contactId} onClose={() => setCreateOpen(false)} />}

      <Modal open={preview !== null} onClose={() => setPreview(null)} title={preview?.title ?? "Document"} width={640}>
        {preview && (
          <div className="doc-preview">
            {preview.content
              ? preview.content.split("\n").map((line, i) =>
                  line ? <p key={i}>{line}</p> : <div key={i} aria-hidden="true" style={{ height: 10 }} />
                )
              : <p className="muted">This document has no preview (linked from an external provider).</p>}
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setPreview(null)}>
            Close
          </button>
        </div>
      </Modal>
    </div>
  );
}
