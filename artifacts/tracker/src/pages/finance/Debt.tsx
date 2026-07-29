import { useState } from "react";
import { api, useApi } from "../../lib/api";
import { dollars, shortDate, toAmount, todayIso } from "../../lib/format";
import {
  BalanceChart,
  Empty,
  Field,
  Loading,
  Notice,
  Panel,
  type Point,
} from "../../components/ui";
import FinanceNav from "./FinanceNav";

type Account = {
  id: number;
  name: string;
  kind: string;
  active: boolean;
  currentBalance: number | null;
  lastUpdated: string | null;
};

type Snapshot = {
  id: number;
  debtAccountId: number;
  snapshotDate: string;
  balance: number;
  amountPaid: number;
};

export default function Debt() {
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState("card");

  const accounts = useApi<Account[]>("/api/finance/debt-accounts");
  const snapshots = useApi<Snapshot[]>("/api/finance/debt-snapshots");
  const trend = useApi<Array<{ date: string; total: number }>>("/api/finance/debt/trend");

  const guard = (fn: () => Promise<unknown>) => async () => {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't save.");
    }
  };

  const refreshAll = () =>
    Promise.all([accounts.reload(), snapshots.reload(), trend.reload()]);

  const addAccount = guard(async () => {
    if (!newName.trim()) return;
    await api.post("/api/finance/debt-accounts", { name: newName.trim(), kind: newKind });
    setNewName("");
    await accounts.reload();
  });

  const active = (accounts.data ?? []).filter((a) => a.active);
  const closed = (accounts.data ?? []).filter((a) => !a.active);
  const totalOwed = active.reduce((s, a) => s + (a.currentBalance ?? 0), 0);
  const totalPaid = (snapshots.data ?? []).reduce((s, x) => s + x.amountPaid, 0);

  const aggregate: Point[] = (trend.data ?? []).map((t) => ({
    date: t.date,
    value: t.total,
  }));

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Finance</span>
          <h1>Debt</h1>
          <p>Log the balance each cycle and watch the line fall.</p>
        </div>
        <FinanceNav />
      </div>

      <Notice>{error}</Notice>
      {accounts.loading && <Loading />}

      <div className="stats" style={{ marginBottom: "1.25rem" }}>
        <div className="stat-cell">
          <span className="eyebrow">Owed right now</span>
          <span className="amount fig neg">{dollars(totalOwed)}</span>
        </div>
        <div className="stat-cell">
          <span className="eyebrow">Paid down all time</span>
          <span className="amount fig pos">{dollars(totalPaid)}</span>
        </div>
        <div className="stat-cell">
          <span className="eyebrow">Open accounts</span>
          <span className="amount fig">{active.length}</span>
        </div>
        <div className="stat-cell">
          <span className="eyebrow">Cleared</span>
          <span className="amount fig">{closed.length}</span>
        </div>
      </div>

      <Panel title="Total owed, over time">
        {aggregate.length === 0 ? (
          <Empty title="No balances logged yet">
            <p>Log a balance on any account below and the trajectory starts here.</p>
          </Empty>
        ) : (
          <BalanceChart points={aggregate} color="var(--ink)" height={170} />
        )}
      </Panel>

      <div style={{ height: "1.25rem" }} />

      <div className="grid grid-2">
        {active.map((account) => (
          <AccountCard
            key={account.id}
            account={account}
            snapshots={(snapshots.data ?? []).filter((s) => s.debtAccountId === account.id)}
            onChanged={refreshAll}
            onError={setError}
          />
        ))}
      </div>

      {closed.length > 0 && (
        <>
          <div style={{ height: "1.25rem" }} />
          <Panel title="Cleared accounts" bodyless>
            <table>
              <tbody>
                {closed.map((a) => (
                  <tr key={a.id}>
                    <td>{a.name}</td>
                    <td className="num muted">
                      last balance {dollars(a.currentBalance ?? 0)}
                    </td>
                    <td style={{ width: 90 }}>
                      <button
                        className="quiet"
                        onClick={guard(async () => {
                          await api.patch(`/api/finance/debt-accounts/${a.id}`, { active: true });
                          await accounts.reload();
                        })}
                      >
                        Reopen
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </>
      )}

      <div style={{ height: "1.25rem" }} />

      <Panel title="Add an account">
        <div className="grid" style={{ gridTemplateColumns: "1fr 160px auto", gap: "0.5rem", alignItems: "end" }}>
          <Field label="Name">
            <input
              value={newName}
              placeholder="Cash App, Afterpay, Card C…"
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addAccount()}
            />
          </Field>
          <Field label="Type">
            <select value={newKind} onChange={(e) => setNewKind(e.target.value)}>
              <option value="card">Credit card</option>
              <option value="bnpl">Buy now, pay later</option>
              <option value="loan">Loan</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <button className="primary" onClick={addAccount} disabled={!newName.trim()}>
            Add account
          </button>
        </div>
        <p className="muted" style={{ fontSize: "0.8125rem", marginBottom: 0 }}>
          Only accounts marked <em>Credit card</em> can receive the credit dump.
        </p>
      </Panel>
    </>
  );
}

