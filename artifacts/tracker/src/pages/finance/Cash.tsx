import { useState, useRef, useEffect, useMemo } from "react";
import SpendingLogModal from "./SpendingLogModal";
import { api, useApi } from "../../lib/api";
import { dollars, shortDate } from "../../lib/format";
import {
  BalanceChart,
  Empty,
  Loading,
  Notice,
  Panel,
  SPENDING_COLOR,
  type Point,
} from "../../components/ui";
import FinanceNav from "./FinanceNav";

// ── Types ─────────────────────────────────────────────────────────────────────

type Account = {
  id: number;
  name: string;
  active: boolean;
  sortOrder: number;
  currentBalance: number;
  lastUpdated: string | null;
  balanceHistory: Array<{ date: string; value: number }>;
};

type DragState = { fromId: number; overId: number };

// ── Drag handle icon ──────────────────────────────────────────────────────────

function IcGrip() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <rect x="2" y="3" width="12" height="1.5" rx="0.75"/>
      <rect x="2" y="7.25" width="12" height="1.5" rx="0.75"/>
      <rect x="2" y="11.5" width="12" height="1.5" rx="0.75"/>
    </svg>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Cash() {
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (addOpen) nameRef.current?.focus();
  }, [addOpen]);

  const accounts = useApi<Account[]>("/api/finance/cash-accounts");

  // ── Local order (drag-to-reorder) ─────────────────────────────────────────
  const [localOrder, setLocalOrder] = useState<Account[]>([]);
  const dragRef = useRef<DragState | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);

  // Sync from server when data arrives (skip during an active drag)
  useEffect(() => {
    if (dragRef.current) return;
    setLocalOrder((accounts.data ?? []).filter((a) => a.active));
  }, [accounts.data]);

  // Real-time reordered list for rendering
  const displayOrder = useMemo(() => {
    if (!dragState || dragState.fromId === dragState.overId) return localOrder;
    const fromIdx = localOrder.findIndex((a) => a.id === dragState.fromId);
    const overIdx = localOrder.findIndex((a) => a.id === dragState.overId);
    if (fromIdx === -1 || overIdx === -1) return localOrder;
    const arr = [...localOrder];
    const [item] = arr.splice(fromIdx, 1);
    arr.splice(overIdx, 0, item);
    return arr;
  }, [localOrder, dragState]);

  function handleDragStart(id: number) {
    const state: DragState = { fromId: id, overId: id };
    dragRef.current = state;
    setDragState({ ...state });
    document.body.style.userSelect = "none";
  }

  function handleDragOver(clientX: number, clientY: number) {
    if (!dragRef.current) return;
    const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    const card = el?.closest("[data-account-id]") as HTMLElement | null;
    if (card) {
      const id = parseInt(card.dataset.accountId ?? "", 10);
      if (!isNaN(id) && id !== dragRef.current.overId) {
        dragRef.current.overId = id;
        setDragState({ ...dragRef.current });
      }
    }
  }

  function handleDragEnd() {
    if (!dragRef.current) return;
    document.body.style.userSelect = "";
    const { fromId, overId } = dragRef.current;
    dragRef.current = null;
    setDragState(null);
    if (fromId === overId) return;

    // Commit reordered array
    const fromIdx = localOrder.findIndex((a) => a.id === fromId);
    const overIdx = localOrder.findIndex((a) => a.id === overId);
    if (fromIdx === -1 || overIdx === -1) return;
    const newOrder = [...localOrder];
    const [item] = newOrder.splice(fromIdx, 1);
    newOrder.splice(overIdx, 0, item);
    setLocalOrder(newOrder);
    api
      .put("/api/finance/cash-accounts/reorder", { ids: newOrder.map((a) => a.id) })
      .catch(() => setError("Could not save order. Please try again."));
  }
  // ──────────────────────────────────────────────────────────────────────────

  const totalCash = localOrder.reduce((s, a) => s + a.currentBalance, 0);

  const addAccount = async () => {
    if (!newName.trim()) return;
    try {
      await api.post("/api/finance/cash-accounts", { name: newName.trim() });
      setNewName("");
      setAddOpen(false);
      await accounts.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add account.");
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Cash</h1>
        </div>
        <FinanceNav />
      </div>

      <Notice>{error}</Notice>
      {accounts.loading && <Loading />}

      {/* Total strip */}
      {localOrder.length > 0 && (
        <div className="bills-stat-strip" style={{ marginBottom: "1.25rem", border: "1px solid var(--rule)", borderRadius: 4 }}>
          <div className="bills-stat">
            <span className="eyebrow">Total cash</span>
            <span className="fig" style={{ color: totalCash > 0 ? SPENDING_COLOR : totalCash < 0 ? "var(--stamp)" : "var(--ink-faint)" }}>
              {dollars(totalCash)}
            </span>
          </div>
        </div>
      )}

      {/* Account panels */}
      {!accounts.loading && localOrder.length === 0 ? (
        <Empty title="No accounts yet">
          <p>Add Cash App, Venmo, or another spending account below.</p>
        </Empty>
      ) : (
        <div className="grid grid-2">
          {displayOrder.map((account) => (
            <AccountPanel
              key={account.id}
              account={account}
              isDragging={dragState?.fromId === account.id}
              isDropTarget={dragState?.overId === account.id && dragState.fromId !== account.id}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
              onChanged={() => accounts.reload()}
              onError={setError}
            />
          ))}
        </div>
      )}

      {/* Add account */}
      {!addOpen ? (
        <button className="ft-add-btn" style={{ marginTop: "1.25rem" }} onClick={() => setAddOpen(true)}>
          + Add account
        </button>
      ) : (
        <div className="panel-body bills-add-row" style={{ marginTop: "1.25rem", border: "1px solid var(--rule)", borderRadius: 4 }}>
          <input
            ref={nameRef}
            value={newName}
            placeholder="Cash App, Venmo…"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter")  addAccount();
              if (e.key === "Escape") { setAddOpen(false); setNewName(""); }
            }}
            style={{ flex: 1 }}
          />
          <button className="primary" onClick={addAccount} disabled={!newName.trim()}>Add</button>
          <button className="quiet" onClick={() => { setAddOpen(false); setNewName(""); }}>✕</button>
        </div>
      )}
    </>
  );
}

