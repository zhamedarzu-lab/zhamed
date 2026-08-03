import { useState, useEffect, useRef, type ReactNode } from "react";
import { api, useApi } from "../lib/api";
import { dollars, toAmount } from "../lib/format";
import { SPENDING_COLOR, EXTRA_INCOME_COLOR, tagColor } from "./ui";

/* ── Budgets ─────────────────────────────────────────────────────────────────
   Budgets are a personal yardstick, not data anyone else needs, so they live
   in localStorage rather than the database. */

export function useBudget(storageKey: string, fallback: number) {
  const [budget, setBudgetState] = useState(() => {
    const stored = parseFloat(localStorage.getItem(storageKey) ?? "");
    return isNaN(stored) ? fallback : stored;
  });
  const setBudget = (v: number) => {
    localStorage.setItem(storageKey, String(v));
    setBudgetState(v);
  };
  return [budget, setBudget] as const;
}

/* ── Monthly items (bills & subscriptions) ───────────────────────────────── */

export interface MonthlyItem {
  id: number;
  month: string;
  name: string;
  amount: number;
  sortOrder: number;
  active?: boolean;
}

/**
 * Bills and subscriptions are the same list with different labels: named
 * amounts belonging to one month. Edits patch a single row, so the answer from
 * the server replaces just that row instead of reloading the whole month.
 */
export function useMonthlyItems<T extends MonthlyItem>(
  resource: "bills" | "subscriptions",
  month: string,
) {
  const base = `/api/finance/${resource}`;
  const { data, loading, error: loadError, reload, setData } = useApi<T[]>(
    `${base}?month=${month}`,
    [month],
  );
  const [editError, setEditError] = useState<string | null>(null);
  const items = data ?? [];

  async function guard(fn: () => Promise<unknown>) {
    setEditError(null);
    try {
      await fn();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "That change didn't stick.");
    }
  }

  const add = (name: string) =>
    guard(async () => {
      const created = await api.post<T>(base, { month, name, sortOrder: items.length });
      setData((prev) => [...(prev ?? []), created]);
    });

  const patch = (id: number, changes: Partial<Pick<T, "name" | "amount" | "active">>) =>
    guard(async () => {
      const updated = await api.patch<T>(`${base}/${id}`, changes);
      setData((prev) => (prev ?? []).map((i) => (i.id === id ? updated : i)));
    });

  const remove = (item: T, confirmText: string) =>
    guard(async () => {
      if (!confirm(confirmText)) return;
      await api.del(`${base}/${item.id}`);
      setData((prev) => (prev ?? []).filter((i) => i.id !== item.id));
    });

  return { items, loading, error: editError ?? loadError, add, patch, remove, reload };
}

/* ── Ledger table cells ──────────────────────────────────────────────────── */

/** Uncontrolled on purpose: typing stays local until blur commits it. */
export function NameCell({
  item,
  label,
  className,
  onRename,
}: {
  item: MonthlyItem;
  label: string;
  className?: string;
  onRename: (name: string) => void;
}) {
  return (
    <td>
      <input
        aria-label={label}
        className={className}
        defaultValue={item.name}
        key={item.id + item.name}
        onBlur={(e) => {
          const name = e.target.value.trim();
          if (name && name !== item.name) onRename(name);
        }}
      />
    </td>
  );
}

export function AmountCell({
  item,
  onChange,
}: {
  item: MonthlyItem;
  onChange: (amount: number) => void;
}) {
  return (
    <td className="num">
      <input
        aria-label={`Amount for ${item.name}`}
        inputMode="decimal"
        key={item.id + item.amount}
        defaultValue={item.amount === 0 ? "" : String(item.amount)}
        placeholder="0.00"
        onBlur={(e) => {
          const v = toAmount(e.target.value);
          if (v !== item.amount) onChange(v);
        }}
      />
    </td>
  );
}

export function RemoveCell({ name, onRemove }: { name: string; onRemove: () => void }) {
  return (
    <td>
      <button className="quiet danger btn-icon" onClick={onRemove} aria-label={`Remove ${name}`}>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          strokeLinejoin="round" aria-hidden="true"
        >
          <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
        </svg>
      </button>
    </td>
  );
}

/* ── Stat strip ──────────────────────────────────────────────────────────── */

export function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="bills-stat">
      <span className="eyebrow">{label}</span>
      {children}
    </div>
  );
}

