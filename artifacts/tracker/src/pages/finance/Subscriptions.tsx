import { useRef, useState } from "react";
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
import FinanceNav from "./FinanceNav";

const BUDGET_KEY = "subs-budget";
const DEFAULT_BUDGET = 200;

type SubItem = MonthlyItem & { active: boolean };

export default function Subscriptions() {
  const month = currentMonth();
  const [newName, setNewName] = useState("");
  const [budget, setBudget] = useBudget(BUDGET_KEY, DEFAULT_BUDGET);
  const addInputRef = useRef<HTMLInputElement>(null);

  const { items, loading, error, add, patch, remove } = useMonthlyItems<SubItem>(
    "subscriptions",
    month,
  );

  const active = items.filter((b) => b.active);
  const paused = items.filter((b) => !b.active);
  const activeTotal = active.reduce((s, b) => s + b.amount, 0);
  const pausedTotal = paused.reduce((s, b) => s + b.amount, 0);
  const leftover = budget - activeTotal;

  const addItem = async () => {
    if (!newName.trim()) return;
    await add(newName.trim());
    setNewName("");
    addInputRef.current?.focus();
  };

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
                <th className="col-del" />
              </tr>
            </thead>
            <tbody>
              {active.map(renderRow)}
              {paused.length > 0 && active.length > 0 && (
                <tr className="sub-divider-row">
                  <td colSpan={4}>
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
          value={newName}
          placeholder="Add a subscription — Netflix, Spotify, iCloud…"
          inputRef={addInputRef}
          onChange={setNewName}
          onAdd={() => void addItem()}
        />
      </Panel>
    </>
  );
}
