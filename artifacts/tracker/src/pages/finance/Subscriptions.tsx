import { useState } from "react";
import { currentMonth, dollars } from "../../lib/format";
import { Empty, Loading, Notice, Panel } from "../../components/ui";
import {
  AddItemRow,
  AmountCell,
  BudgetStat,
  LeftoverStat,
  NameCell,
  RemoveCell,
  Stat,
  useBudget,
  useMonthlyItems,
  type MonthlyItem,
} from "../../components/finance-ui";
import { api } from "../../lib/api";
import FinanceNav from "./FinanceNav";

const BUDGET_KEY = "subs-budget";
const DEFAULT_BUDGET = 200;

type SubItem = MonthlyItem & { active: boolean; dueDay: number | null };

// ── Due-day cell ──────────────────────────────────────────────────────────────

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

function DueDayCell({ item, onChange }: { item: SubItem; onChange: (day: number | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");

  function startEdit() {
    setVal(item.dueDay != null ? String(item.dueDay) : "");
    setEditing(true);
  }

  function commit() {
    setEditing(false);
    const parsed = parseInt(val, 10);
    if (val.trim() === "" || isNaN(parsed)) {
      onChange(null);
    } else {
      const clamped = Math.min(31, Math.max(1, parsed));
      onChange(clamped);
    }
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") setEditing(false);
  }

  if (editing) {
    return (
      <td className="num col-due">
        <input
          className="due-day-input"
          type="number"
          min={1}
          max={31}
          value={val}
          autoFocus
          onChange={(e) => setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={onKey}
        />
      </td>
    );
  }

  return (
    <td className="num col-due">
      <button className="due-day-btn" onClick={startEdit} title="Set due day">
        {item.dueDay != null ? ordinal(item.dueDay) : <span className="due-day-empty">—</span>}
      </button>
    </td>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Subscriptions() {
  const month = currentMonth();
  const [budget, setBudget] = useBudget(BUDGET_KEY, DEFAULT_BUDGET);

  const { items, loading, error, add, patch, remove } = useMonthlyItems<SubItem>(
    "subscriptions",
    month,
  );

  const active = items.filter((b) => b.active);
  const paused = items.filter((b) => !b.active);
  const activeTotal = active.reduce((s, b) => s + b.amount, 0);
  const pausedTotal = paused.reduce((s, b) => s + b.amount, 0);
  const leftover = budget - activeTotal;

  const renderRow = (b: SubItem) => (
    <tr key={b.id} className={b.active ? undefined : "sub-row-paused"}>
      <td>
        <button
          className={`sub-toggle ${b.active ? "sub-toggle-on" : "sub-toggle-off"}`}
          onClick={() => void patch(b.id, { active: !b.active })}
          title={b.active ? "Pause this subscription" : "Reactivate"}
          aria-label={b.active ? "Active" : "Paused"}
        />
      </td>
      <NameCell
        item={b}
        label="Subscription name"
        className={b.active ? undefined : "sub-name-paused"}
        onRename={(name) => void patch(b.id, { name })}
      />
      <AmountCell item={b} onChange={(amount) => void patch(b.id, { amount })} />
      <DueDayCell item={b} onChange={(dueDay) => void api.patch(`/api/finance/subscriptions/${b.id}`, { dueDay }).then(() => patch(b.id, { dueDay } as Partial<SubItem>))} />
      <RemoveCell name={b.name} onRemove={() => void remove(b, `Remove "${b.name}"?`)} />
    </tr>
  );

  return (
    <>
      <div className="page-head">
        <div>
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
                <th className="num col-due">Due</th>
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
            <Stat label="Active">
              <span className="fig">{dollars(activeTotal)}</span>
            </Stat>
            <Stat label="Paused">
              <span className="fig" style={{ color: "var(--ink-soft)" }}>
                {dollars(pausedTotal)}
              </span>
            </Stat>
            <BudgetStat budget={budget} onChange={setBudget} />
            <LeftoverStat leftover={leftover} label={leftover < 0 ? "Over" : "Left"} />
          </div>
        )}

        <AddItemRow
          label="Add a subscription"
          placeholder="Netflix, Spotify, iCloud…"
          onAdd={(name) => add(name)}
        />
      </Panel>
    </>
  );
}
