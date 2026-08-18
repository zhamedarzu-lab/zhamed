import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { nextPayday, formatCountdown, cycleProgress } from "../lib/payday";
import { countdownModes, dayProgressPct, fmtClock, pad2, useNow, weekdayDate } from "../lib/clock";
import PaydayCalendar from "./PaydayCalendar";

export default function PaydayCountdown() {
  const { pathname } = useLocation();
  const isJournal  = pathname.startsWith("/journal");
  const isFitness  = pathname.startsWith("/fitness");
  const isFinance  = !isJournal && !isFitness;
  const now = useNow(1000);
  const payday = nextPayday(now);
  const msLeft = payday.getTime() - now.getTime();
  const progressPct = isJournal
    ? Math.round(dayProgressPct(now))
    : Math.round(cycleProgress(now) * 100);

  const totalSeconds = Math.max(0, Math.round(msLeft / 1000));

  const [displayMode, setDisplayMode] = useState(0);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const modes = countdownModes(totalSeconds);
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

  const barClass  = isJournal ? "day-top-bar"  : "payday-top-bar";
  const fillClass = isJournal ? "day-top-bar-fill" : "payday-top-bar-fill";

  return (
    <>
      {/* Progress bar — full-width, pinned to very top of viewport */}
      {!isFitness && <div
        className={barClass}
        role="progressbar"
        aria-label={isJournal ? "Progress through the current day" : "Progress through the current pay cycle"}
        aria-valuenow={progressPct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {/* key forces a new DOM node on section switch — a new element has no
            previous width, so the CSS width transition never creeps from the
            old section's value. */}
        <div key={isJournal ? "j" : "f"} className={fillClass} style={{ width: `${progressPct}%` }} />
        <span className="top-bar-pct">{progressPct}%</span>
      </div>}

      {/* Countdown widget — finance only */}
      {isFinance && (
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
              <span className="payday-clock fig">{fmtClock(now)}</span>
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
                {cells.map(([val, label, pad]) => (
                  <span key={label} className="payday-timer-cell">
                    <span className="payday-timer-num fig">{pad ? pad2(val) : val}</span>
                    <span className="payday-timer-label">{label}</span>
                  </span>
                ))}
              </span>
              <span className="payday-target">{weekdayDate(payday)}</span>
            </button>
          </div>

          {open && <PaydayCalendar now={now} />}
        </div>
      )}

      {/* On non-finance pages just show Today + clock */}
      {!isFinance && (
        <div className="payday-trigger-wrap">
          <div className="payday-strip">
            <div className="payday-field">
              <span className="eyebrow">Today</span>
              <span className="fig payday-today">{weekdayDate(now)}</span>
              <span className="payday-clock fig">{fmtClock(now)}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
