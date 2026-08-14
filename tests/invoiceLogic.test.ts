import { describe, expect, it } from "vitest";
import {
  deriveInvoiceStatus,
  canVoid,
  computeTotal,
  formatInvoiceNumber,
  nextInvoiceNumber,
  groupByCurrency,
  isMultiLinked,
} from "../convex/invoiceLogic";

const NOW = Date.parse("2026-06-15T00:00:00Z");
const LATER = Date.parse("2026-07-01T00:00:00Z");
const total = 100_00n; // $100.00 in cents

function base(over: Partial<Parameters<typeof deriveInvoiceStatus>[0]> = {}) {
  return {
    status: "sent" as const,
    amountPaid: 0n,
    amountRefunded: 0n,
    total,
    dueAt: LATER,
    now: NOW,
    ...over,
  };
}

describe("deriveInvoiceStatus (§18 — the full state machine)", () => {
  it("draft / sent / viewed stay as stored while unpaid and not overdue", () => {
    expect(deriveInvoiceStatus(base({ status: "draft" }))).toBe("draft");
    expect(deriveInvoiceStatus(base({ status: "sent" }))).toBe("sent");
    expect(deriveInvoiceStatus(base({ status: "viewed" }))).toBe("viewed");
  });

  it("paid when amount_paid >= total (exact and over)", () => {
    expect(deriveInvoiceStatus(base({ amountPaid: 100_00n }))).toBe("paid");
    expect(deriveInvoiceStatus(base({ amountPaid: 120_00n }))).toBe("paid");
  });

  it("partially_paid when 0 < amount_paid < total", () => {
    expect(deriveInvoiceStatus(base({ amountPaid: 1n }))).toBe("partially_paid");
    expect(deriveInvoiceStatus(base({ amountPaid: 99_99n }))).toBe("partially_paid");
  });

  it("overdue when due_at passed and amount_paid < total", () => {
    expect(deriveInvoiceStatus(base({ dueAt: NOW - 1 }))).toBe("overdue");
    // overdue beats partially_paid? NO — partial payment means it's partially_paid
    // even past due (the money state is more specific). Precedence in §18:
    // paid > partially_paid > overdue.
    expect(deriveInvoiceStatus(base({ dueAt: NOW - 1, amountPaid: 50_00n }))).toBe("partially_paid");
  });

  it("not overdue before due_at, even a moment before", () => {
    expect(deriveInvoiceStatus(base({ dueAt: NOW + 1 }))).toBe("sent");
  });

  it("refunded wins over everything when amount_refunded > 0", () => {
    expect(deriveInvoiceStatus(base({ amountRefunded: 1n, amountPaid: 100_00n }))).toBe("refunded");
    expect(deriveInvoiceStatus(base({ amountRefunded: 50_00n, amountPaid: 0n, dueAt: NOW - 10 }))).toBe("refunded");
  });

  it("paid wins over overdue (paid just before a deadline still counts)", () => {
    expect(deriveInvoiceStatus(base({ dueAt: NOW - 5, amountPaid: 100_00n }))).toBe("paid");
  });

  it("void stays void only while nothing was paid", () => {
    expect(deriveInvoiceStatus(base({ status: "void", amountPaid: 0n }))).toBe("void");
    // a payment landing on a voided invoice makes it paid — the money is truthful
    expect(deriveInvoiceStatus(base({ status: "void", amountPaid: 100_00n }))).toBe("paid");
  });
});

describe("canVoid (§18 — blocked once amount_paid > 0)", () => {
  it("allowed at zero paid", () => expect(canVoid(0n)).toBe(true));
  it("blocked once anything is paid", () => {
    expect(canVoid(1n)).toBe(false);
    expect(canVoid(100_00n)).toBe(false);
  });
});

describe("computeTotal (§18 — subtotal + tax = total)", () => {
  it("adds tax when present", () => expect(computeTotal(80_00n, 20_00n)).toBe(100_00n));
  it("total = subtotal when no tax", () => expect(computeTotal(100_00n, undefined)).toBe(100_00n));
  it("handles zero tax", () => expect(computeTotal(100_00n, 0n)).toBe(100_00n));
});

describe("invoice numbering (§21.5 — atomic per-user)", () => {
  it("formats INV-2026-0001 with zero padding", () => {
    expect(formatInvoiceNumber(2026, 1)).toBe("INV-2026-0001");
    expect(formatInvoiceNumber(2026, 42)).toBe("INV-2026-0042");
    expect(formatInvoiceNumber(2026, 1234)).toBe("INV-2026-1234");
  });

  it("next from undefined starts at 1", () => {
    expect(nextInvoiceNumber(undefined, 2026)).toEqual({ number: "INV-2026-0001", seq: 1 });
  });

  it("increments the counter monotonically", () => {
    const a = nextInvoiceNumber(undefined, 2026);
    const b = nextInvoiceNumber(a.seq, 2026);
    const c = nextInvoiceNumber(b.seq, 2026);
    expect([a.number, b.number, c.number]).toEqual(["INV-2026-0001", "INV-2026-0002", "INV-2026-0003"]);
  });
});

describe("groupByCurrency (§21.6 — no conversion, group by currency)", () => {
  it("groups and totals by currency without blending", () => {
    const rows = [
      { currency: "USD", amount: 100_00n },
      { currency: "USD", amount: 50_00n },
      { currency: "EUR", amount: 200_00n },
    ];
    expect(groupByCurrency(rows)).toEqual([
      { currency: "USD", total: 150_00n },
      { currency: "EUR", total: 200_00n },
    ]);
  });
});

describe("isMultiLinked (§9 invoice-time flag)", () => {
  it("flags >1 active link", () => {
    expect(isMultiLinked(2)).toBe(true);
    expect(isMultiLinked(3)).toBe(true);
  });
  it("does not flag a single link", () => {
    expect(isMultiLinked(1)).toBe(false);
  });
});
