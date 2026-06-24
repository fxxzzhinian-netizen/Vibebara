"""
skill_merge_service — Skill 推送冲突的 AI 三方合并。

对 base（A 上次同步态） / mine（A 本地工作副本） / theirs（团队仓库最新，含他人改动）
三方抽象包做合并：
- SKILL.md 正文（vibeh_body）：真三方合并（三方全文均可得）。
- 配置字段（config 白名单）：字段级三方合并，双边冲突字段交 LLM 裁决。
- 文本资源文件：用三方 hash 判定增/删/改，单边改直接采纳，双边都改的文本做 LLM
  二方合并（base 资源内容未入快照，故退化为二方），二进制双改列为「需手动处理」。

LLM 经 app.services.llm 抽象层调用；未配置 Key / 调用失败 / 输出非法一律降级（保留
mine 并记 notes），绝不抛错。本模块**不写盘、不碰 DB**，纯计算，便于复用与单测。

设计见 docs/design/ai-assisted-merge.md。
"""

import json
import logging
from typing import Any, Dict, List, Optional, Tuple

from app.services.llm import ChatMessage, get_provider

logger = logging.getLogger(__name__)

# 纳入配置合并的白名单字段（点号路径）。与 skill_diff_service._FIELD_LABELS 对齐，
# 但剔除 name（团队 id 不可变）与 metadata.tags（parse_native_skill 不解析、永不 diff）。
_CONFIG_FIELDS: List[str] = [
    "description",
    "ui.display_name",
    "ui.short_description",
    "ui.brand_color",
    "ui.default_prompt",
    "ui.icon_small",
    "ui.icon_large",
    "policy.auto_invoke",
    "metadata.version",
    "metadata.author",
    "metadata.license",
    "dependencies.tools",
    "dependencies.skills",
]

# 送 LLM 的内容上限（字符）：超限则降级为手动处理，避免超 token / 高费用。
_MAX_BODY_CHARS = 16000
_MAX_RESOURCE_CHARS = 12000


# ---------------------------------------------------------------------------
# 取值 / 设值（点号路径）
# ---------------------------------------------------------------------------

def _get_path(config: Dict[str, Any], dotted: str) -> Any:
    cur: Any = config or {}
    for part in dotted.split("."):
        if not isinstance(cur, dict):
            return None
        cur = cur.get(part)
    return cur


def _set_path(config: Dict[str, Any], dotted: str, value: Any) -> None:
    parts = dotted.split(".")
    cur = config
    for part in parts[:-1]:
        nxt = cur.get(part)
        if not isinstance(nxt, dict):
            nxt = {}
            cur[part] = nxt
        cur = nxt
    cur[parts[-1]] = value


def _is_text(entry: Optional[Dict[str, Any]]) -> bool:
    return bool(entry) and (entry.get("encoding") or "utf8") == "utf8"


# ---------------------------------------------------------------------------
# LLM 调用（best-effort，失败返回 (fallback, False)）
# ---------------------------------------------------------------------------

_BODY_MERGE_SYSTEM = """\
你是一个资深的版本合并工具。用户会给你同一份 Markdown 文档的三个版本：
- BASE：共同祖先
- MINE：我方改动
- THEIRS：他方改动
请产出一份**三方合并**后的 Markdown：同时保留 MINE 与 THEIRS 各自相对 BASE 的有效改动，
语义冲突处取更完整、合理的表述并尽量都保留信息；不要臆造 BASE/MINE/THEIRS 中不存在的内容。

严格要求：只输出合并后的 Markdown 正文本身，不要任何解释、前后缀或 ``` 代码围栏。
"""

_RESOURCE_MERGE_SYSTEM = """\
你是一个资深的代码/文本合并工具。用户会给你同一个文件的两个版本（MINE 与 THEIRS），
请产出一份合并后的内容：尽量同时保留两边的有效改动，避免重复，保持语法/格式正确。

严格要求：只输出合并后的文件内容本身，不要任何解释、前后缀或 ``` 代码围栏。
"""

_CONFIG_MERGE_SYSTEM = """\
你是一个配置项冲突裁决器。用户会给你若干配置字段，每个字段含 BASE/MINE/THEIRS 三个值
（MINE 与 THEIRS 都相对 BASE 做了不同改动）。请为每个字段裁决出一个最合理的最终值：
能合并则合并（如文本类描述），否则在 MINE 与 THEIRS 中择优。

严格输出 JSON 对象，键为字段路径，值为该字段的最终值，例如：
{"description": "合并后的描述", "policy.auto_invoke": true}
不要输出 JSON 以外的任何字符。
"""


