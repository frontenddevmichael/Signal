import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Modal } from "../ui/Modal";
import { useToasts } from "../ui/useToasts";

/**
 * §20.7 — mints a 15-min single-use portal link for a client and shows it once
 * so the freelancer can send it (email/WhatsApp/whatever channel they prefer).
 */
export function PortalLinkButton({ contactId }: { contactId: Id<"contacts"> }) {
  const createLink = useMutation(api.portal.createPortalLink);
  const { push } = useToasts();
  const [link, setLink] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const create = async () => {
    setPending(true);
    try {
      const result = await createLink({ contactId });
      if (!result.ok) {
        push({ message: result.reason === "no_email" ? "Client has no email on file." : "Could not create link." });
        return;
      }
      setLink(`${window.location.origin}/portal?token=${result.token}`);
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <button type="button" className="btn btn-ghost" onClick={() => void create()} disabled={pending}>
        {pending && <span className="spinner" aria-hidden="true" />}
        Portal link
      </button>
      {link && (
        <Modal open onClose={() => setLink(null)} title="Client portal link — 15 min, single-use" width={520}>
          <p className="muted">Send this to the client. It expires in 15 minutes and stops working after first open.</p>
          <code className="copy-text" style={{ display: "block", margin: "10px 0", whiteSpace: "normal", wordBreak: "break-all" }}>
            {link}
          </code>
          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                void navigator.clipboard.writeText(link);
                push({ message: "Link copied" });
                setLink(null);
              }}
            >
              Copy & close
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
