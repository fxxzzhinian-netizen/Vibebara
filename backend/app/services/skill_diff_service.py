"""
skill_diff_service — 把原生 Skill 目录解析为内存抽象包，并与基线抽象包对比，
生成"平台抽象层"维度的结构化改动点。

不写盘、不碰 DB，供手动推送(push)流程计算 diff 使用。
抽象包结构与 skill.config.yaml + SKILL.md 对齐：
    {
      "config": {...},        # name/description/ui/policy/metadata/dependencies
      "vibeh_body": "...",    # 正文 Markdown（来自 SKILL.md body）
      "resources": {          # scripts/references/assets 相对路径 -> 文件 sha256
         "scripts/foo.py": "<sha256>", ...
      }
    }
"""

import difflib
import hashlib
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.services.native_skill_store import _parse_skill_md, _read_yaml

# 纳入对比的抽象层字段白名单：点号路径 -> 中文 label
_FIELD_LABELS: Dict[str, str] = {
    "name": "名称",
    "description": "描述",
    "ui.display_name": "显示名称",
    "ui.short_description": "简短描述",
    "ui.brand_color": "品牌色",
    "ui.default_prompt": "默认提示词",
    "ui.icon_small": "小图标",
    "ui.icon_large": "大图标",
    "policy.auto_invoke": "自动调用",
    "metadata.version": "版本",
    "metadata.author": "作者",
    "metadata.license": "许可证",
    "metadata.tags": "标签",
    "dependencies.tools": "依赖工具",
    "dependencies.skills": "依赖 Skills",
}

_CATEGORY_LABELS = {
    "scripts": "脚本",
    "references": "引用",
    "assets": "资源",
}

_CHANGE_LABELS = {
    "added": "新增",
    "removed": "删除",
    "modified": "修改",
}

_BODY_DIFF_MAX_LINES = 40


def _normalize_body_lines(text: str) -> List[str]:
    """
    把正文规整为「逐行可比」的列表，消除与真实改动无关的噪声差异：
      - 去除 UTF-8 BOM
      - 统一换行符（CRLF / CR -> LF）
      - 去掉每行尾部空白（含 Markdown 两空格软换行 / Tab）
      - 去掉文件末尾的空行（不同的结尾空行数量不应算作改动）

    这样 difflib（标准 LCS 引擎）对比的就是「实质内容」，
    与 git/编辑器看到的改动行数一致，避免出现整篇被判为改动的虚高计数。
    """
    if not text:
        return []
    text = text.lstrip("\ufeff")
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = [ln.rstrip() for ln in text.split("\n")]
    while lines and lines[-1] == "":
        lines.pop()
    return lines


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    digest.update(path.read_bytes())
    return digest.hexdigest()


def _scan_resource_hashes(skill_dir: Path) -> Dict[str, str]:
    """扫描 scripts/references/assets，返回 {相对路径: sha256}。"""
    result: Dict[str, str] = {}
    for category in ("scripts", "references", "assets"):
        sub = skill_dir / category
        if not sub.is_dir():
            continue
        for f in sorted(sub.rglob("*")):
            if f.is_file():
                rel = f.relative_to(skill_dir).as_posix()
                result[rel] = _sha256_file(f)
    return result


def parse_native_skill(
    install_path: str, origin: Optional[str] = None
) -> Dict[str, Any]:
    """
    把一个原生 Cursor/Codex Skill 目录解析为内存抽象包。

    复用 native_skill_store 的解析 helper，但不写盘、不碰 DB、不调用 LLM。
    """
    src = Path(install_path)
    skill_md = src / "SKILL.md"
    if not skill_md.exists():
        raise FileNotFoundError(f"No SKILL.md found at {install_path}")

    frontmatter, body = _parse_skill_md(skill_md)

    config: Dict[str, Any] = {
        "name": frontmatter.get("name", src.name),
        "description": frontmatter.get("description", ""),
    }

    if frontmatter.get("disable-model-invocation") is True:
        config["policy"] = {"auto_invoke": False}

    if frontmatter.get("metadata", {}).get("surfaces"):
        config.setdefault("metadata", {})["surfaces"] = frontmatter["metadata"]["surfaces"]

    openai_yaml_path = src / "agents" / "openai.yaml"
    if openai_yaml_path.exists():
        oa = _read_yaml(openai_yaml_path)
        interface = oa.get("interface", {})
        ui: Dict[str, Any] = {}
        for key in (
            "display_name",
            "short_description",
            "brand_color",
            "icon_small",
            "icon_large",
            "default_prompt",
        ):
            if interface.get(key):
                ui[key] = interface[key]
        if ui:
            config["ui"] = ui

        policy = oa.get("policy", {})
        if "allow_implicit_invocation" in policy:
            config.setdefault("policy", {})["auto_invoke"] = policy["allow_implicit_invocation"]

        deps_tools = oa.get("dependencies", {}).get("tools")
        if deps_tools:
            config.setdefault("dependencies", {})["tools"] = deps_tools

    return {
        "config": config,
        "vibeh_body": body,
        "resources": _scan_resource_hashes(src),
    }


