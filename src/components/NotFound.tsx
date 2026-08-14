import { useNavigate } from "react-router-dom";
import { EmptyState } from "./EmptyState";
import { IconInvoices } from "./Icons";

/** A real 404 — unknown routes are not "coming soon", they're missing. */
export function NotFound() {
  const navigate = useNavigate();
  return (
    <EmptyState
      icon={<IconInvoices aria-hidden="true" style={{ width: 22, height: 22 }} />}
      title="Page not found"
      body="This address doesn't match anything in the app. Head back to your clients."
      action={
        <button type="button" className="btn btn-primary" onClick={() => navigate("/")}>
          Back to clients
        </button>
      }
    />
  );
}