// ── Account card ──────────────────────────────────────────────────────────────

function AccountPanel({
  account,
  isDragging,
  isDropTarget,
  onDragStart,
  onDragOver,
  onDragEnd,
  onChanged,
  onError,
}: {
  account: Account;
  isDragging: boolean;
  isDropTarget: boolean;
  onDragStart: (id: number) => void;
  onDragOver: (x: number, y: number) => void;
  onDragEnd: () => void;
  onChanged: () => void;
  onError: (m: string | null) => void;
}) {
  const [showSpendingLog, setShowSpendingLog] = useState(false);

  const balance = account.currentBalance;
  const balColor = balance > 0 ? SPENDING_COLOR : balance < 0 ? "var(--stamp)" : "var(--ink-faint)";
  const points: Point[] = account.balanceHistory ?? [];

  async function saveName(name: string) {
    if (!name.trim() || name === account.name) return;
    try {
      await api.patch(`/api/finance/cash-accounts/${account.id}`, { name: name.trim() });
      onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not rename.");
    }
  }

  // ── Drag handle pointer events ─────────────────────────────────────────────
  const handleRef = useRef<HTMLDivElement>(null);

  function onHandlePointerDown(e: React.PointerEvent) {
    e.stopPropagation();
    handleRef.current?.setPointerCapture(e.pointerId);
    onDragStart(account.id);
  }
  function onHandlePointerMove(e: React.PointerEvent) {
    if (!handleRef.current?.hasPointerCapture(e.pointerId)) return;
    onDragOver(e.clientX, e.clientY);
  }
  function onHandlePointerUp(e: React.PointerEvent) {
    if (!handleRef.current?.hasPointerCapture(e.pointerId)) return;
    handleRef.current.releasePointerCapture(e.pointerId);
    onDragEnd();
  }

  return (
    <div
      data-account-id={account.id}
      className={[
        "ca-card-wrapper",
        isDragging    ? "ca-card--dragging"    : "",
        isDropTarget  ? "ca-card--drop-target" : "",
      ].filter(Boolean).join(" ")}
    >
      <Panel bodyless>
        <div className="debt-card-body">

          {/* Name row + drag handle + remove */}
          <div className="debt-card-name-row">
            {/* Drag handle */}
            <div
              ref={handleRef}
              className="ca-drag-handle"
              title="Drag to reorder"
              onPointerDown={onHandlePointerDown}
              onPointerMove={onHandlePointerMove}
              onPointerUp={onHandlePointerUp}
              onPointerCancel={onHandlePointerUp}
            >
              <IcGrip />
            </div>

            <input
              className="debt-card-name"
              defaultValue={account.name}
              key={account.id + account.name}
              onBlur={(e) => saveName(e.target.value)}
            />
            <button
              className="quiet danger btn-icon debt-card-remove"
              title="Remove account"
              onClick={async () => {
                if (!confirm(`Remove "${account.name}"? This deletes all its history.`)) return;
                await api.del(`/api/finance/cash-accounts/${account.id}`);
                onChanged();
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                strokeLinejoin="round" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>

          {/* Balance */}
          <div className="debt-balance-row">
            <span className="debt-balance-fig" style={{ color: balColor }}>
              {dollars(balance)}
            </span>
            {account.lastUpdated && (
              <span className="debt-balance-date">updated {shortDate(account.lastUpdated)}</span>
            )}
          </div>

          {/* Running balance sparkline */}
          {points.length > 1 && (
            <div style={{ margin: "0.75rem 0 0" }}>
              <BalanceChart points={points} color={SPENDING_COLOR} height={100} />
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="debt-card-footer">
          <button className="quiet cd-log-link" onClick={() => setShowSpendingLog(true)}>
            Spending log →
          </button>
          {showSpendingLog && (
            <SpendingLogModal
              accountId={account.id}
              accountName={account.name}
              onClose={() => { setShowSpendingLog(false); onChanged(); }}
            />
          )}
        </div>
      </Panel>
    </div>
  );
}
