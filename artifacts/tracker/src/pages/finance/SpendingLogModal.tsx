import { useState, useRef, useEffect, useCallback } from "react";
import { api, useApi } from "../../lib/api";
import { dollars, toAmount } from "../../lib/format";
import { Loading } from "../../components/ui";

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── Category tag colours (hash-stable, dark-theme-friendly) ───────────────────

const TAG_PALETTE = [
  { bg: "rgba(93,232,160,0.13)",  color: "#5de8a0" },
  { bg: "rgba(192,132,252,0.13)", color: "#c084fc" },
  { bg: "rgba(251,146,60,0.13)",  color: "#fb923c" },
  { bg: "rgba(96,165,250,0.13)",  color: "#60a5fa" },
  { bg: "rgba(248,113,113,0.13)", color: "#f87171" },
  { bg: "rgba(163,230,53,0.13)",  color: "#a3e635" },
  { bg: "rgba(251,191,36,0.13)",  color: "#fbbf24" },
  { bg: "rgba(34,211,238,0.13)",  color: "#22d3ee" },
];

function tagColor(cat: string) {
  let h = 0;
  for (let i = 0; i < cat.length; i++) h = (h * 31 + cat.charCodeAt(i)) & 0xffff;
  return TAG_PALETTE[h % TAG_PALETTE.length];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  accountId: number;
  accountName: string;
  onClose: () => void;
}

export default function SpendingLogModal({ accountId, accountName, onClose }: Props) {
  const entries = useApi<SpendingEntry[]>(`/api/finance/cash-spending?accountId=${accountId}`);
  const summary  = useApi<Summary>(`/api/finance/cash-spending/summary?accountId=${accountId}`);

  const [amount, setAmount]     = useState("");
  const [description, setDesc]  = useState("");
  const [category, setCategory] = useState("");
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const amtRef     = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => { amtRef.current?.focus(); }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const refresh = useCallback(
    () => Promise.all([entries.reload(), summary.reload()]),
    [entries, summary],
  );

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
      setCategory("");
      amtRef.current?.focus();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteEntry(id: number) {
    setError(null);
    try {
      await api.del(`/api/finance/cash-spending/${id}`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete.");
    }
  }

  const s    = summary.data;
  const list = entries.data ?? [];

  // Collect known categories from existing entries for the datalist
  const knownCats = [...new Set(list.map((e) => e.category))].filter(Boolean).sort();

  return (
    <div
      className="sl-overlay"
      ref={overlayRef}
      onMouseDown={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="sl-modal" role="dialog" aria-modal="true" aria-label={`${accountName} spending log`}>

        {/* Header */}
        <div className="sl-header">
          <span className="sl-header-name">{accountName}</span>
          <button className="quiet btn-icon" onClick={onClose} aria-label="Close">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Stat strip */}
        <div className="sl-stats">
          <div className="sl-stat">
            <span className="eyebrow">Today</span>
            <span className="sl-stat-fig">{s ? dollars(s.today) : "—"}</span>
          </div>
          <div className="sl-stat">
            <span className="eyebrow">This week</span>
            <span className="sl-stat-fig">{s ? dollars(s.thisWeek) : "—"}</span>
          </div>
          <div className="sl-stat">
            <span className="eyebrow">This month</span>
            <span className="sl-stat-fig">{s ? dollars(s.thisMonth) : "—"}</span>
          </div>
        </div>

        {/* Add form */}
        <div className="sl-add-form">
          <input
            ref={amtRef}
            className="sl-amt-input"
            inputMode="decimal"
            placeholder="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addEntry()}
          />
          <input
            className="sl-desc-input"
            placeholder="What was it for?"
            value={description}
            onChange={(e) => setDesc(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addEntry()}
          />
          <input
            className="sl-cat-input"
            placeholder="Category"
            value={category}
            list="sl-cat-list"
            onChange={(e) => setCategory(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addEntry()}
          />
          <datalist id="sl-cat-list">
            {knownCats.map((c) => <option key={c} value={c} />)}
          </datalist>
          <button
            className="primary sl-log-btn"
            onClick={addEntry}
            disabled={busy || !amount.trim() || !description.trim()}
          >
            Log it
          </button>
        </div>

        {error && <p className="sl-error">{error}</p>}

        {/* Scrollable body: breakdown + entries */}
        <div className="sl-body">
          {entries.loading && <Loading />}

          {/* Category breakdown */}
          {s && s.byCategory.length > 0 && (
            <div className="sl-breakdown">
              <span className="eyebrow sl-breakdown-label">This month</span>
              {s.byCategory.map((row) => {
                const pct = s.thisMonth > 0 ? (row.total / s.thisMonth) * 100 : 0;
                const c = tagColor(row.category);
                return (
                  <div key={row.category} className="sl-cat-row">
                    <span className="sl-cat-tag" style={{ background: c.bg, color: c.color }}>
                      {row.category}
                    </span>
                    <div className="sl-cat-bar-wrap">
                      <div className="sl-cat-bar" style={{ width: `${pct.toFixed(1)}%`, background: c.color }} />
                    </div>
                    <span className="sl-cat-amt">{dollars(row.total)}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Entry list */}
          {!entries.loading && list.length === 0 ? (
            <p className="sl-empty">No entries yet — log your first purchase above.</p>
          ) : (
            <div className="sl-log">
              {list.map((entry) => {
                const c = tagColor(entry.category);
                return (
                  <div key={entry.id} className="sl-log-row">
                    <span className="sl-log-time">{logTime(entry.loggedAt)}</span>
                    <span className="sl-log-desc">{entry.description}</span>
                    <span
                      className="sl-log-cat"
                      style={{ background: c.bg, color: c.color }}
                    >
                      {entry.category}
                    </span>
                    <span className="sl-log-amt">{dollars(Number(entry.amount))}</span>
                    <button
                      className="quiet danger btn-icon sl-log-del"
                      onClick={() => deleteEntry(entry.id)}
                      aria-label="Delete"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2"
                        strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 6L6 18M6 6l12 12"/>
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