def _get_path(config: Dict[str, Any], dotted: str) -> Any:
    """按点号路径从嵌套 dict 取值，缺失返回 None。"""
    cur: Any = config
    for part in dotted.split("."):
        if not isinstance(cur, dict):
            return None
        cur = cur.get(part)
    return cur


def _resource_label(rel_path: str) -> str:
    category = rel_path.split("/", 1)[0]
    return _CATEGORY_LABELS.get(category, "资源")


def diff_abstract_packages(
    base: Optional[Dict[str, Any]], current: Dict[str, Any]
) -> List[Dict[str, Any]]:
    """
    对比两个抽象包，返回结构化改动点列表。

    改动点 kind:
      - field：标量/简单字段变化 {path,label,old,new}
      - body：SKILL.md 正文变化 {added_lines,removed_lines,diff,diff_truncated}
      - resource：资源文件增删改 {path,label,change}
    """
    items: List[Dict[str, Any]] = []

    base_cfg = (base or {}).get("config", {}) or {}
    cur_cfg = current.get("config", {}) or {}

    for dotted, label in _FIELD_LABELS.items():
        old = _get_path(base_cfg, dotted)
        new = _get_path(cur_cfg, dotted)
        if old != new:
            items.append(
                {
                    "kind": "field",
                    "path": dotted,
                    "label": label,
                    "old": old,
                    "new": new,
                }
            )

    base_body = (base or {}).get("vibeh_body", "") or ""
    cur_body = current.get("vibeh_body", "") or ""
    base_lines = _normalize_body_lines(base_body)
    cur_lines = _normalize_body_lines(cur_body)
    if base_lines != cur_lines:
        added = 0
        removed = 0
        diff_lines: List[str] = []
        for line in difflib.unified_diff(base_lines, cur_lines, lineterm=""):
            if line.startswith("+++") or line.startswith("---"):
                continue
            if line.startswith("+"):
                added += 1
            elif line.startswith("-"):
                removed += 1
            diff_lines.append(line)
        items.append(
            {
                "kind": "body",
                "path": "SKILL.md",
                "label": "正文",
                "added_lines": added,
                "removed_lines": removed,
                "diff": "\n".join(diff_lines[:_BODY_DIFF_MAX_LINES]),
                "diff_truncated": len(diff_lines) > _BODY_DIFF_MAX_LINES,
            }
        )

    base_res = (base or {}).get("resources", {}) or {}
    cur_res = current.get("resources", {}) or {}
    for rel_path in sorted(set(base_res) | set(cur_res)):
        b = base_res.get(rel_path)
        c = cur_res.get(rel_path)
        if b == c:
            continue
        if b is None:
            change = "added"
        elif c is None:
            change = "removed"
        else:
            change = "modified"
        items.append(
            {
                "kind": "resource",
                "path": rel_path,
                "label": _resource_label(rel_path),
                "change": change,
            }
        )

    return items


def summarize_changes(items: List[Dict[str, Any]]) -> str:
    """把改动点列表汇总为一句中文摘要。"""
    if not items:
        return "无改动"

    parts: List[str] = []

    body = next((i for i in items if i["kind"] == "body"), None)
    if body:
        parts.append(
            f"修改正文(+{body.get('added_lines', 0)}/-{body.get('removed_lines', 0)})"
        )

    field_labels = [i["label"] for i in items if i["kind"] == "field"]
    if field_labels:
        shown = "、".join(field_labels[:3])
        if len(field_labels) > 3:
            shown += f" 等{len(field_labels)}项"
        parts.append(f"更新{shown}")

    res_counts: Dict[str, int] = {}
    for i in items:
        if i["kind"] == "resource":
            res_counts[i["change"]] = res_counts.get(i["change"], 0) + 1
    for change, count in res_counts.items():
        parts.append(f"{_CHANGE_LABELS.get(change, change)} {count} 个文件")

    return "，".join(parts) if parts else "无改动"
