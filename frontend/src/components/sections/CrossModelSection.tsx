"use client";

import { motion } from "framer-motion";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import {
  VENDORS,
  VENDOR_EFFECTS,
  KAPPA_MATRIX,
  KAPPA_LABELS,
  LANGUAGE_EFFECTS,
  STUDY_META,
} from "@/data/multiModelStudy";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrendingUp } from "lucide-react";
import { VendorLogo } from "@/components/ui/VendorLogo";

const VENDOR_TINT: Record<string, string> = {
  kimi: "clay-tint-amber",
  claude: "clay-tint-peach",
  gemini: "clay-tint-blue",
};

function formatP(p: number): string {
  if (p < 1e-12) return "p < 1e-12";
  if (p < 0.001) return "p < 0.001";
  return `p = ${p.toFixed(3)}`;
}

function HeadlineStrip() {
  const cells = [
    { num: STUDY_META.totalConversations, label: "DevGPT Prompts", tint: "clay-pill-mint" },
    { num: STUDY_META.vendors,            label: "Top-Tier Vendors", tint: "clay-pill-peach" },
    { num: STUDY_META.totalOutputs,       label: "Graded Outputs", tint: "clay-pill-blue" },
    { num: STUDY_META.modes,              label: "Prompt Conditions", tint: "clay-pill-lavender" },
  ];
  return (
    <div className="max-w-6xl mx-auto mb-12">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
        {cells.map((s) => (
          <div key={s.label} className="clay-card p-6 text-center">
            <span className={`clay-pill ${s.tint} mb-3 mx-auto text-[10px]`}>
              {s.label}
            </span>
            <p className="font-display text-3xl sm:text-4xl font-bold tabular-nums text-[var(--color-text)] leading-none">
              {s.num.toLocaleString()}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function VendorEffectCards() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto mb-12">
      {VENDOR_EFFECTS.map((effect, i) => {
        const meta = VENDORS[effect.vendor];
        const tint = VENDOR_TINT[effect.vendor];
        return (
          <motion.div
            key={effect.vendor}
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1, duration: 0.5, ease: "easeOut" }}
            viewport={{ once: true }}
            className="clay-card p-7"
          >
            <div className="flex items-start justify-between mb-5">
              <div className={`clay-icon ${tint}`}>
                <VendorLogo vendor={effect.vendor} size={22} />
              </div>
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-text-muted)] mt-2">
                {formatP(effect.pValue)}
              </span>
            </div>

            <h3 className="font-display text-xl font-bold text-[var(--color-text)] leading-tight">
              {meta.displayName}
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] mt-1 mb-6 font-semibold">
              {meta.vendor}
            </p>

            <div className="flex items-end gap-2 mb-1">
              <span className="font-display text-5xl font-bold tabular-nums leading-none text-[var(--color-cta)]">
                +{effect.delta.toFixed(2)}
              </span>
              <span className="text-sm text-[var(--color-text-muted)] mb-1 font-semibold">/ 4.0</span>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] flex items-center gap-1.5 font-semibold">
              <TrendingUp className="w-3.5 h-3.5 text-[var(--color-cta)]" strokeWidth={2.5} />
              Engineered lift · Cohen&rsquo;s d ={" "}
              <span className="font-mono font-bold text-[var(--color-text)]">{effect.cohenD.toFixed(2)}</span>
            </p>

            <div className="mt-6 space-y-3">
              <MiniBar label="Zero"        value={effect.zeroMean}       max={4} color="#94A3B8" />
              <MiniBar label="Engineered"  value={effect.engineeredMean} max={4} color="var(--color-cta)" />
            </div>

            <div className="mt-6 pt-5 border-t-2 border-dashed border-[var(--color-border)] grid grid-cols-2 gap-4 text-xs">
              <div>
                <p className="text-[var(--color-text-muted)] text-[10px] uppercase tracking-[0.18em] font-bold mb-1">
                  Success · zero
                </p>
                <p className="font-mono text-[var(--color-text-muted)] tabular-nums font-bold">
                  {(effect.successRateZero * 100).toFixed(0)}%
                </p>
              </div>
              <div>
                <p className="text-[var(--color-text-muted)] text-[10px] uppercase tracking-[0.18em] font-bold mb-1">
                  Success · eng
                </p>
                <p className="font-mono tabular-nums font-bold text-[var(--color-cta-dark)]">
                  {(effect.successRateEng * 100).toFixed(0)}%
                </p>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

function MiniBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = (value / max) * 100;
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] mb-1.5">
        <span className="text-[var(--color-text-muted)] uppercase tracking-[0.14em] font-bold">{label}</span>
        <span className="font-mono tabular-nums font-bold text-[var(--color-text)]">{value.toFixed(2)}</span>
      </div>
      <div className="h-2.5 bg-[var(--color-border)] rounded-full border-2 border-[var(--color-text)] overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          whileInView={{ width: `${pct}%` }}
          transition={{ duration: 0.9, ease: [0.22, 0.61, 0.36, 1] }}
          viewport={{ once: true }}
          className="h-full"
          style={{ background: color }}
        />
      </div>
    </div>
  );
}

