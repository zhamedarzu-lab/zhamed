import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, useApi } from "../../lib/api";
import { currentMonth, dollars, signed } from "../../lib/format";
import {
  AllocBar,
  tagColor,
  EXTRA_INCOME_COLOR,
  MonthPicker,
  MoneyInput,
  Notice,
  Panel,
  SPENDING_COLOR,
} from "../../components/ui";

type RowKind = "alloc" | "extra";

type Row = {
  key: string;
  kind: RowKind;
  amount: number;
  note: string;
  debtAccountId: number | null;
};

type LoadedPaycheck = {
  id: number;
  month: string;
  seq: 1 | 2 | 3;
  amount: number;
  allocations: Array<{ amount: number; note: string; debtAccountId: number | null }>;
  extraIncome: Array<{ amount: number; note: string }>;
};

type Card = { id: number; name: string; active: boolean };

const newKey = () => Math.random().toString(36).slice(2);
const blankAlloc = (): Row => ({ key: newKey(), kind: "alloc", amount: 0, note: "", debtAccountId: null });
const blankExtra = (): Row => ({ key: newKey(), kind: "extra", amount: 0, note: "", debtAccountId: null });

const SEQ_LABELS: Record<number, string> = { 1: "1/2", 2: "2/2", 3: "3/2" };

/* ── Icon helpers ──────────────────────────────────────────────────── */
const IcBack = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M19 12H5"/><path d="M9 6l-6 6 6 6"/>
  </svg>
);
const IcCheck = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 12l5 5L20 6"/>
  </svg>
);
const IcPlus = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
    <path d="M12 5v14M5 12h14"/>
  </svg>
);
const IcTrash = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
  </svg>
);
const IcCard = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>
  </svg>
);

