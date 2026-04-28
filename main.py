from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path


def _run_step(step_name: str, command: list[str], workdir: Path) -> None:
    print(f"\n[{step_name}]", flush=True)
    print(" ".join(command), flush=True)
    subprocess.run(command, cwd=workdir, check=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Single entrypoint to run the full Prompt Pattern Mining workflow."
    )
    parser.add_argument(
        "--devgpt-root",
        default=None,
        help="Path to DevGPT root directory. If omitted, reuses existing data/interim/turns.parquet.",
    )
    parser.add_argument(
        "--workspace-dir",
        default=".",
        help="Project workspace directory (default: current directory).",
    )
    parser.add_argument(
        "--mode",
        choices=["core", "full"],
        default="core",
        help=(
            "Run mode: `core` runs only the main pipeline (fewer files). "
            "`full` also generates paper tables, validation sample, and sensitivity outputs."
        ),
    )
    parser.add_argument(
        "--clean",
        action="store_true",
        help="Delete existing `data/` and `results/` folders inside workspace before running.",
    )
    parser.add_argument(
        "--pattern-config",
        default="config/feature_patterns.yaml",
        help="Path to regex config YAML.",
    )
    parser.add_argument(
        "--include-controls",
        action="store_true",
        help="Include metadata controls in logistic models.",
    )
    parser.add_argument(
        "--min-control-count",
        type=int,
        default=100,
        help="Minimum frequency threshold for control categories.",
    )
    parser.add_argument(
        "--validation-sample-size",
        type=int,
        default=200,
        help="Sample size for manual label-validation CSV generation.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    python_exe = sys.executable
    workspace_dir = Path(args.workspace_dir).resolve()

    if args.clean:
        for folder_name in ["data", "results"]:
            target = workspace_dir / folder_name
            if target.exists():
                shutil.rmtree(target)
                print(f"Removed: {target}", flush=True)

    include_controls_flag = ["--include-controls"] if args.include_controls else []

    # 1) Core pipeline (always runs)
    devgpt_root_flag = ["--devgpt-root", str(args.devgpt_root)] if args.devgpt_root else []
    core_cmd = [
        python_exe,
        "-m",
        "pipeline.run_pipeline",
        *devgpt_root_flag,
        "--workspace-dir",
        str(workspace_dir),
        "--pattern-config",
        str(args.pattern_config),
        "--min-control-count",
        str(args.min_control_count),
        *include_controls_flag,
    ]
    _run_step("1/4 Core Pipeline", core_cmd, workspace_dir)

    if args.mode == "core":
        print("\nCore mode completed.", flush=True)
        print("Generated folders: `data/`, `results/`", flush=True)
        print(
            "If you later want all paper/validation/sensitivity artifacts, run:",
            flush=True,
        )
        print(
            f"{python_exe} main.py --devgpt-root \"{args.devgpt_root}\" "
            f"--workspace-dir \"{workspace_dir}\" --mode full {'--include-controls' if args.include_controls else ''}",
            flush=True,
        )
        return

    # 2) Paper tables + results autodraft
    paper_cmd = [
        python_exe,
        "-m",
        "pipeline.paper_results_report",
        "--conversation-features",
        str(workspace_dir / "data" / "processed" / "conversation_features.parquet"),
        "--labels",
        str(workspace_dir / "results" / "labels.parquet"),
        "--coefficients",
        str(workspace_dir / "results" / "coefficients.csv"),
        "--model-metrics",
        str(workspace_dir / "results" / "model_metrics.json"),
        "--out-dir",
        str(workspace_dir / "results" / "paper"),
    ]
    _run_step("2/4 Paper Outputs", paper_cmd, workspace_dir)

    # 3) Manual validation sample (creates CSV for human annotation)
    validation_sample_cmd = [
        python_exe,
        "-m",
        "pipeline.label_validation",
        "sample",
        "--turn-features",
        str(workspace_dir / "data" / "processed" / "turn_features.parquet"),
        "--labels",
        str(workspace_dir / "results" / "labels.parquet"),
        "--out-dir",
        str(workspace_dir / "results" / "validation"),
        "--sample-size",
        str(args.validation_sample_size),
        "--seed",
        "42",
    ]
    _run_step("3/4 Validation Sample", validation_sample_cmd, workspace_dir)

    # 4) Sensitivity / robustness
    sensitivity_cmd = [
        python_exe,
        "-m",
        "pipeline.sensitivity_robustness",
        "--turn-features",
        str(workspace_dir / "data" / "processed" / "turn_features.parquet"),
        "--conversation-features",
        str(workspace_dir / "data" / "processed" / "conversation_features.parquet"),
        "--pattern-config",
        str(args.pattern_config),
        "--out-dir",
        str(workspace_dir / "results" / "sensitivity"),
        "--min-control-count",
        str(args.min_control_count),
        *include_controls_flag,
    ]
    _run_step("4/4 Sensitivity", sensitivity_cmd, workspace_dir)

    print("\nAll automated steps completed.")
    print(
        "Manual next step: annotate `results/validation/manual_validation_sample.csv`, "
        "then run:"
    )
    print(
        f"{python_exe} -m pipeline.label_validation evaluate "
        f"--annotated-csv \"{workspace_dir / 'results' / 'validation' / 'manual_validation_sample.csv'}\" "
        f"--out-dir \"{workspace_dir / 'results' / 'validation'}\""
    )


if __name__ == "__main__":
    main()
