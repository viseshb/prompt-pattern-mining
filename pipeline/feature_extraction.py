from __future__ import annotations

import argparse
import re
from pathlib import Path
from typing import Dict

import pandas as pd
import yaml

TOKEN_RE = re.compile(r"\b\w+\b")
BULLET_RE = re.compile(r"(?m)^\s*[-*]\s+")
NUMBERED_STEP_RE = re.compile(r"(?m)^\s*\d+\.\s+")
FENCED_CODE_RE = re.compile(r"```[\s\S]*?```")

CONVERSATION_FEATURE_COLUMNS = [
    "conversation_id",
    "share_url",
    "snapshot",
    "source_type",
    "repo_name",
    "repo_language",
    "model",
    "iteration_count",
    "refinement_turns",
    "refinement_ratio",
    "correction_cycles",
    "first_prompt_tokens",
    "avg_prompt_tokens",
    "max_prompt_tokens",
    "prompt_token_growth",
    "first_constraint_count",
    "avg_constraint_count",
    "max_constraint_count",
    "total_example_count",
    "first_specification_clarity_count",
    "total_specification_clarity_count",
    "has_specification_clarity_first",
    "has_role_instruction_first",
    "any_role_instruction",
    "has_output_format_first",
    "any_output_format_request",
    "code_turn_ratio",
    "answer_fenced_code_ratio",
]


def load_pattern_config(path: str | Path) -> Dict[str, str]:
    with Path(path).open("r", encoding="utf-8") as file:
        data = yaml.safe_load(file) or {}

    patterns = data.get("patterns", data)
    required_keys = [
        "constraints",
        "examples",
        "role_instructions",
        "output_format",
        "specification_clarity",
        "refinement",
        "positive_ack",
        "negative_ack",
    ]
    missing = [key for key in required_keys if key not in patterns]
    if missing:
        raise ValueError(f"Missing regex patterns: {missing}")
    return patterns


def compile_patterns(pattern_config: Dict[str, str]) -> Dict[str, re.Pattern]:
    return {
        key: re.compile(pattern, flags=re.IGNORECASE | re.MULTILINE)
        for key, pattern in pattern_config.items()
    }


def _turn_feature_row(prompt: str, patterns: Dict[str, re.Pattern]) -> dict:
    tokens = TOKEN_RE.findall(prompt)
    lines = prompt.splitlines() if prompt else []

    return {
        "prompt_chars": len(prompt),
        "prompt_tokens": len(tokens),
        "prompt_lines": len(lines) if lines else 0,
        "bullet_count": len(BULLET_RE.findall(prompt)),
        "numbered_step_count": len(NUMBERED_STEP_RE.findall(prompt)),
        "prompt_code_block_count": len(FENCED_CODE_RE.findall(prompt)),
        "constraint_count": len(patterns["constraints"].findall(prompt)),
        "example_count": len(patterns["examples"].findall(prompt)),
        "has_constraints": int(bool(patterns["constraints"].search(prompt))),
        "has_example": int(bool(patterns["examples"].search(prompt))),
        "has_role_instruction": int(bool(patterns["role_instructions"].search(prompt))),
        "has_output_format_request": int(bool(patterns["output_format"].search(prompt))),
        "specification_clarity_count": len(patterns["specification_clarity"].findall(prompt)),
        "has_specification_clarity": int(bool(patterns["specification_clarity"].search(prompt))),
        "question_count": prompt.count("?"),
    }


def add_turn_features(turn_df: pd.DataFrame, patterns: Dict[str, re.Pattern]) -> pd.DataFrame:
    if turn_df.empty:
        return turn_df.copy()

    enriched = turn_df.copy()
    feature_rows = enriched["prompt"].fillna("").map(lambda p: _turn_feature_row(p, patterns))
    feature_df = pd.DataFrame(feature_rows.tolist())
    enriched = pd.concat([enriched.reset_index(drop=True), feature_df], axis=1)
    return enriched


