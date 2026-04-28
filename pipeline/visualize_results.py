from __future__ import annotations

import argparse
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns

sns.set_theme(style="whitegrid", context="talk")

# Only plot the 11 prompt-engineering base features (not model/snapshot/language controls)
BASE_FEATURE_NAMES = [
    "first_prompt_tokens",
    "first_constraint_count",
    "total_example_count",
    "first_specification_clarity_count",
    "has_role_instruction_first",
    "has_output_format_first",
    "has_specification_clarity_first",
    "iteration_count",
    "refinement_turns",
    "correction_cycles",
    "prompt_token_growth",
]

NICE_NAMES = {
    "first_prompt_tokens": "First Prompt\nTokens",
    "first_constraint_count": "Constraint\nCount",
    "first_specification_clarity_count": "Spec Clarity\nCount",
    "iteration_count": "Iteration\nCount",
    "correction_cycles": "Correction\nCycles",
    "prompt_token_growth": "Prompt Token\nGrowth",
    "total_example_count": "Example\nCount",
    "refinement_turns": "Refinement\nTurns",
    "has_role_instruction_first": "Role\nInstruction",
    "has_output_format_first": "Output Format\nInstruction",
    "has_specification_clarity_first": "Spec Clarity\n(Binary)",
}


def _prepare_plot_df(conversation_features: pd.DataFrame, labels: pd.DataFrame) -> pd.DataFrame:
    merged = conversation_features.merge(
        labels[["conversation_id", "success"]], on="conversation_id", how="inner"
    )
    merged = merged.dropna(subset=["success"]).copy()
    merged["success"] = merged["success"].astype(int)
    merged["success_label"] = merged["success"].map({0: "Unsuccessful", 1: "Successful"})
    return merged


def plot_distributions(plot_df: pd.DataFrame, out_path: Path) -> None:
    feature_cols = [
        "first_prompt_tokens",
        "first_constraint_count",
        "first_specification_clarity_count",
        "iteration_count",
        "correction_cycles",
        "prompt_token_growth",
    ]
    available = [col for col in feature_cols if col in plot_df.columns]
    if not available:
        return

    n = len(available)
    ncols = min(3, n)
    nrows = (n + ncols - 1) // ncols

    fig, axes = plt.subplots(nrows, ncols, figsize=(6 * ncols, 5 * nrows), squeeze=False)
    axes_flat = axes.ravel()

    for i, col in enumerate(available):
        ax = axes_flat[i]
        sns.boxplot(
            data=plot_df,
            x="success_label",
            hue="success_label",
            y=col,
            ax=ax,
            whis=1.5,
            showfliers=False,
            palette={"Successful": "#2E7D32", "Unsuccessful": "#C62828"},
            legend=False,
        )
        nice = NICE_NAMES.get(col, col.replace("_", " ").title())
        ax.set_title(nice.replace("\n", " "), fontsize=14, fontweight="bold")
        ax.set_xlabel("")
        ax.set_ylabel("")
        ax.tick_params(labelsize=11)

    # Hide unused axes
    for j in range(n, len(axes_flat)):
        axes_flat[j].set_visible(False)

    plt.tight_layout(pad=2.0)
    fig.savefig(out_path, dpi=200, bbox_inches="tight")
    plt.close(fig)


def plot_correlation_heatmap(plot_df: pd.DataFrame, out_path: Path) -> None:
    numeric_cols = [
        "first_prompt_tokens",
        "avg_prompt_tokens",
        "first_constraint_count",
        "avg_constraint_count",
        "total_example_count",
        "first_specification_clarity_count",
        "iteration_count",
        "refinement_turns",
        "refinement_ratio",
        "correction_cycles",
        "prompt_token_growth",
        "success",
    ]
    available = [col for col in numeric_cols if col in plot_df.columns]
    if len(available) < 2:
        return

    nice_labels = {col: NICE_NAMES.get(col, col.replace("_", " ").title()).replace("\n", " ") for col in available}

    corr = plot_df[available].corr(method="spearman")
    corr.index = [nice_labels.get(c, c) for c in corr.index]
    corr.columns = [nice_labels.get(c, c) for c in corr.columns]

    fig, ax = plt.subplots(figsize=(12, 10))
    sns.heatmap(
        corr,
        ax=ax,
        cmap="coolwarm",
        center=0.0,
        vmin=-1.0,
        vmax=1.0,
        linewidths=0.5,
        annot=True,
        fmt=".2f",
        annot_kws={"size": 9},
        cbar_kws={"label": "Spearman rho", "shrink": 0.8},
        square=True,
    )
    ax.set_title("Feature Correlation Matrix", fontsize=16, fontweight="bold", pad=16)
    ax.tick_params(labelsize=10)
    plt.xticks(rotation=45, ha="right")
    plt.yticks(rotation=0)
    plt.tight_layout(pad=2.0)
    fig.savefig(out_path, dpi=200, bbox_inches="tight")
    plt.close(fig)


