"use client";

import { useCallback, useRef, useState } from "react";
import { Send, Sparkles, Trash2 } from "lucide-react";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { type Vendor } from "@/data/multiModelStudy";
import { SUGGESTED_PROMPT, SYSTEM_PROMPTS } from "@/lib/constants";
import { analyzePromptEvidence, emptyResponseStructure, type ComparativeAnalysis, type PromptEvidence, type ResponseStructure } from "@/lib/livePromptFeatures";
import { DetectionBoard, EnhancedRacePanel, LiveScoreboard, PromptEvidenceCard, SIGNAL_LABELS, type RaceResult, type SignalFeedItem } from "@/components/sections/race/ResearchOverlay";

interface PanelState {
  text: string;
  status: "idle" | "streaming" | "done" | "error";
  startTs: number | null;
  endTs: number | null;
  charCount: number;
  finishedRank: number | null;
  features: ReturnType<typeof emptyResponseStructure>;
  signalFeed: SignalFeedItem[];
}

const INITIAL_PANEL: PanelState = {
  text: "",
  status: "idle",
  startTs: null,
  endTs: null,
  charCount: 0,
  finishedRank: null,
  features: emptyResponseStructure(),
  signalFeed: [],
};

const VENDOR_ORDER: Vendor[] = ["kimi", "claude", "gemini"];

// USD per 1M tokens. Kimi K2.5 served via Bedrock-Mantle ($0.60 / $3.00),
// Claude Sonnet 4.6 via Bedrock-Runtime ($3 / $15), Gemini 3.1 Pro Preview
// via Vertex Express ($2 / $12 at <= 200K context).
const MODEL_PRICING_USD_PER_M_TOKENS: Record<Vendor, { input: number; output: number }> = {
  kimi: { input: 0.6, output: 3 },
  claude: { input: 3, output: 15 },
  gemini: { input: 2, output: 12 },
};

interface SuggestionItem {
  prompt: string;
  scenario: string;
  tone: "mint" | "peach" | "blue" | "lavender" | "amber";
  hint: string;
}

const SUGGESTIONS: SuggestionItem[] = [
  {
    prompt: SUGGESTED_PROMPT,
    scenario: "Simple algo",
    tone: "amber",
    hint: "Cheap, well-known problem. Tests whether bigger models justify their cost on easy work.",
  },
  {
    prompt: "Implement a thread-safe LRU cache with O(1) get and put.",
    scenario: "Concurrency depth",
    tone: "peach",
    hint: "Locks, invariants, edge cases. Tests reasoning under multi-step constraints.",
  },
  {
    prompt: "Find the longest palindromic substring in a string. Example: 'babad'",
    scenario: "Classic DP",
    tone: "lavender",
    hint: "Expand-around-center vs Manacher's. Tests algorithm selection and conciseness.",
  },
  {
    prompt: "Detect a cycle in a singly linked list (return the node where it starts).",
    scenario: "Proof-driven",
    tone: "mint",
    hint: "Floyd's algorithm. Tests whether the model explains why the math works.",
  },
  {
    prompt: "Write FizzBuzz in Python with the cleanest algorithm possible.",
    scenario: "Algo insight",
    tone: "blue",
    hint: "Trivial spec, rewards string-concat trick over modulo-15. Tests cleverness vs verbosity.",
  },
];

async function streamVendor(
  vendor: Vendor,
  prompt: string,
  onDelta: (chunk: string) => void,
  onError: (msg: string) => void,
  signal: AbortSignal,
): Promise<boolean> {
  try {
    const res = await fetch("/api/race", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vendor, messages: [{ role: "user", content: prompt }] }),
      signal,
    });
    if (!res.ok) {
      onError(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return false;
    }
    const reader = res.body?.getReader();
    if (!reader) {
      onError("no response body");
      return false;
    }
    const dec = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      onDelta(dec.decode(value, { stream: true }));
    }
    return false;
  } catch (e: unknown) {
    if ((e as { name?: string })?.name === "AbortError") return true;
    onError(e instanceof Error ? e.message : String(e));
    return false;
  }
}

function buildPanels(status: PanelState["status"] = "idle", startTs: number | null = null): Record<Vendor, PanelState> {
  return {
    kimi: { ...INITIAL_PANEL, status, startTs, features: emptyResponseStructure(), signalFeed: [] },
    claude: { ...INITIAL_PANEL, status, startTs, features: emptyResponseStructure(), signalFeed: [] },
    gemini: { ...INITIAL_PANEL, status, startTs, features: emptyResponseStructure(), signalFeed: [] },
  };
}

function estimateOutputTokens(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return Math.round(trimmed.split(/\s+/).filter(Boolean).length / 0.75);
}

