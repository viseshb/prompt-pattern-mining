from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Dict, List

import numpy as np
import pandas as pd
import seaborn as sns
import matplotlib.pyplot as plt

from .feature_extraction import compile_patterns, load_pattern_config
from .success_label_and_model import BASE_FEATURES, build_model_dataset, fit_logistic_model


VARIANTS = [
    "primary",
    "explicit_strict",
    "strict_positive",
    "signal_only",
    "no_no_code_penalty",
]


def label_conversations_variant(
    turn_feature_df: pd.DataFrame, patterns: Dict[str, re.Pattern], variant: str
) -> pd.DataFrame:
    rows: List[dict] = []
    ordered = turn_feature_df.sort_values(["conversation_id", "turn_index"])

    for conversation_id, group in ordered.groupby("conversation_id"):
        group = group.sort_values("turn_index")
        prompts = group["prompt"].fillna("").tolist()
        has_code = int(
            bool((group["answer_code_blocks"] > 0).any() or (group["answer_has_fenced_code"] > 0).any())
        )

        latest_signal = None
        latest_turn = -1
        positive_turns = 0
        negative_turns = 0

        for idx, prompt in enumerate(prompts[1:], start=2):
            is_pos = bool(patterns["positive_ack"].search(prompt))
            is_neg = bool(patterns["negative_ack"].search(prompt))

            if is_pos:
                positive_turns += 1
                if idx > latest_turn:
                    latest_signal = "positive"
                    latest_turn = idx
            if is_neg:
                negative_turns += 1
                if idx > latest_turn:
                    latest_signal = "negative"
                    latest_turn = idx

        success = pd.NA
        reason = "unknown_ambiguous"

        if variant == "primary":
            # Matches the main label_conversations() optimistic logic
            if has_code and negative_turns == 0:
                success = 1
                reason = "code_present_no_negative"
            elif negative_turns > 0:
                success = 0
                reason = "any_negative_feedback"
            elif not has_code:
                success = 0
                reason = "no_code_generated"

        elif variant == "explicit_strict":
            # Old strict definition: requires explicit positive ack + code
            if has_code and latest_signal == "positive":
                success = 1
                reason = "explicit_positive_after_code"
            elif latest_signal == "negative":
                success = 0
                reason = "explicit_negative_feedback"
            elif not has_code:
                success = 0
                reason = "no_code_generated"

        elif variant == "strict_positive":
            if has_code and positive_turns > 0 and negative_turns == 0:
                success = 1
                reason = "strict_positive_no_negative"
            elif negative_turns > 0:
                success = 0
                reason = "any_negative_feedback"
            elif not has_code:
                success = 0
                reason = "no_code_generated"

        elif variant == "signal_only":
            if latest_signal == "positive":
                success = 1
                reason = "latest_signal_positive"
            elif latest_signal == "negative":
                success = 0
                reason = "latest_signal_negative"

        elif variant == "no_no_code_penalty":
            if has_code and latest_signal == "positive":
                success = 1
                reason = "explicit_positive_after_code"
            elif latest_signal == "negative":
                success = 0
                reason = "explicit_negative_feedback"

        rows.append(
            {
                "conversation_id": conversation_id,
                "variant": variant,
                "has_code": has_code,
                "explicit_positive": int(positive_turns > 0),
                "explicit_negative": int(negative_turns > 0),
                "success": success,
                "label_reason": reason,
            }
        )

    return pd.DataFrame(rows)


def _safe_metric_get(metrics: dict, path: List[str], default=np.nan):
    value = metrics
    for key in path:
        if not isinstance(value, dict) or key not in value:
            return default
        value = value[key]
    return value


def _build_variant_summary_row(variant: str, labels_df: pd.DataFrame, metrics: dict) -> dict:
    total = int(len(labels_df))
    labeled = int(labels_df["success"].notna().sum()) if "success" in labels_df.columns else 0
    unknown = total - labeled
    n_success = int((labels_df["success"] == 1).sum()) if labeled else 0
    n_failure = int((labels_df["success"] == 0).sum()) if labeled else 0

    return {
        "variant": variant,
        "n_total": total,
        "n_labeled": labeled,
        "n_unknown": unknown,
        "n_success": n_success,
        "n_failure": n_failure,
        "roc_auc_mean": _safe_metric_get(metrics, ["cross_validation", "roc_auc_mean"]),
        "roc_auc_std": _safe_metric_get(metrics, ["cross_validation", "roc_auc_std"]),
        "accuracy_mean": _safe_metric_get(metrics, ["cross_validation", "accuracy_mean"]),
        "f1_mean": _safe_metric_get(metrics, ["cross_validation", "f1_mean"]),
        "error": metrics.get("error") if isinstance(metrics, dict) else None,
    }


