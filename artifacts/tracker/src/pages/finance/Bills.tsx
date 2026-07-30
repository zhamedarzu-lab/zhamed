import { useState } from "react";
import { api, useApi } from "../../lib/api";
import { currentMonth, dollars, monthName, toAmount } from "../../lib/format";
import { Empty, Field, Loading, MonthPicker, Notice, Panel } from "../../components/ui";
import FinanceNav from "./FinanceNav";

type Bill = {
  id: number;
  name: string;
  expectedAmount: number;
  active: boolean;
  sortOrder: number;
};

type Payment = { id: number; billId: number; month: string; amountPaid: number };

export default function Bills() {
  const [month, setMonth] = useState(currentMonth());
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newAmount, setNewAmount] = useState("");

  const bills = useApi<Bill[]>("/api/finance/bills");
  const payments = useApi<Payment[]>(`/api/finance/bill-payments?month=${month}`, [month]);

  const paidFor = (billId: number) =>
    payments.data?.find((p) => p.billId === billId)?.amountPaid ?? 0;

  const guard = (fn: () => Promise<unknown>) => async () => {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That change didn't stick.");
    }
  };

  const addBill = guard(async () => {
    if (!newName.trim()) return;
    await api.post("/api/finance/bills", {
      name: newName.trim(),
      expectedAmount: toAmount(newAmount),
      sortOrder: (bills.data?.length ?? 0) + 1,
    });
    setNewName("");
    setNewAmount("");
    await bills.reload();
  });

  const patchBill = (id: number, patch: Partial<Bill>) =>
    guard(async () => {
      await api.patch(`/api/finance/bills/${id}`, patch);
      await bills.reload();
    })();

  const removeBill = (b: Bill) =>
    guard(async () => {
      if (!confirm(`Remove "${b.name}" and its payment history?`)) return;
      await api.del(`/api/finance/bills/${b.id}`);
      await Promise.all([bills.reload(), payments.reload()]);
    })();

  const recordPayment = (billId: number, amountPaid: number) =>
    guard(async () => {
      await api.put("/api/finance/bill-payments", { billId, month, amountPaid });
      await payments.reload();
    })();

  const [templateOpen, setTemplateOpen] = useState(false);

  const active = (bills.data ?? []).filter((b) => b.active);
  const templateTotal = active.reduce((s, b) => s + b.expectedAmount, 0);
  const paidTotal = active.reduce((s, b) => s + paidFor(b.id), 0);
  // Allocations no longer say which bill they were for, so the comparison
  // that matters here is what the template expects against what was paid.
  const remaining = templateTotal - paidTotal;

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Finance</span>
          <h1>Bills</h1>
          <p>The template is what you expect. The log is what actually left the account.</p>
        </div>
        <FinanceNav />
      </div>

      <Notice>{error}</Notice>
      {bills.loading && <Loading />}

      <div className="stats" style={{ marginBottom: "1.25rem" }}>
        <div className="stat-cell">
          <span className="eyebrow">Template total</span>
          <span className="amount fig">{dollars(templateTotal)}</span>
        </div>
        <div className="stat-cell">
          <span className="eyebrow">Actually paid</span>
          <span className="amount fig">{dollars(paidTotal)}</span>
        </div>
        <div className="stat-cell">
          <span className="eyebrow">{remaining < 0 ? "Over template" : "Left to pay"}</span>
          <span className={`amount fig ${remaining < 0 ? "neg" : ""}`}>
            {dollars(Math.abs(remaining))}
          </span>
        </div>
      </div>

      <Panel
        title={`Bill log — ${monthName(month)}`}
        action={<MonthPicker month={month} onChange={setMonth} />}
        bodyless
      >
        {active.length === 0 ? (
          <Empty title="Your bill template is empty">
            <p>Add your recurring bills below and they'll show up here every month.</p>
          </Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Bill</th>
                <th className="num" style={{ width: 160 }}>Paid this month</th>
              </tr>
            </thead>
            <tbody>
              {active.map((b) => {
                const paid = paidFor(b.id);
                return (
                  <tr key={b.id}>
                    <td>{b.name}</td>
                    <td className="num">
                      <input
                        aria-label={`Amount paid for ${b.name}`}
                        inputMode="decimal"
                        defaultValue={paid === 0 ? "" : String(paid)}
                        placeholder="0.00"
                        onBlur={(e) => {
                          const v = toAmount(e.target.value);
                          if (v !== paid) void recordPayment(b.id, v);
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>Total paid</td>
                <td className="num">{dollars(paidTotal)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </Panel>

      <div style={{ height: "1.25rem" }} />

      <Panel
        title="Bill template"
        bodyless
        action={
          <button
            className="quiet"
            onClick={() => setTemplateOpen((o) => !o)}
            aria-expanded={templateOpen}
            aria-label={templateOpen ? "Collapse bill template" : "Expand bill template"}
          >
            {templateOpen ? "▲ Collapse" : "▼ Expand"}
          </button>
        }
      >
        {templateOpen && (
          <>
            <table>
              <thead>
                <tr>
                  <th>Bill</th>
                  <th className="num" style={{ width: 160 }}>
                    Expected monthly
                  </th>
                  <th style={{ width: 110 }} />
                </tr>
              </thead>
              <tbody>
                {(bills.data ?? []).map((b) => (
                  <tr key={b.id} style={b.active ? undefined : { opacity: 0.5 }}>
                    <td>
                      <input
                        aria-label="Bill name"
                        defaultValue={b.name}
                        onBlur={(e) => {
                          const name = e.target.value.trim();
                          if (name && name !== b.name) void patchBill(b.id, { name });
                        }}
                      />
                    </td>
                    <td className="num">
                      <input
                        aria-label={`Expected amount for ${b.name}`}
                        inputMode="decimal"
                        defaultValue={String(b.expectedAmount)}
                        onBlur={(e) => {
                          const v = toAmount(e.target.value);
                          if (v !== b.expectedAmount) void patchBill(b.id, { expectedAmount: v });
                        }}
                      />
                    </td>
                    <td>
                      <div className="button-row">
                        <button className="quiet" onClick={() => patchBill(b.id, { active: !b.active })}>
                          {b.active ? "Pause" : "Resume"}
                        </button>
                        <button className="quiet danger" onClick={() => removeBill(b)}>
                          ×
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="panel-body" style={{ borderTop: "1px solid var(--rule)" }}>
              <div className="grid" style={{ gridTemplateColumns: "1fr 160px auto", gap: "0.5rem", alignItems: "end" }}>
                <Field label="Add a bill">
                  <input
                    value={newName}
                    placeholder="Internet, gym, tolls…"
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addBill()}
                  />
                </Field>
                <Field label="Expected">
                  <input
                    inputMode="decimal"
                    value={newAmount}
                    placeholder="0.00"
                    onChange={(e) => setNewAmount(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addBill()}
                  />
                </Field>
                <button className="primary" onClick={addBill} disabled={!newName.trim()}>
                  Add bill
                </button>
              </div>
            </div>
          </>
        )}
      </Panel>
    </>
  );
}
