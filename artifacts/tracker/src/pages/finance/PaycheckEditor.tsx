import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, useApi } from "../../lib/api";
import { currentMonth, dollars } from "../../lib/format";
import {
  AllocBar,
  tagColor,
  MonthPicker,
  MoneyInput,
  Notice,
  Panel,
  SPENDING_COLOR,
} from "../../components/ui";

type Row = { key: string; amount: number; note: string };

type LoadedPaycheck = {
  id: number;
  month: string;
  seq: 1 | 2 | 3;
  amount: number;
  allocations: Array<{ amount: number; note: string }>;
};

const newKey = () => Math.random().toString(36).slice(2);
const blankRow = (): Row => ({ key: newKey(), amount: 0, note: "" });

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

export default function PaycheckEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const editing = Boolean(id);

  const existing = useApi<LoadedPaycheck>(editing ? `/api/finance/paychecks/${id}` : null);

  // For tag autocomplete — pull all unique notes from past paychecks
  const allPaychecks = useApi<Array<{ allocations: Array<{ note: string }> }>>(
    "/api/finance/paychecks",
  );
  const tagSuggestions = useMemo(() => {
    const seen = new Set<string>();
    for (const p of allPaychecks.data ?? [])
      for (const a of p.allocations)
        if (a.note.trim()) seen.add(a.note.trim());
    return [...seen].sort();
  }, [allPaychecks.data]);

  const [month, setMonth] = useState(currentMonth());
  const [amount, setAmount] = useState(0);
  const [seq, setSeq] = useState<1 | 2 | 3>(1);
  const [rows, setRows] = useState<Row[]>([blankRow()]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!existing.data) return;
    setMonth(existing.data.month);
    setAmount(existing.data.amount);
    setSeq(existing.data.seq);
    setRows(existing.data.allocations.map((a) => ({ key: newKey(), ...a })));
  }, [existing.data]);

  const totals = useMemo(() => {
    const allocated = rows.reduce((s, r) => s + r.amount, 0);
    return { allocated, remaining: amount - allocated };
  }, [rows, amount]);

  const update = (key: string, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const removeRow = (key: string) =>
    setRows((prev) => prev.filter((r) => r.key !== key));

  async function save() {
    setError(null);
    if (amount <= 0) { setError("Enter the paycheck amount before saving."); return; }
    setSaving(true);
    const payload = {
      month, seq, amount,
      allocations: rows.filter((r) => r.amount > 0).map((r) => ({
        amount: r.amount,
        note: r.note.trim(),
      })),
    };
    try {
      if (editing) await api.patch(`/api/finance/paychecks/${id}`, payload);
      else await api.post("/api/finance/paychecks", payload);
      navigate("/finance");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this paycheck.");
    } finally {
      setSaving(false);
    }
  }

  const remainderState =
    totals.remaining < -0.005 ? "over" : Math.abs(totals.remaining) < 0.005 ? "clear" : "open";

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Finance</span>
          <h1>{editing ? "Edit paycheck" : "Record a paycheck"}</h1>
        </div>
        <div className="button-row">
          <button className="btn-lg" onClick={() => navigate("/finance")} aria-label="Cancel">
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

          {/* Allocations */}
          <Panel
            title="Where it went"
            action={
              <button className="quiet btn-icon" onClick={() => setRows((r) => [...r, blankRow()])} aria-label="Add row">
                <IcPlus />
              </button>
            }
          >
            {/* Datalist powers the autocomplete on every note field */}
            <datalist id="alloc-tags">
              {tagSuggestions.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>

            {rows.length === 0 && (
              <p className="muted" style={{ margin: 0 }}>
                Nothing allocated yet — add a row.
              </p>
            )}

            {rows.map((row) => (
              <div className="alloc-row" key={row.key}>
                {/* Live colour dot — updates as you type the note */}
                <span
                  className="alloc-row-dot"
                  style={{ background: tagColor(row.note) }}
                  aria-hidden="true"
                />

                <input
                  aria-label="Note"
                  list="alloc-tags"
                  placeholder="What's it for?"
                  value={row.note}
                  onChange={(e) => update(row.key, { note: e.target.value })}
                />

                <MoneyInput
                  ariaLabel="Amount"
                  value={row.amount}
                  onChange={(n) => update(row.key, { amount: n })}
                />

                <button
                  className="quiet danger btn-icon"
                  onClick={() => removeRow(row.key)}
                  aria-label="Remove this allocation"
                >
                  <IcTrash />
                </button>
              </div>
            ))}
          </Panel>
        </div>

        {/* ── Right sidebar ────────────────────────────────────── */}
        <aside>
          <div className="tape">
            <div className="tape-total">
              <span className="eyebrow">Deposit</span>
              <span className="amount fig">{dollars(amount)}</span>
            </div>

            <AllocBar
              segments={rows
                .filter((r) => r.amount > 0)
                .map((r) => ({ amount: r.amount, color: tagColor(r.note) }))}
              total={amount}
              remainder={totals.remaining > 0.005 ? totals.remaining : undefined}
              height={34}
            />

            <div className="tape-legend">
              {rows
                .filter((r) => r.amount > 0)
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
