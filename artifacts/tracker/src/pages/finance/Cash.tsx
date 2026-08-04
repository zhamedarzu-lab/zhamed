import { useState, useRef, useEffect } from "react";
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
  currentBalance: number;
  lastUpdated: string | null;
  balanceHistory: Array<{ date: string; value: number }>;
};

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
  const active   = (accounts.data ?? []).filter((a) => a.active);
  const totalCash = active.reduce((s, a) => s + a.currentBalance, 0);

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
      {active.length > 0 && (
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
      {!accounts.loading && active.length === 0 ? (
        <Empty title="No accounts yet">
          <p>Add Cash App, Venmo, or another spending account below.</p>
        </Empty>
      ) : (
        <div className="grid grid-2">
          {active.map((account) => (
            <AccountPanel
              key={account.id}
              account={account}
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
  onChanged,
  onError,
}: {
  account: Account;
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
  );
}
