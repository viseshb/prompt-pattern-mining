"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { BarChart3, ChevronDown, Eraser, Trophy } from "lucide-react";
import { VendorLogo } from "@/components/ui/VendorLogo";
import { VENDORS, type Vendor } from "@/data/multiModelStudy";
import { SYSTEM_PROMPTS } from "@/lib/constants";
import { type ComparativeAnalysis, type PromptEvidence, type ResponseSignalKind, type ResponseStructure } from "@/lib/livePromptFeatures";

export interface SignalFeedItem {
  id: string;
  kind: ResponseSignalKind;
  label: string;
  ts: number;
}

export interface RacePanelState {
  text: string;
  status: "idle" | "streaming" | "done" | "error";
  startTs: number | null;
  endTs: number | null;
  charCount: number;
  finishedRank: number | null;
  features: ResponseStructure;
  signalFeed: SignalFeedItem[];
}

export interface RaceResult {
  id: string;
  prompt: string;
  startedAt: number;
  promptEvidence: PromptEvidence;
  vendors: Record<
    Vendor,
    {
      structureScore: 0 | 1 | 2 | 3 | 4;
      features: ResponseStructure;
      timeMs: number;
      charsPerSec: number;
      inputTokens: number;
      outputTokens: number;
      estimatedCostUsd: number;
      status: "done" | "error";
      judgedByHaiku: boolean;
    }
  >;
  leaders: Vendor[];
  comparativeAnalysis: ComparativeAnalysis | null;
}

const VENDOR_TINT: Record<Vendor, string> = {
  kimi: "clay-tint-amber",
  claude: "clay-tint-peach",
  gemini: "clay-tint-blue",
};

export const SIGNAL_LABELS: Record<ResponseSignalKind, string> = {
  codeBlock: "Code Block detected",
  heading: "Heading detected",
  numberedStep: "Numbered Steps detected",
  bulletList: "Bullet List detected",
  table: "Table detected",
  example: "Example detected",
  constraint: "Constraint phrase detected",
};

const PLAIN_SECTION_LABELS = new Set([
  "CLARIFY",
  "APPROACH",
  "APPROACH COMPARISON",
  "CODE",
  "ANALYZE",
  "TEST",
  "EXPLAIN",
  "DATA STRUCTURE",
  "DATA STRUCTURE CHOICE",
  "PROBLEM CLARIFICATION",
]);

function normalizeRaceMarkdown(text: string): string {
  if (!text) return text;

  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const normalized: string[] = [];
  let inCodeFence = false;
  let blankRun = 0;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    if (trimmed.startsWith("```")) {
      inCodeFence = !inCodeFence;
      normalized.push(trimmed);
      blankRun = 0;
      continue;
    }

    if (inCodeFence) {
      normalized.push(rawLine);
      blankRun = trimmed === "" ? blankRun + 1 : 0;
      continue;
    }

    if (trimmed === "") {
      if (blankRun < 1) normalized.push("");
      blankRun += 1;
      continue;
    }

    blankRun = 0;
    const plainLabel = trimmed.replace(/:$/, "").trim();

    if (
      !plainLabel.startsWith("#") &&
      !plainLabel.startsWith("-") &&
      !plainLabel.startsWith("*") &&
      !/^\d+\./.test(plainLabel) &&
      PLAIN_SECTION_LABELS.has(plainLabel.toUpperCase())
    ) {
      normalized.push(`# ${plainLabel}`);
      continue;
    }

    normalized.push(rawLine.replace(/\$([^$\n]+)\$/g, "$1").replace(/\s{2,}$/, ""));
  }

  return normalized.join("\n").trim();
}

function formatPValue(pValue: number | null): string {
  if (pValue == null) return "n/a";
  if (pValue < 0.001) return "p<0.001";
  if (pValue < 0.01) return `p=${pValue.toFixed(3)}`;
  return `p=${pValue.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}`;
}

function formatOverallScore(score: number): string {
  return `${score} / 5`;
}

