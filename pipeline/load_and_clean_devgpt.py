from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Iterator, Optional

import pandas as pd

FILENAME_RE = re.compile(r"(?P<ts>\d{8}_\d{6})_(?P<src>[a-z]+)_sharings\.json$")
FENCED_CODE_RE = re.compile(r"```[\s\S]*?```")


def normalize_text(value: object) -> str:
    if value is None:
        return ""
    text = str(value).replace("\r\n", "\n").replace("\r", "\n")
    lines = [line.rstrip() for line in text.split("\n")]
    text = "\n".join(lines).strip()
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text


def infer_file_metadata(path: Path) -> tuple[str, str, str]:
    match = FILENAME_RE.search(path.name)
    timestamp = match.group("ts") if match else ""
    source_type = match.group("src") if match else "unknown"
    snapshot = path.parent.name
    return timestamp, source_type, snapshot


def iter_sharing_files(devgpt_root: Path, source_types: Optional[set[str]] = None) -> Iterator[Path]:
    for path in sorted(devgpt_root.rglob("*_sharings.json")):
        _, source_type, _ = infer_file_metadata(path)
        if source_types and source_type not in source_types:
            continue
        yield path


def iter_turn_rows(devgpt_root: Path, source_types: Optional[set[str]] = None) -> Iterator[dict]:
    for sharing_path in iter_sharing_files(devgpt_root, source_types=source_types):
        file_timestamp, source_type, snapshot = infer_file_metadata(sharing_path)

        with sharing_path.open("r", encoding="utf-8") as file:
            try:
                payload = json.load(file)
            except json.JSONDecodeError:
                continue

        # DevGPT snapshots can appear as:
        # 1) list[record]
        # 2) {"Sources": list[record]}
        if isinstance(payload, list):
            records = payload
        elif isinstance(payload, dict) and isinstance(payload.get("Sources"), list):
            records = payload["Sources"]
        else:
            continue

        for record_idx, record in enumerate(records):
            if not isinstance(record, dict):
                continue

            repo_name = normalize_text(record.get("RepoName"))
            repo_language = normalize_text(record.get("RepoLanguage"))
            chatgpt_sharings = record.get("ChatgptSharing") or []

            if not isinstance(chatgpt_sharings, list):
                continue

            for share_idx, sharing in enumerate(chatgpt_sharings):
                if not isinstance(sharing, dict):
                    continue
                if sharing.get("Status") != 200:
                    continue

                share_url = normalize_text(sharing.get("URL"))
                conversation_id = share_url or (
                    f"{sharing_path.as_posix()}::record_{record_idx}::sharing_{share_idx}"
                )
                model = normalize_text(sharing.get("Model"))
                turns = sharing.get("Conversations") or []
                if not isinstance(turns, list):
                    continue

                for turn_index, turn in enumerate(turns, start=1):
                    if not isinstance(turn, dict):
                        continue

                    prompt = normalize_text(turn.get("Prompt"))
                    answer = normalize_text(turn.get("Answer"))
                    if not prompt and not answer:
                        continue

                    list_of_code = turn.get("ListOfCode") or []
                    if not isinstance(list_of_code, list):
                        list_of_code = []

                    answer_code_blocks = len(list_of_code)
                    answer_has_fenced_code = int(bool(FENCED_CODE_RE.search(answer)))

                    yield {
                        "conversation_id": conversation_id,
                        "share_url": share_url,
                        "snapshot": snapshot,
                        "file_timestamp": file_timestamp,
                        "source_type": source_type,
                        "repo_name": repo_name,
                        "repo_language": repo_language,
                        "model": model,
                        "turn_index": turn_index,
                        "prompt": prompt,
                        "answer": answer,
                        "answer_code_blocks": answer_code_blocks,
                        "answer_has_fenced_code": answer_has_fenced_code,
                    }


def build_turn_table(devgpt_root: Path, source_types: Optional[set[str]] = None) -> pd.DataFrame:
    rows = list(iter_turn_rows(devgpt_root=devgpt_root, source_types=source_types))
    if not rows:
        return pd.DataFrame(
            columns=[
                "conversation_id",
                "share_url",
                "snapshot",
                "file_timestamp",
                "source_type",
                "repo_name",
                "repo_language",
                "model",
                "turn_index",
                "prompt",
                "answer",
                "answer_code_blocks",
                "answer_has_fenced_code",
            ]
        )

    turn_df = pd.DataFrame(rows)
    turn_df = turn_df.drop_duplicates(
        subset=["conversation_id", "turn_index", "prompt", "answer"]
    ).sort_values(["conversation_id", "turn_index"])
    turn_df = turn_df.reset_index(drop=True)
    return turn_df


def build_conversation_table(turn_df: pd.DataFrame) -> pd.DataFrame:
    if turn_df.empty:
        return pd.DataFrame(
            columns=[
                "conversation_id",
                "share_url",
                "snapshot",
                "source_type",
                "repo_name",
                "repo_language",
                "model",
                "n_turns",
                "n_prompt_chars",
                "n_answer_chars",
                "code_turns",
                "has_any_code",
            ]
        )

    ordered = turn_df.sort_values(["conversation_id", "turn_index"])
    conversation_df = (
        ordered.groupby("conversation_id", as_index=False)
        .agg(
            share_url=("share_url", "first"),
            snapshot=("snapshot", "first"),
            source_type=("source_type", "first"),
            repo_name=("repo_name", "first"),
            repo_language=("repo_language", "first"),
            model=("model", "first"),
            n_turns=("turn_index", "max"),
            n_prompt_chars=("prompt", lambda s: int(sum(len(x) for x in s))),
            n_answer_chars=("answer", lambda s: int(sum(len(x) for x in s))),
            code_turns=("answer_code_blocks", lambda s: int((s > 0).sum())),
            has_any_code=("answer_code_blocks", lambda s: int((s > 0).any())),
        )
        .sort_values("conversation_id")
        .reset_index(drop=True)
    )
    return conversation_df


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Load and clean DevGPT conversation data into canonical parquet tables."
    )
    parser.add_argument("--devgpt-root", required=True, help="Path to DevGPT root directory.")
    parser.add_argument(
        "--out-dir",
        default="data/interim",
        help="Output directory for cleaned tables (default: data/interim).",
    )
    parser.add_argument(
        "--source-types",
        nargs="*",
        default=None,
        help="Optional source filters (example: commit issue pr).",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    devgpt_root = Path(args.devgpt_root)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    source_types = set(args.source_types) if args.source_types else None
    turn_df = build_turn_table(devgpt_root=devgpt_root, source_types=source_types)
    conversation_df = build_conversation_table(turn_df)

    turns_path = out_dir / "turns.parquet"
    conv_path = out_dir / "conversations_raw.parquet"
    turn_df.to_parquet(turns_path, index=False)
    conversation_df.to_parquet(conv_path, index=False)

    print(f"Saved: {turns_path} ({len(turn_df):,} rows)")
    print(f"Saved: {conv_path} ({len(conversation_df):,} rows)")


if __name__ == "__main__":
    main()
