"""
Multi-Model Generalization Study (Mode A).

For each sampled conversation, replay the FIRST user prompt through three top-tier LLMs:
  1. Kimi K2          (NVIDIA NIM)
  2. Claude Sonnet 4.6 (AWS Bedrock)
  3. Gemini 2.5 Pro   (Vertex AI, billed against GCP credits)

Auto-grade each output with Claude as judge (3-dimension rubric).

Each conversation is run twice -- once with the ZERO system prompt, once with the
ENGINEERED system prompt -- so we can test whether the prompt-engineering effect
is universal across vendors.

Usage
-----
  python pipeline/multi_model_study.py --pilot          # 3 conversations, smoke test
  python pipeline/multi_model_study.py --n 200          # full study
  python pipeline/multi_model_study.py --n 200 --batch 10
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field, asdict
from threading import Semaphore
from pathlib import Path
from typing import Optional

import pandas as pd
import requests


# --------------------------------------------------------------------------- #
# Config
# --------------------------------------------------------------------------- #

ROOT = Path(__file__).parent.parent
ENV_FILE = ROOT / "frontend" / ".env.local"
RESULTS_DIR = ROOT / "results" / "multi_model"
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

ZERO_PROMPT = "You are a helpful coding assistant. Answer the user's coding questions."

ENGINEERED_PROMPT = """You are a senior software engineer with deep expertise across all programming languages, algorithms, and data structures. Follow these rules for EVERY response:

