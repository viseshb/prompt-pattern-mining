"""
Convert results/multi_model/multi_model_study.json into the TypeScript data file
that the frontend's CrossModelSection consumes.

Run after multi_model_study.py finishes:
    python pipeline/import_study_results.py
"""
from __future__ import annotations

import json
import math
from pathlib import Path
from collections import defaultdict
from typing import Optional

import numpy as np

ROOT = Path(__file__).parent.parent
INPUT = ROOT / "results" / "multi_model" / "multi_model_study.json"
OUTPUT = ROOT / "frontend" / "src" / "data" / "multiModelStudy.ts"

VENDORS = ("kimi", "claude", "gemini")
MODES = ("zero", "engineered")


def cohen_kappa_binary(a: list[int], b: list[int]) -> float:
    """Cohen's kappa for two binary rater sequences."""
    if len(a) != len(b) or not a:
        return float("nan")
    a_arr = np.array(a)
    b_arr = np.array(b)
    po = float((a_arr == b_arr).mean())
    p_a = a_arr.mean()
    p_b = b_arr.mean()
    pe = p_a * p_b + (1 - p_a) * (1 - p_b)
    if abs(1 - pe) < 1e-9:
        return 1.0
    return (po - pe) / (1 - pe)


def paired_t(diffs: list[float]) -> tuple[float, float]:
    """Return (t-stat, two-sided p-value) for paired t-test of mean(diffs) != 0."""
    if len(diffs) < 2:
        return (float("nan"), 1.0)
    arr = np.array(diffs)
    mean = arr.mean()
    se = arr.std(ddof=1) / math.sqrt(len(arr))
    if se == 0:
        return (0.0, 1.0)
    t = mean / se
    df = len(arr) - 1
    # two-sided p-value via Student t
    from scipy.stats import t as t_dist  # lazy import
    p = 2.0 * (1.0 - t_dist.cdf(abs(t), df))
    return (float(t), float(p))


def cohen_d_paired(diffs: list[float]) -> float:
    if not diffs:
        return float("nan")
    arr = np.array(diffs)
    sd = arr.std(ddof=1)
    if sd == 0:
        return 0.0
    return float(arr.mean() / sd)


