import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { dueLabel, formatMoney } from "../../lib/format";
import { EmptyState } from "../EmptyState";
import { InvoiceForm } from "./InvoiceForm";
import { IconChevronRight, IconPlus, IconSearch } from "../Icons";
import { NEW_INVOICE_EVENT } from "../CommandPalette";

const STATUS_LABEL: Record<string, string> = {
  draft: "draft",
  sent: "sent",
  viewed: "viewed",
  paid: "paid",
  partially_paid: "partial",
  overdue: "overdue",
  void: "void",
  refunded: "refunded",
};

type SortKey = "invoiceNumber" | "contactName" | "total" | "dueAt";
type SortDir = "asc" | "desc" | null;

const COLUMNS: { key: SortKey | null; label: string }[] = [
  { key: "invoiceNumber", label: "Number" },
  { key: "contactName", label: "Client" },
  { key: null, label: "Project" },
  { key: null, label: "Status" },
  { key: "total", label: "Total" },
  { key: null, label: "Paid" },
  { key: "dueAt", label: "Due" },
];

/** §2.1 — initials avatar shared with the clients list. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * §13-style invoice table — same sort/filter/search affordances as contacts
 * (§23.4). Status is the §18 DERIVED status (computed server-side); overdue
 * renders with the filled critical icon + weight, never hue (§1.1/§1.6).
 */
export function InvoicesList() {
  const invoices = useQuery(api.invoices.list);
  const [showCreate, setShowCreate] = useState(false);

  // §2.4 — the command palette opens this modal via event bus.
  useEffect(() => {
    const onNew = () => setShowCreate(true);
    window.addEventListener(NEW_INVOICE_EVENT, onNew);
    return () => window.removeEventListener(NEW_INVOICE_EVENT, onNew);
  }, []);
  const [query, setQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey | null>("invoiceNumber");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const rows = useMemo(() => {
    if (!invoices) return null;
    let out = [...invoices];
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      out = out.filter(
        (i) =>
          i.contactName.toLowerCase().includes(q) ||
          i.projectName.toLowerCase().includes(q) ||
          i.invoiceNumber.toLowerCase().includes(q),
      );
    }
    if (filterStatus !== "all") out = out.filter((i) => i.status === filterStatus);
    if (sortKey && sortDir) {
      out.sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        if (av === null || av === undefined) return 1;
        if (bv === null || bv === undefined) return -1;
        // `total` is Convex int64 → bigint (not number); compare numerically so
        // $1,000 doesn't sort before $9 (lexicographic bigint bug).
        const cmp =
          typeof av === "number" || typeof av === "bigint"
            ? Number(av) - Number(bv)
            : String(av).localeCompare(String(bv));
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return out;
  }, [invoices, query, filterStatus, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
    } else if (sortDir === "asc") {
      setSortDir("desc");
    } else {
      setSortKey(null);
      setSortDir(null);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <h2>Invoices</h2>
        <button type="button" className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <IconPlus aria-hidden="true" style={{ width: 16, height: 16 }} />
          New invoice
        </button>
      </div>

      <div className="table-toolbar">
        <div className="search-box">
          <IconSearch aria-hidden="true" />
          <input
            type="search"
            className="input search-input"
            placeholder="Search invoices…"
            aria-label="Search invoices"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="filter-bar" role="group" aria-label="Filter by status">
          {["all", ...Object.keys(STATUS_LABEL)].map((s) => (
            <button
              key={s}
              type="button"
              className={`chip${filterStatus === s ? " chip-active" : ""}`}
              aria-pressed={filterStatus === s}
              onClick={() => setFilterStatus(s)}
            >
              {s === "all" ? "All" : STATUS_LABEL[s]}
            </button>
          ))}
        </div>
        {rows && <span className="row-count">{rows.length} invoice{rows.length === 1 ? "" : "s"}</span>}
      </div>

      {!rows ? (
        <div className="table-skeleton" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: 48, marginBottom: 8 }} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title={query || filterStatus !== "all" ? "No matches" : "No invoices yet"}
          body={
            query || filterStatus !== "all"
              ? "Nothing matches this filter. Try clearing it."
              : "Create an invoice from a project — line items can be pulled straight from billable GitHub activity."
          }
          action={
            query || filterStatus !== "all" ? (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setQuery("");
                  setFilterStatus("all");
                }}
              >
                Clear filters
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={() => setShowCreate(true)}>
                <IconPlus aria-hidden="true" style={{ width: 16, height: 16 }} />
                New invoice
              </button>
            )
          }
        />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {[...COLUMNS, { key: null as SortKey | null, label: "" }].map((col) => (
                  <th
                    key={col.label || "quick"}
                    aria-sort={col.key && sortKey === col.key ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
                  >
                    {col.key ? (
                      <button
                        type="button"
                        className="th-btn"
                        onClick={() => toggleSort(col.key as SortKey)}
                        aria-label={`Sort by ${col.label}`}
                      >
                        {col.label}
                        {sortKey === col.key && <span className="sort-arrow">{sortDir === "asc" ? "▲" : "▼"}</span>}
                      </button>
                    ) : (
                      <span style={col.label ? undefined : { display: "inline-block", width: 36 }}>{col.label}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((inv) => (
                <tr key={inv._id}>
                  <td>
                    <Link to={`/invoices/${inv._id}`} className="num client-name">
                      {inv.invoiceNumber}
                    </Link>
                  </td>
                  <td>
                    <div className="client-cell">
                      <span className="avatar" aria-hidden="true">
                        {initials(inv.contactName)}
                      </span>
                      {inv.contactName}
                    </div>
                  </td>
                  <td>{inv.projectName}</td>
                  <td>
                    <span className={`status status-${inv.status}`}>
                      {STATUS_LABEL[inv.status] ?? inv.status}
                    </span>
                  </td>
                  <td className="num money">{formatMoney(inv.total, inv.currency)}</td>
                  <td className="num money">{formatMoney(inv.amountPaid, inv.currency)}</td>
                  <td className="num">
                    {inv.dueAt ? (
                      <span className={`due-hint${inv.status === "overdue" ? " overdue" : ""}`}>
                        {dueLabel(inv.dueAt)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="num">
                    <span className="quick-actions">
                      <Link
                        to={`/invoices/${inv._id}`}
                        className="quick-action"
                        aria-label={`Open ${inv.invoiceNumber}`}
                        title="Open"
                      >
                        <IconChevronRight width={16} height={16} />
                      </Link>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && <InvoiceForm onClose={() => setShowCreate(false)} />}
    </div>
  );
}
