import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, useApi } from "../../lib/api";
import { CATEGORY_LABELS, dollars, todayIso } from "../../lib/format";
import { Field, MoneyInput, Notice, Panel } from "../../components/ui";

type Row = {
  key: string;
  category: "bills" | "debt" | "credit_dump" | "surplus";
  debtAccountId: number | null;
  billId: number | null;
  amount: number;
  notes: string;
  tags: string;
};

type DebtAccount = { id: number; name: string; kind: string; active: boolean };
type Bill = { id: number; name: string; expectedAmount: number; active: boolean };

type LoadedPaycheck = {
  id: number;
  payDate: string;
  amount: number;
  label: "first" | "second";
  allocations: Array<{
    category: Row["category"];
    debtAccountId: number | null;
    billId: number | null;
    amount: number;
    notes: string | null;
    tags: string[];
  }>;
};

const newKey = () => Math.random().toString(36).slice(2);

const blankRow = (category: Row["category"] = "bills"): Row => ({
  key: newKey(),
  category,
  debtAccountId: null,
  billId: null,
  amount: 0,
  notes: "",
  tags: "",
});

export default function PaycheckEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const editing = Boolean(id);

  const accounts = useApi<DebtAccount[]>("/api/finance/debt-accounts");
  const bills = useApi<Bill[]>("/api/finance/bills");
  const existing = useApi<LoadedPaycheck>(editing ? `/api/finance/paychecks/${id}` : null);

  const [payDate, setPayDate] = useState(todayIso());
  const [amount, setAmount] = useState(0);
  const [label, setLabel] = useState<"first" | "second">("first");
  const [rows, setRows] = useState<Row[]>([blankRow("bills")]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!existing.data) return;
    setPayDate(existing.data.payDate);
    setAmount(existing.data.amount);
    setLabel(existing.data.label);
    setRows(
      existing.data.allocations.map((a) => ({
        key: newKey(),
        category: a.category,
        debtAccountId: a.debtAccountId,
        billId: a.billId,
        amount: a.amount,
        notes: a.notes ?? "",
        tags: a.tags.join(", "),
      })),
    );
  }, [existing.data]);

  const totals = useMemo(() => {
    const by = (c: Row["category"]) =>
      rows.filter((r) => r.category === c).reduce((s, r) => s + r.amount, 0);
    const allocated = rows.reduce((s, r) => s + r.amount, 0);
    return {
      bills: by("bills"),
      debt: by("debt"),
      credit_dump: by("credit_dump"),
      surplus: by("surplus"),
      allocated,
      remaining: amount - allocated,
    };
  }, [rows, amount]);

  const cards = (accounts.data ?? []).filter((a) => a.active && a.kind === "card");

  /* ---- friction reducers ------------------------------------------- */

  async function repeatLast() {
    setError(null);
    try {
      const last = await api.get<LoadedPaycheck | null>("/api/finance/paychecks/last");
      if (!last) {
        setError("There's no earlier paycheck to copy from yet.");
        return;
      }
      setAmount(last.amount);
      setLabel(last.label === "first" ? "second" : "first");
      setRows(
        last.allocations.map((a) => ({
          key: newKey(),
          category: a.category,
          debtAccountId: a.debtAccountId,
          billId: a.billId,
          amount: a.amount,
          notes: a.notes ?? "",
          tags: a.tags.join(", "),
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not copy the last paycheck.");
    }
  }

  /** Sends the whole remainder to one card in a single click. */
  function dumpRemainder(accountId: number) {
    const remainder = Math.round(totals.remaining * 100) / 100;
    if (remainder <= 0) return;
    setRows((prev) => {
      const existingDump = prev.find(
        (r) => r.category === "credit_dump" && r.debtAccountId === accountId,
      );
      if (existingDump) {
        return prev.map((r) =>
          r.key === existingDump.key
            ? { ...r, amount: Math.round((r.amount + remainder) * 100) / 100 }
            : r,
        );
      }
      return [
        ...prev,
        { ...blankRow("credit_dump"), debtAccountId: accountId, amount: remainder },
      ];
    });
  }

  /** Drops in one row per active bill, pre-filled with the template amount. */
  function fillFromBillTemplate() {
    const active = (bills.data ?? []).filter((b) => b.active && b.expectedAmount > 0);
    if (active.length === 0) return;
    setRows((prev) => [
      ...prev.filter((r) => !(r.category === "bills" && r.amount === 0 && !r.notes)),
      ...active.map((b) => ({
        ...blankRow("bills"),
        billId: b.id,
        amount: b.expectedAmount,
        notes: b.name,
      })),
    ]);
  }

  /* ---- row helpers -------------------------------------------------- */

  const update = (key: string, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const removeRow = (key: string) => setRows((prev) => prev.filter((r) => r.key !== key));

  /* ---- save --------------------------------------------------------- */

  async function save() {
    setError(null);
    if (amount <= 0) {
      setError("Enter the paycheck amount before saving.");
      return;
    }
    setSaving(true);
    const payload = {
      payDate,
      amount,
      label,
      allocations: rows
        .filter((r) => r.amount > 0)
        .map((r) => ({
          category: r.category,
          debtAccountId:
            r.category === "debt" || r.category === "credit_dump" ? r.debtAccountId : null,
          billId: r.category === "bills" ? r.billId : null,
          amount: r.amount,
          notes: r.notes.trim() || null,
          tags: r.tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
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
          <p>Enter the deposit, then cut it into piles top to bottom.</p>
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
        {/* ---------------- left: the entry form ---------------- */}
        <div className="grid" style={{ gap: "1rem", alignContent: "start" }}>
          <Panel title="The deposit">
            <div className="grid grid-3" style={{ gap: "0.75rem" }}>
              <Field label="Pay date">
                <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
              </Field>
              <Field label="Amount">
                <MoneyInput value={amount} onChange={setAmount} autoFocus={!editing} />
              </Field>
              <Field label="Which paycheck">
                <select value={label} onChange={(e) => setLabel(e.target.value as "first" | "second")}>
                  <option value="first">1 of month</option>
                  <option value="second">2 of month</option>
                </select>
              </Field>
            </div>
            <div className="button-row" style={{ marginTop: "0.85rem" }}>
              <button onClick={repeatLast}>Repeat last paycheck structure</button>
              <button onClick={fillFromBillTemplate}>Fill from bill template</button>
            </div>
          </Panel>

          <Panel
            title="Allocations"
            action={
              <div className="button-row">
                <button className="quiet" onClick={() => setRows((r) => [...r, blankRow("bills")])}>
                  + Bill
                </button>
                <button className="quiet" onClick={() => setRows((r) => [...r, blankRow("debt")])}>
                  + Debt
                </button>
                <button className="quiet" onClick={() => setRows((r) => [...r, blankRow("surplus")])}>
                  + Spending
                </button>
              </div>
            }
          >
            {rows.length === 0 && (
              <p className="muted" style={{ margin: 0 }}>
                Nothing allocated yet. Add a row, or fill from your bill template.
              </p>
            )}

            {rows.map((row) => (
              <div className="alloc-row" key={row.key}>
                <select
                  aria-label="Category"
                  value={row.category}
                  onChange={(e) =>
                    update(row.key, {
                      category: e.target.value as Row["category"],
                      debtAccountId: null,
                      billId: null,
                    })
                  }
                >
                  {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>

                {row.category === "bills" ? (
                  <select
                    aria-label="Which bill"
                    value={row.billId ?? ""}
                    onChange={(e) =>
                      update(row.key, { billId: e.target.value ? Number(e.target.value) : null })
                    }
                  >
                    <option value="">Not tied to a bill</option>
                    {(bills.data ?? [])
                      .filter((b) => b.active)
                      .map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                  </select>
                ) : row.category === "surplus" ? (
                  <input
                    aria-label="What for"
                    placeholder="What's it for?"
                    value={row.notes}
                    onChange={(e) => update(row.key, { notes: e.target.value })}
                  />
                ) : (
                  <select
                    aria-label="Which account"
                    value={row.debtAccountId ?? ""}
                    onChange={(e) =>
                      update(row.key, {
                        debtAccountId: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  >
                    <option value="">Pick an account</option>
                    {(accounts.data ?? [])
                      .filter((a) => a.active)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                  </select>
                )}

                <MoneyInput
                  ariaLabel="Amount"
                  value={row.amount}
                  onChange={(n) => update(row.key, { amount: n })}
                />

                <button
                  className="quiet danger"
                  onClick={() => removeRow(row.key)}
                  aria-label="Remove this allocation"
                >
                  ×
                </button>

                <div className="notes-line">
                  <input
                    aria-label="Notes"
                    placeholder="Notes"
                    value={row.category === "surplus" ? "" : row.notes}
                    disabled={row.category === "surplus"}
                    onChange={(e) => update(row.key, { notes: e.target.value })}
                    style={row.category === "surplus" ? { visibility: "hidden" } : undefined}
                  />
                  <input
                    aria-label="Tags"
                    placeholder="Tags, comma separated"
                    value={row.tags}
                    onChange={(e) => update(row.key, { tags: e.target.value })}
                  />
                </div>
              </div>
            ))}
          </Panel>
        </div>

        {/* ---------------- right: the tape ---------------- */}
        <aside>
          <div className="tape">
            <div className="tape-total">
              <span className="eyebrow">Deposit</span>
              <span className="amount fig">{dollars(amount)}</span>
            </div>

            <div className="tape-bar" role="img" aria-label="How this paycheck is split">
              {(["bills", "debt", "credit_dump", "surplus"] as const).map((cat) => (
                <div
                  key={cat}
                  className="tape-seg"
                  data-cat={cat}
                  style={{ width: `${amount > 0 ? Math.max(0, (totals[cat] / amount) * 100) : 0}%` }}
                />
              ))}
            </div>

            <div className="tape-legend">
              {(
                [
                  ["bills", "var(--ink)"],
                  ["debt", "var(--stamp)"],
                  ["credit_dump", "var(--carbon)"],
                  ["surplus", "var(--rule-strong)"],
                ] as const
              ).map(([cat, color]) => (
                <div className="tape-legend-row" key={cat}>
                  <span className="swatch" style={{ background: color }} />
                  <span className="label">{CATEGORY_LABELS[cat]}</span>
                  <span className="value">{dollars(totals[cat])}</span>
                </div>
              ))}
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

            {remainderState === "open" && cards.length > 0 && (
              <div style={{ padding: "0 1rem 1rem" }}>
                <span className="eyebrow" style={{ display: "block", marginBottom: "0.4rem" }}>
                  Credit dump
                </span>
                <div className="button-row">
                  {cards.map((c) => (
                    <button key={c.id} onClick={() => dumpRemainder(c.id)}>
                      All to {c.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
