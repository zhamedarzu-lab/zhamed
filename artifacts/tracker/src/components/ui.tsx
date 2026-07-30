import { useMemo, type CSSProperties, type ReactNode } from "react";
import { currentMonth, shiftMonth, monthName } from "../lib/format";

export type Point = { date: string; value: number };

// ---------------------------------------------------------------------------
// AllocBar — multi-colour segmented allocation bar
// ---------------------------------------------------------------------------
export const SPENDING_COLOR = "#5fc97a";

// Known tag categories → fixed colour. Matched by keyword so "bills 1/2"
// still lands on the same blue as "bills".
const TAG_KEYWORDS: Array<[RegExp, string]> = [
  [/bill/i,    "#6890cc"],  // bills      → carbon blue
  [/cashapp/i, "#d4a644"],  // cashapp    → amber
  [/cred/i,    "#cc8f7a"],  // credit     → terracotta
  [/debt/i,    "#9a7acc"],  // debt       → violet
  [/steam/i,   "#5ab8cc"],  // steamdeck  → sky
  [/rent/i,    "#7acc9a"],  // rent       → mint
  [/spend/i,   SPENDING_COLOR],
];

// Deterministic hash so unknown tags always get the same colour.
const FALLBACK: string[] = ["#ccb85a", "#cc7a9a", "#a0cc7a", "#7accc0", "#cc9a5a", "#b07acc"];
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function tagColor(note: string): string {
  const n = (note || "").trim();
  if (!n) return "var(--rule-strong)";
  for (const [re, color] of TAG_KEYWORDS) if (re.test(n)) return color;
  return FALLBACK[hashStr(n.toLowerCase()) % FALLBACK.length];
}

