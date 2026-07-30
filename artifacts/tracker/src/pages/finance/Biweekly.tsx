import { Link, useNavigate } from "react-router-dom";
import { api, useApi } from "../../lib/api";
import { dollars, monthName, ordinal } from "../../lib/format";
import { Empty, Loading, Notice, Panel } from "../../components/ui";
import FinanceNav from "./FinanceNav";

type Allocation = {
  id: number;
  amount: number;
  note: string;
};

type Paycheck = {
  id: number;
  month: string;
  seq: number;
  amount: number;
  allocations: Allocation[];
  totals: {
    allocated: number;
    unallocated: number;
  };
};

export default function Biweekly() {
  const navigate = useNavigate();
  const { data, loading, error, reload } = useApi<Paycheck[]>("/api/finance/paychecks");
  async function remove(id: number) {
    if (!confirm("Delete this paycheck and everything allocated from it?")) return;
    await api.del(`/api/finance/paychecks/${id}`);
    void reload();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Finance</span>
          <h1>Paycheck log</h1>
          <p>Every paycheck, and where each dollar of it went.</p>
        </div>
        <div className="button-row">
          <FinanceNav />
          <button className="primary" onClick={() => navigate("/finance/new")}>
            Record a paycheck
          </button>
        </div>
      </div>

      <Notice>{error}</Notice>
      {loading && <Loading />}

      {data?.length === 0 && (
        <Panel>
          <Empty title="No paychecks recorded yet">
            <p>
              Start with your most recent one — <Link to="/finance/new">record a paycheck</Link>{" "}
              and give each piece of it an amount and a note.
            </p>
          </Empty>
        </Panel>
      )}

      <div className="grid" style={{ gap: "1rem" }}>
        {data?.map((p) => (
          <Panel
            key={p.id}
            title={
              <div>
                <span className="eyebrow">{ordinal(p.seq)} paycheck</span>
                <h2 style={{ marginTop: "0.1rem" }}>
                  {monthName(p.month)} · <span className="fig">{dollars(p.amount)}</span>
                </h2>
              </div>
            }
            action={
              <div className="button-row">
                <button className="quiet" onClick={() => navigate(`/finance/paycheck/${p.id}`)}>
                  Edit
                </button>
                <button className="quiet danger" onClick={() => remove(p.id)}>
                  Delete
                </button>
              </div>
            }
            bodyless
          >
            <div className="tape-bar" aria-hidden="true">
              <div
                className="tape-seg"
                style={{
                  width: `${p.amount ? Math.min(100, (p.totals.allocated / p.amount) * 100) : 0}%`,
                }}
              />
            </div>

            <table>
              <thead>
                <tr>
                  <th>Note</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {p.allocations.length === 0 && (
                  <tr>
                    <td colSpan={2} className="muted">
                      Nothing allocated from this paycheck yet.
                    </td>
                  </tr>
                )}
                {p.allocations.map((a) => (
                  <tr key={a.id}>
                    <td>{a.note || <span className="muted">Untitled</span>}</td>
                    <td className="num">{dollars(a.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>
                    Allocated
                    {p.totals.unallocated > 0.005 && (
                      <span className="neg"> · {dollars(p.totals.unallocated)} left unassigned</span>
                    )}
                  </td>
                  <td className="num">{dollars(p.totals.allocated)}</td>
                </tr>
              </tfoot>
            </table>
          </Panel>
        ))}
      </div>
    </>
  );
}
