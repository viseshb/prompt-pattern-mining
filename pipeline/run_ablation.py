"""Feature-group ablation study.

Drops each named group of columns from the primary feature matrix, refits
balanced logistic regression, reports 5-fold stratified CV ROC-AUC, and
emits the delta versus the full model. Writes results/ablation.json.
"""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold, cross_val_score

ROOT = Path(__file__).resolve().parents[1]
DATASET = ROOT / "results" / "model_dataset.parquet"
METRICS = ROOT / "results" / "model_metrics.json"
OUT = ROOT / "results" / "ablation.json"

CV = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)

PROMPT_FEATURES = [
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
    "first_prompt_tokens",
]

GROUPS = [
    ("Prompt-engineering features", PROMPT_FEATURES, lambda c: c in PROMPT_FEATURES),
    ("Repository language", None, lambda c: c.startswith("repo_language_")),
    ("Source type", None, lambda c: c.startswith("source_type_")),
    ("Snapshot date", None, lambda c: c.startswith("snapshot_snapshot_")),
    ("ChatGPT model variant", None, lambda c: c.startswith("model_")),
]


def _auc(X: pd.DataFrame, y: pd.Series) -> float:
    clf = LogisticRegression(max_iter=2000, class_weight="balanced", C=1.0)
    return float(cross_val_score(clf, X, y, cv=CV, scoring="roc_auc", n_jobs=1).mean())


def main() -> None:
    df = pd.read_parquet(DATASET)
    y = df["success"].astype(int)
    feature_cols = [c for c in df.columns if c not in {"conversation_id", "success"}]
    X = df[feature_cols].astype(float)

    primary_auc = _auc(X, y)
    primary_reported = json.loads(METRICS.read_text())["cross_validation"]["roc_auc_mean"]

    ablations = []
    for label, _, predicate in GROUPS:
        drop_cols = [c for c in feature_cols if predicate(c)]
        if not drop_cols:
            continue
        kept = [c for c in feature_cols if c not in drop_cols]
        ablated_auc = _auc(X[kept], y)
        ablations.append({
            "group": label,
            "n_dropped": len(drop_cols),
            "auc": round(ablated_auc, 3),
            "delta": round(primary_auc - ablated_auc, 3),
        })

    payload = {
        "primary_auc": round(primary_auc, 3),
        "primary_reported": round(primary_reported, 3),
        "n": int(len(df)),
        "ablations": ablations,
    }
    OUT.write_text(json.dumps(payload, indent=2))
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
