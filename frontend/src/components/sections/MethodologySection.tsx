"use client";

import { Database, Search, Tag, BarChart3 } from "lucide-react";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ScrollReveal } from "@/components/ui/ScrollReveal";

const steps = [
  {
    icon: Database,
    title: "Data Collection",
    description:
      "Parsed DevGPT JSON across 10 snapshots. Filtered to Status 200, normalized text, removed duplicates, and split user prompts from assistant responses.",
    detail: "54,449 turns · 6,413 convos",
    tint: "clay-tint-mint",
    pillTint: "clay-pill-mint",
  },
  {
    icon: Search,
    title: "Pattern Extraction",
    description:
      "Applied 8 regex pattern detectors to every prompt: constraints, examples, role instructions, output format, specification clarity, refinement, positive ack, negative ack.",
    detail: "8 patterns × 54k turns",
    tint: "clay-tint-peach",
    pillTint: "clay-pill-peach",
  },
  {
    icon: Tag,
    title: "Success Labelling",
    description:
      "A conversation is successful when the assistant produced code AND the developer expressed no negative feedback. This optimistic heuristic yields a 55% base success rate.",
    detail: "3,529 succeeded · 2,884 failed",
    tint: "clay-tint-lavender",
    pillTint: "clay-pill-lavender",
  },
  {
    icon: BarChart3,
    title: "Logistic Regression",
    description:
      "Fit a balanced logistic regression with 11 prompt-engineering features plus controls. 5-fold stratified cross-validation. Statsmodels for confidence intervals and p-values.",
    detail: "AUC = 0.799 · F1 = 0.755",
    tint: "clay-tint-blue",
    pillTint: "clay-pill-blue",
  },
];

export function MethodologySection() {
  return (
    <section id="methodology" data-snap className="px-4">
      <SectionHeading
        eyebrow="How We Did It"
        eyebrowTint="lavender"
        title="From Raw Conversations to Statistical Insight"
        subtitle="A four-stage analysis pipeline. Reproducible, granular, peer-reviewable."
      />

      <div className="max-w-3xl mx-auto grid grid-cols-1 gap-3">
        {steps.map((step, i) => (
          <ScrollReveal key={step.title} delay={i * 0.08}>
            <div className="clay-card p-4">
              <div className="flex items-start gap-4">
                <div className={`clay-icon ${step.tint} flex-shrink-0`}>
                  <step.icon className="w-5 h-5 text-[var(--color-text)]" strokeWidth={2.2} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1 flex-wrap">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--color-text-muted)" }}>
                      Step {i + 1}
                    </span>
                    <h3 className="font-display text-base sm:text-lg font-bold" style={{ color: "var(--color-text)" }}>
                      {step.title}
                    </h3>
                    <span className={`clay-pill ${step.pillTint} font-mono text-[10px] ml-auto`}>
                      {step.detail}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
                    {step.description}
                  </p>
                </div>
              </div>
            </div>
          </ScrollReveal>
        ))}
      </div>
    </section>
  );
}
