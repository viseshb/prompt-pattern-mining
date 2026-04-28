"use client";

import { useEffect, useState } from "react";
import { Menu, X, BookOpen } from "lucide-react";

const links = [
  { href: "#dataset",     label: "Dataset",     ids: ["dataset"] },
  { href: "#methodology", label: "Methodology", ids: ["methodology"] },
  { href: "#results",     label: "Results",     ids: ["results"] },
  { href: "#cross-model", label: "Cross-Model", ids: ["cross-model"] },
  { href: "#demo",        label: "Live Race",   ids: ["demo", "race"] },
];

export function Navbar() {
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string>("hero");

  useEffect(() => {
    const ids = ["hero", ...links.flatMap((l) => l.ids)];
    const computeActive = () => {
      // Active = section whose top is closest to (and at or above) viewport-center.
      const probe = window.innerHeight * 0.35;
      let bestId = "hero";
      let bestDelta = Infinity;
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        // distance from probe line; prefer sections whose top is at or above probe
        const delta = top <= probe ? probe - top : Infinity;
        if (delta < bestDelta) {
          bestDelta = delta;
          bestId = id;
        }
      }
      setActiveId(bestId);
    };

    computeActive();
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(computeActive);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <nav className="fixed top-4 left-4 right-4 z-50 max-w-6xl mx-auto">
      <div className="clay-card-static clay-card px-4 py-2">
        <div className="flex items-center justify-between gap-4">
          <a href="#hero" className="flex items-center gap-2 cursor-pointer no-underline" aria-label="Home">
            <div className="clay-icon clay-tint-mint w-8 h-8" style={{ borderRadius: 10 }}>
              <BookOpen className="w-4 h-4 text-[var(--color-text)]" strokeWidth={2.4} />
            </div>
          </a>

          <div className="hidden md:flex items-center gap-1">
            {links.map((l) => {
              const active = l.ids.includes(activeId);
              return (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setActiveId(l.ids[0])}
                  className={`relative text-sm font-bold transition-colors cursor-pointer rounded-full px-3 py-1.5 ${
                    active
                      ? "text-[var(--color-cta-dark)]"
                      : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                  }`}
                  style={
                    active
                      ? {
                          background: "var(--color-accent-mint)",
                          border: "2px solid var(--color-text)",
                          boxShadow: "2px 2px 0 var(--color-text)",
                        }
                      : undefined
                  }
                >
                  {l.label}
                </a>
              );
            })}
          </div>

          <a
            href="#demo"
            onClick={() => setActiveId("demo")}
            className="hidden md:inline-flex items-center justify-center cursor-pointer text-xs font-bold text-white whitespace-nowrap"
            style={{
              background: "var(--color-cta)",
              border: "2px solid var(--color-text)",
              borderRadius: 12,
              padding: "6px 14px",
              boxShadow: "3px 3px 0 var(--color-text)",
              transition: "transform 160ms ease, box-shadow 160ms ease",
            }}
          >
            Try Demo
          </a>

          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="md:hidden cursor-pointer w-10 h-10 rounded-xl border-2 border-[var(--color-text)] bg-[var(--color-secondary)] flex items-center justify-center"
            aria-label="Toggle menu"
          >
            {open ? (
              <X className="w-5 h-5 text-[var(--color-text)]" strokeWidth={2.5} />
            ) : (
              <Menu className="w-5 h-5 text-[var(--color-text)]" strokeWidth={2.5} />
            )}
          </button>
        </div>

        {open && (
          <div className="md:hidden mt-3 pt-3 border-t-2 border-dashed border-[var(--color-border)] flex flex-col gap-3">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className={`text-sm font-bold cursor-pointer ${
                  l.ids.includes(activeId) ? "text-[var(--color-cta-dark)]" : "text-[var(--color-text)]"
                }`}
              >
                {l.label}
              </a>
            ))}
          </div>
        )}
      </div>
    </nav>
  );
}
