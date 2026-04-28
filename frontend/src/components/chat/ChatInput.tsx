"use client";
import { useState, KeyboardEvent } from "react";
import { Send } from "lucide-react";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({ onSend, disabled = false, placeholder = "Type a coding question…" }: ChatInputProps) {
  const [input, setInput] = useState("");

  const handleSend = () => {
    if (!input.trim() || disabled) return;
    onSend(input.trim());
    setInput("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex gap-2 p-3 border-t-2 border-[var(--color-text)] bg-[var(--color-bg-cream)]">
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        className="flex-1 bg-white border-2 border-[var(--color-text)] rounded-xl px-4 py-2.5 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-cta)]/40 disabled:opacity-50 font-medium"
      />
      <button
        onClick={handleSend}
        disabled={disabled || !input.trim()}
        className="cursor-pointer bg-[var(--color-cta)] text-white border-2 border-[var(--color-text)] rounded-xl px-4 py-2.5 hover:bg-[var(--color-cta-dark)] disabled:opacity-30 disabled:cursor-not-allowed transition flex items-center justify-center"
        style={{ boxShadow: "3px 3px 0 var(--color-text)" }}
        aria-label="Send"
      >
        <Send className="w-4 h-4" strokeWidth={2.5} />
      </button>
    </div>
  );
}
