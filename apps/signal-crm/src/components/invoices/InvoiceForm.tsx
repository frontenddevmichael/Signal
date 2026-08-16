import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Modal } from "../ui/Modal";
import { useToasts } from "../ui/useToasts";
import { formatMoney } from "../../lib/format";

interface PickedItem {
  description: string;
  amount: bigint;
  activityId?: string;
}

/**
 * §3/§9 — manual line items, plus SUGGESTED line items from billable
 * repo_activity (included by default but fully editable/removable — never
 * auto-confirmed into a sent invoice). Suggested items from a repo with more
 * than one active project link carry the §9 "also linked to [other client]"
 * flag, surfacing the ambiguity right before something gets billed.
 *
 * When `existing` is passed this is EDIT mode (§12 draft gap): the invoice is
 * bound to its project of origin (the API has no re-parenting), so the client
 * and project selects are locked; the line items list is replaced wholesale.
 */
export function InvoiceForm({
  onClose,
  existing,
}: {
  onClose: () => void;
  existing?: {
    invoice: any;
    contact: any;
    project: any;
    lineItems: { description: string; amount: bigint; source: string; sourceActivityId?: any }[];
  };
}) {
  const contacts = useQuery(api.contacts.list, {});
  const create = useMutation(api.invoices.create);
  const update = useMutation(api.invoices.update);
  const { push } = useToasts();

  const [contactId, setContactId] = useState(existing?.contact._id ?? "");
  const [projectId, setProjectId] = useState(existing?.project._id ?? "");
  const [currency, setCurrency] = useState(existing?.invoice.currency ?? "USD");
  const [taxAmount, setTaxAmount] = useState(
    existing && existing.invoice.taxAmount ? existing.invoice.taxAmount.toString() : "",
  );
  const [taxRate, setTaxRate] = useState(existing?.invoice.taxRate?.toString() ?? "");
  const [dueAt, setDueAt] = useState(
    existing?.invoice.dueAt ? new Date(existing.invoice.dueAt).toISOString().slice(0, 10) : "",
  );
  const [manualItems, setManualItems] = useState<PickedItem[]>(
    existing?.lineItems.map((l) => ({
      description: l.description,
      amount: l.amount,
      activityId: l.sourceActivityId ?? undefined,
    })) ?? [],
  );
  const [manualDesc, setManualDesc] = useState("");
  const [manualAmount, setManualAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const editing = existing !== undefined;

  // Hooks must be unconditional — sentinel args when nothing is selected yet.
  const projects = useQuery(api.projects.listByContact, { contactId: (contactId || "_") as any }) ?? [];
  const suggestions = useQuery(api.invoices.suggestedLineItems, { projectId: (projectId || "_") as any }) ?? [];

  useEffect(() => {
    setProjectId("");
  }, [contactId]);

  const pickedSuggestions = suggestions.filter((s) => {
    const manual = manualItems.find((m) => m.activityId === s.activityId);
    return !manual || manual.description !== s.title;
  });

  const addManual = () => {
    const amount = BigInt(Math.round(parseFloat(manualAmount) * 100));
    if (!manualDesc.trim() || amount <= 0n) return;
    setManualItems([...manualItems, { description: manualDesc.trim(), amount }]);
    setManualDesc("");
    setManualAmount("");
  };

  const addSuggestion = (s: (typeof suggestions)[number]) => {
    setManualItems([...manualItems, { description: s.title, amount: 500_00n, activityId: s.activityId }]);
  };

  const subtotalMinor = manualItems.reduce((sum, i) => sum + i.amount, 0n);
  const taxMinor = BigInt(Math.round(parseFloat(taxAmount || "0") * 100));
  const totalMinor = subtotalMinor + taxMinor;

  const submit = async () => {
    setError(null);
    setPending(true);
    try {
      if (!projectId) throw new Error("Pick a project first.");
      if (editing) {
        await update({
          invoiceId: existing.invoice._id,
          currency,
          subtotal: subtotalMinor,
          taxRate: taxRate ? parseFloat(taxRate) : undefined,
          taxAmount: taxMinor > 0n ? taxMinor : undefined,
          dueAt: dueAt ? new Date(dueAt + "T23:59:59").getTime() : undefined,
          lineItems: manualItems.map((i) => ({
            description: i.description,
            amount: i.amount,
            source: i.activityId ? "github_activity" : "manual",
            sourceActivityId: i.activityId as any,
          })),
        });
        push({ message: "Invoice updated" });
      } else {
        const res = await create({
          projectId: projectId as any,
          currency,
          subtotal: subtotalMinor,
          taxRate: taxRate ? parseFloat(taxRate) : undefined,
          taxAmount: taxMinor > 0n ? taxMinor : undefined,
          dueAt: dueAt ? new Date(dueAt + "T23:59:59").getTime() : undefined,
          lineItems: manualItems.map((i) => ({
            description: i.description,
            amount: i.amount,
            source: i.activityId ? "github_activity" : "manual",
            sourceActivityId: i.activityId as any,
          })),
        });
        push({ message: `${res.number} created` });
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save invoice.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={editing ? "Edit invoice" : "New invoice"} width={640}>
      <div className="field">
        <label htmlFor="iv-contact" className="required">Client</label>
        <select id="iv-contact" className="input" value={contactId} onChange={(e) => setContactId(e.target.value)} disabled={editing}>
          <option value="">—</option>
          {(contacts ?? []).map((c) => (
            <option key={c._id} value={c._id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="iv-project" className="required">Project</label>
        <select id="iv-project" className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={!contactId || editing}>
          <option value="">—</option>
          {projects.map((p) => (
            <option key={p._id} value={p._id}>{p.name}</option>
          ))}
        </select>
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="iv-currency">Currency</label>
          <select id="iv-currency" className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {["USD", "EUR", "GBP", "NGN"].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="iv-due">Due date</label>
          <input id="iv-due" type="date" className="input" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
        </div>
      </div>

      <fieldset className="contact-list-fieldset">
        <legend>Line items</legend>
        {manualItems.map((item, i) => (
          <div className="list-row" key={i}>
            <span className="item-desc">{item.description}</span>
            <span className="num">{formatMoney(item.amount, currency)}</span>
            <button type="button" className="icon-btn" aria-label="Remove item" onClick={() => setManualItems(manualItems.filter((_, j) => j !== i))}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        ))}
        <div className="list-row">
          <input className="input" placeholder="Description" value={manualDesc} onChange={(e) => setManualDesc(e.target.value)} aria-label="Item description" />
          <input className="input" placeholder="Amount" type="number" step="0.01" min="0" value={manualAmount} onChange={(e) => setManualAmount(e.target.value)} aria-label="Item amount" style={{ width: 110 }} />
          <button type="button" className="btn btn-ghost btn-sm" onClick={addManual}>Add</button>
        </div>
      </fieldset>

      {projectId && (suggestions ?? []).length > 0 && (
        <fieldset className="contact-list-fieldset">
          <legend>Suggestions from GitHub activity (§9)</legend>
          <p className="muted" style={{ marginTop: 0 }}>
            Billable activity on this project's repos. These are suggestions — review before sending.
          </p>
          {pickedSuggestions.slice(0, 20).map((s) => (
            <div className="list-row" key={s.activityId}>
              <span className="item-desc">
                {s.title}
                {s.multiLinked && s.otherContact && (
                  <span className="already-linked"> also linked to {s.otherContact}</span>
                )}
              </span>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => addSuggestion(s)}>Add</button>
            </div>
          ))}
        </fieldset>
      )}

      <div className="field-row">
        <div className="field">
          <label htmlFor="iv-taxrate">Tax rate (%)</label>
          <input id="iv-taxrate" className="input" type="number" step="0.01" min="0" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} placeholder="e.g. 7.5" />
        </div>
        <div className="field">
          <label htmlFor="iv-tax">Tax amount</label>
          <input id="iv-tax" className="input" type="number" step="0.01" min="0" value={taxAmount} onChange={(e) => setTaxAmount(e.target.value)} placeholder="0.00" />
        </div>
      </div>
      <div className="invoice-total num">
        Subtotal {formatMoney(subtotalMinor, currency)} · Tax {formatMoney(taxMinor, currency)} ·{" "}
        <strong>Total {formatMoney(totalMinor, currency)}</strong>
      </div>

      {error && (
        <div className="field-error-message" role="alert" style={{ marginBottom: 12 }}>
          {error}
        </div>
      )}
      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose} disabled={pending}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={pending || !projectId || manualItems.length === 0}>
          {pending ? (editing ? "Saving…" : "Creating…") : editing ? "Save changes" : "Create invoice"}
        </button>
      </div>
    </Modal>
  );
}
