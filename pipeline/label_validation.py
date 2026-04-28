from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import List

import numpy as np
import pandas as pd
from sklearn.metrics import (
    cohen_kappa_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)


def _normalize_manual_value(value: object) -> object:
    if value is None:
        return np.nan
    if isinstance(value, (int, float)) and not pd.isna(value):
        if int(value) in (0, 1):
            return int(value)
        return np.nan

    text = str(value).strip().lower()
    if text in {"1", "success", "successful", "yes", "y", "true", "t"}:
        return 1
    if text in {"0", "failure", "failed", "unsuccessful", "no", "n", "false", "f"}:
        return 0
    return np.nan


def _build_conversation_context(turn_features: pd.DataFrame) -> pd.DataFrame:
    if turn_features.empty:
        return pd.DataFrame(
            columns=[
                "conversation_id",
                "n_turns",
                "first_prompt",
                "last_prompt",
                "last_answer",
            ]
        )

    rows: List[dict] = []
    ordered = turn_features.sort_values(["conversation_id", "turn_index"])

    for conversation_id, group in ordered.groupby("conversation_id"):
        group = group.sort_values("turn_index")
        first_prompt = group.iloc[0]["prompt"] if "prompt" in group.columns else ""
        last_prompt = group.iloc[-1]["prompt"] if "prompt" in group.columns else ""
        last_answer = group.iloc[-1]["answer"] if "answer" in group.columns else ""

        rows.append(
            {
                "conversation_id": conversation_id,
                "n_turns": int(group["turn_index"].max()),
                "first_prompt": str(first_prompt)[:1800],
                "last_prompt": str(last_prompt)[:1800],
                "last_answer": str(last_answer)[:1800],
            }
        )
    return pd.DataFrame(rows)


def _stratified_sample(
    labels_df: pd.DataFrame, sample_size: int, random_seed: int
) -> pd.DataFrame:
    labels = labels_df.copy()
    labels["stratum"] = labels["success"].fillna("unknown").astype(str)

    strata_counts = labels["stratum"].value_counts(dropna=False)
    if strata_counts.empty:
        return labels.head(0)

    alloc_df = (
        strata_counts.rename("count")
        .to_frame()
        .assign(
            proportion=lambda d: d["count"] / d["count"].sum(),
            ideal=lambda d: d["proportion"] * sample_size,
        )
    )
    alloc_df["base_n"] = np.floor(alloc_df["ideal"]).astype(int)
    alloc_df["remainder"] = alloc_df["ideal"] - alloc_df["base_n"]

    shortfall = int(sample_size - alloc_df["base_n"].sum())
    if shortfall > 0:
        top_idx = alloc_df.sort_values("remainder", ascending=False).head(shortfall).index
        alloc_df.loc[top_idx, "base_n"] += 1

    allocations = list(zip(alloc_df.index.tolist(), alloc_df["base_n"].tolist()))

    sampled = []
    for stratum, n in allocations:
        if n <= 0:
            continue
        frame = labels[labels["stratum"] == stratum]
        n = min(n, len(frame))
        sampled.append(frame.sample(n=n, random_state=random_seed))

    if not sampled:
        return labels.head(0)
    return pd.concat(sampled, axis=0).sample(frac=1.0, random_state=random_seed).reset_index(drop=True)


def create_manual_sample(
    turn_features_path: Path,
    labels_path: Path,
    out_dir: Path,
    sample_size: int,
    random_seed: int,
) -> tuple[Path, Path]:
    out_dir.mkdir(parents=True, exist_ok=True)

    turn_features = pd.read_parquet(turn_features_path)
    labels = pd.read_parquet(labels_path)

    context_df = _build_conversation_context(turn_features)
    sample_labels = _stratified_sample(labels, sample_size=sample_size, random_seed=random_seed)
    sample_df = sample_labels.merge(context_df, on="conversation_id", how="left")

    columns = [
        "conversation_id",
        "success",
        "label_reason",
        "has_code",
        "explicit_positive",
        "explicit_negative",
        "n_turns",
        "first_prompt",
        "last_prompt",
        "last_answer",
    ]
    available = [col for col in columns if col in sample_df.columns]
    sample_df = sample_df[available].rename(columns={"success": "auto_success"})

    sample_df["human_success"] = ""
    sample_df["human_confidence"] = ""
    sample_df["review_notes"] = ""

    sample_path = out_dir / "manual_validation_sample.csv"
    protocol_path = out_dir / "manual_validation_protocol.md"
    sample_df.to_csv(sample_path, index=False)

    protocol = [
        "# Manual Label Validation Protocol",
        "",
        "1. Read `first_prompt`, `last_prompt`, and `last_answer` for each row.",
        "2. Assign `human_success` as `1` (successful) or `0` (unsuccessful).",
        "3. Enter confidence in `human_confidence` as `high`, `medium`, or `low`.",
        "4. Use `review_notes` for ambiguous decisions.",
        "5. Keep `auto_success` unchanged to preserve reproducibility.",
        "",
        "Decision guidance:",
        "- Mark successful when the final assistant response appears to solve the user's coding request based on text evidence.",
        "- Mark unsuccessful when the conversation indicates unresolved errors, mismatch, or absent useful code.",
        "- If insufficient evidence exists, leave `human_success` blank and note ambiguity.",
    ]
    protocol_path.write_text("\n".join(protocol), encoding="utf-8")
    return sample_path, protocol_path


