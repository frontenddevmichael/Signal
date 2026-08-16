import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useToasts } from "../ui/useToasts";

/**
 * §17 per-client Gmail setup — the "one small one-time friction per client"
 * the PRD is explicit about. Surfaces BOTH the filter text and the forwarding
 * address as a single copy-button block (§23.7 — nothing to retype), tracks
 * added_to_filter and forwarding_confirmed (§23.2 status visibility), and
 * splits into numbered filter groups past the OR-chain ceiling (§17).
 */
export function GmailSetupBlock({ contactId }: { contactId: Id<"contacts"> }) {
  const setup = useQuery(api.gmailSetup.setupForContact, { contactId });
  const ensure = useMutation(api.gmailSetup.ensureSetup);
  const markAdded = useMutation(api.gmailSetup.markAddedToFilter);
  const { push } = useToasts();
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      push({ message: "Copy failed — select the text manually." });
    }
  };

  const doEnsure = async () => {
    try {
      await ensure({ contactId });
    } catch {
      push({ message: "Could not set up forwarding rows." });
    }
  };

  const doMarkAdded = async () => {
    try {
      await markAdded({ contactId });
    } catch {
      push({ message: "Could not mark the filter as added." });
    }
  };

  if (setup === undefined) {
    return <div className="skeleton" style={{ height: 90 }} aria-hidden="true" />;
  }

  const anyPendingConfirmation = setup.rows.some((r) => !r.forwardingConfirmed);
  const anyAdded = setup.rows.some((r) => r.addedToFilter);
  const groups = new Map<number, { text: string; added: boolean; confirmed: boolean }[]>();
  for (const block of setup.blocks) {
    // Match the row for THIS filter group. Splitting past the OR-chain ceiling
    // mints group 2+ rows — `rows[0]` would read group 1's status onto all of
    // them, showing "confirmed" for filters that never were.
    const row = setup.rows.find((r) => r.filterGroup === block.group);
    groups.set(block.group, [
      ...(groups.get(block.group) ?? []),
      { text: block.filterText, added: row?.addedToFilter ?? false, confirmed: row?.forwardingConfirmed ?? false },
    ]);
  }

  if (setup.rows.length === 0) {
    return (
      <div className="gmail-setup surface-card">
        <div className="section-head">
          <h3>Gmail forwarding</h3>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void doEnsure()}>
            Set up
          </button>
        </div>
        <p className="muted">
          Auto-log client emails into this timeline at $0 — no Gmail read access, ever (§17). Requires
          one manual filter + a forwarding confirmation per client.
        </p>
      </div>
    );
  }

  return (
    <div className="gmail-setup surface-card">
      <div className="section-head">
        <h3>Gmail forwarding</h3>
        <span className={`status ${anyPendingConfirmation ? "status-pending" : "status-active"}`}>
          {anyPendingConfirmation ? "pending confirmation" : "active"}
        </span>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        {anyPendingConfirmation
          ? "Google still needs to confirm the forwarding address — add it in Gmail, then paste the code it emails here to finish."
          : "Client mail forwarding is live — messages land on this timeline automatically."}
      </p>

      {setup.forwardingAddress && (
        <div className="copy-block">
          <label className="row-label">1 · Add this forwarding address in Gmail (Settings → Forwarding)</label>
          <div className="copy-row">
            <code className="copy-text">{setup.forwardingAddress}</code>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copy("addr", setup.forwardingAddress!)}>
              {copied === "addr" ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}

      {[...groups.entries()].map(([group, blocks]) => (
        <div className="copy-block" key={group}>
          <label className="row-label">
            {group > 1 ? `${group} · Paste this second filter block in Gmail (Settings → Filters)` : "2 · Paste this filter in Gmail (Settings → Filters)"}
          </label>
          {blocks.map((b) => (
            <div className="copy-row" key={b.text}>
              <code className="copy-text">{b.text}</code>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copy(`f${group}`, b.text)}>
                {copied === `f${group}` ? "Copied" : "Copy"}
              </button>
            </div>
          ))}
        </div>
      ))}

      <div className="gmail-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void doMarkAdded()}>
          {anyAdded ? "I've updated the filter" : "I've added the filter"}
        </button>
        {anyPendingConfirmation && (
          <span className="muted">You'll see the confirmation code here when Google sends it to the forwarding address.</span>
        )}
      </div>
      {setup.rows.some((r) => r.lastConfirmationCode) && (
        <div className="field-note" role="status">
          Google confirmation code: <strong>{setup.rows.find((r) => r.lastConfirmationCode)?.lastConfirmationCode}</strong> — paste it
          into Gmail to finish.
        </div>
      )}
    </div>
  );
}
