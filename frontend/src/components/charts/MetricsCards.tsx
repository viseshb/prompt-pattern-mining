"use client";
import { motion, useMotionValue, animate } from "framer-motion";
import { useEffect, useState } from "react";
import { Target, TrendingUp, CheckCircle, Users } from "lucide-react";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { modelMetrics } from "@/data/modelMetrics";

function AnimatedNumber({ value, decimals = 3 }: { value: number; decimals?: number }) {
  const motionValue = useMotionValue(0);
  const [display, setDisplay] = useState("0");
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (!inView) return;
    const controls = animate(motionValue, value, { duration: 1.6, ease: "easeOut" });
    const unsub = motionValue.on("change", (v) => setDisplay(v.toFixed(decimals)));
    return () => { controls.stop(); unsub(); };
  }, [inView, value, decimals, motionValue]);

  return (
    <motion.span onViewportEnter={() => setInView(true)} viewport={{ once: true }}>
      {display}
    </motion.span>
  );
}

const metrics = [
  { icon: Target,      label: "ROC-AUC",       value: modelMetrics.cross_validation.roc_auc_mean,  decimals: 3, tint: "clay-tint-mint" },
  { icon: TrendingUp,  label: "F1 Score",      value: modelMetrics.cross_validation.f1_mean,       decimals: 3, tint: "clay-tint-peach" },
  { icon: CheckCircle, label: "Accuracy",      value: modelMetrics.cross_validation.accuracy_mean, decimals: 3, tint: "clay-tint-blue" },
  { icon: Users,       label: "Conversations", value: modelMetrics.n_observations,                 decimals: 0, tint: "clay-tint-lavender" },
];

export function MetricsCards() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-5 sm:gap-6 mb-2">
      {metrics.map((m, i) => {
        const Icon = m.icon;
        return (
          <ScrollReveal key={m.label} delay={i * 0.08}>
            <div className="clay-card p-6 text-center">
              <div className={`clay-icon ${m.tint} mx-auto mb-4`}>
                <Icon className="w-5 h-5 text-[var(--color-text)]" strokeWidth={2.4} />
              </div>
              <div className="font-display text-3xl sm:text-4xl font-bold tabular-nums leading-none mb-2 text-[var(--color-text)]">
                <AnimatedNumber value={m.value} decimals={m.decimals} />
              </div>
              <p className="text-[11px] uppercase tracking-[0.18em] font-bold text-[var(--color-text-muted)]">
                {m.label}
              </p>
            </div>
          </ScrollReveal>
        );
      })}
    </div>
  );
}
