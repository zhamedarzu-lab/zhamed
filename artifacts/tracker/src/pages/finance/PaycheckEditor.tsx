import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, useApi } from "../../lib/api";
import { currentMonth, dollars } from "../../lib/format";
import { Field, MonthPicker, MoneyInput, Notice, Panel } from "../../components/ui";

type Row = {
  key: string;
  amount: number;
  note: string;
};

type LoadedPaycheck = {
  id: number;
  month: string;
  seq: 1 | 2 | 3;
  amount: number;
  allocations: Array<{ amount: number; note: string }>;
};

const newKey = () => Math.random().toString(36).slice(2);

const blankRow = (): Row => ({ key: newKey(), amount: 0, note: "" });

export default function PaycheckEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const editing = Boolean(id);

  const existing = useApi<LoadedPaycheck>(editing ? `/api/finance/paychecks/${id}` : null);

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
    setRows(
      existing.data.allocations.map((a) => ({
        key: newKey(),
        amount: a.amount,
        note: a.note,
      })),
    );
  }, [existing.data]);

  const totals = useMemo(() => {
    const allocated = rows.reduce((s, r) => s + r.amount, 0);
    return { allocated, remaining: amount - allocated };
  }, [rows, amount]);

  const update = (key: string, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const removeRow = (key: string) => setRows((prev) => prev.filter((r) => r.key !== key));

  async function save() {
    setError(null);
    if (amount <= 0) {
      setError("Enter the paycheck amount before saving.");
      return;
    }
    setSaving(true);
    const payload = {
      month,
      seq,
      amount,
      allocations: rows
        .filter((r) => r.amount > 0)
        .map((r) => ({ amount: r.amount, note: r.note.trim() })),
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

  const allocatedPct = amount > 0 ? Math.min(100, (totals.allocated / amount) * 100) : 0;

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Finance</span>
          <h1>{editing ? "Edit paycheck" : "Record a paycheck"}</h1>
          <p>Enter the deposit, then give each piece of it an amount and a note.</p>
        </div>
        <div className="button-row">
          <button onClick={() => navigate("/finance")}>Cancel</button>
          <button className="primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : editing ? "Save changes" : "Save paycheck"}
          </button>
        </div>
      </div>

      <Notice>{error}</Notice>

      <div className="editor-grid">
        <div className="grid" style={{ gap: "1rem", alignContent: "start" }}>
          <Panel title="The deposit">
            <div className="grid grid-3" style={{ gap: "0.75rem" }}>
              <Field label="Month">
                <MonthPicker month={month} onChange={setMonth} />
              </Field>
              <Field label="Amount">
                <MoneyInput value={amount} onChange={setAmount} autoFocus={!editing} />
              </Field>
              <Field label="Which paycheck">
                <div className="segmented" role="group" aria-label="Which paycheck of the month">
                  {([1, 2, 3] as const).map((n) => (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={seq === n}
                      onClick={() => setSeq(n)}
                    >
                      {n}
                      {n === 1 ? "st" : n === 2 ? "nd" : "rd"}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
          </Panel>

          <Panel
            title="Allocations"
            action={
              <button className="quiet" onClick={() => setRows((r) => [...r, blankRow()])}>
                + Add
              </button>
            }
          >
            {rows.length === 0 && (
              <p className="muted" style={{ margin: 0 }}>
                Nothing allocated yet. Add a row.
              </p>
            )}

            {rows.map((row) => (
              <div className="alloc-row" key={row.key}>
                <MoneyInput
                  ariaLabel="Amount"
                  value={row.amount}
                  onChange={(n) => update(row.key, { amount: n })}
                />

                <input
                  aria-label="Note"
                  placeholder="What's it for?"
                  value={row.note}
                  onChange={(e) => update(row.key, { note: e.target.value })}
                />

                <button
                  className="quiet danger"
                  onClick={() => removeRow(row.key)}
                  aria-label="Remove this allocation"
                >
                  ×
                </button>
              </div>
            ))}
          </Panel>
        </div>

        <aside>
          <div className="tape">
            <div className="tape-total">
              <span className="eyebrow">Deposit</span>
              <span className="amount fig">{dollars(amount)}</span>
            </div>

            <div
              className="tape-bar"
              role="img"
              aria-label={`${dollars(totals.allocated)} of ${dollars(amount)} allocated`}
            >
              <div className="tape-seg" style={{ width: `${allocatedPct}%` }} />
            </div>

            <div className="tape-legend">
              <div className="tape-legend-row">
                <span className="label">Allocated</span>
                <span className="value">{dollars(totals.allocated)}</span>
              </div>
            </div>

            <div className="tape-remainder" data-state={remainderState}>
              <span className="eyebrow">
                {remainderState === "over" ? "Over-allocated" : "Remaining"}
              </span>
              <span className="amount fig">{dollars(Math.abs(totals.remaining))}</span>
              <span className="hint">
                {remainderState === "over"
                  ? "You've assigned more than the deposit."
                  : remainderState === "clear"
                    ? "Every dollar has a job."
                    : "Send it somewhere below."}
              </span>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
