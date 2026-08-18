import { useState, useRef, useEffect, useCallback, type JSX } from "react";
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
  notes: string | null;
  loggedAt: string;
};

type CatRow = { category: string; total: number };

type Summary = {
  todaySpent: number;
  weekSpent:  number;
  monthSpent: number;
  todayByCategory: CatRow[];
  weekByCategory:  CatRow[];
  monthByCategory: CatRow[];
};

// ── Category tag colours (hash-stable) ───────────────────────────────────────

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

type StatPeriod = "today" | "week" | "month";
const PERIOD_LABEL: Record<StatPeriod, string> = {
  today: "Today",
  week:  "This week",
  month: "This month",
};

// ── SVG Donut Chart ───────────────────────────────────────────────────────────

const DONUT_R  = 38;
const DONUT_CX = 56;
const DONUT_CY = 56;
const DONUT_CIRC = 2 * Math.PI * DONUT_R;

function DonutChart({ rows, total }: { rows: CatRow[]; total: number }) {
  if (total === 0 || rows.length === 0) {
    return (
      <svg viewBox="0 0 112 112" className="sl-donut" aria-hidden>
        <circle cx={DONUT_CX} cy={DONUT_CY} r={DONUT_R}
          fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="16" />
        <text x={DONUT_CX} y={DONUT_CY + 5} textAnchor="middle"
          fill="var(--ink-faint)" fontSize="10">no data</text>
      </svg>
    );
  }

  const slices: JSX.Element[] = [];
  let offset = -DONUT_CIRC * 0.25; // start at 12 o'clock

  rows.forEach((row) => {
    const frac = row.total / total;
    const dash = frac * DONUT_CIRC;
    const { color } = tagColor(row.category);
    const rotDeg = (offset / DONUT_CIRC) * 360;
    slices.push(
      <circle
        key={row.category}
        cx={DONUT_CX} cy={DONUT_CY} r={DONUT_R}
        fill="none"
        stroke={color}
        strokeWidth="16"
        strokeDasharray={`${dash} ${DONUT_CIRC - dash}`}
        strokeDashoffset={0}
        transform={`rotate(${rotDeg} ${DONUT_CX} ${DONUT_CY})`}
        opacity="0.85"
      />
    );
    offset += dash;
  });

  return (
    <svg viewBox="0 0 112 112" className="sl-donut" aria-hidden>
      <circle cx={DONUT_CX} cy={DONUT_CY} r={DONUT_R}
        fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="16" />
      {slices}
    </svg>
  );
}

// ── Analytics Overlay ─────────────────────────────────────────────────────────

