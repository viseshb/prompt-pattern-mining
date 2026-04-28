"""Baseline comparison for the primary logistic-regression model.

Computes 5-fold stratified ROC-AUC for:
  - majority-class dummy
  - random-prediction dummy
  - bag-of-words logistic on the first user prompt
  - the primary model (read from results/model_metrics.json)

Writes results/baselines.json.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.dummy import DummyClassifier
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import StratifiedKFold, cross_val_score

ROOT = Path(__file__).resolve().parents[1]
DATASET = ROOT / "results" / "model_dataset.parquet"
TURNS = ROOT / "data" / "interim" / "turns.parquet"
METRICS = ROOT / "results" / "model_metrics.json"
OUT = ROOT / "results" / "baselines.json"

CV = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)


def _bow_auc(merged: pd.DataFrame) -> float | None:
    text = merged["first_prompt"].fillna("").astype(str)
    if (text.str.len() == 0).all():
        return None
    vec = CountVectorizer(max_features=2000, ngram_range=(1, 2), min_df=5)
    X = vec.fit_transform(text)
    y = merged["success"].astype(int)
    auc = cross_val_score(
        LogisticRegression(max_iter=1000, class_weight="balanced"),
        X,
        y,
        cv=CV,
        scoring="roc_auc",
        n_jobs=1,
    ).mean()
    return float(auc)


def _random_auc(y: np.ndarray) -> float:
    rng = np.random.default_rng(42)
    aucs = []
    for _ in range(20):
        scores = rng.random(len(y))
        aucs.append(roc_auc_score(y, scores))
    return float(np.mean(aucs))


def _majority_auc(y: np.ndarray) -> float:
    clf = DummyClassifier(strategy="most_frequent")
    auc = cross_val_score(clf, np.zeros((len(y), 1)), y, cv=CV, scoring="roc_auc").mean()
    return float(auc)


def main() -> None:
    df = pd.read_parquet(DATASET)
    y = df["success"].astype(int).to_numpy()

    turns = pd.read_parquet(TURNS, columns=["conversation_id", "turn_index", "prompt"])
    first = turns.sort_values(["conversation_id", "turn_index"]).drop_duplicates("conversation_id", keep="first")
    first = first.rename(columns={"prompt": "first_prompt"})[["conversation_id", "first_prompt"]]
    merged = df[["conversation_id", "success"]].merge(first, on="conversation_id", how="left")

    payload: dict[str, object] = {
        "n": int(len(df)),
        "majority": round(_majority_auc(y), 3),
        "random": round(_random_auc(y), 3),
        "our_model": round(json.loads(METRICS.read_text())["cross_validation"]["roc_auc_mean"], 3),
    }

    bow = _bow_auc(merged)
    if bow is not None:
        payload["bow_logistic"] = round(bow, 3)
    else:
        payload["bow_logistic"] = None

    OUT.write_text(json.dumps(payload, indent=2))
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
