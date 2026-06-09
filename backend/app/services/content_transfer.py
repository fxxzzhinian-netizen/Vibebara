"""content_transfer — 薄代理编排（M4 云端编排端点）的文件载荷与目录互转工具。

方案 B「桌面客户端」迁移里，云端不再读写「后端机器磁盘」上的用户部署目录：
- 落盘交由本地代理 `POST /local/write-skill`；
- 读取交由本地代理 `POST /local/read-folder` 上传 `files[]`。

本模块只做**纯函数**级别的内容搬运，便于无 DB / 无 Node 单测：

1. `write_files(dest_dir, items)` —— 把 `FilePayload`（M0 契约 §4.5：utf8 文本 /
   base64 二进制）**逐字节忠实**落到临时目录（不做 CRLF/LF 归一、不做权限改写），
   供 push / import-content 在临时目录重建后复用既有 `parse_native_skill` /
   `import_from_external` 解析逻辑。
2. `collect_store_resources(store_path)` —— 把云端 Store 的 scripts/references/
   assets 资源（含二进制）编码为 `CloudResourceItem`（默认 inline），随构建产物
   下发给前端再转交 write-skill（补齐 M0 §2.4「构建产物 contents 仅文本」缺口）。
3. `build_install_tree(dest_dir, contents, resources)` —— 用构建产物 contents（文本）
   + Store 资源在临时目录重建出「install 目录等价物」，供云端从产物直接生成
   abstract_snapshot（M0 §3.1 / 分歧 D4 选项 A：deploy/pull 免本地回传）。

安全：所有相对路径经 `_safe_join` 规整，禁止 `..` / 绝对路径逃逸到 `dest_dir` 之外
（云端接收上传内容的写临时目录环节）。
"""

import base64
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Union

# 文件内容编码（与 M0 契约 ContentEncoding 对齐）
ENCODING_UTF8 = "utf8"
ENCODING_BASE64 = "base64"

# 资源归集范围：与 native_skill_store.deploy 落盘时复制的子目录一致
RESOURCE_CATEGORIES = ("scripts", "references", "assets")

FilePayloadLike = Union[Dict[str, Any], Any]


def _as_payload_dict(item: FilePayloadLike) -> Dict[str, Any]:
    """把 pydantic 模型 / 普通对象 / dict 统一成 {path, encoding, content} dict。"""
    if isinstance(item, dict):
        return item
    if hasattr(item, "model_dump"):
        return item.model_dump()
    return {
        "path": getattr(item, "path", ""),
        "encoding": getattr(item, "encoding", ENCODING_UTF8),
        "content": getattr(item, "content", ""),
    }


def _safe_join(base: Path, rel_path: str) -> Path:
    """把相对 POSIX 路径安全拼接到 base 之下，阻断 `..` / 绝对路径逃逸。"""
    if not rel_path or not str(rel_path).strip():
        raise ValueError("文件相对路径为空")
    # 统一分隔符为 '/'，去掉前导斜杠（绝对路径）与盘符
    normalized = str(rel_path).replace("\\", "/").lstrip("/")
    if not normalized:
        raise ValueError(f"非法文件路径: {rel_path!r}")
    candidate = (base / normalized)
    base_res = base.resolve()
    cand_res = candidate.resolve()
    if cand_res != base_res and base_res not in cand_res.parents:
        raise ValueError(f"文件路径逃逸出目标目录: {rel_path!r}")
    return candidate


def _decode_payload_bytes(encoding: str, content: str) -> bytes:
    """按编码把载荷内容还原为原始字节（忠实落盘的关键）。"""
    if encoding == ENCODING_BASE64:
        return base64.b64decode(content or "")
    if encoding == ENCODING_UTF8:
        # UTF-8 无 BOM、保留原始换行（不做 CRLF<->LF 归一）；用 bytes 写避免
        # 文本模式的换行翻译，保证两端 hash 位级一致（M0 §4.5 / §7.4）。
        return (content or "").encode("utf-8")
    raise ValueError(f"不支持的内容编码: {encoding!r}")


