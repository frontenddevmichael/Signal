/**
 * §22.18 — server-side invoice PDF with a SEPARATE print-specific stylesheet:
 * white background, black text, no glass, no dark mode, Geist Mono for all
 * figures, minimal branding — the freelancer's own name only, never the CRM's.
 * Generated as a clean printable HTML document (browsers/print-to-PDF), which
 * is the $0 path the PRD's cost section favors over a paid rendering API.
 */

export interface PdfInvoice {
  invoiceNumber: string;
  currency: string;
  subtotal: bigint;
  taxAmount: bigint;
  taxRate?: number;
  total: bigint;
  amountPaid: bigint;
  issuedAt?: number;
  dueAt?: number;
  fromName: string;
  clientName: string;
  lineItems: { description: string; amount: bigint; included: boolean }[];
}

export function formatMoney(amount: bigint, currency: string): string {
  const minor = Number(amount);
  const major = (minor / 100).toFixed(2);
  const symbols: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", NGN: "₦" };
  return `${symbols[currency] ?? ""}${major} ${currency}`;
}

/** The print-only document — self-contained, no app CSS, Geist Mono figures. */
export function renderInvoicePdf(inv: PdfInvoice): string {
  const lines = inv.lineItems.filter((l) => l.included);
  const rows = lines
    .map(
      (l) =>
        `<tr><td>${escapeHtml(l.description)}</td><td class="num">${formatMoney(l.amount, inv.currency)}</td></tr>`,
    )
    .join("");
  const tax = inv.taxAmount > 0n
    ? `<tr><td class="muted">Tax${inv.taxRate !== undefined ? ` (${inv.taxRate}%)` : ""}</td><td class="num">${formatMoney(inv.taxAmount, inv.currency)}</td></tr>`
    : "";
  const paid = inv.amountPaid > 0n
    ? `<tr><td class="muted">Paid</td><td class="num">−${formatMoney(inv.amountPaid, inv.currency)}</td></tr>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Invoice ${escapeHtml(inv.invoiceNumber)}</title>
<style>
  /* §22.18 — print-only. White bg, black text, no glass, no dark mode. */
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #ffffff; color: #000000; font-family: "Inter", -apple-system, sans-serif; font-size: 13px; line-height: 1.5; padding: 48px; max-width: 720px; }
  .num { font-family: "Geist Mono", ui-monospace, monospace; }
  header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #000; padding-bottom: 16px; margin-bottom: 32px; }
  h1 { font-size: 22px; font-weight: 700; }
  .invoice-no { text-align: right; font-weight: 600; }
  .from, .to { margin-bottom: 24px; }
  .from strong, .to strong { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin: 24px 0; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; border-bottom: 1px solid #000; padding: 6px 0; }
  td { padding: 8px 0; border-bottom: 1px solid #ddd; }
  td.num { text-align: right; }
  .total-row td { font-weight: 700; border-bottom: none; }
  .muted { color: #555; }
  .meta { margin-top: 40px; font-size: 11px; color: #555; }
</style>
</head>
<body>
  <header>
    <div><h1>Invoice</h1><div class="from"><strong>From</strong>${escapeHtml(inv.fromName)}</div></div>
    <div class="invoice-no num">${escapeHtml(inv.invoiceNumber)}<br />${inv.issuedAt ? new Date(inv.issuedAt).toLocaleDateString() : ""}</div>
  </header>
  <div class="to"><strong>Bill to</strong>${escapeHtml(inv.clientName)}</div>
  <table>
    <thead><tr><th>Description</th><th style="text-align:right">Amount</th></tr></thead>
    <tbody>
      ${rows}
      ${tax}
      ${paid}
      <tr class="total-row"><td>Total due</td><td class="num">${formatMoney(inv.total - inv.amountPaid, inv.currency)}</td></tr>
    </tbody>
  </table>
  ${inv.dueAt ? `<div class="meta">Due ${new Date(inv.dueAt).toLocaleDateString()}</div>` : ""}
  <div class="meta">Thank you — this invoice was generated with Signal.</div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