function formatTimeMs(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatMoney(value: number): string {
  if (value <= 0) return "$0.0000";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

function formatPromptPreview(prompt: string): string {
  return prompt.length > 88 ? `${prompt.slice(0, 85)}...` : prompt;
}

// Winner = vendor with the highest overallScore. Trust the numeric scoreboard
// over the judge's free-text "winner" field, which can disagree with its own scores.
function getWinnerVendor(race: RaceResult): Vendor | null {
  const leader = race.leaders[0];
  if (leader) return leader;
  const haikuWinner = race.comparativeAnalysis?.winner;
  if (haikuWinner && (VENDORS as Record<string, unknown>)[haikuWinner]) return haikuWinner as Vendor;
  return null;
}

function getWinnerLabel(race: RaceResult): string {
  const winner = getWinnerVendor(race);
  return winner ? VENDORS[winner].shortName : "Analysis pending";
}

function trimToCompleteSentence(text: string): string {
  const trimmed = text.trim();
  if (trimmed.endsWith(".") || trimmed.endsWith("!") || trimmed.endsWith("?")) return trimmed;
  // If model wrote a partial like "...while Gemini's", clip back to the last
  // sentence-ending punctuation. Match terminal punct followed by whitespace
  // (or end-of-string) so decimals like "2.6x" or "O(n^2)" aren't misread as
  // sentence ends.
  const matches = [...trimmed.matchAll(/[.!?](?=\s|$)/g)];
  const lastTerm = matches.length > 0 ? matches[matches.length - 1].index ?? -1 : -1;
  if (lastTerm > 0) return trimmed.slice(0, lastTerm + 1);
  return trimmed + "...";
}

function getWinnerReason(race: RaceResult): string {
  const winner = getWinnerVendor(race);
  const haikuWinner = race.comparativeAnalysis?.winner as Vendor | undefined;
  const haikuReason = race.comparativeAnalysis?.winnerReason;
  if (winner && haikuWinner === winner && haikuReason && haikuReason.trim().length > 0) {
    return trimToCompleteSentence(stripMathDelimiters(haikuReason));
  }
  if (winner && race.comparativeAnalysis) {
    const judgment = race.comparativeAnalysis.modelJudgments[winner];
    const score = judgment?.overallScore;
    if (score != null) {
      return `Top value score ${score}/5 across the rubric (quality, complexity, structure, cost-efficiency).`;
    }
  }
  return "Highest overall score across the rubric.";
}

function formatMissingList(items: string[]): string {
  return items.length > 0
    ? items.slice(0, 3).map((item) => stripMathDelimiters(item)).join("; ")
    : "No major gaps detected.";
}

const PAPER_FINDING = "Engineered prompts raise success rate +14-24 pp · Cohen's d 0.59-0.80 · p<1e-12";

function countOutputsContainingFeature(race: RaceResult, featureKey: string): number {
  return (["kimi", "claude", "gemini"] as Vendor[]).filter((vendor) => {
    const f = race.vendors[vendor].features;
    if (!f) return false;
    switch (featureKey) {
      case "has_output_format_first":
        return f.codeBlocks > 0 || f.headings > 0 || f.numberedSteps > 0 || f.tables > 0;
      case "first_specification_clarity_count":
        return f.headings > 0 || f.numberedSteps > 0;
      case "total_example_count":
        return f.examples > 0;
      case "first_constraint_count":
        return f.constraints > 0;
      case "has_role_instruction_first":
        return false;
      case "refinement_turns":
        return false;
      default:
        return false;
    }
  }).length;
}

function stripMathDelimiters(text: string): string {
  return text.replace(/\$([^$\n]+)\$/g, "$1").replace(/\s+/g, " ").trim();
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

function estimateOutputTokens(text: string): number {
  return Math.round(countWords(text) / 0.75);
}

function estimateTokenRate(text: string, elapsedMs: number): number {
  if (elapsedMs <= 0) return 0;
  return estimateOutputTokens(text) / (elapsedMs / 1000);
}

function toneForOddsRatio(oddsRatio: number): string {
  if (oddsRatio > 1) return "clay-pill-mint";
  if (oddsRatio < 1) return "clay-pill-peach";
  return "clay-pill-blue";
}


function tierColor(score: number): string {
  if (score <= 2) return "var(--color-coral)";   // red — weak
  if (score <= 4) return "var(--color-amber)";   // yellow — middling
  return "var(--color-cta)";                      // green — top
}

function TierPill({ score }: { score: number }) {
  // Map overallScore (1-5) to a tier label + tint.
  const tier =
    score >= 5 ? { label: "Best-in-class", tint: "var(--color-cta)",        text: "white" } :
    score >= 4 ? { label: "Strong",        tint: "var(--color-accent-mint)", text: "var(--color-text)" } :
    score >= 3 ? { label: "Acceptable",    tint: "var(--color-amber-tint)",  text: "var(--color-text)" } :
    score >= 2 ? { label: "Weak",          tint: "var(--color-coral-tint)",  text: "var(--color-text)" } :
                 { label: "Poor",          tint: "var(--color-coral)",       text: "white" };
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border-2 border-[var(--color-text)] px-2.5 py-0.5 text-[10px] font-bold tracking-tight"
      style={{
        background: tier.tint,
        color: tier.text,
        boxShadow: "2px 2px 0 var(--color-text)",
      }}
      aria-label={`Tier: ${tier.label} (overall score ${score} of 5)`}
    >
      {tier.label}
    </span>
  );
}

function RubricChip({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border-2 border-[var(--color-text)] px-2 py-0.5 text-[10px] font-bold tracking-tight"
      style={{
        background: active ? "var(--color-accent-mint)" : "var(--color-coral-tint)",
        color: "var(--color-text)",
        boxShadow: "2px 2px 0 var(--color-text)",
      }}
      aria-label={`${label}: ${active ? "met" : "missing"}`}
    >
      <span aria-hidden>{active ? "✓" : "✗"}</span>
      {label}
    </span>
  );
}

function CompactStructureScoreBar({ features }: { features: ResponseStructure }) {
  const score = features.overallScore;
  const fill = tierColor(score);
  return (
    <div
      className="mt-3 grid grid-cols-5 gap-2"
      aria-label={`Value score ${score} out of 5`}
    >
      {Array.from({ length: 5 }).map((_, index) => {
        const active = index < score;
        return (
          <motion.div
            key={index}
            initial={{ opacity: 0.6, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.04 }}
            className="h-3 rounded-full border-2 border-[var(--color-text)]"
            style={{ background: active ? fill : "#FFFFFF" }}
          />
        );
      })}
    </div>
  );
}

export function DetectionBoard({ panels }: { panels: Record<Vendor, Pick<RacePanelState, "features">> }) {
  const hasDetections = Object.values(panels).some((panel) => {
    const { codeBlocks, headings, numberedSteps, bulletLists, tables, examples, constraints } = panel.features;
    return codeBlocks + headings + numberedSteps + bulletLists + tables + examples + constraints > 0;
  });
  if (!hasDetections) return null;

  return (
    <div className="mx-auto mt-6 max-w-7xl">
      <div className="clay-card overflow-hidden p-0">
        <div className="border-b-2 border-[var(--color-text)] bg-[var(--color-base-2)] px-6 py-4 text-center">
          <h3 className="font-display text-base font-bold text-black">Structure Signals</h3>
          <p className="mt-1 text-sm font-semibold text-black">
            Analysis of the final outputs.
          </p>
        </div>

        <div className="grid gap-4 bg-white p-5 md:grid-cols-3">
          {(["kimi", "claude", "gemini"] as Vendor[]).map((vendor) => {
            const { codeBlocks, headings, numberedSteps, bulletLists, tables, examples, constraints } = panels[vendor].features;
            const detectionRows = [
              { label: "Code", count: codeBlocks, kind: "codeBlock" as const },
              { label: "Headings", count: headings, kind: "heading" as const },
              { label: "Lists", count: numberedSteps + bulletLists, kind: "bulletList" as const },
              { label: "Tables", count: tables, kind: "table" as const },
              { label: "Examples", count: examples, kind: "example" as const },
              { label: "Constraints", count: constraints, kind: "constraint" as const },
            ];

            return (
              <div key={vendor} className="rounded-2xl border-2 border-[var(--color-text)] bg-white px-4 py-4 shadow-[4px_4px_0_var(--color-text)]">
                <div className="mb-3 flex items-center gap-2">
                  <div className="clay-icon h-9 w-9" style={{ borderRadius: 12, background: "#FFFFFF" }}>
                    <VendorLogo vendor={vendor} size={18} />
                  </div>
                  <p className="font-display text-sm font-bold text-[var(--color-text)]">{VENDORS[vendor].shortName}</p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {detectionRows.map(({ label, count }) => {
                    const isDetected = count > 0;
                    return (
                      <div
                        key={`${vendor}-${label}`}
                        className={`rounded-2xl border-2 border-[var(--color-text)] px-3 py-3 shadow-[3px_3px_0_var(--color-text)] ${
                          isDetected ? "bg-[var(--color-accent-mint)]" : "bg-[var(--color-coral-tint)]"
                        }`}
                      >
                        <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--color-text-muted)]">{label}</p>
                        <p className="mt-1 font-display text-2xl font-bold tabular-nums text-[var(--color-text)]">{count}</p>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {detectionRows.map(({ kind, count }) => {
                    const isDetected = count > 0;
                    const signalLabel = SIGNAL_LABELS[kind];

                    return (
                      <span
                        key={`${vendor}-${kind}-pill`}
                        className={`rounded-full border-2 border-[var(--color-text)] px-3 py-1.5 text-[11px] font-semibold shadow-[3px_3px_0_var(--color-text)] ${
                          isDetected ? "bg-[var(--color-accent-mint)]" : "bg-[var(--color-coral-tint)]"
                        }`}
                      >
                        {signalLabel}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function PromptEvidenceCard({ evidence, raceStartedAt }: { evidence: PromptEvidence; raceStartedAt: number | null }) {
  const [showPrompt, setShowPrompt] = useState(false);

  // Show only statistically significant signals (p < 0.05). Filters out noisy/insignificant features.
  const significant = evidence.detectedSignals.filter((s) => s.pValue != null && s.pValue < 0.05);

  return (
    <div className="mx-auto mb-8 max-w-6xl">
      <div className="clay-card overflow-hidden p-0">
        <div className="flex flex-col gap-4 border-b-2 border-[var(--color-text)] bg-[var(--color-accent-mint)] px-6 py-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 flex-wrap">
              <span className="clay-pill clay-pill-mint text-[10px]">
                <BarChart3 className="h-3 w-3" strokeWidth={2.4} />
                Paper Evidence
              </span>
              {raceStartedAt && (
                <span className="text-[11px] font-semibold text-[var(--color-text-muted)]">
                  Started {new Date(raceStartedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </span>
              )}
            </div>
            <h3 className="font-display text-lg font-bold text-[var(--color-text)]">Why this prompt works</h3>
            <p className="mt-1 max-w-3xl text-sm font-semibold leading-relaxed text-[var(--color-text-muted)]">
              The engineered system prompt embeds these features. Each card shows the regression-derived odds ratio from
              our 6,413-conversation analysis.
            </p>
            <p className="mt-2 text-[11px] font-semibold text-[var(--color-text-muted)]">
              Legend: <span className="font-bold text-[var(--color-cta-dark)]">OR &gt; 1</span> raises success ·{" "}
              <span className="font-bold text-[#B91C1C]">OR &lt; 1</span> lowers it ·{" "}
              <span className="font-bold">p &lt; 0.05</span> = statistically significant (shown only).
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowPrompt((v) => !v)}
            className="cursor-pointer rounded-2xl border-2 border-[var(--color-text)] bg-white px-4 py-3 text-left text-sm font-semibold text-[var(--color-text)] shadow-[4px_4px_0_var(--color-text)] transition hover:bg-[var(--color-base-2)] lg:min-w-[220px]"
            aria-expanded={showPrompt}
          >
            <span className="flex items-center justify-between gap-2">
              <span>
                <span className="block text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
                  System Prompt
                </span>
                <span className="font-display text-base font-bold">View full text</span>
              </span>
              <ChevronDown className={`h-4 w-4 transition-transform ${showPrompt ? "rotate-180" : ""}`} strokeWidth={2.5} />
            </span>
          </button>
        </div>

        <div className="flex flex-wrap gap-3 bg-white px-6 py-5">
          {significant.length > 0 ? (
            significant.map((signal) => (
              <div
                key={signal.feature}
                className={`rounded-2xl border-2 border-[var(--color-text)] px-4 py-3 shadow-[4px_4px_0_var(--color-text)] ${signal.oddsRatio > 1 ? "bg-[var(--color-accent-mint)]/35" : "bg-[var(--color-coral-tint)]"}`}
              >
                <div className="flex items-center gap-2">
                  <span className={`clay-pill text-[10px] ${toneForOddsRatio(signal.oddsRatio)}`}>{signal.label}</span>
                  <span className="text-[11px] font-semibold text-[var(--color-text-muted)]">{formatPValue(signal.pValue)}</span>
                </div>
                <p className="mt-2 font-display text-lg font-bold text-[var(--color-text)]">OR {signal.oddsRatio.toFixed(2)}</p>
                <p className="mt-1 text-[10px] font-mono text-[var(--color-text-muted)]">{signal.feature}</p>
              </div>
            ))
          ) : (
            <p className="text-sm font-semibold text-[var(--color-text-muted)]">
              No statistically significant features detected yet — start a race to populate.
            </p>
          )}
        </div>

        <AnimatePresence initial={false}>
          {showPrompt && (
            <motion.div
              key="prompt-foldout"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden border-t-2 border-[var(--color-text)] bg-[var(--color-base-2)]"
            >
              <div className="px-6 py-5">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
                  Engineered system prompt sent to all three vendors
                </p>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-xl border-2 border-[var(--color-text)] bg-white p-4 font-mono text-xs leading-relaxed text-[var(--color-text)]">
                  {SYSTEM_PROMPTS.engineered}
                </pre>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export function EnhancedRacePanel({ vendor, state }: { vendor: Vendor; state: RacePanelState }) {
  const meta = VENDORS[vendor];
  const tint = VENDOR_TINT[vendor];
  const elapsed = state.startTs ? (state.endTs ?? performance.now()) - state.startTs : 0;
  const outputTokens = estimateOutputTokens(state.text);
  const tokensPerSecond = estimateTokenRate(state.text, elapsed);
  const renderedText = `${normalizeRaceMarkdown(state.text)}${state.status === "streaming" ? "\n\n_" : ""}`;
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current && state.status === "streaming") {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [state.status, state.text]);

  return (
    <motion.div layout className="clay-card flex h-[760px] flex-col overflow-hidden p-0">
      <div className={`flex items-center justify-between border-b-2 border-[var(--color-text)] px-5 py-4 ${tint}`}>
        <div className="flex items-center gap-3">
          <div className="clay-icon h-11 w-11" style={{ borderRadius: 12, background: "#FFFFFF" }}>
            <VendorLogo vendor={vendor} size={22} />
          </div>
          <div>
            <h3 className="font-display text-base font-bold leading-tight" style={{ color: "var(--color-text)" }}>{meta.shortName}</h3>
            <p className="mt-0.5 text-[11px] font-semibold text-[var(--color-text-muted)]">{meta.vendor}</p>
          </div>
        </div>

        <AnimatePresence mode="popLayout">
          {state.status === "streaming" && (
            <motion.span
              key="streaming"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="clay-pill clay-pill-mint text-[10px]"
            >
              <span className="h-2 w-2 rounded-full bg-[var(--color-cta)] animate-pulse" />
              Streaming
            </motion.span>
          )}
          {state.status === "done" && state.finishedRank && (
            <motion.span
              key="done"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`clay-pill text-[10px] ${state.finishedRank === 1 ? "clay-pill-amber" : state.finishedRank === 2 ? "clay-pill-blue" : "clay-pill-lavender"}`}
            >
              {state.finishedRank === 1 && <Trophy className="h-3 w-3" strokeWidth={2.5} />}
              {state.finishedRank === 1 ? "1st" : state.finishedRank === 2 ? "2nd" : "3rd"}
            </motion.span>
          )}
          {state.status === "error" && (
            <span className="clay-pill text-[10px]" style={{ background: "var(--color-coral-tint)" }}>
              error
            </span>
          )}
        </AnimatePresence>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto bg-white p-5" style={{ overscrollBehavior: "auto" }}>
        {state.text === "" && state.status === "idle" && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="font-display text-sm font-semibold italic text-[var(--color-text-muted)]">awaiting prompt...</p>
            <p className="mt-2 max-w-[220px] text-xs font-semibold leading-relaxed text-[var(--color-text-muted)]">
              Shared prompt evidence will appear above, and live structure will light up here as soon as the stream begins.
            </p>
          </div>
        )}

        {state.text === "" && state.status === "streaming" && (
          <div className="flex h-full items-center justify-center text-center">
            <p className="font-display text-sm font-semibold italic text-[var(--color-text-muted)]">waiting for first tokens...</p>
          </div>
        )}

        {state.text && (
          <div className="min-w-0">
            <div className="prose prose-sm max-w-none break-words [&_code]:break-words [&_code]:text-xs [&_h1:first-child]:mt-0 [&_h1]:mb-1.5 [&_h1]:mt-1 [&_h1]:text-base [&_h1]:font-bold [&_h1]:leading-tight [&_h2:first-child]:mt-0 [&_h2]:mb-1 [&_h2]:mt-1.5 [&_h2]:text-sm [&_h2]:font-bold [&_h2]:leading-tight [&_h3:first-child]:mt-0 [&_h3]:mb-1 [&_h3]:mt-1.5 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:leading-tight [&_hr]:my-2 [&_li]:my-0.5 [&_ol]:my-1 [&_p]:my-1 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border-2 [&_pre]:border-[var(--color-text)] [&_pre]:bg-[var(--color-base-2)] [&_pre]:p-3 [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_table]:text-xs [&_td]:border [&_td]:border-[var(--color-border)] [&_td]:px-3 [&_td]:py-1.5 [&_th]:border-2 [&_th]:border-[var(--color-text)] [&_th]:bg-[var(--color-secondary)] [&_th]:px-3 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-bold [&_ul]:my-1">
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                {renderedText}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>

      <div className="border-t-2 border-[var(--color-text)] bg-[var(--color-base-2)] px-5 py-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MetricStat label="Output Tokens" value={`~${outputTokens.toLocaleString()}`} />
          <MetricStat label="Chars" value={state.charCount.toLocaleString()} />
          <MetricStat label="Tok/s" value={tokensPerSecond.toFixed(0)} />
          <MetricStat label="Time" value={formatTimeMs(elapsed)} />
        </div>
      </div>

      {state.status === "streaming" && (
        <motion.div
          className="absolute bottom-0 left-0 h-[3px]"
          style={{ background: "var(--color-cta)" }}
          initial={{ width: "0%" }}
          animate={{ width: ["0%", "70%", "90%"] }}
          transition={{ duration: 8, ease: "easeOut" }}
        />
      )}
    </motion.div>
  );
}

function ScoreboardVendorCard({
  vendor,
  result,
}: {
  vendor: Vendor;
  result: RaceResult["vendors"][Vendor];
}) {
  const meta = VENDORS[vendor];
  const judgment = result.features;

  return (
    <div className={`min-w-0 rounded-2xl border-2 border-[var(--color-text)] px-4 py-4 shadow-[4px_4px_0_var(--color-text)] ${VENDOR_TINT[vendor]}`}>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="clay-icon h-9 w-9" style={{ borderRadius: 12, background: "#FFFFFF" }}>
            <VendorLogo vendor={vendor} size={18} />
          </div>
          <div>
            <p className="font-display text-sm font-bold text-[var(--color-text)]">{meta.shortName}</p>
            <p className="text-[10px] font-semibold text-[var(--color-text-muted)]">{result.status}</p>
          </div>
        </div>
      </div>

      <p className="mt-4 font-display text-2xl font-bold tabular-nums text-[var(--color-text)]">{formatOverallScore(judgment.overallScore)}</p>
      <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">value score</p>
      <CompactStructureScoreBar features={result.features} />

      <div className="mt-3 flex flex-wrap gap-1.5">
        <TierPill score={judgment.overallScore} />
        <RubricChip label="Code"      active={judgment.codeBlocks >= 1} />
        <RubricChip label="Headings"  active={judgment.headings >= 1} />
        <RubricChip label="Examples"  active={judgment.examples >= 1} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-[var(--color-text-muted)]">
        <span className="tabular-nums whitespace-nowrap">~{result.outputTokens.toLocaleString()} toks</span>
        <span className="tabular-nums whitespace-nowrap">{formatTimeMs(result.timeMs)}</span>
        <span className="tabular-nums whitespace-nowrap">{formatMoney(result.estimatedCostUsd)}</span>
      </div>

      <div className="mt-4 space-y-2 text-xs font-semibold leading-relaxed text-[var(--color-text)]">
        <p>
          <span className="uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Pros </span>
          {stripMathDelimiters(judgment.excelsAt || "Balanced structure and response quality.")}
        </p>
        <p>
          <span className="uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Cons </span>
          {formatMissingList(judgment.missing)}
        </p>
      </div>
    </div>
  );
}

export function LiveScoreboard({ races, onClear }: { races: RaceResult[]; onClear: () => void }) {
  return (
    <div className="mx-auto mt-12 max-w-7xl">
      <div className="clay-card overflow-hidden p-0">
        <div className="flex flex-col gap-3 border-b-2 border-[var(--color-text)] bg-[var(--color-secondary)] px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="clay-pill clay-pill-blue text-[10px]">
                <BarChart3 className="h-3 w-3" strokeWidth={2.4} />
                Prompt Engineering Analysis
              </span>
              <span className="text-[11px] font-semibold text-[var(--color-text-muted)]">{races.length} completed runs</span>
            </div>
            <h3 className="font-display text-lg font-bold text-[var(--color-text)]">Prompt quality changes the tradeoff</h3>
            <p className="mt-1 text-sm font-semibold leading-relaxed text-[var(--color-text-muted)]">
              Same prompt, three outputs: compare quality, complexity, output tokens, cost, and time to see which model gives the best value.
            </p>
          </div>

          <button onClick={onClear} className="btn-secondary px-4 py-2 text-sm">
            <Eraser className="h-4 w-4" strokeWidth={2.4} />
            Clear history
          </button>
        </div>

        <div className="space-y-4 bg-white p-5">
          <AnimatePresence initial={false}>
            {races.map((race) => (
              <motion.div
                key={race.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="rounded-[28px] border-2 border-[var(--color-text)] bg-[var(--color-bg-cream)] p-5 shadow-[6px_6px_0_var(--color-text)]"
              >
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(220px,0.9fr)]">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-muted)]">Prompt</p>
                    <p className="mt-1 font-display text-base font-bold leading-snug text-[var(--color-text)]">{formatPromptPreview(race.prompt)}</p>
                    <p className="mt-2 text-xs font-semibold text-[var(--color-text-muted)]">
                      {new Date(race.startedAt).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    {(["kimi", "claude", "gemini"] as Vendor[]).map((vendor) => (
                      <ScoreboardVendorCard key={vendor} vendor={vendor} result={race.vendors[vendor]} />
                    ))}
                  </div>

                  <div className="rounded-2xl border-2 border-[var(--color-text)] bg-white shadow-[4px_4px_0_var(--color-text)] overflow-hidden">
                    <div className="border-b-2 border-[var(--color-text)] bg-[var(--color-text)] px-4 py-2">
                      <p className="text-[10px] uppercase tracking-[0.22em] text-white">Final Decision</p>
                    </div>

                    <div className="px-4 py-4">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-muted)]">Best Value</p>
                      <p className="mt-1 font-display text-2xl font-bold text-[var(--color-text)]">
                        {getWinnerLabel(race)}
                      </p>
                      <p className="mt-2 text-xs font-medium leading-relaxed text-[var(--color-text)]">
                        {getWinnerReason(race)}
                      </p>
                    </div>

                    <div className="border-t-2 border-dashed border-[var(--color-text-muted)] px-4 py-4">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-muted)]">Paper Finding</p>
                      <p className="mt-1 text-sm font-semibold leading-relaxed text-[var(--color-text)]">
                        {PAPER_FINDING}
                      </p>
                    </div>

                    <div className="border-t-2 border-dashed border-[var(--color-text-muted)] px-4 py-4">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-muted)]">Regression Signal</p>
                      {race.promptEvidence.strongestSignal ? (
                        (() => {
                          const sig = race.promptEvidence.strongestSignal;
                          const hits = countOutputsContainingFeature(race, sig.feature);
                          return (
                            <>
                              <p
                                className="mt-1 font-display text-base font-bold leading-snug"
                                style={{ color: "var(--color-text)" }}
                              >
                                {sig.label}
                              </p>
                              <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] font-semibold text-[var(--color-text)]">
                                <div>
                                  <p className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)]">Detected</p>
                                  <p className="mt-0.5 font-mono font-bold">{hits}/3</p>
                                </div>
                                <div>
                                  <p className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)]">Odds Ratio</p>
                                  <p className="mt-0.5 font-mono font-bold">{sig.oddsRatio.toFixed(2)}</p>
                                </div>
                                <div>
                                  <p className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)]">p-value</p>
                                  <p className="mt-0.5 font-mono font-bold">{formatPValue(sig.pValue)}</p>
                                </div>
                              </div>
                            </>
                          );
                        })()
                      ) : (
                        <p className="mt-1 text-xs font-semibold text-[var(--color-text-muted)]">No prompt signal recorded.</p>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function MetricStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border-2 border-[var(--color-text)] bg-white px-3 py-2 shadow-[3px_3px_0_var(--color-text)]">
      <p className="text-[9px] uppercase tracking-[0.12em] text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-1 font-mono text-sm font-bold tabular-nums text-[var(--color-text)]">{value}</p>
    </div>
  );
}
