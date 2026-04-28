"use client";

import Image from "next/image";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { MetricsCards } from "@/components/charts/MetricsCards";
import { OddsRatioChart } from "@/components/charts/OddsRatioChart";
import { FeatureDistributions } from "@/components/charts/FeatureDistributions";
import { LanguageSubgroups } from "@/components/charts/LanguageSubgroups";
import { BaselineStrip } from "@/components/charts/BaselineStrip";
import { AblationChart } from "@/components/charts/AblationChart";
import { TemporalDriftChart } from "@/components/charts/TemporalDriftChart";
import { InteractionTable } from "@/components/charts/InteractionTable";
import { ValidationCard } from "@/components/charts/ValidationCard";

const findings = [
  {
    eyebrow: "Output Format",
    pillTint: "clay-pill-mint",
    headline: "1.75×",
    body: "Prompts that include formatting instructions (JSON / markdown / table) succeed 1.75× more often (p < 0.001).",
  },
  {
    eyebrow: "Refinement",
    pillTint: "clay-pill-peach",
    headline: "+19%",
    body: "Each additional refinement turn raises success probability by 19% (OR = 1.19, p < 0.001).",
  },
  {
    eyebrow: "Role Prompts",
    pillTint: "clay-pill-blue",
    headline: "−35%",
    body: "Surprisingly, “act-as” role prompts are 35% less likely to succeed (OR = 0.65, p = 0.002).",
  },
];

export function ResultsSection() {
  return (
    <section id="results" data-snap className="py-16 sm:py-24 px-4">
      <SectionHeading
        eyebrow="Results"
        eyebrowTint="amber"
        title="What the 6,413 Conversations Tell Us"
        subtitle="Statistical analysis of prompt-engineering effects in real developer workflows."
      />

      <div className="max-w-6xl mx-auto space-y-10">
        <ScrollReveal>
          <MetricsCards />
        </ScrollReveal>

        <BaselineStrip />

        <ScrollReveal delay={0.1}>
          <OddsRatioChart />
        </ScrollReveal>

        <ScrollReveal delay={0.1}>
          <InteractionTable />
        </ScrollReveal>

        <ScrollReveal delay={0.15}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {findings.map((f) => (
              <div key={f.eyebrow} className="clay-card p-6">
                <span className={`clay-pill ${f.pillTint} mb-4`}>{f.eyebrow}</span>
                <p className="font-display text-4xl font-bold text-[var(--color-text)] mb-3 leading-none">
                  {f.headline}
                </p>
                <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </ScrollReveal>

        <ScrollReveal delay={0.1}>
          <ValidationCard />
        </ScrollReveal>

        <ScrollReveal delay={0.1}>
          <AblationChart />
        </ScrollReveal>

        <ScrollReveal delay={0.1}>
          <FeatureDistributions />
        </ScrollReveal>

        <ScrollReveal delay={0.1}>
          <TemporalDriftChart />
        </ScrollReveal>

        <ScrollReveal delay={0.1}>
          <div className="clay-card p-6 sm:p-8">
            <h3 className="font-display text-xl sm:text-2xl font-bold text-[var(--color-text)] mb-2">
              Feature Correlation Matrix
            </h3>
            <p className="text-sm text-[var(--color-text-muted)] mb-6 leading-relaxed">
              Spearman rank correlations between prompt features and success.
            </p>
            <div className="relative w-full max-w-2xl mx-auto rounded-2xl overflow-hidden border-2 border-[var(--color-text)]">
              <Image
                src="/data/figures/correlation_heatmap.png"
                alt="Feature correlation heatmap"
                width={900}
                height={700}
                className="w-full h-auto"
              />
            </div>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={0.1}>
          <LanguageSubgroups />
        </ScrollReveal>
      </div>
    </section>
  );
}