1. CLARIFY: Briefly restate the problem in 1-2 sentences. Identify key requirements, edge cases, and constraints.
2. APPROACH: Compare at least 2 different algorithmic approaches. State the time and space complexity of each.
3. ALWAYS choose the globally optimal algorithm. Use the best known time complexity for the problem class. For example: use merge sort or heap sort (O(n log n) guaranteed) instead of insertion sort or bubble sort (O(n^2)). Never settle for a naive or suboptimal solution.
4. WRITE clean, well-structured code implementing the algorithm from scratch in a single self-contained function (one helper function at most). Do NOT use built-in library functions when the user explicitly forbids them. Use clear variable names. Add inline comments only for non-obvious logic.
5. EXPLAIN the chosen data structure: why it is optimal vs alternatives.
6. ANALYZE: For the chosen solution, explicitly state final time complexity, space complexity, with one-line justification.
7. TEST with a runnable driver section. Show a clear `if __name__` block (or equivalent) that calls the function with the user's example input, prints the result, and verifies it. Keep it to 3-5 lines max -- no verbose test frameworks, no assert-only blocks.
"""


# --------------------------------------------------------------------------- #
# Env loader (no external deps)
# --------------------------------------------------------------------------- #

def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    return env


ENV = load_env()


# --------------------------------------------------------------------------- #
# Model adapters
# --------------------------------------------------------------------------- #

@dataclass
class ModelOutput:
    model_id: str
    text: str = ""
    elapsed_s: float = 0.0
    input_tokens: int = 0
    output_tokens: int = 0
    error: Optional[str] = None


def call_kimi(messages: list[dict], max_tokens: int = 1500) -> ModelOutput:
    out = ModelOutput(model_id="kimi-k2.5")
    region = ENV.get("AWS_REGION", "us-east-1").strip()
    t0 = time.time()
    last_err = None
    for attempt in range(6):
        try:
            r = requests.post(
                f"https://bedrock-mantle.{region}.api.aws/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {ENV['AWS_BEARER_TOKEN_BEDROCK']}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "moonshotai.kimi-k2.5",
                    "messages": messages,
                    "max_tokens": max_tokens,
                    "temperature": 0.3,
                    "stream": False,
                },
                timeout=180,
            )
            if r.status_code == 200:
                j = r.json()
                out.text = j["choices"][0]["message"]["content"] or ""
                usage = j.get("usage", {})
                out.input_tokens = usage.get("prompt_tokens", 0)
                out.output_tokens = usage.get("completion_tokens", 0)
                out.elapsed_s = time.time() - t0
                return out
            last_err = f"HTTP {r.status_code}: {r.text[:200]}"
            if r.status_code == 429:
                # NIM throttled -- aggressive backoff
                wait = 5 * (2 ** attempt) + (attempt * 1.3)
                time.sleep(wait)
                continue
            if r.status_code in (502, 503, 504):
                time.sleep(3 * (attempt + 1))
                continue
            break
        except Exception as e:
            last_err = f"{type(e).__name__}: {e}"
            time.sleep(3 * (attempt + 1))
    out.error = last_err or "unknown"
    out.elapsed_s = time.time() - t0
    return out


def call_claude_bedrock(messages: list[dict], max_tokens: int = 1500) -> ModelOutput:
    """messages = [{role, content}, ...] -- system prompt extracted separately."""
    out = ModelOutput(model_id="claude-sonnet-4-6")
    t0 = time.time()

    system = ""
    cleaned = []
    for m in messages:
        if m["role"] == "system":
            system = m["content"]
        else:
            cleaned.append({"role": m["role"], "content": m["content"]})

    region = ENV.get("AWS_REGION", "us-east-1").strip()
    model_id = "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
    url = f"https://bedrock-runtime.{region}.amazonaws.com/model/{model_id}/invoke"
    body = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": max_tokens,
        "temperature": 0.3,
        "messages": cleaned,
    }
    if system:
        body["system"] = system

    last_err = None
    for attempt in range(5):
        try:
            r = requests.post(
                url,
                headers={
                    "Authorization": f"Bearer {ENV['AWS_BEARER_TOKEN_BEDROCK']}",
                    "Content-Type": "application/json",
                },
                json=body,
                timeout=120,
            )
            if r.status_code == 200:
                j = r.json()
                parts = j.get("content", [])
                out.text = "".join(p.get("text", "") for p in parts if p.get("type") == "text")
                usage = j.get("usage", {})
                out.input_tokens = usage.get("input_tokens", 0)
                out.output_tokens = usage.get("output_tokens", 0)
                out.elapsed_s = time.time() - t0
                return out
            last_err = f"HTTP {r.status_code}: {r.text[:200]}"
            if r.status_code == 429:
                # Bedrock throttled -- exponential backoff
                wait = 4 * (2 ** attempt) + (attempt * 0.7)
                time.sleep(wait)
                continue
            if r.status_code in (502, 503, 504):
                time.sleep(2 * (attempt + 1))
                continue
            break
        except Exception as e:
            last_err = f"{type(e).__name__}: {e}"
            time.sleep(2 * (attempt + 1))
    out.error = last_err or "unknown"
    out.elapsed_s = time.time() - t0
    return out


_GENAI_CLIENT = None

def _get_genai_client():
    """Lazy-init google-genai client in Vertex Express Mode."""
    global _GENAI_CLIENT
    if _GENAI_CLIENT is None:
        from google import genai
        _GENAI_CLIENT = genai.Client(vertexai=True, api_key=ENV["CLOUD_RUN_API_KEY"])
    return _GENAI_CLIENT


def call_gemini_vertex(messages: list[dict], max_tokens: int = 1500) -> ModelOutput:
    """Gemini 3.1 Pro Preview via Vertex AI Express Mode (google-genai SDK).

    Gemini 3.x reserves part of max_output_tokens for hidden 'thinking' tokens.
    To avoid truncation we (a) inflate the budget and (b) cap thinking explicitly.
    """
    from google.genai import types
    model_name = ENV.get("GEMINI_VERTEX_MODEL", "gemini-3.1-pro-preview")
    out = ModelOutput(model_id=model_name)
    t0 = time.time()

    system = ""
    contents = []
    for m in messages:
        if m["role"] == "system":
            system = m["content"]
        else:
            role = "user" if m["role"] == "user" else "model"
            contents.append(types.Content(role=role, parts=[types.Part(text=m["content"])]))

    # Gemini 3 burns hidden reasoning tokens; cap thinking + give visible budget.
    big_budget = max(max_tokens * 3, 4000)

    cfg = types.GenerateContentConfig(
        max_output_tokens=big_budget,
        temperature=0.3,
        system_instruction=system if system else None,
        thinking_config=types.ThinkingConfig(thinking_budget=1024),
    )

    try:
        client = _get_genai_client()
        r = client.models.generate_content(
            model=model_name,
            contents=contents,
            config=cfg,
        )
        out.elapsed_s = time.time() - t0
        out.text = r.text or ""
        usage = getattr(r, "usage_metadata", None)
        if usage:
            out.input_tokens = getattr(usage, "prompt_token_count", 0) or 0
            out.output_tokens = getattr(usage, "candidates_token_count", 0) or 0
    except Exception as e:
        out.error = f"{type(e).__name__}: {str(e)[:300]}"
        out.elapsed_s = time.time() - t0
    return out


MODEL_CALLS = {
    "kimi": call_kimi,
    "claude": call_claude_bedrock,
    "gemini": call_gemini_vertex,
}

# Per-vendor concurrency caps -- prevents 429 throttling.
# Tuned from observed rate-limit responses in pilot run.
VENDOR_SEMAPHORES = {
    # Tuned to (RPM cap) x (avg latency / 60s). With retry-on-429 we can burst slightly higher.
    "kimi": Semaphore(25),    # NIM ~40 RPM x ~25s avg = ~16; bursting to 25 with backoff
    "claude": Semaphore(12),  # Bedrock tier-1 ~50 RPM x ~15s = ~12
    "gemini": Semaphore(20),  # Vertex Express ~60 RPM x ~20s = ~20
}
JUDGE_SEMAPHORE = Semaphore(10)  # judges hit Bedrock too -- run alone in phase 4 so full budget is theirs


# --------------------------------------------------------------------------- #
# Judge (Claude Sonnet 4.6 as judge)
# --------------------------------------------------------------------------- #

JUDGE_RUBRIC = """You are an impartial code-quality judge.

