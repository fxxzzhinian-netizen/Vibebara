"""
LLM Service — 大模型业务能力（统一经 Provider 抽象层调用）

默认厂商为「百炼」（阿里云 DashScope 兼容模式），切换厂商只需改配置，
本模块不再直接耦合具体 SDK / base_url，统一通过 ``app.services.llm`` 抽象层。

当前用途：
- 在 Skill 部署前，补齐从其他平台导入时缺失的字段
- 连通性测试
"""

import json
import logging
from typing import Any, Dict, List, Optional

from app.services.llm import ChatMessage, get_provider, reset_provider

logger = logging.getLogger(__name__)


def reset_client() -> None:
    """重置底层 Provider（配置变更后调用）。"""
    reset_provider()


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


# ----------------------------------------------------------------------------
# Skill 标签自动分类
# ----------------------------------------------------------------------------

#: 固定中文标签词表。LLM 只能从该列表中选择，便于卡片渲染统一与筛选；
#: 词表可按需增删（保持简短、互斥度高）。
SKILL_TAG_VOCAB: List[str] = [
    "代码生成",
    "代码审查",
    "测试",
    "调试",
    "重构",
    "文档",
    "前端",
    "后端",
    "数据",
    "DevOps",
    "安全",
    "通用",
]

TAG_CLASSIFY_SYSTEM_PROMPT = """\
你是一个 AI Coding Skill 分类专家。用户会给你一个 skill 的 name、description 和正文摘要。
请从下面这个**固定标签列表**中，选出 1-3 个最贴切的标签来描述该 skill 的核心用途。

固定标签列表（只能从中选择，禁止自创标签）：
{vocab}

规则：
- 至少选 1 个，至多选 3 个；按相关度从高到低排列。
- 只能使用列表中**一字不差**的标签，不要翻译、改写或新增。
- 如果实在无法归类，返回 ["通用"]。

返回严格 JSON 格式，不要附加任何解释，例如：
{{"tags": ["代码审查", "测试"]}}
"""


def _validate_tags(raw_tags: Any, max_tags: int) -> List[str]:
    """将 LLM 输出的标签与词表求交集（保序去重），并截断到 max_tags。

    任意非法/越界/空输入都安全降级为 []，由调用方决定是否回退。
    """
    if not isinstance(raw_tags, (list, tuple)):
        return []
    vocab = set(SKILL_TAG_VOCAB)
    seen: set = set()
    out: List[str] = []
    for item in raw_tags:
        if not isinstance(item, str):
            continue
        tag = item.strip()
        if tag in vocab and tag not in seen:
            seen.add(tag)
            out.append(tag)
        if len(out) >= max_tags:
            break
    return out


async def classify_skill_tags(
    name: str,
    description: str,
    body_preview: str,
    *,
    max_tags: int = 3,
) -> List[str]:
    """调用 LLM 从固定词表中为 skill 选出 1-3 个标签。

    best-effort：未配置 API Key / 调用失败 / 输出非法，一律返回 []，绝不抛错。
    """
    provider = get_provider()
    if not provider.is_configured():
        logger.warning("[LLM] API Key 未配置，跳过标签分类")
        return []

    user_message = json.dumps(
        {
            "name": name or "",
            "description": description or "",
            "body_preview": (body_preview or "")[:500],
        },
        ensure_ascii=False,
        indent=2,
    )
    system_prompt = TAG_CLASSIFY_SYSTEM_PROMPT.format(
        vocab=json.dumps(SKILL_TAG_VOCAB, ensure_ascii=False)
    )

    try:
        result = await provider.chat(
            [
                ChatMessage(role="system", content=system_prompt),
                ChatMessage(role="user", content=user_message),
            ],
            temperature=0.2,
            max_tokens=120,
        )
        content = (result.content or "").strip()
        parsed = json.loads(content)
        raw_tags = parsed.get("tags") if isinstance(parsed, dict) else parsed
        tags = _validate_tags(raw_tags, max_tags)
        logger.info(f"[LLM] 标签分类: name={name!r} → {tags}")
        return tags
    except Exception as e:
        logger.error(f"[LLM] 标签分类失败: {e}")
        return []


async def test_connection() -> Dict[str, Any]:
    """测试 LLM API 连通性"""
    provider = get_provider()
    if not provider.is_configured():
        return {
            "success": False,
            "error": "LLM_API_KEY 未配置",
            "provider": provider.name,
            "model": provider.model,
            "base_url": provider.base_url,
        }

    try:
        result = await provider.chat(
            [ChatMessage(role="user", content="你好")],
            max_tokens=50,
        )
        usage_info = None
        if result.usage:
            usage_info = {
                "prompt_tokens": result.usage.prompt_tokens,
                "completion_tokens": result.usage.completion_tokens,
                "total_tokens": result.usage.total_tokens,
            }
        logger.info(f"[LLM] 连通性测试成功: provider={provider.name} model={result.model}")
        return {
            "success": True,
            "provider": provider.name,
            "model": result.model,
            "base_url": provider.base_url,
            "response": result.content,
            "usage": usage_info,
        }
    except Exception as e:
        logger.error(f"[LLM] 连通性测试失败: {e}")
        return {
            "success": False,
            "error": str(e),
            "provider": provider.name,
            "model": provider.model,
            "base_url": provider.base_url,
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

    provider = get_provider()
    if not provider.is_configured():
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
        result = await provider.chat(
            [
                ChatMessage(role="system", content=COMPLETE_SYSTEM_PROMPT),
                ChatMessage(role="user", content=user_message),
            ],
            temperature=0.3,
            max_tokens=500,
        )

        content = result.content or "{}"
        parsed = json.loads(content)
        logger.info(f"[LLM] 补齐 {len(parsed)} 个字段: {list(parsed.keys())}")
        return parsed

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