def _build_sign_stability(coeff_df: pd.DataFrame) -> pd.DataFrame:
    if coeff_df.empty:
        return pd.DataFrame()

    subset = coeff_df[coeff_df["feature"].isin(BASE_FEATURES)].copy()
    if subset.empty:
        return pd.DataFrame()

    subset["coef_sign"] = np.sign(subset["coef_log_odds"])
    stability = (
        subset.groupby("feature")
        .agg(
            n_variants=("variant", "nunique"),
            positive_sign_count=("coef_sign", lambda x: int((x > 0).sum())),
            negative_sign_count=("coef_sign", lambda x: int((x < 0).sum())),
            mean_odds_ratio=("odds_ratio", "mean"),
            std_odds_ratio=("odds_ratio", "std"),
        )
        .reset_index()
    )
    stability["positive_sign_ratio"] = (
        stability["positive_sign_count"] / stability["n_variants"]
    )
    return stability.sort_values("feature").reset_index(drop=True)


def _plot_or_stability(coeff_df: pd.DataFrame, out_path: Path) -> None:
    subset = coeff_df[coeff_df["feature"].isin(BASE_FEATURES)].copy()
    if subset.empty:
        return

    pivot = subset.pivot_table(index="variant", columns="feature", values="odds_ratio", aggfunc="mean")
    if pivot.empty:
        return

    log_or = np.log(pivot.clip(lower=1e-6))
    fig, ax = plt.subplots(figsize=(10, 4))
    sns.heatmap(
        log_or,
        annot=True,
        fmt=".2f",
        cmap="coolwarm",
        center=0.0,
        linewidths=0.5,
        cbar_kws={"label": "log(odds ratio)"},
        ax=ax,
    )
    ax.set_title("Coefficient Stability Across Label Variants")
    plt.tight_layout()
    fig.savefig(out_path, dpi=300)
    plt.close(fig)


