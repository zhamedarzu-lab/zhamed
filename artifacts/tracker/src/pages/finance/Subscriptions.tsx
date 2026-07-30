import { useRef, useState } from "react";
import { api, useApi } from "../../lib/api";
import { currentMonth, dollars, toAmount } from "../../lib/format";
import { Empty, Loading, Notice, Panel } from "../../components/ui";
import FinanceNav from "./FinanceNav";

const BUDGET_KEY     = "subs-budget";
const DEFAULT_BUDGET = 200;

function useBudget() {
  const stored = parseFloat(localStorage.getItem(BUDGET_KEY) ?? "");
  const [budget, setBudgetState] = useState(isNaN(stored) ? DEFAULT_BUDGET : stored);
  const setBudget = (v: number) => {
    localStorage.setItem(BUDGET_KEY, String(v));
    setBudgetState(v);
  };
  return [budget, setBudget] as const;
}

type SubItem = { id: number; month: string; name: string; amount: number; sortOrder: number; active: boolean };

export default function Subscriptions() {
  const month                             = currentMonth();
  const [error, setError]                 = useState<string | null>(null);
  const [newName, setNewName]             = useState("");
  const [budget, setBudget]               = useBudget();
  const [editingBudget, setEditingBudget] = useState(false);
  const addInputRef                       = useRef<HTMLInputElement>(null);

  const { data, loading, reload } = useApi<SubItem[]>(
    `/api/finance/subscriptions?month=${month}`,
    [month],
  );

  const items      = data ?? [];
  const active     = items.filter((b) => b.active);
  const paused     = items.filter((b) => !b.active);
  const activeTotal = active.reduce((s, b) => s + b.amount, 0);
  const pausedTotal = paused.reduce((s, b) => s + b.amount, 0);
  const leftover    = budget - activeTotal;

  const guard = (fn: () => Promise<unknown>) => async () => {
    setError(null);
    try { await fn(); }
    catch (err) { setError(err instanceof Error ? err.message : "That change didn't stick."); }
  };

  const addItem = guard(async () => {
    if (!newName.trim()) return;
    await api.post("/api/finance/subscriptions", { month, name: newName.trim(), sortOrder: items.length });
    setNewName("");
    addInputRef.current?.focus();
    await reload();
  });

  const renameItem = (id: number, name: string) =>
    guard(async () => { await api.patch(`/api/finance/subscriptions/${id}`, { name }); await reload(); })();

  const updateAmount = (id: number, amount: number) =>
    guard(async () => { await api.patch(`/api/finance/subscriptions/${id}`, { amount }); await reload(); })();

  const toggleActive = (id: number, next: boolean) =>
    guard(async () => { await api.patch(`/api/finance/subscriptions/${id}`, { active: next }); await reload(); })();

  const removeItem = (item: SubItem) =>
    guard(async () => {
      if (!confirm(`Remove "${item.name}"?`)) return;
      await api.del(`/api/finance/subscriptions/${item.id}`);
      await reload();
    })();

  const renderRow = (b: SubItem) => (
    <tr key={b.id} className={b.active ? undefined : "sub-row-paused"}>
      <td>
        <button
          className={`sub-toggle ${b.active ? "sub-toggle-on" : "sub-toggle-off"}`}
          onClick={() => toggleActive(b.id, !b.active)}
          title={b.active ? "Pause this subscription" : "Reactivate"}
          aria-label={b.active ? "Active" : "Paused"}
        />
      </td>
      <td>
        <input
          aria-label="Subscription name"
          defaultValue={b.name}
          key={b.id + b.name}
          className={b.active ? undefined : "sub-name-paused"}
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
  );

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Finance</span>
          <h1>Subscriptions</h1>
        </div>
        <div className="button-row">
          <FinanceNav />
        </div>
      </div>

      <Notice>{error}</Notice>
      {loading && <Loading />}

      <Panel bodyless>
        {!loading && items.length === 0 ? (
          <div className="panel-body">
            <Empty title="No subscriptions yet">
              <p>Add one below — it'll carry over to next month automatically.</p>
            </Empty>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th className="col-swatch" />
                <th>Subscription</th>
                <th className="num col-amount">Amount</th>
                <th className="col-del" />
              </tr>
            </thead>
            <tbody>
              {active.map(renderRow)}
              {paused.length > 0 && active.length > 0 && (
                <tr className="sub-divider-row">
                  <td colSpan={5}>
                    <span className="eyebrow">Paused</span>
                  </td>
                </tr>
              )}
              {paused.map(renderRow)}
            </tbody>
          </table>
        )}

        {items.length > 0 && (
          <div className="bills-stat-strip">
            <div className="bills-stat">
              <span className="eyebrow">Active</span>
              <span className="fig">{dollars(activeTotal)}</span>
            </div>
            <div className="bills-stat">
              <span className="eyebrow">Paused</span>
              <span className="fig" style={{ color: "var(--ink-soft)" }}>{dollars(pausedTotal)}</span>
            </div>
            <div className="bills-stat">
              <span className="eyebrow">Budget</span>
              {editingBudget ? (
                <input
                  className="bills-budget-input fig"
                  autoFocus
                  inputMode="decimal"
                  defaultValue={String(budget)}
                  onBlur={(e) => {
                    const v = toAmount(e.target.value);
                    if (v > 0) setBudget(v);
                    setEditingBudget(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    if (e.key === "Escape") setEditingBudget(false);
                  }}
                />
              ) : (
                <button className="quiet bills-budget-btn fig" onClick={() => setEditingBudget(true)} title="Click to edit">
                  {dollars(budget)}
                </button>
              )}
            </div>
            <div className="bills-stat">
              <span className="eyebrow">{leftover < 0 ? "Over" : "Left"}</span>
              <span className="fig" style={{ color: leftover < 0 ? "var(--stamp)" : "#5fc97a" }}>
                {dollars(Math.abs(leftover))}
              </span>
            </div>
          </div>
        )}

        <div className="panel-body bills-add-row" style={{ borderTop: "1px solid var(--rule)" }}>
          <input
            ref={addInputRef}
            value={newName}
            placeholder="Add a subscription — Netflix, Spotify, iCloud…"
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
