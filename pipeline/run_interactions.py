"""Theory-driven 2-way interaction terms for the primary logistic model.

Fits one model on the full dataset that adds four pre-registered
interactions to the existing main effects, then emits each interaction
term's odds ratio + 95% CI + p-value. Pre-registration (no blanket
screening) keeps the false-positive rate at the standard alpha = 0.05.
Writes results/interactions.json.
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
OUT = ROOT / "results" / "interactions.json"

# Each entry: ((feature_a, feature_b), human-readable label)
PAIRS: list[tuple[tuple[str, str], str]] = [
    (("has_output_format_first", "refinement_turns"),
     "Output Format × Refinement"),
    (("has_output_format_first", "first_constraint_count"),
     "Output Format × Constraints"),
    (("has_role_instruction_first", "has_output_format_first"),
     "Role × Output Format"),
    (("iteration_count", "first_prompt_tokens"),
     "Iterations × Prompt Length"),
]

MAIN_EFFECTS = [
    "has_output_format_first",
    "first_specification_clarity_count",
    "refinement_turns",
    "total_example_count",
    "iteration_count",
    "first_prompt_tokens",
    "prompt_token_growth",
    "first_constraint_count",
    "has_specification_clarity_first",
    "has_role_instruction_first",
]


def main() -> None:
    df = pd.read_parquet(DATASET)
    y = df["success"].astype(int).to_numpy()
    X = df[MAIN_EFFECTS].astype(float).copy()

    interaction_columns: list[tuple[str, str]] = []
    for (a, b), label in PAIRS:
        col = f"{a}__x__{b}"
        X[col] = df[a].astype(float) * df[b].astype(float)
        interaction_columns.append((col, label))

    X_const = sm.add_constant(X, has_constant="add")
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        fit = sm.Logit(y, X_const).fit(disp=0, maxiter=400)

    params = fit.params
    conf = fit.conf_int()
    pvals = fit.pvalues

    rows = []
    for col, label in interaction_columns:
        if col not in params.index:
            continue
        beta = float(params[col])
        lo = float(conf.loc[col, 0])
        hi = float(conf.loc[col, 1])
        p = float(pvals[col])
        rows.append({
            "label": label,
            "term": col,
            "or": round(float(np.exp(beta)), 3),
            "ci_low": round(float(np.exp(lo)), 3),
            "ci_high": round(float(np.exp(hi)), 3),
            "p_value": round(p, 4),
            "significant": bool(p < 0.05),
        })

    payload = {
        "n": int(len(df)),
        "interactions": rows,
        "any_significant": any(r["significant"] for r in rows),
    }
    OUT.write_text(json.dumps(payload, indent=2))
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
