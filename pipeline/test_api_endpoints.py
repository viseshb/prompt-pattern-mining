"""
Quick endpoint test for all 4 API providers.
Sends "Say hello in 5 words." to each and prints response.
"""
import os
import sys
import json
import requests
from pathlib import Path


def load_env():
    env_path = Path(__file__).parent.parent / "frontend" / ".env.local"
    env = {}
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    return env


PROMPT = "Say hello in 5 words."


def test_kimi(api_key):
    print("\n[1] KIMI via NVIDIA NIM")
    url = "https://integrate.api.nvidia.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    body = {
        "model": "moonshotai/kimi-k2-instruct",
        "messages": [{"role": "user", "content": PROMPT}],
        "max_tokens": 50,
        "stream": False,
    }
    try:
        r = requests.post(url, headers=headers, json=body, timeout=30)
        if r.status_code == 200:
            content = r.json()["choices"][0]["message"]["content"]
            print(f"  OK: {content.strip()}")
            return True
        else:
            print(f"  FAIL ({r.status_code}): {r.text[:300]}")
            return False
    except Exception as e:
        print(f"  ERROR: {e}")
        return False


def test_bedrock_claude(bearer_token, region):
    print("\n[2] CLAUDE Sonnet 4.6 via AWS Bedrock")
    model_id = "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
    url = f"https://bedrock-runtime.{region}.amazonaws.com/model/{model_id}/invoke"
    headers = {
        "Authorization": f"Bearer {bearer_token}",
        "Content-Type": "application/json",
    }
    body = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 50,
        "messages": [{"role": "user", "content": PROMPT}],
    }
    try:
        r = requests.post(url, headers=headers, json=body, timeout=30)
        if r.status_code == 200:
            content = r.json()["content"][0]["text"]
            print(f"  OK ({model_id}): {content.strip()}")
            return True
        else:
            print(f"  FAIL ({r.status_code}): {r.text[:500]}")
            # try sonnet 4 instead
            print("  Retrying with claude-sonnet-4...")
            model_id2 = "us.anthropic.claude-sonnet-4-20250514-v1:0"
            url2 = f"https://bedrock-runtime.{region}.amazonaws.com/model/{model_id2}/invoke"
            r2 = requests.post(url2, headers=headers, json=body, timeout=30)
            if r2.status_code == 200:
                content = r2.json()["content"][0]["text"]
                print(f"  OK ({model_id2}): {content.strip()}")
                return True
            print(f"  FAIL ({r2.status_code}): {r2.text[:500]}")
            return False
    except Exception as e:
        print(f"  ERROR: {e}")
        return False


def test_gemini_standard(api_key):
    print("\n[3] GEMINI standard API key (try Flash + Pro)")
    body = {
        "contents": [{"parts": [{"text": PROMPT}]}],
        "generationConfig": {"maxOutputTokens": 50},
    }
    headers = {"Content-Type": "application/json"}
    for model in ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash", "gemini-2.5-pro"]:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
        try:
            r = requests.post(url, headers=headers, json=body, timeout=30)
            if r.status_code == 200:
                j = r.json()
                cands = j.get("candidates", [])
                if cands and cands[0].get("content", {}).get("parts"):
                    content = cands[0]["content"]["parts"][0].get("text", "")
                    print(f"  OK ({model}): {content.strip()}")
                    return model
                else:
                    print(f"  FAIL ({model}): empty response {json.dumps(j)[:300]}")
            else:
                print(f"  FAIL ({model}, {r.status_code}): {r.text[:200]}")
        except Exception as e:
            print(f"  ERROR ({model}): {e}")
    return None


def test_gemini_cloudrun(token):
    print("\n[4] GEMINI 3 Pro preview (Cloud Run token, multiple auth styles)")
    body = {
        "contents": [{"parts": [{"text": PROMPT}]}],
        "generationConfig": {"maxOutputTokens": 50},
    }
    candidates = [
        "gemini-3-pro-preview",
        "gemini-3.0-pro-preview",
        "gemini-3-pro",
        "gemini-2.5-pro",
    ]
    auth_styles = [
        ("Bearer", {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}, ""),
        ("x-goog-api-key", {"x-goog-api-key": token, "Content-Type": "application/json"}, ""),
        ("query-param-key", {"Content-Type": "application/json"}, f"?key={token}"),
    ]
    for style_name, headers, query in auth_styles:
        for model in candidates:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent{query}"
            try:
                r = requests.post(url, headers=headers, json=body, timeout=30)
                if r.status_code == 200:
                    j = r.json()
                    cands = j.get("candidates", [])
                    if cands and cands[0].get("content", {}).get("parts"):
                        content = cands[0]["content"]["parts"][0].get("text", "")
                        print(f"  OK ({style_name}, {model}): {content.strip()}")
                        return (style_name, model)
                    else:
                        print(f"  FAIL ({style_name}, {model}): empty {json.dumps(j)[:200]}")
                elif r.status_code == 429:
                    print(f"  RATE-LIMITED ({style_name}, {model}, 429): quota exceeded but auth accepted")
                else:
                    snippet = r.text[:200].replace("\n", " ")
                    print(f"  FAIL ({style_name}, {model}, {r.status_code}): {snippet}")
            except Exception as e:
                print(f"  ERROR ({style_name}, {model}): {e}")
    return None


def main():
    env = load_env()
    nvidia = env.get("NVIDIA_API_KEY", "")
    bedrock = env.get("AWS_BEARER_TOKEN_BEDROCK", "")
    region = env.get("AWS_REGION", "us-east-1").strip()
    gemini = env.get("GEMINI_API_KEY", "")
    cloudrun = env.get("CLOUD_RUN_API_KEY", "")

    print(f"Loaded env from {Path(__file__).parent.parent / 'frontend' / '.env.local'}")
    print(f"  NVIDIA: {'set' if nvidia else 'MISSING'}")
    print(f"  BEDROCK: {'set' if bedrock else 'MISSING'}")
    print(f"  GEMINI:  {'set' if gemini else 'MISSING'}")
    print(f"  CLOUDRUN: provided in script (Gemini 3 Pro)")

    results = {}
    results["kimi"] = test_kimi(nvidia)
    results["claude"] = test_bedrock_claude(bedrock, region)
    results["gemini_standard"] = bool(test_gemini_standard(gemini))
    results["gemini_cloudrun"] = bool(test_gemini_cloudrun(cloudrun))

    print("\n=== SUMMARY ===")
    for k, v in results.items():
        print(f"  {k}: {'PASS' if v else 'FAIL'}")
    return 0 if all(results.values()) else 1


if __name__ == "__main__":
    sys.exit(main())
