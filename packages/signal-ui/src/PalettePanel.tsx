import { useEffect, useMemo, useRef, useState } from "react";
import { Icon, type IconName } from "./Icons";

/* ============================================================
   PalettePanel — the product's command palette, prop-driven.
   Real keyboard nav (arrows / Enter / Escape), real filter
   matching, hover/press/focus states per the design system.
   ============================================================ */

export interface PaletteItem {
  id: string;
  label: string;
  sub?: string;
  icon?: IconName;
}

export interface PaletteGroup {
  id: string;
  label: string;
  items: PaletteItem[];
}

export interface PalettePanelProps {
  groups: PaletteGroup[];
  onSelect?: (item: PaletteItem, group: PaletteGroup) => void;
  placeholder?: string;
  /**
   * Dialog semantics are only honest when the palette is mounted as an
   * overlay with focus management (the product's open-state palette). When
   * the palette is a persistent part of a composition (the marketing demo's
   * scroll-constructed window), role="dialog" misleads screen readers — an
   * always-present dialog that never traps focus. modal={false} renders it
   * as a non-modal search surface instead.
   */
  modal?: boolean;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ");
}

export function PalettePanel({ groups, onSelect, placeholder = "Jump to…", modal = true }: PalettePanelProps) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return groups;
    return groups
      .map((g) => ({ ...g, items: g.items.filter((i) => normalize(i.label).includes(q)) }))
      .filter((g) => g.items.length > 0);
  }, [groups, query]);

  const flat = useMemo(() => filtered.flatMap((g) => g.items), [filtered]);

  useEffect(() => {
    if (active >= flat.length) setActive(0);
  }, [flat.length, active]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % Math.max(1, flat.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + Math.max(1, flat.length)) % Math.max(1, flat.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = flat[active];
      if (item) {
        const group = filtered.find((g) => g.items.includes(item));
        if (group) onSelect?.(item, group);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setQuery("");
    }
  };

  let idx = -1;

  return (
    <div className="palp" role={modal ? "dialog" : "search"} aria-label="Command palette">
      <div className="palp-input">
        <Icon name="search" label="" size={14} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder={placeholder}
          aria-label="Search commands"
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKey}
        />
        <kbd className="num">⌘K</kbd>
      </div>
      <div className="palp-list" ref={listRef}>
        {filtered.length === 0 && <div className="palp-empty">No matches</div>}
        {filtered.map((g) => (
          <div key={g.id} className="palp-group">
            <span className="palp-group-label">{g.label}</span>
            {g.items.map((item) => {
              idx += 1;
              const i = idx;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`palp-row${i === active ? " is-active" : ""}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => onSelect?.(item, g)}
                >
                  {item.icon ? (
                    <Icon name={item.icon} label="" size={14} />
                  ) : (
                    <span className="palp-blank" aria-hidden="true" />
                  )}
                  <span className="palp-label">{item.label}</span>
                  {item.sub && <span className="palp-sub num">{item.sub}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="palp-foot">
        <span>
          <kbd className="num">↑↓</kbd> navigate
        </span>
        <span>
          <kbd className="num">↵</kbd> select
        </span>
        <span>
          <kbd className="num">esc</kbd> clear
        </span>
      </div>
    </div>
  );
}