function GroupedBarChartView() {
  const data = VENDOR_EFFECTS.map((e) => ({
    name: VENDORS[e.vendor].shortName,
    Zero: e.zeroMean,
    Engineered: e.engineeredMean,
  }));

  return (
    <div className="max-w-4xl mx-auto clay-card p-6 sm:p-8 mb-12">
      <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
        <h3 className="font-display text-xl sm:text-2xl font-bold text-[var(--color-text)]">
          Mean Score · Prompt Condition × Vendor
        </h3>
        <span className="clay-pill clay-pill-mint font-mono text-[10px]">n = 200</span>
      </div>
      <p className="text-sm text-[var(--color-text-muted)] mb-7 leading-relaxed max-w-2xl">
        Higher is better. Score 0–4 across a four-axis rubric (code present, addresses task, looks correct, follows structure).
      </p>
      <ResponsiveContainer width="100%" height={290}>
        <BarChart data={data} barGap={6} barCategoryGap={60}>
          <CartesianGrid strokeDasharray="3 4" stroke="rgba(45,55,72,0.10)" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fill: "#2D3748", fontSize: 13, fontWeight: 700 }}
            axisLine={{ stroke: "var(--color-text)", strokeWidth: 1.5 }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "#475569", fontSize: 12, fontWeight: 600 }}
            axisLine={false}
            tickLine={false}
            domain={[0, 4]}
          />
          <Tooltip
            contentStyle={{
              background: "#FFFFFF",
              border: "2.4px solid #2D3748",
              borderRadius: 14,
              fontSize: 12,
              color: "#2D3748",
              fontWeight: 600,
              boxShadow: "4px 4px 0 #2D3748",
            }}
            cursor={{ fill: "rgba(45,55,72,0.04)" }}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, paddingTop: 12, color: "#2D3748", fontWeight: 700 }}
            iconType="square"
            iconSize={10}
          />
          <Bar dataKey="Zero"       fill="#94A3B8"           stroke="var(--color-text)" strokeWidth={1.5} radius={[6, 6, 0, 0]} />
          <Bar dataKey="Engineered" fill="var(--color-cta)"  stroke="var(--color-text)" strokeWidth={1.5} radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function KappaHeatmap() {
  const colorFor = (v: number) => {
    if (v >= 0.999) return "var(--color-base-2)";
    if (v >= 0.6)   return "var(--color-cta)";
    if (v >= 0.4)   return "var(--color-accent-mint)";
    if (v >= 0.2)   return "var(--color-accent-amber)";
    return "var(--color-coral-tint)";
  };

  return (
    <div className="max-w-3xl mx-auto clay-card p-6 sm:p-8 mb-12">
      <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
        <h3 className="font-display text-xl sm:text-2xl font-bold text-[var(--color-text)]">
          Cross-Model Agreement · Cohen&rsquo;s κ
        </h3>
        <span className="clay-pill clay-pill-blue font-mono text-[10px]">binary success ≥ 3</span>
      </div>
      <p className="text-sm text-[var(--color-text-muted)] mb-7 leading-relaxed">
        Higher κ = vendors agree on which prompts succeed. κ &gt; 0.6 ≈ substantial agreement, κ 0.4–0.6 ≈ moderate.
      </p>

      <div className="grid grid-cols-[100px_repeat(3,1fr)] gap-3 max-w-md mx-auto">
        <div />
        {KAPPA_LABELS.map((v) => (
          <div key={v} className="text-center font-display text-sm font-bold text-[var(--color-text)] tracking-tight">
            {VENDORS[v].shortName}
          </div>
        ))}
        {KAPPA_MATRIX.map((row, ri) => (
          <Fragment key={ri}>
            <div className="text-right font-display text-sm font-bold text-[var(--color-text)] tracking-tight pr-2 self-center">
              {VENDORS[KAPPA_LABELS[ri]].shortName}
            </div>
            {row.map((v, ci) => (
              <motion.div
                key={ci}
                initial={{ opacity: 0, scale: 0.85 }}
                whileInView={{ opacity: 1, scale: 1 }}
                transition={{ delay: (ri + ci) * 0.06, duration: 0.45, ease: "easeOut" }}
                viewport={{ once: true }}
                className="aspect-square flex items-center justify-center font-mono text-base font-bold tabular-nums"
                style={{
                  background: colorFor(v),
                  color: "#2D3748",
                  border: "2.4px solid #2D3748",
                  borderRadius: 16,
                  boxShadow: v >= 0.999 ? "none" : "3px 3px 0 #2D3748",
                }}
              >
                {v.toFixed(2)}
              </motion.div>
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function Fragment(props: { children: React.ReactNode }) {
  return <>{props.children}</>;
}

function LanguageEffectChart() {
  const data = LANGUAGE_EFFECTS.map((e) => ({
    name: `${e.language} (n=${e.n})`,
    Kimi: e.kimi,
    Claude: e.claude,
    Gemini: e.gemini,
  }));
  return (
    <div className="max-w-5xl mx-auto clay-card p-6 sm:p-8 mb-12">
      <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
        <h3 className="font-display text-xl sm:text-2xl font-bold text-[var(--color-text)]">
          Engineered-Prompt Lift × Programming Language
        </h3>
        <span className="clay-pill clay-pill-amber font-mono text-[10px]">7 langs</span>
      </div>
      <p className="text-sm text-[var(--color-text-muted)] mb-7 leading-relaxed max-w-3xl">
        Mean score lift (engineered − zero) per language. Effect is positive across every vendor and every language tested.
      </p>
      <ResponsiveContainer width="100%" height={340}>
        <BarChart data={data} layout="vertical" margin={{ left: 20, right: 30, top: 5, bottom: 5 }}>
          <CartesianGrid horizontal={false} strokeDasharray="3 4" stroke="rgba(45,55,72,0.10)" />
          <XAxis
            type="number"
            tick={{ fill: "#475569", fontSize: 12, fontWeight: 600 }}
            axisLine={false}
            domain={[0, 1.5]}
          />
          <YAxis
            dataKey="name"
            type="category"
            tick={{ fill: "#2D3748", fontSize: 12, fontWeight: 600 }}
            axisLine={false}
            tickLine={false}
            width={120}
          />
          <Tooltip
            contentStyle={{
              background: "#FFFFFF",
              border: "2.4px solid #2D3748",
              borderRadius: 14,
              fontSize: 12,
              color: "#2D3748",
              fontWeight: 600,
              boxShadow: "4px 4px 0 #2D3748",
            }}
            cursor={{ fill: "rgba(45,55,72,0.04)" }}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, paddingTop: 12, color: "#2D3748", fontWeight: 700 }}
            iconType="square"
            iconSize={10}
          />
          <Bar dataKey="Kimi"   fill={VENDORS.kimi.accentHex}   stroke="var(--color-text)" strokeWidth={1.4} radius={[0, 4, 4, 0]} barSize={11} />
          <Bar dataKey="Claude" fill={VENDORS.claude.accentHex} stroke="var(--color-text)" strokeWidth={1.4} radius={[0, 4, 4, 0]} barSize={11} />
          <Bar dataKey="Gemini" fill={VENDORS.gemini.accentHex} stroke="var(--color-text)" strokeWidth={1.4} radius={[0, 4, 4, 0]} barSize={11} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function Takeaway() {
  return (
    <div className="max-w-4xl mx-auto px-4">
      <div className="clay-card clay-tint-mint p-8 sm:p-10 text-center">
        <p className="font-display text-2xl sm:text-3xl md:text-4xl font-bold text-[var(--color-text)] leading-[1.2]">
          Across <span className="text-[var(--color-cta-dark)]">{STUDY_META.totalConversations}</span> real DevGPT
          prompts and 3 vendors, structured prompt engineering raises code-quality scores by{" "}
          <span className="text-[var(--color-cta-dark)]">
            +{(((VENDOR_EFFECTS.reduce((a, b) => a + b.delta, 0) / VENDOR_EFFECTS.length) / 4) * 100).toFixed(0)}%
          </span>{" "}
          on average.
        </p>
        <p className="text-base mt-5 max-w-2xl mx-auto leading-relaxed font-semibold" style={{ color: "var(--color-text-muted)" }}>
          Effect is universal — every vendor, every programming language, every prompt condition tested.
        </p>
      </div>
    </div>
  );
}

export function CrossModelSection() {
  return (
    <section id="cross-model" data-snap className="py-16 sm:py-24 px-4" style={{ background: "var(--color-bg-cream)" }}>
      <SectionHeading
        eyebrow="Cross-Model Generalization"
        eyebrowTint="blue"
        title="Does the Effect Hold Beyond One LLM?"
        subtitle="We replayed 200 DevGPT prompts through three top-tier models from three different vendors."
      />

      <ScrollReveal>
        <HeadlineStrip />
      </ScrollReveal>

      <ScrollReveal delay={0.1}>
        <VendorEffectCards />
      </ScrollReveal>

      <ScrollReveal delay={0.15}>
        <GroupedBarChartView />
      </ScrollReveal>

      <ScrollReveal delay={0.2}>
        <KappaHeatmap />
      </ScrollReveal>

      <ScrollReveal delay={0.25}>
        <LanguageEffectChart />
      </ScrollReveal>

      <ScrollReveal delay={0.3}>
        <Takeaway />
      </ScrollReveal>
    </section>
  );
}
