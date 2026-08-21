import {
  ResponsiveContainer, BarChart, Bar,
  XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid, Legend,
} from "recharts";
import { useApi } from "../../lib/api";
import { dollarsShort, shortMonth } from "../../lib/format";
import { Loading, Panel, tagColor } from "../../components/ui";

type HistoryRow = { month: string; total: number; [bill: string]: number | string };
type History    = { months: HistoryRow[]; allNames: string[] };

const BUDGET_COLOR = "#ccb85a";
const GRID_COLOR   = "rgba(90,120,100,0.25)";
const AXIS_STYLE   = { fontSize: 11, fill: "var(--ink-faint)", fontFamily: "var(--fig)" } as const;

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "var(--paper)", border: "1px solid var(--rule-strong)",
      borderRadius: 3, padding: "0.6rem 0.85rem", minWidth: 150,
    }}>
      <div style={{ fontFamily: "var(--fig)", fontSize: 11, color: "var(--ink-faint)", marginBottom: 6, letterSpacing: "0.08em", textTransform: "uppercase" }}>
        {shortMonth(label)}
      </div>
      {[...payload].reverse().map((p: any) => (
        <div key={p.dataKey} style={{ display: "flex", gap: "0.75rem", alignItems: "center", marginBottom: 3 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: p.fill, flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 13, color: "var(--ink-soft)" }}>{p.dataKey}</span>
          <span style={{ fontFamily: "var(--fig)", fontSize: 13, color: "var(--ink)" }}>{dollarsShort(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

function ChartLegend({ payload }: any) {
  if (!payload?.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem 1rem", padding: "0.35rem 0 0", justifyContent: "center" }}>
      {payload.map((p: any) => (
        <span key={p.value} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--ink-soft)", fontFamily: "var(--fig)" }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color, flexShrink: 0 }} />
          {p.value}
        </span>
      ))}
    </div>
  );
}

interface Props {
  budget: number;
  colors: Record<string, string>;
  chartKey: number;
}

export default function BillsCharts({ budget, colors, chartKey }: Props) {
  const { data, loading } = useApi<History>("/api/finance/bills/history", [chartKey]);

  if (loading) return <Loading />;
  if (!data || data.months.length < 2) return null;

  const { months, allNames } = data;
  const getColor = (name: string) => colors[name] ?? tagColor(name);

  return (
    <Panel title="Breakdown by bill" style={{ marginTop: "1rem" }}>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={months} margin={{ top: 12, right: 48, left: 0, bottom: 0 }} barCategoryGap="30%">
          <CartesianGrid vertical={false} stroke={GRID_COLOR} />
          <XAxis
            dataKey="month"
            tickFormatter={shortMonth}
            tick={AXIS_STYLE}
            axisLine={{ stroke: "var(--rule-strong)" }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v) => dollarsShort(v)}
            tick={AXIS_STYLE}
            axisLine={false}
            tickLine={false}
            width={52}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
          <ReferenceLine
            y={budget}
            stroke={BUDGET_COLOR}
            strokeDasharray="4 3"
            strokeWidth={1.5}
            label={{ value: "Budget", position: "insideTopRight", fill: BUDGET_COLOR, fontSize: 10, fontFamily: "var(--fig)" }}
          />
          <Legend content={<ChartLegend />} />
          {allNames.map((name, i) => (
            <Bar
              key={name}
              dataKey={name}
              stackId="a"
              fill={getColor(name)}
              radius={i === allNames.length - 1 ? [2, 2, 0, 0] : [0, 0, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </Panel>
  );
}
