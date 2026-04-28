"use client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github.css";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
}

export function ChatMessage({ role, content }: ChatMessageProps) {
  const isUser = role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed border-2 border-[var(--color-text)] ${
          isUser
            ? "bg-[var(--color-secondary)] text-[var(--color-text)]"
            : "bg-[var(--color-base-2)] text-[var(--color-text)]"
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap font-semibold">{content}</p>
        ) : (
          <div className="prose prose-sm max-w-none [&_pre]:bg-white [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:border-2 [&_pre]:border-[var(--color-text)] [&_code]:text-xs [&_p]:my-1.5 [&_h2]:text-base [&_h2]:mt-3 [&_h2]:mb-1 [&_h2]:font-bold [&_h3]:text-sm [&_h3]:font-bold [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_table]:w-full [&_table]:text-xs [&_table]:border-collapse [&_th]:border-2 [&_th]:border-[var(--color-text)] [&_th]:px-3 [&_th]:py-1.5 [&_th]:bg-[var(--color-secondary)] [&_th]:text-left [&_th]:font-bold [&_td]:border [&_td]:border-[var(--color-border)] [&_td]:px-3 [&_td]:py-1.5">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
              {content || "▍"}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
