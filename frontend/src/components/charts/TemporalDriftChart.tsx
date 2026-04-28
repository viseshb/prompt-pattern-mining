"use client";

import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { temporalDrift, temporalDriftMeta } from "@/data/temporalDrift";

interface TooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    payload: { date: string } & Record<string, number>;
    color: string;
  }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="clay-card-static clay-card px-4 py-3 text-xs" style={{ borderRadius: 14 }}>
      <p className="font-display font-bold text-sm text-[var(--color-text)] mb-1.5">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="text-[var(--color-text-muted)]">
          <span style={{ color: p.color }}>■</span>{" "}
          {p.name}: <span className="font-mono font-bold text-[var(--color-text)]">{p.value.toFixed(2)}</span>
        </p>
      ))}
    </div>
  );
}

export function TemporalDriftChart() {
  const allDates = Array.from(
    new Set(temporalDrift.flatMap((s) => s.points.map((p) => p.date))),
  ).sort();
  const data = allDates.map((date) => {
    const row: Record<string, number | string> = { date };
    for (const series of temporalDrift) {
      const pt = series.points.find((p) => p.date === date);
      if (pt) row[series.label] = pt.or;
    }
    return row;
  });

  return (
    <div className="clay-card p-6 sm:p-8">
      <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
        <h3 className="font-display text-xl sm:text-2xl font-bold text-[var(--color-text)]">
          Temporal Drift · Effects Across Snapshots
        </h3>
        <span className="clay-pill clay-pill-amber font-mono text-[10px]">
          n ≥ {temporalDriftMeta.minSnapshotN} per snapshot
        </span>
      </div>
      <p className="text-sm leading-relaxed mb-6 max-w-3xl" style={{ color: "var(--color-text-muted)" }}>
        Per-snapshot logistic regression. Output Format effect (OR &gt; 1) is consistently positive across
        the dataset window. Refinement Turns stays sub-1.0 throughout — more refinement correlates with
        worse outcomes (fixing-broken-output signal). Reference line at OR = 1 (no effect).
      </p>

      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 30 }}>
          <CartesianGrid strokeDasharray="3 4" stroke="rgba(45,55,72,0.10)" />
          <XAxis
            dataKey="date"
            tick={{ fill: "#475569", fontSize: 11, fontWeight: 600 }}
            axisLine={{ stroke: "var(--color-text)", strokeWidth: 1.5 }}
            tickLine={false}
            angle={-30}
            textAnchor="end"
            height={50}
          />
          <YAxis
            domain={[0, 4]}
            tick={{ fill: "#475569", fontSize: 12, fontWeight: 600 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: "rgba(45,55,72,0.20)" }} />
          <Legend
            wrapperStyle={{ fontSize: 12, paddingTop: 8, color: "#2D3748", fontWeight: 700 }}
            iconType="square"
            iconSize={10}
          />
          <ReferenceLine y={1} stroke="var(--color-text)" strokeDasharray="4 4" strokeWidth={1.5} />
          <Line
            type="monotone"
            dataKey="Output Format"
            stroke="var(--color-cta)"
            strokeWidth={2.5}
            dot={{ r: 4, stroke: "var(--color-text)", strokeWidth: 1.5, fill: "var(--color-cta)" }}
          />
          <Line
            type="monotone"
            dataKey="Refinement Turns"
            stroke="var(--color-coral)"
            strokeWidth={2.5}
            dot={{ r: 4, stroke: "var(--color-text)", strokeWidth: 1.5, fill: "var(--color-coral)" }}
          />
        </ComposedChart>
      </ResponsiveContainer>

      <p className="mt-4 text-[11px] font-semibold leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
        {temporalDriftMeta.totalFitted} snapshots fitted ·{" "}
        {temporalDriftMeta.totalSkipped} snapshots dropped (n &lt; {temporalDriftMeta.minSnapshotN}).
        Confidence intervals available in the underlying JSON; chart shows point estimates for clarity.
      </p>
    </div>
  );
}
