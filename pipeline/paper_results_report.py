from __future__ import annotations

import argparse
import json
from datetime import date
from pathlib import Path
from typing import List

import numpy as np
import pandas as pd
from scipy.stats import mannwhitneyu, spearmanr


DEFAULT_FEATURES = [
    "first_prompt_tokens",
    "first_constraint_count",
    "total_example_count",
    "first_specification_clarity_count",
    "iteration_count",
    "refinement_turns",
    "correction_cycles",
    "prompt_token_growth",
]


def _safe_pct(value: int, total: int) -> float:
    if total <= 0:
        return 0.0
    return (100.0 * value) / total


def _iqr(series: pd.Series) -> float:
    clean = pd.to_numeric(series, errors="coerce").dropna()
    if clean.empty:
        return float("nan")
    return float(clean.quantile(0.75) - clean.quantile(0.25))


def _cliffs_delta_from_u(u_stat: float, n1: int, n2: int) -> float:
    if n1 <= 0 or n2 <= 0:
        return float("nan")
    return float((2.0 * u_stat / (n1 * n2)) - 1.0)


def load_inputs(
    conversation_features_path: Path,
    labels_path: Path,
    coefficients_path: Path,
    metrics_path: Path,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, dict]:
    conversation_features = pd.read_parquet(conversation_features_path)
    labels = pd.read_parquet(labels_path)
    coefficients = pd.read_csv(coefficients_path) if coefficients_path.exists() else pd.DataFrame()
    metrics = {}
    if metrics_path.exists():
        with metrics_path.open("r", encoding="utf-8") as file:
            metrics = json.load(file)
    return conversation_features, labels, coefficients, metrics


def build_dataset_overview(labels: pd.DataFrame) -> pd.DataFrame:
    total = int(len(labels))
    known = int(labels["success"].notna().sum()) if "success" in labels.columns else 0
    unknown = total - known
    n_success = int((labels["success"] == 1).sum()) if known else 0
    n_failure = int((labels["success"] == 0).sum()) if known else 0

    rows = [
        {"metric": "conversations_total", "value": total},
        {"metric": "conversations_labeled", "value": known},
        {"metric": "conversations_unknown", "value": unknown},
        {"metric": "success_count", "value": n_success},
        {"metric": "failure_count", "value": n_failure},
        {"metric": "labeled_rate_pct", "value": round(_safe_pct(known, total), 3)},
        {"metric": "success_rate_labeled_pct", "value": round(_safe_pct(n_success, known), 3)},
    ]
    return pd.DataFrame(rows)


def merge_labeled_data(
    conversation_features: pd.DataFrame, labels: pd.DataFrame
) -> pd.DataFrame:
    merged = conversation_features.merge(
        labels[["conversation_id", "success"]], on="conversation_id", how="inner"
    )
    merged = merged.dropna(subset=["success"]).copy()
    if merged.empty:
        return merged
    merged["success"] = merged["success"].astype(int)
    return merged


def build_descriptive_table(
    labeled_df: pd.DataFrame, features: List[str]
) -> pd.DataFrame:
    if labeled_df.empty:
        return pd.DataFrame()

    available = [feature for feature in features if feature in labeled_df.columns]
    if not available:
        return pd.DataFrame()

    grouped = labeled_df.groupby("success")[available]
    desc = grouped.agg(["median", "mean", "std"]).round(4)
    desc.columns = ["__".join(col).strip() for col in desc.columns.values]
    desc = desc.reset_index().rename(columns={"success": "label_success"})

    for feature in available:
        iqr_df = (
            labeled_df.groupby("success")[feature]
            .apply(_iqr)
            .rename(f"{feature}__iqr")
            .reset_index()
            .rename(columns={"success": "label_success"})
        )
        desc = desc.merge(iqr_df, on="label_success", how="left")

    return desc


