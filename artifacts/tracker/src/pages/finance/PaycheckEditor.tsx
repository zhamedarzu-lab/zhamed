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

type Row = { key: string; amount: number; note: string; debtAccountId: number | null };
type ExtraRow = { key: string; amount: number; note: string };

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
const blankRow = (): Row => ({ key: newKey(), amount: 0, note: "", debtAccountId: null });
const blankExtraRow = (): ExtraRow => ({ key: newKey(), amount: 0, note: "" });

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

  // For tag autocomplete — pull all unique notes from past paychecks
  const allPaychecks = useApi<
    Array<{ allocations: Array<{ note: string }>; extraIncome: Array<{ note: string }> }>
  >("/api/finance/paychecks");
  const tagSuggestions = useMemo(() => {
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
  const [rows, setRows] = useState<Row[]>([blankRow()]);
  const [extraRows, setExtraRows] = useState<ExtraRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!existing.data) return;
    setMonth(existing.data.month);
    setAmount(existing.data.amount);
    setSeq(existing.data.seq);
    setRows(existing.data.allocations.map((a) => ({ key: newKey(), ...a })));
    setExtraRows(existing.data.extraIncome.map((e) => ({ key: newKey(), ...e })));
  }, [existing.data]);

  const totals = useMemo(() => {
    const allocated = rows.reduce((s, r) => s + r.amount, 0);
    const extra = extraRows.reduce((s, r) => s + r.amount, 0);
    const pool = amount + extra;
    return { allocated, extra, pool, remaining: pool - allocated };
  }, [rows, extraRows, amount]);

  const update = (key: string, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const removeRow = (key: string) =>
    setRows((prev) => prev.filter((r) => r.key !== key));

  const updateExtra = (key: string, patch: Partial<ExtraRow>) =>
    setExtraRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const removeExtraRow = (key: string) =>
    setExtraRows((prev) => prev.filter((r) => r.key !== key));

  async function save() {
    setError(null);
    if (amount <= 0) { setError("Enter the paycheck amount before saving."); return; }
    setSaving(true);
    const payload = {
      month, seq, amount,
      allocations: rows.filter((r) => r.amount > 0).map((r) => ({
        amount: r.amount,
        note: r.note.trim(),
        debtAccountId: r.debtAccountId,
      })),
      extraIncome: extraRows.filter((r) => r.amount > 0).map((r) => ({
        amount: r.amount,
        note: r.note.trim(),
      })),
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

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Finance</span>
          <h1>{editing ? "Edit paycheck" : "Record a paycheck"}</h1>
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

            {rows.map((row) => {
              const linkedCard = cards.find((c) => c.id === row.debtAccountId);
              return (
                <div className="alloc-row" key={row.key}>
                  <div className="alloc-row-main">
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
                      className="alloc-amount"
                      value={row.amount}
                      onChange={(n) => update(row.key, { amount: n })}
                    />
                  </div>

                  <div className="alloc-row-meta">
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
                          update(row.key, {
                            debtAccountId: val,
                            note: !row.note.trim() && card ? card.name : row.note,
                          });
                        }}
                      >
                        <option value="">No card</option>
                        {cards.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </label>

                    <button
                      className="quiet danger btn-icon"
                      onClick={() => removeRow(row.key)}
                      aria-label="Remove this allocation"
                    >
                      <IcTrash />
                    </button>
                  </div>
                </div>
              );
            })}
          </Panel>

          {/* Extra income — a bill surplus, a refund, a gift: money added
              on top of the deposit rather than a slice taken out of it. */}
          <Panel
            title="Extra income"
            action={
              <button
                className="quiet btn-icon"
                onClick={() => setExtraRows((r) => [...r, blankExtraRow()])}
                aria-label="Add extra income"
              >
                <IcPlus />
              </button>
            }
          >
            <datalist id="extra-tags">
              {extraSuggestions.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>

            {extraRows.length === 0 && (
              <p className="muted" style={{ margin: 0 }}>
                Nothing extra this time — add a row for a bill surplus, refund, or gift.
              </p>
            )}

            {extraRows.map((row) => (
              <div className="income-row" key={row.key}>
                <span
                  className="alloc-row-dot"
                  style={{ background: EXTRA_INCOME_COLOR }}
                  aria-hidden="true"
                />

                <input
                  aria-label="Source"
                  list="extra-tags"
                  placeholder="Where'd it come from?"
                  value={row.note}
                  onChange={(e) => updateExtra(row.key, { note: e.target.value })}
                />

                <MoneyInput
                  ariaLabel="Amount"
                  className="alloc-amount"
                  value={row.amount}
                  onChange={(n) => updateExtra(row.key, { amount: n })}
                />

                <button
                  className="quiet danger btn-icon"
                  onClick={() => removeExtraRow(row.key)}
                  aria-label="Remove this extra income"
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
                .filter((r) => r.amount > 0)
                .map((r) => ({ amount: r.amount, color: tagColor(r.note) }))}
              total={totals.pool}
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
