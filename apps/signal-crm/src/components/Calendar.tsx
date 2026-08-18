import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { buildMonthGrid, dayKey, WEEKDAY_LABELS } from "../../convex/calendarLogic";
import type { CalendarEvent } from "../../convex/calendarLogic";
import { IconAlert, IconBell, IconCalendar, IconChevronRight, IconInvoices, IconRepo } from "./Icons";

const KIND_ICON: Record<CalendarEvent["kind"], React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  deadline: IconRepo,
  followup: IconBell,
  invoice: IconInvoices,
  meeting: IconCalendar,
};

/* Render-stable "today" key — computed once at module scope so the roving
   focus entry point and the today-cell ring never depend on a fresh Date
   per render. */
const TODAY_KEY = dayKey(Date.now());

/* §11 mobile legend — below 640px the chip titles are hidden, so the kind
   glyphs and status dots carry the whole register. Explicit list keeps the
   label capitalization right ("Follow-up", not "Followup"). */
const LEGEND_KINDS: { kind: CalendarEvent["kind"]; label: string }[] = [
  { kind: "deadline", label: "Deadline" },
  { kind: "followup", label: "Follow-up" },
  { kind: "invoice", label: "Invoice" },
  { kind: "meeting", label: "Meeting" },
];

/**
 * §22.7 Calendar — one month of actionable dates on a Monday-first 6-week grid:
 * project deadlines, pending follow-up due dates, and still-owed invoice due
 * dates (the month query derives invoice status per §18 and drops paid/void/
 * refunded). Monochrome status register per the design system: overdue = filled
 * dot + 590 weight (weight does the alarming, never hue); everything else is
 * quiet. Below 640px chips collapse to dots.
 */
