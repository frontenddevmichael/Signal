import { useMemo } from "react";
import { buildMonthGrid, dayKey, WEEKDAY_LABELS } from "./calendar";
import type { CalendarEvent } from "./calendar";
import { Icon, type IconName } from "./Icons";

/* ============================================================
   CalendarGrid — the product's calendar month view, prop-driven
   (data in, callbacks out — no Convex, no router). Same
   Monday-first 6-week grid, same monochrome urgency register:
   overdue = filled dot + 590 weight, partial = quiet-warning,
   upcoming = plain. All controls are real buttons.
   ============================================================ */

const KIND_ICON: Record<CalendarEvent["kind"], IconName> = {
  deadline: "repo",
  followup: "bell",
  invoice: "invoice",
  meeting: "calendar",
};

export interface CalendarGridProps {
  year: number;
  month: number; // 0-based
  events: CalendarEvent[];
  today?: Date;
  onMonthChange?: (year: number, month: number) => void;
  onEventClick?: (ev: CalendarEvent) => void;
  compact?: boolean;
}

export function CalendarGrid({
  year,
  month,
  events,
  today,
  onMonthChange,
  onEventClick,
  compact,
}: CalendarGridProps) {
  const now = today ?? new Date();
  const cells = useMemo(() => buildMonthGrid(year, month), [year, month]);
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const key = dayKey(ev.at);
      const list = map.get(key) ?? [];
      list.push(ev);
      map.set(key, list);
    }
    return map;
  }, [events]);

  const shift = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    onMonthChange?.(d.getFullYear(), d.getMonth());
  };

  const monthTitle = new Date(year, month, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  const overdueCount = events.filter((e) => e.status === "overdue").length;
  const todayKey = dayKey(now.getTime());

  return (
    <div className={`calg${compact ? " calg-compact" : ""}`} role="region" aria-label={`Calendar — ${monthTitle}`}>
      <div className="calg-head">
        <span className="calg-title">{monthTitle}</span>
        <span className="calg-count num">
          {events.length} event{events.length === 1 ? "" : "s"}
          {overdueCount > 0 && (
            <span className="calg-overdue num" role="status">
              {overdueCount} overdue
            </span>
          )}
        </span>
      </div>
      <div className="calg-nav">
        <button type="button" className="calg-nav-btn" aria-label="Previous month" onClick={() => shift(-1)}>
          <Icon name="arrow-right" label="" size={12} style={{ transform: "rotate(180deg)" }} />
        </button>
        <button type="button" className="calg-today" onClick={() => onMonthChange?.(now.getFullYear(), now.getMonth())}>
          Today
        </button>
        <button type="button" className="calg-nav-btn" aria-label="Next month" onClick={() => shift(1)}>
          <Icon name="arrow-right" label="" size={12} />
        </button>
      </div>
      <div className="calg-dow" aria-hidden="true">
        {WEEKDAY_LABELS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="calg-grid" role="grid" aria-label={`Calendar for ${monthTitle}`}>
        {cells.map((cell) => {
          const key = dayKey(cell.date.getTime());
          const dayEvents = byDay.get(key) ?? [];
          const isToday = key === todayKey;
          return (
            <div
              key={key}
              role="gridcell"
              aria-label={cell.date.toDateString()}
              className={`calg-cell${cell.inMonth ? "" : " out"}${isToday ? " today" : ""}`}
            >
              <span className="calg-daynum num">{cell.date.getDate()}</span>
              <div className="calg-chips">
                {dayEvents.slice(0, compact ? 1 : 3).map((ev) => (
                  <button
                    key={ev.id}
                    type="button"
                    className={`calg-chip${ev.status === "overdue" ? " overdue" : ""}${ev.status === "partial" ? " partial" : ""}`}
                    title={`${ev.title} — ${ev.subtitle}`}
                    onClick={() => onEventClick?.(ev)}
                  >
                    <span className="calg-dot" aria-hidden="true" />
                    <Icon name={KIND_ICON[ev.kind]} label="" size={11} />
                    <span className="calg-chip-title">{ev.title}</span>
                  </button>
                ))}
                {dayEvents.length > 3 && !compact && (
                  <span className="calg-more num">+{dayEvents.length - 3} more</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
