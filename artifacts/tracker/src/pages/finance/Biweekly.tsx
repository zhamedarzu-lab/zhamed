import { Link, useNavigate } from "react-router-dom";
import { api, useApi } from "../../lib/api";
import { dollars, shortMonth } from "../../lib/format";
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
                <h2 style={{ marginTop: "0.1rem" }}>
                  <span className="fig">{shortMonth(p.month)}</span>
                  <span className="muted" style={{ fontFamily: "var(--fig)", fontSize: "0.85em", marginLeft: "0.4rem" }}>{p.seq}/2</span>
                  <span className="muted" style={{ margin: "0 0.4rem" }}>·</span>
                  <span className="fig">{dollars(p.amount)}</span>
                </h2>
              </div>
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
                <button className="quiet danger" onClick={() => remove(p.id)}>
                  Delete
                </button>
              </div>
            }
            bodyless
          >
            <div className="panel-body">
              {p.allocations.length === 0 ? (
                <span className="muted">Nothing recorded yet.</span>
              ) : (
                <ul className="alloc-list">
                  {p.allocations.map((a) => (
                    <li key={a.id}>
                      {a.note || <span className="muted">Untitled</span>}
                      <span className="fig alloc-amt">{dollars(a.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Panel>
        ))}
      </div>
    </>
  );
}
