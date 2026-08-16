import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { IconAlert, IconWhatsApp } from "../Icons";

/**
 * §10/§21.12 WhatsApp — settings card. Meta's business verification is a
 * manual review that takes days, so the honest state shows that expectation
 * rather than presenting an instant connect like GitHub/Google. The status
 * comes from the server (are the Meta credentials set?) like the other
 * integration cards — no client-side hardcode.
 */
export function WhatsAppConnect() {
  const status = useQuery(api.whatsappMutations.status);

  if (status === undefined) {
    return <div className="skeleton" style={{ height: 110 }} aria-hidden="true" />;
  }

  return (
    <div className="integration-card surface-card card-hover">
      <div className="integration-head">
        <span className="integration-icon">
          <IconWhatsApp style={{ width: 18, height: 18 }} />
        </span>
        <div>
          <strong>WhatsApp</strong>
          <div className="muted">
            {status.configured
              ? "Connected — inbound messages route to client timelines or the inbox."
              : "Not configured — needs the Meta App credentials. Business verification is a manual review that may take a few days (§21.12)."}
          </div>
        </div>
        {status.configured && <span className="status status-active" role="status">connected</span>}
      </div>
      <div className="integration-actions">
        <button type="button" className="btn btn-primary btn-sm" disabled>
          {status.configured ? "Connected" : "Waiting for credentials"}
        </button>
      </div>
      <p className="muted" style={{ margin: "8px 0 0" }}>
        Webhook URL (add in Meta App → WhatsApp → Configuration):{" "}
        <code className="copy-text" style={{ display: "inline-block", marginLeft: 4 }}>
          /whatsapp/webhook
        </code>
      </p>
      <p className="muted warning-line" style={{ margin: "8px 0 0" }}>
        <IconAlert style={{ width: 14, height: 14 }} />
        Your WhatsApp number is converted to the Business Platform API — it can no longer be used in the regular app
        (§10). Inbound messages are free to reply to within 24h; business-initiated messages outside that window incur
        Meta fees.
      </p>
    </div>
  );
}