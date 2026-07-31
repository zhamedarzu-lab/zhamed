import { useState } from "react";
import { isPayday } from "../lib/payday";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const monthLabel = (y: number, m: number) =>
  new Date(y, m, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Month grid popover. Navigable independent of the live clock ticking in `now`. */
export default function PaydayCalendar({ now }: { now: Date }) {
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

  const shift = (delta: number) => {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };

  const isCurrentView = viewYear === now.getFullYear() && viewMonth === now.getMonth();

  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(viewYear, viewMonth, i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="payday-cal" role="dialog" aria-label="Payday calendar">
      <div className="payday-cal-head">
        <button type="button" className="payday-cal-nav" onClick={() => shift(-1)} aria-label="Previous month">
          ‹
        </button>
        <span className="payday-cal-month">{monthLabel(viewYear, viewMonth)}</span>
        <button type="button" className="payday-cal-nav" onClick={() => shift(1)} aria-label="Next month">
          ›
        </button>
      </div>

      {!isCurrentView && (
        <button
          type="button"
          className="payday-cal-jump"
          onClick={() => {
            setViewYear(now.getFullYear());
            setViewMonth(now.getMonth());
          }}
        >
          Jump to today
        </button>
      )}

      <div className="payday-cal-grid">
        {WEEKDAYS.map((w) => (
          <span key={w} className="payday-cal-weekday">
            {w}
          </span>
        ))}
        {cells.map((date, i) =>
          date ? (
            <span
              key={i}
              className="payday-cal-day"
              data-today={sameDay(date, now) || undefined}
              data-payday={isPayday(date) || undefined}
            >
              {date.getDate()}
            </span>
          ) : (
            <span key={i} className="payday-cal-day is-blank" aria-hidden="true" />
          ),
        )}
      </div>

      <div className="payday-cal-legend">
        <span className="payday-cal-dot" aria-hidden="true" />
        Payday
      </div>
    </div>
  );
}
