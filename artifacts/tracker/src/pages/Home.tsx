import { Link } from "react-router-dom";
import { useApi } from "../lib/api";
import { currentMonth, dollars, shortMonth, todayIso } from "../lib/format";
import { AllocBar, tagColor, SPENDING_COLOR } from "../components/ui";
import { nextPayday } from "../lib/payday";

type DebtAccount = {
  id: number;
  name: string;
  active: boolean;
  currentBalance: number | null;
  pendingPayment: number;
};
type TrendPoint = { date: string; total: number };
type Paycheck = {
  id: number;
  month: string;
  seq: number;
  amount: number;
  totals: { allocated: number; unallocated: number };
};
type Summary = { income: number; byNote: Array<{ note: string; amount: number }> };
type Entry = {
  id: number;
  subject: string | null;
  entryDate: string;
  startTime: string;
  color: string;
};

const FINANCE_ACCENT = "var(--amber)";
const JOURNAL_ACCENT = "var(--carbon)";
const FITNESS_ACCENT = "#4ecb71";

const fmtTime = (iso: string) => {
  const d = new Date(iso);
  const h = d.getHours();
  return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")} ${h >= 12 ? "pm" : "am"}`;
};

const daysAgoIso = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
};

/** Bare single-series sparkline for a stat tile — the figure beside it is its label. */
function Spark({ points, stroke }: { points: number[]; stroke: string }) {
  if (points.length < 2) return null;
  const W = 120;
  const H = 32;
  const PAD = 3;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const x = (i: number) => PAD + (i / (points.length - 1)) * (W - PAD * 2);
  const y = (v: number) => PAD + ((max - v) / range) * (H - PAD * 2);
  const path = points.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="home-spark" aria-hidden="true">
      <path d={path} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(points.length - 1)} cy={y(last)} r="2.5" fill={stroke} />
    </svg>
  );
}

export default function Home() {
  const month = currentMonth();
  const today = todayIso();

  const debts = useApi<DebtAccount[]>("/api/finance/debt-accounts");
  const trend = useApi<TrendPoint[]>("/api/finance/debt/trend");
  const paychecks = useApi<Paycheck[]>("/api/finance/paychecks");
  const summary = useApi<Summary>(`/api/finance/summary/${month}`);
  const entries = useApi<Entry[]>(`/api/journal/entries?from=${daysAgoIso(6)}&to=${today}`);

  const totalOwed = (debts.data ?? [])
    .filter((d) => d.active)
    .reduce((s, d) => s + (d.currentBalance ?? 0), 0);
  const trendPoints = (trend.data ?? []).slice(-12).map((p) => p.total);

  const latest = paychecks.data?.[0];
  const spendingLeft = latest?.totals.unallocated ?? 0;

  const monthSegments = (summary.data?.byNote ?? []).map((r) => ({
    amount: r.amount,
    color: tagColor(r.note),
  }));
  const income = summary.data?.income ?? 0;
  const allocated = monthSegments.reduce((s, r) => s + r.amount, 0);

  const todaysEntries = (entries.data ?? []).filter((e) => e.entryDate === today);
  const weekCount = entries.data?.length ?? 0;

  // Whole days, floored — the masthead countdown shows "05 days 03 hrs", so
  // this figure must agree with its leading number, not round past it.
  const payday = nextPayday();
  const daysLeft = Math.max(0, Math.floor((payday.getTime() - Date.now()) / 86_400_000));

  return (
    <div className="home-shell">
      <div className="home-mast">
        <h1 className="home-title">zh</h1>
        <span className="home-date">
          {new Date().toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </span>
      </div>

      <div className="home-grid">
        {/* ── Finance — the wide card ─────────────────────────────── */}
        <Link
          to="/finance"
          className="home-panel home-panel-wide"
          style={{ ["--card-accent" as string]: FINANCE_ACCENT }}
        >
          <div className="home-panel-head">
            <span className="home-panel-label">Finance</span>
            <span className="home-panel-hint">
              payday in {daysLeft} {daysLeft === 1 ? "day" : "days"} →
            </span>
          </div>

          <div className="home-finance-row">
            <div className="home-stat">
              <span className="eyebrow">Owed</span>
              <span
                className="home-stat-num fig"
                style={totalOwed > 0 ? { color: "var(--stamp)" } : undefined}
              >
                {dollars(totalOwed)}
              </span>
              <Spark points={trendPoints} stroke="var(--stamp)" />
            </div>
            <div className="home-stat">
              <span className="eyebrow">
                Spending left{latest ? ` · ${shortMonth(latest.month)} ${latest.seq}/2` : ""}
              </span>
              <span className="home-stat-num fig" style={{ color: SPENDING_COLOR }}>
                {dollars(spendingLeft)}
              </span>
            </div>
          </div>

          {income > 0 && (
            <div className="home-month-bar">
              <AllocBar
                segments={monthSegments}
                total={income}
                remainder={Math.max(0, income - allocated)}
                height={6}
              />
              <span className="home-month-bar-note">
                {shortMonth(month)} · {dollars(allocated)} of {dollars(income)} allocated
              </span>
            </div>
          )}
        </Link>

        {/* ── Journal ─────────────────────────────────────────────── */}
        <Link
          to="/journal"
          className="home-panel"
          style={{ ["--card-accent" as string]: JOURNAL_ACCENT }}
        >
          <div className="home-panel-head">
            <span className="home-panel-label">Journal</span>
            <span className="home-panel-hint">
              {weekCount} this week →
            </span>
          </div>

          {todaysEntries.length === 0 ? (
            <p className="home-panel-empty">Nothing written today.</p>
          ) : (
            <ul className="home-entry-list">
              {todaysEntries.slice(0, 3).map((e) => (
                <li key={e.id}>
                  <span className="alloc-dot" style={{ background: e.color }} />
                  <span className="home-entry-subject">{e.subject || "Untitled"}</span>
                  <span className="fig home-entry-time">{fmtTime(e.startTime)}</span>
                </li>
              ))}
              {todaysEntries.length > 3 && (
                <li className="home-entry-more">+ {todaysEntries.length - 3} more</li>
              )}
            </ul>
          )}
        </Link>

        {/* ── Fitness ─────────────────────────────────────────────── */}
        <Link
          to="/fitness"
          className="home-panel"
          style={{ ["--card-accent" as string]: FITNESS_ACCENT }}
        >
          <div className="home-panel-head">
            <span className="home-panel-label">Fitness</span>
            <span className="home-panel-hint">→</span>
          </div>
          <p className="home-panel-empty">Nothing here yet — the log is waiting.</p>
        </Link>
      </div>
    </div>
  );
}
