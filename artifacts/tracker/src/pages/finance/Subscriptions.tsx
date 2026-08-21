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
import FinanceNav from "./FinanceNav";

const BUDGET_KEY = "subs-budget";
const DEFAULT_BUDGET = 200;

type SubItem = MonthlyItem & { active: boolean; dueDay: number | null };

// ── Helpers ───────────────────────────────────────────────────────────────────

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

const MONTH_NAMES = [
  "Jan","Feb","Mar","Apr","May","Jun",
  "Jul","Aug","Sep","Oct","Nov","Dec",
];

// ── Due-day cell ──────────────────────────────────────────────────────────────

function DueDayCell({
  item,
  charged,
  onChange,
}: {
  item: SubItem;
  charged: boolean;
  onChange: (day: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");

  function startEdit() {
    setVal(item.dueDay != null ? String(item.dueDay) : "");
    setEditing(true);
  }

  function commit() {
    setEditing(false);
    const parsed = parseInt(val, 10);
    if (val.trim() === "" || isNaN(parsed)) onChange(null);
    else onChange(Math.min(31, Math.max(1, parsed)));
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
      <button
        className={`due-day-btn${charged ? " due-day-charged" : ""}`}
        onClick={startEdit}
        title="Set due day"
      >
        {item.dueDay != null
          ? ordinal(item.dueDay)
          : <span className="due-day-empty">—</span>}
      </button>
    </td>
  );
}

// ── Today marker row ──────────────────────────────────────────────────────────

function TodayMarkerRow({ day, month }: { day: number; month: string }) {
  const [yr, mo] = month.split("-").map(Number);
  const label = `${MONTH_NAMES[(mo ?? 1) - 1]} ${day}`;
  return (
    <tr className="sub-today-marker">
      <td colSpan={5}>
        <span className="sub-today-label">Today · {label}</span>
      </td>
    </tr>
  );
}

// ── Sorting ───────────────────────────────────────────────────────────────────

function sortByDueDay(items: SubItem[]): SubItem[] {
  return [...items].sort((a, b) => {
    if (a.dueDay == null && b.dueDay == null) return 0;
    if (a.dueDay == null) return 1;
    if (b.dueDay == null) return -1;
    return a.dueDay - b.dueDay;
  });
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Subscriptions() {
  const month = currentMonth();
  const todayDay = new Date().getDate();
  const [budget, setBudget] = useBudget(BUDGET_KEY, DEFAULT_BUDGET);

  const { items, loading, error, add, patch, remove } = useMonthlyItems<SubItem>(
    "subscriptions",
    month,
  );

  const active = items.filter((b) => b.active);
  const paused  = items.filter((b) => !b.active);
  const activeTotal = active.reduce((s, b) => s + b.amount, 0);
  const pausedTotal = paused.reduce((s, b) => s + b.amount, 0);
  const leftover = budget - activeTotal;

  // Sort active items ascending by dueDay (nulls at end)
  const sortedActive = sortByDueDay(active);
  const past     = sortedActive.filter((b) => b.dueDay != null && b.dueDay <  todayDay);
  const todayItems = sortedActive.filter((b) => b.dueDay != null && b.dueDay === todayDay);
  const upcoming = sortedActive.filter((b) => b.dueDay != null && b.dueDay >  todayDay);
  const noDue    = sortedActive.filter((b) => b.dueDay == null);

  // Show the today marker only when there are items on both sides (or at least items with due days)
  const hasDueDays = sortedActive.some((b) => b.dueDay != null);
  const showMarker = hasDueDays;

  const renderRow = (b: SubItem, charged = false) => (
    <tr
      key={b.id}
      className={[
        b.active ? undefined : "sub-row-paused",
        charged ? "sub-row-charged" : undefined,
      ].filter(Boolean).join(" ")}
    >
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
      <DueDayCell
        item={b}
        charged={charged}
        onChange={(dueDay) => void patch(b.id, { dueDay } as Partial<SubItem>)}
      />
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
              {/* Past (already charged this month) */}
              {past.map((b) => renderRow(b, true))}

              {/* Today marker */}
              {showMarker && <TodayMarkerRow day={todayDay} month={month} />}

              {/* Due today */}
              {todayItems.map((b) => renderRow(b, false))}

              {/* Upcoming */}
              {upcoming.map((b) => renderRow(b, false))}

              {/* No due day set */}
              {noDue.length > 0 && hasDueDays && (
                <tr className="sub-divider-row sub-no-due-divider">
                  <td colSpan={5}>
                    <span className="eyebrow">No due date</span>
                  </td>
                </tr>
              )}
              {noDue.map((b) => renderRow(b, false))}

              {/* Paused */}
              {paused.length > 0 && active.length > 0 && (
                <tr className="sub-divider-row">
                  <td colSpan={5}>
                    <span className="eyebrow">Paused</span>
                  </td>
                </tr>
              )}
              {sortByDueDay(paused).map((b) => renderRow(b, false))}
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
