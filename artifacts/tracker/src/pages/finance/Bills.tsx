import { useRef, useState } from "react";
import { api, useApi } from "../../lib/api";
import { currentMonth, dollars, monthName, toAmount } from "../../lib/format";
import { Empty, Loading, MonthPicker, Notice, Panel } from "../../components/ui";
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
  const addInputRef = useRef<HTMLInputElement>(null);

  const bills = useApi<Bill[]>("/api/finance/bills");
  const payments = useApi<Payment[]>(`/api/finance/bill-payments?month=${month}`, [month]);

  const active = (bills.data ?? []).filter((b) => b.active);
  const paidFor = (billId: number) =>
    payments.data?.find((p) => p.billId === billId)?.amountPaid ?? 0;
  const paidTotal = active.reduce((s, b) => s + paidFor(b.id), 0);

  const guard = (fn: () => Promise<unknown>) => async () => {
    setError(null);
    try { await fn(); }
    catch (err) { setError(err instanceof Error ? err.message : "That change didn't stick."); }
  };

  const addBill = guard(async () => {
    if (!newName.trim()) return;
    await api.post("/api/finance/bills", {
      name: newName.trim(),
      expectedAmount: 0,
      sortOrder: (bills.data?.length ?? 0) + 1,
    });
    setNewName("");
    addInputRef.current?.focus();
    await bills.reload();
  });

  const renameBill = (id: number, name: string) =>
    guard(async () => {
      await api.patch(`/api/finance/bills/${id}`, { name });
      await bills.reload();
    })();

  const removeBill = (b: Bill) =>
    guard(async () => {
      if (!confirm(`Remove "${b.name}" from every month?`)) return;
      await api.del(`/api/finance/bills/${b.id}`);
      await Promise.all([bills.reload(), payments.reload()]);
    })();

  const recordPayment = (billId: number, amountPaid: number) =>
    guard(async () => {
      await api.put("/api/finance/bill-payments", { billId, month, amountPaid });
      await payments.reload();
    })();

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Finance</span>
          <h1>Bills</h1>
        </div>
        <div className="button-row">
          <FinanceNav />
          <MonthPicker month={month} onChange={setMonth} />
        </div>
      </div>

      <Notice>{error}</Notice>
      {bills.loading && <Loading />}

      <Panel title={monthName(month)} bodyless>
        {active.length === 0 ? (
          <div className="panel-body">
            <Empty title="No bills yet">
              <p>Add your first bill below — it'll show up every month.</p>
            </Empty>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Bill</th>
                <th className="num" style={{ width: 160 }}>Amount</th>
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {active.map((b) => {
                const paid = paidFor(b.id);
                return (
                  <tr key={b.id}>
                    <td>
                      <input
                        aria-label="Bill name"
                        defaultValue={b.name}
                        onBlur={(e) => {
                          const name = e.target.value.trim();
                          if (name && name !== b.name) void renameBill(b.id, name);
                        }}
                      />
                    </td>
                    <td className="num">
                      <input
                        aria-label={`Amount for ${b.name}`}
                        inputMode="decimal"
                        defaultValue={paid === 0 ? "" : String(paid)}
                        placeholder="0.00"
                        onBlur={(e) => {
                          const v = toAmount(e.target.value);
                          if (v !== paid) void recordPayment(b.id, v);
                        }}
                      />
                    </td>
                    <td>
                      <button
                        className="quiet danger btn-icon"
                        onClick={() => removeBill(b)}
                        aria-label={`Remove ${b.name}`}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                          strokeLinejoin="round" aria-hidden="true">
                          <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
                        </svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td className="num">{dollars(paidTotal)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        )}

        {/* Inline add row */}
        <div className="panel-body bills-add-row" style={{ borderTop: "1px solid var(--rule)" }}>
          <input
            ref={addInputRef}
            value={newName}
            placeholder="Add a bill — Rent, Power, Netflix…"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addBill()}
            style={{ flex: 1 }}
          />
          <button
            className="primary"
            onClick={addBill}
            disabled={!newName.trim()}
          >
            Add
          </button>
        </div>
      </Panel>
    </>
  );
}
