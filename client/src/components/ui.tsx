import { useId, useState, type ReactNode } from "react";
import { dollarsShort, monthName, shiftMonth, shortDate, toAmount } from "../lib/format";

/* ---------------------------------------------------------------- */

export function Panel({
  title,
  action,
  children,
  bodyless,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  bodyless?: boolean;
}) {
  return (
    <section className="panel">
      {(title || action) && (
        <header className="panel-head">
          {typeof title === "string" ? <h2>{title}</h2> : title}
          {action}
        </header>
      )}
      {bodyless ? children : <div className="panel-body">{children}</div>}
    </section>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children}
    </div>
  );
}

export const Loading = ({ label = "Loading" }: { label?: string }) => (
  <div className="spinner">{label}…</div>
);

export const Notice = ({ children }: { children: ReactNode }) =>
  children ? <div className="notice">{children}</div> : null;

/* ---------------------------------------------------------------- */

/**
 * Keeps a local draft while you're mid-keystroke, so "12." and a trailing
 * zero survive long enough to finish typing. The parent only ever sees a
 * number.
 */
export function MoneyInput({
  value,
  onChange,
  placeholder = "0.00",
  autoFocus,
  ariaLabel,
}: {
  value: number;
  onChange: (n: number) => void;
  placeholder?: string;
  autoFocus?: boolean;
  ariaLabel?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === 0 ? "" : String(value));

  return (
    <input
      inputMode="decimal"
      aria-label={ariaLabel}
      autoFocus={autoFocus}
      value={shown}
      placeholder={placeholder}
      onChange={(e) => {
        setDraft(e.target.value);
        onChange(toAmount(e.target.value));
      }}
      onBlur={() => setDraft(null)}
    />
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

/* ---------------------------------------------------------------- */

export function MonthPicker({
  month,
  onChange,
}: {
  month: string;
  onChange: (m: string) => void;
}) {
  return (
    <div className="button-row">
      <button
        className="quiet"
        onClick={() => onChange(shiftMonth(month, -1))}
        aria-label="Previous month"
      >
        ←
      </button>
      <strong style={{ minWidth: "9.5rem", textAlign: "center" }}>
        {monthName(month)}
      </strong>
      <button
        className="quiet"
        onClick={() => onChange(shiftMonth(month, 1))}
        aria-label="Next month"
      >
        →
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------- */

export type Point = { date: string; value: number };

/**
 * Hand-rolled so the balance line reads like a pen stroke on the pad —
 * no library chrome, no tooltips fighting the ledger rules.
 */
export function BalanceChart({
  points,
  color = "var(--stamp)",
  height = 140,
}: {
  points: Point[];
  color?: string;
  height?: number;
}) {
  const gradientId = useId();
  if (points.length === 0) {
    return <Empty title="No balances logged yet" />;
  }

  const W = 600;
  const H = height;
  const pad = { top: 12, right: 8, bottom: 20, left: 46 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;

  const values = points.map((p) => p.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;

  const x = (i: number) =>
    pad.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => pad.top + innerH - ((v - min) / span) * innerH;

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`).join(" ");
  const area = `${line} L${x(points.length - 1)},${pad.top + innerH} L${x(0)},${
    pad.top + innerH
  } Z`;

  const ticks = [min, min + span / 2, max];

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Balance over time">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      {ticks.map((t) => (
        <g key={t}>
          <line className="grid-line" x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} />
          <text x={pad.left - 6} y={y(t) + 3} textAnchor="end">
            {dollarsShort(t)}
          </text>
        </g>
      ))}

      <path d={area} fill={`url(#${gradientId})`} />
      <path className="line" d={line} stroke={color} />

      {points.map((p, i) => (
        <circle key={p.date + i} className="dot" cx={x(i)} cy={y(p.value)} r="2.5" fill={color} />
      ))}

      <text x={pad.left} y={H - 5}>
        {shortDate(points[0].date)}
      </text>
      {points.length > 1 && (
        <text x={W - pad.right} y={H - 5} textAnchor="end">
          {shortDate(points[points.length - 1].date)}
        </text>
      )}
    </svg>
  );
}