def run_language_subgroup_analysis(
    conversation_features: pd.DataFrame,
    labels_df: pd.DataFrame,
    include_controls: bool,
    min_control_count: int,
    out_dir: Path,
) -> None:
    """Run logistic regression separately for each programming language subgroup."""
    if "repo_language" not in conversation_features.columns:
        return

    merged = conversation_features.merge(
        labels_df[["conversation_id", "success"]], on="conversation_id", how="inner"
    )
    merged = merged.dropna(subset=["success"]).copy()
    if merged.empty:
        return

    lang_col = merged["repo_language"].fillna("UNKNOWN").astype(str)
    lang_counts = lang_col.value_counts()
    # Only analyze languages with at least 10 labeled conversations
    eligible_langs = lang_counts[lang_counts >= 10].index.tolist()

    if not eligible_langs:
        return

    subgroup_rows: List[dict] = []
    subgroup_coefficients: List[pd.DataFrame] = []

    for lang in sorted(eligible_langs):
        lang_mask = lang_col == lang
        lang_conv_ids = set(merged.loc[lang_mask, "conversation_id"])
        lang_conv_features = conversation_features[
            conversation_features["conversation_id"].isin(lang_conv_ids)
        ]
        lang_labels = labels_df[labels_df["conversation_id"].isin(lang_conv_ids)]

        model_df, feature_cols, control_cols = build_model_dataset(
            conversation_feature_df=lang_conv_features,
            labels_df=lang_labels,
            include_controls=False,  # no controls within subgroup
            min_control_count=min_control_count,
        )

        if model_df.empty or "success" not in model_df.columns:
            continue
        y = model_df["success"].astype(int)
        if y.nunique() < 2:
            continue

        coef_df, metrics = fit_logistic_model(model_df, feature_cols, [])

        subgroup_rows.append({
            "language": lang,
            "n_conversations": int(len(model_df)),
            "n_success": int((y == 1).sum()),
            "n_failure": int((y == 0).sum()),
            "roc_auc_mean": _safe_metric_get(metrics, ["cross_validation", "roc_auc_mean"]),
            "accuracy_mean": _safe_metric_get(metrics, ["cross_validation", "accuracy_mean"]),
            "f1_mean": _safe_metric_get(metrics, ["cross_validation", "f1_mean"]),
        })

        if not coef_df.empty:
            coef_df = coef_df.copy()
            coef_df["language"] = lang
            subgroup_coefficients.append(coef_df)

    if subgroup_rows:
        subgroup_summary = pd.DataFrame(subgroup_rows).sort_values("language")
        subgroup_summary.to_csv(out_dir / "language_subgroup_summary.csv", index=False)
        print(f"Saved: {out_dir / 'language_subgroup_summary.csv'}")

    if subgroup_coefficients:
        subgroup_coef = pd.concat(subgroup_coefficients, ignore_index=True)
        subgroup_coef.to_csv(out_dir / "language_subgroup_coefficients.csv", index=False)
        print(f"Saved: {out_dir / 'language_subgroup_coefficients.csv'}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run sensitivity and robustness analyses using alternate success-label definitions."
    )
    parser.add_argument(
        "--turn-features",
        default="data/processed/turn_features.parquet",
        help="Path to turn_features.parquet.",
    )
    parser.add_argument(
        "--conversation-features",
        default="data/processed/conversation_features.parquet",
        help="Path to conversation_features.parquet.",
    )
    parser.add_argument(
        "--pattern-config",
        default="config/feature_patterns.yaml",
        help="Path to regex pattern config YAML.",
    )
    parser.add_argument(
        "--out-dir",
        default="results/sensitivity",
        help="Output directory for sensitivity outputs.",
    )
    parser.add_argument(
        "--include-controls",
        action="store_true",
        help="Include source/model/language controls in each variant model.",
    )
    parser.add_argument(
        "--min-control-count",
        type=int,
        default=100,
        help="Frequency threshold used for control-category reduction.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    turn_features = pd.read_parquet(args.turn_features)
    conversation_features = pd.read_parquet(args.conversation_features)
    pattern_config = load_pattern_config(args.pattern_config)
    patterns = compile_patterns(pattern_config)

    summary_rows = []
    all_coefficients = []
    labels_concat = []
    metrics_by_variant = {}

    for variant in VARIANTS:
        labels_df = label_conversations_variant(turn_features, patterns, variant=variant)
        labels_concat.append(labels_df)

        model_df, feature_cols, control_cols = build_model_dataset(
            conversation_feature_df=conversation_features,
            labels_df=labels_df,
            include_controls=args.include_controls,
            min_control_count=args.min_control_count,
        )
        coef_df, metrics = fit_logistic_model(model_df, feature_cols, control_cols)
        metrics_by_variant[variant] = metrics

        summary_rows.append(_build_variant_summary_row(variant, labels_df, metrics))

        if not coef_df.empty:
            coef_df = coef_df.copy()
            coef_df["variant"] = variant
            all_coefficients.append(coef_df)

    summary_df = pd.DataFrame(summary_rows).sort_values("variant")
    coef_df = pd.concat(all_coefficients, ignore_index=True) if all_coefficients else pd.DataFrame()
    labels_df = pd.concat(labels_concat, ignore_index=True) if labels_concat else pd.DataFrame()
    stability_df = _build_sign_stability(coef_df)

    summary_path = out_dir / "sensitivity_summary.csv"
    coef_path = out_dir / "sensitivity_coefficients.csv"
    labels_path = out_dir / "sensitivity_labels.parquet"
    stability_path = out_dir / "coefficient_sign_stability.csv"
    metrics_json_path = out_dir / "sensitivity_metrics.json"
    heatmap_path = out_dir / "coefficient_stability_heatmap.png"

    summary_df.to_csv(summary_path, index=False)
    coef_df.to_csv(coef_path, index=False)
    labels_df.to_parquet(labels_path, index=False)
    stability_df.to_csv(stability_path, index=False)
    with metrics_json_path.open("w", encoding="utf-8") as file:
        json.dump(metrics_by_variant, file, indent=2)

    if not coef_df.empty:
        _plot_or_stability(coef_df, heatmap_path)

    # Language subgroup analysis
    # Use the primary labeling (optimistic_code_present) for subgroup analysis
    primary_labels = labels_concat[0] if labels_concat else pd.DataFrame()
    if not primary_labels.empty:
        run_language_subgroup_analysis(
            conversation_features=conversation_features,
            labels_df=primary_labels,
            include_controls=args.include_controls,
            min_control_count=args.min_control_count,
            out_dir=out_dir,
        )

    print(f"Saved: {summary_path}")
    print(f"Saved: {coef_path}")
    print(f"Saved: {labels_path}")
    print(f"Saved: {stability_path}")
    print(f"Saved: {metrics_json_path}")
    if heatmap_path.exists():
        print(f"Saved: {heatmap_path}")


if __name__ == "__main__":
    main()
