import { Suspense, lazy, useState } from "react";
import { currentMonth, dollars, monthName } from "../../lib/format";
import { Empty, Loading, MonthPicker, Notice, Panel, tagColor } from "../../components/ui";
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

// Lazy for the same reason as MonthlyCharts — see the note there.
const BillsCharts = lazy(() => import("./BillsCharts"));

const BUDGET_KEY = "bills-budget";
const DEFAULT_BUDGET = 2000;
const COLORS_KEY = "bill-colors";

/** Chart colours are picked per bill name and remembered on this device. */
function useBillColors() {
  const [colors, setColorsState] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem(COLORS_KEY) ?? "{}");
    } catch {
      return {};
    }
  });
  const setColor = (name: string, color: string) => {
    setColorsState((prev) => {
      const next = { ...prev, [name]: color };
      localStorage.setItem(COLORS_KEY, JSON.stringify(next));
      return next;
    });
  };
  return [colors, setColor] as const;
}

export default function Bills() {
  const [month, setMonth] = useState(currentMonth());
  const [budget, setBudget] = useBudget(BUDGET_KEY, DEFAULT_BUDGET);
  const [colors, setColor] = useBillColors();

  const { items, loading, error, add, patch, remove } = useMonthlyItems<MonthlyItem>(
    "bills",
    month,
  );

  const total = items.reduce((s, b) => s + b.amount, 0);
  const leftover = budget - total;

  return (
    <>
      <div className="page-head">
        <div>
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
                <th className="col-swatch" />
                <th>Bill</th>
                <th className="num col-amount">Amount</th>
                <th className="col-del" />
              </tr>
            </thead>
            <tbody>
              {items.map((b) => (
                <tr key={b.id}>
                  <td>
                    <label className="bill-color-label" title="Click to change color">
                      <span
                        className="bill-color-swatch"
                        style={{ background: colors[b.name] ?? tagColor(b.name) }}
                      />
                      <input
                        type="color"
                        className="bill-color-input"
                        value={colors[b.name] ?? tagColor(b.name)}
                        onChange={(e) => setColor(b.name, e.target.value)}
                      />
                    </label>
                  </td>
                  <NameCell
                    item={b}
                    label="Bill name"
                    onRename={(name) => void patch(b.id, { name })}
                  />
                  <AmountCell item={b} onChange={(amount) => void patch(b.id, { amount })} />
                  <RemoveCell
                    name={b.name}
                    onRemove={() =>
                      void remove(b, `Remove "${b.name}" from ${monthName(month)}?`)
                    }
                  />
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {items.length > 0 && (
          <div className="bills-stat-strip">
            <Stat label="Total">
              <span className="fig">{dollars(total)}</span>
            </Stat>
            <BudgetStat budget={budget} onChange={setBudget} />
            <LeftoverStat leftover={leftover} />
          </div>
        )}

        <AddItemRow
          label="Add a bill"
          placeholder="Rent, Power, Netflix…"
          onAdd={(name) => add(name)}
        />
      </Panel>

      <Suspense fallback={<Loading />}>
        <BillsCharts budget={budget} colors={colors} />
      </Suspense>
    </>
  );
}
