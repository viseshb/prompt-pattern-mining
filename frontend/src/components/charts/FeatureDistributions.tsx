"use client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

const allFeatures = [
  { name: "Prompt Tokens", success: 187.5, failure: 210.5 },
  { name: "Iterations",    success: 4.56,  failure: 6.26 },
  { name: "Examples",      success: 1.82,  failure: 1.38 },
  { name: "Constraints",   success: 1.25,  failure: 1.30 },
  { name: "Refinement",    success: 0.54,  failure: 0.87 },
  { name: "Corrections",   success: 0.01,  failure: 0.28 },
];

const logTicks = [0.01, 0.1, 1, 10, 100];

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="clay-card-static clay-card px-4 py-3 text-xs font-sans" style={{ borderRadius: 14 }}>
      <p className="font-display font-bold text-sm text-[var(--color-text)] mb-1.5">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="text-[var(--color-text-muted)]">
          <span style={{ color: p.color }}>■</span>{" "}
          {p.name}:{" "}
          <span className="font-mono font-bold text-[var(--color-text)]">
            {p.value < 0.02 ? "~0" : p.value.toFixed(2)}
          </span>
        </p>
      ))}
    </div>
  );
}

export function FeatureDistributions() {
  return (
    <div className="clay-card p-6 sm:p-8">
      <h3 className="font-display text-xl sm:text-2xl font-bold text-[var(--color-text)] mb-2">
        Feature Comparison · Success vs Failure
      </h3>
      <p className="text-sm text-[var(--color-text-muted)] mb-7 leading-relaxed max-w-2xl">
        Mean feature values across successful and unsuccessful conversations (log<sub>10</sub> scale).
      </p>

      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={allFeatures} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 4" stroke="rgba(45,55,72,0.10)" />
          <XAxis
            type="number"
            scale="log"
            domain={[0.01, 500]}
            ticks={logTicks}
            tickFormatter={(v: number) => v.toString()}
            tick={{ fill: "#475569", fontSize: 12, fontWeight: 600 }}
            axisLine={false}
            tickLine={false}
            allowDataOverflow
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fill: "#2D3748", fontSize: 12, fontWeight: 600 }}
            width={120}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(45,55,72,0.04)" }} />
          <Legend
            wrapperStyle={{ color: "#2D3748", fontSize: 12, fontWeight: 600, paddingTop: 14 }}
            iconType="square"
            iconSize={10}
          />
          <Bar dataKey="success" name="Successful"   fill="var(--color-cta)"   stroke="var(--color-text)" strokeWidth={1.4} radius={[0, 4, 4, 0]} barSize={14} />
          <Bar dataKey="failure" name="Unsuccessful" fill="var(--color-coral)" stroke="var(--color-text)" strokeWidth={1.4} radius={[0, 4, 4, 0]} barSize={14} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