/** Total left over against a budget — red once it goes negative. */
export function LeftoverStat({ leftover, label }: { leftover: number; label?: string }) {
  return (
    <Stat label={label ?? (leftover < 0 ? "Over budget" : "Leftover")}>
      <span className="fig" style={{ color: leftover < 0 ? "var(--stamp)" : "#5fc97a" }}>
        {dollars(Math.abs(leftover))}
      </span>
    </Stat>
  );
}

/** Click-to-edit budget figure. */
export function BudgetStat({
  budget,
  onChange,
}: {
  budget: number;
  onChange: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <Stat label="Budget">
      {editing ? (
        <input
          className="bills-budget-input fig"
          autoFocus
          inputMode="decimal"
          defaultValue={String(budget)}
          onBlur={(e) => {
            const v = toAmount(e.target.value);
            if (v > 0) onChange(v);
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setEditing(false);
          }}
        />
      ) : (
        <button
          className="quiet bills-budget-btn fig"
          onClick={() => setEditing(true)}
          title="Click to edit"
        >
          {dollars(budget)}
        </button>
      )}
    </Stat>
  );
}

/* ── Add row ─────────────────────────────────────────────────────────────── */

export function AddItemRow({
  label,
  placeholder,
  onAdd,
}: {
  label: string;
  placeholder: string;
  onAdd: (name: string) => Promise<void>;
}) {
  const [open,  setOpen]  = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function submit() {
    if (!value.trim()) return;
    try {
      await onAdd(value.trim());
      setValue("");
      setOpen(false);
    } catch {
      // parent shows the error banner; keep the form open
    }
  }

  if (!open) {
    return (
      <button className="ft-add-btn" onClick={() => setOpen(true)}>
        + {label}
      </button>
    );
  }

  return (
    <div className="panel-body bills-add-row" style={{ borderTop: "1px solid var(--rule)" }}>
      <input
        ref={inputRef}
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter")  void submit();
          if (e.key === "Escape") { setOpen(false); setValue(""); }
        }}
        style={{ flex: 1 }}
      />
      <button className="primary" onClick={() => void submit()} disabled={!value.trim()}>
        Add
      </button>
      <button className="quiet" onClick={() => { setOpen(false); setValue(""); }}>✕</button>
    </div>
  );
}

/* ── Paycheck breakdown ──────────────────────────────────────────────────── */

export interface AllocationRow {
  id: number;
  amount: number;
  note: string;
}

/**
 * Where one paycheck went: extra income first (it grew the pool), then each
 * allocation, then whatever was left to spend. Pass `pool` to show each line
 * as a share of the paycheck.
 */
export function AllocationList({
  allocations,
  extraIncome,
  unallocated,
  pool,
  signedAmount,
  stacked = false,
}: {
  allocations: AllocationRow[];
  extraIncome: AllocationRow[];
  unallocated: number;
  /** Paycheck plus extra income; omit or pass 0 to hide percentages. */
  pool?: number;
  /** Renders extra income as "+$50.00". */
  signedAmount: (n: number) => string;
  /** One line per row instead of a wrapping inline list. */
  stacked?: boolean;
}) {
  const pct = (amount: number) =>
    pool && pool > 0 ? <span className="alloc-pct">{Math.round((amount / pool) * 100)}%</span> : null;

  return (
    <ul className={stacked ? "alloc-list stacked" : "alloc-list"}>
      {extraIncome.map((e) => (
        <li key={`extra-${e.id}`}>
          <span className="alloc-dot" style={{ background: EXTRA_INCOME_COLOR }} />
          <span className="alloc-note">{e.note || <span className="muted">Extra income</span>}</span>
          <span className="fig alloc-amt" style={{ color: EXTRA_INCOME_COLOR }}>
            {signedAmount(e.amount)}
          </span>
          {pct(e.amount)}
        </li>
      ))}
      {allocations.map((a) => (
        <li key={a.id}>
          <span className="alloc-dot" style={{ background: tagColor(a.note) }} />
          <span className="alloc-note">{a.note || <span className="muted">Untitled</span>}</span>
          <span className="fig alloc-amt">{dollars(a.amount)}</span>
          {pct(a.amount)}
        </li>
      ))}
      {unallocated > 0.005 && (
        <li>
          <span className="alloc-dot" style={{ background: SPENDING_COLOR, opacity: 0.55 }} />
          <span className="alloc-note muted">Spending</span>
          <span className="fig alloc-amt" style={{ color: SPENDING_COLOR }}>
            {dollars(unallocated)}
          </span>
          {pct(unallocated)}
        </li>
      )}
    </ul>
  );
}
