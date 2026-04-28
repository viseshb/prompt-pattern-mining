"use client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";
import { coefficients, featureLabels } from "@/data/coefficients";

const chartData = coefficients
  .filter((c) => c.p_value !== null && c.p_value < 1 && c.odds_ratio > 0.001)
  .map((c) => ({
    name: featureLabels[c.feature] || c.feature,
    odds_ratio: Math.round(c.odds_ratio * 1000) / 1000,
    logOR: Math.round(c.coef_log_odds * 1000) / 1000,
    p_value: c.p_value,
    significant: c.p_value !== null && c.p_value < 0.05,
  }))
  .sort((a, b) => b.odds_ratio - a.odds_ratio);

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload: typeof chartData[number] }>;
}

function CustomTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="clay-card-static clay-card px-4 py-3 text-xs font-sans" style={{ borderRadius: 14 }}>
      <p className="font-display font-bold text-sm text-[var(--color-text)] mb-1.5">{d.name}</p>
      <p className="text-[var(--color-text-muted)]">
        OR: <span className="font-mono font-bold text-[var(--color-text)]">{d.odds_ratio}</span>
      </p>
      <p className="text-[var(--color-text-muted)]">
        log OR: <span className="font-mono text-[var(--color-text)]">{d.logOR}</span>
      </p>
      <p className="text-[var(--color-text-muted)]">
        p:{" "}
        <span className={`font-mono ${d.significant ? "font-bold text-[var(--color-cta-dark)]" : "text-[var(--color-text-muted)]"}`}>
          {d.p_value !== null && d.p_value !== undefined && d.p_value < 0.001
            ? "<0.001"
            : d.p_value?.toFixed(4)}
        </span>
        {d.significant && " ★"}
      </p>
    </div>
  );
}

interface ColoredBarProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: typeof chartData[number];
}

function ColoredBar(props: ColoredBarProps) {
  const { x, y, width, height, payload } = props;
  if (x === undefined || y === undefined || width === undefined || height === undefined || !payload) return null;
  // Green when feature raises success; coral when it suppresses
  const fill = payload.odds_ratio >= 1 ? "var(--color-cta)" : "var(--color-coral)";
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={fill} rx={4} stroke="var(--color-text)" strokeWidth={1.5} />
    </g>
  );
}

export function OddsRatioChart() {
  return (
    <div className="clay-card p-6 sm:p-8">
      <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
        <h3 className="font-display text-xl sm:text-2xl font-bold text-[var(--color-text)]">
          Prompt Feature Effects on Success
        </h3>
        <span className="clay-pill clay-pill-mint font-mono text-[10px]">★ p &lt; 0.05</span>
      </div>
      <p className="text-sm text-[var(--color-text-muted)] mb-7 leading-relaxed max-w-2xl">
        Odds ratios from logistic regression. Values &gt; 1 raise success probability; values &lt; 1 reduce it.
      </p>
      <ResponsiveContainer width="100%" height={420}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 4" stroke="rgba(45,55,72,0.10)" />
          <XAxis type="number" domain={[0.4, 2]} tick={{ fill: "#475569", fontSize: 12, fontWeight: 600 }} axisLine={false} tickLine={false} />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fill: "#2D3748", fontSize: 12, fontWeight: 600 }}
            width={170}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(45,55,72,0.04)" }} />
          <ReferenceLine x={1} stroke="var(--color-text)" strokeDasharray="4 4" strokeWidth={1.5} />
          <Bar dataKey="odds_ratio" barSize={18} shape={<ColoredBar />} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
