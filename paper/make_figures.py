"""Generate IEEE column width figures (3.3 in wide) for the paper.
All figures use Times-like serif and 8pt-9pt to match \columnwidth rendering.
Output: paper_zip/figures/*.png at 300 dpi.
"""
from __future__ import annotations
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(__file__).resolve().parent / "figures"
OUT.mkdir(parents=True, exist_ok=True)

plt.rcParams.update({
    "font.family": "serif",
    "font.size": 9,
    "axes.titlesize": 9,
    "axes.labelsize": 8,
    "xtick.labelsize": 7.5,
    "ytick.labelsize": 7.5,
    "legend.fontsize": 7.5,
    "axes.linewidth": 0.8,
    "axes.edgecolor": "#333",
    "axes.spines.top": False,
    "axes.spines.right": False,
    "savefig.dpi": 300,
    "savefig.bbox": "tight",
    "savefig.pad_inches": 0.06,
    "figure.dpi": 300,
})

COL_W = 3.3        # column width inches
DBL_W = 7.0        # double column width inches


def fig_odds_ratio_forest():
    df = pd.read_csv(ROOT / "results" / "coefficients.csv")
    keep = [
        "has_output_format_first", "first_specification_clarity_count",
        "refinement_turns", "total_example_count", "iteration_count",
        "first_prompt_tokens", "prompt_token_growth", "first_constraint_count",
        "has_specification_clarity_first", "has_role_instruction_first",
    ]
    label_map = {
        "has_output_format_first": "Output Format",
        "first_specification_clarity_count": "Spec Clarity",
        "refinement_turns": "Refinement Turns",
        "total_example_count": "Examples",
        "iteration_count": "Iterations",
        "first_prompt_tokens": "Prompt Length",
        "prompt_token_growth": "Token Growth",
        "first_constraint_count": "Constraints",
        "has_specification_clarity_first": "Spec Clarity (bin)",
        "has_role_instruction_first": "Role Instruction",
    }
    sub = df[df["feature"].isin(keep)].copy()
    sub["label"] = sub["feature"].map(label_map)
    sub = sub.sort_values("odds_ratio")
    fig, ax = plt.subplots(figsize=(COL_W, 3.2))
    y = np.arange(len(sub))
    or_vals = sub["odds_ratio"].values
    lo = sub["odds_ratio_ci_low"].values
    hi = sub["odds_ratio_ci_high"].values
    sig = sub["p_value"].values < 0.05
    colors = ["#2E7D32" if v >= 1 else "#C62828" for v in or_vals]
    ax.errorbar(or_vals, y, xerr=[or_vals - lo, hi - or_vals],
                fmt="none", ecolor="#666", elinewidth=1.0, capsize=2)
    for i, (v, c, s) in enumerate(zip(or_vals, colors, sig)):
        ax.scatter([v], [i], color=c, s=30, zorder=3,
                   edgecolor="black", linewidth=0.6,
                   marker="o" if s else "s")
    ax.axvline(1.0, color="#333", linestyle="--", linewidth=0.8)
    ax.set_yticks(y)
    ax.set_yticklabels(sub["label"].values)
    ax.set_xlabel("Odds Ratio (95% CI)")
    ax.set_xscale("log")
    ax.set_xlim(0.4, 3.0)
    ax.set_xticks([0.5, 0.7, 1.0, 1.5, 2.0, 3.0])
    ax.set_xticklabels([0.5, 0.7, 1.0, 1.5, 2.0, 3.0])
    ax.grid(axis="x", linestyle=":", linewidth=0.5, alpha=0.5)
    fig.savefig(OUT / "fig_odds_ratio_forest.png")
    plt.close(fig)


def fig_baselines():
    data = json.loads((ROOT / "results" / "baselines.json").read_text())
    items = [("Majority", data["majority"]), ("Random", data["random"]),
             ("BOW LR", data["bow_logistic"]), ("Ours", data["our_model"])]
    labels, vals = zip(*items)
    fig, ax = plt.subplots(figsize=(COL_W, 1.8))
    colors = ["#9E9E9E", "#9E9E9E", "#1565C0", "#2E7D32"]
    bars = ax.barh(range(len(labels)), vals, color=colors,
                   edgecolor="black", linewidth=0.6)
    ax.set_yticks(range(len(labels)))
    ax.set_yticklabels(labels)
    ax.set_xlim(0.4, 0.85)
    ax.set_xlabel("5-fold stratified ROC-AUC")
    for b, v in zip(bars, vals):
        ax.text(v + 0.005, b.get_y() + b.get_height() / 2,
                f"{v:.3f}", va="center", fontsize=8)
    ax.grid(axis="x", linestyle=":", linewidth=0.5, alpha=0.5)
    fig.savefig(OUT / "fig_baselines.png")
    plt.close(fig)


