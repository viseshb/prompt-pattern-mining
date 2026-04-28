"use client";

import { ClipboardCheck } from "lucide-react";
import { validation } from "@/data/validation";

export function ValidationCard() {
  const isPreliminary = validation.preliminary;

  return (
    <div className={`clay-card p-6 sm:p-7 ${isPreliminary ? "clay-tint-amber" : "clay-tint-mint"}`}>
      <div className="flex items-start gap-4">
        <div className="clay-icon w-11 h-11 flex-shrink-0" style={{ borderRadius: 12, background: "#FFFFFF" }}>
          <ClipboardCheck className="w-5 h-5 text-[var(--color-text)]" strokeWidth={2.4} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between flex-wrap gap-2 mb-1">
            <h3 className="font-display text-lg font-bold text-[var(--color-text)]">
              Manual Validation of Auto-Labels
            </h3>
            <span className="clay-pill font-mono text-[10px]" style={{ background: "#FFFFFF" }}>
              n_sampled = {validation.nTotalSampled}
            </span>
          </div>
          <p className="text-sm leading-relaxed mb-4" style={{ color: "var(--color-text-muted)" }}>
            A stratified 200-conversation random sample of the auto-labeled success/failure outcomes.
            Each item re-labeled against the protocol; Cohen&rsquo;s κ measures agreement between the
            manual review and the auto-label heuristic.
          </p>

          {isPreliminary ? (
            <div className="rounded-xl border-2 border-[var(--color-text)] bg-white px-4 py-3" style={{ boxShadow: "3px 3px 0 var(--color-text)" }}>
              <p className="text-[11px] uppercase tracking-[0.14em] font-bold mb-1" style={{ color: "var(--color-text-muted)" }}>
                Preliminary
              </p>
              <p className="text-sm font-semibold leading-relaxed text-[var(--color-text)]">
                {validation.nLabeled} of {validation.nTotalSampled} samples labeled. κ withheld
                until ≥ 30 paired labels are entered to avoid over-claiming on a small subset.
                Protocol and sample CSV are committed under{" "}
                <span className="font-mono text-xs">{validation.protocolPath}</span>.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Cohen's κ"     value={validation.kappa?.toFixed(3) ?? "—"} />
              <Stat label="Agreement"     value={validation.agreementPct != null ? `${validation.agreementPct.toFixed(1)}%` : "—"} />
              <Stat label="Disagreements" value={validation.disagreements?.toString() ?? "—"} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border-2 border-[var(--color-text)] bg-white px-3 py-2.5 text-center" style={{ boxShadow: "3px 3px 0 var(--color-text)" }}>
      <p className="text-[10px] uppercase tracking-[0.14em] font-bold" style={{ color: "var(--color-text-muted)" }}>{label}</p>
      <p className="font-display text-xl font-bold tabular-nums text-[var(--color-text)] mt-1">{value}</p>
    </div>
  );
}
