import { useRef, useState } from "react";
import { api, useApi } from "../../lib/api";
import { dollars } from "../../lib/format";
import { Loading, Empty } from "../../components/ui";
import FinanceNav from "./FinanceNav";

type Statement = {
  id: number;
  filename: string;
  uploadedAt: string;
  txCount: number;
};

type Transaction = {
  id: number;
  statementId: number;
  date: string;
  description: string;
  amountCents: number;
  category: string;
  notes: string | null;
};

const CATEGORIES = [
  "Fast Food", "Food Delivery", "Dining", "Groceries",
  "Gas", "Transport", "Shopping", "Entertainment",
  "Bills & Utilities", "Health", "Fitness", "Housing",
  "Transfer", "Other",
];

function fmt(date: string) {
  const [y, m, d] = date.split("-");
  return `${m}/${d}/${y}`;
}

function shortUploadDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ─── Category breakdown ──────────────────────────────────────────────

function CategoryBreakdown({ txns }: { txns: Transaction[] }) {
  const expenses = txns.filter((t) => t.amountCents < 0);
  const totals = new Map<string, number>();
  for (const t of expenses) {
    totals.set(t.category, (totals.get(t.category) ?? 0) + Math.abs(t.amountCents));
  }
  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const grand = sorted.reduce((s, [, v]) => s + v, 0);
  if (sorted.length === 0) return null;

  return (
    <div className="spending-breakdown">
      <h3 className="spending-breakdown-title">By Category</h3>
      {sorted.map(([cat, cents]) => {
        const pct = grand > 0 ? (cents / grand) * 100 : 0;
        return (
          <div key={cat} className="spending-cat-row">
            <span className="spending-cat-name">{cat}</span>
            <div className="spending-cat-bar-wrap">
              <div className="spending-cat-bar" style={{ width: `${pct}%` }} />
            </div>
            <span className="spending-cat-amt">{dollars(cents / 100)}</span>
          </div>
        );
      })}
      <div className="spending-cat-total">
        <span>Total spent</span>
        <span>{dollars(grand / 100)}</span>
      </div>
    </div>
  );
}

// ─── Transaction row ─────────────────────────────────────────────────

function TxRow({ tx, onUpdated }: { tx: Transaction; onUpdated: (t: Transaction) => void }) {
  const [editing, setEditing] = useState(false);
  const [cat, setCat] = useState(tx.category);
  const isExpense = tx.amountCents < 0;

  async function saveCat(next: string) {
    setCat(next);
    setEditing(false);
    const updated = await api.patch<Transaction>(`/api/finance/transactions/${tx.id}`, { category: next });
    onUpdated(updated);
  }

  return (
    <tr className="spending-tx-row">
      <td className="spending-tx-date">{fmt(tx.date)}</td>
      <td className="spending-tx-desc">{tx.description}</td>
      <td className="spending-tx-cat">
        {editing ? (
          <select
            className="spending-cat-select"
            value={cat}
            autoFocus
            onChange={(e) => void saveCat(e.target.value)}
            onBlur={() => setEditing(false)}
          >
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        ) : (
          <button className="spending-cat-pill" onClick={() => setEditing(true)}>
            {cat}
          </button>
        )}
      </td>
      <td className={`spending-tx-amt${isExpense ? " expense" : " credit"}`}>
        {isExpense ? "−" : "+"}{dollars(Math.abs(tx.amountCents) / 100)}
      </td>
    </tr>
  );
}

// ─── Main page ───────────────────────────────────────────────────────

export default function Spending() {
  const { data: statements, loading: stmtLoading, reload: reloadStmts } = useApi<Statement[]>("/api/finance/statements");
  const [selectedId, setSelectedId] = useState<number | "all">("all");
  const [txns, setTxns] = useState<Transaction[] | null>(null);
  const [txLoading, setTxLoading] = useState(false);
  const [catFilter, setCatFilter] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadTxns(stmtId: number | "all") {
    setSelectedId(stmtId);
    setTxLoading(true);
    setCatFilter("");
    try {
      const url = stmtId === "all"
        ? "/api/finance/transactions"
        : `/api/finance/transactions?statementId=${stmtId}`;
      setTxns(await api.get<Transaction[]>(url));
    } finally {
      setTxLoading(false);
    }
  }

  async function uploadFile(file: File) {
    setUploading(true);
    setUploadError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const stmt = await api.upload<Statement>("/api/finance/statements/upload", form);
      await reloadStmts();
      await loadTxns(stmt.id);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function deleteStatement(id: number) {
    await api.del(`/api/finance/statements/${id}`);
    await reloadStmts();
    if (selectedId === id) { setSelectedId("all"); setTxns(null); }
  }

  function txUpdated(updated: Transaction) {
    setTxns((prev) => prev?.map((t) => t.id === updated.id ? updated : t) ?? prev);
  }

  const visibleTxns = catFilter
    ? (txns ?? []).filter((t) => t.category === catFilter)
    : (txns ?? []);

  const availableCats = txns
    ? [...new Set(txns.map((t) => t.category))].sort()
    : [];

  return (
    <div className="finance-page">
      <FinanceNav />

      {/* ── Upload zone ── */}
      <div
        className={`spending-dropzone${dragOver ? " drag-over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files[0];
          if (f) void uploadFile(f);
        }}
        onClick={() => fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.csv,.txt"
          className="spending-file-input"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadFile(f); }}
        />
        {uploading ? (
          <span className="spending-dropzone-label">Parsing…</span>
        ) : (
          <>
            <span className="spending-dropzone-icon">↑</span>
            <span className="spending-dropzone-label">Drop a bank CSV or PDF statement here</span>
            <span className="spending-dropzone-sub">or click to browse</span>
          </>
        )}
      </div>
      {uploadError && <p className="spending-upload-error">{uploadError}</p>}

      {/* ── Statement list ── */}
      {stmtLoading && <Loading />}
      {!stmtLoading && statements && statements.length > 0 && (
        <div className="spending-stmt-list">
          {statements.map((s) => (
            <div
              key={s.id}
              className={`spending-stmt-chip${selectedId === s.id ? " selected" : ""}`}
              onClick={() => void loadTxns(s.id)}
            >
              <span className="spending-stmt-name">{s.filename}</span>
              <span className="spending-stmt-meta">{s.txCount} txns · {shortUploadDate(s.uploadedAt)}</span>
              <button
                className="spending-stmt-del"
                title="Remove"
                onClick={(e) => { e.stopPropagation(); void deleteStatement(s.id); }}
              >×</button>
            </div>
          ))}
        </div>
      )}

      {/* ── Transactions + breakdown ── */}
      {txLoading && <Loading />}
      {!txLoading && txns !== null && (
        txns.length === 0
          ? <Empty>No transactions in this statement.</Empty>
          : (
            <div className="spending-content">
              <CategoryBreakdown txns={txns} />

              <div className="spending-table-wrap">
                {/* filter bar */}
                <div className="spending-filter-bar">
                  <span className="spending-filter-label">{visibleTxns.length} transactions</span>
                  <select
                    className="spending-cat-filter"
                    value={catFilter}
                    onChange={(e) => setCatFilter(e.target.value)}
                  >
                    <option value="">All categories</option>
                    {availableCats.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <table className="spending-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Description</th>
                      <th>Category</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleTxns.map((t) => (
                      <TxRow key={t.id} tx={t} onUpdated={txUpdated} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
      )}

      {!txLoading && txns === null && statements && statements.length > 0 && (
        <Empty>Select a statement above to view transactions.</Empty>
      )}
    </div>
  );
}
