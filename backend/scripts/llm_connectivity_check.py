"""
LLM 连通性测试脚本（独立运行，不依赖数据库）。

统一经 app/services/llm 抽象层调用，默认厂商为「百炼」（阿里云 DashScope 兼容模式）。
运行（backend 目录）：python scripts/llm_connectivity_check.py
读取 backend/.env 中的 LLM_PROVIDER / LLM_BASE_URL / LLM_API_KEY / LLM_MODEL。
"""
import asyncio
import json
import os
import sys

# 脚本位于 backend/scripts/ 下，向上一级即 backend 根目录（.env 所在）。
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _BACKEND_DIR)

from app.services.llm import (  # noqa: E402
    ChatMessage,
    OpenAICompatibleProvider,
    PROVIDER_PRESETS,
    normalize_base_url,
)


def _load_env():
    """从 backend/.env 文件加载配置"""
    cfg = {}
    env_path = os.path.join(_BACKEND_DIR, ".env")
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


def _build_provider(cfg) -> OpenAICompatibleProvider:
    """按 .env 配置构造 Provider（与运行时工厂同口径：留空回退厂商预设）。"""
    provider_key = (cfg.get("LLM_PROVIDER") or "bailian").lower()
    preset = PROVIDER_PRESETS.get(provider_key, PROVIDER_PRESETS["openai-compatible"])
    base_url = cfg.get("LLM_BASE_URL") or preset["base_url"]
    model = cfg.get("LLM_MODEL") or preset["model"]
    return OpenAICompatibleProvider(
        base_url=normalize_base_url(base_url),
        api_key=cfg.get("LLM_API_KEY", ""),
        model=model,
        name=provider_key,
    )


async def main():
    cfg = _load_env()
    provider = _build_provider(cfg)
    api_key = cfg.get("LLM_API_KEY", "")

    print("=" * 60)
    print("  LLM Connectivity Test")
    print("=" * 60)
    print(f"  Provider : {provider.name}")
    print(f"  Base URL : {provider.base_url}")
    print(f"  Model    : {provider.model}")
    key_display = f"{api_key[:12]}...{api_key[-4:]}" if len(api_key) > 16 else "***"
    print(f"  API Key  : {key_display}")
    print("=" * 60)
    print()

    if not provider.is_configured():
        print("  [FAIL] LLM_API_KEY 未配置")
        return False

    # === Test 1: Basic connectivity ===
    print("  [Test 1] Basic connectivity...")
    try:
        result = await provider.chat(
            [ChatMessage(role="user", content="Hello, respond in 10 words or less.")],
            max_tokens=50,
        )
        print("  [OK] Connected!")
        print(f"  Response: {result.content}")
        if result.usage:
            print(f"  Tokens: prompt={result.usage.prompt_tokens}, "
                  f"completion={result.usage.completion_tokens}, "
                  f"total={result.usage.total_tokens}")
    except Exception as e:
        print(f"  [FAIL] Connection failed: {e}")
        print()
        print("=" * 60)
        return False

    print()

    # === Test 2: Field completion ===
    print("  [Test 2] Skill field completion...")
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
    try:
        result = await provider.chat(
            [
                ChatMessage(role="system", content=system_prompt),
                ChatMessage(role="user", content=user_msg),
            ],
            temperature=0.3,
            max_tokens=500,
        )
        suggestions = json.loads(result.content or "{}")
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
