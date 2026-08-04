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
  todaySpent: number;
  weekSpent:  number;
  monthSpent: number;
  byCategory: Array<{ category: string; total: number }>;
};

type ImportRow = {
  amount:      number;
  description: string;
  category:    string;
  loggedAt:    string; // ISO
  sourceHash:  string;
};

type ImportPreview = {
  rows:         ImportRow[];
  totalInFile:  number;
  skippedNoise: number;
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

// ── CSV parsing (Cash App export format) ─────────────────────────────────────

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let inQuotes = false;
  let cur = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === "," && !inQuotes) {
      result.push(cur); cur = "";
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

function parseCashAppDate(dateStr: string): string | null {
  // "2026-08-03 20:31:32 CDT" or "2026-08-03 20:31:32 CST"
  const m = dateStr.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) (CDT|CST)$/);
  if (!m) return null;
  const offset = m[2] === "CDT" ? "-05:00" : "-06:00";
  return new Date(`${m[1]}${offset}`).toISOString();
}

function categoryFromType(type: string): string {
  switch (type) {
    case "Cash Card":           return "Card";
    case "Cash App Pay Payment":return "App Pay";
    case "Deposits":            return "Deposit";
    case "P2P":                 return "Transfer";
    case "Withdrawal":          return "Cash Out";
    case "Overdraft":           return "Overdraft";
    case "Paper Money Deposit": return "Deposit";
    case "Borrow":              return "Loan";
    default:                    return "Other";
  }
}

const SKIP_TYPES = new Set([
  "Savings Internal Transfer",
  "Savings Interest Payment",
  "Account Notifications",
  "Bitcoin Buy", "Bitcoin Sell", "Bitcoin Deposit", "Bitcoin Withdrawal", "Bitcoin Payment",
  "Stock Buy", "Stock Dividends",
]);
const SKIP_STATUSES = new Set(["FAILED", "SENDER_CANCELED"]);
// Blank-type rows whose Note indicates internal transfers, not real spending
const SKIP_BLANK_NOTES = new Set(["Savings", "Borrowing in Cash App"]);

function parseCashAppCsv(text: string): ImportPreview {
  const lines = text.trim().split(/\r?\n/);
  const headers = parseCsvLine(lines[0]);
  const col = (row: string[], name: string) => {
    const i = headers.indexOf(name);
    return i >= 0 ? row[i] ?? "" : "";
  };

  const rows: ImportRow[] = [];
  let skippedNoise = 0;
  const totalInFile = lines.length - 1;

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = parseCsvLine(lines[i]);
    const type    = col(cells, "Transaction Type");
    const status  = col(cells, "Status");
    const notes   = col(cells, "Notes");
    const netAmt  = col(cells, "Net Amount");
    const date    = col(cells, "Date");

    // Filter noise
    if (SKIP_STATUSES.has(status))       { skippedNoise++; continue; }
    if (SKIP_TYPES.has(type))            { skippedNoise++; continue; }
    if (!type && SKIP_BLANK_NOTES.has(notes)) { skippedNoise++; continue; }

    // Parse amount (strip "$", handle "-$12.36")
    const amount = parseFloat(netAmt.replace(/[$,]/g, ""));
    if (isNaN(amount) || amount === 0)   { skippedNoise++; continue; }

    const loggedAt = parseCashAppDate(date);
    if (!loggedAt)                       { skippedNoise++; continue; }

    rows.push({
      amount,
      description: notes || type || "Unknown",
      category:    categoryFromType(type),
      loggedAt,
      sourceHash:  `${date}|${netAmt}|${notes}|${type}`,
    });
  }

  return { rows, totalInFile, skippedNoise };
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
  accountId:   number;
  accountName: string;
  onClose:     () => void;
}