function AnalyticsOverlay({
  summary,
  onClose,
}: {
  summary: Summary | null;
  onClose: () => void;
}) {
  const [period, setPeriod] = useState<StatPeriod>("month");

  const total = summary
    ? period === "today" ? summary.todaySpent
    : period === "week"  ? summary.weekSpent
    : summary.monthSpent
    : 0;

  const cats: CatRow[] = (() => {
    if (!summary) return [];
    if (period === "today") return summary.todayByCategory ?? [];
    if (period === "week")  return summary.weekByCategory  ?? [];
    return summary.monthByCategory ?? [];
  })();

  const grandTotal = cats.reduce((s, c) => s + c.total, 0);

  return (
    <div className="sl-analytics-overlay" onClick={(e) => e.stopPropagation()}>

      {/* Header */}
      <div className="sl-analytics-hdr">
        <span className="sl-analytics-title">Spending analysis</span>
        <button className="quiet btn-icon" onClick={onClose} aria-label="Close analysis">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      {/* Period tabs */}
      <div className="sl-analytics-tabs" role="tablist">
        {(["today", "week", "month"] as StatPeriod[]).map((p) => (
          <button
            key={p}
            role="tab"
            aria-selected={period === p}
            className={`sl-analytics-tab${period === p ? " active" : ""}`}
            onClick={() => setPeriod(p)}
          >
            {PERIOD_LABEL[p]}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="sl-analytics-body">
        {!summary ? (
          <Loading />
        ) : (
          <>
            {/* Donut + total */}
            <div className="sl-analytics-chart-wrap">
              <DonutChart rows={cats} total={grandTotal} />
              <div className="sl-analytics-chart-centre">
                <span className="sl-analytics-chart-fig">{dollars(total)}</span>
                <span className="sl-analytics-chart-sub">spent</span>
              </div>
            </div>

            {/* Category rows */}
            {cats.length === 0 ? (
              <p className="sl-analytics-empty">No expenses {PERIOD_LABEL[period].toLowerCase()}.</p>
            ) : (
              <div className="sl-analytics-cats">
                {cats.map((row) => {
                  const pct = grandTotal > 0 ? Math.round((row.total / grandTotal) * 100) : 0;
                  const { color } = tagColor(row.category);
                  return (
                    <div key={row.category} className="sl-analytics-cat-row">
                      <span className="sl-analytics-cat-dot" style={{ background: color }} />
                      <span className="sl-analytics-cat-name">{row.category}</span>
                      <div className="sl-analytics-cat-bar-track">
                        <div
                          className="sl-analytics-cat-bar-fill"
                          style={{ width: `${pct}%`, background: color }}
                        />
                      </div>
                      <span className="sl-analytics-cat-pct">{pct}%</span>
                      <span className="sl-analytics-cat-amt">{dollars(row.total)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  accountId:   number;
  accountName: string;
  balance:     number;
  onClose:     () => void;
  onChanged?:  () => void;
}

export default function SpendingLogModal({ accountId, accountName, balance, onClose, onChanged }: Props) {
  const entries = useApi<SpendingEntry[]>(`/api/finance/cash-spending?accountId=${accountId}`);
  const summary  = useApi<Summary>(`/api/finance/cash-spending/summary?accountId=${accountId}`);

  const [sign, setSign]         = useState<"+" | "-">("-");
  const [amount, setAmount]     = useState("");
  const [description, setDesc]  = useState("");
  const [category, setCategory] = useState("");
  const [notes, setNotes]       = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState<string | null>(null);

  // Analytics overlay
  const [showAnalytics, setShowAnalytics] = useState(false);

  // Inline edit state
  type EditDraft = { sign: "+" | "-"; amount: string; desc: string; cat: string; notes: string };
  const [editingId, setEditingId]     = useState<number | null>(null);
  const [editDraft, setEditDraft]     = useState<EditDraft | null>(null);
  const [showEditNotes, setShowEditNotes] = useState(false);
  const [editBusy, setEditBusy]       = useState(false);

  const amtRef     = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showAnalytics) { setShowAnalytics(false); return; }
        if (editingId !== null) { setEditingId(null); setEditDraft(null); return; }
        onClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, showAnalytics, editingId]);

  const refresh = useCallback(
    () => Promise.all([entries.reload(), summary.reload()]),
    [entries, summary],
  );

  // Known categories for datalist autocomplete
  const knownCats = [...new Set((entries.data ?? []).map((e) => e.category))]
    .filter(Boolean).sort();

  // ── Add entry ──────────────────────────────────────────────────────────────

  async function addEntry() {
    const rawAmt = Math.abs(toAmount(amount));
    if (!rawAmt || !description.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/finance/cash-spending", {
        cashAccountId: accountId,
        amount: sign === "-" ? -rawAmt : rawAmt,
        description: description.trim(),
        category: category.trim() || "Other",
        notes: notes.trim() || undefined,
      });
      setSign("-");
      setAmount("");
      setDesc("");
      setCategory("");
      setNotes("");
      setShowNotes(false);
      amtRef.current?.focus();
      await refresh();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  // ── Edit ───────────────────────────────────────────────────────────────────

  function startEdit(entry: SpendingEntry) {
    const amt = Number(entry.amount);
    setEditingId(entry.id);
    setEditDraft({
      sign:   amt < 0 ? "-" : "+",
      amount: String(Math.abs(amt)),
      desc:   entry.description,
      cat:    entry.category,
      notes:  entry.notes ?? "",
    });
    setShowEditNotes(!!entry.notes);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft(null);
  }

  async function saveEdit() {
    if (!editDraft || !editingId) return;
    const rawAmt = Math.abs(toAmount(editDraft.amount));
    if (!rawAmt || !editDraft.desc.trim()) return;
    setEditBusy(true);
    setError(null);
    try {
      await api.patch(`/api/finance/cash-spending/${editingId}`, {
        amount:      editDraft.sign === "-" ? -rawAmt : rawAmt,
        description: editDraft.desc.trim(),
        category:    editDraft.cat.trim() || "Other",
        notes:       editDraft.notes.trim() || null,
      });
      cancelEdit();
      await refresh();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setEditBusy(false);
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  async function deleteEntry(id: number) {
    setError(null);
    try {
      await api.del(`/api/finance/cash-spending/${id}`);
      await refresh();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete.");
    }
  }

  const list = entries.data ?? [];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className="sl-overlay"
      ref={overlayRef}
      onMouseDown={(e) => {
        if (showAnalytics) return;
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="sl-modal" role="dialog" aria-modal="true" aria-label={`${accountName} spending log`}>

        {/* Header */}
        <div className="sl-header">
          <div className="sl-header-title">
            <span className="sl-header-name">{accountName}</span>
            <span className="sl-header-balance" style={{ color: balance >= 0 ? "var(--ink-faint)" : "var(--stamp)" }}>
              {dollars(balance)}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {/* Analytics button */}
            <button
              className="quiet sl-stats-btn"
              onClick={() => setShowAnalytics(true)}
              title="View spending analysis"
              aria-label="Spending analysis"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10"/>
                <line x1="12" y1="20" x2="12" y2="4"/>
                <line x1="6"  y1="20" x2="6"  y2="14"/>
              </svg>
            </button>
            <button className="quiet btn-icon" onClick={onClose} aria-label="Close">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Add form */}
        <div className="sl-add-form">
          <div className="sl-sign-toggle" role="group" aria-label="Entry type">
            <button
              type="button"
              className={`sl-sign-btn${sign === "-" ? " active expense" : ""}`}
              onClick={() => { setSign("-"); amtRef.current?.focus(); }}
            >−</button>
            <button
              type="button"
              className={`sl-sign-btn${sign === "+" ? " active deposit" : ""}`}
              onClick={() => { setSign("+"); amtRef.current?.focus(); }}
            >+</button>
          </div>
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
          {showNotes ? (
            <input
              autoFocus
              className="sl-notes-input"
              placeholder="Note…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addEntry()}
            />
          ) : (
            <button
              type="button"
              className="sl-notes-toggle"
              onClick={() => setShowNotes(true)}
            >+ note</button>
          )}
          <button
            className="primary sl-log-btn"
            onClick={addEntry}
            disabled={busy || !amount.trim() || !description.trim()}
          >
            Log it
          </button>
        </div>

        {error && <p className="sl-error">{error}</p>}

        {/* Entry list */}
        <div className="sl-body">
          {entries.loading && <Loading />}
          {!entries.loading && list.length === 0 ? (
            <p className="sl-empty">No entries yet.</p>
          ) : (
            <div className="sl-log">
              {list.slice(0, 25).map((entry) => {
                const amt = Number(entry.amount);
                const c = tagColor(entry.category);

                // ── Inline edit form ──────────────────────────────────────
                if (editingId === entry.id && editDraft) {
                  return (
                    <div key={entry.id} className="sl-edit-form">
                      <div className="sl-sign-toggle" role="group" aria-label="Entry type">
                        <button
                          type="button"
                          className={`sl-sign-btn${editDraft.sign === "-" ? " active expense" : ""}`}
                          onClick={() => setEditDraft({ ...editDraft, sign: "-" })}
                        >−</button>
                        <button
                          type="button"
                          className={`sl-sign-btn${editDraft.sign === "+" ? " active deposit" : ""}`}
                          onClick={() => setEditDraft({ ...editDraft, sign: "+" })}
                        >+</button>
                      </div>
                      <input
                        autoFocus
                        className="sl-amt-input"
                        inputMode="decimal"
                        placeholder="Amount"
                        value={editDraft.amount}
                        onChange={(e) => setEditDraft({ ...editDraft, amount: e.target.value })}
                        onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }}
                      />
                      <input
                        className="sl-desc-input"
                        placeholder="What was it for?"
                        value={editDraft.desc}
                        onChange={(e) => setEditDraft({ ...editDraft, desc: e.target.value })}
                        onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }}
                      />
                      <input
                        className="sl-cat-input"
                        placeholder="Category"
                        value={editDraft.cat}
                        list="sl-cat-list"
                        onChange={(e) => setEditDraft({ ...editDraft, cat: e.target.value })}
                        onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }}
                      />
                      {/* Save / Cancel */}
                      <button
                        className="primary sl-edit-save"
                        onClick={saveEdit}
                        disabled={editBusy || !editDraft.amount.trim() || !editDraft.desc.trim()}
                        aria-label="Save"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      </button>
                      <button
                        className="quiet btn-icon sl-edit-cancel"
                        onClick={cancelEdit}
                        aria-label="Cancel"
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                      </button>
                      {/* Notes row */}
                      {showEditNotes ? (
                        <input
                          className="sl-notes-input"
                          placeholder="Note…"
                          value={editDraft.notes}
                          onChange={(e) => setEditDraft({ ...editDraft, notes: e.target.value })}
                          onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }}
                        />
                      ) : (
                        <button
                          type="button"
                          className="sl-notes-toggle"
                          onClick={() => setShowEditNotes(true)}
                        >+ note</button>
                      )}
                    </div>
                  );
                }

                // ── Normal display row ────────────────────────────────────
                return (
                  <div key={entry.id} className="sl-log-row">
                    <span className="sl-log-time">{logTime(entry.loggedAt)}</span>
                    <span className="sl-log-desc">{entry.description}</span>
                    <span className="sl-log-cat" style={{ background: c.bg, color: c.color }}>
                      {entry.category}
                    </span>
                    <span className="sl-log-amt" style={{ color: amt < 0 ? "var(--stamp)" : "#5de8a0" }}>
                      {amt < 0 ? `−${dollars(Math.abs(amt))}` : `+${dollars(amt)}`}
                    </span>
                    <button
                      className="quiet btn-icon sl-log-edit"
                      onClick={() => startEdit(entry)}
                      aria-label="Edit"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2"
                        strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                    </button>
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
                    {entry.notes && (
                      <span className="sl-log-note">{entry.notes}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Analytics overlay (sits inside the modal) */}
        {showAnalytics && (
          <AnalyticsOverlay
            summary={summary.data}
            onClose={() => setShowAnalytics(false)}
          />
        )}

      </div>
    </div>
  );
}