function AccountCard({
  account,
  snapshots,
  onChanged,
  onError,
}: {
  account: Account;
  snapshots: Snapshot[];
  onChanged: () => Promise<unknown>;
  onError: (msg: string | null) => void;
}) {
  const [balance, setBalance] = useState("");
  const [paid, setPaid] = useState("");
  const [date, setDate] = useState(todayIso());
  const [busy, setBusy] = useState(false);

  const points: Point[] = snapshots.map((s) => ({ date: s.snapshotDate, value: s.balance }));
  const first = snapshots[0]?.balance;
  const latest = account.currentBalance;
  const change = first != null && latest != null ? latest - first : null;

  async function log() {
    if (!balance.trim()) return;
    setBusy(true);
    onError(null);
    try {
      await api.post("/api/finance/debt-snapshots", {
        debtAccountId: account.id,
        snapshotDate: date,
        balance: toAmount(balance),
        amountPaid: toAmount(paid),
      });
      setBalance("");
      setPaid("");
      await onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not log that balance.");
    } finally {
      setBusy(false);
    }
  }

  async function markCleared() {
    if (!confirm(`Mark ${account.name} as cleared? Its history stays put.`)) return;
    await api.patch(`/api/finance/debt-accounts/${account.id}`, { active: false });
    await onChanged();
  }

  return (
    <Panel
      title={
        <div>
          <h2>{account.name}</h2>
          <span className="eyebrow">
            {latest == null
              ? "No balance logged"
              : `${dollars(latest)}${account.lastUpdated ? ` as of ${shortDate(account.lastUpdated)}` : ""}`}
          </span>
        </div>
      }
      action={
        <button className="quiet" onClick={markCleared} disabled={(latest ?? 1) > 0}>
          Mark cleared
        </button>
      }
    >
      {points.length > 0 ? (
        <BalanceChart points={points} color="var(--stamp)" height={120} />
      ) : (
        <p className="muted" style={{ fontSize: "0.8125rem" }}>
          Log this cycle's balance to start the trend line.
        </p>
      )}

      {change != null && points.length > 1 && (
        <p className={`fig ${change < 0 ? "pos" : "neg"}`} style={{ fontSize: "0.8125rem", margin: "0.5rem 0 0" }}>
          {change < 0 ? "▼" : "▲"} {dollars(Math.abs(change))} since {shortDate(snapshots[0].snapshotDate)}
        </p>
      )}

      <div
        className="grid"
        style={{ gridTemplateColumns: "1fr 1fr 1fr auto", gap: "0.5rem", alignItems: "end", marginTop: "0.85rem" }}
      >
        <Field label="Date">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Balance">
          <input
            inputMode="decimal"
            value={balance}
            placeholder="0.00"
            onChange={(e) => setBalance(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && log()}
          />
        </Field>
        <Field label="Paid">
          <input
            inputMode="decimal"
            value={paid}
            placeholder="0.00"
            onChange={(e) => setPaid(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && log()}
          />
        </Field>
        <button onClick={log} disabled={busy || !balance.trim()}>
          Log
        </button>
      </div>
    </Panel>
  );
}