export default function SpendingLogModal({ accountId, accountName, onClose }: Props) {
  const entries = useApi<SpendingEntry[]>(`/api/finance/cash-spending?accountId=${accountId}`);
  const summary  = useApi<Summary>(`/api/finance/cash-spending/summary?accountId=${accountId}`);

  // ── Manual entry state ──────────────────────────────────────────────────────
  const [sign, setSign]         = useState<"+" | "-">("-");
  const [amount, setAmount]     = useState("");
  const [description, setDesc]  = useState("");
  const [category, setCategory] = useState("");
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState<string | null>(null);

  // ── Import state ─────────────────────────────────────────────────────────────
  const [importPreview,  setImportPreview]  = useState<ImportPreview | null>(null);
  const [importResult,   setImportResult]   = useState<{ imported: number; duplicates: number } | null>(null);
  const [importing,      setImporting]      = useState(false);

  const amtRef     = useRef<HTMLInputElement>(null);
  const fileRef    = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => { amtRef.current?.focus(); }, []);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (importPreview) { setImportPreview(null); return; }
        onClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, importPreview]);

  const refresh = useCallback(
    () => Promise.all([entries.reload(), summary.reload()]),
    [entries, summary],
  );

  // Running balance = live sum of all entry amounts
  const currentBalance = (entries.data ?? []).reduce(
    (s, e) => s + Number(e.amount), 0,
  );
  const balColor =
    currentBalance > 0 ? "#5de8a0"
    : currentBalance < 0 ? "var(--stamp)"
    : "var(--ink-faint)";

  const knownCats = [...new Set((entries.data ?? []).map((e) => e.category))]
    .filter(Boolean).sort();

  // ── Manual add ───────────────────────────────────────────────────────────────

  async function addEntry() {
    const rawAmt = Math.abs(toAmount(amount));
    if (!rawAmt || !description.trim()) return;
    const signedAmt = sign === "-" ? -rawAmt : rawAmt;
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/finance/cash-spending", {
        cashAccountId: accountId,
        amount: signedAmt,
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

  // ── CSV import ────────────────────────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportResult(null);
    setError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const preview = parseCashAppCsv(text);
      setImportPreview(preview);
    };
    reader.readAsText(file);
    e.target.value = ""; // allow re-selecting same file
  }

  async function confirmImport() {
    if (!importPreview) return;
    setImporting(true);
    setError(null);
    try {
      const result = await api.post("/api/finance/cash-spending/import", {
        cashAccountId: accountId,
        rows: importPreview.rows,
      }) as { imported: number; duplicates: number };
      setImportResult(result);
      setImportPreview(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────────

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

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div
      className="sl-overlay"
      ref={overlayRef}
      onMouseDown={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="sl-modal" role="dialog" aria-modal="true" aria-label={`${accountName} spending log`}>

        {/* Header */}
        <div className="sl-header">
          <div className="sl-header-left">
            <span className="sl-header-name">{accountName}</span>
            <span className="sl-header-bal" style={{ color: balColor }}>
              {dollars(currentBalance)}
            </span>
          </div>
          <div className="sl-header-actions">
            {/* Import CSV button */}
            <label className="quiet sl-import-label" title="Import Cash App CSV">
              Import CSV
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                style={{ display: "none" }}
                onChange={handleFileChange}
              />
            </label>
            <button className="quiet btn-icon" onClick={onClose} aria-label="Close">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Import preview bar */}
        {importPreview && (
          <div className="sl-import-bar">
            <span className="sl-import-info">
              <strong>{importPreview.rows.length.toLocaleString()}</strong> transactions ready
              <span className="sl-import-noise"> · {importPreview.skippedNoise.toLocaleString()} savings/noise rows filtered</span>
            </span>
            <div className="sl-import-bar-actions">
              <button
                className="quiet"
                onClick={() => setImportPreview(null)}
                disabled={importing}
              >
                Cancel
              </button>
              <button
                className="primary"
                onClick={confirmImport}
                disabled={importing || importPreview.rows.length === 0}
              >
                {importing ? "Importing…" : "Import"}
              </button>
            </div>
          </div>
        )}

        {/* Import result toast */}
        {importResult && (
          <div className="sl-import-result">
            ✓ Imported <strong>{importResult.imported.toLocaleString()}</strong> transactions
            {importResult.duplicates > 0 && (
              <span className="sl-import-dupe"> · {importResult.duplicates.toLocaleString()} already existed (skipped)</span>
            )}
            <button
              className="quiet btn-icon sl-import-result-dismiss"
              onClick={() => setImportResult(null)}
            >×</button>
          </div>
        )}

        {/* Spending stats */}
        <div className="sl-stats">
          <div className="sl-stat">
            <span className="eyebrow">Spent today</span>
            <span className="sl-stat-fig">{s ? dollars(s.todaySpent) : "—"}</span>
          </div>
          <div className="sl-stat">
            <span className="eyebrow">This week</span>
            <span className="sl-stat-fig">{s ? dollars(s.weekSpent) : "—"}</span>
          </div>
          <div className="sl-stat">
            <span className="eyebrow">This month</span>
            <span className="sl-stat-fig">{s ? dollars(s.monthSpent) : "—"}</span>
          </div>
        </div>

        {/* Add entry form */}
        <div className="sl-add-form">
          <div className="sl-sign-toggle" role="group" aria-label="Entry type">
            <button
              type="button"
              className={`sl-sign-btn${sign === "-" ? " active expense" : ""}`}
              onClick={() => { setSign("-"); amtRef.current?.focus(); }}
            >
              − Expense
            </button>
            <button
              type="button"
              className={`sl-sign-btn${sign === "+" ? " active deposit" : ""}`}
              onClick={() => { setSign("+"); amtRef.current?.focus(); }}
            >
              + Deposit
            </button>
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
          <button
            className="primary sl-log-btn"
            onClick={addEntry}
            disabled={busy || !amount.trim() || !description.trim()}
          >
            Log it
          </button>
        </div>

        {error && <p className="sl-error">{error}</p>}

        {/* Scrollable body */}
        <div className="sl-body">
          {entries.loading && <Loading />}

          {/* Category breakdown */}
          {s && s.byCategory.length > 0 && (
            <div className="sl-breakdown">
              <span className="eyebrow sl-breakdown-label">This month by category</span>
              {s.byCategory.map((row) => {
                const pct = s.monthSpent > 0 ? (row.total / s.monthSpent) * 100 : 0;
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
            <p className="sl-empty">No entries yet — import a CSV above or log your starting balance with + Deposit.</p>
          ) : (
            <div className="sl-log">
              {list.map((entry) => {
                const amt = Number(entry.amount);
                const isExpense = amt < 0;
                const c = tagColor(entry.category);
                return (
                  <div key={entry.id} className="sl-log-row">
                    <span className="sl-log-time">{logTime(entry.loggedAt)}</span>
                    <span className="sl-log-desc">{entry.description}</span>
                    <span className="sl-log-cat" style={{ background: c.bg, color: c.color }}>
                      {entry.category}
                    </span>
                    <span className="sl-log-amt" style={{ color: isExpense ? "var(--stamp)" : "#5de8a0" }}>
                      {isExpense ? `−${dollars(Math.abs(amt))}` : `+${dollars(amt)}`}
                    </span>
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
