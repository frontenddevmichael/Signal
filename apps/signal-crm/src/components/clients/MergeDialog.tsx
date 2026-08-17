import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { buildMergePlan } from "../../../convex/mergeLogic";
import { Modal } from "../ui/Modal";
import { useToasts } from "../ui/useToasts";
import { friendlyError } from "../../lib/errors";

type ContactPayload = {
  name: string;
  company?: string;
  status: "lead" | "active" | "closed";
  source?: "referral" | "cold_outreach" | "platform";
  tags: string[];
  timezone?: string;
  emails: { email: string; isPrimary: boolean }[];
  phones: { phoneNumber: string; isPrimary: boolean }[];
};

const toPlanDoc = (c: { _id: string; name: string; company?: string; timezone?: string; tags: string[]; createdAt: number }) => ({
  _id: c._id,
  name: c.name,
  company: c.company,
  timezone: c.timezone,
  tags: c.tags,
  createdAt: c.createdAt,
});

/**
 * §20.6 merge flow. Two entry points:
 * - duplicate prompt from ContactForm (payload passed → contact B is created
 *   with force, then merged away — same write path the merge mutation tests).
 * - explicit "merge" on the client detail page (otherContactId provided).
 *
 * The OLDER contact survives (§20.6, pickSurvivor). Conflicting single-value
 * fields (name/timezone/company) require an explicit per-field choice here —
 * never a silent default. audit_log records both original IDs (backend).
 */
export function MergeDialog({
  contactId,
  otherContactId,
  payload,
  onClose,
}: {
  contactId: string;
  otherContactId?: string;
  payload?: ContactPayload;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { push } = useToasts();
  const create = useMutation(api.contacts.create);
  const merge = useMutation(api.contacts.merge);
  const undoMerge = useMutation(api.contacts.undoMerge);

  const [createdOtherId, setCreatedOtherId] = useState<string | null>(null);
  const [creating, setCreating] = useState(Boolean(payload));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, string>>({});
  const initialized = useRef(false);
  const createStarted = useRef(false);

  // Duplicate path: materialize contact B (force) once so the merge mutation
  // has it. The ref guard is the StrictMode idempotency guard (the audit's
  // double-create): a deps-`[]` effect re-runs its setup under StrictMode and
  // would dispatch contacts.create TWICE → an orphan contact B. The ref
  // short-circuits the second setup BEFORE any state update is stranded, so
  // the single dispatch's setState always lands (React 18+ no-ops on a truly
  // unmounted instance, which is why the old `alive` cleanup was harmful AND
  // insufficient — it let the second create through AND dropped the first).
  useEffect(() => {
    if (!payload || createStarted.current) return;
    createStarted.current = true;
    void (async () => {
      try {
        const res = await create({ ...payload, force: true });
        setCreatedOtherId(res.created);
      } catch (e) {
        setError(friendlyError(e, "Could not create contact."));
      } finally {
        setCreating(false);
      }
    })();
  }, [payload, create]);

  const bId = otherContactId ?? createdOtherId;
  const a = useQuery(api.contacts.get, { contactId: contactId as Id<"contacts"> });
  const b = useQuery(api.contacts.get, { contactId: (bId ?? "_") as Id<"contacts"> });

  const mergeInfo = useMemo(() => {
    if (!a?.contact || !b?.contact) return null;
    const docA = toPlanDoc(a.contact);
    const docB = toPlanDoc(b.contact);
    // §20.6 — the OLDER contact survives; the plan is built survivor-first so
    // conflict labels are correct.
    const survivor = docB.createdAt < docA.createdAt ? docB : docA;
    const other = survivor._id === docA._id ? docB : docA;
    const plan = buildMergePlan(survivor, other);
    return {
      plan,
      survivorId: survivor._id,
      survivorName: survivor.name,
      otherName: other.name,
    };
  }, [a, b]);
  const plan = mergeInfo?.plan ?? null;
  const survivorId = mergeInfo?.survivorId ?? null;
  const survivorName = mergeInfo?.survivorName ?? null;
  const otherName = mergeInfo?.otherName ?? null;

  // Pre-fill resolutions with the survivor's values (the safe default) once.
  useEffect(() => {
    if (!plan || initialized.current) return;
    initialized.current = true;
    const defaults: Record<string, string> = {};
    for (const c of plan.conflicts) {
      defaults[c.field] = c.survivorValue ?? "";
    }
    setResolutions(defaults);
  }, [plan]);

  if (creating) {
    return (
      <Modal open onClose={onClose} title="Preparing merge">
        <p>Setting up the duplicate record…</p>
      </Modal>
    );
  }

  if (!a?.contact || !b?.contact || !plan || !survivorId || !survivorName || !otherName) {
    return (
      <Modal open onClose={onClose} title="Merge clients">
        <p>{error ?? "Loading…"}</p>
      </Modal>
    );
  }

  const mergedName = resolutions.name || survivorName;

  const confirm = async () => {
    setPending(true);
    setError(null);
    try {
      const otherId = survivorId === a.contact._id ? b.contact._id : a.contact._id;
      const res = await merge({
        survivorId: survivorId as Id<"contacts">,
        otherId: otherId as Id<"contacts">,
        resolutions: {
          name: resolutions.name || undefined,
          timezone: resolutions.timezone || undefined,
          company: resolutions.company || undefined,
        },
      });
      // §23.3 — the merge is reversible: Undo restores the absorbed contact
      // and its rows, and lands on the restored client.
      push({
        message: `Merged into ${mergedName}`,
        undoLabel: "Undo",
        onUndo: () => {
          void undoMerge({ undoId: res.undoId })
            .then((r) => navigate(`/clients/${r.contactId}`))
            .catch(() => push({ message: "Could not restore the merged client." }));
        },
      });
      onClose();
      navigate(`/clients/${survivorId}`);
    } catch (e) {
      setError(friendlyError(e, "Merge failed."));
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Merge clients" width={560}>
      <p className="confirm-body">
        This will merge <strong>{otherName}</strong> into <strong>{survivorName}</strong>. Their
        projects, notes, emails, phones and timeline combine under one client record.
      </p>

      {plan.conflicts.length > 0 && (
        <fieldset className="merge-conflicts">
          <legend>Conflicting fields — pick one per field</legend>
          {plan.conflicts.map((c) => (
            <div key={c.field} className="field">
              <label>{c.field}</label>
              <div className="conflict-options">
                <label className="conflict-option">
                  <input
                    type="radio"
                    name={`conflict-${c.field}`}
                    checked={resolutions[c.field] === c.survivorValue}
                    onChange={() => setResolutions({ ...resolutions, [c.field]: c.survivorValue ?? "" })}
                  />
                  <span>
                    <strong>{survivorName}:</strong> {c.survivorValue || "(empty)"}
                  </span>
                </label>
                <label className="conflict-option">
                  <input
                    type="radio"
                    name={`conflict-${c.field}`}
                    checked={resolutions[c.field] === c.otherValue}
                    onChange={() => setResolutions({ ...resolutions, [c.field]: c.otherValue ?? "" })}
                  />
                  <span>
                    <strong>{otherName}:</strong> {c.otherValue || "(empty)"}
                  </span>
                </label>
              </div>
            </div>
          ))}
        </fieldset>
      )}

      {error && (
        <div className="field-error-message" role="alert" style={{ marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose} disabled={pending}>
          Cancel
        </button>
        <button type="button" className="btn btn-danger" onClick={() => void confirm()} disabled={pending}>
          {pending && <span className="spinner" aria-hidden="true" />}
          {pending ? "Merging…" : "Merge clients"}
        </button>
      </div>
    </Modal>
  );
}