export function Calendar() {
  const navigate = useNavigate();
  const today = new Date();
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() });

  const events = useQuery(api.calendar.month, {
    year: cursor.year,
    month: cursor.month,
  });

  const cells = useMemo(
    () => buildMonthGrid(cursor.year, cursor.month),
    [cursor.year, cursor.month],
  );

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events ?? []) {
      const key = dayKey(ev.at);
      const list = map.get(key) ?? [];
      list.push(ev);
      map.set(key, list);
    }
    return map;
  }, [events]);

  // §2.4 keyboard grid — roving tabindex: the arrow keys move focus between
  // the 42 cells (7 columns, 6 rows), Home/End jump to the row ends, the
  // cell boundaries clamp so focus never escapes the grid. Today's cell (or
  // the first in-month day) starts as the tabbable entry point.
  const initialFocus = (() => {
    const hit = cells.findIndex((c) => dayKey(c.date.getTime()) === TODAY_KEY);
    return hit >= 0 ? hit : Math.max(0, cells.findIndex((c) => c.inMonth));
  })();
  const [focusIdx, setFocusIdx] = useState<number>(initialFocus);
  const cellRefs = useRef<Array<HTMLDivElement | null>>([]);

  // Moving months rebuilds the grid — reset the roving entry point to the new
  // month's first in-month day so Tab lands somewhere sensible.
  useEffect(() => {
    setFocusIdx(initialFocus);
  }, [initialFocus]);

  const onGridKey = (e: React.KeyboardEvent, idx: number) => {
    let next = -1;
    if (e.key === "ArrowRight") next = Math.min(41, idx + 1);
    else if (e.key === "ArrowLeft") next = Math.max(0, idx - 1);
    else if (e.key === "ArrowDown") next = Math.min(41, idx + 7);
    else if (e.key === "ArrowUp") next = Math.max(0, idx - 7);
    else if (e.key === "Home") next = idx - (idx % 7);
    else if (e.key === "End") next = idx - (idx % 7) + 6;
    if (next !== -1 && next !== idx) {
      e.preventDefault();
      setFocusIdx(next);
      cellRefs.current[next]?.focus();
    }
  };

  const shift = (delta: number) => {
    setCursor((c) => {
      const d = new Date(c.year, c.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  const monthTitle = new Date(cursor.year, cursor.month, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const goTo = (ev: CalendarEvent) => {
    if (ev.invoiceId) navigate(`/invoices/${ev.invoiceId}`);
    else if (ev.contactId) navigate(`/clients/${ev.contactId}`);
  };

  const overdueCount = (events ?? []).filter((e) => e.status === "overdue").length;

  return (
    <div className="page calendar-page" style={{ maxWidth: 980 }}>
      <div className="cal-head">
        <div className="cal-title">
          <h2 className="num">{monthTitle}</h2>
          {events !== undefined && (
            <span className="cal-count num" aria-label={`${events.length} events`}>
              {events.length} event{events.length === 1 ? "" : "s"}
              {overdueCount > 0 && (
                <span className="cal-overdue-num" role="status">
                  <IconAlert aria-hidden="true" style={{ width: 11, height: 11 }} />
                  {overdueCount} overdue
                </span>
              )}
            </span>
          )}
        </div>
        <div className="cal-nav">
          <button
            type="button"
            className="icon-btn"
            aria-label="Previous month"
            onClick={() => shift(-1)}
          >
            <IconChevronRight style={{ transform: "rotate(180deg)" }} />
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCursor({ year: today.getFullYear(), month: today.getMonth() })}>
            Today
          </button>
          <button type="button" className="icon-btn" aria-label="Next month" onClick={() => shift(1)}>
            <IconChevronRight />
          </button>
        </div>
      </div>

      {events === undefined ? (
        <div className="skeleton" style={{ height: 520 }} aria-hidden="true" />
      ) : (
        <>
          <div className="cal-dow" aria-hidden="true">
            {WEEKDAY_LABELS.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="cal-grid" role="grid" aria-label={`Calendar for ${monthTitle}`} onKeyDown={(e) => onGridKey(e, focusIdx)}>
            {/* Cells are grouped into role=row wrappers — the ARIA grid
                contract (a grid must contain rows of gridcells, never bare
                gridcells). 42 cells = 6 rows of 7. */}
            {Array.from({ length: Math.ceil(cells.length / 7) }, (_, row) => (
              <div key={`row-${row}`} role="row" className="cal-row">
                {cells.slice(row * 7, row * 7 + 7).map((cell, j) => {
                  const i = row * 7 + j;
                  const key = dayKey(cell.date.getTime());
                  const dayEvents = byDay.get(key) ?? [];
                  const isToday = key === TODAY_KEY;
                  return (
                    <div
                      key={key}
                      ref={(el) => {
                        cellRefs.current[i] = el;
                      }}
                      role="gridcell"
                      aria-label={cell.date.toDateString()}
                      tabIndex={i === focusIdx ? 0 : -1}
                      className={`cal-cell${cell.inMonth ? "" : " out"}${isToday ? " today" : ""}`}
                    >
                      <span className="cal-daynum num">{cell.date.getDate()}</span>
                      <div className="cal-chips">
                        {dayEvents.slice(0, 3).map((ev) => {
                          const Icon = KIND_ICON[ev.kind];
                          return (
                            <button
                              key={ev.id}
                              type="button"
                              className={`cal-chip${ev.status === "overdue" ? " overdue" : ""}${ev.status === "partial" ? " partial" : ""}`}
                              title={`${ev.title} — ${ev.subtitle}`}
                              aria-label={`${ev.title} — ${ev.subtitle}`}
                              onClick={() => goTo(ev)}
                            >
                              <span className="cal-dot" aria-hidden="true" />
                              <Icon aria-hidden="true" style={{ width: 11, height: 11 }} />
                              <span className="cal-chip-title">{ev.title}</span>
                            </button>
                          );
                        })}
                        {dayEvents.length > 3 && (
                          <span className="cal-more num">+{dayEvents.length - 3} more</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* §11 mobile legend — rendered only below 640px where titles are
              hidden; quiet, monochrome, one line of vocabulary. */}
          <div className="cal-legend" aria-label="Legend">
            {LEGEND_KINDS.map(({ kind, label }) => {
              const Icon = KIND_ICON[kind];
              return (
                <span key={kind} className="cal-legend-item">
                  <Icon aria-hidden="true" style={{ width: 11, height: 11 }} />
                  <span>{label}</span>
                </span>
              );
            })}
            <span className="cal-legend-divider" aria-hidden="true" />
            <span className="cal-legend-item">
              <span className="cal-dot legend-overdue" aria-hidden="true" />
              <span>Overdue</span>
            </span>
            <span className="cal-legend-item">
              <span className="cal-dot legend-partial" aria-hidden="true" />
              <span>Partial</span>
            </span>
          </div>
        </>
      )}
    </div>
  );
}