def build_bivariate_effects(
    labeled_df: pd.DataFrame, features: List[str]
) -> pd.DataFrame:
    rows = []
    if labeled_df.empty:
        return pd.DataFrame(rows)

    available = [feature for feature in features if feature in labeled_df.columns]
    if not available:
        return pd.DataFrame(rows)

    y = labeled_df["success"].astype(int)
    pos = labeled_df[labeled_df["success"] == 1]
    neg = labeled_df[labeled_df["success"] == 0]

    for feature in available:
        x_all = pd.to_numeric(labeled_df[feature], errors="coerce")
        valid = x_all.notna()
        rho = np.nan
        rho_p = np.nan
        if valid.sum() > 2 and x_all[valid].nunique() > 1:
            rho, rho_p = spearmanr(x_all[valid], y[valid])

        x_pos = pd.to_numeric(pos[feature], errors="coerce").dropna()
        x_neg = pd.to_numeric(neg[feature], errors="coerce").dropna()
        mw_u = np.nan
        mw_p = np.nan
        cliffs_delta = np.nan
        if not x_pos.empty and not x_neg.empty:
            mw_u, mw_p = mannwhitneyu(x_pos, x_neg, alternative="two-sided")
            cliffs_delta = _cliffs_delta_from_u(mw_u, len(x_pos), len(x_neg))

        rows.append(
            {
                "feature": feature,
                "spearman_rho": rho,
                "spearman_p": rho_p,
                "mannwhitney_u": mw_u,
                "mannwhitney_p": mw_p,
                "cliffs_delta": cliffs_delta,
                "success_median": float(x_pos.median()) if not x_pos.empty else np.nan,
                "failure_median": float(x_neg.median()) if not x_neg.empty else np.nan,
            }
        )

    return pd.DataFrame(rows).sort_values("mannwhitney_p", na_position="last")


def _top_findings_text(coefficients: pd.DataFrame, limit: int = 5) -> List[str]:
    if coefficients.empty:
        return ["No coefficient table available."]

    coef = coefficients.copy()
    coef = coef[coef["feature"] != "const"] if "feature" in coef.columns else coef
    if coef.empty:
        return ["No coefficient rows available after filtering."]

    if "p_value" in coef.columns:
        coef = coef.sort_values(["p_value", "odds_ratio"], ascending=[True, False], na_position="last")
    else:
        coef = coef.sort_values("odds_ratio", ascending=False)

    rows = []
    for _, row in coef.head(limit).iterrows():
        feat = row.get("feature", "unknown_feature")
        or_value = pd.to_numeric(row.get("odds_ratio", np.nan), errors="coerce")
        p_value = row.get("p_value", np.nan)
        if pd.notna(p_value):
            rows.append(f"- `{feat}`: OR={or_value:.3f}, p={p_value:.4g}")
        else:
            rows.append(f"- `{feat}`: OR={or_value:.3f}")
    return rows


def build_results_markdown(
    overview_df: pd.DataFrame,
    bivariate_df: pd.DataFrame,
    coefficients_df: pd.DataFrame,
    model_metrics: dict,
    out_path: Path,
) -> None:
    overview = dict(zip(overview_df["metric"], overview_df["value"])) if not overview_df.empty else {}
    cv = model_metrics.get("cross_validation", {}) if isinstance(model_metrics, dict) else {}

    significant_bivariate = 0
    if not bivariate_df.empty and "mannwhitney_p" in bivariate_df.columns:
        significant_bivariate = int((bivariate_df["mannwhitney_p"] < 0.05).fillna(False).sum())

    top_lines = _top_findings_text(coefficients_df, limit=5)

    lines = [
        "# Results Auto-Draft",
        "",
        f"_Generated on {date.today().isoformat()}_",
        "",
        "## Dataset and Labels",
        (
            f"- Total conversations: {int(overview.get('conversations_total', 0)):,}"
        ),
        (
            f"- Labeled conversations: {int(overview.get('conversations_labeled', 0)):,} "
            f"({float(overview.get('labeled_rate_pct', 0.0)):.2f}%)"
        ),
        (
            f"- Unknown/ambiguous conversations excluded from primary model: "
            f"{int(overview.get('conversations_unknown', 0)):,}"
        ),
        (
            f"- Success rate among labeled conversations: "
            f"{float(overview.get('success_rate_labeled_pct', 0.0)):.2f}%"
        ),
        "",
        "## Primary Model Performance",
        (
            f"- Cross-validated ROC-AUC: {cv.get('roc_auc_mean', float('nan')):.3f} "
            f"(SD={cv.get('roc_auc_std', float('nan')):.3f})"
        ),
        f"- Cross-validated accuracy: {cv.get('accuracy_mean', float('nan')):.3f}",
        f"- Cross-validated F1: {cv.get('f1_mean', float('nan')):.3f}",
        "",
        "## Bivariate Evidence",
        (
            f"- Features with Mann-Whitney p<0.05: {significant_bivariate}"
        ),
        "- See `table_bivariate_effects.csv` for rho, p-values, and Cliff's delta.",
        "",
        "## Multivariable Effects (Logistic Regression)",
        *top_lines,
        "",
        "## Reporting Guidance",
        "- Keep model interpretation at odds-ratio level and avoid causal claims.",
        "- Report both statistical significance and effect size magnitude.",
        "- Pair these outputs with sensitivity and manual-label validation appendices.",
        "",
    ]
    out_path.write_text("\n".join(lines), encoding="utf-8")