def _strip_fences(text: str) -> str:
    t = (text or "").strip()
    if t.startswith("```"):
        t = t.strip("`")
        # 去掉可能的语言标注首行
        if "\n" in t:
            first, rest = t.split("\n", 1)
            if first.strip().isalpha():
                t = rest
        t = t.strip()
    return t


async def _llm_merge_text(system: str, mine: str, theirs: str, base: Optional[str]) -> Tuple[str, bool]:
    """三方/二方文本合并。base 为 None 时按二方处理。失败返回 (mine, False)。"""
    provider = get_provider()
    if not provider.is_configured():
        return mine, False
    payload: Dict[str, str] = {"MINE": mine, "THEIRS": theirs}
    if base is not None:
        payload["BASE"] = base
    user = json.dumps(payload, ensure_ascii=False)
    try:
        result = await provider.chat(
            [
                ChatMessage(role="system", content=system),
                ChatMessage(role="user", content=user),
            ],
            temperature=0.2,
            max_tokens=4000,
        )
        merged = _strip_fences(result.content or "")
        if not merged:
            return mine, False
        return merged, True
    except Exception as e:  # noqa: BLE001 - best-effort 降级
        logger.warning(f"[merge] 文本合并失败，降级保留 mine: {e}")
        return mine, False


async def _llm_resolve_config(conflicts: List[Dict[str, Any]]) -> Tuple[Dict[str, Any], bool]:
    """批量裁决冲突配置字段。返回 ({path: value}, ok)；失败返回 ({}, False)。"""
    provider = get_provider()
    if not provider.is_configured() or not conflicts:
        return {}, False
    user = json.dumps({"fields": conflicts}, ensure_ascii=False)
    try:
        result = await provider.chat(
            [
                ChatMessage(role="system", content=_CONFIG_MERGE_SYSTEM),
                ChatMessage(role="user", content=user),
            ],
            temperature=0.1,
            max_tokens=800,
        )
        parsed = json.loads(_strip_fences(result.content or "{}"))
        if isinstance(parsed, dict):
            return parsed, True
        return {}, False
    except Exception as e:  # noqa: BLE001
        logger.warning(f"[merge] 配置裁决失败，降级保留 mine: {e}")
        return {}, False


# ---------------------------------------------------------------------------
# 三方合并主流程
# ---------------------------------------------------------------------------

