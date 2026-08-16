import { useMemo, useState } from "react";
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
          <h2>{monthTitle}</h2>
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
          <div className="cal-grid" role="grid" aria-label={`Calendar for ${monthTitle}`}>
            {cells.map((cell) => {
              const key = dayKey(cell.date.getTime());
              const dayEvents = byDay.get(key) ?? [];
              const isToday = key === dayKey(today.getTime());
              return (
                <div
                  key={key}
                  role="gridcell"
                  aria-label={cell.date.toDateString()}
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
        </>
      )}
    </div>
  );
}
