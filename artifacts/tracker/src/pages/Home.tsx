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

  /* One bubble per book. `tint` only rings the bubble — the red stamp stays
     reserved for the debt figure itself, and only when something is owed. */
  const books = [
    {
      to: "/finance",
      label: "Finance",
      caption: "Owed",
      figure: dollars(totalDebt),
      owing: totalDebt > 0,
      tint: "var(--carbon)",
    },
    {
      to: "/fitness",
      label: "Fitness",
      caption: "Last session",
      figure: lastWorkout ? shortDate(lastWorkout.date) : "—",
      owing: false,
      tint: "var(--rule-strong)",
    },
    {
      to: "/journal",
      label: "Journal",
      caption: "Last written",
      figure: lastEntry ? shortDate(lastEntry.date) : "—",
      owing: false,
      tint: "var(--ink-soft)",
    },
  ];

  return (
    <>
      <div className="page-head bare">
        <div>
          <span className="eyebrow">{monthName(month)}</span>
          <h1>Where things stand</h1>
          <p>Three books, kept by hand. Pick one.</p>
        </div>
      </div>

      <nav className="bubbles" aria-label="Books">
        {books.map((book, i) => (
          <Link
            key={book.to}
            to={book.to}
            className="bubble"
            style={{ ["--i" as string]: i, ["--tint" as string]: book.tint }}
          >
            <span className="bubble-label">{book.label}</span>
            <span className="bubble-caption">{book.caption}</span>
            <strong className={book.owing ? "neg" : undefined}>{book.figure}</strong>
          </Link>
        ))}
      </nav>

      <p className="bubbles-note">
        Income this month {dollars(summary.data?.income ?? 0)}.
      </p>
    </>
  );
}
