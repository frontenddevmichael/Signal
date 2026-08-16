import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { useConvexAuth } from "@convex-dev/auth/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { EmptyState } from "./EmptyState";
import { useToasts } from "./ui/useToasts";
import { setActiveTimezone } from "../lib/format";

/**
 * §20.7 client portal — passwordless. The URL carries a 15-minute, single-use
 * magic link; redemption invalidates it immediately, so a replayed link shows
 * the "link already used" state. Data is keyed by the token, never by contactId.
 *
 * Auth-aware: a signed-in freelancer at /portal with no token gets the preview
 * picker (mint a fresh link and see exactly what the client sees); everyone
 * else — and every token-carrying link — gets the portal view itself.
 */
export function Portal() {
  const { isAuthenticated } = useConvexAuth();
  const [params, setSearchParams] = useSearchParams();
  const token = params.get("token") ?? "";
  const redeem = useMutation(api.portal.redeemPortalToken);
  const [redeemed, setRedeemed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const portalHeadingRef = useRef<HTMLHeadingElement | null>(null);

  // Redeem once on load — the token is single-use; a replayed link fails here.
  useEffect(() => {
    if (!token || redeemed) return;
    void redeem({ token })
      .then((r) => {
        if (r.ok) setRedeemed(true);
        else setError(r.reason ?? "invalid");
      })
      .catch(() => setError("unavailable"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // §2.4 focus management — when the portal content lands (successful redeem),
  // move keyboard focus into the page heading so SR users land on the content
  // instead of staying at the top of the shell chrome.
  // (Declared after portalData, below, so the closure sees it initialized.)

  // All hooks above are unconditional (Rules of Hooks); the token-scoped query
  // is harmless on the picker (empty token → null).
  const portalData = useQuery(api.portal.data, { token });

  useEffect(() => {
    if (redeemed && portalData) portalHeadingRef.current?.focus();
  }, [redeemed, portalData]);

  // §20.8 — portal dates render in the client's timezone, not the freelancer's.
  useEffect(() => {
    setActiveTimezone(portalData?.timezone ?? null);
  }, [portalData?.timezone]);

  // Signed-in, no token → the freelancer's preview picker, not the dead-end.
  if (!token && isAuthenticated) {
    return <PortalPreview onOpen={(t) => setSearchParams({ token: t })} />;
  }

  if (!token) {
    return <EmptyState title="Portal link required" body="Open the link sent to your email — it's single-use and expires in 15 minutes." />;
  }
  if (error && !redeemed) {
    return (
      <div role="alert">
        <EmptyState
          title={error === "already_used" ? "This link has already been used" : error === "unavailable" ? "Portal is unreachable" : "Link expired"}
          body={
            error === "already_used"
              ? "The magic link is single-use by design — request a new one from your freelancer."
              : error === "unavailable"
                ? "Couldn't reach the portal — check your connection and try opening the link again."
                : error === "expired"
                  ? "The link expired (15-minute window). Ask your freelancer for a fresh one."
                  : "This link isn't valid. Ask your freelancer for a new one."
          }
        />
      </div>
    );
  }
  if (!redeemed || portalData === undefined) {
    return <div className="skeleton" style={{ height: 200 }} aria-hidden="true" />;
  }
  if (portalData === null) {
    return <EmptyState title="Portal session ended" body="Please open a fresh link from your freelancer." />;
  }

  return (
    <div className="page portal-page" style={{ maxWidth: 640 }}>
      <div className="page-head">
        <h2 ref={portalHeadingRef} tabIndex={-1}>Client portal</h2>
        <p className="muted" style={{ marginTop: 4 }}>
          {portalData.contactName}
        </p>
      </div>

      <section className="detail-section">
        <div className="section-head">
          <h3>Projects</h3>
        </div>
        {portalData.projects.length === 0 ? (
          <p className="muted">No projects yet.</p>
        ) : (
          <ul className="portal-list">
            {portalData.projects.map((p, i) => (
              <li key={i} className="definition-row surface-card">
                <div>
                  <strong>{p.name}</strong>
                  <div className="muted">
                    {p.status}
                    {p.deadline ? ` · due ${new Date(p.deadline).toLocaleDateString()}` : ""}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="detail-section">
        <div className="section-head">
          <h3>Invoices</h3>
        </div>
        {portalData.invoices.length === 0 ? (
          <p className="muted">No invoices yet.</p>
        ) : (
          <ul className="portal-list">
            {portalData.invoices.map((inv) => (
              <li key={inv.number} className="definition-row surface-card">
                <div>
                  <strong>{inv.number}</strong>
                  <div className="muted">{inv.status}</div>
                </div>
                <div>
                  {new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(Number(inv.total) / 100)}
                  <div className="muted">{Number(inv.amountPaid) > 0 ? `${new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(Number(inv.amountPaid) / 100)} paid` : "unpaid"}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="detail-section">
        <div className="section-head">
          <h3>Shared documents</h3>
        </div>
        {portalData.documents.length === 0 ? (
          <p className="muted">Nothing shared yet.</p>
        ) : (
          <ul className="portal-list">
            {portalData.documents.map((d, i) => (
              <li key={i} className="definition-row surface-card">
                <strong>{d.type}</strong>
                <span className="muted">{d.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * §20.7 freelancer-facing portal preview — what the signed-in user sees at
 * /portal with no token. Picks a client, mints a fresh 15-min single-use link
 * through the SAME mutation clients' links come from, and opens the portal view
 * with it. Honest about consumption: each preview consumes its link (single-use
 * by design), so refreshing the preview shows the used-link state.
 */
function PortalPreview({ onOpen }: { onOpen: (token: string) => void }) {
  const contacts = useQuery(api.contacts.list, {});
  const createLink = useMutation(api.portal.createPortalLink);
  const { push } = useToasts();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const preview = async (contactId: string, name: string) => {
    setPendingId(contactId);
    try {
      const res = await createLink({ contactId: contactId as Id<"contacts"> });
      if (!res.ok) {
        push({
          message: res.reason === "no_email" ? `${name} has no email on file.` : "Could not create link.",
        });
        return;
      }
      onOpen((res as { token: string }).token);
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="page" style={{ maxWidth: 640 }}>
      <div className="page-head">
        <h2>Client portal preview</h2>
        <p className="muted" style={{ marginTop: 4 }}>
          This is what your client sees when they open a portal link. Each preview mints a fresh
          15-minute, single-use link — it's consumed on first open, so refreshing the preview shows
          the used-link state.
        </p>
      </div>

      {contacts === undefined ? (
        <div className="skeleton" style={{ height: 120 }} aria-hidden="true" />
      ) : contacts.length === 0 ? (
        <EmptyState title="No clients yet" body="Add a client to preview their portal view." />
      ) : (
        <ul className="portal-list">
          {contacts.map((c) => (
            <li key={c._id} className="definition-row surface-card">
              <div>
                <strong>{c.name}</strong>
                {c.company && <div className="muted">{c.company}</div>}
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={pendingId === c._id}
                onClick={() => void preview(c._id, c.name)}
              >
                {pendingId === c._id && <span className="spinner" aria-hidden="true" />}
                Preview
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
