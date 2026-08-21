import { Link, useNavigate } from "react-router-dom";
import { api, useApi } from "../../lib/api";
import { dollars, seqFrac, shortMonth, signed } from "../../lib/format";
import {
  AllocBar,
  tagColor,
  Empty,
  Loading,
  Notice,
  Panel,
  EXTRA_INCOME_COLOR,
  SPENDING_COLOR,
} from "../../components/ui";
import { AllocationList } from "../../components/finance-ui";
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
  extraIncome: Allocation[];
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
          <h1>Paycheck log</h1>
        </div>
        <FinanceNav />
      </div>

      <div className="button-row" style={{ justifyContent: "flex-end", marginBottom: "1.25rem" }}>
        <button className="primary" onClick={() => navigate("/finance/new")}>
          Payday
        </button>
      </div>

      <Notice>{error}</Notice>
      {loading && <Loading />}

      {data?.length === 0 && (
        <Panel>
          <Empty title="No paychecks recorded yet">
            <p>
              Start with your most recent one — <Link to="/finance/new">record a payday</Link>{" "}
              and give each piece of it an amount and a note.
            </p>
          </Empty>
        </Panel>
      )}

      <div className="grid" style={{ gap: "1rem" }}>
        {(() => {
          const maxSeqByMonth = new Map<string, number>();
          for (const p of data ?? []) maxSeqByMonth.set(p.month, Math.max(maxSeqByMonth.get(p.month) ?? 0, p.seq));
          return data?.map((p) => {
          const extraTotal = p.extraIncome.reduce((s, e) => s + e.amount, 0);
          return (
            <Panel
              key={p.id}
              title={
                <div>
                  <h2 style={{ marginTop: "0.1rem" }}>
                    <span className="fig">{shortMonth(p.month)}</span>
                    <span className="muted" style={{ fontFamily: "var(--fig)", fontSize: "0.85em", marginLeft: "0.4rem" }}>{seqFrac(p.seq, maxSeqByMonth.get(p.month) ?? p.seq)}</span>
                    <span className="muted" style={{ margin: "0 0.4rem" }}>·</span>
                    <span className="fig">{dollars(p.amount)}</span>
                    {extraTotal > 0.005 && (
                      <span className="fig" style={{ color: EXTRA_INCOME_COLOR, fontSize: "0.85em", marginLeft: "0.4rem" }}>
                        {signed(extraTotal)}
                      </span>
                    )}
                  </h2>
                </div>
              }
              action={
                <div className="button-row" style={{ alignItems: "center" }}>
                  {p.totals.unallocated > 0.005 && (
                    <span className="paycheck-spending">
                      <span className="paycheck-spending-label">surplus</span>
                      <span className="fig" style={{ color: SPENDING_COLOR }}>{dollars(p.totals.unallocated)}</span>
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
              <AllocBar
                segments={p.allocations.map((a) => ({ amount: a.amount, color: tagColor(a.note) }))}
                total={p.amount + extraTotal}
                remainder={p.totals.unallocated}
                height={8}
              />
              <div className="panel-body">
                {p.allocations.length === 0 && p.extraIncome.length === 0 ? (
                  <span className="muted">Nothing recorded yet.</span>
                ) : (
                  <AllocationList
                    allocations={p.allocations}
                    extraIncome={p.extraIncome}
                    unallocated={p.totals.unallocated}
                    signedAmount={signed}
                  />
                )}
              </div>
            </Panel>
          );
        });
        })()}
      </div>
    </>
  );
}