export default function PaycheckEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const editing = Boolean(id);

  const existing = useApi<LoadedPaycheck>(editing ? `/api/finance/paychecks/${id}` : null);

  // Autocomplete suggestions pulled from all past paychecks
  const allPaychecks = useApi<
    Array<{ allocations: Array<{ note: string }>; extraIncome: Array<{ note: string }> }>
  >("/api/finance/paychecks");

  const allocSuggestions = useMemo(() => {
    const seen = new Set<string>();
    for (const p of allPaychecks.data ?? [])
      for (const a of p.allocations)
        if (a.note.trim()) seen.add(a.note.trim());
    return [...seen].sort();
  }, [allPaychecks.data]);

  const extraSuggestions = useMemo(() => {
    const seen = new Set<string>();
    for (const p of allPaychecks.data ?? [])
      for (const e of p.extraIncome)
        if (e.note.trim()) seen.add(e.note.trim());
    return [...seen].sort();
  }, [allPaychecks.data]);

  const cardsApi = useApi<Card[]>("/api/finance/debt-accounts");
  const cards = (cardsApi.data ?? []).filter((c) => c.active);

  const [month, setMonth] = useState(currentMonth());
  const [amount, setAmount] = useState(0);
  const [seq, setSeq] = useState<1 | 2 | 3>(1);
  const [rows, setRows] = useState<Row[]>([blankAlloc()]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!existing.data) return;
    setMonth(existing.data.month);
    setAmount(existing.data.amount);
    setSeq(existing.data.seq);
    setRows([
      ...existing.data.allocations.map((a) => ({ key: newKey(), kind: "alloc" as RowKind, ...a })),
      ...existing.data.extraIncome.map((e) => ({ key: newKey(), kind: "extra" as RowKind, debtAccountId: null, ...e })),
    ]);
  }, [existing.data]);

  const totals = useMemo(() => {
    const allocated = rows.filter((r) => r.kind === "alloc").reduce((s, r) => s + r.amount, 0);
    const extra = rows.filter((r) => r.kind === "extra").reduce((s, r) => s + r.amount, 0);
    const pool = amount + extra;
    return { allocated, extra, pool, remaining: pool - allocated };
  }, [rows, amount]);

  const updateRow = (key: string, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const removeRow = (key: string) =>
    setRows((prev) => prev.filter((r) => r.key !== key));

  async function save() {
    setError(null);
    if (amount <= 0) { setError("Enter the paycheck amount before saving."); return; }
    setSaving(true);
    const payload = {
      month, seq, amount,
      allocations: rows
        .filter((r) => r.kind === "alloc" && r.amount > 0)
        .map((r) => ({ amount: r.amount, note: r.note.trim(), debtAccountId: r.debtAccountId })),
      extraIncome: rows
        .filter((r) => r.kind === "extra" && r.amount > 0)
        .map((r) => ({ amount: r.amount, note: r.note.trim() })),
    };
    try {
      if (editing) await api.patch(`/api/finance/paychecks/${id}`, payload);
      else await api.post("/api/finance/paychecks", payload);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this paycheck.");
    } finally {
      setSaving(false);
    }
  }

  const remainderState =
    totals.remaining < -0.005 ? "over" : Math.abs(totals.remaining) < 0.005 ? "clear" : "open";

  const dotColor = (row: Row) =>
    row.kind === "extra" ? EXTRA_INCOME_COLOR : tagColor(row.note);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{editing ? "Edit paycheck" : "It's payday"}</h1>
        </div>
        <div className="button-row">
          <button className="btn-lg" onClick={() => navigate("/")} aria-label="Cancel">
            <IcBack /> Cancel
          </button>
          <button className="primary btn-lg" onClick={save} disabled={saving} aria-label="Save">
            {saving ? "Saving…" : <><IcCheck /> {editing ? "Save changes" : "Save paycheck"}</>}
          </button>
        </div>
      </div>

      <Notice>{error}</Notice>

      <div className="editor-grid">
        {/* ── Left column ─────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>

          {/* Deposit meta — Month → Paycheck → Amount */}
          <div className="editor-deposit-bar">
            <div className="editor-deposit-field">
              <span className="field-label">Month</span>
              <MonthPicker month={month} onChange={setMonth} />
            </div>
            <div className="editor-deposit-field">
              <span className="field-label">Paycheck</span>
              <div className="segmented" role="group" aria-label="Which paycheck of the month">
                {([1, 2, 3] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={seq === n}
                    onClick={() => setSeq(n)}
                  >
                    {SEQ_LABELS[n]}
                  </button>
                ))}
              </div>
            </div>
            <div className="editor-deposit-field editor-deposit-amount">
              <span className="field-label">Amount</span>
              <MoneyInput value={amount} onChange={setAmount} autoFocus={!editing} />
            </div>
          </div>

          {/* Activity — allocations + extra income in one panel */}
          <Panel title="Activity">
            <datalist id="alloc-tags">
              {allocSuggestions.map((t) => <option key={t} value={t} />)}
            </datalist>
            <datalist id="extra-tags">
              {extraSuggestions.map((t) => <option key={t} value={t} />)}
            </datalist>

            {rows.map((row) => {
              const linkedCard = row.kind === "alloc"
                ? cards.find((c) => c.id === row.debtAccountId)
                : undefined;
              return (
                <div className="alloc-row" key={row.key}>
                  <span
                    className="alloc-row-dot"
                    style={{ background: dotColor(row) }}
                    aria-hidden="true"
                  />
                  <button
                    className="alloc-kind-toggle"
                    data-kind={row.kind}
                    onClick={() => updateRow(row.key, {
                      kind: row.kind === "alloc" ? "extra" : "alloc",
                      debtAccountId: null,
                    })}
                    aria-label={row.kind === "alloc" ? "Switch to incoming" : "Switch to outgoing"}
                    title={row.kind === "alloc" ? "Outgoing — click to switch to Incoming" : "Incoming — click to switch to Outgoing"}
                  >
                    {row.kind === "alloc" ? "Out" : "In"}
                  </button>
                  <input
                    aria-label={row.kind === "extra" ? "Source" : "Note"}
                    list={row.kind === "extra" ? "extra-tags" : "alloc-tags"}
                    placeholder={row.kind === "extra" ? "Incoming" : "Outgoing"}
                    value={row.note}
                    onChange={(e) => updateRow(row.key, { note: e.target.value })}
                  />
                  <MoneyInput
                    ariaLabel="Amount"
                    className="alloc-amount"
                    value={row.amount}
                    onChange={(n) => updateRow(row.key, { amount: n })}
                  />
                  {row.kind === "alloc" && cards.length > 0 && (
                    <label
                      className="alloc-card-picker"
                      data-linked={linkedCard ? "true" : "false"}
                      style={linkedCard ? { color: tagColor(linkedCard.name) } : undefined}
                    >
                      <IcCard />
                      <select
                        aria-label="Goes toward a card"
                        value={row.debtAccountId ?? ""}
                        onChange={(e) => {
                          const val = e.target.value ? Number(e.target.value) : null;
                          const card = cards.find((c) => c.id === val);
                          updateRow(row.key, {
                            debtAccountId: val,
                            note: card ? card.name : row.note,
                          });
                        }}
                      >
                        <option value="">No card</option>
                        {cards.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  <button
                    className="quiet danger btn-icon"
                    onClick={() => removeRow(row.key)}
                    aria-label="Remove row"
                  >
                    <IcTrash />
                  </button>
                </div>
              );
            })}

            <button
              className="alloc-add-btn"
              onClick={() => setRows((r) => [...r, blankAlloc()])}
            >
              <IcPlus /> Add
            </button>
          </Panel>
        </div>

        {/* ── Right sidebar ────────────────────────────────────── */}
        <aside>
          <div className="tape">
            <div className="tape-total">
              <div>
                <span className="eyebrow">Deposit</span>
                <span className="amount fig">{dollars(amount)}</span>
              </div>
              {totals.extra > 0.005 && (
                <div className="tape-extra">
                  <span className="eyebrow">Extra</span>
                  <span className="amount fig">{signed(totals.extra)}</span>
                </div>
              )}
            </div>

            <AllocBar
              segments={rows
                .filter((r) => r.kind === "alloc" && r.amount > 0)
                .map((r) => ({ amount: r.amount, color: tagColor(r.note) }))}
              total={totals.pool}
              remainder={totals.remaining > 0.005 ? totals.remaining : undefined}
              height={34}
            />

            <div className="tape-legend">
              {rows
                .filter((r) => r.kind === "alloc" && r.amount > 0)
                .map((r) => (
                  <div className="tape-legend-row" key={r.key}>
                    <span className="swatch" style={{ background: tagColor(r.note) }} />
                    <span className="label">{r.note || <em>Untitled</em>}</span>
                    <span className="value">{dollars(r.amount)}</span>
                  </div>
                ))}
              {totals.remaining > 0.005 && (
                <div className="tape-legend-row">
                  <span className="swatch" style={{ background: SPENDING_COLOR, opacity: 0.6 }} />
                  <span className="label">Spending</span>
                  <span className="value">{dollars(totals.remaining)}</span>
                </div>
              )}
            </div>

            <div className="tape-remainder" data-state={remainderState}>
              <span className="eyebrow">
                {remainderState === "over" ? "Over-allocated" : "Remaining"}
              </span>
              <span className="amount fig">{dollars(Math.abs(totals.remaining))}</span>
              {remainderState === "over" && (
                <span className="hint">You've assigned more than the deposit.</span>
              )}
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
