import { useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../../lib/api";
import { currentMonth, dollars, monthName, shortDate } from "../../lib/format";
import { Empty, Loading, MonthPicker, Notice, Panel } from "../../components/ui";
import FinanceNav from "./FinanceNav";

type Summary = {
  month: string;
  income: number;
  setAsideForBills: number;
  actuallyPaid: number;
  billsDelta: number;
  templateTotal: number;
  towardDebt: number;
  creditDump: number;
  surplus: number;
  totalToDebt: number;
  paychecks: Array<{
    id: number;
    payDate: string;
    amount: number;
    label: string;
    totals: {
      bills: number;
      debt: number;
      creditDump: number;
      surplus: number;
      allocated: number;
      unallocated: number;
    };
  }>;
};

export default function MonthlySummary() {
  const [month, setMonth] = useState(currentMonth());
  const { data, loading, error } = useApi<Summary>(`/api/finance/summary/${month}`, [month]);

  const target = data?.templateTotal ?? 0;
  const perPaycheckEven = target / 2;

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Finance</span>
          <h1>{monthName(month)}</h1>
          <p>Both paychecks, rolled together.</p>
        </div>
        <div className="button-row">
          <FinanceNav />
          <MonthPicker month={month} onChange={setMonth} />
        </div>
      </div>

      <Notice>{error}</Notice>
      {loading && <Loading />}

      {data && data.paychecks.length === 0 && (
        <Panel>
          <Empty title={`Nothing recorded for ${monthName(month)}`}>
            <p>
              <Link to="/finance/new">Record a paycheck</Link> for this month, or step back to an
              earlier one.
            </p>
          </Empty>
        </Panel>
      )}

      {data && data.paychecks.length > 0 && (
        <>
          <div className="stats" style={{ marginBottom: "1.25rem" }}>
            <div className="stat-cell">
              <span className="eyebrow">Income</span>
              <span className="amount fig">{dollars(data.income)}</span>
            </div>
            <div className="stat-cell">
              <span className="eyebrow">Toward debt</span>
              <span className="amount fig">{dollars(data.totalToDebt)}</span>
            </div>
            <div className="stat-cell">
              <span className="eyebrow">Left to spend</span>
              <span className="amount fig">{dollars(data.surplus)}</span>
            </div>
            <div className="stat-cell">
              <span className="eyebrow">{data.billsDelta < 0 ? "Bill shortfall" : "Bill surplus"}</span>
              <span className={`amount fig ${data.billsDelta < 0 ? "neg" : "pos"}`}>
                {dollars(Math.abs(data.billsDelta))}
              </span>
            </div>
          </div>

          <Panel title="Paycheck by paycheck" bodyless>
            <table>
              <thead>
                <tr>
                  <th>Paycheck</th>
                  <th className="num">Deposit</th>
                  <th className="num">Bills</th>
                  <th className="num">Debt</th>
                  <th className="num">Credit dump</th>
                  <th className="num">Spending</th>
                  <th className="num">Unassigned</th>
                </tr>
              </thead>
              <tbody>
                {data.paychecks.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link to={`/finance/paycheck/${p.id}`}>
                        {shortDate(p.payDate)} · {p.label === "first" ? "1st" : "2nd"}
                      </Link>
                    </td>
                    <td className="num">{dollars(p.amount)}</td>
                    <td className="num">{dollars(p.totals.bills)}</td>
                    <td className="num">{dollars(p.totals.debt)}</td>
                    <td className="num">{dollars(p.totals.creditDump)}</td>
                    <td className="num">{dollars(p.totals.surplus)}</td>
                    <td className={`num ${p.totals.unallocated > 0.005 ? "neg" : "faint"}`}>
                      {dollars(p.totals.unallocated)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Month</td>
                  <td className="num">{dollars(data.income)}</td>
                  <td className="num">{dollars(data.setAsideForBills)}</td>
                  <td className="num">{dollars(data.towardDebt)}</td>
                  <td className="num">{dollars(data.creditDump)}</td>
                  <td className="num">{dollars(data.surplus)}</td>
                  <td className="num" />
                </tr>
              </tfoot>
            </table>
          </Panel>

          <div style={{ height: "1.25rem" }} />

          <div className="grid grid-2">
            <Panel title="Bills: saved vs. paid" bodyless>
              <table>
                <tbody>
                  <tr>
                    <td>Set aside from paychecks</td>
                    <td className="num">{dollars(data.setAsideForBills)}</td>
                  </tr>
                  <tr>
                    <td>Actually paid</td>
                    <td className="num">{dollars(data.actuallyPaid)}</td>
                  </tr>
                  <tr>
                    <td>Template says you need</td>
                    <td className="num muted">{dollars(data.templateTotal)}</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr>
                    <td>{data.billsDelta < 0 ? "Shortfall" : "Surplus"}</td>
                    <td className={`num ${data.billsDelta < 0 ? "neg" : "pos"}`}>
                      {dollars(Math.abs(data.billsDelta))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </Panel>

            <Panel title="Split structures">
              <p className="muted" style={{ marginTop: 0, fontSize: "0.875rem" }}>
                Two ways to cover {dollars(target)} of bills across the month:
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Structure</th>
                    <th className="num">1st check</th>
                    <th className="num">2nd check</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Front-loaded</td>
                    <td className="num">{dollars(750)}</td>
                    <td className="num">{dollars(1850)}</td>
                  </tr>
                  <tr>
                    <td>Rounded $2,000 target</td>
                    <td className="num">{dollars(1000)}</td>
                    <td className="num">{dollars(1000)}</td>
                  </tr>
                  <tr>
                    <td>Even split of template</td>
                    <td className="num">{dollars(perPaycheckEven)}</td>
                    <td className="num">{dollars(perPaycheckEven)}</td>
                  </tr>
                </tbody>
              </table>
            </Panel>
          </div>
        </>
      )}
    </>
  );
}