export function AllocBar({
  segments,
  total,
  remainder,
  height = 10,
}: {
  segments: { amount: number; color: string }[];
  total: number;
  remainder?: number;
  height?: number;
}) {
  if (total <= 0) return null;
  const rem = remainder ?? 0;
  return (
    <div className="alloc-bar" role="img" aria-label="Allocation breakdown" style={{ height }}>
      {segments.map((s, i) => (
        <div
          key={i}
          className="alloc-bar-seg"
          style={{ width: `${Math.max(0, (s.amount / total) * 100)}%`, background: s.color }}
        />
      ))}
      {rem > 0.005 && (
        <div
          className="alloc-bar-seg"
          style={{ width: `${(rem / total) * 100}%`, background: SPENDING_COLOR, opacity: 0.4 }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel — a bordered card with optional header row
// ---------------------------------------------------------------------------
export function Panel({
  title,
  action,
  bodyless,
  children,
  style,
}: {
  title?: ReactNode;
  action?: ReactNode;
  bodyless?: boolean;
  children?: ReactNode;
  style?: CSSProperties;
}) {
  const hasHead = title !== undefined || action !== undefined;
  return (
    <div className="panel" style={style}>
      {hasHead && (
        <div className="panel-head">
          <div>{title}</div>
          {action !== undefined && <div>{action}</div>}
        </div>
      )}
      {bodyless ? children : <div className="panel-body">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty — centred placeholder for zero-data states
// ---------------------------------------------------------------------------
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading — lightweight text spinner
// ---------------------------------------------------------------------------
export function Loading() {
  return <div className="spinner">Loading…</div>;
}

// ---------------------------------------------------------------------------
// Notice — error / warning banner; renders nothing when children is falsy
// ---------------------------------------------------------------------------
export function Notice({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <div className="notice">{children}</div>;
}

// ---------------------------------------------------------------------------
// Field — labelled form-field wrapper
// ---------------------------------------------------------------------------
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

// ---------------------------------------------------------------------------
// MoneyInput — controlled text input that normalises to a number
// ---------------------------------------------------------------------------
export function MoneyInput({
  value,
  onChange,
  ariaLabel,
  autoFocus,
}: {
  value: number;
  onChange: (n: number) => void;
  ariaLabel?: string;
  autoFocus?: boolean;
}) {
  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel ?? "Amount"}
      autoFocus={autoFocus}
      value={value === 0 ? "" : String(value)}
      placeholder="0.00"
      style={{ textAlign: "right", fontFamily: "var(--fig)" }}
      onChange={(e) => {
        const cleaned = e.target.value.replace(/[^0-9.]/g, "");
        const n = parseFloat(cleaned);
        onChange(Number.isFinite(n) ? n : 0);
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// MonthPicker — prev / dropdown / next navigator
// ---------------------------------------------------------------------------

/** Months offered in the dropdown: two years back, six months forward. */
const BACK = 24;
const FORWARD = 6;

export function MonthPicker({
  month,
  onChange,
}: {
  month: string;
  onChange: (m: string) => void;
}) {
  const options = useMemo(() => {
    const anchor = currentMonth();
    const list: string[] = [];
    for (let i = -BACK; i <= FORWARD; i++) list.push(shiftMonth(anchor, i));
    // A month stepped past the ends of the range still has to be selectable.
    if (!list.includes(month)) list.push(month);
    return list.sort().reverse();
  }, [month]);

  return (
    <div className="month-picker">
      <button
        className="quiet"
        type="button"
        onClick={() => onChange(shiftMonth(month, -1))}
        aria-label="Previous month"
        style={{ fontSize: "1.1rem", lineHeight: 1 }}
      >
        ‹
      </button>
      <select
        className="month-select"
        aria-label="Month"
        value={month}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((m) => (
          <option key={m} value={m}>
            {monthName(m)}
          </option>
        ))}
      </select>
      <button
        className="quiet"
        type="button"
        onClick={() => onChange(shiftMonth(month, 1))}
        aria-label="Next month"
        style={{ fontSize: "1.1rem", lineHeight: 1 }}
      >
        ›
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BalanceChart — pure-SVG line/area chart for debt or any numeric trend
// ---------------------------------------------------------------------------
export function BalanceChart({
  points,
  color,
  height,
}: {
  points: Point[];
  color: string;
  height: number;
}) {
  if (points.length < 2) {
    return (
      <p className="muted" style={{ fontSize: "0.8125rem", margin: "0.5rem 0" }}>
        Log at least two data points to see the trend line.
      </p>
    );
  }

  const W = 600;
  const H = height;
  const PAD = { top: 14, right: 16, bottom: 28, left: 52 };

  const vals = points.map((p) => p.value);
  const minV = Math.min(...vals);
  const maxV = Math.max(...vals);
  const range = maxV - minV || 1;

  const toX = (i: number) =>
    PAD.left + (i / (points.length - 1)) * (W - PAD.left - PAD.right);
  const toY = (v: number) =>
    PAD.top + ((maxV - v) / range) * (H - PAD.top - PAD.bottom);

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(p.value).toFixed(1)}`)
    .join(" ");

  const areaPath =
    linePath +
    ` L${toX(points.length - 1).toFixed(1)},${(H - PAD.bottom).toFixed(1)}` +
    ` L${toX(0).toFixed(1)},${(H - PAD.bottom).toFixed(1)} Z`;

  // Three horizontal guide lines
  const gridVals = [minV, minV + range / 2, maxV].map((v) => Math.round(v));
  // Label ticks at first, middle, last
  const labelTicks = [0, Math.floor((points.length - 1) / 2), points.length - 1];

  function fmtVal(v: number) {
    return v >= 10000 ? `${(v / 1000).toFixed(0)}k`
      : v >= 1000 ? `${(v / 1000).toFixed(1)}k`
      : String(Math.round(v));
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="chart"
      style={{ height: H, width: "100%", display: "block" }}
      aria-hidden="true"
    >
      {gridVals.map((v, i) => (
        <g key={i}>
          <line
            className="grid-line"
            x1={PAD.left}
            y1={toY(v)}
            x2={W - PAD.right}
            y2={toY(v)}
          />
          <text x={PAD.left - 4} y={toY(v) + 3} textAnchor="end">
            {fmtVal(v)}
          </text>
        </g>
      ))}

      <path d={areaPath} className="area" fill={color} />
      <path d={linePath} className="line" stroke={color} />

      {labelTicks.map((i) => (
        <g key={i}>
          <circle
            className="dot"
            cx={toX(i)}
            cy={toY(points[i].value)}
            r={3.5}
            fill={color}
          />
          <text x={toX(i)} y={H - PAD.bottom + 14} textAnchor="middle">
            {points[i].date.slice(5)}
          </text>
        </g>
      ))}
    </svg>
  );
}