Evaluate the assistant's response to the user's coding question on the rubric below.
Return ONLY a JSON object, nothing else, with these fields (all booleans except score and rationale):

{
  "code_present": <true if response contains a runnable code block>,
  "addresses_task": <true if code/explanation actually addresses the user's task>,
  "looks_correct": <true if code appears syntactically and semantically correct from static reading>,
  "follows_structure": <true if response shows analysis + approach comparison + complexity discussion + tests; false if just a single naive snippet>,
  "score": <integer 0-4: sum of the four booleans above>,
  "rationale": "<one sentence reason>"
}

User's task:
---
{user_prompt}
---

Assistant response:
---
{model_response}
---

Return only the JSON object."""


def judge(user_prompt: str, model_response: str) -> dict:
    if not model_response.strip():
        return {
            "code_present": False, "addresses_task": False,
            "looks_correct": False, "follows_structure": False,
            "score": 0, "rationale": "empty response",
        }
    judge_input = JUDGE_RUBRIC.replace("{user_prompt}", user_prompt[:3000]) \
                              .replace("{model_response}", model_response[:6000])
    out = call_claude_bedrock(
        [{"role": "user", "content": judge_input}],
        max_tokens=400,
    )
    if out.error:
        return {"error": out.error, "score": -1}
    txt = out.text.strip()
    if "```" in txt:
        txt = txt.split("```")[1]
        if txt.startswith("json"):
            txt = txt[4:]
        txt = txt.strip("`").strip()
    try:
        return json.loads(txt)
    except Exception as e:
        return {"error": f"parse_fail: {e}", "raw": out.text[:300], "score": -1}


# --------------------------------------------------------------------------- #
# Sampling
# --------------------------------------------------------------------------- #

def sample_conversations(n: int, seed: int = 42) -> pd.DataFrame:
    """Stratified sample: half success, half failure, balanced by language."""
    labels = pd.read_parquet(ROOT / "results" / "labels.parquet")
    turns = pd.read_parquet(ROOT / "data" / "interim" / "turns.parquet")
    cf = pd.read_parquet(ROOT / "data" / "processed" / "conversation_features.parquet")

    first_turns = turns.sort_values(["conversation_id", "turn_index"]) \
                       .drop_duplicates("conversation_id", keep="first") \
                       [["conversation_id", "prompt", "repo_language"]]

    df = labels.merge(first_turns, on="conversation_id", how="inner") \
               .merge(cf[["conversation_id", "first_prompt_tokens"]], on="conversation_id", how="inner")

    df = df[(df["first_prompt_tokens"] >= 30) & (df["first_prompt_tokens"] <= 400)]
    df = df[df["repo_language"].isin(["Python", "JavaScript", "TypeScript", "Java", "C++", "Go", "Rust"])]
    df = df[df["prompt"].str.len() > 50]

    n_succ = (n + 1) // 2  # ceil
    n_fail = n // 2        # floor
    s = df[df["success"] == 1].sample(n=min(n_succ, (df["success"] == 1).sum()), random_state=seed)
    f = df[df["success"] == 0].sample(n=min(n_fail, (df["success"] == 0).sum()), random_state=seed)
    sampled = pd.concat([s, f]).sample(frac=1, random_state=seed).reset_index(drop=True)
    return sampled


# --------------------------------------------------------------------------- #
# Runner
# --------------------------------------------------------------------------- #

_TOKEN_CAPS = {"kimi": 900, "claude": 1100, "gemini": 1200}


def _call_with_cap(model_key: str, messages: list[dict]):
    """Vendor call gated by per-vendor semaphore for rate-limit safety."""
    with VENDOR_SEMAPHORES[model_key]:
        return MODEL_CALLS[model_key](messages, max_tokens=_TOKEN_CAPS[model_key])


def _judge_gated(user_prompt: str, model_response: str):
    with JUDGE_SEMAPHORE:
        return judge(user_prompt, model_response)


def run_one_conversation(
    row: pd.Series,
    pool: ThreadPoolExecutor,
    existing_record: Optional[dict] = None,
) -> dict:
    """For one conversation, fill in only the (mode, model) cells that are missing
    or have score < 0 in `existing_record`. Already-good cells are preserved -- this
    avoids re-billing API calls we've already paid for.
    """
    if existing_record is not None:
        record = existing_record
        # ensure structure is intact in case of partial saves
        record.setdefault("conversation_id", row["conversation_id"])
        record.setdefault("language", row["repo_language"])
        record.setdefault("true_success", int(row["success"]))
        record.setdefault("first_prompt_tokens", int(row["first_prompt_tokens"]))
        record.setdefault("user_prompt", row["prompt"])
        record.setdefault("modes", {})
        for m in ("zero", "engineered"):
            record["modes"].setdefault(m, {"outputs": {}, "grades": {}})
            record["modes"][m].setdefault("outputs", {})
            record["modes"][m].setdefault("grades", {})
    else:
        record = {
            "conversation_id": row["conversation_id"],
            "language": row["repo_language"],
            "true_success": int(row["success"]),
            "first_prompt_tokens": int(row["first_prompt_tokens"]),
            "user_prompt": row["prompt"],
            "modes": {"zero": {"outputs": {}, "grades": {}},
                      "engineered": {"outputs": {}, "grades": {}}},
        }

    # Identify cells that still need work: score < 0 OR no grade entry yet.
    cells_to_run: list[tuple[str, str]] = []
    for mode in ("zero", "engineered"):
        for mkey in MODEL_CALLS:
            grade = record["modes"][mode]["grades"].get(mkey)
            if grade is None or grade.get("score", -1) < 0:
                cells_to_run.append((mode, mkey))

    if not cells_to_run:
        return record  # nothing to do

    # Stage 1: dispatch only the model calls we need.
    model_futs = {}
    for mode, mkey in cells_to_run:
        system = ENGINEERED_PROMPT if mode == "engineered" else ZERO_PROMPT
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": row["prompt"]},
        ]
        f = pool.submit(_call_with_cap, mkey, messages)
        model_futs[f] = (mode, mkey)

    for f in as_completed(model_futs):
        mode, mkey = model_futs[f]
        record["modes"][mode]["outputs"][mkey] = asdict(f.result())

    # Stage 2: only judge cells we just produced output for.
    judge_futs = {}
    for mode, mkey in cells_to_run:
        o = record["modes"][mode]["outputs"].get(mkey, {})
        err = o.get("error") if isinstance(o, dict) else None
        text = o.get("text", "") if isinstance(o, dict) else ""
        if err or not str(text).strip():
            record["modes"][mode]["grades"][mkey] = {
                "error": err or "empty", "score": -1
            }
            continue
        f = pool.submit(_judge_gated, row["prompt"], text)
        judge_futs[f] = (mode, mkey)

    for f in as_completed(judge_futs):
        mode, mkey = judge_futs[f]
        record["modes"][mode]["grades"][mkey] = f.result()

    return record


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--pilot", action="store_true", help="Run with N=5 (smoke test)")
    p.add_argument("--n", type=int, default=200)
    p.add_argument("--workers", type=int, default=60, help="Concurrent API workers")
    p.add_argument("--out", type=str, default=None)
    args = p.parse_args()

    n = args.n if args.pilot is False or args.n != 200 else (5 if args.pilot else 200)
    out_name = args.out or ("multi_model_pilot.json" if args.pilot else "multi_model_study.json")
    out_path = RESULTS_DIR / out_name

    print(f"Sampling {n} conversations...")
    sample = sample_conversations(n)
    print(f"  got {len(sample)} ({(sample['success']==1).sum()} success, {(sample['success']==0).sum()} failure)")
    print(f"  languages: {sample['repo_language'].value_counts().to_dict()}")
    print()

    # ---- CHECKPOINT/RESUME (granular per-cell) ----
    # Load all previously-saved records (whether fully complete or partial).
    # We never throw away successful (mode, model) cells -- only retry the
    # specific cells whose score is -1.
    existing_records: dict[str, dict] = {}
    if out_path.exists():
        try:
            prev = json.loads(out_path.read_text())
            for r in prev.get("records", []):
                if r is None:
                    continue
                existing_records[r["conversation_id"]] = r
            full = sum(
                1 for r in existing_records.values()
                if all(
                    r["modes"][m]["grades"].get(mk, {}).get("score", -1) >= 0
                    for m in ("zero", "engineered") for mk in MODEL_CALLS
                )
            )
            partial = len(existing_records) - full
            print(f"Resume: {len(existing_records)} records found "
                  f"({full} complete, {partial} partial -- only failed cells will be retried).")
        except Exception as e:
            print(f"Could not parse existing checkpoint ({e}); starting fresh.")
            existing_records = {}

    # Pre-fill records list with existing data; flag conversations that have ANY missing/-1 cell.
    records: list[dict] = [None] * len(sample)
    indices_to_run: list[int] = []
    for i, row in sample.iterrows():
        cid = row["conversation_id"]
        rec = existing_records.get(cid)
        records[i] = rec  # may be None or partial
        # any cell with score < 0 means we need to run this conv
        needs_work = True
        if rec is not None:
            needs_work = any(
                rec["modes"][m]["grades"].get(mk, {}).get("score", -1) < 0
                for m in ("zero", "engineered") for mk in MODEL_CALLS
            )
        if needs_work or rec is None:
            indices_to_run.append(i)

    cells_pending = 0
    for i in indices_to_run:
        rec = records[i]
        if rec is None:
            cells_pending += 6
        else:
            for m in ("zero", "engineered"):
                for mk in MODEL_CALLS:
                    if rec["modes"][m]["grades"].get(mk, {}).get("score", -1) < 0:
                        cells_pending += 1
    print(f"To run: {len(indices_to_run)} conversations, {cells_pending} cells pending\n")

    t_start = time.time()
    save_lock = __import__("threading").Lock()
    pool = ThreadPoolExecutor(max_workers=args.workers)

    def save_now():
        """Atomic save of current records list."""
        with save_lock:
            clean = [r for r in records if r is not None]
            out_path.write_text(json.dumps({"records": clean, "config": {"n": n}}, indent=2))

    def init_record(i: int):
        """Ensure records[i] is at least a skeleton dict."""
        if records[i] is None:
            row = sample_dict[i]
            records[i] = {
                "conversation_id": row["conversation_id"],
                "language": row["repo_language"],
                "true_success": int(row["success"]),
                "first_prompt_tokens": int(row["first_prompt_tokens"]),
                "user_prompt": row["prompt"],
                "modes": {"zero": {"outputs": {}, "grades": {}},
                          "engineered": {"outputs": {}, "grades": {}}},
            }
        else:
            r = records[i]
            r.setdefault("modes", {})
            for m in ("zero", "engineered"):
                r["modes"].setdefault(m, {"outputs": {}, "grades": {}})
                r["modes"][m].setdefault("outputs", {})
                r["modes"][m].setdefault("grades", {})

    sample_dict = {i: row for i, row in sample.iterrows()}

    # ---- PHASED EXECUTION ----
    # Phase 1-3: one vendor at a time, all conversations.
    # Phase 4: judges at the end.
    # Every cell is saved to disk immediately after success (via save_now() every 10).

    def run_model_phase(vendor: str):
        """Fire vendor's calls for every (conv, mode) cell that lacks valid output."""
        tasks = []  # list of (i, mode)
        for i in indices_to_run:
            init_record(i)
            r = records[i]
            for mode in ("zero", "engineered"):
                # Skip if grade already valid (cell complete)
                grade = r["modes"][mode]["grades"].get(vendor, {})
                if grade.get("score", -1) >= 0:
                    continue
                # Skip if output is already there and clean (only judge missing -- handled in phase 4)
                o = r["modes"][mode]["outputs"].get(vendor, {})
                if o and not o.get("error") and o.get("text", "").strip():
                    continue
                tasks.append((i, mode))
        if not tasks:
            print(f"  Phase {vendor}: nothing to run.")
            return
        print(f"  Phase {vendor}: {len(tasks)} model calls to make.")

        futs = {}
        for i, mode in tasks:
            system = ENGINEERED_PROMPT if mode == "engineered" else ZERO_PROMPT
            messages = [
                {"role": "system", "content": system},
                {"role": "user", "content": sample_dict[i]["prompt"]},
            ]
            f = pool.submit(_call_with_cap, vendor, messages)
            futs[f] = (i, mode)

        done = 0
        last_save = time.time()
        for f in as_completed(futs):
            i, mode = futs[f]
            res = asdict(f.result())
            with save_lock:
                records[i]["modes"][mode]["outputs"][vendor] = res
                done += 1
                elapsed = time.time() - t_start
                status = "OK " if not res.get("error") else "ERR"
                if done % 10 == 0 or done == len(tasks) or (time.time() - last_save) > 15:
                    save_now()
                    last_save = time.time()
                print(f"  [{vendor:6s} {done:3d}/{len(tasks)}] +{elapsed:6.1f}s "
                      f"conv={records[i]['conversation_id'].split('/')[-1][:8]} mode={mode:10s} "
                      f"{status} out={res.get('output_tokens', 0)}tok", flush=True)
        save_now()

    def run_judge_phase():
        """Judge every (conv, mode, vendor) cell with valid output but no valid grade yet."""
        tasks = []  # (i, mode, vendor)
        for i in indices_to_run:
            r = records[i]
            if r is None:
                continue
            for mode in ("zero", "engineered"):
                for v in MODEL_CALLS:
                    grade = r["modes"][mode]["grades"].get(v, {})
                    if grade.get("score", -1) >= 0:
                        continue  # already judged successfully
                    o = r["modes"][mode]["outputs"].get(v, {})
                    if o.get("error") or not o.get("text", "").strip():
                        # output failed -- cement -1 grade so we don't keep retrying judges
                        r["modes"][mode]["grades"][v] = {
                            "error": o.get("error") or "empty",
                            "score": -1,
                        }
                        continue
                    tasks.append((i, mode, v))
        save_now()
        if not tasks:
            print("  Phase judge: nothing to grade.")
            return
        print(f"  Phase judge: {len(tasks)} grading calls.")

        futs = {}
        for i, mode, v in tasks:
            text = records[i]["modes"][mode]["outputs"][v]["text"]
            f = pool.submit(_judge_gated, sample_dict[i]["prompt"], text)
            futs[f] = (i, mode, v)

        done = 0
        last_save = time.time()
        for f in as_completed(futs):
            i, mode, v = futs[f]
            grade = f.result()
            with save_lock:
                records[i]["modes"][mode]["grades"][v] = grade
                done += 1
                elapsed = time.time() - t_start
                if done % 20 == 0 or done == len(tasks) or (time.time() - last_save) > 15:
                    save_now()
                    last_save = time.time()
                sc = grade.get("score", -1)
                print(f"  [judge {done:4d}/{len(tasks)}] +{elapsed:6.1f}s "
                      f"conv={records[i]['conversation_id'].split('/')[-1][:8]} {mode:10s} {v:6s} score={sc}",
                      flush=True)
        save_now()

    print("=" * 70)
    print("Phase 1: Kimi K2 (NVIDIA NIM)")
    print("=" * 70)
    run_model_phase("kimi")

    print("\n" + "=" * 70)
    print("Phase 2: Claude Sonnet 4.6 (AWS Bedrock)")
    print("=" * 70)
    run_model_phase("claude")

    print("\n" + "=" * 70)
    print("Phase 3: Gemini 3.1 Pro Preview (Vertex AI)")
    print("=" * 70)
    run_model_phase("gemini")

    print("\n" + "=" * 70)
    print("Phase 4: Judges (Claude as rubric grader)")
    print("=" * 70)
    run_judge_phase()

    save_now()
    pool.shutdown(wait=True)

    elapsed = time.time() - t_start
    valid_records = sum(
        1 for r in records if r is not None and all(
            r["modes"][m]["grades"].get(mk, {}).get("score", -1) >= 0
            for m in ("zero", "engineered") for mk in MODEL_CALLS
        )
    )
    print(f"\nSaved -> {out_path}")
    print(f"Wall time: {elapsed:.1f}s ({elapsed/60:.1f} min)")
    print(f"Fully-graded records: {valid_records}/{len(sample)}")


if __name__ == "__main__":
    main()
