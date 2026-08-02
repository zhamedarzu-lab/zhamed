import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
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

const fmtClock = (d: Date) => {
  const h = d.getHours(), m = d.getMinutes(), s = d.getSeconds();
  return `${h % 12 || 12}:${pad2(m)}:${pad2(s)} ${h >= 12 ? "pm" : "am"}`;
};

// Each cell: [value, label, pad] — pad=true uses 2-digit zero-padding (for
// remainder units 0-59). The leading "total" unit in collapsed modes is never
// padded since it can be 3+ digits.
type Cell = [number, string, boolean];

function getModes(totalSeconds: number): Cell[][] {
  const days    = Math.floor(totalSeconds / 86400);
  const hours   = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const totalHours   = Math.floor(totalSeconds / 3600);
  const totalMinutes = Math.floor(totalSeconds / 60);

  return [
    // Mode 0: d h m s  (all components, each padded to 2 digits)
    [[days, "days", true], [hours, "hrs", true], [minutes, "min", true], [seconds, "sec", true]],
    // Mode 1: translate days → total hours, keep m s remainders
    [[totalHours, "hrs", false], [minutes, "min", true], [seconds, "sec", true]],
    // Mode 2: translate hours → total minutes, keep s remainder
    [[totalMinutes, "min", false], [seconds, "sec", true]],
    // Mode 3: total seconds only
    [[totalSeconds, "sec", false]],
  ];
}

function dayProgressPct(now: Date): number {
  return Math.round(((now.getHours() * 60 + now.getMinutes()) / 1440) * 100);
}

export default function PaydayCountdown() {
  const { pathname } = useLocation();
  const isJournal  = pathname.startsWith("/journal");
  const isFitness  = pathname.startsWith("/fitness");
  const isFinance  = !isJournal && !isFitness;
  const now = useNow(1000);
  const payday = nextPayday(now);
  const msLeft = payday.getTime() - now.getTime();
  const progressPct = isJournal
    ? dayProgressPct(now)
    : Math.round(cycleProgress(now) * 100);

  const totalSeconds = Math.max(0, Math.round(msLeft / 1000));

  const [displayMode, setDisplayMode] = useState(0);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const modes = getModes(totalSeconds);
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

  // Suppress the width transition for one frame when switching sections so the
  // bar snaps to the correct position instead of sliding from the old value.
  const prevSectionRef = useRef(isJournal);
  const [snapNow, setSnapNow] = useState(false);
  useEffect(() => {
    if (prevSectionRef.current !== isJournal) {
      prevSectionRef.current = isJournal;
      setSnapNow(true);
      const raf = requestAnimationFrame(() => setSnapNow(false));
      return () => cancelAnimationFrame(raf);
    }
  }, [isJournal]);

  return (
    <>
      {/* Progress bar — full-width, pinned to very top of viewport */}
      <div
        className={barClass}
        role="progressbar"
        aria-label={isJournal ? "Progress through the current day" : "Progress through the current pay cycle"}
        aria-valuenow={progressPct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={fillClass} style={{ width: `${progressPct}%`, ...(snapNow ? { transition: "none" } : {}) }} />
        <span className="top-bar-pct">{progressPct}%</span>
      </div>

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
            <button
              type="button"
              className="payday-field payday-field-btn"
              onClick={() => {}}
              aria-label="Today's date"
            >
              <span className="eyebrow">Today</span>
              <span className="fig payday-today">{weekdayDate(now)}</span>
              <span className="payday-clock fig">{fmtClock(now)}</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
