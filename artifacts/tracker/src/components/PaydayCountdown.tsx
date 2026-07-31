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

const pad2 = (n: number) => String(n).padStart(2, "0");

const weekdayDate = (d: Date) =>
  d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

// Each mode is a list of [value, label] pairs to display as cells.
// Index 0 = default (all four units); each tap advances by one, wraps back.
function getModes(days: number, hours: number, minutes: number, seconds: number) {
  return [
    [[days, "days"], [hours, "hrs"], [minutes, "min"], [seconds, "sec"]],
    [[hours, "hrs"], [minutes, "min"], [seconds, "sec"]],
    [[minutes, "min"], [seconds, "sec"]],
    [[seconds, "sec"]],
  ] as [number, string][][];
}

export default function PaydayCountdown() {
  const now = useNow(1000);
  const payday = nextPayday(now);
  const msLeft = payday.getTime() - now.getTime();
  const progressPct = Math.round(cycleProgress(now) * 100);

  const totalSeconds = Math.max(0, Math.round(msLeft / 1000));
  const days    = Math.floor(totalSeconds / 86400);
  const hours   = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const [displayMode, setDisplayMode] = useState(0);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const modes = getModes(days, hours, minutes, seconds);
  const cells = modes[displayMode];

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
        <div className="payday-strip">
          {/* TODAY — opens/closes the calendar popover */}
          <button
            type="button"
            className="payday-field payday-field-btn"
            onClick={() => setOpen((o) => !o)}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-label="Open payday calendar"
          >
            <span className="eyebrow">Today</span>
            <span className="fig payday-today">{weekdayDate(now)}</span>
          </button>

          {/* NEXT PAYDAY — cycles through display formats on each tap */}
          <button
            type="button"
            className="payday-field payday-field-btn"
            onClick={() => setDisplayMode((m) => (m + 1) % modes.length)}
            aria-label={`Next payday: ${formatCountdown(msLeft)}. Tap to change format.`}
          >
            <span className="eyebrow">Next payday</span>
            <span className="payday-timer">
              {cells.map(([val, label]) => (
                <span key={label} className="payday-timer-cell">
                  <span className="payday-timer-num fig">{pad2(val)}</span>
                  <span className="payday-timer-label">{label}</span>
                </span>
              ))}
            </span>
            <span className="payday-target">{weekdayDate(payday)}</span>
          </button>
        </div>

        {open && <PaydayCalendar now={now} />}
      </div>
    </>
  );
}
