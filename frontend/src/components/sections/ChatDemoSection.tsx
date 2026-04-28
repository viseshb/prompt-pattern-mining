"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { SYSTEM_PROMPTS } from "@/lib/constants";
import { FileText, X } from "lucide-react";

function PromptModal({ mode, onClose }: { mode: "zero" | "engineered"; onClose: () => void }) {
  const isZero = mode === "zero";
  const prompt = isZero ? SYSTEM_PROMPTS.zero : SYSTEM_PROMPTS.engineered;
  const tint = isZero ? "clay-tint-peach" : "clay-tint-mint";

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-[#2D3748]/40 backdrop-blur-sm" />

      <motion.div
        className="relative flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden clay-card"
        initial={{ scale: 0.92, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.92, y: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex items-center justify-between border-b-2 border-[var(--color-text)] px-6 py-4 ${tint}`}>
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-[var(--color-text)]" strokeWidth={2.4} />
            <h3 className="font-display text-base font-bold" style={{ color: "var(--color-text)" }}>
              {isZero ? "Zero Prompt Engineering" : "With Prompt Engineering"} - System Prompt
            </h3>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border-2 border-[var(--color-text)] bg-white transition hover:bg-[var(--color-base-2)]"
            aria-label="Close"
          >
            <X className="h-4 w-4 text-[var(--color-text)]" strokeWidth={2.5} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto bg-white p-6">
          <div className="space-y-1.5 font-mono text-sm leading-relaxed text-[var(--color-text)]">
            {prompt.split("\n").map((line, i) => {
              if (!line.trim()) return <br key={i} />;
              if (line.match(/^\d+\./)) {
                return (
                  <p key={i} className="mt-2 font-bold text-[var(--color-text)]">
                    {line}
                  </p>
                );
              }
              if (line.startsWith("-")) {
                return (
                  <p key={i} className="pl-4 text-[var(--color-text-muted)]">
                    {line}
                  </p>
                );
              }
              return (
                <p key={i} className="text-[var(--color-text)]">
                  {line}
                </p>
              );
            })}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function ChatDemoSection() {
  const [showPrompt, setShowPrompt] = useState<"zero" | "engineered" | null>(null);

  return (
    <section id="demo" data-snap className="px-4 py-16 sm:py-24">
      <SectionHeading
        eyebrow="Live Demo"
        eyebrowTint="peach"
        title="Two Prompts. One Model. Different Worlds."
        subtitle="Same coding question - left has no instructions, right has structured prompt engineering. Watch the difference live."
      />

      <ScrollReveal>
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <button onClick={() => setShowPrompt("zero")} className="btn-secondary mb-4 w-full py-3 text-sm">
              <FileText className="h-4 w-4" strokeWidth={2.5} />
              View Zero-Prompt System
            </button>
            <ChatPanel mode="zero" />
          </div>

          <div>
            <button onClick={() => setShowPrompt("engineered")} className="btn-primary mb-4 w-full py-3 text-sm">
              <FileText className="h-4 w-4" strokeWidth={2.5} />
              View Engineered System
            </button>
            <ChatPanel mode="engineered" />
          </div>
        </div>
      </ScrollReveal>

      <ScrollReveal delay={0.3}>
        <p className="mx-auto mt-10 max-w-2xl text-center text-base font-semibold leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
          Both panels use the same model (Claude Haiku 4.5). The only difference is the system prompt - proof that
          prompt structure directly drives output quality.
        </p>
      </ScrollReveal>

      <AnimatePresence>{showPrompt && <PromptModal mode={showPrompt} onClose={() => setShowPrompt(null)} />}</AnimatePresence>
    </section>
  );
}
