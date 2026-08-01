import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { nextPayday } from "../lib/payday";

const SECTIONS = [
  { label: "Finance", path: "/finance", accent: "var(--amber)" },
  { label: "Journal", path: "/journal", accent: "var(--carbon)" },
  { label: "Fitness", path: "/fitness", accent: "#4ecb71" },
];

const pad2 = (n: number) => String(n).padStart(2, "0");

function useNow(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export default function Home() {
  const now = useNow(1000);
  const payday = nextPayday(now);
  const totalSeconds = Math.max(0, Math.round((payday.getTime() - now.getTime()) / 1000));

  const cells: Array<[string, string]> = [
    [String(Math.floor(totalSeconds / 86400)), "days"],
    [pad2(Math.floor((totalSeconds % 86400) / 3600)), "hrs"],
    [pad2(Math.floor((totalSeconds % 3600) / 60)), "min"],
    [pad2(totalSeconds % 60), "sec"],
  ];

  return (
    <div className="home-shell">
      <h1 className="home-title home-rise">zh</h1>

      <div className="home-countdown home-rise" style={{ ["--rise" as string]: 1 }}>
        <span className="eyebrow">Next payday</span>
        <div className="home-timer" role="timer" aria-label={`Next payday in ${cells[0][0]} days`}>
          {cells.map(([val, label]) => (
            <span key={label} className="home-timer-cell">
              <span className="home-timer-num fig">{val}</span>
              <span className="home-timer-label">{label}</span>
            </span>
          ))}
        </div>
        <span className="home-payday-date fig">
          {payday.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </span>
      </div>

      <nav className="home-cards" aria-label="Sections">
        {SECTIONS.map((s, i) => (
          <Link
            key={s.path}
            to={s.path}
            className="home-card home-rise"
            style={{ ["--card-accent" as string]: s.accent, ["--rise" as string]: i + 2 }}
          >
            <span className="home-card-label">{s.label}</span>
            <span className="home-card-arrow" aria-hidden="true">
              →
            </span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
