import { useState } from "react";
import { useParams } from "react-router-dom";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { formatMoney, timeAgo } from "../../lib/format";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Modal } from "../ui/Modal";
import { useToasts } from "../ui/useToasts";
import { EmptyState } from "../EmptyState";
import { InvoiceForm } from "./InvoiceForm";

const STATUS_LABEL: Record<string, string> = {
  draft: "draft",
  sent: "sent",
  viewed: "viewed",
  paid: "paid",
  partially_paid: "partially paid",
  overdue: "overdue",
  void: "void",
  refunded: "refunded",
};

/**
 * §15/§22.18 — invoice detail. Financial actions (send, void) are
 * confirm-first per §23.9 (never undo-after). The PDF preview uses the
 * print-only stylesheet (§22.18) — white bg, black text, no glass.
 */
export function InvoiceDetail() {
  const { invoiceId = "" } = useParams();
  const { push } = useToasts();
  const data = useQuery(api.invoices.get, { invoiceId: invoiceId as any });
  const sendAction = useAction(api.email.sendInvoice);
  const voidInvoice = useMutation(api.invoices.voidInvoice);
  const [sendOpen, setSendOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (data === undefined) return <div className="skeleton" style={{ height: 240 }} aria-hidden="true" />;
  if (!data) return <EmptyState title="Invoice not found" body="It doesn't exist or you don't have access." />;

  const { invoice, contact, project, lineItems, status } = data;
  const included = lineItems.filter((l) => l.included);
  const remaining = invoice.total - invoice.amountPaid;

  const doSend = async () => {
    setError(null);
    try {
      await sendAction({ invoiceId: invoiceId as any });
      push({ message: `${invoice.invoiceNumber} sent` });
      setSendOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed.");
    }
  };

  const doVoid = async () => {
    setError(null);
    try {
      await voidInvoice({ invoiceId: invoiceId as any });
      push({ message: `${invoice.invoiceNumber} voided` });
      setVoidOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not void.");
    }
  };

  const canVoid = invoice.amountPaid === 0n;

  return (
    <div className="page">
      <div className="page-head">
        <h2 className="num">{invoice.invoiceNumber}</h2>
        <div className="detail-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setPdfOpen(true)}>View PDF</button>
          {status === "draft" && (
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setEditOpen(true)}>Edit</button>
              <button type="button" className="btn btn-primary" onClick={() => setSendOpen(true)}>
                Send invoice
              </button>
            </>
          )}
          {canVoid && status !== "void" && status !== "paid" && (
            <button type="button" className="btn btn-danger-ghost" onClick={() => setVoidOpen(true)}>Void</button>
          )}
        </div>
      </div>

      <div className="detail-head surface-card">
        <div className="detail-title-row">
          <h3>{contact.name}</h3>
          <span className={`status status-${status}`}>{STATUS_LABEL[status] ?? status}</span>
        </div>
        <div className="detail-meta">
          <div className="meta-block">
            <span className="meta-label">Total</span>
            <div className="meta-value num">{formatMoney(invoice.total, invoice.currency)}</div>
          </div>
          <div className="meta-block">
            <span className="meta-label">Paid</span>
            <div className="meta-value num">{formatMoney(invoice.amountPaid, invoice.currency)}</div>
          </div>
          <div className="meta-block">
            <span className="meta-label">Remaining</span>
            <div className="meta-value num">{formatMoney(remaining, invoice.currency)}</div>
          </div>
          <div className="meta-block">
            <span className="meta-label">Due</span>
            <div className="meta-value num">{invoice.dueAt ? timeAgo(invoice.dueAt) : "—"}</div>
          </div>
        </div>
      </div>

      <section className="detail-section">
        <h3>Line items</h3>
        {included.length === 0 ? (
          <p className="muted">No line items.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {included.map((l) => (
                  <tr key={l._id}>
                    <td>{l.description}</td>
                    <td className="num money">{formatMoney(l.amount, invoice.currency)}</td>
                  </tr>
                ))}
                {invoice.taxAmount !== undefined && invoice.taxAmount > 0n && (
                  <tr>
                    <td className="muted">
                      Tax{invoice.taxRate !== undefined ? ` (${invoice.taxRate}%)` : ""}
                    </td>
                    <td className="num money">{formatMoney(invoice.taxAmount, invoice.currency)}</td>
                  </tr>
                )}
                <tr>
                  <td><strong>Total</strong></td>
                  <td className="num money"><strong>{formatMoney(invoice.total, invoice.currency)}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      {error && (
        <div className="field-error-message" role="alert" style={{ margin: "12px 0" }}>
          {error}
        </div>
      )}

      <ConfirmDialog
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        onConfirm={doSend}
        title="Send invoice"
        body={
          <>
            This emails <strong>{invoice.invoiceNumber}</strong> to the client's primary address. Payment
            links appear once Stripe or Paystack is connected.
          </>
        }
        confirmLabel="Send invoice"
        danger={false}
      />

      <ConfirmDialog
        open={voidOpen}
        onClose={() => setVoidOpen(false)}
        onConfirm={doVoid}
        title="Void invoice"
        body={
          <>
            This voids <strong>{invoice.invoiceNumber}</strong>. It can’t be undone, and any future payment
            will still show on the record.
          </>
        }
        confirmLabel="Void invoice"
      />

      {pdfOpen && (
        <Modal open onClose={() => setPdfOpen(false)} title={`${invoice.invoiceNumber} — PDF preview`} width={720}>
          <div className="pdf-preview">
            <InvoicePdfBody invoice={invoice} contactName={contact.name} lineItems={included} />
          </div>
        </Modal>
      )}

      {editOpen && (
        <InvoiceForm
          onClose={() => setEditOpen(false)}
          existing={{ invoice, contact, project, lineItems: lineItems.filter((l) => l.included) }}
        />
      )}
    </div>
  );
}

/** §22.18 print-only preview — the same document the email action renders. */
function InvoicePdfBody({
  invoice,
  contactName,
  lineItems,
}: {
  invoice: any;
  contactName: string;
  lineItems: { description: string; amount: bigint }[];
}) {
  const tax = invoice.taxAmount ?? 0n;
  return (
    <div className="print-doc">
      <div className="print-head">
        <div>
          <h1>Invoice</h1>
          <div className="print-from"><strong>From</strong> Signal</div>
        </div>
        <div className="print-no num">{invoice.invoiceNumber}</div>
      </div>
      <div className="print-to"><strong>Bill to</strong> {contactName}</div>
      <table className="print-table">
        <thead>
          <tr>
            <th>Description</th>
            <th style={{ textAlign: "right" }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {lineItems.map((l, i) => (
            <tr key={i}>
              <td>{l.description}</td>
              <td className="num">{formatMoney(l.amount, invoice.currency)}</td>
            </tr>
          ))}
          {tax > 0n && (
            <tr>
              <td className="muted">Tax</td>
              <td className="num">{formatMoney(tax, invoice.currency)}</td>
            </tr>
          )}
          <tr className="print-total">
            <td>Total due</td>
            <td className="num">{formatMoney(invoice.total - invoice.amountPaid, invoice.currency)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
