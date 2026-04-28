from __future__ import annotations

import argparse
import json
import re
import warnings
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd
import statsmodels.api as sm
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold, cross_validate

from .feature_extraction import compile_patterns, load_pattern_config

BASE_FEATURES = [
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

CONTROL_COLUMNS = ["source_type", "snapshot", "model", "repo_language"]


def _safe_exp(value: float) -> float:
    # Clip to float64-safe range to avoid overflow in tiny/perfect-separation fits.
    return float(np.exp(np.clip(value, -700.0, 700.0)))


def label_conversations(
    turn_feature_df: pd.DataFrame, patterns: Dict[str, re.Pattern]
) -> pd.DataFrame:
    """Primary labeling: optimistic_code_present.

    A conversation is labeled successful when code was generated AND no
    explicit negative feedback was detected.  This produces more balanced
    classes than the previous strict rule (which required explicit positive
    acknowledgment) while still being conservative -- any negative signal
    marks the conversation as unsuccessful.

    The strict definition is preserved in
    ``sensitivity_robustness.label_conversations_variant(..., 'strict_positive')``
    for robustness checking.
    """
    if turn_feature_df.empty:
        return pd.DataFrame(
            columns=[
                "conversation_id",
                "has_code",
                "explicit_positive",
                "explicit_negative",
                "success",
                "label_reason",
            ]
        )

    rows: List[dict] = []
    ordered = turn_feature_df.sort_values(["conversation_id", "turn_index"])

    for conversation_id, group in ordered.groupby("conversation_id"):
        group = group.sort_values("turn_index")
        prompts = group["prompt"].fillna("").tolist()
        has_code = int(
            bool((group["answer_code_blocks"] > 0).any() or (group["answer_has_fenced_code"] > 0).any())
        )

        positive_turns = 0
        negative_turns = 0

        for idx, prompt in enumerate(prompts[1:], start=2):
            is_pos = bool(patterns["positive_ack"].search(prompt))
            is_neg = bool(patterns["negative_ack"].search(prompt))
            if is_pos:
                positive_turns += 1
            if is_neg:
                negative_turns += 1

        explicit_positive = int(positive_turns > 0)
        explicit_negative = int(negative_turns > 0)

        # Optimistic-code-present labeling:
        # success = code present AND no negative feedback
        if has_code and negative_turns == 0:
            success = 1
            reason = "code_present_no_negative"
        elif negative_turns > 0:
            success = 0
            reason = "any_negative_feedback"
        elif not has_code:
            success = 0
            reason = "no_code_generated"
        else:
            success = pd.NA
            reason = "unknown_ambiguous"

        rows.append(
            {
                "conversation_id": conversation_id,
                "has_code": has_code,
                "explicit_positive": explicit_positive,
                "explicit_negative": explicit_negative,
                "success": success,
                "label_reason": reason,
            }
        )

    return pd.DataFrame(rows).sort_values("conversation_id").reset_index(drop=True)


def _reduce_rare_categories(series: pd.Series, min_count: int) -> pd.Series:
    series = series.fillna("UNKNOWN").astype(str)
    value_counts = series.value_counts()
    keep = set(value_counts[value_counts >= min_count].index)
    return series.where(series.isin(keep), other="OTHER")


def build_model_dataset(
    conversation_feature_df: pd.DataFrame,
    labels_df: pd.DataFrame,
    include_controls: bool,
    min_control_count: int,
) -> Tuple[pd.DataFrame, List[str], List[str]]:
    if "conversation_id" not in conversation_feature_df.columns:
        return pd.DataFrame(columns=["conversation_id", "success"]), [], []
    if "conversation_id" not in labels_df.columns:
        return pd.DataFrame(columns=["conversation_id", "success"]), [], []

    merged = conversation_feature_df.merge(labels_df, on="conversation_id", how="inner")
    merged = merged.dropna(subset=["success"]).copy()
    if merged.empty:
        return merged, [], []

    merged["success"] = merged["success"].astype(int)
    feature_cols = [col for col in BASE_FEATURES if col in merged.columns]
    if not feature_cols:
        return merged, [], []

    control_dummy_cols: List[str] = []
    design = merged[["conversation_id", "success"] + feature_cols].copy()

    if include_controls:
        for col in CONTROL_COLUMNS:
            if col not in merged.columns:
                continue
            reduced = _reduce_rare_categories(merged[col], min_count=min_control_count)
            dummies = pd.get_dummies(reduced, prefix=col, drop_first=True)
            if not dummies.empty:
                control_dummy_cols.extend(dummies.columns.tolist())
                design = pd.concat([design, dummies], axis=1)

    all_feature_cols = feature_cols + control_dummy_cols
    for col in all_feature_cols:
        design[col] = pd.to_numeric(design[col], errors="coerce").fillna(0.0)

    return design, feature_cols, control_dummy_cols


def fit_logistic_model(
    model_df: pd.DataFrame, feature_cols: List[str], control_cols: List[str]
) -> Tuple[pd.DataFrame, dict]:
    if model_df.empty or not feature_cols:
        return pd.DataFrame(), {"error": "No labeled observations or usable features."}

    X_cols = feature_cols + control_cols
    X = model_df[X_cols].astype(float)
    y = model_df["success"].astype(int)

    if y.nunique() < 2:
        return pd.DataFrame(), {"error": "Only one class available after filtering."}

    min_class_count = int(y.value_counts().min())
    n_splits = min(5, min_class_count)

    model = LogisticRegression(max_iter=5000, class_weight="balanced", solver="liblinear")
    if n_splits >= 2:
        cv = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=42)
        cv_result = cross_validate(
            model,
            X,
            y,
            cv=cv,
            scoring={"roc_auc": "roc_auc", "accuracy": "accuracy", "f1": "f1"},
            return_train_score=False,
            error_score=np.nan,
        )
        cv_metrics = {
            "n_splits": n_splits,
            "roc_auc_mean": float(np.nanmean(cv_result["test_roc_auc"])),
            "roc_auc_std": float(np.nanstd(cv_result["test_roc_auc"])),
            "accuracy_mean": float(np.nanmean(cv_result["test_accuracy"])),
            "f1_mean": float(np.nanmean(cv_result["test_f1"])),
        }
    else:
        cv_metrics = {
            "n_splits": 0,
            "roc_auc_mean": None,
            "roc_auc_std": None,
            "accuracy_mean": None,
            "f1_mean": None,
            "note": "Cross-validation skipped because minority class count < 2.",
        }

    model.fit(X, y)

    coef_df = pd.DataFrame(
        {
            "feature": X_cols,
            "coef_log_odds": model.coef_[0],
            "odds_ratio": np.exp(model.coef_[0]),
            "odds_ratio_ci_low": np.nan,
            "odds_ratio_ci_high": np.nan,
            "p_value": np.nan,
        }
    )

    # Statsmodels CIs and p-values for interpretability reporting.
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            X_sm = sm.add_constant(X, has_constant="add")
            sm_model = sm.Logit(y, X_sm)
            sm_fit = sm_model.fit(disp=False)
            conf_int = sm_fit.conf_int()

        for feature in X_cols:
            coef = float(sm_fit.params[feature])
            ci_low = float(conf_int.loc[feature, 0])
            ci_high = float(conf_int.loc[feature, 1])
            p_value = float(sm_fit.pvalues[feature])
            coef_df.loc[coef_df["feature"] == feature, "coef_log_odds"] = coef
            coef_df.loc[coef_df["feature"] == feature, "odds_ratio"] = _safe_exp(coef)
            coef_df.loc[coef_df["feature"] == feature, "odds_ratio_ci_low"] = _safe_exp(ci_low)
            coef_df.loc[coef_df["feature"] == feature, "odds_ratio_ci_high"] = _safe_exp(ci_high)
            coef_df.loc[coef_df["feature"] == feature, "p_value"] = p_value
    except Exception as exc:  # noqa: BLE001
        pass

    coef_df = coef_df.sort_values("odds_ratio", ascending=False).reset_index(drop=True)

    metrics = {
        "n_observations": int(len(model_df)),
        "n_success": int((y == 1).sum()),
        "n_failure": int((y == 0).sum()),
        "n_unknown_dropped": int(model_df.get("unknown_count", pd.Series(dtype=int)).sum())
        if "unknown_count" in model_df.columns
        else None,
        "features_used": X_cols,
        "cross_validation": cv_metrics,
    }
    return coef_df, metrics


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Label conversation success and run interpretable logistic regression."
    )
    parser.add_argument(
        "--turn-features",
        required=True,
        help="Path to turn feature parquet (from feature_extraction.py).",
    )
    parser.add_argument(
        "--conversation-features",
        required=True,
        help="Path to conversation feature parquet (from feature_extraction.py).",
    )
    parser.add_argument(
        "--pattern-config",
        required=True,
        help="Path to regex pattern config (YAML).",
    )
    parser.add_argument(
        "--out-dir",
        default="results",
        help="Output directory for labels and model outputs (default: results).",
    )
    parser.add_argument(
        "--include-controls",
        action="store_true",
        help="Include one-hot controls for source/model/language metadata.",
    )
    parser.add_argument(
        "--min-control-count",
        type=int,
        default=100,
        help="Minimum frequency to keep a control category before mapping to OTHER.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    turn_feature_df = pd.read_parquet(args.turn_features)
    conversation_feature_df = pd.read_parquet(args.conversation_features)

    pattern_config = load_pattern_config(args.pattern_config)
    patterns = compile_patterns(pattern_config)

    labels_df = label_conversations(turn_feature_df, patterns)
    labels_path = out_dir / "labels.parquet"
    labels_df.to_parquet(labels_path, index=False)

    model_df, feature_cols, control_cols = build_model_dataset(
        conversation_feature_df=conversation_feature_df,
        labels_df=labels_df,
        include_controls=args.include_controls,
        min_control_count=args.min_control_count,
    )

    model_dataset_path = out_dir / "model_dataset.parquet"
    model_df.to_parquet(model_dataset_path, index=False)

    coef_df, metrics = fit_logistic_model(
        model_df=model_df, feature_cols=feature_cols, control_cols=control_cols
    )

    coef_path = out_dir / "coefficients.csv"
    coef_df.to_csv(coef_path, index=False)

    metrics_path = out_dir / "model_metrics.json"
    with metrics_path.open("w", encoding="utf-8") as file:
        json.dump(metrics, file, indent=2)

    print(f"Saved: {labels_path} ({len(labels_df):,} rows)")
    print(f"Saved: {model_dataset_path} ({len(model_df):,} rows)")
    print(f"Saved: {coef_path} ({len(coef_df):,} rows)")
    print(f"Saved: {metrics_path}")


if __name__ == "__main__":
    main()
