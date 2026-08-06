import { useMemo, useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { api, useApi } from "../../lib/api";
import { dollars, seqLabel, shortDate, shortMonth, toAmount, todayIso } from "../../lib/format";
import { BalanceChart, Empty, Loading, Notice, Panel, type Point } from "../../components/ui";
import { AddItemRow } from "../../components/finance-ui";
import FinanceNav from "./FinanceNav";
import { isPayday, nextPayday } from "../../lib/payday";

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
  paycheckId: number | null;
  paycheckMonth: string | null;
  paycheckSeq: number | null;
  loggedAt: string | null;
};

type Payment = {
  id: number;
  amount: number;
  note: string;
  debtAccountId: number;
  applied: boolean;
  paycheckId: number;
  month: string;
  seq: number;
};

type PaycheckOption = { id: number; month: string; seq: number };

/** "Jul 2/2" — short payday label used in the balance log and chart. */
const paydayLabel = (month: string, seq: number) => `${shortMonth(month)} ${seqLabel(seq)}`;

/** "Aug 1/2" — fraction format for the payday picker so it doesn't look like a calendar date. */
function paydayPickerLabel(p: PaycheckOption, all: PaycheckOption[]) {
  const maxSeq = Math.max(...all.filter(x => x.month === p.month).map(x => x.seq));
  return `${shortMonth(p.month)} ${p.seq}/${maxSeq}`;
}

/** Morning / Noon / Evening / Night based on the hour a snapshot was saved. */
function timeOfDay(iso: string | null): string {
  if (!iso) return "";
  const h = new Date(iso).getHours();
  if (h >= 5  && h < 12) return "Morning";
  if (h >= 12 && h < 14) return "Noon";
  if (h >= 14 && h < 21) return "Evening";
  return "Night";
}

