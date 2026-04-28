"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ablation } from "@/data/ablation";

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload: { group: string; auc: number; delta: number; nDropped: number } }>;
}

function CustomTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="clay-card-static clay-card px-4 py-3 text-xs" style={{ borderRadius: 14 }}>
      <p className="font-display font-bold text-sm text-[var(--color-text)] mb-1.5">{d.group}</p>
      <p className="text-[var(--color-text-muted)]">
        AUC after drop: <span className="font-mono font-bold text-[var(--color-text)]">{d.auc.toFixed(3)}</span>
      </p>
      <p className="text-[var(--color-text-muted)]">
        Δ vs full model: <span className="font-mono font-bold text-[var(--color-coral)]">−{d.delta.toFixed(3)}</span>
      </p>
      <p className="text-[var(--color-text-muted)]">
        Columns removed: <span className="font-mono">{d.nDropped}</span>
      </p>
    </div>
  );
}

export function AblationChart() {
  const data = ablation.ablations.map((a) => ({
    group: a.group,
    auc: a.auc,
    delta: a.delta,
    nDropped: a.nDropped,
  }));

  return (
    <div className="clay-card p-6 sm:p-8">
      <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
        <h3 className="font-display text-xl sm:text-2xl font-bold text-[var(--color-text)]">
          Feature-Group Ablation · ΔAUC
        </h3>
        <span className="clay-pill clay-pill-mint font-mono text-[10px]">
          full model AUC = {ablation.primaryAuc.toFixed(3)}
        </span>
      </div>
      <p className="text-sm leading-relaxed mb-6 max-w-2xl" style={{ color: "var(--color-text-muted)" }}>
        Drop each feature group, refit, measure how far AUC falls. Larger bar = more predictive load
        carried by that group. Prompt-engineering features dominate.
      </p>

      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 4" stroke="rgba(45,55,72,0.10)" horizontal={false} />
          <XAxis
            type="number"
            domain={[0, 0.06]}
            tick={{ fill: "#475569", fontSize: 12, fontWeight: 600 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => v.toFixed(2)}
          />
          <YAxis
            type="category"
            dataKey="group"
            tick={{ fill: "#2D3748", fontSize: 12, fontWeight: 600 }}
            width={170}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(45,55,72,0.04)" }} />
          <Bar
            dataKey="delta"
            fill="var(--color-coral)"
            stroke="var(--color-text)"
            strokeWidth={1.4}
            radius={[0, 4, 4, 0]}
            barSize={20}
          />
        </BarChart>
      </ResponsiveContainer>

      <p className="mt-4 text-[11px] font-semibold leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
        Each ΔAUC is the predictive load lost when that group is removed. Snapshot dummies are nearly free
        (Δ ≈ 0.001) — temporal drift contributes little once prompt structure is controlled for.
      </p>
    </div>
  );
}