async def merge_three_way(
    base_pkg: Optional[Dict[str, Any]],
    mine_pkg: Dict[str, Any],
    theirs_pkg: Dict[str, Any],
    mine_res_contents: Dict[str, Dict[str, Any]],
    theirs_res_contents: Dict[str, Dict[str, Any]],
) -> Dict[str, Any]:
    """对三方抽象包做合并，返回合并稿与元信息。

    返回结构：
        {
          "body": str,                       # 合并后的 SKILL.md 正文
          "config": {...},                   # 合并后的白名单配置字段（嵌套）
          "resource_ops": [                  # 资源处置（apply 以 mine 树为基底应用）
            {"path","action","encoding"?,"content"?}
          ],
          "manual_conflicts": [{"path","reason"}],
          "notes": [str],
          "merge_available": bool,           # LLM 是否就绪（false 表示有降级）
        }
    """
    notes: List[str] = []
    manual_conflicts: List[Dict[str, str]] = []
    degraded = False

    provider = get_provider()
    llm_ready = provider.is_configured()

    base_cfg = (base_pkg or {}).get("config", {}) or {}
    mine_cfg = mine_pkg.get("config", {}) or {}
    theirs_cfg = theirs_pkg.get("config", {}) or {}

    base_body = (base_pkg or {}).get("vibeh_body", "") or ""
    mine_body = mine_pkg.get("vibeh_body", "") or ""
    theirs_body = theirs_pkg.get("vibeh_body", "") or ""

    # ---- 正文三方合并 ----
    if mine_body == theirs_body:
        merged_body = mine_body
    elif mine_body == base_body:
        merged_body = theirs_body
    elif theirs_body == base_body:
        merged_body = mine_body
    else:
        if max(len(mine_body), len(theirs_body), len(base_body)) > _MAX_BODY_CHARS:
            merged_body = mine_body
            degraded = True
            notes.append("SKILL.md 正文过大，未做 AI 合并，已保留你的版本，请手动核对")
        else:
            merged_body, ok = await _llm_merge_text(
                _BODY_MERGE_SYSTEM, mine_body, theirs_body, base_body
            )
            if ok:
                notes.append("SKILL.md 正文已 AI 三方合并")
            else:
                degraded = True
                notes.append("SKILL.md 正文 AI 合并不可用，已保留你的版本，请手动核对")

    # ---- 配置字段三方合并 ----
    merged_config: Dict[str, Any] = {}
    conflicts: List[Dict[str, Any]] = []
    for path in _CONFIG_FIELDS:
        b = _get_path(base_cfg, path)
        m = _get_path(mine_cfg, path)
        t = _get_path(theirs_cfg, path)
        if m == t:
            resolved = m
        elif m == b:
            resolved = t  # 仅 theirs 改
        elif t == b:
            resolved = m  # 仅 mine 改
        else:
            # 双边冲突：先占位 mine，待 LLM 裁决覆盖
            conflicts.append({"path": path, "base": b, "mine": m, "theirs": t})
            resolved = m
        if resolved is not None:
            _set_path(merged_config, path, resolved)

    if conflicts:
        resolved_map, ok = await _llm_resolve_config(conflicts)
        for c in conflicts:
            path = c["path"]
            if ok and path in resolved_map and resolved_map[path] is not None:
                _set_path(merged_config, path, resolved_map[path])
                notes.append(f"配置字段「{path}」已 AI 裁决合并")
            else:
                degraded = degraded or not ok
                notes.append(f"配置字段「{path}」冲突，已保留你的值")

    # ---- 文本资源三方处置 ----
    base_res = (base_pkg or {}).get("resources", {}) or {}
    mine_res = mine_pkg.get("resources", {}) or {}
    theirs_res = theirs_pkg.get("resources", {}) or {}
    resource_ops: List[Dict[str, Any]] = []

    for path in sorted(set(mine_res) | set(theirs_res) | set(base_res)):
        b = base_res.get(path)
        m = mine_res.get(path)
        t = theirs_res.get(path)
        m_changed = m != b
        t_changed = t != b

        if not m_changed and not t_changed:
            if m is not None:
                resource_ops.append({"path": path, "action": "use_mine"})
            continue
        if m_changed and not t_changed:
            resource_ops.append(
                {"path": path, "action": "delete" if m is None else "use_mine"}
            )
            continue
        if t_changed and not m_changed:
            resource_ops.append(
                {"path": path, "action": "delete" if t is None else "use_theirs"}
            )
            continue

        # 双边都改
        if m == t:
            resource_ops.append({"path": path, "action": "use_mine"})
            continue
        if m is None and t is None:
            continue  # 双删
        if m is None or t is None:
            manual_conflicts.append({"path": path, "reason": "一方删除、一方修改"})
            resource_ops.append(
                {"path": path, "action": "use_mine" if m is not None else "use_theirs"}
            )
            continue

        mine_entry = mine_res_contents.get(path)
        theirs_entry = theirs_res_contents.get(path)
        if _is_text(mine_entry) and _is_text(theirs_entry):
            mine_text = mine_entry.get("content", "") if mine_entry else ""
            theirs_text = theirs_entry.get("content", "") if theirs_entry else ""
            if max(len(mine_text), len(theirs_text)) > _MAX_RESOURCE_CHARS:
                degraded = True
                manual_conflicts.append({"path": path, "reason": "文件过大，未做 AI 合并"})
                resource_ops.append({"path": path, "action": "use_mine"})
                continue
            merged_text, ok = await _llm_merge_text(
                _RESOURCE_MERGE_SYSTEM, mine_text, theirs_text, None
            )
            if ok:
                resource_ops.append(
                    {
                        "path": path,
                        "action": "write_text",
                        "encoding": "utf8",
                        "content": merged_text,
                    }
                )
                notes.append(f"资源「{path}」已 AI 合并")
            else:
                degraded = True
                manual_conflicts.append({"path": path, "reason": "AI 合并不可用，已保留你的版本"})
                resource_ops.append({"path": path, "action": "use_mine"})
        else:
            manual_conflicts.append({"path": path, "reason": "二进制文件双边修改"})
            resource_ops.append({"path": path, "action": "use_theirs"})

    return {
        "body": merged_body,
        "config": merged_config,
        "resource_ops": resource_ops,
        "manual_conflicts": manual_conflicts,
        "notes": notes,
        "merge_available": llm_ready and not degraded,
    }
