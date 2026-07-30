import { Link } from "react-router-dom";
import { useApi } from "../lib/api";
import { currentMonth, dollars, monthName, shortDate } from "../lib/format";

type Summary = { income: number; totalToDebt: number; billsDelta: number };
type DebtAccount = { id: number; name: string; active: boolean; currentBalance: number | null };
type FitnessLog = { id: number; date: string; workoutType: string | null };
type JournalEntry = { id: number; date: string };

export default function Home() {
  const month = currentMonth();
  const summary = useApi<Summary>(`/api/finance/summary/${month}`);
  const debts = useApi<DebtAccount[]>("/api/finance/debt-accounts");
  const workouts = useApi<FitnessLog[]>("/api/fitness/logs?limit=5");
  const entries = useApi<JournalEntry[]>("/api/journal/entries");

  const totalDebt = (debts.data ?? [])
    .filter((d) => d.active)
    .reduce((s, d) => s + (d.currentBalance ?? 0), 0);

  const lastWorkout = workouts.data?.[0];
  const lastEntry = entries.data?.[0];

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">{monthName(month)}</span>
          <h1>Where things stand</h1>
          <p>Three books, kept by hand. Pick one.</p>
        </div>
      </div>

      <div className="grid grid-3">
        <Link to="/finance" className="module-card" style={{ ["--accent" as string]: "var(--stamp)" }}>
          <span className="eyebrow">Book one</span>
          <h2>Finance</h2>
          <p>Split each paycheck, log the bills you actually paid, watch the debt come down.</p>
          <div className="stat">
            <span>Owed across accounts</span>
            <strong className={totalDebt > 0 ? "neg" : "pos"}>{dollars(totalDebt)}</strong>
          </div>
          <div className="stat" style={{ borderTop: "none", marginTop: 0, paddingTop: 0 }}>
            <span>Income this month</span>
            <strong>{dollars(summary.data?.income ?? 0)}</strong>
          </div>
        </Link>

        <Link to="/fitness" className="module-card" style={{ ["--accent" as string]: "var(--carbon)" }}>
          <span className="eyebrow">Book two</span>
          <h2>Fitness</h2>
          <p>A date, a label, a few words. Nothing more to fill in than that.</p>
          <div className="stat">
            <span>Last session</span>
            <strong>
              {lastWorkout
                ? `${shortDate(lastWorkout.date)}${lastWorkout.workoutType ? ` · ${lastWorkout.workoutType}` : ""}`
                : "Nothing logged"}
            </strong>
          </div>
        </Link>

        <Link to="/journal" className="module-card" style={{ ["--accent" as string]: "var(--ink)" }}>
          <span className="eyebrow">Book three</span>
          <h2>Journal</h2>
          <p>A calendar of days. Click one, write in it, add photos.</p>
          <div className="stat">
            <span>Last written</span>
            <strong>{lastEntry ? shortDate(lastEntry.date) : "Nothing written"}</strong>
          </div>
        </Link>
      </div>
    </>
  );
}
