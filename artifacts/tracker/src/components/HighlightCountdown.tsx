/**
 * HighlightCountdown — strip below the month grid showing a live countdown
 * to the nearest upcoming highlight with show_countdown=true.
 * Tapping the timer section cycles through d/h/m/s formats (like payday strip).
 */
import { useEffect, useState } from "react";
import type { DayHighlight } from "../pages/journal/HighlightModal";

function useNow(ms: number) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

type Cell = [number, string];
function getModes(totalSec: number): Cell[][] {
  const days    = Math.floor(totalSec / 86400);
  const hours   = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const totalHours   = Math.floor(totalSec / 3600);
  const totalMinutes = Math.floor(totalSec / 60);
  return [
    [[days, "days"], [hours, "hrs"], [minutes, "min"], [seconds, "sec"]],
    [[totalHours, "hrs"], [minutes, "min"], [seconds, "sec"]],
    [[totalMinutes, "min"], [seconds, "sec"]],
    [[totalSec, "sec"]],
  ];
}

export default function HighlightCountdown({ highlights }: { highlights: DayHighlight[] }) {
  const now = useNow(1000);
  const [mode, setMode] = useState(0);

  const upcoming = highlights
    .filter(h => {
      if (!h.showCountdown) return false;
      return new Date(h.date + "T00:00:00").getTime() > now.getTime();
    })
    .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;

  if (!upcoming) return null;

  const msLeft = Math.max(0, new Date(upcoming.date + "T00:00:00").getTime() - now.getTime());
  if (msLeft <= 0) return null;

  const totalSec = Math.round(msLeft / 1000);
  const modes = getModes(totalSec);
  const cells = modes[mode % modes.length];

  const targetDate = new Date(upcoming.date + "T00:00:00")
    .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  return (
    <div className="hl-countdown-strip" style={{ "--hc-color": upcoming.color } as React.CSSProperties}>
      {/* Left: highlight label */}
      <div className="hl-countdown-left">
        <span className="eyebrow">✦ Highlight</span>
        <span className="hl-countdown-name">{upcoming.label}</span>
        <span className="hl-countdown-date">{targetDate}</span>
      </div>

      {/* Right: cycling countdown timer */}
      <button
        type="button"
        className="hl-countdown-timer-btn"
        onClick={() => setMode(m => (m + 1) % modes.length)}
        aria-label={`Countdown to ${upcoming.label}. Tap to change format.`}
      >
        <span className="eyebrow">Countdown</span>
        <span className="hl-countdown-cells">
          {cells.map(([val, label]) => (
            <span key={label} className="hl-countdown-cell">
              <span className="hl-countdown-num">{pad2(val as number)}</span>
              <span className="hl-countdown-unit">{label as string}</span>
            </span>
          ))}
        </span>
      </button>
    </div>
  );
}
