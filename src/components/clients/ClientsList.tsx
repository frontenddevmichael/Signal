import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { formatDate, formatMoney, timeAgo } from "../../lib/format";
import { EmptyState } from "../EmptyState";
import { ContactForm } from "./ContactForm";
import { IconChevronRight, IconPlus, IconSearch } from "../Icons";
import { NEW_CONTACT_EVENT } from "../CommandPalette";

/** §2.1 — monochrome initials avatar from the contact name. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

type SortKey = "name" | "status" | "lastContactDate" | "nextDeadline" | "outstandingBalance" | "company";
type SortDir = "asc" | "desc" | null;

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Client" },
  { key: "company", label: "Company" },
  { key: "status", label: "Status" },
  { key: "lastContactDate", label: "Last contact" },
  { key: "nextDeadline", label: "Next deadline" },
  { key: "outstandingBalance", label: "Outstanding" },
];

/* trailing non-sortable column holding the hover-revealed quick actions */
const QUICK_COL: { key: string; label: string } = { key: "quick", label: "" };

/**
 * §13 table view — sortable/filterable columns; the view solo freelancers use
 * day to day. Sort is three-state (asc/desc/none, §22.14); filter bar above
 * the table (status); §20.5 keyword search on name/company.
 */
export function ClientsList() {
  const contacts = useQuery(api.contacts.list, {});
  const [sortKey, setSortKey] = useState<SortKey | null>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  // §2.4 — the command palette (and global ⌘N) opens this modal via event bus.
  useEffect(() => {
    const onNew = () => setShowCreate(true);
    window.addEventListener(NEW_CONTACT_EVENT, onNew);
    return () => window.removeEventListener(NEW_CONTACT_EVENT, onNew);
  }, []);

  const sorted = useMemo(() => {
    if (!contacts) return null;
    let rows = [...contacts];
    if (filterStatus !== "all") rows = rows.filter((c) => c.status === filterStatus);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      rows = rows.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.company ?? "").toLowerCase().includes(q) ||
          (c.primaryEmail ?? "").toLowerCase().includes(q),
      );
    }
    if (sortKey && sortDir) {
      rows.sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        if (av === null || av === undefined) return 1;
        if (bv === null || bv === undefined) return -1;
        const cmp = typeof av === "number" ? av - (bv as number) : String(av).localeCompare(String(bv));
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return rows;
  }, [contacts, sortKey, sortDir, filterStatus, query]);

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
        <h2>Clients</h2>
        <button type="button" className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <IconPlus aria-hidden="true" style={{ width: 16, height: 16 }} />
          Add client
          <kbd className="kbd">⌘N</kbd>
        </button>
      </div>

      <div className="table-toolbar">
        <div className="search-box">
          <IconSearch aria-hidden="true" />
          <input
            type="search"
            className="input search-input"
            placeholder="Search clients…"
            aria-label="Search clients"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="filter-bar" role="group" aria-label="Filter by status">
          {["all", "lead", "active", "closed"].map((s) => (
            <button
              key={s}
              type="button"
              className={`chip${filterStatus === s ? " chip-active" : ""}`}
              onClick={() => setFilterStatus(s)}
            >
              {s === "all" ? "All" : s}
            </button>
          ))}
        </div>
        {sorted && <span className="row-count">{sorted.length} client{sorted.length === 1 ? "" : "s"}</span>}
      </div>

      {!sorted ? (
        <div className="table-skeleton" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: 48, marginBottom: 8 }} />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <EmptyState
          title={query || filterStatus !== "all" ? "No matches" : "No clients yet"}
          body={
            query || filterStatus !== "all"
              ? "Nothing matches this filter. Try clearing it."
              : "Contacts, projects, notes and the timeline start here. Everything begins with a client."
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
                Add client
              </button>
            )
          }
        />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {[...COLUMNS, QUICK_COL].map((col) => (
                  <th key={col.key} aria-sort={sortKey === col.key ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>
                    <button
                      type="button"
                      className="th-btn"
                      onClick={() => col.key !== "quick" && toggleSort(col.key as SortKey)}
                      aria-label={col.key !== "quick" ? `Sort by ${col.label}` : undefined}
                      tabIndex={col.key === "quick" ? -1 : 0}
                      style={col.key === "quick" ? { width: 36 } : undefined}
                    >
                      {col.label}
                      {sortKey === col.key && <span className="sort-arrow">{sortDir === "asc" ? "▲" : "▼"}</span>}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => {
                // §23.5 — the §14 health signal on the LIST view, not just detail.
                const stale =
                  c.lastContactDate === null ||
                  (Date.now() - c.lastContactDate) / 86400000 >= 14;
                const tags = (c.tags ?? []).slice(0, 2);
                return (
                  <tr key={c._id}>
                    <td>
                      <div className="client-cell">
                        <span className="avatar" aria-hidden="true">
                          {initials(c.name)}
                        </span>
                        <div>
                          <div className="health-dot-wrap">
                            <Link to={`/clients/${c._id}`} className="client-name">
                              {c.name}
                            </Link>
                            {stale && <span className="beacon-dot" aria-label="Needs attention" />}
                          </div>
                          {c.primaryEmail && <div className="cell-sub">{c.primaryEmail}</div>}
                        </div>
                      </div>
                    </td>
                    <td>
                      {c.company ?? "—"}
                      {tags.length > 0 && (
                        <div className="cell-sub" style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {tags.map((t) => (
                            <span key={t} className="tag-chip">
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`status status-${c.status}`}>{c.status}</span>
                    </td>
                    <td className="num">{c.lastContactDate ? timeAgo(c.lastContactDate) : "—"}</td>
                    <td className="num">
                      {c.nextDeadline ? (
                        <span className={c.nextDeadline < Date.now() + 7 * 86400000 ? "deadline-near" : ""}>
                          {formatDate(c.nextDeadline)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="num money">{formatMoney(c.outstandingBalance)}</td>
                    <td className="num">
                      <span className="quick-actions">
                        <Link to={`/clients/${c._id}`} className="quick-action" aria-label={`Open ${c.name}`} title="Open">
                          <IconChevronRight width={16} height={16} />
                        </Link>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && <ContactForm open onClose={() => setShowCreate(false)} />}
    </div>
  );
}
