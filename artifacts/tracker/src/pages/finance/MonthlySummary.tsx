import { useState } from "react";
import { useApi } from "../../lib/api";
import { currentMonth, dollars, monthName, ordinal, shiftMonth } from "../../lib/format";
import { Empty, Loading, Notice, Panel } from "../../components/ui";
import FinanceNav from "./FinanceNav";

type Summary = {
  income: number;
  setAsideForBills: number;
  actuallyPaid: number;
  billsDelta: number;
  totalToDebt: number;
  creditDump: number;
  surplus: number;
};

type Paycheck = {
  id: number;
  month: string;
  seq: number;
  amount: number;
  totals: {
    bills: number;
    debt: number;
    creditDump: number;
    surplus: number;
    allocated: number;
    unallocated: number;
  };
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
          <div className="segmented" role="group" aria-label="Select month">
            <button
              className="quiet"
              type="button"
              onClick={() => setMonth(shiftMonth(month, -1))}
            >
              ‹
            </button>
            <span
              className="fig"
              style={{
                padding: "0.45rem 0.85rem",
                fontSize: "0.875rem",
                display: "inline-block",
                userSelect: "none",
              }}
            >
              {monthName(month)}
            </span>
            <button
              className="quiet"
              type="button"
              onClick={() => setMonth(shiftMonth(month, 1))}
            >
              ›
            </button>
          </div>
        </div>
      </div>

      <Notice>{summary.error}</Notice>
      {summary.loading && <Loading />}

      {summary.data && (
        <>
          <div className="stats" style={{ marginBottom: "1rem" }}>
            <div className="stat-cell">
              <span className="eyebrow">Income</span>
              <span className="amount fig">{dollars(summary.data.income)}</span>
            </div>
            <div className="stat-cell">
              <span className="eyebrow">To bills</span>
              <span className="amount fig">{dollars(summary.data.setAsideForBills)}</span>
            </div>
            <div className="stat-cell">
              <span className="eyebrow">Bills paid</span>
              <span className="amount fig">{dollars(summary.data.actuallyPaid)}</span>
            </div>
            <div className="stat-cell">
              <span className="eyebrow">
                {summary.data.billsDelta >= 0 ? "Bills surplus" : "Bills shortfall"}
              </span>
              <span
                className={`amount fig ${summary.data.billsDelta >= 0 ? "pos" : "neg"}`}
              >
                {dollars(Math.abs(summary.data.billsDelta))}
              </span>
            </div>
            <div className="stat-cell">
              <span className="eyebrow">To debt</span>
              <span className="amount fig neg">{dollars(summary.data.totalToDebt)}</span>
            </div>
            <div className="stat-cell">
              <span className="eyebrow">Credit dump</span>
              <span className="amount fig neg">{dollars(summary.data.creditDump)}</span>
            </div>
            <div className="stat-cell">
              <span className="eyebrow">Surplus / spend</span>
              <span className="amount fig pos">{dollars(summary.data.surplus)}</span>
            </div>
          </div>
        </>
      )}

      {paychecks.loading && <Loading />}

      {!paychecks.loading && (paychecks.data?.length ?? 0) === 0 && (
        <Panel>
          <Empty title={`No paychecks for ${monthName(month)}`}>
            <p>Record a paycheck on the Paychecks tab and it will show up here.</p>
          </Empty>
        </Panel>
      )}

      <div className="grid" style={{ gap: "1rem" }}>
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
                  <th>Category</th>
                  <th className="num">Amount</th>
                  <th className="num">% of deposit</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ["Bills & expenses", p.totals.bills],
                    ["Debt repayment", p.totals.debt],
                    ["Credit dump", p.totals.creditDump],
                    ["Surplus / spending", p.totals.surplus],
                  ] as [string, number][]
                )
                  .filter(([, amt]) => amt > 0)
                  .map(([label, amt]) => (
                    <tr key={label}>
                      <td>{label}</td>
                      <td className="num">{dollars(amt)}</td>
                      <td className="num muted">
                        {p.amount > 0 ? `${Math.round((amt / p.amount) * 100)}%` : "—"}
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