def _lookup_metric(overview_df: pd.DataFrame, key: str, default: int = 0) -> int:
    if overview_df.empty:
        return default
    row = overview_df.loc[overview_df["metric"] == key, "value"]
    if row.empty:
        return default
    return int(row.iloc[0])


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create publication-oriented result tables and auto-drafted text."
    )
    parser.add_argument(
        "--conversation-features",
        default="data/processed/conversation_features.parquet",
        help="Path to conversation feature parquet.",
    )
    parser.add_argument(
        "--labels",
        default="results/labels.parquet",
        help="Path to conversation labels parquet.",
    )
    parser.add_argument(
        "--coefficients",
        default="results/coefficients.csv",
        help="Path to logistic regression coefficient CSV.",
    )
    parser.add_argument(
        "--model-metrics",
        default="results/model_metrics.json",
        help="Path to model metrics JSON.",
    )
    parser.add_argument(
        "--out-dir",
        default="results/paper",
        help="Output directory for paper tables and drafts.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    conversation_features, labels, coefficients, model_metrics = load_inputs(
        conversation_features_path=Path(args.conversation_features),
        labels_path=Path(args.labels),
        coefficients_path=Path(args.coefficients),
        metrics_path=Path(args.model_metrics),
    )

    overview_df = build_dataset_overview(labels)
    labeled_df = merge_labeled_data(conversation_features, labels)
    descriptive_df = build_descriptive_table(labeled_df, DEFAULT_FEATURES)
    bivariate_df = build_bivariate_effects(labeled_df, DEFAULT_FEATURES)

    overview_path = out_dir / "table_dataset_overview.csv"
    descriptive_path = out_dir / "table_descriptive_by_success.csv"
    bivariate_path = out_dir / "table_bivariate_effects.csv"
    coef_path = out_dir / "table_logistic_coefficients.csv"
    summary_json_path = out_dir / "findings_summary.json"
    draft_md_path = out_dir / "results_autodraft.md"

    overview_df.to_csv(overview_path, index=False)
    descriptive_df.to_csv(descriptive_path, index=False)
    bivariate_df.to_csv(bivariate_path, index=False)
    coefficients.to_csv(coef_path, index=False)

    summary = {
        "generated_on": date.today().isoformat(),
        "n_total": _lookup_metric(overview_df, "conversations_total", default=0),
        "n_labeled": _lookup_metric(overview_df, "conversations_labeled", default=0),
        "n_unknown": _lookup_metric(overview_df, "conversations_unknown", default=0),
        "model_metrics": model_metrics,
    }
    with summary_json_path.open("w", encoding="utf-8") as file:
        json.dump(summary, file, indent=2)

    build_results_markdown(
        overview_df=overview_df,
        bivariate_df=bivariate_df,
        coefficients_df=coefficients,
        model_metrics=model_metrics,
        out_path=draft_md_path,
    )

    print(f"Saved: {overview_path}")
    print(f"Saved: {descriptive_path}")
    print(f"Saved: {bivariate_path}")
    print(f"Saved: {coef_path}")
    print(f"Saved: {summary_json_path}")
    print(f"Saved: {draft_md_path}")


if __name__ == "__main__":
    main()
