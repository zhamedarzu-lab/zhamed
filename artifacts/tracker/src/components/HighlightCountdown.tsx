/**
 * HighlightCountdown — one strip per upcoming highlight that has
 * show_countdown=true, each with its own independent d/h/m/s cycling timer
 * and a progress bar from creation → target.
 */
import { useState } from "react";
import type { DayHighlight } from "../pages/journal/HighlightModal";
import { countdownModes, pad2, useNow } from "../lib/clock";

function CountdownStrip({ highlight, now }: { highlight: DayHighlight; now: Date }) {
  const [mode, setMode] = useState(0);

  const target = new Date(
    highlight.startTime
      ? `${highlight.date}T${highlight.startTime}:00`
      : `${highlight.date}T00:00:00`
  );

  const created  = new Date(highlight.createdAt);
  const totalSpan = Math.max(1, target.getTime() - created.getTime());
  const elapsed   = Math.min(totalSpan, Math.max(0, now.getTime() - created.getTime()));
  const progressPct = (elapsed / totalSpan) * 100;

  const msLeft   = Math.max(0, target.getTime() - now.getTime());
  const totalSec = Math.round(msLeft / 1000);
  const modes    = countdownModes(totalSec);
  const cells    = modes[mode % modes.length];

  const targetDate = target.toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
    ...(highlight.startTime ? { hour: "numeric", minute: "2-digit" } : {}),
  });

  return (
    <div className="hl-countdown-strip" style={{ "--hc-color": highlight.color } as React.CSSProperties}>
      <div className="hl-countdown-body">
        {/* Top row: name + timer */}
        <div className="hl-countdown-row">
          <div className="hl-countdown-left">
            <span className="hl-countdown-name">
              <span className="hl-countdown-icon">✦</span>
              {highlight.label || "Highlight"}
            </span>
            <span className="hl-countdown-date">{targetDate}</span>
          </div>
          <button
            type="button"
            className="hl-countdown-timer-btn"
            onClick={() => setMode(m => (m + 1) % modes.length)}
            aria-label={`Countdown to ${highlight.label}. Tap to change format.`}
          >
            <span className="hl-countdown-cells">
              {cells.map(([val, label]) => (
                <span key={label} className="hl-countdown-cell">
                  <span className="hl-countdown-num">{pad2(val)}</span>
                  <span className="hl-countdown-unit">{label}</span>
                </span>
              ))}
            </span>
          </button>
        </div>

        {/* Progress bar */}
        <div className="hl-countdown-bar-track">
          <div
            className="hl-countdown-bar-fill"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>
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