def main():
    data = json.loads(INPUT.read_text(encoding="utf-8"))
    records = data["records"]
    print(f"Loaded {len(records)} records from {INPUT}")

    # Per-vendor effect computations
    vendor_zero: dict[str, list[int]] = {v: [] for v in VENDORS}
    vendor_eng: dict[str, list[int]] = {v: [] for v in VENDORS}
    vendor_diff: dict[str, list[float]] = {v: [] for v in VENDORS}
    success_zero: dict[str, list[int]] = {v: [] for v in VENDORS}  # binary score>=3
    success_eng: dict[str, list[int]] = {v: [] for v in VENDORS}
    by_lang: dict[str, dict[str, list[float]]] = defaultdict(lambda: {v: [] for v in VENDORS})

    for rec in records:
        lang = rec.get("language", "Unknown")
        for v in VENDORS:
            sz = rec["modes"]["zero"]["grades"].get(v, {}).get("score", -1)
            se = rec["modes"]["engineered"]["grades"].get(v, {}).get("score", -1)
            if sz < 0 or se < 0:
                continue
            vendor_zero[v].append(sz)
            vendor_eng[v].append(se)
            vendor_diff[v].append(se - sz)
            success_zero[v].append(1 if sz >= 3 else 0)
            success_eng[v].append(1 if se >= 3 else 0)
            by_lang[lang][v].append(se - sz)

    effects = []
    for v in VENDORS:
        zero_mean = float(np.mean(vendor_zero[v])) if vendor_zero[v] else 0.0
        eng_mean = float(np.mean(vendor_eng[v])) if vendor_eng[v] else 0.0
        delta = eng_mean - zero_mean
        delta_se = (
            float(np.std(vendor_diff[v], ddof=1) / math.sqrt(len(vendor_diff[v])))
            if len(vendor_diff[v]) > 1 else 0.0
        )
        _, p = paired_t(vendor_diff[v])
        d = cohen_d_paired(vendor_diff[v])
        sr_zero = float(np.mean(success_zero[v])) if success_zero[v] else 0.0
        sr_eng = float(np.mean(success_eng[v])) if success_eng[v] else 0.0
        effects.append({
            "vendor": v,
            "zeroMean": round(zero_mean, 3),
            "engineeredMean": round(eng_mean, 3),
            "delta": round(delta, 3),
            "deltaSE": round(delta_se, 3),
            "pValue": p,
            "cohenD": round(d, 3),
            "successRateZero": round(sr_zero, 3),
            "successRateEng": round(sr_eng, 3),
            "n": len(vendor_diff[v]),
        })

    # Pairwise Cohen's kappa on engineered-mode binary success
    kappa_matrix: list[list[float]] = []
    for v1 in VENDORS:
        row = []
        for v2 in VENDORS:
            if v1 == v2:
                row.append(1.0)
                continue
            # restrict to records where BOTH have valid grades
            paired_a, paired_b = [], []
            for rec in records:
                a = rec["modes"]["engineered"]["grades"].get(v1, {}).get("score", -1)
                b = rec["modes"]["engineered"]["grades"].get(v2, {}).get("score", -1)
                if a < 0 or b < 0:
                    continue
                paired_a.append(1 if a >= 3 else 0)
                paired_b.append(1 if b >= 3 else 0)
            row.append(round(cohen_kappa_binary(paired_a, paired_b), 3))
        kappa_matrix.append(row)

    # Per-language effects (only keep langs with n >= 4)
    lang_effects = []
    for lang, vendor_diffs in by_lang.items():
        ns = [len(vendor_diffs[v]) for v in VENDORS]
        n = min(ns)
        if n < 4:
            continue
        lang_effects.append({
            "language": lang,
            "n": n,
            "kimi": round(float(np.mean(vendor_diffs["kimi"])), 3),
            "claude": round(float(np.mean(vendor_diffs["claude"])), 3),
            "gemini": round(float(np.mean(vendor_diffs["gemini"])), 3),
        })
    lang_effects.sort(key=lambda x: -x["n"])

    total_outputs = sum(len(vendor_zero[v]) + len(vendor_eng[v]) for v in VENDORS)

    # ---- Render TypeScript ----
    def fmt_p(p: float) -> str:
        if p < 1e-12:
            return "1e-12"
        return f"{p:.3e}"

    ts = []
    ts.append("// Auto-generated by pipeline/import_study_results.py — do not hand-edit.")
    ts.append("// Source: results/multi_model/multi_model_study.json\n")
    ts.append('export type Vendor = "kimi" | "claude" | "gemini";\n')
    ts.append("export interface VendorMeta {")
    ts.append("  id: Vendor;")
    ts.append("  displayName: string;")
    ts.append("  shortName: string;")
    ts.append("  modelId: string;")
    ts.append("  vendor: string;")
    ts.append("  accentText: string;")
    ts.append("  accentBg: string;")
    ts.append("  accentBorder: string;")
    ts.append("  accentHex: string;")
    ts.append("}\n")
    ts.append("export const VENDORS: Record<Vendor, VendorMeta> = {")
    ts.append('  kimi: { id: "kimi", displayName: "Kimi K2", shortName: "Kimi", modelId: "moonshotai/kimi-k2-instruct", vendor: "Moonshot AI · NVIDIA NIM", accentText: "text-amber-400", accentBg: "bg-amber-400/10", accentBorder: "border-amber-400/30", accentHex: "#fbbf24" },')
    ts.append('  claude: { id: "claude", displayName: "Claude Sonnet 4.6", shortName: "Claude", modelId: "us.anthropic.claude-sonnet-4-5-20250929-v1:0", vendor: "Anthropic · AWS Bedrock", accentText: "text-indigo-400", accentBg: "bg-indigo-400/10", accentBorder: "border-indigo-400/30", accentHex: "#818cf8" },')
    ts.append('  gemini: { id: "gemini", displayName: "Gemini 3.1 Pro Preview", shortName: "Gemini", modelId: "gemini-3.1-pro-preview", vendor: "Google · Vertex AI", accentText: "text-teal-400", accentBg: "bg-teal-400/10", accentBorder: "border-teal-400/30", accentHex: "#2dd4bf" },')
    ts.append("};\n")

    ts.append("export interface VendorEffect {")
    ts.append("  vendor: Vendor;")
    ts.append("  zeroMean: number;")
    ts.append("  engineeredMean: number;")
    ts.append("  delta: number;")
    ts.append("  deltaSE: number;")
    ts.append("  pValue: number;")
    ts.append("  cohenD: number;")
    ts.append("  successRateZero: number;")
    ts.append("  successRateEng: number;")
    ts.append("  n: number;")
    ts.append("}\n")

    ts.append("export const VENDOR_EFFECTS: VendorEffect[] = [")
    for e in effects:
        ts.append(
            f'  {{ vendor: "{e["vendor"]}", zeroMean: {e["zeroMean"]}, engineeredMean: {e["engineeredMean"]}, '
            f"delta: {e['delta']}, deltaSE: {e['deltaSE']}, pValue: {fmt_p(e['pValue'])}, "
            f"cohenD: {e['cohenD']}, successRateZero: {e['successRateZero']}, "
            f"successRateEng: {e['successRateEng']}, n: {e['n']} }},"
        )
    ts.append("];\n")

    ts.append("export const KAPPA_MATRIX: number[][] = [")
    for row in kappa_matrix:
        ts.append("  [" + ", ".join(f"{x}" for x in row) + "],")
    ts.append("];\n")

    ts.append('export const KAPPA_LABELS: Vendor[] = ["kimi", "claude", "gemini"];\n')

    ts.append("export interface LanguageEffect { language: string; n: number; kimi: number; claude: number; gemini: number; }\n")

    ts.append("export const LANGUAGE_EFFECTS: LanguageEffect[] = [")
    for le in lang_effects:
        ts.append(
            f'  {{ language: "{le["language"]}", n: {le["n"]}, '
            f'kimi: {le["kimi"]}, claude: {le["claude"]}, gemini: {le["gemini"]} }},'
        )
    ts.append("];\n")

    ts.append("export const STUDY_META = {")
    ts.append(f"  totalConversations: {len(records)},")
    ts.append(f"  totalOutputs: {total_outputs},")
    ts.append(f"  vendors: {len(VENDORS)},")
    ts.append(f"  modes: {len(MODES)},")
    ts.append('  judgeModel: "Claude Sonnet 4.6 (rubric-based)",')
    ts.append("  rubricMaxScore: 4,")
    ts.append("  isPlaceholder: false,")
    ts.append("};")

    OUTPUT.write_text("\n".join(ts) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT}")
    print(f"Effects: {effects}")


if __name__ == "__main__":
    main()
