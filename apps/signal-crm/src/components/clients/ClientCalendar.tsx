import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { buildMonthGrid, dayKey, WEEKDAY_LABELS } from "../../../convex/calendarLogic";
import type { CalendarEvent } from "../../../convex/calendarLogic";
import { IconAlert, IconBell, IconCalendar, IconChevronRight, IconInvoices, IconRepo } from "../Icons";
import { timeUntil } from "../../lib/format";

const KIND_ICON: Record<CalendarEvent["kind"], React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  deadline: IconRepo,
  followup: IconBell,
  invoice: IconInvoices,
  meeting: IconCalendar,
};

const TODAY_KEY = dayKey(Date.now());

/**
 * Mini month grid for a single client — the "what's happening around this
 * client" widget on the detail page. Same chip register as the full calendar
 * screen (deadline / followup / invoice / meeting), scoped by api.calendar.forContact.
 * Compact by design: chips collapse to dot + icon below 640px, and the widget
 * scrolls within its card on the tightest phones.
 */
export function ClientCalendar({ contactId }: { contactId: Id<"contacts"> }) {
  const navigate = useNavigate();
  const today = new Date();
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() });

  const events = useQuery(api.calendar.forContact, {
    contactId,
    year: cursor.year,
    month: cursor.month,
  });

  const cells = useMemo(
    () => buildMonthGrid(cursor.year, cursor.month),
    [cursor.year, cursor.month],
  );

  // §2.4 keyboard grid — same roving tabindex as the full calendar screen:
  // arrows move between the 42 cells, Home/End to the row ends, cell focus
  // clamps at the grid edges. Today (or the first in-month day) is the entry.
  const initialFocus = (() => {
    const hit = cells.findIndex((c) => dayKey(c.date.getTime()) === TODAY_KEY);
    return hit >= 0 ? hit : Math.max(0, cells.findIndex((c) => c.inMonth));
  })();
  const [focusIdx, setFocusIdx] = useState<number>(initialFocus);
  const cellRefs = useRef<Array<HTMLDivElement | null>>([]);

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
    <section className="mini-cal surface-card" aria-label={`Calendar for ${monthTitle}`}>
      <div className="mini-cal-head">
        <h3>Upcoming</h3>
        <span className="mini-cal-sub num">
          {events === undefined ? "…" : `${events.length} this month`}
          {overdueCount > 0 && events !== undefined && (
            <span className="cal-overdue-num" role="status">
              <IconAlert aria-hidden="true" style={{ width: 11, height: 11 }} />
              {overdueCount} overdue
            </span>
          )}
        </span>
        <div className="mini-cal-nav">
          <button
            type="button"
            className="icon-btn"
            aria-label="Previous month"
            onClick={() => shift(-1)}
          >
            <IconChevronRight style={{ transform: "rotate(180deg)" }} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Next month"
            onClick={() => shift(1)}
          >
            <IconChevronRight />
          </button>
        </div>
      </div>

      <div className="cal-dow" aria-hidden="true">
        {WEEKDAY_LABELS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>

      {events === undefined ? (
        <div className="skeleton" style={{ height: 240 }} aria-hidden="true" />
      ) : (
        <div className="cal-grid" role="grid" aria-label={`Calendar for ${monthTitle}`} onKeyDown={(e) => onGridKey(e, focusIdx)}>
          {cells.map((cell, i) => {
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
                  {dayEvents.slice(0, 2).map((ev) => {
                    const Icon = KIND_ICON[ev.kind];
                    const when =
                      ev.at >= Date.now() ? ` · ${timeUntil(ev.at)}` : "";
                    return (
                      <button
                        key={ev.id}
                        type="button"
                        className={`cal-chip${ev.status === "overdue" ? " overdue" : ""}${ev.status === "partial" ? " partial" : ""}`}
                        title={`${ev.title} — ${ev.subtitle}${when}`}
                        onClick={() => goTo(ev)}
                      >
                        <span className="cal-dot" aria-hidden="true" />
                        <Icon aria-hidden="true" style={{ width: 11, height: 11 }} />
                        <span className="cal-chip-title">{ev.title}</span>
                      </button>
                    );
                  })}
                  {dayEvents.length > 2 && (
                    <span className="cal-more num">+{dayEvents.length - 2}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