def fig_ablation():
    data = json.loads((ROOT / "results" / "ablation.json").read_text())
    rows = sorted(data["ablations"], key=lambda r: r["delta"], reverse=True)
    labels = [r["group"].replace("Prompt-engineering features", "Prompt features")
              .replace("Repository language", "Language")
              .replace("ChatGPT model variant", "Model variant")
              for r in rows]
    deltas = [r["delta"] for r in rows]
    fig, ax = plt.subplots(figsize=(COL_W, 2.0))
    bars = ax.barh(range(len(labels)), deltas,
                   color="#C62828", edgecolor="black", linewidth=0.6)
    ax.set_yticks(range(len(labels)))
    ax.set_yticklabels(labels)
    ax.invert_yaxis()
    ax.set_xlabel("AUC drop when group is removed")
    for b, d in zip(bars, deltas):
        ax.text(d + 0.0008, b.get_y() + b.get_height() / 2,
                f"-{d:.3f}", va="center", fontsize=8)
    ax.set_xlim(0, max(deltas) * 1.25)
    ax.grid(axis="x", linestyle=":", linewidth=0.5, alpha=0.5)
    fig.savefig(OUT / "fig_ablation.png")
    plt.close(fig)


def fig_feature_dist():
    df = pd.read_parquet(ROOT / "results" / "model_dataset.parquet")
    feats = [
        ("first_prompt_tokens", "Prompt Length"),
        ("iteration_count", "Iterations"),
        ("total_example_count", "Examples"),
        ("first_constraint_count", "Constraints"),
        ("refinement_turns", "Refinement"),
        ("correction_cycles", "Corrections"),
    ]
    g = df.groupby("success")[[f for f, _ in feats]].mean()
    succ = g.loc[1].values
    fail = g.loc[0].values
    fig, ax = plt.subplots(figsize=(COL_W, 2.4))
    y = np.arange(len(feats))
    h = 0.36
    ax.barh(y - h/2, succ, h, color="#2E7D32",
            edgecolor="black", linewidth=0.5, label="Success")
    ax.barh(y + h/2, fail, h, color="#C62828",
            edgecolor="black", linewidth=0.5, label="Failure")
    ax.set_yticks(y)
    ax.set_yticklabels([lbl for _, lbl in feats])
    ax.invert_yaxis()
    ax.set_xscale("symlog", linthresh=0.1)
    ax.set_xlabel("mean value (log scale)")
    ax.legend(loc="lower right", framealpha=0.9)
    ax.grid(axis="x", linestyle=":", linewidth=0.5, alpha=0.5)
    fig.savefig(OUT / "fig_feature_dist.png")
    plt.close(fig)


def fig_temporal_drift():
    data = json.loads((ROOT / "results" / "temporal_drift.json").read_text())
    of = data["features"]["has_output_format_first"]
    rt = data["features"]["refinement_turns"]
    fig, ax = plt.subplots(figsize=(COL_W, 2.2))
    dates = [r["date"] for r in of]
    ax.errorbar(range(len(of)), [r["or"] for r in of],
                yerr=[[r["or"] - r["ci_low"] for r in of],
                      [r["ci_high"] - r["or"] for r in of]],
                fmt="o-", color="#2E7D32", capsize=2,
                label="Output Format", linewidth=1.0, markersize=4)
    ax.errorbar(range(len(rt)), [r["or"] for r in rt],
                yerr=[[r["or"] - r["ci_low"] for r in rt],
                      [r["ci_high"] - r["or"] for r in rt]],
                fmt="s-", color="#C62828", capsize=2,
                label="Refinement", linewidth=1.0, markersize=4)
    ax.axhline(1.0, color="#333", linestyle="--", linewidth=0.8)
    ax.set_xticks(range(len(of)))
    ax.set_xticklabels([d[5:] for d in dates], rotation=30, ha="right")
    ax.set_ylabel("Odds Ratio per snapshot")
    ax.set_xlabel("Snapshot date (2023-2024)")
    ax.set_yscale("log")
    ax.set_yticks([0.3, 0.5, 0.7, 1.0, 1.5, 3.0, 7.0])
    ax.set_yticklabels(["0.3", "0.5", "0.7", "1.0", "1.5", "3.0", "7.0"])
    ax.legend(loc="upper left", framealpha=0.9)
    ax.grid(linestyle=":", linewidth=0.5, alpha=0.5)
    fig.savefig(OUT / "fig_temporal_drift.png")
    plt.close(fig)


def fig_cross_model():
    fig, ax = plt.subplots(figsize=(COL_W, 2.2))
    vendors = ["Kimi K2", "Claude S 4.6", "Gemini 3.1"]
    zero = [2.505, 3.025, 2.480]
    eng = [3.115, 3.370, 3.165]
    x = np.arange(len(vendors))
    w = 0.35
    ax.bar(x - w/2, zero, w, color="#9E9E9E", edgecolor="black",
           linewidth=0.5, label="Zero-shot")
    ax.bar(x + w/2, eng, w, color="#2E7D32", edgecolor="black",
           linewidth=0.5, label="Engineered")
    for xi, (z, e) in enumerate(zip(zero, eng)):
        ax.text(xi - w/2, z + 0.05, f"{z:.2f}", ha="center", fontsize=7.5)
        ax.text(xi + w/2, e + 0.05, f"{e:.2f}", ha="center", fontsize=7.5)
    ax.set_xticks(x)
    ax.set_xticklabels(vendors)
    ax.set_ylim(0, 4.2)
    ax.set_ylabel("Mean rubric score (0--4)")
    ax.legend(loc="lower right", framealpha=0.9)
    ax.grid(axis="y", linestyle=":", linewidth=0.5, alpha=0.5)
    fig.savefig(OUT / "fig_cross_model.png")
    plt.close(fig)