function estimateCostUsd(vendor: Vendor, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING_USD_PER_M_TOKENS[vendor];
  return ((inputTokens * pricing.input) + (outputTokens * pricing.output)) / 1_000_000;
}

async function analyzeVendorOutput(text: string, signal: AbortSignal): Promise<ResponseStructure> {
  const res = await fetch("/api/race-analysis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal,
  });

  const payload = await res.json();
  if (!res.ok) {
    throw new Error(typeof payload?.error === "string" ? payload.error : `HTTP ${res.status}`);
  }

  return payload as ResponseStructure;
}

async function analyzeRaceComparison(
  snapshots: Record<Vendor, PanelState>,
  inputTokens: number,
  signal: AbortSignal,
): Promise<ComparativeAnalysis> {
  const outputs = Object.fromEntries(VENDOR_ORDER.map((vendor) => [vendor, snapshots[vendor].text]));
  const metrics = Object.fromEntries(
    VENDOR_ORDER.map((vendor) => {
      const state = snapshots[vendor];
      const timeMs = state.startTs && state.endTs ? Math.max(0, state.endTs - state.startTs) : 0;
      const outputTokens = estimateOutputTokens(state.text);
      return [
        vendor,
        {
          structureScore: state.features.structureScore,
          qualityScore: state.features.qualityScore,
          complexityScore: state.features.complexityScore,
          inputTokens,
          outputTokens,
          estimatedCostUsd: estimateCostUsd(vendor, inputTokens, outputTokens),
          timeMs,
          charsPerSec: timeMs > 0 ? state.charCount / (timeMs / 1000) : 0,
        },
      ];
    }),
  );

  const res = await fetch("/api/race-analysis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "comparison", outputs, metrics }),
    signal,
  });

  const payload = await res.json();
  if (!res.ok) {
    throw new Error(typeof payload?.error === "string" ? payload.error : `HTTP ${res.status}`);
  }

  return payload as ComparativeAnalysis;
}

function createRaceResult(
  prompt: string,
  startedAt: number,
  promptEvidence: PromptEvidence,
  snapshots: Record<Vendor, PanelState>,
  comparativeAnalysis: ComparativeAnalysis | null,
): RaceResult {
  const inputTokens = estimateOutputTokens(`${SYSTEM_PROMPTS.engineered}\n\n${prompt}`);
  const haikuJudgedAll = comparativeAnalysis !== null;
  const vendors = VENDOR_ORDER.reduce<RaceResult["vendors"]>((acc, vendor) => {
    const state = snapshots[vendor];
    const timeMs = state.startTs && state.endTs ? Math.max(0, state.endTs - state.startTs) : 0;
    const outputTokens = estimateOutputTokens(state.text);
    acc[vendor] = {
      structureScore: state.features.structureScore,
      features: state.features,
      timeMs,
      charsPerSec: timeMs > 0 ? state.charCount / (timeMs / 1000) : 0,
      inputTokens,
      outputTokens,
      estimatedCostUsd: estimateCostUsd(vendor, inputTokens, outputTokens),
      status: state.status === "error" ? "error" : "done",
      judgedByHaiku: haikuJudgedAll && Boolean(comparativeAnalysis?.modelJudgments[vendor]),
    };
    return acc;
  }, {} as RaceResult["vendors"]);

  const maxScore = Math.max(...VENDOR_ORDER.map((vendor) => comparativeAnalysis?.modelJudgments[vendor]?.overallScore ?? vendors[vendor].structureScore));

  return {
    id: crypto.randomUUID(),
    prompt,
    startedAt,
    promptEvidence,
    vendors,
    leaders: VENDOR_ORDER.filter((vendor) => (comparativeAnalysis?.modelJudgments[vendor]?.overallScore ?? vendors[vendor].structureScore) === maxScore),
    comparativeAnalysis,
  };
}

