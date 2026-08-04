import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, useApi } from "../../lib/api";
import { dollars, toAmount } from "../../lib/format";
import { Empty, Loading, Notice } from "../../components/ui";
import FinanceNav from "./FinanceNav";

// ── Types ─────────────────────────────────────────────────────────────────────

type Account = {
  id: number;
  name: string;
  active: boolean;
  currentBalance: number | null;
};

type SpendingEntry = {
  id: number;
  cashAccountId: number;
  amount: string;
  description: string;
  category: string;
  loggedAt: string;
};

type Summary = {
  today: number;
  thisWeek: number;
  thisMonth: number;
  byCategory: Array<{ category: string; total: number }>;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const SUGGESTED = [
  "Food", "Drinks", "Transport", "Gas", "Shopping",
  "Entertainment", "Health", "Personal Care", "Bills", "Other",
];

function logTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === now.toDateString())       return `Today, ${time}`;
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + `, ${time}`;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CashDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const accountId = Number(id);

  const accounts = useApi<Account[]>("/api/finance/cash-accounts");
  const entries  = useApi<SpendingEntry[]>(`/api/finance/cash-spending?accountId=${accountId}`);
  const summary  = useApi<Summary>(`/api/finance/cash-spending/summary?accountId=${accountId}`);

  const [amount, setAmount]       = useState("");
  const [description, setDesc]    = useState("");
  const [category, setCategory]   = useState("Other");
  const [busy, setBusy]           = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const amtRef = useRef<HTMLInputElement>(null);
  useEffect(() => { amtRef.current?.focus(); }, []);

  const account  = (accounts.data ?? []).find((a) => a.id === accountId);
  const isLoading = accounts.loading || entries.loading;

  const refresh = () => Promise.all([entries.reload(), summary.reload()]);

  async function addEntry() {
    const amt = toAmount(amount);
    if (!amt || !description.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/finance/cash-spending", {
        cashAccountId: accountId,
        amount: amt,
        description: description.trim(),
        category: category.trim() || "Other",
      });
      setAmount("");
      setDesc("");
      setCategory("Other");
      amtRef.current?.focus();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save entry.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteEntry(entryId: number) {
    setError(null);
    try {
      await api.del(`/api/finance/cash-spending/${entryId}`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete entry.");
    }
  }

  // ── Not found ──────────────────────────────────────────────────────────────

  if (!accounts.loading && !account) {
    return (
      <>
        <div className="page-head">
          <h1>Account not found</h1>
          <FinanceNav />
        </div>
        <Empty title="Account not found">
          <button className="quiet" onClick={() => navigate("/finance/cash")}>← Back to Cash</button>
        </Empty>
      </>
    );
  }

  const s    = summary.data;
  const list = entries.data ?? [];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="page-head">
        <div className="cd-title-row">
          <button className="quiet cd-back" onClick={() => navigate("/finance/cash")}>←</button>
          <h1>{account?.name ?? "…"}</h1>
          {account?.currentBalance != null && (
            <span className="cd-balance">{dollars(account.currentBalance)}</span>
          )}
        </div>
        <FinanceNav />
      </div>

      <Notice>{error}</Notice>
      {isLoading && <Loading />}

      {/* ── Stat strip ── */}
      {s && (
        <div className="cd-stats">
          <div className="cd-stat">
            <span className="eyebrow">Today</span>
            <span className="cd-stat-fig">{dollars(s.today)}</span>
          </div>
          <div className="cd-stat">
            <span className="eyebrow">This week</span>
            <span className="cd-stat-fig">{dollars(s.thisWeek)}</span>
          </div>
          <div className="cd-stat">
            <span className="eyebrow">This month</span>
            <span className="cd-stat-fig">{dollars(s.thisMonth)}</span>
          </div>
        </div>
      )}

      {/* ── Category breakdown ── */}
      {s && s.byCategory.length > 0 && (
        <div className="cd-breakdown">
          <span className="eyebrow cd-breakdown-label">This month by category</span>
          {s.byCategory.map((row) => {
            const pct = s.thisMonth > 0 ? (row.total / s.thisMonth) * 100 : 0;
            return (
              <div key={row.category} className="cd-cat-row">
                <span className="cd-cat-name">{row.category}</span>
                <div className="cd-cat-bar-wrap">
                  <div className="cd-cat-bar" style={{ width: `${pct.toFixed(1)}%` }} />
                </div>
                <span className="cd-cat-amt">{dollars(row.total)}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Add entry form ── */}
      <div className="cd-add-form">
        <input
          ref={amtRef}
          className="cd-amt-input"
          inputMode="decimal"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addEntry()}
        />
        <input
          className="cd-desc-input"
          placeholder="What was it for?"
          value={description}
          onChange={(e) => setDesc(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addEntry()}
        />
        <input
          className="cd-cat-input"
          placeholder="Category"
          value={category}
          list="cd-cat-list"
          onChange={(e) => setCategory(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addEntry()}
        />
        <datalist id="cd-cat-list">
          {SUGGESTED.map((c) => <option key={c} value={c} />)}
        </datalist>
        <button
          className="primary"
          onClick={addEntry}
          disabled={busy || !amount.trim() || !description.trim()}
        >
          Log it
        </button>
      </div>

      {/* ── Entry list ── */}
      {!isLoading && list.length === 0 ? (
        <Empty title="No entries yet">
          <p>Log your first purchase above.</p>
        </Empty>
      ) : (
        <div className="cd-log">
          {list.map((entry) => (
            <div key={entry.id} className="cd-log-row">
              <span className="cd-log-time">{logTime(entry.loggedAt)}</span>
              <span className="cd-log-desc">{entry.description}</span>
              <span className="cd-log-cat">{entry.category}</span>
              <span className="cd-log-amt">{dollars(Number(entry.amount))}</span>
              <button
                className="quiet danger btn-icon cd-log-del"
                onClick={() => deleteEntry(entry.id)}
                aria-label="Delete entry"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
