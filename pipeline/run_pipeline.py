from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd

from .feature_extraction import (
    add_turn_features,
    build_conversation_features,
    compile_patterns,
    load_pattern_config,
)
from .load_and_clean_devgpt import build_conversation_table, build_turn_table
from .success_label_and_model import (
    build_model_dataset,
    fit_logistic_model,
    label_conversations,
)
from .visualize_results import (
    _prepare_plot_df,
    plot_correlation_heatmap,
    plot_distributions,
    plot_odds_ratios,
    save_summary_table,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run full DevGPT prompt pattern mining pipeline."
    )
    parser.add_argument(
        "--devgpt-root",
        default=None,
        help="Path to DevGPT root directory. If omitted, reuses existing data/interim/turns.parquet.",
    )
    parser.add_argument(
        "--workspace-dir",
        default=".",
        help="Project workspace directory where data/results folders are created.",
    )
    parser.add_argument(
        "--pattern-config",
        default="config/feature_patterns.yaml",
        help="Path to regex pattern config.",
    )
    parser.add_argument(
        "--include-controls",
        action="store_true",
        help="Include one-hot metadata controls in logistic regression.",
    )
    parser.add_argument(
        "--min-control-count",
        type=int,
        default=100,
        help="Minimum frequency threshold for control categories.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    workspace_dir = Path(args.workspace_dir).resolve()

    interim_dir = workspace_dir / "data" / "interim"
    processed_dir = workspace_dir / "data" / "processed"
    results_dir = workspace_dir / "results"
    figures_dir = results_dir / "figures"

    interim_dir.mkdir(parents=True, exist_ok=True)
    processed_dir.mkdir(parents=True, exist_ok=True)
    results_dir.mkdir(parents=True, exist_ok=True)
    figures_dir.mkdir(parents=True, exist_ok=True)

    pattern_config = load_pattern_config(args.pattern_config)
    patterns = compile_patterns(pattern_config)

    turns_path = interim_dir / "turns.parquet"

    if args.devgpt_root is not None:
        devgpt_root = Path(args.devgpt_root)

        if not devgpt_root.exists():
            raise SystemExit(
                f"DevGPT root not found: {devgpt_root}\n"
                "Provide the real dataset path, not the placeholder `C:\\path\\to\\DevGPT`."
            )

        has_sharing_files = next(devgpt_root.rglob("*_sharings.json"), None) is not None
        if not has_sharing_files:
            raise SystemExit(
                f"No `*_sharings.json` files found under: {devgpt_root}\n"
                "Point `--devgpt-root` to the extracted DevGPT directory that contains snapshot folders."
            )

        # Stage 1: Load + clean
        turns = build_turn_table(devgpt_root)
        if turns.empty:
            raise SystemExit(
                f"No valid conversation turns were parsed from: {devgpt_root}\n"
                "Check that JSON files are complete and contain `ChatgptSharing` records with `Status == 200`."
            )

        conversations_raw = build_conversation_table(turns)
        turns.to_parquet(turns_path, index=False)
        conversations_raw.to_parquet(interim_dir / "conversations_raw.parquet", index=False)
    else:
        # Reuse existing interim data
        if not turns_path.exists():
            raise SystemExit(
                f"No interim data found at: {turns_path}\n"
                "Either provide --devgpt-root to parse raw data, or ensure data/interim/turns.parquet exists."
            )
        print(f"Reusing existing interim data: {turns_path}")
        turns = pd.read_parquet(turns_path)

    # Stage 2: Feature extraction
    turn_features = add_turn_features(turns, patterns)
    conversation_features = build_conversation_features(turn_features, patterns)
    turn_features.to_parquet(processed_dir / "turn_features.parquet", index=False)
    conversation_features.to_parquet(processed_dir / "conversation_features.parquet", index=False)

    # Stage 3: Labeling + modeling
    labels = label_conversations(turn_features, patterns)
    labels.to_parquet(results_dir / "labels.parquet", index=False)

    model_df, feature_cols, control_cols = build_model_dataset(
        conversation_feature_df=conversation_features,
        labels_df=labels,
        include_controls=args.include_controls,
        min_control_count=args.min_control_count,
    )
    model_df.to_parquet(results_dir / "model_dataset.parquet", index=False)

    coefficients, metrics = fit_logistic_model(
        model_df=model_df, feature_cols=feature_cols, control_cols=control_cols
    )
    coefficients.to_csv(results_dir / "coefficients.csv", index=False)
    with (results_dir / "model_metrics.json").open("w", encoding="utf-8") as file:
        json.dump(metrics, file, indent=2)

    # Stage 4: Visuals
    plot_df = _prepare_plot_df(conversation_features, labels)
    if not plot_df.empty:
        plot_distributions(plot_df, figures_dir / "feature_distributions.png")
        plot_correlation_heatmap(plot_df, figures_dir / "correlation_heatmap.png")
        save_summary_table(plot_df, figures_dir / "feature_summary_by_success.csv")
    if not coefficients.empty:
        plot_odds_ratios(coefficients, figures_dir / "odds_ratio_forest.png")

    print("Pipeline completed.")
    print(f"Interim data: {interim_dir}")
    print(f"Processed data: {processed_dir}")
    print(f"Results: {results_dir}")
    print(f"Figures: {figures_dir}")


if __name__ == "__main__":
    main()
