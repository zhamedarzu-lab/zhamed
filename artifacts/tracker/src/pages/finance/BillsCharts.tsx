import {
  ResponsiveContainer,
  BarChart, Bar, Cell,
  LineChart, Line,
  XAxis, YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
  Legend,
} from "recharts";
import { useApi } from "../../lib/api";
import { dollarsShort, shortMonth } from "../../lib/format";
import { Loading, Panel } from "../../components/ui";
import { tagColor } from "../../components/ui";

type HistoryRow = { month: string; total: number; [bill: string]: number | string };
type History = { months: HistoryRow[]; allNames: string[] };

const BUDGET_COLOR = "#ccb85a";
const GRID_COLOR   = "rgba(90,120,100,0.25)";
const AXIS_STYLE   = { fontSize: 11, fill: "var(--ink-faint)", fontFamily: "var(--fig)" };

const fmt = (v: unknown) => dollarsShort(Number(v));

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "var(--paper)", border: "1px solid var(--rule-strong)",
      borderRadius: 3, padding: "0.6rem 0.85rem", minWidth: 140,
    }}>
      <div style={{ fontFamily: "var(--fig)", fontSize: 11, color: "var(--ink-faint)", marginBottom: 6, letterSpacing: "0.08em", textTransform: "uppercase" }}>
        {shortMonth(label)}
      </div>
      {[...payload].reverse().map((p: any) => (
        <div key={p.dataKey} style={{ display: "flex", gap: "0.75rem", alignItems: "baseline", marginBottom: 2 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: p.fill ?? p.stroke, flexShrink: 0, alignSelf: "center" }} />
          <span style={{ flex: 1, fontSize: 13, color: "var(--ink-soft)" }}>{p.dataKey === "total" ? "Total" : p.dataKey}</span>
          <span style={{ fontFamily: "var(--fig)", fontSize: 13, color: "var(--ink)" }}>{dollarsShort(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

function ChartLegend({ payload }: any) {
  if (!payload?.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem 1rem", padding: "0.25rem 0 0", justifyContent: "center" }}>
      {payload.map((p: any) => (
        <span key={p.value} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--ink-soft)", fontFamily: "var(--fig)" }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color, flexShrink: 0 }} />
          {p.value}
        </span>
      ))}
    </div>
  );
}

const commonAxis = {
  xAxis: (
    <XAxis
      dataKey="month"
      tickFormatter={shortMonth}
      tick={AXIS_STYLE}
      axisLine={{ stroke: "var(--rule-strong)" }}
      tickLine={false}
    />
  ),
  yAxis: (
    <YAxis
      tickFormatter={fmt}
      tick={AXIS_STYLE}
      axisLine={false}
      tickLine={false}
      width={52}
    />
  ),
  grid: <CartesianGrid vertical={false} stroke={GRID_COLOR} />,
};

export default function BillsCharts({ budget }: { budget: number }) {
  const { data, loading } = useApi<History>("/api/finance/bills/history");

  if (loading) return <Loading />;
  if (!data || data.months.length < 2) return null; // need ≥2 months to be worth showing

  const { months, allNames } = data;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}>

      {/* ── 1. Stacked breakdown ─────────────────────────────── */}
      <Panel title="Breakdown by bill">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={months} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="30%">
            {commonAxis.grid}
            {commonAxis.xAxis}
            {commonAxis.yAxis}
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
            <ReferenceLine y={budget} stroke={BUDGET_COLOR} strokeDasharray="4 3" strokeWidth={1.5} label={{ value: "Budget", position: "right", fill: BUDGET_COLOR, fontSize: 10, fontFamily: "var(--fig)" }} />
            <Legend content={<ChartLegend />} />
            {allNames.map((name) => (
              <Bar key={name} dataKey={name} stackId="a" fill={tagColor(name)} radius={allNames.indexOf(name) === allNames.length - 1 ? [2, 2, 0, 0] : [0, 0, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      {/* ── 2. Monthly totals bar ────────────────────────────── */}
      <Panel title="Monthly total vs budget">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={months} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="40%">
            {commonAxis.grid}
            {commonAxis.xAxis}
            {commonAxis.yAxis}
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
            <ReferenceLine y={budget} stroke={BUDGET_COLOR} strokeDasharray="4 3" strokeWidth={1.5} label={{ value: "Budget", position: "right", fill: BUDGET_COLOR, fontSize: 10, fontFamily: "var(--fig)" }} />
            <Bar dataKey="total" radius={[2, 2, 0, 0]}>
              {months.map((m, i) => (
                <Cell key={i} fill={m.total > budget ? "var(--stamp)" : "#5a8a6a"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      {/* ── 3. Trend line ───────────────────────────────────── */}
      <Panel title="Trend over time">
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={months} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            {commonAxis.grid}
            {commonAxis.xAxis}
            {commonAxis.yAxis}
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--rule-strong)", strokeWidth: 1 }} />
            <ReferenceLine y={budget} stroke={BUDGET_COLOR} strokeDasharray="4 3" strokeWidth={1.5} label={{ value: "Budget", position: "right", fill: BUDGET_COLOR, fontSize: 10, fontFamily: "var(--fig)" }} />
            <Line
              type="monotone"
              dataKey="total"
              stroke="#7aa8e8"
              strokeWidth={2}
              dot={{ fill: "#7aa8e8", r: 3, strokeWidth: 0 }}
              activeDot={{ r: 5, fill: "#7aa8e8", strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </Panel>

    </div>
  );
}
