import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { nextPayday, cycleProgress } from "../lib/payday";
import { useApi } from "../lib/api";
import { todayIso } from "../lib/format";

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

type GoalPeriod = "day" | "week" | "month";
type ExerciseStat = {
  goalAmount:    number | null;
  goalPeriod:    GoalPeriod | null;
  goalDeadline:  string | null;
  goalStartDate: string | null;
  todayTotal:    number;
  weekTotal:     number;
  monthTotal:    number;
  deadlineTotal: number;
};
type FitnessSummary = { exercises: ExerciseStat[] };

function fitnessGoalPct(exercises: ExerciseStat[], now: Date): { pct: number; onPace: number; total: number } | null {
  const fills: number[] = [];
  let onPace = 0;

  for (const ex of exercises) {
    if (!ex.goalAmount) continue;
    const goal = ex.goalAmount;
    let filled: number;
    let pace: number;

    if (ex.goalDeadline) {
      filled = ex.deadlineTotal / goal;
      const start   = new Date((ex.goalStartDate ?? todayIso()) + "T12:00:00Z");
      const end     = new Date(ex.goalDeadline + "T12:00:00Z");
      const totalMs = Math.max(end.getTime() - start.getTime(), 1);
      pace  = Math.min(Math.max((now.getTime() - start.getTime()) / totalMs, 0), 1);
    } else if (ex.goalPeriod) {
      const raw = ex.goalPeriod === "day" ? ex.todayTotal : ex.goalPeriod === "week" ? ex.weekTotal : ex.monthTotal;
      filled = raw / goal;
      if (ex.goalPeriod === "day") {
        pace = (now.getHours() + now.getMinutes() / 60) / 24;
      } else if (ex.goalPeriod === "week") {
        pace = (now.getDay() * 24 + now.getHours() + now.getMinutes() / 60) / 168;
      } else {
        const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        pace = ((now.getDate() - 1) + (now.getHours() + now.getMinutes() / 60) / 24) / dim;
      }
    } else {
      continue;
    }

    fills.push(Math.min(filled, 1));
    if (filled >= pace) onPace++;
  }

  if (fills.length === 0) return null;
  const avg = fills.reduce((s, v) => s + v, 0) / fills.length;
  return { pct: avg * 100, onPace, total: fills.length };
}

export default function Home() {
  const now     = useNow(1000);
  const payday  = nextPayday(now);
  const cyclePct  = cycleProgress(now) * 100;
  const todayPct  = dayPct(now);

  const fitSummary = useApi<FitnessSummary>(`/api/fitness/summary?today=${todayIso()}`);
  const fitGoal    = fitSummary.data
    ? fitnessGoalPct(fitSummary.data.exercises, now)
    : null;

  const panes = [
    {
      label: "Finance",
      path: "/finance",
      accent: "#4ecb71",
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
      accent: "#e07d3a",
      pct: fitGoal ? fitGoal.pct : null,
      caption: fitGoal ? `${fitGoal.onPace} / ${fitGoal.total} on pace` : null,
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
                <span className="home-pane-pct fig">{Math.round(pane.pct)}%</span>
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
                    : pane.label === "Journal"
                    ? "Progress through the current day"
                    : "Overall fitness goal progress"
                }
              >
                <div className="home-pane-bar-fill" style={{ width: `${pane.pct}%` }} />
              </div>
            )}
            {pane.caption && (
              <span className="home-pane-caption">{pane.caption}</span>
            )}
          </Link>
        ))}
      </nav>
    </div>
  );
}
