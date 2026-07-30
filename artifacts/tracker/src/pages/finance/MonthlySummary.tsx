import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../../lib/api";
import { currentMonth, dollars, monthName } from "../../lib/format";
import {
  AllocBar,
  Empty,
  Loading,
  MonthPicker,
  Notice,
  Panel,
  SPENDING_COLOR,
  tagColor,
} from "../../components/ui";
import FinanceNav from "./FinanceNav";

type Summary = {
  income: number;
  allocated: number;
  unallocated: number;
  actuallyPaid: number;
  byNote: Array<{ note: string; amount: number }>;
};

type Paycheck = {
  id: number;
  month: string;
  seq: number;
  amount: number;
  allocations: Array<{ id: number; amount: number; note: string }>;
  totals: { allocated: number; unallocated: number };
};

export default function MonthlySummary() {
  const [month, setMonth] = useState(currentMonth());
  const navigate = useNavigate();

  const summary = useApi<Summary>(`/api/finance/summary/${month}`, [month]);
  const paychecks = useApi<Paycheck[]>(`/api/finance/paychecks?month=${month}`, [month]);

  // Month-level bar: all notes rolled up
  const monthSegments = useMemo(
    () => (summary.data?.byNote ?? []).map((r) => ({ amount: r.amount, color: tagColor(r.note) })),
    [summary.data],
  );

  const spending = summary.data?.unallocated ?? 0;
  const income = summary.data?.income ?? 0;

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Finance</span>
          <h1>Monthly summary</h1>
        </div>
        <div className="button-row">
          <FinanceNav />
          <MonthPicker month={month} onChange={setMonth} />
        </div>
      </div>

      <Notice>{summary.error}</Notice>
      {summary.loading && <Loading />}

      {summary.data && (
        <>
          {/* ── Stats ──────────────────────────────────────────────── */}
          <div className="stats" style={{ marginBottom: "1rem" }}>
            <div className="stat-cell">
              <span className="eyebrow">Income</span>
              <span className="amount fig">{dollars(income)}</span>
            </div>
            <div className="stat-cell">
              <span className="eyebrow">Allocated</span>
              <span className="amount fig">{dollars(summary.data.allocated)}</span>
            </div>
            <div className="stat-cell">
              <span className="eyebrow">
                {spending < -0.005 ? "Over-allocated" : "Spending"}
              </span>
              <span
                className="amount fig"
                style={{ color: spending < -0.005 ? "var(--stamp)" : SPENDING_COLOR }}
              >
                {dollars(Math.abs(spending))}
              </span>
            </div>
          </div>

          {/* ── Monthly rollup ─────────────────────────────────────── */}
          {summary.data.byNote.length > 0 && (
            <Panel title={monthName(month)} bodyless>
              <AllocBar
                segments={monthSegments}
                total={income}
                remainder={spending > 0.005 ? spending : undefined}
                height={10}
              />
              <div className="panel-body">
                <ul className="alloc-list stacked">
                  {summary.data.byNote.map((r) => (
                    <li key={r.note}>
                      <span className="alloc-dot" style={{ background: tagColor(r.note) }} />
                      <span className="alloc-note">{r.note || <span className="muted">Untitled</span>}</span>
                      <span className="fig alloc-amt">{dollars(r.amount)}</span>
                      {income > 0 && (
                        <span className="alloc-pct">
                          {Math.round((r.amount / income) * 100)}%
                        </span>
                      )}
                    </li>
                  ))}
                  {spending > 0.005 && (
                    <li>
                      <span className="alloc-dot" style={{ background: SPENDING_COLOR, opacity: 0.55 }} />
                      <span className="alloc-note muted">Spending</span>
                      <span className="fig alloc-amt" style={{ color: SPENDING_COLOR }}>
                        {dollars(spending)}
                      </span>
                      {income > 0 && (
                        <span className="alloc-pct">
                          {Math.round((spending / income) * 100)}%
                        </span>
                      )}
                    </li>
                  )}
                </ul>
              </div>
            </Panel>
          )}
        </>
      )}

      {paychecks.loading && <Loading />}

      {!paychecks.loading && (paychecks.data?.length ?? 0) === 0 && (
        <Panel style={{ marginTop: "1rem" }}>
          <Empty title={`No paychecks for ${monthName(month)}`}>
            <p>Record a paycheck on the Paychecks tab and it will show up here.</p>
          </Empty>
        </Panel>
      )}

      {/* ── Per-paycheck cards ─────────────────────────────────────── */}
      <div className="grid" style={{ gap: "1rem", marginTop: "1rem" }}>
        {paychecks.data?.map((p) => (
          <Panel
            key={p.id}
            title={
              <h2 style={{ marginTop: "0.1rem" }}>
                <span className="muted" style={{ fontFamily: "var(--fig)", fontSize: "0.85em" }}>
                  {p.seq}/2
                </span>
                <span className="muted" style={{ margin: "0 0.4rem" }}>·</span>
                <span className="fig">{dollars(p.amount)}</span>
              </h2>
            }
            action={
              <div className="button-row" style={{ alignItems: "center" }}>
                {p.totals.unallocated > 0.005 && (
                  <span className="paycheck-spending">
                    <span className="paycheck-spending-label">spending</span>
                    <span className="fig">{dollars(p.totals.unallocated)}</span>
                  </span>
                )}
                <button className="quiet" onClick={() => navigate(`/finance/paycheck/${p.id}`)}>
                  Edit
                </button>
              </div>
            }
            bodyless
          >
            <AllocBar
              segments={p.allocations.map((a) => ({ amount: a.amount, color: tagColor(a.note) }))}
              total={p.amount}
              remainder={p.totals.unallocated}
              height={8}
            />
            <div className="panel-body">
              {p.allocations.length === 0 ? (
                <span className="muted">Nothing recorded yet.</span>
              ) : (
                <ul className="alloc-list stacked">
                  {p.allocations.map((a) => (
                    <li key={a.id}>
                      <span className="alloc-dot" style={{ background: tagColor(a.note) }} />
                      <span className="alloc-note">
                        {a.note || <span className="muted">Untitled</span>}
                      </span>
                      <span className="fig alloc-amt">{dollars(a.amount)}</span>
                      {p.amount > 0 && (
                        <span className="alloc-pct">
                          {Math.round((a.amount / p.amount) * 100)}%
                        </span>
                      )}
                    </li>
                  ))}
                  {p.totals.unallocated > 0.005 && (
                    <li>
                      <span className="alloc-dot" style={{ background: SPENDING_COLOR, opacity: 0.55 }} />
                      <span className="alloc-note muted">Spending</span>
                      <span className="fig alloc-amt" style={{ color: SPENDING_COLOR }}>
                        {dollars(p.totals.unallocated)}
                      </span>
                      {p.amount > 0 && (
                        <span className="alloc-pct">
                          {Math.round((p.totals.unallocated / p.amount) * 100)}%
                        </span>
                      )}
                    </li>
                  )}
                </ul>
              )}
            </div>
          </Panel>
        ))}
      </div>
    </>
  );
}
