import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { nextPayday, cycleProgress } from "../lib/payday";

const pad2 = (n: number) => String(n).padStart(2, "0");

function useNow(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

const fmtClock = (d: Date) => {
  const h = d.getHours();
  return `${h % 12 || 12}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())} ${h >= 12 ? "pm" : "am"}`;
};

/** Same day arithmetic as the journal top bar: minutes elapsed of 1440. */
const dayPct = (d: Date) => ((d.getHours() * 60 + d.getMinutes()) / 1440) * 100;

export default function Home() {
  const now = useNow(1000);
  const payday = nextPayday(now);
  const cyclePct = cycleProgress(now) * 100;
  const todayPct = dayPct(now);

  const panes = [
    {
      label: "Finance",
      path: "/finance",
      accent: "#e0b04e",
      pct: cyclePct,
      caption: `payday · ${payday.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      })}`,
    },
    {
      label: "Journal",
      path: "/journal",
      accent: "#6b9fd4",
      pct: todayPct,
      caption: "today",
    },
    {
      label: "Fitness",
      path: "/fitness",
      accent: "#4ecb71",
      pct: null,
      caption: null,
    },
  ];

  return (
    <div className="home-shell">
      <div className="home-mast home-rise">
        <h1 className="home-title">zh</h1>
        <span className="home-clock fig">{fmtClock(now)}</span>
        <span className="home-date fig">
          {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </span>
      </div>

      <nav className="home-panes" aria-label="Sections">
        {panes.map((pane, i) => (
          <Link
            key={pane.path}
            to={pane.path}
            className="home-pane home-rise"
            style={{ ["--pane-accent" as string]: pane.accent, ["--rise" as string]: i + 1 }}
          >
            <div className="home-pane-head">
              <span className="home-pane-label">{pane.label}</span>
              {pane.pct !== null && (
                <span className="home-pane-pct fig">
                  {Math.round(pane.pct)}%
                  {pane.caption && <span className="home-pane-caption"> · {pane.caption}</span>}
                </span>
              )}
            </div>
            {pane.pct !== null && (
              <div
                className="home-pane-bar"
                role="progressbar"
                aria-valuenow={Math.round(pane.pct)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={
                  pane.label === "Finance"
                    ? "Progress through the current pay cycle"
                    : "Progress through the current day"
                }
              >
                <div className="home-pane-bar-fill" style={{ width: `${pane.pct}%` }} />
              </div>
            )}
          </Link>
        ))}
      </nav>
    </div>
  );
}
