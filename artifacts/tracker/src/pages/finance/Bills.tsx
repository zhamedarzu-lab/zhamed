import { useRef, useState } from "react";
import { api, useApi } from "../../lib/api";
import { currentMonth, dollars, monthName, toAmount } from "../../lib/format";
import { Empty, Loading, MonthPicker, Notice, Panel } from "../../components/ui";
import FinanceNav from "./FinanceNav";

type BillItem = { id: number; month: string; name: string; amount: number; sortOrder: number };

export default function Bills() {
  const [month, setMonth] = useState(currentMonth());
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const addInputRef = useRef<HTMLInputElement>(null);

  const { data, loading, reload } = useApi<BillItem[]>(
    `/api/finance/bills?month=${month}`,
    [month],
  );

  const items = data ?? [];
  const total = items.reduce((s, b) => s + b.amount, 0);

  const guard = (fn: () => Promise<unknown>) => async () => {
    setError(null);
    try { await fn(); }
    catch (err) { setError(err instanceof Error ? err.message : "That change didn't stick."); }
  };

  const addItem = guard(async () => {
    if (!newName.trim()) return;
    await api.post("/api/finance/bills", {
      month,
      name: newName.trim(),
      sortOrder: items.length,
    });
    setNewName("");
    addInputRef.current?.focus();
    await reload();
  });

  const renameItem = (id: number, name: string) =>
    guard(async () => {
      await api.patch(`/api/finance/bills/${id}`, { name });
      await reload();
    })();

  const updateAmount = (id: number, amount: number) =>
    guard(async () => {
      await api.patch(`/api/finance/bills/${id}`, { amount });
      await reload();
    })();

  const removeItem = (item: BillItem) =>
    guard(async () => {
      if (!confirm(`Remove "${item.name}" from ${monthName(month)}?`)) return;
      await api.del(`/api/finance/bills/${item.id}`);
      await reload();
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
      {loading && <Loading />}

      <Panel title={monthName(month)} bodyless>
        {!loading && items.length === 0 ? (
          <div className="panel-body">
            <Empty title="No bills for this month">
              <p>Add a bill below — next month it'll carry over automatically.</p>
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
              {items.map((b) => (
                <tr key={b.id}>
                  <td>
                    <input
                      aria-label="Bill name"
                      defaultValue={b.name}
                      key={b.id + b.name}
                      onBlur={(e) => {
                        const name = e.target.value.trim();
                        if (name && name !== b.name) void renameItem(b.id, name);
                      }}
                    />
                  </td>
                  <td className="num">
                    <input
                      aria-label={`Amount for ${b.name}`}
                      inputMode="decimal"
                      key={b.id + b.amount}
                      defaultValue={b.amount === 0 ? "" : String(b.amount)}
                      placeholder="0.00"
                      onBlur={(e) => {
                        const v = toAmount(e.target.value);
                        if (v !== b.amount) void updateAmount(b.id, v);
                      }}
                    />
                  </td>
                  <td>
                    <button
                      className="quiet danger btn-icon"
                      onClick={() => removeItem(b)}
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
              ))}
            </tbody>
            {items.length > 0 && (
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td className="num">{dollars(total)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        )}

        <div className="panel-body bills-add-row" style={{ borderTop: "1px solid var(--rule)" }}>
          <input
            ref={addInputRef}
            value={newName}
            placeholder="Add a bill — Rent, Power, Netflix…"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addItem()}
            style={{ flex: 1 }}
          />
          <button className="primary" onClick={addItem} disabled={!newName.trim()}>
            Add
          </button>
        </div>
      </Panel>
    </>
  );
}
