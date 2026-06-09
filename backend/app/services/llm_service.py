"""
LLM Service — 通过 GPTs API Gateway 调用大模型能力

当前用途：
- 在 Skill 部署前，补齐从其他平台导入时缺失的字段
- 连通性测试
"""

import json
import logging
from typing import Any, Dict, List, Optional

from openai import AsyncOpenAI

from app.core.config import settings

logger = logging.getLogger(__name__)

_client: Optional[AsyncOpenAI] = None


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(
            base_url=settings.LLM_BASE_URL + "/v1",
            api_key=settings.LLM_API_KEY,
            timeout=60.0,
        )
    return _client


def reset_client() -> None:
    """重置客户端（配置变更后调用）"""
    global _client
    _client = None


COMPLETE_SYSTEM_PROMPT = """\
你是一个 AI Coding Skill 元数据专家。用户会给你一个 skill 的核心信息（name、description、正文摘要），
以及一组需要补齐的字段名。请根据已有信息推断并生成这些缺失字段的值。

规则：
- ui.display_name：基于 name 生成人类友好的标题（Title Case），例如 "test-helper" → "Test Helper"
- ui.short_description：25-64 字符的简短摘要，概括 skill 的核心能力
- ui.default_prompt：用户调用该 skill 时的默认提示词，必须包含 $<name> 引用，格式为 "Use $<name> to ..."
- ui.brand_color：根据 skill 主题选择合适的品牌色（HEX 格式，如 "#3B82F6"）

返回严格 JSON 格式，只包含被要求补齐的字段，不要附加解释。
示例返回：
{
  "ui.display_name": "Test Helper",
  "ui.short_description": "Validate skill loading, scripts, and assets.",
  "ui.default_prompt": "Use $test-helper to run a full bundled-resource skill validation."
}
"""


async def test_connection() -> Dict[str, Any]:
    """测试 LLM API 连通性"""
    if not settings.LLM_API_KEY:
        return {
            "success": False,
            "error": "LLM_API_KEY 未配置",
            "model": settings.LLM_MODEL,
            "base_url": settings.LLM_BASE_URL,
        }

    try:
        client = _get_client()
        response = await client.chat.completions.create(
            model=settings.LLM_MODEL,
            messages=[{"role": "user", "content": "你好"}],
            max_tokens=50,
        )
        content = response.choices[0].message.content or ""
        usage_info = None
        if response.usage:
            usage_info = {
                "prompt_tokens": response.usage.prompt_tokens,
                "completion_tokens": response.usage.completion_tokens,
                "total_tokens": response.usage.total_tokens,
            }
        logger.info(f"[LLM] 连通性测试成功: model={settings.LLM_MODEL}")
        return {
            "success": True,
            "model": settings.LLM_MODEL,
            "base_url": settings.LLM_BASE_URL,
            "response": content,
            "usage": usage_info,
        }
    except Exception as e:
        logger.error(f"[LLM] 连通性测试失败: {e}")
        return {
            "success": False,
            "error": str(e),
            "model": settings.LLM_MODEL,
            "base_url": settings.LLM_BASE_URL,
        }


async def complete_skill_fields(
    skill_config: Dict[str, Any],
    body_preview: str,
    incomplete_fields: List[str],
) -> Dict[str, str]:
    """
    调用 LLM 补齐 skill 的缺失字段。

    Args:
        skill_config: 当前 skill.config.yaml 的内容（design-doc 格式）
        body_preview: SKILL.md 正文的前 500 字符
        incomplete_fields: 需要补齐的字段路径列表，如 ["ui.display_name", "ui.short_description"]

    Returns:
        dict: 字段路径 → 建议值的映射
    """
    if not incomplete_fields:
        return {}

    if not settings.LLM_API_KEY:
        logger.warning("[LLM] API Key 未配置，跳过字段补齐")
        return {}

    user_message = json.dumps(
        {
            "name": skill_config.get("name", ""),
            "description": skill_config.get("description", ""),
            "body_preview": body_preview[:500],
            "incomplete_fields": incomplete_fields,
        },
        ensure_ascii=False,
        indent=2,
    )

    try:
        client = _get_client()
        response = await client.chat.completions.create(
            model=settings.LLM_MODEL,
            messages=[
                {"role": "system", "content": COMPLETE_SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
            temperature=0.3,
            max_tokens=500,
        )

        content = response.choices[0].message.content or "{}"
        result = json.loads(content)
        logger.info(f"[LLM] 补齐 {len(result)} 个字段: {list(result.keys())}")
        return result

    except Exception as e:
        logger.error(f"[LLM] 调用失败: {e}")
        return {}


def detect_incomplete_fields(
    config: Dict[str, Any],
    source: Optional[str] = None,
) -> List[str]:
    """
    检测 skill.config.yaml 中需要补齐的字段（design-doc 格式）。

    根据来源平台判断哪些字段必然缺失：
    - 从 Cursor 导入：ui.* 全部缺失
    - 从 Codex 导入：通常较完整
    - 通用：检查所有关键字段是否为空
    """
    missing: List[str] = []
    ui = config.get("ui", {})

    if not ui.get("display_name"):
        missing.append("ui.display_name")
    if not ui.get("short_description"):
        missing.append("ui.short_description")
    if not ui.get("default_prompt"):
        missing.append("ui.default_prompt")

    return missing