def fig_interactions():
    data = json.loads((ROOT / "results" / "interactions.json").read_text())
    rows = data["interactions"]
    rows = sorted(rows, key=lambda r: r["or"])
    labels = [r["label"].replace("×", "x") for r in rows]
    or_vals = [r["or"] for r in rows]
    lo = [r["ci_low"] for r in rows]
    hi = [r["ci_high"] for r in rows]
    sig = [r["significant"] for r in rows]
    fig, ax = plt.subplots(figsize=(COL_W, 2.0))
    y = np.arange(len(labels))
    colors = ["#2E7D32" if v >= 1 else "#C62828" for v in or_vals]
    ax.errorbar(or_vals, y, xerr=[[v - l for v, l in zip(or_vals, lo)],
                                  [h - v for v, h in zip(or_vals, hi)]],
                fmt="none", ecolor="#666", elinewidth=1.0, capsize=2)
    for i, (v, c, s) in enumerate(zip(or_vals, colors, sig)):
        ax.scatter([v], [i], color=c, s=40 if s else 25, zorder=3,
                   edgecolor="black", linewidth=0.6,
                   marker="o" if s else "s")
    ax.axvline(1.0, color="#333", linestyle="--", linewidth=0.8)
    ax.set_yticks(y)
    ax.set_yticklabels(labels)
    ax.set_xscale("log")
    ax.set_xlabel("Interaction OR (95% CI)")
    ax.set_xticks([0.7, 1.0, 2.0, 5.0, 10.0])
    ax.set_xticklabels(["0.7", "1.0", "2.0", "5.0", "10"])
    ax.grid(axis="x", linestyle=":", linewidth=0.5, alpha=0.5)
    fig.savefig(OUT / "fig_interactions.png")
    plt.close(fig)


def fig_correlation():
    df = pd.read_parquet(ROOT / "results" / "model_dataset.parquet")
    feats = ["first_prompt_tokens", "first_constraint_count",
             "total_example_count", "first_specification_clarity_count",
             "has_role_instruction_first", "has_output_format_first",
             "iteration_count", "refinement_turns", "correction_cycles",
             "prompt_token_growth"]
    label_map = {
        "first_prompt_tokens": "Prompt Length",
        "first_constraint_count": "Constraints",
        "total_example_count": "Examples",
        "first_specification_clarity_count": "Spec Clarity",
        "has_role_instruction_first": "Role",
        "has_output_format_first": "Output Format",
        "iteration_count": "Iterations",
        "refinement_turns": "Refinement",
        "correction_cycles": "Corrections",
        "prompt_token_growth": "Token Growth",
    }
    sub = df[feats].rank().corr(method="spearman").values
    labels = [label_map[f] for f in feats]
    fig, ax = plt.subplots(figsize=(COL_W, 2.8))
    im = ax.imshow(sub, cmap="RdBu_r", vmin=-1, vmax=1)
    ax.set_xticks(range(len(labels)))
    ax.set_xticklabels(labels, rotation=45, ha="right")
    ax.set_yticks(range(len(labels)))
    ax.set_yticklabels(labels)
    cbar = fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
    cbar.ax.tick_params(labelsize=7)
    cbar.set_label("Spearman rho", fontsize=7.5)
    fig.savefig(OUT / "fig_correlation.png")
    plt.close(fig)


def fig_kappa_heatmap():
    M = np.array([[1.0, 0.431, 0.388],
                  [0.431, 1.0, 0.431],
                  [0.388, 0.431, 1.0]])
    labels = ["Kimi", "Claude", "Gemini"]
    fig, ax = plt.subplots(figsize=(COL_W, 2.2))
    im = ax.imshow(M, cmap="Greens", vmin=0, vmax=1)
    ax.set_xticks(range(3))
    ax.set_xticklabels(labels)
    ax.set_yticks(range(3))
    ax.set_yticklabels(labels)
    for i in range(3):
        for j in range(3):
            color = "white" if M[i, j] > 0.6 else "black"
            ax.text(j, i, f"{M[i,j]:.2f}", ha="center", va="center",
                    fontsize=10, color=color)
    cbar = fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
    cbar.ax.tick_params(labelsize=7)
    cbar.set_label("Cohen's $\\kappa$", fontsize=7.5)
    fig.savefig(OUT / "fig_kappa_heatmap.png")
    plt.close(fig)


if __name__ == "__main__":
    fig_odds_ratio_forest()
    fig_baselines()
    fig_ablation()
    fig_feature_dist()
    fig_temporal_drift()
    fig_cross_model()
    fig_interactions()
    fig_correlation()
    fig_kappa_heatmap()
    print("done. figures in", OUT)
