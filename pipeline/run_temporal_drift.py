"""Per-snapshot logistic regression to test temporal drift of effects.

For every snapshot with at least 200 conversations, fits a small
statsmodels logistic on the four headline prompt-engineering features
and emits each feature's odds ratio + 95% CI + p-value per snapshot.
Writes results/temporal_drift.json.
"""
from __future__ import annotations

import json
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
import statsmodels.api as sm

ROOT = Path(__file__).resolve().parents[1]
DATASET = ROOT / "results" / "model_dataset.parquet"
OUT = ROOT / "results" / "temporal_drift.json"

FEATURES = [
    "has_output_format_first",
    "refinement_turns",
    "first_constraint_count",
    "has_role_instruction_first",
]
MIN_SNAPSHOT_N = 200


def _snapshot_label(col: str) -> str:
    raw = col.removeprefix("snapshot_snapshot_")
    return f"{raw[:4]}-{raw[4:6]}-{raw[6:8]}"


def main() -> None:
    df = pd.read_parquet(DATASET)
    snapshot_cols = [c for c in df.columns if c.startswith("snapshot_snapshot_")]

    by_feature: dict[str, list[dict]] = {f: [] for f in FEATURES}

    for snap in snapshot_cols:
        mask = df[snap] == 1
        sub = df.loc[mask, ["success", *FEATURES]].copy()
        n = int(len(sub))
        if n < MIN_SNAPSHOT_N:
            continue
        y = sub["success"].astype(int).to_numpy()
        if len(np.unique(y)) < 2:
            continue
        X = sm.add_constant(sub[FEATURES].astype(float), has_constant="add")
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            try:
                fit = sm.Logit(y, X).fit(disp=0, maxiter=200)
            except Exception:
                continue
        params = fit.params
        conf = fit.conf_int()
        pvals = fit.pvalues
        date = _snapshot_label(snap)
        for f in FEATURES:
            if f not in params.index:
                continue
            beta = float(params[f])
            lo = float(conf.loc[f, 0])
            hi = float(conf.loc[f, 1])
            p = float(pvals[f])
            if not np.isfinite(beta) or not np.isfinite(lo) or not np.isfinite(hi):
                continue
            by_feature[f].append({
                "date": date,
                "n": n,
                "or": round(float(np.exp(beta)), 3),
                "ci_low": round(float(np.exp(lo)), 3),
                "ci_high": round(float(np.exp(hi)), 3),
                "p": round(p, 4),
            })

    for f in by_feature:
        by_feature[f].sort(key=lambda x: x["date"])

    payload = {"features": by_feature, "min_snapshot_n": MIN_SNAPSHOT_N}
    OUT.write_text(json.dumps(payload, indent=2))
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
