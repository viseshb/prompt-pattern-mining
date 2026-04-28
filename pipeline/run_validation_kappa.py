"""Compute Cohen's kappa between auto-labeled success and human labels.

Reads results/validation/manual_validation_sample.csv and writes
results/validation_kappa.json. If fewer than 30 human labels exist,
the JSON flags the result as preliminary so the UI can render a
"labeling in progress" state instead of over-claiming a number.
"""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
from sklearn.metrics import cohen_kappa_score

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "results" / "validation" / "manual_validation_sample.csv"
OUT = ROOT / "results" / "validation_kappa.json"


def main() -> None:
    df = pd.read_csv(SRC)
    n_total = int(len(df))
    labeled = df.dropna(subset=["human_success"]).copy()
    n_labeled = int(len(labeled))

    payload: dict[str, object] = {
        "n_total_sampled": n_total,
        "n_labeled": n_labeled,
        "preliminary": n_labeled < 30,
    }

    if n_labeled >= 30:
        labeled["human_success"] = labeled["human_success"].astype(int)
        labeled["auto_success"] = labeled["auto_success"].astype(int)
        kappa = float(cohen_kappa_score(labeled["human_success"], labeled["auto_success"]))
        agree = float((labeled["human_success"] == labeled["auto_success"]).mean())
        disagree = int((labeled["human_success"] != labeled["auto_success"]).sum())
        payload.update({
            "kappa": round(kappa, 3),
            "agreement_pct": round(agree * 100, 1),
            "disagreements": disagree,
        })

    OUT.write_text(json.dumps(payload, indent=2))
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
