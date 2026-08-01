/**
 * HighlightCountdown — shows a live countdown to the nearest upcoming
 * day highlight that has show_countdown=true.
 * Tapping toggles between "N days away" and "Xd Xh Xm Xs".
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

function formatMs(ms: number, expanded: boolean): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  if (!expanded) {
    const days = Math.floor(totalSec / 86400);
    if (days === 0) return "today";
    return days === 1 ? "tomorrow" : `${days}d away`;
  }
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${d}d ${pad2(h)}h ${pad2(m)}m ${pad2(s)}s`;
}

type Props = {
  highlights: DayHighlight[];
};

export default function HighlightCountdown({ highlights }: Props) {
  const now = useNow(1000);
  const [expanded, setExpanded] = useState(false);

  // Find the nearest highlight with show_countdown=true whose day midnight is still
  // in the future. Using timestamp comparison avoids the bug where a "today" highlight
  // (midnight already past) is chosen as nearest candidate but yields a negative msLeft,
  // which would both return null AND suppress tomorrow's highlights.
  const upcoming = highlights
    .filter(h => {
      if (!h.showCountdown) return false;
      const targetMs = new Date(h.date + "T00:00:00").getTime();
      return targetMs > now.getTime();
    })
    .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;

  if (!upcoming) return null;

  const target = new Date(upcoming.date + "T00:00:00");
  const msLeft = target.getTime() - now.getTime();

  // msLeft is always positive here (filtered above), but guard for safety
  if (msLeft <= 0) return null;

  const display = formatMs(msLeft, expanded);

  return (
    <button
      type="button"
      className="highlight-countdown-btn"
      style={{ "--hc-color": upcoming.color } as React.CSSProperties}
      onClick={() => setExpanded(v => !v)}
      aria-label={`${upcoming.label}: ${display}. Tap to toggle format.`}
      title={`${upcoming.label} — ${upcoming.date}`}
    >
      <span className="hc-dot" />
      <span className="hc-label">{upcoming.label}</span>
      <span className="hc-time">{display}</span>
    </button>
  );
}
