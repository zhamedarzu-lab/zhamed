/**
 * HighlightCountdown — one strip per upcoming highlight that has
 * show_countdown=true, each with its own independent d/h/m/s cycling timer.
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

function CountdownStrip({ highlight, now }: { highlight: DayHighlight; now: Date }) {
  const [mode, setMode] = useState(0);

  const target = new Date(
    highlight.startTime
      ? `${highlight.date}T${highlight.startTime}:00`
      : `${highlight.date}T00:00:00`
  );
  const msLeft   = Math.max(0, target.getTime() - now.getTime());
  const totalSec = Math.round(msLeft / 1000);
  const modes    = getModes(totalSec);
  const cells    = modes[mode % modes.length];

  const targetDate = target.toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
    ...(highlight.startTime ? { hour: "numeric", minute: "2-digit" } : {}),
  });

  return (
    <div className="hl-countdown-strip" style={{ "--hc-color": highlight.color } as React.CSSProperties}>
      <div className="hl-countdown-left">
        <span className="eyebrow">✦ Highlight</span>
        <span className="hl-countdown-name">{highlight.label}</span>
        <span className="hl-countdown-date">{targetDate}</span>
      </div>
      <button
        type="button"
        className="hl-countdown-timer-btn"
        onClick={() => setMode(m => (m + 1) % modes.length)}
        aria-label={`Countdown to ${highlight.label}. Tap to change format.`}
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

export default function HighlightCountdown({ highlights }: { highlights: DayHighlight[] }) {
  const now = useNow(1000);

  const upcoming = highlights
    .filter(h => {
      if (!h.showCountdown) return false;
      const target = new Date(
        h.startTime ? `${h.date}T${h.startTime}:00` : `${h.date}T00:00:00`
      );
      return target.getTime() > now.getTime();
    })
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? "").localeCompare(b.startTime ?? ""));

  if (upcoming.length === 0) return null;

  return (
    <>
      {upcoming.map(h => (
        <CountdownStrip key={h.id} highlight={h} now={now} />
      ))}
    </>
  );
}
