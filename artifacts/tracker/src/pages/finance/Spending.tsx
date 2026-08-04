import { useCallback, useMemo, useRef, useState } from "react";
import { api, useApi } from "../../lib/api";
import { dollars, currentMonth, monthName, shortDate } from "../../lib/format";
import { Empty, Loading, MonthPicker, Notice, Panel } from "../../components/ui";
import FinanceNav from "./FinanceNav";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Upload = {
  id: number;
  originalFilename: string;
  month: string;
  rowCount: number;
  uploadedAt: string;
};

type Transaction = {
  id: number;
  uploadId: number;
  txnDate: string;
  merchant: string;
  amount: number;
  category: string;
  note: string;
};

type CategorySummary = {
  category: string;
  total: number;
  count: number;
};

type TrendPoint = {
  month: string;
  total: number;
  byCategory: Record<string, number>;
};

// ---------------------------------------------------------------------------
// Category colours — fixed palette so charts are consistent
// ---------------------------------------------------------------------------
const CATEGORY_COLORS: Record<string, string> = {
  "Food & Dining":  "#e57c5a",
  "Shopping":       "#cc8f7a",
  "Transportation": "#7acc9a",
  "Entertainment":  "#5ab8cc",
  "Utilities":      "#6890cc",
  "Housing":        "#9a7acc",
  "Healthcare":     "#cc7a9a",
  "Transfers":      "#ccb85a",
  "Insurance":      "#a0cc7a",
  "Other":          "#aaaaaa",
};

const ALL_CATEGORIES = Object.keys(CATEGORY_COLORS);

function categoryColor(cat: string): string {
  return CATEGORY_COLORS[cat] ?? "#aaaaaa";
}

