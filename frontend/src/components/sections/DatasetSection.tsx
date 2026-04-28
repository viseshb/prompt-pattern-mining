"use client";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { useEffect, useState } from "react";
import { Database, MessageSquare, Calendar } from "lucide-react";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { SectionHeading } from "@/components/ui/SectionHeading";

function CountUp({ target }: { target: number }) {
  const [inView, setInView] = useState(false);
  const motionValue = useMotionValue(0);
  const rounded = useTransform(motionValue, (v) =>
    v >= 1000 ? Math.round(v).toLocaleString() : Math.round(v).toString()
  );
  const [display, setDisplay] = useState("0");

  useEffect(() => {
    if (!inView) return;
    const controls = animate(motionValue, target, { duration: 1.6, ease: "easeOut" });
    const unsub = rounded.on("change", (v) => setDisplay(v));
    return () => { controls.stop(); unsub(); };
  }, [inView, target, motionValue, rounded]);

  return (
    <motion.span
      onViewportEnter={() => setInView(true)}
      viewport={{ once: true }}
    >
      {display}
    </motion.span>
  );
}

const stats = [
  { icon: MessageSquare, value: 54449, label: "Conversation Turns",  tint: "clay-tint-mint" },
  { icon: Database,      value: 6413,  label: "Conversations",       tint: "clay-tint-peach" },
  { icon: Calendar,      value: 10,    label: "Dataset Snapshots",   tint: "clay-tint-blue" },
];

export function DatasetSection() {
  return (
    <section id="dataset" data-snap className="px-4" style={{ background: "var(--color-bg-cream)" }}>
      <SectionHeading
        eyebrow="The Dataset"
        eyebrowTint="peach"
        title="DevGPT — Real Developer Conversations"
        subtitle="Conversations between developers and ChatGPT, mined from GitHub PRs, issues, commits and Hacker News threads."
      />

      <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-6">
        {stats.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <ScrollReveal key={stat.label} delay={i * 0.1}>
              <div className="clay-card p-5 text-center">
                <div className={`clay-icon ${stat.tint} mx-auto mb-3`}>
                  <Icon className="w-5 h-5 text-[var(--color-text)]" strokeWidth={2.2} />
                </div>
                <div className="font-display text-3xl sm:text-4xl font-bold text-[var(--color-text)] tabular-nums leading-none mb-1.5">
                  <CountUp target={stat.value} />
                </div>
                <p className="text-[10px] uppercase tracking-[0.18em] font-bold" style={{ color: "var(--color-text-muted)" }}>
                  {stat.label}
                </p>
              </div>
            </ScrollReveal>
          );
        })}
      </div>

      <ScrollReveal delay={0.35}>
        <div className="max-w-3xl mx-auto mt-6">
          <div className="clay-card p-4 sm:p-5 clay-tint-cream">
            <p className="text-center text-sm text-[var(--color-text)] leading-relaxed">
              We analysed the{" "}
              <span className="font-bold">DevGPT dataset (v10)</span> — a curated archive of developer–ChatGPT
              conversations spanning{" "}
              <span className="font-bold">Aug 2023 – May 2024</span>. Every prompt filtered to{" "}
              <span className="font-bold">HTTP 200</span> and normalised.
            </p>
          </div>
        </div>
      </ScrollReveal>
    </section>
  );
}
