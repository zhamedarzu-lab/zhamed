import { useEffect, useState } from "react";
import { nextPayday, formatCountdown } from "../lib/payday";

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

  return (
    <div className="payday-strip">
      <div className="payday-field">
        <span className="eyebrow">Today</span>
        <span className="fig payday-today">{weekdayDate(now)}</span>
      </div>
      <div className="payday-field">
        <span className="eyebrow">Next payday</span>
        <span className="fig payday-count">{formatCountdown(msLeft)}</span>
        <span className="payday-target">{weekdayDate(payday)}</span>
      </div>
    </div>
  );
}
