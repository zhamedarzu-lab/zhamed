import { useState } from "react";
import { api, useApi } from "../../lib/api";
import { dollars, shortDate, toAmount, todayIso } from "../../lib/format";
import { BalanceChart, Empty, Loading, Notice, Panel, type Point } from "../../components/ui";
import FinanceNav from "./FinanceNav";

type Account = {
  id: number;
  name: string;
  creditLimit: number | null;
  active: boolean;
  currentBalance: number | null;
  lastUpdated: string | null;
  pendingPayment: number;
};

type Snapshot = {
  id: number;
  debtAccountId: number;
  snapshotDate: string;
  balance: number;
};

function utilColor(ratio: number) {
  if (ratio <= 0.3)  return "#5fc97a";
  if (ratio <= 0.6)  return "#ccb85a";
  return "var(--stamp)";
}

export default function Debt() {
  const [error, setError]   = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  const accounts  = useApi<Account[]>("/api/finance/debt-accounts");
  const snapshots = useApi<Snapshot[]>("/api/finance/debt-snapshots");

  const refreshAll = () => Promise.all([accounts.reload(), snapshots.reload()]);

  const guard = (fn: () => Promise<unknown>) => async () => {
    setError(null);
    try { await fn(); }
    catch (err) { setError(err instanceof Error ? err.message : "That didn't save."); }
  };

  const addCard = guard(async () => {
    if (!newName.trim()) return;
    await api.post("/api/finance/debt-accounts", { name: newName.trim(), kind: "card" });
    setNewName("");
    await accounts.reload();
  });

  const active = (accounts.data ?? []).filter((a) => a.active);
  const totalOwed  = active.reduce((s, a) => s + (a.currentBalance ?? 0), 0);
  const totalLimit = active.reduce((s, a) => s + (a.creditLimit ?? 0), 0);
  const utilRatio  = totalLimit > 0 ? totalOwed / totalLimit : null;

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Finance</span>
          <h1>Debt</h1>
        </div>
        <FinanceNav />
      </div>

      <Notice>{error}</Notice>
      {accounts.loading && <Loading />}

      {/* ── Top stat strip ── */}
      {active.length > 0 && (
        <div className="bills-stat-strip" style={{ marginBottom: "1.25rem", border: "1px solid var(--rule)", borderRadius: 4 }}>
          <div className="bills-stat">
            <span className="eyebrow">Total owed</span>
            <span className="fig" style={{ color: totalOwed > 0 ? "var(--stamp)" : "#5fc97a" }}>
              {dollars(totalOwed)}
            </span>
          </div>
          {totalLimit > 0 && (
            <>
              <div className="bills-stat">
                <span className="eyebrow">Combined limit</span>
                <span className="fig">{dollars(totalLimit)}</span>
              </div>
              <div className="bills-stat">
                <span className="eyebrow">Utilization</span>
                <span className="fig" style={{ color: utilColor(utilRatio!) }}>
                  {Math.round((utilRatio ?? 0) * 100)}%
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Card panels ── */}
      {!accounts.loading && active.length === 0 ? (
        <Empty title="No cards yet">
          <p>Add your first card below.</p>
        </Empty>
      ) : (
        <div className="grid grid-2">
          {active.map((account) => (
            <CardPanel
              key={account.id}
              account={account}
              snapshots={(snapshots.data ?? []).filter((s) => s.debtAccountId === account.id)}
              onChanged={refreshAll}
              onError={setError}
            />
          ))}
        </div>
      )}

      {/* ── Add card ── */}
      <div className="panel-body bills-add-row" style={{ marginTop: "1.25rem", border: "1px solid var(--rule)", borderRadius: 4 }}>
        <input
          value={newName}
          placeholder="Add a card — Chase, Capital One…"
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addCard()}
          style={{ flex: 1 }}
        />
        <button className="primary" onClick={addCard} disabled={!newName.trim()}>
          Add card
        </button>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function CardPanel({
  account,
  snapshots,
  onChanged,
  onError,
}: {
  account: Account;
  snapshots: Snapshot[];
  onChanged: () => Promise<unknown>;
  onError: (m: string | null) => void;
}) {
  const [balInput,   setBalInput]   = useState("");
  const [editLimit,  setEditLimit]  = useState(false);
  const [limitInput, setLimitInput] = useState("");
  const [busy,       setBusy]       = useState(false);
  const [applied,    setApplied]    = useState(0);

  const sorted = [...snapshots].sort((a, b) => a.snapshotDate.localeCompare(b.snapshotDate));
  const points: Point[] = sorted.map((s) => ({ date: s.snapshotDate, value: s.balance }));

  const balance = account.currentBalance ?? 0;
  const limit   = account.creditLimit ?? 0;
  const ratio   = limit > 0 ? balance / limit : 0;
  const pending = account.pendingPayment;

  function applyPending() {
    const suggested = Math.max(0, balance - pending);
    setBalInput(suggested.toFixed(2));
    setApplied(pending);
  }

  async function updateBalance() {
    const v = toAmount(balInput);
    if (!balInput.trim()) return;
    setBusy(true);
    onError(null);
    try {
      await api.post("/api/finance/debt-snapshots", {
        debtAccountId: account.id,
        snapshotDate:  todayIso(),
        balance:       v,
        amountPaid:    applied,
      });
      setBalInput("");
      setApplied(0);
      await onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not update balance.");
    } finally {
      setBusy(false);
    }
  }

  async function saveLimit() {
    const v = toAmount(limitInput);
    await api.patch(`/api/finance/debt-accounts/${account.id}`, { creditLimit: v > 0 ? v : null });
    setEditLimit(false);
    setLimitInput("");
    await onChanged();
  }

  async function saveName(name: string) {
    if (!name.trim() || name === account.name) return;
    await api.patch(`/api/finance/debt-accounts/${account.id}`, { name: name.trim() });
    await onChanged();
  }

  return (
    <Panel bodyless>
      <div className="debt-card-body">

        {/* Name + remove */}
        <div className="debt-card-name-row">
          <input
            className="debt-card-name"
            defaultValue={account.name}
            key={account.id + account.name}
            onBlur={(e) => saveName(e.target.value)}
          />
          <button
            className="quiet danger btn-icon debt-card-remove"
            title="Remove card"
            onClick={async () => {
              if (!confirm(`Remove "${account.name}"? This deletes all its history.`)) return;
              await api.del(`/api/finance/debt-accounts/${account.id}`);
              await onChanged();
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
          <span className="debt-balance-fig" style={{ color: balance > 0 ? "var(--stamp)" : "#5fc97a" }}>
            {dollars(balance)}
          </span>
          {account.lastUpdated && (
            <span className="debt-balance-date">as of {shortDate(account.lastUpdated)}</span>
          )}
        </div>

        {/* Paycheck money sent here but not yet folded into a balance update */}
        {pending > 0 && (
          <div className="debt-pending-row">
            <span>Sent via paychecks: <strong>{dollars(pending)}</strong></span>
            <button className="quiet" onClick={applyPending}>Apply to balance</button>
          </div>
        )}

        {/* Limit + utilization */}
        <div className="debt-limit-row">
          {editLimit ? (
            <span className="debt-limit-edit">
              <span className="eyebrow" style={{ marginRight: "0.4rem" }}>Limit</span>
              <input
                className="debt-limit-input"
                autoFocus
                inputMode="decimal"
                defaultValue={limit > 0 ? String(limit) : ""}
                placeholder="0.00"
                onBlur={(e) => { setLimitInput(e.target.value); void saveLimit(); }}
                onChange={(e) => setLimitInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") setEditLimit(false);
                }}
              />
            </span>
          ) : (
            <button className="quiet debt-limit-btn" onClick={() => setEditLimit(true)} title="Set credit limit">
              {limit > 0
                ? <><span className="eyebrow">of&nbsp;</span>{dollars(limit)}&nbsp;<span className="eyebrow">limit</span></>
                : <span className="eyebrow">Set credit limit</span>
              }
            </button>
          )}
          {limit > 0 && !editLimit && (
            <span className="debt-util-pct" style={{ color: utilColor(ratio) }}>
              {Math.round(ratio * 100)}%
            </span>
          )}
        </div>

        {/* Util bar */}
        {limit > 0 && (
          <div className="debt-util-track">
            <div
              className="debt-util-fill"
              style={{ width: `${Math.min(100, ratio * 100)}%`, background: utilColor(ratio) }}
            />
          </div>
        )}

        {/* Trend */}
        {points.length > 1 ? (
          <div style={{ margin: "0.75rem 0 0" }}>
            <BalanceChart points={points} color="var(--stamp)" height={100} />
          </div>
        ) : points.length === 1 ? (
          <p className="muted" style={{ fontSize: "0.8125rem", margin: "0.75rem 0 0" }}>
            Log another balance to see the trend.
          </p>
        ) : null}

      </div>

      {/* Update balance */}
      <div className="debt-card-footer">
        <input
          className="debt-bal-input"
          inputMode="decimal"
          value={balInput}
          placeholder="New balance…"
          onChange={(e) => { setBalInput(e.target.value); setApplied(0); }}
          onKeyDown={(e) => e.key === "Enter" && updateBalance()}
        />
        <button onClick={updateBalance} disabled={busy || !balInput.trim()}>
          Update
        </button>
      </div>
    </Panel>
  );
}
