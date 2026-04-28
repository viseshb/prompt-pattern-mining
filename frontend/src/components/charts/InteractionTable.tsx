"use client";

import { motion } from "framer-motion";
import { interactions } from "@/data/interactions";

function formatP(p: number): string {
  if (p < 0.001) return "<0.001";
  return p.toFixed(3);
}

export function InteractionTable() {
  const significant = interactions.rows.filter((r) => r.significant);
  const nonSig = interactions.rows.filter((r) => !r.significant);

  return (
    <div className="clay-card p-6 sm:p-8">
      <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
        <h3 className="font-display text-xl sm:text-2xl font-bold text-[var(--color-text)]">
          Pre-Registered Interaction Effects
        </h3>
        <span className="clay-pill clay-pill-lavender font-mono text-[10px]">
          n = {interactions.n.toLocaleString()}
        </span>
      </div>
      <p className="text-sm leading-relaxed mb-6 max-w-2xl" style={{ color: "var(--color-text-muted)" }}>
        Four 2-way interactions chosen up-front (no blanket screening) to test whether prompt structure
        compounds. Reported as fitted with all main effects in the same model.
      </p>

      <div className="space-y-3">
        {significant.map((row, i) => (
          <motion.div
            key={row.term}
            initial={{ opacity: 0, x: -10 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.07, duration: 0.4 }}
            viewport={{ once: true }}
            className="rounded-2xl border-2 border-[var(--color-text)] px-4 py-3 flex items-center justify-between gap-4"
            style={{ background: row.or > 1 ? "var(--color-accent-mint)" : "var(--color-coral-tint)", boxShadow: "4px 4px 0 var(--color-text)" }}
          >
            <div className="min-w-0">
              <p className="font-display text-sm font-bold text-[var(--color-text)]">{row.label}</p>
              <p className="text-[11px] font-mono mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                95% CI [{row.ciLow.toFixed(2)}, {row.ciHigh.toFixed(2)}]
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="font-display text-2xl font-bold tabular-nums leading-none text-[var(--color-text)]">
                OR {row.or.toFixed(2)}
              </p>
              <p className="text-[11px] font-mono mt-1" style={{ color: "var(--color-text-muted)" }}>
                p {formatP(row.pValue)}
              </p>
            </div>
          </motion.div>
        ))}

        {nonSig.length > 0 && (
          <div className="pt-3 border-t-2 border-dashed border-[var(--color-border)]">
            <p className="text-[10px] uppercase tracking-[0.18em] font-bold mb-2" style={{ color: "var(--color-text-muted)" }}>
              Tested · Not Significant
            </p>
            {nonSig.map((row) => (
              <p key={row.term} className="text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>
                {row.label} · OR {row.or.toFixed(2)} · p = {formatP(row.pValue)}
              </p>
            ))}
          </div>
        )}
      </div>

      <p className="mt-5 text-[11px] font-semibold leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
        Headline: <span className="font-bold" style={{ color: "var(--color-text)" }}>Role × Output Format OR 5.28</span>{" "}
        — the negative role-instruction main effect (OR 0.65) flips strongly positive when the prompt
        also specifies an output format.
      </p>
    </div>
  );
}
