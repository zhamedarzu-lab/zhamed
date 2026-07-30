import { useState } from "react";
import { useApi } from "../../lib/api";
import { currentMonth, dollars, monthName, ordinal } from "../../lib/format";
import { Empty, Loading, MonthPicker, Notice, Panel } from "../../components/ui";
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

  const summary = useApi<Summary>(`/api/finance/summary/${month}`, [month]);
  const paychecks = useApi<Paycheck[]>(`/api/finance/paychecks?month=${month}`, [month]);

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Finance</span>
          <h1>Monthly summary</h1>
          <p>Every paycheck rolled up for {monthName(month)}.</p>
        </div>
        <div className="button-row">
          <FinanceNav />
          <MonthPicker month={month} onChange={setMonth} />
        </div>
      </div>

      <Notice>{summary.error}</Notice>
      {summary.loading && <Loading />}

      {summary.data && (
        <div className="stats" style={{ marginBottom: "1rem" }}>
          <div className="stat-cell">
            <span className="eyebrow">Income</span>
            <span className="amount fig">{dollars(summary.data.income)}</span>
          </div>
          <div className="stat-cell">
            <span className="eyebrow">Allocated</span>
            <span className="amount fig">{dollars(summary.data.allocated)}</span>
          </div>
          <div className="stat-cell">
            <span className="eyebrow">
              {summary.data.unallocated < 0 ? "Over-allocated" : "Unallocated"}
            </span>
            <span
              className={`amount fig ${summary.data.unallocated < 0 ? "neg" : ""}`}
            >
              {dollars(Math.abs(summary.data.unallocated))}
            </span>
          </div>
          <div className="stat-cell">
            <span className="eyebrow">Bills paid</span>
            <span className="amount fig">{dollars(summary.data.actuallyPaid)}</span>
          </div>
        </div>
      )}

      {(summary.data?.byNote.length ?? 0) > 0 && (
        <Panel title="By note" bodyless>
          <table>
            <thead>
              <tr>
                <th>Note</th>
                <th className="num">Amount</th>
                <th className="num">% of income</th>
              </tr>
            </thead>
            <tbody>
              {summary.data?.byNote.map((r) => (
                <tr key={r.note}>
                  <td>{r.note}</td>
                  <td className="num">{dollars(r.amount)}</td>
                  <td className="num muted">
                    {summary.data && summary.data.income > 0
                      ? `${Math.round((r.amount / summary.data.income) * 100)}%`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {paychecks.loading && <Loading />}

      {!paychecks.loading && (paychecks.data?.length ?? 0) === 0 && (
        <Panel>
          <Empty title={`No paychecks for ${monthName(month)}`}>
            <p>Record a paycheck on the Paychecks tab and it will show up here.</p>
          </Empty>
        </Panel>
      )}

      <div className="grid" style={{ gap: "1rem", marginTop: "1rem" }}>
        {paychecks.data?.map((p) => (
          <Panel
            key={p.id}
            title={
              <div>
                <span className="eyebrow">{ordinal(p.seq)} paycheck</span>
                <h2 style={{ marginTop: "0.1rem" }}>{dollars(p.amount)}</h2>
              </div>
            }
            bodyless
          >
            <table>
              <thead>
                <tr>
                  <th>Note</th>
                  <th className="num">Amount</th>
                  <th className="num">% of deposit</th>
                </tr>
              </thead>
              <tbody>
                {p.allocations.map((a) => (
                  <tr key={a.id}>
                    <td>{a.note || <span className="muted">Untitled</span>}</td>
                    <td className="num">{dollars(a.amount)}</td>
                    <td className="num muted">
                      {p.amount > 0 ? `${Math.round((a.amount / p.amount) * 100)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Allocated</td>
                  <td className="num">{dollars(p.totals.allocated)}</td>
                  <td className="num muted">
                    {p.amount > 0
                      ? `${Math.round((p.totals.allocated / p.amount) * 100)}%`
                      : "—"}
                  </td>
                </tr>
              </tfoot>
            </table>
          </Panel>
        ))}
      </div>
    </>
  );
}
