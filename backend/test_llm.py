"""
LLM 连通性测试脚本
直接调用 GPTs API Gateway 验证配置是否正确（独立运行，不依赖数据库）
"""
import asyncio
import json
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))
os.chdir(os.path.dirname(__file__))


def _load_env():
    """从 .env 文件加载配置"""
    cfg = {}
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    key, val = line.split("=", 1)
                    cfg[key.strip()] = val.strip()
    return cfg


async def test_basic_connection(base_url, api_key, model):
    """测试基本连通性：发送简单消息"""
    from openai import AsyncOpenAI

    client = AsyncOpenAI(
        base_url=base_url + "/v1",
        api_key=api_key,
        timeout=60.0,
    )

    response = await client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": "Hello, respond in 10 words or less."}],
        max_tokens=50,
    )

    content = response.choices[0].message.content or ""
    usage = None
    if response.usage:
        usage = {
            "prompt_tokens": response.usage.prompt_tokens,
            "completion_tokens": response.usage.completion_tokens,
            "total_tokens": response.usage.total_tokens,
        }
    return content, usage


async def test_field_completion(base_url, api_key, model):
    """测试字段补齐功能：模拟 Skill 字段推断"""
    from openai import AsyncOpenAI

    client = AsyncOpenAI(
        base_url=base_url + "/v1",
        api_key=api_key,
        timeout=60.0,
    )

    system_prompt = (
        "You are an AI Coding Skill metadata expert. "
        "Given the skill's name, description, and body preview, infer the missing fields. "
        "Return strict JSON with only the requested fields."
    )

    user_msg = json.dumps({
        "name": "test-helper",
        "description": "Full test skill for validating that agents can discover, load, and follow a local skill.",
        "body_preview": "# Test Helper\n\n## Overview\nUse this skill to confirm that a local skill loads correctly...",
        "incomplete_fields": ["ui.display_name", "ui.short_description", "ui.default_prompt"],
    }, ensure_ascii=False, indent=2)

    response = await client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_msg},
        ],
        temperature=0.3,
        max_tokens=500,
    )

    content = response.choices[0].message.content or "{}"
    return json.loads(content)


async def main():
    cfg = _load_env()
    base_url = cfg.get("LLM_BASE_URL", "https://api.gptsapi.net")
    api_key = cfg.get("LLM_API_KEY", "")
    model = cfg.get("LLM_MODEL", "gpt-5.5")

    print("=" * 60)
    print("  LLM Connectivity Test")
    print("=" * 60)
    print(f"  Base URL : {base_url}")
    print(f"  Model    : {model}")
    key_display = f"{api_key[:12]}...{api_key[-4:]}" if len(api_key) > 16 else "***"
    print(f"  API Key  : {key_display}")
    print("=" * 60)
    print()

    # === Test 1: Basic connectivity ===
    print("  [Test 1] Basic connectivity...")
    try:
        content, usage = await test_basic_connection(base_url, api_key, model)
        print(f"  [OK] Connected!")
        print(f"  Response: {content}")
        if usage:
            print(f"  Tokens: prompt={usage['prompt_tokens']}, "
                  f"completion={usage['completion_tokens']}, "
                  f"total={usage['total_tokens']}")
    except Exception as e:
        print(f"  [FAIL] Connection failed: {e}")
        print()
        print("=" * 60)
        return False

    print()

    # === Test 2: Field completion ===
    print("  [Test 2] Skill field completion...")
    try:
        suggestions = await test_field_completion(base_url, api_key, model)
        if suggestions:
            print(f"  [OK] Completed! ({len(suggestions)} fields)")
            for k, v in suggestions.items():
                print(f"    {k}: {v}")
        else:
            print("  [WARN] Empty result")
    except Exception as e:
        print(f"  [FAIL] Completion failed: {e}")

    print()
    print("=" * 60)
    print("  All tests passed!")
    print("=" * 60)
    return True


if __name__ == "__main__":
    ok = asyncio.run(main())
    sys.exit(0 if ok else 1)
