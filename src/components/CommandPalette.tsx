import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { initials } from "../lib/format";
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
 */
export const NEW_CONTACT_EVENT = "signal:new-contact";
export const NEW_INVOICE_EVENT = "signal:new-invoice";

interface Item {
  id: string;
  label: string;
  sub: string;
  group: string;
  run: () => void;
}

export function CommandPalette() {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

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
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Close on navigation so stale lists never linger.
  useEffect(() => {
    if (open && location.pathname !== openPathRef.current) setOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, open]);

  const items: Item[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (...parts: (string | undefined)[]) =>
      parts.some((p) => p && p.toLowerCase().includes(q));

    const rows: Item[] = [];
    for (const c of contacts ?? []) {
      if (q && !match(c.name, c.company)) continue;
      rows.push({
        id: `c-${c._id}`,
        label: c.name,
        sub: c.company ?? c.status,
        group: "Clients",
        run: () => navigate(`/clients/${c._id}`),
      });
    }
    for (const p of projects ?? []) {
      if (q && !match(p.name, p.contactName)) continue;
      rows.push({
        id: `p-${p._id}`,
        label: p.name,
        sub: p.contactName,
        group: "Projects",
        run: () => navigate(`/clients/${p.contactId}`),
      });
    }
    for (const inv of invoices ?? []) {
      if (q && !match(inv.invoiceNumber, inv.contactName)) continue;
      rows.push({
        id: `i-${inv._id}`,
        label: inv.invoiceNumber,
        sub: `${inv.contactName} · ${inv.status}`,
        group: "Invoices",
        run: () => navigate(`/invoices/${inv._id}`),
      });
    }

    const actions: Item[] = [
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
    if (!q) return [...actions, ...rows];
    return [...rows, ...actions.filter((a) => match(a.label, a.sub))];
  }, [contacts, projects, invoices, query, navigate]);

  // Keyboard navigation across the flattened list.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      items[active]?.run();
    }
  };

  if (!open) return null;

  // Group runs so sections can render headers.
  const groups: { name: string; items: Item[] }[] = [];
  for (const it of items) {
    const g = groups.find((x) => x.name === it.group);
    if (g) g.items.push(it);
    else groups.push({ name: it.group, items: [it] });
  }
  let flatIndex = -1;

  return (
    <div
      className="palette-overlay"
      onClick={() => setOpen(false)}
      role="presentation"
    >
      <div
        className="command-palette"
        role="dialog"
        aria-label="Command palette"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="palette-panel">
          <div className="palette-input-row">
            <IconCommand aria-hidden="true" style={{ width: 16, height: 16 }} />
            <input
              ref={inputRef}
              className="palette-input"
              placeholder="Jump to a client, project, invoice, or action…"
              aria-label="Search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
            />
            <kbd className="kbd">esc</kbd>
          </div>
          <div className="palette-list" role="listbox" aria-label="Results">
            {items.length === 0 && (
              <p className="palette-empty">No matches for “{query}”.</p>
            )}
            {groups.map((g) => (
              <div key={g.name}>
                <div className="palette-group-label">{g.name}</div>
                {g.items.map((it) => {
                  flatIndex += 1;
                  const idx = flatIndex;
                  return (
                    <button
                      key={it.id}
                      type="button"
                      role="option"
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
