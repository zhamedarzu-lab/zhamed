import { useEffect, useRef, useState } from "react";
import { nextPayday, formatCountdown, cycleProgress } from "../lib/payday";
import PaydayCalendar from "./PaydayCalendar";

/** Ticks once a second so the countdown reads live instead of stale. */
function useNow(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

const weekdayDate = (d: Date) =>
  d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

export default function PaydayCountdown() {
  const now = useNow(1000);
  const payday = nextPayday(now);
  const msLeft = payday.getTime() - now.getTime();
  const progressPct = Math.round(cycleProgress(now) * 100);

  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Click-away and Escape both close the popover; only wired up while open.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <>
      {/* Fixed so it runs the full width of the viewport, pinned to the very
          top edge regardless of scroll — independent of the masthead's own
          (narrower, positioned) layout below it. */}
      <div
        className="payday-top-bar"
        role="progressbar"
        aria-label="Progress through the current pay cycle"
        aria-valuenow={progressPct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="payday-top-bar-fill" style={{ width: `${progressPct}%` }} />
      </div>

      <div className="payday-trigger-wrap" ref={wrapRef}>
        <button
          type="button"
          className="payday-strip"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label="Open payday calendar"
        >
          <span className="payday-field">
            <span className="eyebrow">Today</span>
            <span className="fig payday-today">{weekdayDate(now)}</span>
          </span>
          <span className="payday-field">
            <span className="eyebrow">Next payday</span>
            <span className="fig payday-count">{formatCountdown(msLeft)}</span>
            <span className="payday-target">{weekdayDate(payday)}</span>
          </span>
        </button>
        {open && <PaydayCalendar now={now} />}
      </div>
    </>
  );
}
