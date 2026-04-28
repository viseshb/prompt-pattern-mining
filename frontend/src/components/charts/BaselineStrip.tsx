"use client";

import { motion } from "framer-motion";
import { Crown } from "lucide-react";
import { baselines, baselinesMeta } from "@/data/baselines";
import { ScrollReveal } from "@/components/ui/ScrollReveal";

const TINTS: Record<string, string> = {
  majority:     "clay-tint-cream",
  random:       "clay-tint-cream",
  bow_logistic: "clay-tint-blue",
  our_model:    "clay-tint-mint",
};

export function BaselineStrip() {
  return (
    <ScrollReveal>
      <div className="clay-card p-6 sm:p-8">
        <div className="mb-2 flex items-baseline justify-between flex-wrap gap-2">
          <h3 className="font-display text-xl sm:text-2xl font-bold text-[var(--color-text)]">
            Where Does AUC 0.799 Land?
          </h3>
          <span className="clay-pill clay-pill-blue font-mono text-[10px]">
            n = {baselinesMeta.n.toLocaleString()} · {baselinesMeta.cv}
          </span>
        </div>
        <p className="text-sm leading-relaxed mb-6 max-w-2xl" style={{ color: "var(--color-text-muted)" }}>
          Same 5-fold CV, four classifiers. Structured prompt features beat a 2,000-feature bag-of-words
          baseline by 1.7 AUC points and a majority/random baseline by ~30 AUC points.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {baselines.map((b, i) => {
            const tint = TINTS[b.key];
            const isWinner = b.key === "our_model";
            return (
              <motion.div
                key={b.key}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06, duration: 0.45, ease: "easeOut" }}
                viewport={{ once: true }}
                className={`rounded-2xl border-2 border-[var(--color-text)] p-4 ${tint}`}
                style={{ boxShadow: "4px 4px 0 var(--color-text)" }}
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] uppercase tracking-[0.18em] font-bold" style={{ color: "var(--color-text-muted)" }}>
                    {b.label}
                  </p>
                  {isWinner && <Crown className="h-3.5 w-3.5 text-[var(--color-cta-dark)]" strokeWidth={2.5} />}
                </div>
                <p className="font-display text-3xl font-bold tabular-nums leading-none mb-2 text-[var(--color-text)]">
                  {b.auc.toFixed(3)}
                </p>
                <p className="text-[11px] leading-snug" style={{ color: "var(--color-text-muted)" }}>
                  {b.description}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </ScrollReveal>
  );
}
