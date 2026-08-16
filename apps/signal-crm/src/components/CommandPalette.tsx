import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { initials } from "../lib/format";
import { bestFieldScore } from "../lib/fuzzy";
import { IconCommand, IconInvoices, IconPlus } from "./Icons";

/**
 * §2.4 — the command palette. One of Linear's most recognizable patterns and
 * the single strongest "considered software" signal in the app: jump to any
 * client, project, or invoice, or run a top-level action, all from the
 * keyboard. Popover elevation per §1.4; kbd hints per §2.5.
 *
 * Create actions communicate through a tiny window-event bus so the page that
 * owns the modal (ClientsList / InvoicesList) can open it — the palette stays
 * decoupled from page state.
 *
 * A11y/HCI (refactor): proper combobox pattern — the input is a combobox with
 * aria-activedescendant pointing at the active option (screen readers follow
 * arrow navigation), group labels are role="group" wrappers so the listbox
 * only contains options/groups, the empty state lives OUTSIDE the listbox as
 * role="status", the dialog is aria-modal with a real focus trap, focus is
 * restored to the trigger on close, and the active row scrolls into view.
 */
export const NEW_CONTACT_EVENT = "signal:new-contact";
export const NEW_INVOICE_EVENT = "signal:new-invoice";

interface Item {
  id: string;
  label: string;
  sub: string;
  group: string;
  run: () => void;
  /** Internal — fuzzy ranking score; actions omit it (they sit below rows). */
  _score?: number;
}

interface Group {
  name: string;
  items: Item[];
  /** Flat index of this group's first item — precomputed so the active
   *  option id and keyboard math never depend on render-order mutation. */
  startIndex: number;
}

