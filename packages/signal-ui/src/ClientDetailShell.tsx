import { useState } from "react";
import { Icon, type IconName } from "./Icons";
import { StatusChip } from "./StatusChip";

/* ============================================================
   ClientDetailShell — the product's client detail, prop-driven.
   Detail head (name + status register), asymmetric stats strip
   (first stat flex 1.6 + larger mono numeral, §1.1/§3.4),
   real tab buttons, timeline rows with glyph discs.
   ============================================================ */

export interface ShellStat {
  label: string;
  value: string;
}

export interface ShellTimelineRow {
  id: string;
  icon: IconName;
  label: string;
  time: string;
}

export interface ClientDetailShellProps {
  name: string;
  company?: string;
  statusLabel?: string;
  statusShape?: "filled" | "outline" | "dim";
  stats: ShellStat[];
  timeline: ShellTimelineRow[];
  tabs?: { id: string; label: string; count?: number }[];
}

export function ClientDetailShell({
  name,
  company,
  statusLabel = "Active",
  statusShape = "filled",
  stats,
  timeline,
  tabs = [],
}: ClientDetailShellProps) {
  const [tab, setTab] = useState(tabs[0]?.id ?? null);

  return (
    <div className="cds">
      <div className="cds-head">
        <div className="cds-title-row">
          <h3>
            {name}
            {company && <span className="cds-company"> — {company}</span>}
          </h3>
          <StatusChip label={statusLabel} state="positive" shape={statusShape} />
        </div>
        <div className="cds-beacon-line">
          <span className="beacon-dot" aria-hidden="true" />
          <span className="cds-beacon-label">Healthy — 4 follow-ups on time</span>
        </div>
      </div>

      {stats.length > 0 && (
        <div className="cds-stats" aria-label="Client statistics">
          {stats.map((s, i) => (
            <div key={s.label} className={`cds-stat${i === 0 ? " lead" : ""}`}>
              <span className="cds-stat-value num">{s.value}</span>
              <span className="cds-stat-label">{s.label}</span>
            </div>
          ))}
        </div>
      )}

      {tabs.length > 0 && (
        <div className="cds-tabs" role="tablist" aria-label="Client sections">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`cds-tab${tab === t.id ? " is-active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {t.count !== undefined && t.count > 0 && <span className="cds-tab-count num">{t.count}</span>}
            </button>
          ))}
        </div>
      )}

      <ul className="cds-timeline">
        {timeline.map((row) => (
          <li key={row.id} className="cds-tl-row">
            <span className="cds-tl-glyph" aria-hidden="true">
              <Icon name={row.icon} label="" size={13} />
            </span>
            <span className="cds-tl-label">{row.label}</span>
            <time className="cds-tl-time num">{row.time}</time>
          </li>
        ))}
      </ul>
    </div>
  );
}
