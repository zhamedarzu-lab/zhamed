import { useEffect, useState } from "react";
import {
  ResponsiveContainer, ComposedChart, Bar, Line,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import { api } from "../../lib/api";
import { dollarsShort, shortMonth } from "../../lib/format";
import { Loading, Panel, SPENDING_COLOR, tagColor } from "../../components/ui";

type Summary = {
  income: number;
  unallocated: number;
  byNote: Array<{ note: string; amount: number }>;
};

type ChartRow = { month: string; _income: number; [tag: string]: number | string };

const GRID_COLOR  = "rgba(90,120,100,0.25)";
const INCOME_COLOR = "#7da8c4";
const AXIS_STYLE  = { fontSize: 11, fill: "var(--ink-faint)", fontFamily: "var(--fig)" } as const;

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;

  const income = payload.find((p: any) => p.dataKey === "_income");
  const bars   = [...payload].filter((p: any) => p.dataKey !== "_income").reverse();

  return (
    <div style={{
      background: "var(--paper)", border: "1px solid var(--rule-strong)",
      borderRadius: 3, padding: "0.6rem 0.85rem", minWidth: 160,
    }}>
      <div style={{
        fontFamily: "var(--fig)", fontSize: 11, color: "var(--ink-faint)",
        marginBottom: 6, letterSpacing: "0.08em", textTransform: "uppercase",
      }}>
        {shortMonth(label)}
      </div>
      {income && (
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", marginBottom: 6, paddingBottom: 6, borderBottom: "1px solid var(--rule)" }}>
          <span style={{ width: 8, height: 2, background: INCOME_COLOR, flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 13, color: "var(--ink-soft)" }}>Income</span>
          <span style={{ fontFamily: "var(--fig)", fontSize: 13, color: "var(--ink)" }}>
            {dollarsShort(income.value)}
          </span>
        </div>
      )}
      {bars.map((p: any) => (
        <div key={p.dataKey} style={{ display: "flex", gap: "0.75rem", alignItems: "center", marginBottom: 3 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: p.fill, flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 13, color: "var(--ink-soft)" }}>
            {p.dataKey === "_spending" ? "Spending" : p.dataKey}
          </span>
          <span style={{ fontFamily: "var(--fig)", fontSize: 13, color: "var(--ink)" }}>
            {dollarsShort(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

function ChartLegend({ payload }: any) {
  if (!payload?.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem 1rem", padding: "0.35rem 0 0", justifyContent: "center" }}>
      {payload.map((p: any) => {
        const isLine = p.type === "line";
        const label  = p.value === "_income" ? "Income" : p.value === "_spending" ? "Spending" : p.value;
        return (
          <span key={p.value} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--ink-soft)", fontFamily: "var(--fig)" }}>
            {isLine
              ? <span style={{ width: 14, height: 2, background: INCOME_COLOR, flexShrink: 0 }} />
              : <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color, flexShrink: 0 }} />
            }
            {label}
          </span>
        );
      })}
    </div>
  );
}

export default function MonthlyCharts() {
  const [rows, setRows]     = useState<ChartRow[] | null>(null);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const months = await api.get<string[]>("/api/finance/months");
        if (!months.length) return;

        const summaries = await Promise.all(
          months.map((m) => api.get<Summary>(`/api/finance/summary/${m}`)),
        );

        // Normalize tags: strip trailing " N/N" suffixes so "bills 1/2" and
        // "bills 2/2" both fold into "bills", then sum them.
        const normalize = (note: string) =>
          (note || "Untitled").replace(/\s+\d+\/\d+$/, "").trim() || "Untitled";

        // Collect all normalized tag names across every month
        const tagSet = new Set<string>();
        for (const s of summaries) {
          for (const b of s.byNote) tagSet.add(normalize(b.note));
        }
        const tags = [...tagSet];

        const chartRows: ChartRow[] = months
          .map((month, i) => {
            const s = summaries[i];
            const row: ChartRow = { month, _income: s.income };
            // Sum all raw notes that normalize to each tag
            for (const tag of tags) row[tag] = 0;
            for (const b of s.byNote) {
              const tag = normalize(b.note);
              row[tag] = ((row[tag] as number) || 0) + b.amount;
            }
            if (s.unallocated > 0.005) row["_spending"] = s.unallocated;
            return row;
          })
          .reverse(); // oldest → newest left to right

        if (!cancelled) {
          setRows(chartRows);
          setAllTags(tags);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <Loading />;
  if (!rows || rows.length < 2) return null;

  const barKeys = [...allTags, "_spending"];

  return (
    <Panel title="Income &amp; allocation by month" style={{ marginTop: "1rem" }}>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={rows} margin={{ top: 16, right: 48, left: 0, bottom: 0 }} barCategoryGap="28%">
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
          <Legend content={<ChartLegend />} />

          {barKeys.map((key, i) => (
            <Bar
              key={key}
              dataKey={key}
              stackId="a"
              fill={key === "_spending" ? SPENDING_COLOR : tagColor(key)}
              opacity={key === "_spending" ? 0.55 : 1}
              radius={i === barKeys.length - 1 ? [2, 2, 0, 0] : [0, 0, 0, 0]}
            />
          ))}

          <Line
            dataKey="_income"
            type="monotone"
            stroke={INCOME_COLOR}
            strokeWidth={2}
            dot={{ r: 3, fill: INCOME_COLOR, strokeWidth: 0 }}
            activeDot={{ r: 4 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </Panel>
  );
}
