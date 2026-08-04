import { useMemo, useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api, useApi } from "../../lib/api";
import { dollars, seqLabel, shortDate, shortMonth, todayIso, toAmount } from "../../lib/format";
import { isPayday, nextPayday } from "../../lib/payday";
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

type Account = {
  id: number;
  name: string;
  active: boolean;
  currentBalance: number | null;
  lastUpdated: string | null;
};

type Snapshot = {
  id: number;
  cashAccountId: number;
  snapshotDate: string;
  balance: number;
  loggedAt: string | null;
  paycheckId: number | null;
  paycheckMonth: string | null;
  paycheckSeq: number | null;
};

type PaycheckOption = { id: number; month: string; seq: number };

const paydayLabel = (month: string, seq: number) => `${shortMonth(month)} ${seqLabel(seq)}`;

/** Shared empty array so cards without history keep a stable prop identity. */
const EMPTY: never[] = [];

/** Morning / Noon / Evening / Night based on the hour a snapshot was saved. */
function timeOfDay(iso: string | null): string {
  if (!iso) return "";
  const h = new Date(iso).getHours();
  if (h >= 5  && h < 12) return "Morning";
  if (h >= 12 && h < 14) return "Noon";
  if (h >= 14 && h < 21) return "Evening";
  return "Night";
}

