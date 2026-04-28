"use client";
import { motion } from "framer-motion";

interface SectionHeadingProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  eyebrowTint?: "mint" | "peach" | "blue" | "lavender" | "amber";
}

const TINTS: Record<NonNullable<SectionHeadingProps["eyebrowTint"]>, string> = {
  mint:     "clay-pill-mint",
  peach:    "clay-pill-peach",
  blue:     "clay-pill-blue",
  lavender: "clay-pill-lavender",
  amber:    "clay-pill-amber",
};

export function SectionHeading({ title, subtitle, eyebrow, eyebrowTint = "mint" }: SectionHeadingProps) {
  return (
    <div className="mb-8 text-center px-4">
      {eyebrow && (
        <motion.span
          className={`clay-pill ${TINTS[eyebrowTint]} mb-3`}
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
        >
          {eyebrow}
        </motion.span>
      )}
      <motion.h2
        className="font-display text-2xl sm:text-3xl md:text-4xl font-bold mb-3 leading-[1.1] tracking-tight"
        style={{ color: "var(--color-text)" }}
        initial={{ opacity: 0, y: 14 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        {title}
      </motion.h2>
      {subtitle && (
        <motion.p
          className="text-base sm:text-lg max-w-2xl mx-auto leading-relaxed"
          style={{ color: "var(--color-text-muted)" }}
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45, delay: 0.1 }}
        >
          {subtitle}
        </motion.p>
      )}
    </div>
  );
}