function BalanceLogModal({
  log,
  paydayLabel: pdLabel,
  onClose,
}: {
  log: Snapshot[];
  paydayLabel: (s: Snapshot) => string | null;
  onClose: () => void;
}) {
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
            const when = pdLabel(s);
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

/** Shared empty array so cards without history keep a stable prop identity. */
const EMPTY: never[] = [];

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

function utilColor(ratio: number) {
  if (ratio <= 0.3)  return "#5fc97a";
  if (ratio <= 0.6)  return "#ccb85a";
  return "var(--stamp)";
}

export default function Debt() {
  const [error, setError] = useState<string | null>(null);

  const accounts  = useApi<Account[]>("/api/finance/debt-accounts");
  const snapshots = useApi<Snapshot[]>("/api/finance/debt-snapshots");
  const payments  = useApi<Payment[]>("/api/finance/debt-payments");
  const paychecks = useApi<PaycheckOption[]>("/api/finance/paychecks");

  const refreshAll = () => Promise.all([accounts.reload(), snapshots.reload(), payments.reload()]);

  const isPaydayToday = isPayday(new Date());
  const currentPaycheckId = useMemo(() => {
    const sorted = [...(paychecks.data ?? [])].sort(
      (a, b) => b.month.localeCompare(a.month) || b.seq - a.seq,
    );
    return sorted[0]?.id ?? null;
  }, [paychecks.data]);

  const guard = (fn: () => Promise<unknown>) => async () => {
    setError(null);
    try { await fn(); }
    catch (err) { setError(err instanceof Error ? err.message : "That didn't save."); }
  };

  const addCard = async (name: string) => {
    setError(null);
    try {
      await api.post("/api/finance/debt-accounts", { name, kind: "card" });
      await accounts.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't save.");
      throw err;
    }
  };

  // Bucket the history once instead of re-scanning it inside every card.
  const snapshotsByAccount = useMemo(
    () => groupBy(snapshots.data ?? [], (s) => s.debtAccountId),
    [snapshots.data],
  );
  const paymentsByAccount = useMemo(
    () => groupBy(payments.data ?? [], (p) => p.debtAccountId),
    [payments.data],
  );

  const active = (accounts.data ?? []).filter((a) => a.active);
  const totalOwed  = active.reduce((s, a) => s + (a.currentBalance ?? 0), 0);
  const totalLimit = active.reduce((s, a) => s + (a.creditLimit ?? 0), 0);
  const utilRatio  = totalLimit > 0 ? totalOwed / totalLimit : null;

  return (
    <>
      <div className="page-head">
        <div>
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
              snapshots={snapshotsByAccount.get(account.id) ?? EMPTY}
              payments={paymentsByAccount.get(account.id) ?? EMPTY}
              isPaydayToday={isPaydayToday}
              currentPaycheckId={currentPaycheckId}
              paychecks={[...(paychecks.data ?? [])].sort(
                (a, b) => b.month.localeCompare(a.month) || b.seq - a.seq
              )}
              onChanged={refreshAll}
              onError={setError}
            />
          ))}
        </div>
      )}

      {/* ── Add card ── */}
      <AddItemRow
        label="Add a card"
        placeholder="Chase, Capital One…"
        onAdd={addCard}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function CardPanel({
  account,
  snapshots,
  payments,
  isPaydayToday,
  currentPaycheckId,
  paychecks,
  onChanged,
  onError,
}: {
  account: Account;
  snapshots: Snapshot[];
  payments: Payment[];
  isPaydayToday: boolean;
  currentPaycheckId: number | null;
  paychecks: PaycheckOption[];
  onChanged: () => Promise<unknown>;
  onError: (m: string | null) => void;
}) {
  const [balInput, setBalInput] = useState("");
  const [editLimit,  setEditLimit]  = useState(false);
  const [limitInput, setLimitInput] = useState("");
  const [busy,       setBusy]       = useState(false);
  const [applied,    setApplied]    = useState(0);
  const [showLog,    setShowLog]    = useState(false);
  const [selectedPaycheckId, setSelectedPaycheckId] = useState<number | null>(null);

  // Keep picker defaulted to the most recent paycheck once data arrives
  const effectivePaycheckId = selectedPaycheckId ?? currentPaycheckId;

  const sorted = [...snapshots].sort((a, b) => a.snapshotDate.localeCompare(b.snapshotDate));
  const points: Point[] = sorted.map((s) => ({
    date: s.snapshotDate,
    value: s.balance,
    label: s.paycheckMonth != null && s.paycheckSeq != null
      ? paydayLabel(s.paycheckMonth, s.paycheckSeq)
      : undefined,
  }));
  // Latest first, for the log list.
  const log = [...sorted].reverse();

  const balance = account.currentBalance ?? 0;
  const limit   = account.creditLimit ?? 0;
  const ratio   = limit > 0 ? balance / limit : 0;
  const pending = account.pendingPayment;

  const latest = sorted[sorted.length - 1];
  const asOfLabel = latest && latest.paycheckMonth != null && latest.paycheckSeq != null
    ? paydayLabel(latest.paycheckMonth, latest.paycheckSeq)
    : account.lastUpdated ? shortDate(account.lastUpdated) : null;

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
        paycheckId:    effectivePaycheckId,
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
          {asOfLabel && (
            <span className="debt-balance-date">as of {asOfLabel}</span>
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

        {showLog && (
          <BalanceLogModal
            log={log}
            paydayLabel={(s) =>
              s.paycheckId != null && s.paycheckMonth != null && s.paycheckSeq != null
                ? paydayLabel(s.paycheckMonth, s.paycheckSeq)
                : null
            }
            onClose={() => setShowLog(false)}
          />
        )}

        {/* Payment history — paycheck money ever sent toward this card */}
        {payments.length > 0 && (
          <div className="debt-history">
            <span className="eyebrow">Paycheck payments</span>
            <ul className="debt-history-list">
              {payments.map((p) => (
                <li key={p.id}>
                  <Link to={`/finance/paycheck/${p.paycheckId}`} className="debt-history-when">
                    {shortMonth(p.month)} {seqLabel(p.seq)}
                  </Link>
                  <span className="debt-history-note">{p.note || <em>Untitled</em>}</span>
                  <span className="debt-history-amt">{dollars(p.amount)}</span>
                  {!p.applied && <span className="debt-history-pending-tag">pending</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

      </div>

      {/* Update balance — only on payday */}
      <div className="debt-card-footer">
        {log.length > 0 && (
          <button className="quiet bal-log-trigger" onClick={() => setShowLog(true)}>
            Log <span className="bal-log-count">{log.length}</span>
          </button>
        )}
        {isPaydayToday ? (
          <div className="debt-log-wrap">
            {paychecks.length > 0 && (
              <select
                className="debt-payday-select"
                value={effectivePaycheckId ?? ""}
                onChange={(e) => setSelectedPaycheckId(Number(e.target.value) || null)}
              >
                <option value="">No paycheck</option>
                {paychecks.map((p) => (
                  <option key={p.id} value={p.id}>
                    {paydayPickerLabel(p, paychecks)}
                  </option>
                ))}
              </select>
            )}
            <div className="debt-log-input-row">
              <input
                className="debt-bal-input"
                inputMode="decimal"
                value={balInput}
                placeholder="Balance…"
                onChange={(e) => { setBalInput(e.target.value); setApplied(0); }}
                onKeyDown={(e) => e.key === "Enter" && updateBalance()}
              />
              <button onClick={updateBalance} disabled={busy || !balInput.trim()}>
                Save
              </button>
            </div>
          </div>
        ) : (
          <span className="debt-next-payday">
            Next payday → {nextPayday(new Date()).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
          </span>
        )}
      </div>
    </Panel>
  );
}