def build_conversation_features(
    turn_feature_df: pd.DataFrame, patterns: Dict[str, re.Pattern]
) -> pd.DataFrame:
    if turn_feature_df.empty:
        return pd.DataFrame(columns=CONVERSATION_FEATURE_COLUMNS)

    rows = []
    ordered = turn_feature_df.sort_values(["conversation_id", "turn_index"])

    for conversation_id, group in ordered.groupby("conversation_id"):
        group = group.sort_values("turn_index").reset_index(drop=True)
        prompts = group["prompt"].fillna("").tolist()

        refinement_turns = sum(
            bool(patterns["refinement"].search(prompt)) for prompt in prompts[1:]
        )
        iteration_count = int(group["turn_index"].max())

        # Correction cycles: a negative-ack turn followed by a refinement turn
        correction_cycles = 0
        for i in range(1, len(prompts)):
            is_neg = bool(patterns["negative_ack"].search(prompts[i]))
            if is_neg:
                # Check if any subsequent turn is a refinement
                for j in range(i + 1, len(prompts)):
                    if bool(patterns["refinement"].search(prompts[j])):
                        correction_cycles += 1
                        break

        first_prompt_tokens = int(group.loc[0, "prompt_tokens"])
        last_prompt_tokens = int(group.loc[len(group) - 1, "prompt_tokens"])

        rows.append(
            {
                "conversation_id": conversation_id,
                "share_url": group.loc[0, "share_url"],
                "snapshot": group.loc[0, "snapshot"],
                "source_type": group.loc[0, "source_type"],
                "repo_name": group.loc[0, "repo_name"],
                "repo_language": group.loc[0, "repo_language"],
                "model": group.loc[0, "model"],
                "iteration_count": iteration_count,
                "refinement_turns": refinement_turns,
                "refinement_ratio": (
                    refinement_turns / (iteration_count - 1) if iteration_count > 1 else 0.0
                ),
                "correction_cycles": correction_cycles,
                "first_prompt_tokens": first_prompt_tokens,
                "avg_prompt_tokens": float(group["prompt_tokens"].mean()),
                "max_prompt_tokens": int(group["prompt_tokens"].max()),
                "prompt_token_growth": last_prompt_tokens - first_prompt_tokens,
                "first_constraint_count": int(group.loc[0, "constraint_count"]),
                "avg_constraint_count": float(group["constraint_count"].mean()),
                "max_constraint_count": int(group["constraint_count"].max()),
                "total_example_count": int(group["example_count"].sum()),
                "first_specification_clarity_count": int(group.loc[0, "specification_clarity_count"]),
                "total_specification_clarity_count": int(group["specification_clarity_count"].sum()),
                "has_specification_clarity_first": int(group.loc[0, "has_specification_clarity"]),
                "has_role_instruction_first": int(group.loc[0, "has_role_instruction"]),
                "any_role_instruction": int(group["has_role_instruction"].max()),
                "has_output_format_first": int(group.loc[0, "has_output_format_request"]),
                "any_output_format_request": int(group["has_output_format_request"].max()),
                "code_turn_ratio": float((group["answer_code_blocks"] > 0).mean()),
                "answer_fenced_code_ratio": float(group["answer_has_fenced_code"].mean()),
            }
        )

    if not rows:
        return pd.DataFrame(columns=CONVERSATION_FEATURE_COLUMNS)
    return pd.DataFrame(rows).sort_values("conversation_id").reset_index(drop=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract turn-level and conversation-level prompt features."
    )
    parser.add_argument("--turns", required=True, help="Path to turns parquet file.")
    parser.add_argument(
        "--pattern-config",
        required=True,
        help="Path to regex pattern config (YAML).",
    )
    parser.add_argument(
        "--out-dir",
        default="data/processed",
        help="Output directory for feature tables (default: data/processed).",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    turns_path = Path(args.turns)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    turn_df = pd.read_parquet(turns_path)
    pattern_config = load_pattern_config(args.pattern_config)
    patterns = compile_patterns(pattern_config)

    turn_features = add_turn_features(turn_df, patterns)
    conversation_features = build_conversation_features(turn_features, patterns)

    turn_out = out_dir / "turn_features.parquet"
    conv_out = out_dir / "conversation_features.parquet"
    turn_features.to_parquet(turn_out, index=False)
    conversation_features.to_parquet(conv_out, index=False)

    print(f"Saved: {turn_out} ({len(turn_features):,} rows)")
    print(f"Saved: {conv_out} ({len(conversation_features):,} rows)")


if __name__ == "__main__":
    main()
