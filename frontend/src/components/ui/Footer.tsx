"use client";

import { BookOpen } from "lucide-react";

export function Footer() {
  return (
    <footer className="py-14 px-4" style={{ background: "var(--color-bg-cream)" }}>
      <div className="max-w-6xl mx-auto">
        <div className="clay-card p-8 sm:p-10">
          <div className="grid md:grid-cols-3 gap-8 items-start">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="clay-icon clay-tint-mint w-10 h-10" style={{ borderRadius: 12 }}>
                  <BookOpen className="w-5 h-5 text-[var(--color-text)]" strokeWidth={2.4} />
                </div>
              </div>
              <p className="text-sm text-[var(--color-text-muted)] leading-relaxed font-medium">
                Mining structural prompt patterns from real developer–ChatGPT conversations.
              </p>
            </div>

            <div>
              <h4 className="font-display font-bold text-[var(--color-text)] mb-3">Authors</h4>
              <ul className="space-y-1.5 text-sm text-[var(--color-text-muted)] font-medium">
                <li>Teja Reddy Mandadi</li>
                <li>Visesh Bentula</li>
                <li>Umapathi Konduri</li>
              </ul>
            </div>

            <div>
              <h4 className="font-display font-bold text-[var(--color-text)] mb-3">Affiliation</h4>
              <p className="text-sm text-[var(--color-text-muted)] leading-relaxed font-medium">
                Texas A&amp;M University–San Antonio
                <br />
                Department of Computer Science
                <br />
                Graduate Seminar · Spring 2026
              </p>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t-2 border-dashed border-[var(--color-border)] flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-[var(--color-text-muted)] font-bold uppercase tracking-[0.18em]">
            <p>© 2026 · Prompt Pattern Mining in Vibe Coding</p>
            <p>Built with Next.js · Tailwind v4 · Recharts</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
