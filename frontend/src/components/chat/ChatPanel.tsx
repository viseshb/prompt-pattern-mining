"use client";
import { useRef, useEffect } from "react";
import { Sparkles, Zap, Trash2 } from "lucide-react";
import { useChat } from "@/hooks/useChat";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { ChatInput } from "@/components/chat/ChatInput";
import { SUGGESTED_PROMPT } from "@/lib/constants";

interface ChatPanelProps {
  mode: "zero" | "engineered";
}

const panelConfig = {
  zero: {
    title: "Zero Prompt Engineering",
    subtitle: "Minimal system prompt",
    Icon: Zap,
    headerTint: "clay-tint-peach",
    iconTint: "clay-tint-peach",
    suggestionTint: "clay-tint-peach",
  },
  engineered: {
    title: "With Prompt Engineering",
    subtitle: "Structured system prompt",
    Icon: Sparkles,
    headerTint: "clay-tint-mint",
    iconTint: "clay-tint-mint",
    suggestionTint: "clay-tint-mint",
  },
} as const;

export function ChatPanel({ mode }: ChatPanelProps) {
  const { messages, isLoading, sendMessage, clearMessages } = useChat(mode);
  const scrollRef = useRef<HTMLDivElement>(null);
  const config = panelConfig[mode];
  const Icon = config.Icon;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="clay-card flex flex-col h-[600px] overflow-hidden p-0">
      <div className={`flex items-center justify-between px-5 py-4 border-b-2 border-[var(--color-text)] ${config.headerTint}`}>
        <div className="flex items-center gap-3">
          <div className={`clay-icon ${config.iconTint} w-10 h-10`} style={{ borderRadius: 12 }}>
            <Icon className="w-5 h-5 text-[var(--color-text)]" strokeWidth={2.4} />
          </div>
          <div>
            <h3 className="font-display text-base font-bold leading-tight" style={{ color: "var(--color-text)" }}>
              {config.title}
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] font-semibold">{config.subtitle}</p>
          </div>
        </div>
        <button
          onClick={clearMessages}
          className="cursor-pointer w-9 h-9 rounded-lg border-2 border-[var(--color-text)] bg-white flex items-center justify-center hover:bg-[var(--color-base-2)] transition"
          title="Clear chat"
        >
          <Trash2 className="w-4 h-4 text-[var(--color-text)]" strokeWidth={2.4} />
        </button>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-5 space-y-1 bg-white"
        style={{ overscrollBehavior: "auto" }}
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <p className="text-[var(--color-text-muted)] text-sm mb-4 font-semibold">Try asking a coding question</p>
            <button
              onClick={() => sendMessage(SUGGESTED_PROMPT)}
              className={`${config.suggestionTint} cursor-pointer w-full rounded-full border-[2.4px] border-[var(--color-text)] bg-white px-5 py-3 text-left text-xs font-bold text-[var(--color-text)] whitespace-normal break-words leading-snug transition-transform hover:scale-105`}
            >
              {SUGGESTED_PROMPT}
            </button>
          </div>
        )}
        {messages.map((msg, i) => (
          <ChatMessage key={i} role={msg.role} content={msg.content} />
        ))}
        {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
          <div className="flex justify-start mb-3">
            <div className="rounded-2xl px-4 py-3 border-2 border-[var(--color-text)] bg-[var(--color-base-2)]">
              <span className="text-[var(--color-text-muted)] text-sm font-semibold animate-pulse">Thinking…</span>
            </div>
          </div>
        )}
      </div>

      <ChatInput onSend={sendMessage} disabled={isLoading} />
    </div>
  );
}
