import { Suspense, lazy, useMemo, useRef, useState, useEffect } from "react";
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
import { api } from "../../lib/api";
import FinanceNav from "./FinanceNav";

const BillsCharts = lazy(() => import("./BillsCharts"));

const DEFAULT_BUDGET = 2000;
const COLORS_KEY   = "bill-colors";

// ── Types ─────────────────────────────────────────────────────────────────────

type DragState = {
  fromId:  number;
  overId:  number;
  clientX: number;
  clientY: number;
};

// ── Drag grip icon ────────────────────────────────────────────────────────────

function IcGrip() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <rect x="2" y="3"    width="12" height="1.5" rx="0.75"/>
      <rect x="2" y="7.25" width="12" height="1.5" rx="0.75"/>
      <rect x="2" y="11.5" width="12" height="1.5" rx="0.75"/>
    </svg>
  );
}

// ── Bill colour swatch / picker (per-name, stored locally) ────────────────────

function useBillColors() {
  const [colors, setColorsState] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem(COLORS_KEY) ?? "{}"); }
    catch { return {}; }
  });
  const setColor = (name: string, color: string) =>
    setColorsState((prev) => {
      const next = { ...prev, [name]: color };
      localStorage.setItem(COLORS_KEY, JSON.stringify(next));
      return next;
    });
  return [colors, setColor] as const;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Bills() {
  const [month, setMonth] = useState(currentMonth());
  const [budget, setBudget] = useBudget(`bills-budget-${month}`, DEFAULT_BUDGET);
  const [colors, setColor] = useBillColors();
  const [reorderError, setReorderError] = useState<string | null>(null);

  const { items, loading, error, add, patch, remove } = useMonthlyItems<MonthlyItem>(
    "bills", month,
  );

  // Re-fetch the chart whenever the bill list mutates.
  const [chartKey, setChartKey] = useState(0);
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    setChartKey((k) => k + 1);
  }, [items]);

  // ── Drag-to-reorder ────────────────────────────────────────────────────────
  const [localOrder, setLocalOrder] = useState<MonthlyItem[]>([]);
  const dragRef = useRef<DragState | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);

  // Sync from server; skip while a drag is live.
  useEffect(() => {
    if (dragRef.current) return;
    setLocalOrder(items);
  }, [items]);

  // Live preview: insert the dragged row at the hovered position.
  const displayOrder = useMemo(() => {
    if (!dragState || dragState.fromId === dragState.overId) return localOrder;
    const fromIdx = localOrder.findIndex((b) => b.id === dragState.fromId);
    const overIdx = localOrder.findIndex((b) => b.id === dragState.overId);
    if (fromIdx === -1 || overIdx === -1) return localOrder;
    const arr = [...localOrder];
    const [item] = arr.splice(fromIdx, 1);
    arr.splice(overIdx, 0, item);
    return arr;
  }, [localOrder, dragState]);

  function handleDragStart(id: number, clientX: number, clientY: number) {
    const state: DragState = { fromId: id, overId: id, clientX, clientY };
    dragRef.current = state;
    setDragState({ ...state });
    document.documentElement.style.overflow = "hidden";
    document.body.style.userSelect = "none";
  }

  function handleDragMove(clientX: number, clientY: number) {
    if (!dragRef.current) return;
    dragRef.current.clientX = clientX;
    dragRef.current.clientY = clientY;
    // Ghost row has pointer-events:none so elementFromPoint sees the row below.
    const el  = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    const row = el?.closest("[data-bill-id]") as HTMLElement | null;
    if (row) {
      const id = parseInt(row.dataset.billId ?? "", 10);
      if (!isNaN(id)) dragRef.current.overId = id;
    }
    setDragState({ ...dragRef.current });
  }

  function handleDragEnd() {
    if (!dragRef.current) return;
    document.documentElement.style.overflow = "";
    document.body.style.userSelect = "";
    const { fromId, overId } = dragRef.current;
    dragRef.current = null;
    setDragState(null);
    if (fromId === overId) return;

    const fromIdx = localOrder.findIndex((b) => b.id === fromId);
    const overIdx = localOrder.findIndex((b) => b.id === overId);
    if (fromIdx === -1 || overIdx === -1) return;

    const prevOrder = [...localOrder];
    const newOrder  = [...localOrder];
    const [item] = newOrder.splice(fromIdx, 1);
    newOrder.splice(overIdx, 0, item);
    setLocalOrder(newOrder);

    api
      .put("/api/finance/bills/reorder", { ids: newOrder.map((b) => b.id) })
      .catch(() => {
        setLocalOrder(prevOrder);
        setReorderError("Could not save order — please try again.");
      });
  }
  // ──────────────────────────────────────────────────────────────────────────

  const total    = localOrder.reduce((s, b) => s + b.amount, 0);
  const leftover = budget - total;

  // The bill currently being dragged (for the floating card).
  const draggingBill = dragState
    ? localOrder.find((b) => b.id === dragState.fromId) ?? null
    : null;

  return (
    <>
      <div className="page-head">
        <div><h1>Bills</h1></div>
        <div className="button-row">
          <FinanceNav />
          <MonthPicker month={month} onChange={setMonth} />
        </div>
      </div>

      <Notice>{reorderError ?? error}</Notice>
      {loading && <Loading />}

      <Panel title={monthName(month)} bodyless>
        {!loading && localOrder.length === 0 ? (
          <div className="panel-body">
            <Empty title="No bills for this month">
              <p>Add a bill below — next month it'll carry over automatically.</p>
            </Empty>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th className="col-drag" />
                <th className="col-swatch" />
                <th>Bill</th>
                <th className="num col-amount">Amount</th>
                <th className="col-del" />
              </tr>
            </thead>
            <tbody>
              {displayOrder.map((b) => (
                <BillRow
                  key={b.id}
                  bill={b}
                  colors={colors}
                  month={month}
                  isDragging={dragState?.fromId === b.id}
                  onDragStart={handleDragStart}
                  onDragMove={handleDragMove}
                  onDragEnd={handleDragEnd}
                  onColorChange={setColor}
                  onRename={(name) => void patch(b.id, { name })}
                  onAmountChange={(amount) => void patch(b.id, { amount })}
                  onRemove={() => void remove(b, `Remove "${b.name}" from ${monthName(month)}?`)}
                />
              ))}
            </tbody>
          </table>
        )}

        {localOrder.length > 0 && (
          <div className="bills-stat-strip">
            <Stat label="Total"><span className="fig">{dollars(total)}</span></Stat>
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

      {/* Floating drag card — follows the cursor while dragging */}
      {draggingBill && dragState && (
        <div
          className="bill-drag-card"
          style={{ left: dragState.clientX + 16, top: dragState.clientY - 22 }}
        >
          <span
            className="bill-drag-card__swatch"
            style={{ background: colors[draggingBill.name] ?? tagColor(draggingBill.name) }}
          />
          <span className="bill-drag-card__name">{draggingBill.name}</span>
          <span className="bill-drag-card__amount">{dollars(draggingBill.amount)}</span>
        </div>
      )}

      <Suspense fallback={<Loading />}>
        <BillsCharts budget={budget} colors={colors} chartKey={chartKey} />
      </Suspense>
    </>
  );
}

// ── Bill row ──────────────────────────────────────────────────────────────────

function BillRow({
  bill,
  colors,
  month,
  isDragging,
  onDragStart,
  onDragMove,
  onDragEnd,
  onColorChange,
  onRename,
  onAmountChange,
  onRemove,
}: {
  bill: MonthlyItem;
  colors: Record<string, string>;
  month: string;
  isDragging: boolean;
  onDragStart: (id: number, clientX: number, clientY: number) => void;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: () => void;
  onColorChange: (name: string, color: string) => void;
  onRename: (name: string) => void;
  onAmountChange: (amount: number) => void;
  onRemove: () => void;
}) {
  const handleRef = useRef<HTMLTableCellElement>(null);

  function onHandlePointerDown(e: React.PointerEvent) {
    e.stopPropagation();
    handleRef.current?.setPointerCapture(e.pointerId);
    onDragStart(bill.id, e.clientX, e.clientY);
  }
  function onHandlePointerMove(e: React.PointerEvent) {
    if (!handleRef.current?.hasPointerCapture(e.pointerId)) return;
    onDragMove(e.clientX, e.clientY);
  }
  function onHandlePointerUp(e: React.PointerEvent) {
    if (!handleRef.current?.hasPointerCapture(e.pointerId)) return;
    handleRef.current.releasePointerCapture(e.pointerId);
    onDragEnd();
  }

  return (
    <tr
      data-bill-id={bill.id}
      className={isDragging ? "bill-row--dragging" : undefined}
    >
      {/* Drag handle */}
      <td
        ref={handleRef}
        className="bill-drag-handle"
        title="Drag to reorder"
        onPointerDown={onHandlePointerDown}
        onPointerMove={onHandlePointerMove}
        onPointerUp={onHandlePointerUp}
        onPointerCancel={onHandlePointerUp}
      >
        <IcGrip />
      </td>

      {/* Colour swatch */}
      <td>
        <label className="bill-color-label" title="Click to change color">
          <span
            className="bill-color-swatch"
            style={{ background: colors[bill.name] ?? tagColor(bill.name) }}
          />
          <input
            type="color"
            className="bill-color-input"
            value={colors[bill.name] ?? tagColor(bill.name)}
            onChange={(e) => onColorChange(bill.name, e.target.value)}
          />
        </label>
      </td>

      <NameCell item={bill} label="Bill name" onRename={onRename} />
      <AmountCell item={bill} onChange={onAmountChange} />
      <RemoveCell name={bill.name} onRemove={onRemove} />
    </tr>
  );
}