// ---------------------------------------------------------------------------
// Spend summary bar chart (current month, by category)
// ---------------------------------------------------------------------------
function SpendingSummary({ summary }: { summary: CategorySummary[] }) {
  const expenses = summary.filter((s) => s.total > 0).sort((a, b) => b.total - a.total);
  if (expenses.length === 0) return null;

  const maxTotal = expenses[0].total;
  const grandTotal = expenses.reduce((s, c) => s + c.total, 0);

  return (
    <Panel title="Spending by category">
      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        {expenses.map((row) => (
          <div key={row.category} style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <div
              style={{
                width: "10rem",
                fontSize: "0.8125rem",
                color: "var(--text-muted)",
                flexShrink: 0,
                textAlign: "right",
              }}
            >
              {row.category}
            </div>
            <div
              style={{
                flex: 1,
                background: "var(--rule)",
                borderRadius: "3px",
                height: "12px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${(row.total / maxTotal) * 100}%`,
                  height: "100%",
                  background: categoryColor(row.category),
                  borderRadius: "3px",
                  transition: "width 0.3s ease",
                }}
              />
            </div>
            <div
              style={{
                width: "5rem",
                fontSize: "0.8125rem",
                textAlign: "right",
                fontFamily: "var(--fig)",
                flexShrink: 0,
              }}
            >
              {dollars(row.total)}
            </div>
            <div
              style={{
                width: "2rem",
                fontSize: "0.75rem",
                color: "var(--text-muted)",
                flexShrink: 0,
              }}
            >
              {row.count}×
            </div>
          </div>
        ))}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            borderTop: "1px solid var(--rule)",
            paddingTop: "0.4rem",
            marginTop: "0.2rem",
            fontSize: "0.875rem",
            fontFamily: "var(--fig)",
            gap: "1rem",
          }}
        >
          <span style={{ color: "var(--text-muted)" }}>Total</span>
          <span style={{ fontWeight: 600 }}>{dollars(grandTotal)}</span>
        </div>
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Month-over-month trend chart
// ---------------------------------------------------------------------------
function TrendChart({ trend }: { trend: TrendPoint[] }) {
  if (trend.length === 0) return null;

  const maxTotal = Math.max(...trend.map((p) => p.total), 1);

  return (
    <Panel title="Month-over-month trend">
      <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
        {trend.map((point) => {
          // Stacked segments ordered by amount desc
          const segments = Object.entries(point.byCategory)
            .filter(([, v]) => v > 0)
            .sort(([, a], [, b]) => b - a);

          return (
            <div key={point.month} style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              {/* Month label */}
              <div
                style={{
                  width: "3.5rem",
                  fontSize: "0.75rem",
                  color: "var(--ink-faint)",
                  fontFamily: "var(--fig)",
                  flexShrink: 0,
                  textAlign: "right",
                }}
              >
                {monthName(point.month).slice(0, 3)}
              </div>

              {/* Stacked bar */}
              <div
                style={{
                  flex: 1,
                  background: "var(--rule)",
                  borderRadius: "4px",
                  height: "14px",
                  overflow: "hidden",
                  display: "flex",
                }}
              >
                {segments.map(([cat, val]) => (
                  <div
                    key={cat}
                    title={`${cat}: ${dollars(val)}`}
                    style={{
                      width: `${(val / maxTotal) * 100}%`,
                      height: "100%",
                      background: categoryColor(cat),
                      transition: "width 0.35s ease",
                      flexShrink: 0,
                    }}
                  />
                ))}
              </div>

              {/* Total */}
              <div
                style={{
                  width: "5rem",
                  fontSize: "0.8125rem",
                  textAlign: "right",
                  fontFamily: "var(--fig)",
                  flexShrink: 0,
                }}
              >
                {dollars(point.total)}
              </div>
            </div>
          );
        })}

        {/* Category legend */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.5rem 1rem",
            paddingTop: "0.5rem",
            marginTop: "0.1rem",
            borderTop: "1px solid var(--rule)",
          }}
        >
          {ALL_CATEGORIES.filter((cat) =>
            trend.some((p) => p.byCategory[cat] > 0),
          ).map((cat) => (
            <div
              key={cat}
              style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.75rem", color: "var(--ink-faint)" }}
            >
              <div
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "2px",
                  background: categoryColor(cat),
                  flexShrink: 0,
                }}
              />
              {cat}
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Upload zone
// ---------------------------------------------------------------------------
function UploadZone({
  month,
  onUploaded,
}: {
  month: string;
  onUploaded: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [tab, setTab] = useState<"file" | "paste">("file");
  const [pasteText, setPasteText] = useState("");

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setUploading(true);
      try {
        const form = new FormData();
        form.append("file", file);
        form.append("month", month);
        await api.upload("/api/finance/statements/upload", form);
        onUploaded();
        setPasteText("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [month, onUploaded],
  );

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  const handlePasteSubmit = () => {
    const trimmed = pasteText.trim();
    if (!trimmed) return;
    const file = new File([trimmed], "paste.txt", { type: "text/plain" });
    void handleFile(file);
  };

  return (
    <div>
      {/* Tab row */}
      <div className="upload-tab-row">
        <button
          className={`upload-tab${tab === "file" ? " active" : ""}`}
          onClick={() => { setTab("file"); setError(null); }}
        >
          Upload file
        </button>
        <button
          className={`upload-tab${tab === "paste" ? " active" : ""}`}
          onClick={() => { setTab("paste"); setError(null); }}
        >
          Paste text
        </button>
      </div>

      {tab === "file" ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload bank statement"
          className={`spending-dropzone${dragging ? " drag-over" : ""}`}
          style={{ cursor: uploading ? "wait" : "pointer", margin: 0 }}
          onClick={() => !uploading && inputRef.current?.click()}
          onKeyDown={(e) => e.key === "Enter" && !uploading && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          {uploading ? (
            <span className="spending-dropzone-label">Parsing statement…</span>
          ) : (
            <>
              <div className="spending-dropzone-icon">⬆</div>
              <strong className="spending-dropzone-label">Drop a CSV or PDF bank statement</strong>
              <div className="spending-dropzone-sub">Chase, BofA, Capital One, Discover, and others</div>
              <div className="spending-dropzone-sub" style={{ opacity: 0.6 }}>or click to browse — also accepts .tsv and .txt</div>
            </>
          )}
        </div>
      ) : (
        <div className="upload-paste-wrap">
          <textarea
            className="upload-paste-textarea"
            placeholder={"Paste your statement text here…\n\nOpen your bank PDF, press Ctrl+A then Ctrl+C, and paste below.\nWorks with most bank PDF exports and CSV/TSV files."}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            disabled={uploading}
          />
          <button
            className="upload-paste-btn"
            onClick={handlePasteSubmit}
            disabled={uploading || !pasteText.trim()}
          >
            {uploading ? "Parsing…" : "Parse transactions"}
          </button>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".csv,.pdf,.tsv,.txt,text/csv,text/tab-separated-values,text/plain,application/pdf"
        style={{ display: "none" }}
        onChange={onInputChange}
      />
      <Notice>{error}</Notice>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Uploaded statements list
// ---------------------------------------------------------------------------
function UploadsList({
  uploads,
  onDelete,
}: {
  uploads: Upload[];
  onDelete: (id: number) => void;
}) {
  if (uploads.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
      {uploads.map((u) => (
        <div
          key={u.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            fontSize: "0.8125rem",
            color: "var(--text-muted)",
          }}
        >
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            📄 {u.originalFilename}
          </span>
          <span>{u.rowCount} transactions</span>
          <button
            type="button"
            className="quiet"
            aria-label={`Delete ${u.originalFilename}`}
            style={{ fontSize: "0.875rem", color: "var(--text-muted)", padding: "0.1rem 0.3rem" }}
            onClick={() => onDelete(u.id)}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Search + category filter bar
// ---------------------------------------------------------------------------
function FilterBar({
  search,
  onSearch,
  categoryFilter,
  onCategory,
  resultCount,
  totalCount,
}: {
  search: string;
  onSearch: (v: string) => void;
  categoryFilter: string;
  onCategory: (v: string) => void;
  resultCount: number;
  totalCount: number;
}) {
  return (
    <div className="spending-filter-bar">
      <input
        type="search"
        placeholder="Search merchant…"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        className="spending-filter-search"
      />
      <select
        value={categoryFilter}
        onChange={(e) => onCategory(e.target.value)}
        className="spending-filter-cat"
      >
        <option value="">All categories</option>
        {ALL_CATEGORIES.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
      {(search || categoryFilter) && (
        <span className="spending-filter-count">
          {resultCount} of {totalCount}
        </span>
      )}
      {(search || categoryFilter) && (
        <button
          type="button"
          className="quiet"
          onClick={() => { onSearch(""); onCategory(""); }}
          style={{ fontSize: "0.8125rem", color: "var(--ink-faint)", padding: "0.1rem 0.4rem" }}
        >
          Clear
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Category cell (inline select)
// ---------------------------------------------------------------------------
function CategoryCell({
  txnId,
  category,
  onChange,
}: {
  txnId: number;
  category: string;
  onChange: (id: number, cat: string) => void;
}) {
  const [saving, setSaving] = useState(false);

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const cat = e.target.value;
    setSaving(true);
    try {
      await api.patch(`/api/finance/spending/transactions/${txnId}`, { category: cat });
      onChange(txnId, cat);
    } catch {
      // silently revert by not calling onChange
    } finally {
      setSaving(false);
    }
  };

  return (
    <select
      value={category}
      onChange={handleChange}
      disabled={saving}
      aria-label="Category"
      style={{
        fontSize: "0.75rem",
        padding: "0.1rem 0.2rem",
        borderRadius: "3px",
        border: "1px solid var(--rule-strong)",
        background: "transparent",
        color: categoryColor(category),
        fontWeight: 500,
        cursor: "pointer",
        maxWidth: "9rem",
      }}
    >
      {ALL_CATEGORIES.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );
}

// ---------------------------------------------------------------------------
// Transaction table
// ---------------------------------------------------------------------------
function TransactionTable({
  transactions,
  onCategoryChange,
}: {
  transactions: Transaction[];
  onCategoryChange: (id: number, cat: string) => void;
}) {
  if (transactions.length === 0) {
    return (
      <Empty title="No transactions">
        Upload a bank statement above to see your spending.
      </Empty>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--rule-strong)", textAlign: "left" }}>
            <th style={{ padding: "0.4rem 0.5rem", fontWeight: 500, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
              Date
            </th>
            <th style={{ padding: "0.4rem 0.5rem", fontWeight: 500, color: "var(--text-muted)" }}>
              Merchant
            </th>
            <th style={{ padding: "0.4rem 0.5rem", fontWeight: 500, color: "var(--text-muted)", textAlign: "right" }}>
              Amount
            </th>
            <th style={{ padding: "0.4rem 0.5rem", fontWeight: 500, color: "var(--text-muted)" }}>
              Category
            </th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t) => (
            <tr
              key={t.id}
              style={{ borderBottom: "1px solid var(--rule)" }}
            >
              <td
                style={{
                  padding: "0.35rem 0.5rem",
                  color: "var(--text-muted)",
                  fontFamily: "var(--fig)",
                  fontSize: "0.8125rem",
                  whiteSpace: "nowrap",
                }}
              >
                {shortDate(t.txnDate)}
              </td>
              <td style={{ padding: "0.35rem 0.5rem", maxWidth: "16rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {t.merchant}
              </td>
              <td
                style={{
                  padding: "0.35rem 0.5rem",
                  textAlign: "right",
                  fontFamily: "var(--fig)",
                  color: t.amount < 0 ? "var(--positive, #5fc97a)" : undefined,
                  whiteSpace: "nowrap",
                }}
              >
                {t.amount < 0 ? `+${dollars(-t.amount)}` : dollars(t.amount)}
              </td>
              <td style={{ padding: "0.35rem 0.5rem" }}>
                <CategoryCell
                  txnId={t.id}
                  category={t.category}
                  onChange={onCategoryChange}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function Spending() {
  const [month, setMonth] = useState(currentMonth);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  const {
    data: uploads,
    loading: uploadsLoading,
    error: uploadsError,
    reload: reloadUploads,
  } = useApi<Upload[]>(`/api/finance/statements?month=${month}`, [month]);

  const {
    data: transactions,
    loading: txnsLoading,
    error: txnsError,
    reload: reloadTxns,
    setData: setTransactions,
  } = useApi<Transaction[]>(`/api/finance/spending/transactions?month=${month}`, [month]);

  const {
    data: summary,
    loading: summaryLoading,
    reload: reloadSummary,
  } = useApi<CategorySummary[]>(`/api/finance/spending/summary?month=${month}`, [month]);

  const {
    data: trend,
    loading: trendLoading,
    reload: reloadTrend,
  } = useApi<TrendPoint[]>(`/api/finance/spending/trend?months=6`, []);

  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Filtered transactions (client-side, no API call)
  const filteredTransactions = useMemo(() => {
    if (!transactions) return null;
    const q = search.trim().toLowerCase();
    return transactions.filter((t) => {
      if (q && !t.merchant.toLowerCase().includes(q)) return false;
      if (categoryFilter && t.category !== categoryFilter) return false;
      return true;
    });
  }, [transactions, search, categoryFilter]);

  const handleUploaded = useCallback(() => {
    void reloadUploads();
    void reloadTxns();
    void reloadSummary();
    void reloadTrend();
  }, [reloadUploads, reloadTxns, reloadSummary, reloadTrend]);

  const handleDelete = useCallback(
    async (id: number) => {
      setDeleteError(null);
      try {
        await api.del(`/api/finance/statements/${id}`);
        void reloadUploads();
        void reloadTxns();
        void reloadSummary();
        void reloadTrend();
      } catch (err) {
        setDeleteError(err instanceof Error ? err.message : "Delete failed");
      }
    },
    [reloadUploads, reloadTxns, reloadSummary, reloadTrend],
  );

  const handleCategoryChange = useCallback(
    (id: number, cat: string) => {
      setTransactions((prev) =>
        prev
          ? prev.map((t) => (t.id === id ? { ...t, category: cat } : t))
          : prev,
      );
      void reloadSummary();
      void reloadTrend();
    },
    [setTransactions, reloadSummary, reloadTrend],
  );

  const loading = uploadsLoading || txnsLoading || summaryLoading;

  return (
    <div className="page">
      <FinanceNav />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
        <MonthPicker month={month} onChange={setMonth} />
      </div>

      <Notice>{uploadsError ?? txnsError ?? deleteError}</Notice>

      {/* Upload panel */}
      <Panel
        title="Upload statement"
        action={
          uploads && uploads.length > 0 ? (
            <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
              {uploads.length} file{uploads.length > 1 ? "s" : ""}
            </span>
          ) : undefined
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <UploadZone month={month} onUploaded={handleUploaded} />
          {uploads && uploads.length > 0 && (
            <UploadsList uploads={uploads} onDelete={handleDelete} />
          )}
        </div>
      </Panel>

      {loading && <Loading />}

      {/* Spending by category chart */}
      {!summaryLoading && summary && summary.length > 0 && (
        <SpendingSummary summary={summary} />
      )}

      {/* Month-over-month trend */}
      {!trendLoading && trend && trend.length > 0 && (
        <TrendChart trend={trend} />
      )}

      {/* Transaction table */}
      {!txnsLoading && transactions !== null && (
        <Panel
          title={
            filteredTransactions && filteredTransactions.length !== transactions.length
              ? `${filteredTransactions.length} of ${transactions.length} transactions`
              : transactions.length > 0
              ? `${transactions.length} transaction${transactions.length > 1 ? "s" : ""}`
              : "Transactions"
          }
          bodyless
        >
          {transactions.length > 0 && (
            <div style={{ padding: "0.6rem 1rem 0" }}>
              <FilterBar
                search={search}
                onSearch={setSearch}
                categoryFilter={categoryFilter}
                onCategory={setCategoryFilter}
                resultCount={filteredTransactions?.length ?? 0}
                totalCount={transactions.length}
              />
            </div>
          )}
          <TransactionTable
            transactions={filteredTransactions ?? []}
            onCategoryChange={handleCategoryChange}
          />
        </Panel>
      )}
    </div>
  );
}