def evaluate_manual_sample(annotated_csv: Path, out_dir: Path) -> tuple[Path, Path, Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    df = pd.read_csv(annotated_csv)

    if "auto_success" not in df.columns or "human_success" not in df.columns:
        raise ValueError("Annotated CSV must contain `auto_success` and `human_success` columns.")

    eval_df = df.copy()
    eval_df["auto_success"] = eval_df["auto_success"].apply(_normalize_manual_value)
    eval_df["human_success"] = eval_df["human_success"].apply(_normalize_manual_value)
    eval_df = eval_df.dropna(subset=["auto_success", "human_success"]).copy()

    if eval_df.empty:
        raise ValueError("No rows with both auto and human labels were found.")

    y_auto = eval_df["auto_success"].astype(int)
    y_human = eval_df["human_success"].astype(int)

    cm = confusion_matrix(y_human, y_auto, labels=[0, 1])
    tn, fp, fn, tp = cm.ravel()

    metrics = {
        "n_reviewed": int(len(eval_df)),
        "accuracy": float((y_auto == y_human).mean()),
        "cohen_kappa": float(cohen_kappa_score(y_human, y_auto)),
        "precision_auto_vs_human": float(precision_score(y_human, y_auto, zero_division=0)),
        "recall_auto_vs_human": float(recall_score(y_human, y_auto, zero_division=0)),
        "f1_auto_vs_human": float(f1_score(y_human, y_auto, zero_division=0)),
        "confusion_matrix": {
            "tn": int(tn),
            "fp": int(fp),
            "fn": int(fn),
            "tp": int(tp),
        },
    }

    disagreements = eval_df[eval_df["auto_success"] != eval_df["human_success"]].copy()

    metrics_path = out_dir / "manual_validation_metrics.json"
    summary_path = out_dir / "manual_validation_summary.md"
    disagreements_path = out_dir / "manual_validation_disagreements.csv"

    with metrics_path.open("w", encoding="utf-8") as file:
        json.dump(metrics, file, indent=2)

    summary_lines = [
        "# Manual Validation Summary",
        "",
        f"- Reviewed rows: {metrics['n_reviewed']}",
        f"- Accuracy: {metrics['accuracy']:.3f}",
        f"- Cohen's kappa: {metrics['cohen_kappa']:.3f}",
        f"- Precision: {metrics['precision_auto_vs_human']:.3f}",
        f"- Recall: {metrics['recall_auto_vs_human']:.3f}",
        f"- F1: {metrics['f1_auto_vs_human']:.3f}",
        "",
        "Confusion matrix (human as reference):",
        f"- TN: {metrics['confusion_matrix']['tn']}",
        f"- FP: {metrics['confusion_matrix']['fp']}",
        f"- FN: {metrics['confusion_matrix']['fn']}",
        f"- TP: {metrics['confusion_matrix']['tp']}",
        "",
        f"- Disagreement rows: {len(disagreements)} (saved to `{disagreements_path.name}`)",
    ]
    summary_path.write_text("\n".join(summary_lines), encoding="utf-8")
    disagreements.to_csv(disagreements_path, index=False)

    return metrics_path, summary_path, disagreements_path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create and evaluate manual label-validation samples."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    sample_parser = subparsers.add_parser(
        "sample", help="Create a stratified conversation sample for manual validation."
    )
    sample_parser.add_argument(
        "--turn-features",
        default="data/processed/turn_features.parquet",
        help="Path to turn_features.parquet",
    )
    sample_parser.add_argument(
        "--labels",
        default="results/labels.parquet",
        help="Path to labels.parquet",
    )
    sample_parser.add_argument(
        "--out-dir",
        default="results/validation",
        help="Output directory for manual validation files.",
    )
    sample_parser.add_argument(
        "--sample-size",
        type=int,
        default=200,
        help="Target sample size for manual review.",
    )
    sample_parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random seed for reproducible sampling.",
    )

    eval_parser = subparsers.add_parser(
        "evaluate", help="Evaluate agreement between auto and human labels."
    )
    eval_parser.add_argument(
        "--annotated-csv",
        required=True,
        help="Path to manually completed validation CSV.",
    )
    eval_parser.add_argument(
        "--out-dir",
        default="results/validation",
        help="Output directory for validation metrics and summaries.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    if args.command == "sample":
        sample_path, protocol_path = create_manual_sample(
            turn_features_path=Path(args.turn_features),
            labels_path=Path(args.labels),
            out_dir=Path(args.out_dir),
            sample_size=args.sample_size,
            random_seed=args.seed,
        )
        print(f"Saved: {sample_path}")
        print(f"Saved: {protocol_path}")
        return

    if args.command == "evaluate":
        metrics_path, summary_path, disagreements_path = evaluate_manual_sample(
            annotated_csv=Path(args.annotated_csv),
            out_dir=Path(args.out_dir),
        )
        print(f"Saved: {metrics_path}")
        print(f"Saved: {summary_path}")
        print(f"Saved: {disagreements_path}")


if __name__ == "__main__":
    main()