export function CommandPalette() {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Where focus was when the palette opened — restored on close.
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const contacts = useQuery(api.contacts.list, {});
  const projects = useQuery(api.projects.listAll);
  const invoices = useQuery(api.invoices.list);

  // §2.4 — global trigger (⌘K / Ctrl+K, plus the topbar button via event bus).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (e.key === "Escape") setOpen(false);
    };
    const onToggle = () => setOpen((o) => !o);
    window.addEventListener("keydown", onKey);
    window.addEventListener("signal:toggle-palette", onToggle);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("signal:toggle-palette", onToggle);
    };
  }, []);

  // Record where the palette opened so navigation away closes it (declared
  // first so the ref is current when the close-check below runs on open).
  const openPathRef = useRef(location.pathname);
  useEffect(() => {
    if (open) {
      openPathRef.current = location.pathname;
      setQuery("");
      setActive(0);
      returnFocusRef.current = document.activeElement as HTMLElement | null;
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Close on navigation so stale lists never linger.
  useEffect(() => {
    if (open && location.pathname !== openPathRef.current) setOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, open]);

  // Restore focus to the trigger when the palette closes (modal focus rule).
  useEffect(() => {
    if (!open) {
      const target = returnFocusRef.current;
      if (target && typeof target.focus === "function" && document.contains(target)) {
        target.focus();
      }
      returnFocusRef.current = null;
    }
  }, [open]);

  // Keep the active option visible while arrowing through a long list.
  useEffect(() => {
    if (!open) return;
    const el = document.getElementById(`palette-opt-${active}`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  // Modal focus trap: the palette is the only focusable surface while open —
  // Tab/Shift+Tab cycle within it instead of leaking into the page behind.
  const trapFocus = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const dialog = e.currentTarget as HTMLElement;
      const focusables = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button, input, [href], [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.hasAttribute("disabled"));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    []
  );

  const items: Item[] = useMemo(() => {
    const q = query.trim();

    // §2.4 fuzzy ranking: every candidate is scored (not substring-filtered)
    // so typos and partial matches surface the right row, and the list is
    // ordered best-first instead of data-order. A null score = no match.
    const score = (...fields: (string | undefined | null)[]) =>
      q ? bestFieldScore(q, fields) : 0;

    const rows: Item[] = [];
    for (const c of contacts ?? []) {
      const s = score(c.name, c.company);
      if (s === null) continue;
      rows.push({
        id: `c-${c._id}`,
        label: c.name,
        sub: c.company ?? c.status,
        group: "Clients",
        run: () => navigate(`/clients/${c._id}`),
        _score: s,
      });
    }
    for (const p of projects ?? []) {
      const s = score(p.name, p.contactName);
      if (s === null) continue;
      rows.push({
        id: `p-${p._id}`,
        label: p.name,
        sub: p.contactName,
        group: "Projects",
        run: () => navigate(`/clients/${p.contactId}`),
        _score: s,
      });
    }
    for (const inv of invoices ?? []) {
      const s = score(inv.invoiceNumber, inv.contactName, inv.status);
      if (s === null) continue;
      rows.push({
        id: `i-${inv._id}`,
        label: inv.invoiceNumber,
        sub: `${inv.contactName} · ${inv.status}`,
        group: "Invoices",
        run: () => navigate(`/invoices/${inv._id}`),
        _score: s,
      });
    }

    const actions: Item[] = [
      {
        id: "a-home",
        label: "Clients",
        sub: "All clients",
        group: "Actions",
        run: () => navigate("/"),
      },
      {
        id: "a-invoices",
        label: "Invoices",
        sub: "All invoices",
        group: "Actions",
        run: () => navigate("/invoices"),
      },
      {
        id: "a-new-contact",
        label: "New contact",
        sub: "Create a client",
        group: "Actions",
        run: () => {
          setOpen(false);
          navigate("/");
          window.setTimeout(() => window.dispatchEvent(new CustomEvent(NEW_CONTACT_EVENT)), 0);
        },
      },
      {
        id: "a-new-invoice",
        label: "New invoice",
        sub: "Create an invoice",
        group: "Actions",
        run: () => {
          setOpen(false);
          navigate("/invoices");
          window.setTimeout(() => window.dispatchEvent(new CustomEvent(NEW_INVOICE_EVENT)), 0);
        },
      },
      {
        id: "a-calendar",
        label: "Calendar",
        sub: "Deadlines, dues, meetings",
        group: "Actions",
        run: () => navigate("/calendar"),
      },
      {
        id: "a-inbox",
        label: "Inbox",
        sub: "Unmatched messages",
        group: "Actions",
        run: () => navigate("/inbox"),
      },
      {
        id: "a-followups",
        label: "Follow-ups",
        sub: "Due reminders",
        group: "Actions",
        run: () => navigate("/followups"),
      },
      {
        id: "a-settings",
        label: "Settings",
        sub: "Integrations, API keys, account",
        group: "Actions",
        run: () => navigate("/settings"),
      },
    ];
    // With a query: rank rows best-first (stable sort keeps data order for
    // ties), then append the matching actions. With no query: actions first,
    // rows in data order — the pre-fuzzy behavior.
    if (!q) return [...actions, ...rows];
    const ranked = [...rows].sort((a, b) => (b as Item & { _score: number })._score - (a as Item & { _score: number })._score);
    const matchingActions = actions.filter((a) => bestFieldScore(q, [a.label, a.sub]) !== null);
    return [...ranked, ...matchingActions];
  }, [contacts, projects, invoices, query, navigate]);

  // Group with precomputed flat indices — no render-time mutation.
  const groups: Group[] = useMemo(() => {
    const out: Group[] = [];
    let flat = 0;
    for (const it of items) {
      const g = out.find((x) => x.name === it.group);
      if (g) {
        g.items.push(it);
      } else {
        out.push({ name: it.group, items: [it], startIndex: flat });
      }
      flat += 1;
    }
    return out;
  }, [items]);

  const totalItems = items.length;

  // Keyboard navigation across the flattened list.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (totalItems === 0 ? 0 : Math.min(a + 1, totalItems - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(totalItems - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      items[active]?.run();
    }
  };

  if (!open) return null;

  return (
    <div className="palette-overlay" onClick={() => setOpen(false)}>
      <div
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          onKeyDown(e);
          trapFocus(e);
        }}
      >
        <div className="palette-panel">
          <div className="palette-input-row">
            <IconCommand aria-hidden="true" style={{ width: 16, height: 16 }} />
            <input
              ref={inputRef}
              className="palette-input"
              placeholder="Jump to a client, project, invoice, or action…"
              aria-label="Search"
              role="combobox"
              aria-expanded="true"
              aria-controls="palette-listbox"
              aria-activedescendant={totalItems > 0 ? `palette-opt-${active}` : undefined}
              aria-autocomplete="list"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
            />
            <kbd className="kbd">esc</kbd>
          </div>
          <div
            ref={listRef}
            className="palette-list"
            role="listbox"
            id="palette-listbox"
            aria-label="Results"
          >
            {groups.map((g) => (
              <div key={g.name} role="group" aria-label={g.name}>
                <div className="palette-group-label">{g.name}</div>
                {g.items.map((it, i) => {
                  const idx = g.startIndex + i;
                  return (
                    <button
                      key={it.id}
                      type="button"
                      role="option"
                      id={`palette-opt-${idx}`}
                      aria-selected={idx === active}
                      className={`palette-row${idx === active ? " active" : ""}`}
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => it.run()}
                    >
                      <span className="palette-avatar num" aria-hidden="true">
                        {it.group === "Invoices" ? <IconInvoices style={{ width: 14, height: 14 }} /> : initials(it.label)}
                      </span>
                      <span className="palette-row-main">
                        <span className="palette-row-label">{it.label}</span>
                        <span className="palette-row-sub">{it.sub}</span>
                      </span>
                      {it.group === "Actions" && <IconPlus aria-hidden="true" className="palette-row-icon" />}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          {totalItems === 0 && (
            <p className="palette-empty" role="status">
              No matches for “{query}”.
            </p>
          )}
          <div className="palette-footer">
            <span><kbd className="kbd">↑↓</kbd> navigate</span>
            <span><kbd className="kbd">↵</kbd> open</span>
            <span><kbd className="kbd">esc</kbd> close</span>
          </div>
        </div>
      </div>
    </div>
  );
}
