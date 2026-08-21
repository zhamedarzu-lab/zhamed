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

type BillingCycle = "monthly" | "annual";
type SubItem = MonthlyItem & { active: boolean; dueDay: number | null; billingCycle: BillingCycle };

// ── Helpers ───────────────────────────────────────────────────────────────────

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

const monthlyEq = (b: SubItem) =>
  b.billingCycle === "annual" ? b.amount / 12 : b.amount;

// ── Amount + billing-cycle cell ───────────────────────────────────────────────

function SubAmountCell({
  item,
  onAmountChange,
  onCycleChange,
}: {
  item: SubItem;
  onAmountChange: (v: number) => void;
  onCycleChange: (c: BillingCycle) => void;
}) {
  const annual = item.billingCycle === "annual";
  return (
    <td className="num sub-amount-cell">
      <div className="sub-amount-wrap">
        <button
          className={`cycle-pill ${annual ? "cycle-pill--yr" : "cycle-pill--mo"}`}
          title={annual ? "Annual billing — click for monthly" : "Monthly billing — click for annual"}
          onClick={() => onCycleChange(annual ? "monthly" : "annual")}
        >
          {annual ? "yr" : "mo"}
        </button>
        <input
          aria-label={`Amount for ${item.name}`}
          inputMode="decimal"
          key={item.id + item.amount}
          defaultValue={item.amount === 0 ? "" : String(item.amount)}
          placeholder="0.00"
          onBlur={(e) => {
            const raw = parseFloat(e.target.value);
            if (!isNaN(raw) && raw !== item.amount) onAmountChange(raw);
          }}
        />
      </div>
      {annual && item.amount > 0 && (
        <div className="sub-annual-hint">÷12 = {dollars(item.amount / 12)}/mo</div>
      )}
    </td>
  );
}

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

function TodayMarkerRow() {
  return (
    <tr className="sub-today-marker">
      <td colSpan={5} />
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
  const activeTotal = active.reduce((s, b) => s + monthlyEq(b), 0);
  const pausedTotal = paused.reduce((s, b) => s + monthlyEq(b), 0);
  const leftover = budget - activeTotal;

  const sortedActive = sortByDueDay(active);
  const past       = sortedActive.filter((b) => b.dueDay != null && b.dueDay <  todayDay);
  const todayItems  = sortedActive.filter((b) => b.dueDay != null && b.dueDay === todayDay);
  const upcoming    = sortedActive.filter((b) => b.dueDay != null && b.dueDay >  todayDay);
  const noDue       = sortedActive.filter((b) => b.dueDay == null);
  const hasDueDays  = sortedActive.some((b) => b.dueDay != null);

  const renderRow = (b: SubItem, charged = false) => (
    <tr
      key={b.id}
      className={[
        b.active ? undefined : "sub-row-paused",
        charged   ? "sub-row-charged" : undefined,
      ].filter(Boolean).join(" ")}
    >
      <td>
        <button
          className={`sub-toggle ${b.active ? "sub-toggle-on" : "sub-toggle-off"}`}
          onClick={() => void patch(b.id, { active: !b.active } as Partial<SubItem>)}
          title={b.active ? "Pause this subscription" : "Reactivate"}
          aria-label={b.active ? "Active" : "Paused"}
        />
      </td>
      <NameCell
        item={b}
        label="Subscription name"
        className={b.active ? undefined : "sub-name-paused"}
        onRename={(name) => void patch(b.id, { name } as Partial<SubItem>)}
      />
      <SubAmountCell
        item={b}
        onAmountChange={(amount) => void patch(b.id, { amount } as Partial<SubItem>)}
        onCycleChange={(billingCycle) => void patch(b.id, { billingCycle } as Partial<SubItem>)}
      />
      <DueDayCell
        item={b}
        charged={charged}
        onChange={(dueDay) => void patch(b.id, { dueDay } as Partial<SubItem>)}
      />
      <RemoveCell name={b.name} onRemove={() => void remove(b)} />
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
              {past.map((b) => renderRow(b, true))}
              {hasDueDays && <TodayMarkerRow />}
              {todayItems.map((b) => renderRow(b, false))}
              {upcoming.map((b) => renderRow(b, false))}
              {noDue.length > 0 && hasDueDays && (
                <tr className="sub-divider-row sub-no-due-divider">
                  <td colSpan={5}><span className="eyebrow">No due date</span></td>
                </tr>
              )}
              {noDue.map((b) => renderRow(b, false))}
              {paused.length > 0 && active.length > 0 && (
                <tr className="sub-divider-row">
                  <td colSpan={5}><span className="eyebrow">Paused</span></td>
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