function BalanceLogModal({ log, onClose }: { log: Snapshot[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="bal-log-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bal-log-modal" ref={ref} role="dialog" aria-modal="true" aria-label="Balance log">
        <div className="bal-log-header">
          <span className="eyebrow">Balance log</span>
          <button className="quiet btn-icon" onClick={onClose} aria-label="Close">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <ul className="bal-log-list">
          {log.map((s) => {
            const when = s.paycheckMonth && s.paycheckSeq != null
              ? paydayLabel(s.paycheckMonth, s.paycheckSeq)
              : null;
            return (
              <li key={s.id} className="bal-log-row">
                <span className="bal-log-when">
                  {when ?? shortDate(s.snapshotDate)}
                  {s.loggedAt && <span className="bal-log-tod">{timeOfDay(s.loggedAt)}</span>}
                </span>
                <span className="bal-log-amt">{dollars(s.balance)}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function groupBy<T>(rows: T[], key: (row: T) => number): Map<number, T[]> {
  const out = new Map<number, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = out.get(k);
    if (list) list.push(row);
    else out.set(k, [row]);
  }
  return out;
}

export default function Cash() {
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (addOpen) nameRef.current?.focus();
  }, [addOpen]);

  const accounts  = useApi<Account[]>("/api/finance/cash-accounts");
  const snapshots = useApi<Snapshot[]>("/api/finance/cash-snapshots");
  const paychecks = useApi<PaycheckOption[]>("/api/finance/paychecks");

  const isPaydayToday = isPayday(new Date());
  const currentPaycheckId = useMemo(() => {
    const sorted = [...(paychecks.data ?? [])].sort((a, b) => b.month.localeCompare(a.month) || b.seq - a.seq);
    return sorted[0]?.id ?? null;
  }, [paychecks.data]);

  const refreshAll = () => Promise.all([accounts.reload(), snapshots.reload()]);

  const guard = (fn: () => Promise<unknown>) => async () => {
    setError(null);
    try { await fn(); }
    catch (err) { setError(err instanceof Error ? err.message : "That didn't save."); }
  };

  const addAccount = guard(async () => {
    if (!newName.trim()) return;
    await api.post("/api/finance/cash-accounts", { name: newName.trim() });
    setNewName("");
    setAddOpen(false);
    await accounts.reload();
  });

  // Bucket the history once instead of re-scanning it inside every card.
  const snapshotsByAccount = useMemo(
    () => groupBy(snapshots.data ?? [], (s) => s.cashAccountId),
    [snapshots.data],
  );

  const active = (accounts.data ?? []).filter((a) => a.active);
  const totalCash = active.reduce((s, a) => s + (a.currentBalance ?? 0), 0);

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

      {/* ── Top stat strip ── */}
      {active.length > 0 && (
        <div className="bills-stat-strip" style={{ marginBottom: "1.25rem", border: "1px solid var(--rule)", borderRadius: 4 }}>
          <div className="bills-stat">
            <span className="eyebrow">Total cash</span>
            <span className="fig" style={{ color: totalCash > 0 ? SPENDING_COLOR : "var(--ink-faint)" }}>
              {dollars(totalCash)}
            </span>
          </div>
        </div>
      )}

      {/* ── Account panels ── */}
      {!accounts.loading && active.length === 0 ? (
        <Empty title="No accounts yet">
          <p>Add Cash App, Venmo, or another spending balance below.</p>
        </Empty>
      ) : (
        <div className="grid grid-2">
          {active.map((account) => (
            <AccountPanel
              key={account.id}
              account={account}
              snapshots={snapshotsByAccount.get(account.id) ?? EMPTY}
              isPaydayToday={isPaydayToday}
              currentPaycheckId={currentPaycheckId}
              onChanged={refreshAll}
              onError={setError}
            />
          ))}
        </div>
      )}

      {/* ── Add account ── */}
      {!addOpen ? (
        <button
          className="ft-add-btn"
          style={{ marginTop: "1.25rem" }}
          onClick={() => setAddOpen(true)}
        >
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
          <button className="primary" onClick={addAccount} disabled={!newName.trim()}>
            Add
          </button>
          <button className="quiet" onClick={() => { setAddOpen(false); setNewName(""); }}>✕</button>
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function AccountPanel({
  account,
  snapshots,
  isPaydayToday,
  currentPaycheckId,
  onChanged,
  onError,
}: {
  account: Account;
  snapshots: Snapshot[];
  isPaydayToday: boolean;
  currentPaycheckId: number | null;
  onChanged: () => Promise<unknown>;
  onError: (m: string | null) => void;
}) {
  const navigate = useNavigate();
  const [balInput, setBalInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [showLog, setShowLog] = useState(false);

  const sorted = [...snapshots].sort((a, b) => a.snapshotDate.localeCompare(b.snapshotDate));
  const points: Point[] = sorted.map((s) => ({ date: s.snapshotDate, value: s.balance }));
  // Latest first, for the log list.
  const log = [...sorted].reverse();

  const balance = account.currentBalance ?? 0;

  async function updateBalance() {
    const v = toAmount(balInput);
    if (!balInput.trim()) return;
    setBusy(true);
    onError(null);
    try {
      await api.post("/api/finance/cash-snapshots", {
        cashAccountId: account.id,
        snapshotDate: todayIso(),
        balance: v,
        paycheckId: currentPaycheckId,
      });
      setBalInput("");
      await onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not update balance.");
    } finally {
      setBusy(false);
    }
  }

  async function saveName(name: string) {
    if (!name.trim() || name === account.name) return;
    await api.patch(`/api/finance/cash-accounts/${account.id}`, { name: name.trim() });
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
            title="Remove account"
            onClick={async () => {
              if (!confirm(`Remove "${account.name}"? This deletes all its history.`)) return;
              await api.del(`/api/finance/cash-accounts/${account.id}`);
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
          <span className="debt-balance-fig" style={{ color: balance > 0 ? SPENDING_COLOR : "var(--ink-faint)" }}>
            {dollars(balance)}
          </span>
          {account.lastUpdated && (
            <span className="debt-balance-date">as of {shortDate(account.lastUpdated)}</span>
          )}
        </div>

        {/* Trend */}
        {points.length > 1 ? (
          <div style={{ margin: "0.75rem 0 0" }}>
            <BalanceChart points={points} color={SPENDING_COLOR} height={100} />
          </div>
        ) : points.length === 1 ? (
          <p className="muted" style={{ fontSize: "0.8125rem", margin: "0.75rem 0 0" }}>
            Log another balance to see the trend.
          </p>
        ) : null}

        {showLog && (
          <BalanceLogModal log={log} onClose={() => setShowLog(false)} />
        )}

      </div>

      {/* Update balance — only on payday */}
      <div className="debt-card-footer">
        <button className="quiet cd-log-link" onClick={() => navigate(`/finance/cash/${account.id}`)}>
          Spending log →
        </button>
        {log.length > 0 && (
          <button className="quiet bal-log-trigger" onClick={() => setShowLog(true)}>
            Log <span className="bal-log-count">{log.length}</span>
          </button>
        )}
        {isPaydayToday ? (
          <>
            <input
              className="debt-bal-input"
              inputMode="decimal"
              value={balInput}
              placeholder="Balance…"
              onChange={(e) => setBalInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && updateBalance()}
            />
            <button onClick={updateBalance} disabled={busy || !balInput.trim()}>
              Save
            </button>
          </>
        ) : (
          <span className="debt-next-payday">
            Next payday → {nextPayday(new Date()).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
          </span>
        )}
      </div>
    </Panel>
  );
}
