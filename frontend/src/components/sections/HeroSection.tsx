"use client";

import { motion } from "framer-motion";
import { ArrowRight, GraduationCap, Mail } from "lucide-react";
import { coefficients } from "@/data/coefficients";
import { datasetOverview } from "@/data/datasetOverview";
import { modelMetrics } from "@/data/modelMetrics";

const authors = [
  { name: "Teja Reddy Mandadi", email: "tmand02@jaguar.tamu.edu", initial: "T", tint: "clay-tint-peach" },
  { name: "Visesh Bentula", email: "vbent01@jaguar.tamu.edu", initial: "V", tint: "clay-tint-blue" },
  { name: "Umapathi Konduri", email: "ukond01@jaguar.tamu.edu", initial: "U", tint: "clay-tint-lavender" },
];

const heroStats = [
  { value: datasetOverview.totalTurns.toLocaleString(), label: "Conversation Turns" },
  { value: coefficients.length.toString(), label: "Features" },
  { value: modelMetrics.cross_validation.roc_auc_mean.toFixed(2), label: "ROC-AUC" },
];

export function HeroSection() {
  return (
    <section
      id="hero"
      data-snap
      className="relative px-4"
      style={{ background: "var(--color-bg-cream)" }}
    >
      <div className="max-w-5xl mx-auto text-center w-full mt-6 sm:mt-10 lg:mt-[50px]">
        <motion.span
          className="clay-pill clay-pill-mint mb-3"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <span className="w-2 h-2 rounded-full bg-[var(--color-cta)]" />
          Graduate Seminar Research · Spring 2026
        </motion.span>

        <motion.h1
          className="font-display text-3xl sm:text-4xl md:text-5xl font-bold text-[var(--color-text)] mb-3 leading-[1.05]"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          Prompt Pattern Mining{" "}
          <span className="text-[var(--color-cta)]">in Vibe Coding</span>
        </motion.h1>

        <motion.p
          className="text-sm sm:text-base mb-5 max-w-2xl mx-auto leading-relaxed"
          style={{ color: "var(--color-text-muted)" }}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.2 }}
        >
          Mining structural prompt patterns from{" "}
          <span className="font-bold" style={{ color: "var(--color-text)" }}>
            {datasetOverview.totalTurns.toLocaleString()} ChatGPT coding turns
          </span>{" "}
          across{" "}
          <span className="font-bold" style={{ color: "var(--color-text)" }}>
            {datasetOverview.totalConversations.toLocaleString()} developer conversations
          </span>{" "}
          — replayed across three top-tier LLMs to test if the effect generalises.
        </motion.p>

        <motion.div
          className="flex flex-col sm:flex-row gap-3 justify-center mb-5"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.3 }}
        >
          <a href="#demo" className="btn-primary" style={{ padding: "8px 18px", fontSize: 13 }}>
            Try Live Demo
            <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
          </a>
          <a href="#results" className="btn-secondary" style={{ padding: "8px 18px", fontSize: 13 }}>
            See the Results
          </a>
        </motion.div>

        <motion.div
          className="flex gap-8 sm:gap-12 justify-center mb-5"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.4 }}
        >
          {heroStats.map((s) => (
            <div key={s.label} className="text-center">
              <div className="font-display text-2xl sm:text-3xl font-bold text-[var(--color-text)] tabular-nums leading-none mb-1">
                {s.value}
              </div>
              <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--color-text-muted)]">
                {s.label}
              </div>
            </div>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
        >
          <p className="text-[10px] uppercase tracking-[0.28em] font-bold mb-2" style={{ color: "var(--color-text-muted)" }}>
            Authors
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 max-w-3xl mx-auto mb-3">
            {authors.map((a) => (
              <div key={a.name} className="clay-card p-3 flex items-center gap-2.5 text-left">
                <div
                  className={`clay-icon ${a.tint} w-9 h-9 text-sm font-bold flex-shrink-0`}
                  style={{ borderRadius: 11 }}
                >
                  {a.initial}
                </div>
                <div className="min-w-0">
                  <p className="font-display text-[13px] font-bold text-[var(--color-text)] leading-tight truncate">
                    {a.name}
                  </p>
                  <p className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)] font-medium truncate">
                    <Mail className="w-2.5 h-2.5 flex-shrink-0" strokeWidth={2.4} />
                    <span className="truncate">{a.email}</span>
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="inline-flex items-center gap-2.5 clay-card px-4 py-2">
            <div className="clay-icon clay-tint-amber w-9 h-9" style={{ borderRadius: 11 }}>
              <GraduationCap className="w-4 h-4 text-[var(--color-text)]" strokeWidth={2.4} />
            </div>
            <div className="text-left">
              <p className="font-display text-[13px] font-bold text-[var(--color-text)] leading-tight">
                Texas A&amp;M University-San Antonio
              </p>
              <p className="text-[10px] text-[var(--color-text-muted)] font-semibold">
                Department of Computer Science
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
