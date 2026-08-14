/**
 * §18/§21.4/§21.5/§21.6 invoice PURE logic — no Convex imports, no network,
 * fully unit-testable. This is the highest-consequence logic in the build
 * (real client money), so everything here is a pure function with exhaustive
 * Vitest coverage — build and verify the money math BEFORE any UI touches it.
 */

export type InvoiceStatus =
  | "draft"
  | "sent"
  | "viewed"
  | "paid"
  | "partially_paid"
  | "overdue"
  | "void"
  | "refunded";

export interface StatusInput {
  /** Stored status — may be any of the 8 (a stored "paid" is re-derived truthfully). */
  status: InvoiceStatus;
  amountPaid: bigint;
  amountRefunded: bigint;
  total: bigint;
  dueAt?: number;
  now: number;
}

/**
 * §18 — status is DERIVED from amount_paid (except draft/sent/viewed/void):
 * - paid         when amount_paid >= total
 * - partially_paid when 0 < amount_paid < total
 * - overdue      when due_at has passed AND amount_paid < total
 * - refunded     when amount_refunded > 0
 * - void         is a manual action, blocked once amount_paid > 0 (the caller
 *   enforces the block; a void invoice with a later payment lands here as paid,
 *   which is the point — the derived status stays truthful about the money).
 * Precedence: refunded > paid > partially_paid > overdue > stored status.
 */
export function deriveInvoiceStatus(input: StatusInput): InvoiceStatus {
  if (input.amountRefunded > 0n) return "refunded";
  if (input.amountPaid >= input.total) return "paid";
  if (input.amountPaid > 0n) return "partially_paid";
  if (input.dueAt !== undefined && input.dueAt < input.now) return "overdue";
  return input.status;
}

/**
 * §18 — void is a manual freelancer action, blocked once amount_paid > 0.
 * A partially-paid invoice gets refunded, not voided.
 */
export function canVoid(amountPaid: bigint): boolean {
  return amountPaid === 0n;
}

/** §18 — subtotal + tax_amount = total. Both are minor units (int64). */
export function computeTotal(subtotal: bigint, taxAmount: bigint | undefined): bigint {
  return subtotal + (taxAmount ?? 0n);
}

/** §21.5 — per-user sequential numbering: INV-2026-0001. Zero-padded 4 digits. */
export function formatInvoiceNumber(year: number, seq: number): string {
  return `INV-${year}-${String(seq).padStart(4, "0")}`;
}

/**
 * §21.5 — atomic next number: read the user's current counter, return it + the
 * incremented value. The CALLER applies both inside the same transaction (see
 * the create mutation), so two concurrent creations can't collide — Convex's
 * transactional guarantees serialize writes to the same counter row.
 */
export function nextInvoiceNumber(prevSeq: number | undefined, year = new Date().getFullYear()): { number: string; seq: number } {
  const seq = (prevSeq ?? 0) + 1;
  return { number: formatInvoiceNumber(year, seq), seq };
}

/**
 * §21.6 — money is integer minor units; amounts on an invoice are never
 * converted. Reporting groups BY CURRENCY, never blends. This helper is the
 * grouping primitive the reporting view (and the outstanding-balance column)
 * will use.
 */
export function groupByCurrency(rows: { currency: string; amount: bigint }[]): { currency: string; total: bigint }[] {
  const map = new Map<string, bigint>();
  for (const r of rows) {
    map.set(r.currency, (map.get(r.currency) ?? 0n) + r.amount);
  }
  return [...map.entries()].map(([currency, total]) => ({ currency, total }));
}

/**
 * §9 invoice-time flag — a suggested line item drawn from a repo_activity row
 * whose repo has more than one ACTIVE project link carries an inline
 * "also linked to [other client]" flag. `activeLinkCount` comes from the
 * Phase 2 prep query (github.activeLinkCountForActivity).
 */
export function isMultiLinked(activeLinkCount: number): boolean {
  return activeLinkCount > 1;
}