def plot_odds_ratios(coefficients: pd.DataFrame, out_path: Path) -> None:
    if coefficients.empty or "odds_ratio" not in coefficients.columns:
        return

    coef = coefficients.copy()
    coef = coef[coef["feature"] != "const"] if "const" in coef["feature"].values else coef

    # Filter to base prompt-engineering features only
    coef = coef[coef["feature"].isin(BASE_FEATURE_NAMES)].copy()
    if coef.empty:
        return

    # Clip extreme values for stable plotting
    for col in ["odds_ratio", "odds_ratio_ci_low", "odds_ratio_ci_high"]:
        if col in coef.columns:
            coef[col] = pd.to_numeric(coef[col], errors="coerce").clip(lower=1e-4, upper=1e4)

    coef["nice_name"] = coef["feature"].map(lambda f: NICE_NAMES.get(f, f).replace("\n", " "))
    coef = coef.sort_values("odds_ratio", ascending=True)

    has_ci = (
        "odds_ratio_ci_low" in coef.columns
        and "odds_ratio_ci_high" in coef.columns
        and coef["odds_ratio_ci_low"].notna().any()
    )

    n_features = len(coef)
    fig, ax = plt.subplots(figsize=(10, max(6, 0.6 * n_features)))
    y = np.arange(n_features)

    # Color by direction
    colors = ["#2E7D32" if v >= 1 else "#C62828" for v in coef["odds_ratio"]]
    # Fade non-significant
    p_vals = coef["p_value"].fillna(1.0)
    alphas = [1.0 if p < 0.05 else 0.4 for p in p_vals]

    for yi, (or_val, color, alpha) in enumerate(zip(coef["odds_ratio"], colors, alphas)):
        ax.barh(yi, or_val - 1, left=1, color=color, alpha=alpha, height=0.5, edgecolor="none")

    if has_ci:
        xerr_low = (coef["odds_ratio"] - coef["odds_ratio_ci_low"]).clip(lower=0)
        xerr_high = (coef["odds_ratio_ci_high"] - coef["odds_ratio"]).clip(lower=0)
        ax.errorbar(
            x=coef["odds_ratio"].values,
            y=y,
            xerr=[xerr_low.values, xerr_high.values],
            fmt="o",
            color="#1E88E5",
            ecolor="#607D8B",
            elinewidth=1.5,
            capsize=4,
            markersize=6,
        )
    else:
        ax.scatter(coef["odds_ratio"], y, color="#1E88E5", s=50, zorder=5)

    # Significance stars
    for yi, (or_val, p) in enumerate(zip(coef["odds_ratio"], p_vals)):
        if p < 0.05:
            ax.text(
                coef["odds_ratio_ci_high"].iloc[yi] * 1.05 if has_ci else or_val * 1.05,
                yi,
                "★",
                color="#FFC107",
                fontsize=12,
                va="center",
            )

    ax.axvline(1.0, color="#424242", linestyle="--", linewidth=1.5, zorder=0)
    ax.set_yticks(list(y))
    ax.set_yticklabels(coef["nice_name"], fontsize=12)
    ax.set_xscale("log")
    ax.set_xlabel("Odds Ratio (log scale)", fontsize=12)
    ax.set_title("Prompt Feature Effects on Success", fontsize=16, fontweight="bold", pad=12)
    ax.tick_params(axis="x", labelsize=11)

    plt.tight_layout(pad=2.0)
    fig.savefig(out_path, dpi=200, bbox_inches="tight")
    plt.close(fig)


def save_summary_table(plot_df: pd.DataFrame, out_path: Path) -> None:
    cols = [
        "first_prompt_tokens",
        "first_constraint_count",
        "total_example_count",
        "first_specification_clarity_count",
        "iteration_count",
        "refinement_turns",
        "correction_cycles",
        "prompt_token_growth",
    ]
    available = [col for col in cols if col in plot_df.columns]
    if not available:
        return

    summary = (
        plot_df.groupby("success_label")[available]
        .agg(["median", "mean", "std"])
        .round(3)
    )
    summary.to_csv(out_path)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate paper-oriented visualizations from prompt feature analysis outputs."
    )
    parser.add_argument(
        "--conversation-features",
        required=True,
        help="Path to conversation feature parquet.",
    )
    parser.add_argument("--labels", required=True, help="Path to labels parquet.")
    parser.add_argument(
        "--coefficients",
        default=None,
        help="Optional path to coefficient CSV from logistic regression.",
    )
    parser.add_argument(
        "--out-dir",
        default="results/figures",
        help="Output directory for plots (default: results/figures).",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    conversation_features = pd.read_parquet(args.conversation_features)
    labels = pd.read_parquet(args.labels)
    plot_df = _prepare_plot_df(conversation_features, labels)

    if plot_df.empty:
        print("No labeled observations available for plotting.")
        return

    dist_path = out_dir / "feature_distributions.png"
    corr_path = out_dir / "correlation_heatmap.png"
    summary_path = out_dir / "feature_summary_by_success.csv"

    plot_distributions(plot_df, dist_path)
    plot_correlation_heatmap(plot_df, corr_path)
    save_summary_table(plot_df, summary_path)

    if args.coefficients and Path(args.coefficients).exists():
        coef = pd.read_csv(args.coefficients)
        odds_path = out_dir / "odds_ratio_forest.png"
        plot_odds_ratios(coef, odds_path)

    print(f"Saved: {dist_path}")
    print(f"Saved: {corr_path}")
    print(f"Saved: {summary_path}")
    if args.coefficients and Path(args.coefficients).exists():
        print(f"Saved: {out_dir / 'odds_ratio_forest.png'}")


if __name__ == "__main__":
    main()
