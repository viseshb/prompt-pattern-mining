"use client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { languageSubgroups } from "@/data/languageSubgroups";

const chartData = languageSubgroups
  .filter((l) => l.n_conversations >= 25)
  .sort((a, b) => b.roc_auc_mean - a.roc_auc_mean)
  .slice(0, 15);

// Tier palette: green (best) -> sky -> amber -> coral (lowest).
function getColor(auc: number): string {
  if (auc >= 0.75) return "var(--color-cta)";    // green (top tier)
  if (auc >= 0.65) return "var(--color-c2)";     // sky
  if (auc >= 0.55) return "var(--color-c4)";     // amber
  return "var(--color-c3)";                      // coral
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload: typeof chartData[number] }>;
}

function CustomTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="clay-card-static clay-card px-4 py-3 text-xs" style={{ borderRadius: 14 }}>
      <p className="font-display font-bold text-sm text-[var(--color-text)] mb-1.5">{d.language}</p>
      <p className="text-[var(--color-text-muted)]">
        AUC: <span className="font-mono font-bold text-[var(--color-text)]">{d.roc_auc_mean.toFixed(3)}</span>
      </p>
      <p className="text-[var(--color-text-muted)]">
        Conversations: <span className="font-mono text-[var(--color-text)]">{d.n_conversations.toLocaleString()}</span>
      </p>
      <p className="text-[var(--color-text-muted)]">
        Success rate:{" "}
        <span className="font-mono text-[var(--color-text)]">
          {((d.n_success / d.n_conversations) * 100).toFixed(1)}%
        </span>
      </p>
    </div>
  );
}

export function LanguageSubgroups() {
  return (
    <div className="clay-card p-6 sm:p-8">
      <h3 className="font-display text-xl sm:text-2xl font-bold text-[var(--color-text)] mb-2">
        Model Performance by Language
      </h3>
      <p className="text-sm text-[var(--color-text-muted)] mb-7 leading-relaxed">
        ROC-AUC across programming language subgroups (n &ge; 25).
      </p>
      <ResponsiveContainer width="100%" height={450}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 110, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 4" stroke="rgba(45,55,72,0.10)" />
          <XAxis type="number" domain={[0, 1]} tick={{ fill: "#475569", fontSize: 12, fontWeight: 600 }} axisLine={false} tickLine={false} />
          <YAxis
            type="category"
            dataKey="language"
            tick={{ fill: "#2D3748", fontSize: 12, fontWeight: 600 }}
            width={110}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(45,55,72,0.04)" }} />
          <Bar dataKey="roc_auc_mean" radius={[0, 4, 4, 0]} barSize={16} stroke="var(--color-text)" strokeWidth={1.4}>
            {chartData.map((entry, index) => (
              <Cell key={index} fill={getColor(entry.roc_auc_mean)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
