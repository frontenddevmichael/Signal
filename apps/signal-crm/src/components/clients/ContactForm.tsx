import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Modal } from "../ui/Modal";
import { MergeDialog } from "./MergeDialog";

interface EmailRow { email: string; isPrimary: boolean }
interface PhoneRow { phoneNumber: string; isPrimary: boolean }

/**
 * §18 contact_emails/contact_phones are separate tables — multiple per contact
 * with an is_primary flag from the start (§9's second-address edge case). The
 * form manages lists of them, never a single field.
 *
 * §20.6: on submit the create mutation checks for duplicates; when one is found
 * the form surfaces the merge-or-create-anyway choice instead of silently
 * duplicating.
 */
export function ContactForm({
  open,
  onClose,
  initial,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  initial?: {
    contactId: string;
    name: string;
    company?: string;
    status: "lead" | "active" | "closed";
    source?: "referral" | "cold_outreach" | "platform";
    tags: string[];
    timezone?: string;
    emails: EmailRow[];
    phones: PhoneRow[];
  };
  onSaved?: () => void;
}) {
  const create = useMutation(api.contacts.create);
  const update = useMutation(api.contacts.update);
  const syncEmails = useMutation(api.contacts.syncEmails);
  const syncPhones = useMutation(api.contacts.syncPhones);

  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [status, setStatus] = useState<"lead" | "active" | "closed">("lead");
  const [source, setSource] = useState("");
  const [tags, setTags] = useState("");
  const [timezone, setTimezone] = useState("");
  const [emails, setEmails] = useState<EmailRow[]>([{ email: "", isPrimary: true }]);
  const [phones, setPhones] = useState<PhoneRow[]>([{ phoneNumber: "", isPrimary: true }]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [duplicate, setDuplicate] = useState<{ contactId: string; name: string } | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);

  // `initial` is a fresh object every parent render (inline prop), so keying the
  // effect on it would re-snapshot and wipe in-progress edits on ANY re-render
  // (a background Convex update, a palette keystroke…). Snapshot only when the
  // dialog transitions from closed → open, using the latest value then.
  const initialRef = useRef(initial);
  initialRef.current = initial;
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open && !wasOpen.current) {
      const init = initialRef.current;
      setName(init?.name ?? "");
      setCompany(init?.company ?? "");
      setStatus(init?.status ?? "lead");
      setSource(init?.source ?? "");
      setTags(init?.tags.join(", ") ?? "");
      setTimezone(init?.timezone ?? "");
      setEmails(init?.emails.length ? init.emails : [{ email: "", isPrimary: true }]);
      setPhones(init?.phones.length ? init.phones : [{ phoneNumber: "", isPrimary: true }]);
      setError(null);
      setDuplicate(null);
    }
    wasOpen.current = open;
  }, [open]);

  const buildPayload = () => ({
    name,
    company: company.trim() || undefined,
    status,
    source: (source || undefined) as "referral" | "cold_outreach" | "platform" | undefined,
    tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
    timezone: timezone.trim() || undefined,
    emails: emails.filter((e) => e.email.trim()).map((e) => ({ email: e.email.trim(), isPrimary: e.isPrimary })),
    phones: phones.filter((p) => p.phoneNumber.trim()).map((p) => ({ phoneNumber: p.phoneNumber.trim(), isPrimary: p.isPrimary })),
  });

  const submit = async (force = false) => {
    setError(null);
    setPending(true);
    try {
      const payload = buildPayload();
      if (initial) {
        const { emails: emailRows, phones: phoneRows, ...base } = payload;
        await update({ contactId: initial.contactId as Id<"contacts">, ...base });
        // §18 emails/phones live in separate tables — reconcile the full set.
        await syncEmails({ contactId: initial.contactId as Id<"contacts">, emails: emailRows });
        await syncPhones({ contactId: initial.contactId as Id<"contacts">, phones: phoneRows });
      } else {
        const res = await create({ ...payload, force });
        if (res.duplicate) {
          setDuplicate(res.duplicate);
          return; // keep the form open; MergeDialog takes over
        }
      }
      onClose();
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save contact.");
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Modal open={open} onClose={onClose} title={initial ? "Edit client" : "Add client"}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          noValidate
        >
          <div className={`field${error ? " field-error" : ""}`}>
            <label htmlFor="cf-name" className="required">Name</label>
            <input
              id="cf-name"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              aria-invalid={error !== null}
              aria-describedby={error ? "cf-error" : undefined}
            />
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="cf-company">Company</label>
              <input id="cf-company" className="input" value={company} onChange={(e) => setCompany(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="cf-status">Status</label>
              <select id="cf-status" className="input" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
                <option value="lead">lead</option>
                <option value="active">active</option>
                <option value="closed">closed</option>
              </select>
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="cf-source">Source</label>
              <select id="cf-source" className="input" value={source} onChange={(e) => setSource(e.target.value)}>
                <option value="">—</option>
                <option value="referral">referral</option>
                <option value="cold_outreach">cold outreach</option>
                <option value="platform">platform</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="cf-timezone">Timezone</label>
              <input id="cf-timezone" className="input" placeholder="Africa/Lagos" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="cf-tags">Tags (comma separated)</label>
            <input id="cf-tags" className="input" placeholder="design, retainer" value={tags} onChange={(e) => setTags(e.target.value)} />
          </div>

          <fieldset className="contact-list-fieldset">
            <legend>Emails</legend>
            {emails.map((row, i) => (
              <div className="list-row" key={i}>
                <input
                  type="email"
                  className="input"
                  aria-label={`Email ${i + 1}`}
                  value={row.email}
                  onChange={(e) =>
                    setEmails(emails.map((r, j) => (j === i ? { ...r, email: e.target.value } : r)))
                  }
                />
                <label className="primary-toggle">
                  <input
                    type="radio"
                    name="primary-email"
                    checked={row.isPrimary}
                    onChange={() =>
                      setEmails(emails.map((r, j) => ({ ...r, isPrimary: j === i })))
                    }
                  />
                  primary
                </label>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Remove email"
                  onClick={() => setEmails(emails.filter((_, j) => j !== i))}
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
                    strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                  {/* §5.6 — visible on touch where hover tooltips don't exist. */}
                  <span className="touch-label">Remove</span>
                </button>
              </div>
            ))}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEmails([...emails, { email: "", isPrimary: false }])}>
              Add email
            </button>
          </fieldset>

          <fieldset className="contact-list-fieldset">
            <legend>Phone numbers</legend>
            {phones.map((row, i) => (
              <div className="list-row" key={i}>
                <input
                  type="tel"
                  className="input"
                  aria-label={`Phone ${i + 1}`}
                  value={row.phoneNumber}
                  onChange={(e) =>
                    setPhones(phones.map((r, j) => (j === i ? { ...r, phoneNumber: e.target.value } : r)))
                  }
                />
                <label className="primary-toggle">
                  <input
                    type="radio"
                    name="primary-phone"
                    checked={row.isPrimary}
                    onChange={() => setPhones(phones.map((r, j) => ({ ...r, isPrimary: j === i })))}
                  />
                  primary
                </label>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Remove phone"
                  onClick={() => setPhones(phones.filter((_, j) => j !== i))}
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
                    strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                  {/* §5.6 — visible on touch where hover tooltips don't exist. */}
                  <span className="touch-label">Remove</span>
                </button>
              </div>
            ))}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPhones([...phones, { phoneNumber: "", isPrimary: false }])}>
              Add phone
            </button>
          </fieldset>

          {error && (
            <div id="cf-error" className="field-error-message" role="alert" style={{ marginBottom: 12 }}>
              {error}
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={pending}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending || !name.trim()}>
              {pending && <span className="spinner" aria-hidden="true" />}
              {initial ? "Save changes" : "Add client"}
            </button>
          </div>
        </form>
      </Modal>

      {duplicate && !mergeOpen && (
        <Modal open onClose={() => setDuplicate(null)} title="Duplicate client" width={460}>
          <p className="confirm-body">
            <strong>{duplicate.name}</strong> already exists with this email or phone. Merge the new
            record into it, or create it anyway as a separate client?
          </p>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setDuplicate(null)} disabled={pending}>
              Cancel
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => void submit(true)} disabled={pending}>
              {pending ? "Creating…" : "Create anyway"}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setMergeOpen(true)}>
              Merge…
            </button>
          </div>
        </Modal>
      )}
      {duplicate && mergeOpen && (
        <MergeDialog
          contactId={duplicate.contactId}
          payload={buildPayload()}
          onClose={() => {
            setMergeOpen(false);
            setDuplicate(null);
            onClose();
          }}
        />
      )}
    </>
  );
}