def write_files(dest_dir: Path, items: Iterable[FilePayloadLike]) -> List[str]:
    """把一组文件载荷忠实写入 dest_dir，返回已写入的相对路径列表（POSIX）。

    每项形如 {"path": "assets/icon.png", "encoding": "base64"|"utf8", "content": "..."}。
    """
    dest_dir.mkdir(parents=True, exist_ok=True)
    written: List[str] = []
    for raw in items:
        payload = _as_payload_dict(raw)
        rel = payload.get("path", "")
        encoding = payload.get("encoding", ENCODING_UTF8) or ENCODING_UTF8
        content = payload.get("content", "")
        target = _safe_join(dest_dir, rel)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(_decode_payload_bytes(encoding, content))
        written.append(str(rel).replace("\\", "/").lstrip("/"))
    return written


def _encode_bytes(data: bytes) -> Dict[str, str]:
    """把原始字节编码为载荷：可 UTF-8 解码 → utf8 文本；否则 → base64。

    UTF-8 解码再 encode 是无损往返，故文本资源用 utf8 安全且体积更小；二进制用
    base64 精确还原。判定口径与本地代理 read-folder（M0 §4.5）一致。
    """
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        return {"encoding": ENCODING_BASE64, "content": base64.b64encode(data).decode("ascii")}
    return {"encoding": ENCODING_UTF8, "content": text}


def collect_store_resources(store_path: str) -> List[Dict[str, Any]]:
    """归集 Store 目录下 scripts/references/assets 资源为 CloudResourceItem 列表。

    - 仅纳入这三类资源子目录（与 deploy() 落盘复制范围一致）；root 下的
      skill.config.yaml / SKILL.md / LICENSE 不属于 install 资源，不下发。
    - 排序键用「相对 store_path 的 POSIX 路径 UTF-8 字节序」，与 hash 收敛口径一致，
      保证产物顺序稳定（M0 §7.2）。
    - 默认 transfer=inline；大资源切 url 留后续（M2 决议⑥，契约已预留字段）。
    """
    root = Path(store_path)
    items: List[Dict[str, Any]] = []
    if not root.is_dir():
        return items
    for category in RESOURCE_CATEGORIES:
        sub = root / category
        if not sub.is_dir():
            continue
        files = sorted(
            (p for p in sub.rglob("*") if p.is_file()),
            key=lambda p: p.relative_to(root).as_posix().encode("utf-8"),
        )
        for f in files:
            rel = f.relative_to(root).as_posix()
            data = f.read_bytes()
            enc = _encode_bytes(data)
            items.append(
                {
                    "path": rel,
                    "transfer": "inline",
                    "encoding": enc["encoding"],
                    "content": enc["content"],
                    "size": len(data),
                }
            )
    return items


def build_install_tree(
    dest_dir: Path,
    contents: Dict[str, str],
    resources: Optional[Iterable[FilePayloadLike]] = None,
) -> List[str]:
    """用「构建产物文本 contents + 资源」在 dest_dir 重建出 install 目录等价物。

    供云端从构建产物直接 parse_native_skill 生成 abstract_snapshot（无需本地回传）。
    contents 为 {相对路径: UTF-8 文本}；resources 为 CloudResourceItem（inline）。
    """
    items: List[FilePayloadLike] = [
        {"path": rel, "encoding": ENCODING_UTF8, "content": text}
        for rel, text in (contents or {}).items()
    ]
    for res in (resources or []):
        payload = _as_payload_dict(res)
        # transfer=url 的资源没有 inline content，重建 install 树时跳过（snapshot
        # 不依赖其字节内容；resource hash 在该资源真正落盘后由本地代理算）。
        if payload.get("transfer") == "url" and not payload.get("content"):
            continue
        items.append(payload)
    return write_files(dest_dir, items)