export function MultiModelRaceSection() {
  const [prompt, setPrompt] = useState("");
  const [panels, setPanels] = useState<Record<Vendor, PanelState>>(buildPanels());
  const [running, setRunning] = useState(false);
  const [promptEvidence, setPromptEvidence] = useState<PromptEvidence | null>(null);
  const [races, setRaces] = useState<RaceResult[]>([]);
  const [raceStartedAt, setRaceStartedAt] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const finishCounter = useRef(0);
  const activeRaceRef = useRef<string | null>(null);

  const startRace = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    abortRef.current?.abort();
    const raceId = crypto.randomUUID();
    activeRaceRef.current = raceId;
    setRunning(true);
    finishCounter.current = 0;
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const t0 = performance.now();
    const startedAt = Date.now();
    const promptSignals = analyzePromptEvidence(`${SYSTEM_PROMPTS.engineered}\n\n${trimmed}`);
    const localPanels = buildPanels("streaming", t0);
    setRaceStartedAt(startedAt);
    setPromptEvidence(promptSignals);
    setPanels(localPanels);

    const runOne = async (vendor: Vendor) => {
      const aborted = await streamVendor(
        vendor,
        trimmed,
        (chunk) => {
          if (activeRaceRef.current !== raceId) return;

          const prevState = localPanels[vendor];
          const nextText = prevState.text + chunk;

          localPanels[vendor] = {
            ...prevState,
            text: nextText,
            charCount: prevState.charCount + chunk.length,
          };

          setPanels((prev) => ({
            ...prev,
            [vendor]: localPanels[vendor],
          }));
        },
        (msg) => {
          if (activeRaceRef.current !== raceId) return;

          const prevState = localPanels[vendor];
          localPanels[vendor] = {
            ...prevState,
            status: "error",
            text: prevState.text + `\n\n[error] ${msg}`,
            endTs: performance.now(),
          };

          setPanels((prev) => ({
            ...prev,
            [vendor]: localPanels[vendor],
          }));
        },
        ctrl.signal,
      );

      if (aborted || activeRaceRef.current !== raceId) return;

      finishCounter.current += 1;
      const rank = finishCounter.current;
      localPanels[vendor] = {
        ...localPanels[vendor],
        status: localPanels[vendor].status === "error" ? "error" : "done",
        endTs: localPanels[vendor].endTs ?? performance.now(),
        finishedRank: localPanels[vendor].finishedRank ?? rank,
      };

      setPanels((prev) => ({
        ...prev,
        [vendor]: localPanels[vendor],
      }));

      if (localPanels[vendor].status === "error" || !localPanels[vendor].text.trim()) return;

      try {
        const analysis = await analyzeVendorOutput(localPanels[vendor].text, ctrl.signal);
        if (activeRaceRef.current !== raceId) return;

        localPanels[vendor] = {
          ...localPanels[vendor],
          features: analysis,
          signalFeed: analysis.newlyDetectedSignals.map((kind) => ({
            id: crypto.randomUUID(),
            kind,
            label: SIGNAL_LABELS[kind],
            ts: Date.now(),
          })),
        };

        setPanels((prev) => ({
          ...prev,
          [vendor]: localPanels[vendor],
        }));
      } catch (error: unknown) {
        if ((error as { name?: string })?.name === "AbortError" || activeRaceRef.current !== raceId) return;
        console.error(`[race] Haiku per-vendor analysis failed for ${vendor}:`, error);

        localPanels[vendor] = {
          ...localPanels[vendor],
          text: `${localPanels[vendor].text}\n\n[analysis error] ${error instanceof Error ? error.message : String(error)}`,
        };

        setPanels((prev) => ({
          ...prev,
          [vendor]: localPanels[vendor],
        }));
      }
    };

    await Promise.all(VENDOR_ORDER.map(runOne));

    if (ctrl.signal.aborted || activeRaceRef.current !== raceId) return;

    const inputTokens = estimateOutputTokens(`${SYSTEM_PROMPTS.engineered}\n\n${trimmed}`);
    let comparison: ComparativeAnalysis | null = null;
    try {
      comparison = await analyzeRaceComparison(localPanels, inputTokens, ctrl.signal);
      for (const vendor of VENDOR_ORDER) {
        const judgment = comparison.modelJudgments[vendor];
        if (!judgment) continue;
        localPanels[vendor] = {
          ...localPanels[vendor],
          features: {
            ...localPanels[vendor].features,
            qualityScore: judgment.qualityScore,
            complexityScore: judgment.complexityScore,
            overallScore: judgment.overallScore,
            excelsAt: judgment.excelsAt,
            missing: judgment.missing,
            analysisSummary: judgment.excelsAt,
          },
        };
      }
    } catch (error) {
      console.error("[race] Haiku comparative analysis failed:", error);
      comparison = null;
    }
    setRaces((prev) => [createRaceResult(trimmed, startedAt, promptSignals, localPanels, comparison), ...prev]);
    setRunning(false);
  }, []);

  const reset = () => {
    abortRef.current?.abort();
    activeRaceRef.current = null;
    setPanels(buildPanels());
    setPromptEvidence(null);
    setRaceStartedAt(null);
    setRunning(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startRace(prompt);
  };

  return (
    <section id="race" data-snap className="py-16 sm:py-24 px-4" style={{ background: "var(--color-bg-cream)" }}>
      <SectionHeading
        eyebrow="Live Cross-Model Race"
        eyebrowTint="mint"
        title="Three Models. Same Prompt. Watch Them Race."
        subtitle="Same engineered system prompt, three top-tier vendors, streaming in parallel - live."
      />

      <ScrollReveal>
        <div className="mx-auto mb-6 flex max-w-4xl items-center justify-center gap-3 flex-wrap">
          <span className="clay-pill clay-pill-mint text-[10px]">
            <span className="h-2 w-2 rounded-full bg-[var(--color-cta)]" />
            All three vendors using ENGINEERED system prompt
          </span>
          <span className="text-[11px] font-semibold text-[var(--color-text-muted)]">
            Cross-model claim: every model benefits, success rate +14–24 pp, Cohen&rsquo;s d 0.59–0.80, p&lt;1e-12
          </span>
        </div>
      </ScrollReveal>

      <ScrollReveal>
        <div className="max-w-4xl mx-auto mb-10">
          <form onSubmit={handleSubmit} className="relative clay-card p-3 pr-4">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Type a coding question, or pick a suggestion below..."
              rows={3}
              className="w-full bg-transparent rounded-xl px-1 py-1 pr-32 text-sm placeholder:text-[var(--color-text-muted)] focus:outline-none resize-none font-medium"
              style={{ color: "var(--color-text)" }}
            />
            <div className="absolute bottom-5 right-6 flex items-center gap-2">
              {(running || Object.values(panels).some((p) => p.text.length > 0)) && (
                <button
                  type="button"
                  onClick={reset}
                  className="cursor-pointer w-9 h-9 rounded-lg border-2 border-[var(--color-text)] bg-white flex items-center justify-center hover:bg-[var(--color-base-2)] transition"
                  title="Reset"
                  style={{ boxShadow: "2px 2px 0 var(--color-text)" }}
                >
                  <Trash2 className="w-4 h-4 text-[var(--color-text)]" strokeWidth={2.4} />
                </button>
              )}
              <button
                type="submit"
                disabled={!prompt.trim()}
                className="btn-primary text-sm py-2.5 px-5"
              >
                {running ? (
                  <>
                    <Sparkles className="w-4 h-4 animate-spin" strokeWidth={2.5} />
                    Restart Race
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" strokeWidth={2.5} />
                    Start Race
                  </>
                )}
              </button>
            </div>
          </form>

          <div className="mt-5">
            <div className="mb-3 flex items-center gap-2">
              <span className="clay-pill clay-pill-mint text-[10px]">Try a prompt</span>
              <span className="text-[11px] font-semibold" style={{ color: "var(--color-text-muted)" }}>
                Click any to load it.
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {SUGGESTIONS.map((s) => {
                const truncated = s.prompt.length > 64 ? s.prompt.slice(0, 61) + "..." : s.prompt;
                const tintClass: Record<typeof s.tone, string> = {
                  mint: "bg-[var(--color-accent-mint)]",
                  peach: "bg-[var(--color-primary)]",
                  blue: "bg-[var(--color-secondary)]",
                  lavender: "bg-[var(--color-accent-purple)]",
                  amber: "bg-[var(--color-accent-amber)]",
                };
                return (
                  <button
                    key={s.prompt}
                    onClick={() => setPrompt(s.prompt)}
                    title={s.hint}
                    className="cursor-pointer flex w-full items-center gap-2 rounded-2xl border-2 border-[var(--color-text)] bg-white px-3 py-2 text-left text-[12px] font-semibold hover:bg-[var(--color-base-2)] transition"
                    style={{ color: "var(--color-text)", boxShadow: "3px 3px 0 var(--color-text)" }}
                  >
                    <span
                      className={`flex-shrink-0 rounded-full border-2 border-[var(--color-text)] px-2 py-0.5 text-[10px] font-bold tracking-tight whitespace-nowrap ${tintClass[s.tone]}`}
                    >
                      {s.scenario}
                    </span>
                    <span className="truncate">{truncated}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </ScrollReveal>

      {promptEvidence && (
        <ScrollReveal delay={0.03}>
          <PromptEvidenceCard evidence={promptEvidence} raceStartedAt={raceStartedAt} />
        </ScrollReveal>
      )}

      <ScrollReveal delay={0.05}>
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
          {VENDOR_ORDER.map((v) => (
            <EnhancedRacePanel key={v} vendor={v} state={panels[v]} />
          ))}
        </div>
      </ScrollReveal>

      <ScrollReveal delay={0.06}>
        <DetectionBoard panels={panels} />
      </ScrollReveal>

      {races.length > 0 && (
        <ScrollReveal delay={0.08}>
          <LiveScoreboard races={races} onClear={() => setRaces([])} />
        </ScrollReveal>
      )}

      <ScrollReveal delay={0.1}>
        <p className="mt-12 text-center text-base max-w-2xl mx-auto leading-relaxed font-semibold" style={{ color: "var(--color-text-muted)" }}>
          All three streams use the same engineered system prompt. Prompt evidence shows what the instruction stack asks
          for; live structure shows how well each model actually realizes it.
        </p>
      </ScrollReveal>
    </section>
  );
}

