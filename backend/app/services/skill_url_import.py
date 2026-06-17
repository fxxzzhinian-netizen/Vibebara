"""
skill_url_import — 从远程链接拉取并导入 Skill（GitHub/Gitee/GitLab 仓库或直接归档 URL）。

与「从本地文件夹」两步流程对齐（先解析、再勾选导入），且**全局可复用**（个人 / 团队
仓库共用同一套获取与解析逻辑，仅在落库时按 scope 分流）：

1. ``scan_url(url)``：把源下载到服务端临时缓存目录（按 token 索引），递归发现其中
   所有含 ``SKILL.md`` 的 skill 目录，返回 ``token`` + 解析出的 skill 列表
   （``source_path`` 为「相对扫描根的相对路径」，作为后续导入的选择键）。
2. 导入端复用 ``token`` 定位缓存 → ``resolve_in_cache`` 解析相对路径（带逃逸守卫）→
   调用既有 ``NativeSkillStore`` 导入逻辑（按 scope 落个人 / 团队仓库）。

获取策略（云端镜像默认可能不含 git，故以 HTTP 归档下载为主、git clone 为兜底）：

- 直接归档 URL（``.zip`` / ``.tar.gz`` / ``.tgz``）→ 直接下载解压；
- GitHub 仓库 → GitHub API tarball 端点（自动跟随默认分支，免猜分支）；
- Gitee / GitLab 仓库 → 归档 URL（用显式 ref 或 main/master 候选）；
- 其余 / 自建 Git → ``git clone --depth 1`` 兜底（需运行环境含 git）。

安全：仅允许 http/https；解析主机 IP，拒绝环回 / 私网 / 链路本地 / 保留网段（防 SSRF），
并对每一跳重定向复检；下载大小上限；缓存目录按 TTL 清理。
"""

import asyncio
import ipaddress
import logging
import os
import shutil
import socket
import subprocess
import tarfile
import time
import uuid
import zipfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

from app.core.config import settings
from app.services.native_skill_store import (
    _detect_origin,
    _parse_skill_md,
    _scan_resources,
)

logger = logging.getLogger(__name__)

# 下载与解压上限（防 DoS）：单次归档 ≤ 80MB，解压后 ≤ 300MB / ≤ 20000 文件。
MAX_DOWNLOAD_BYTES = 80 * 1024 * 1024
MAX_EXTRACT_BYTES = 300 * 1024 * 1024
MAX_EXTRACT_FILES = 20000
# 递归发现 skill 目录的最大深度（仓库内 skills/<name>/SKILL.md 这类常见结构足够覆盖）。
MAX_SCAN_DEPTH = 8
# 缓存有效期：解析后 30 分钟内可导入，超时清理。
CACHE_TTL_SECONDS = 30 * 60
# 网络超时（国内服务器拉取 github.com 可能较慢，给足读取时间；连接超时单独收紧）。
HTTP_CONNECT_TIMEOUT_SECONDS = 15.0
HTTP_TIMEOUT_SECONDS = 120.0
GIT_TIMEOUT_SECONDS = 180

_SKIP_DIRS = {
    ".git", ".svn", ".hg", "node_modules", "__pycache__", ".venv", "venv",
    "dist", "build", ".idea", ".vscode", ".github",
}

# token → {"root": 扫描根绝对路径, "base": token 缓存根, "created": ts}
_CACHE: Dict[str, Dict[str, Any]] = {}


# =========================================================================
# 缓存目录
# =========================================================================

def _cache_root() -> Path:
    root = Path(settings.COWORK_DATA_DIR) / "url-import-cache"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _sweep_stale() -> None:
    """清理过期缓存（内存登记 + 磁盘孤儿目录）。"""
    now = time.time()
    for token in list(_CACHE.keys()):
        entry = _CACHE.get(token)
        if not entry:
            continue
        if now - entry.get("created", 0) > CACHE_TTL_SECONDS:
            _remove_dir(entry.get("base"))
            _CACHE.pop(token, None)
    # 磁盘孤儿目录（进程重启后内存登记丢失）：按 mtime 清理。
    try:
        for child in _cache_root().iterdir():
            if not child.is_dir():
                continue
            try:
                if now - child.stat().st_mtime > CACHE_TTL_SECONDS:
                    if child.name not in _CACHE:
                        _remove_dir(str(child))
            except OSError:
                continue
    except OSError:
        pass


def _remove_dir(path: Optional[str]) -> None:
    if not path:
        return
    try:
        shutil.rmtree(path, ignore_errors=True)
    except OSError:
        pass


def discard(token: str) -> None:
    """导入完成 / 取消后释放缓存。"""
    entry = _CACHE.pop(token, None)
    if entry:
        _remove_dir(entry.get("base"))


def resolve_in_cache(token: str, rel_path: str) -> Path:
    """把扫描返回的相对路径安全解析回缓存内的绝对路径（阻断 `..` / 绝对路径逃逸）。"""
    entry = _CACHE.get(token)
    if not entry:
        raise ValueError("链接解析结果已过期，请重新解析后再导入")
    root = Path(entry["root"]).resolve()
    rel = (rel_path or ".").replace("\\", "/").strip()
    if rel in ("", "."):
        candidate = root
    else:
        candidate = (root / rel.lstrip("/")).resolve()
    if candidate != root and root not in candidate.parents:
        raise ValueError(f"非法的导入路径: {rel_path!r}")
    if not (candidate / "SKILL.md").exists():
        raise FileNotFoundError(f"所选路径缺少 SKILL.md: {rel_path!r}")
    return candidate


# =========================================================================
# SSRF 防护
# =========================================================================

def _ip_is_blocked(ip_str: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip_str)
    except ValueError:
        return True
    return (
        addr.is_private
        or addr.is_loopback
        or addr.is_link_local
        or addr.is_reserved
        or addr.is_multicast
        or addr.is_unspecified
    )


def _assert_host_safe(host: Optional[str]) -> None:
    """解析主机所有 IP，命中内网 / 本机 / 保留网段则拒绝（防 SSRF）。"""
    if not host:
        raise ValueError("链接缺少主机名")
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror as e:
        raise ValueError(f"无法解析主机：{host}（{e}）")
    for info in infos:
        ip = info[4][0]
        if _ip_is_blocked(ip):
            raise ValueError("出于安全考虑，禁止访问内网 / 本机地址")


def _assert_url_safe(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError("仅支持 http/https 链接")
    _assert_host_safe(parsed.hostname)


# =========================================================================
# 源解析
# =========================================================================

_ARCHIVE_SUFFIXES = (".zip", ".tar.gz", ".tgz", ".tar")


def _looks_like_archive(url: str) -> bool:
    path = urlparse(url).path.lower()
    return any(path.endswith(s) for s in _ARCHIVE_SUFFIXES)


def _parse_known_host(url: str) -> Optional[Dict[str, Any]]:
    """识别 GitHub/Gitee/GitLab 仓库链接，返回 owner/repo/ref/subdir + 归档候选 URL。"""
    p = urlparse(url)
    host = (p.hostname or "").lower()
    segs = [s for s in p.path.split("/") if s]
    if len(segs) < 2:
        return None
    owner, repo = segs[0], segs[1]
    if repo.endswith(".git"):
        repo = repo[:-4]

    ref: Optional[str] = None
    subdir = ""

    if host in ("github.com", "www.github.com"):
        # /owner/repo[/tree|blob/<ref>/<subdir...>]
        if len(segs) >= 4 and segs[2] in ("tree", "blob"):
            ref = segs[3]
            subdir = "/".join(segs[4:])
        clone_url = f"https://github.com/{owner}/{repo}.git"
        archives = _github_archives(owner, repo, ref)
        return {"host": "github", "owner": owner, "repo": repo, "ref": ref,
                "subdir": subdir, "clone_url": clone_url, "archives": archives}

    if host in ("gitee.com", "www.gitee.com"):
        if len(segs) >= 4 and segs[2] in ("tree", "blob"):
            ref = segs[3]
            subdir = "/".join(segs[4:])
        clone_url = f"https://gitee.com/{owner}/{repo}.git"
        archives = _gitee_archives(owner, repo, ref)
        return {"host": "gitee", "owner": owner, "repo": repo, "ref": ref,
                "subdir": subdir, "clone_url": clone_url, "archives": archives}

    if host in ("gitlab.com", "www.gitlab.com"):
        # GitLab 用 /-/tree/<ref>/<subdir>
        if len(segs) >= 5 and segs[2] == "-" and segs[3] in ("tree", "blob"):
            ref = segs[4]
            subdir = "/".join(segs[5:])
        clone_url = f"https://gitlab.com/{owner}/{repo}.git"
        archives = _gitlab_archives(owner, repo, ref)
        return {"host": "gitlab", "owner": owner, "repo": repo, "ref": ref,
                "subdir": subdir, "clone_url": clone_url, "archives": archives}

    return None


def _github_archives(owner: str, repo: str, ref: Optional[str]) -> List[Tuple[str, str]]:
    """(url, kind) 候选；GitHub API tarball 在 ref 为空时自动跟随默认分支。"""
    out: List[Tuple[str, str]] = []
    if ref:
        out.append((f"https://api.github.com/repos/{owner}/{repo}/tarball/{ref}", "tar.gz"))
        out.append((f"https://codeload.github.com/{owner}/{repo}/tar.gz/refs/heads/{ref}", "tar.gz"))
    else:
        out.append((f"https://api.github.com/repos/{owner}/{repo}/tarball", "tar.gz"))
        for b in ("main", "master"):
            out.append((f"https://codeload.github.com/{owner}/{repo}/tar.gz/refs/heads/{b}", "tar.gz"))
    return out


def _gitee_archives(owner: str, repo: str, ref: Optional[str]) -> List[Tuple[str, str]]:
    refs = [ref] if ref else ["master", "main"]
    return [
        (f"https://gitee.com/{owner}/{repo}/repository/archive/{r}.zip", "zip")
        for r in refs
    ]


def _gitlab_archives(owner: str, repo: str, ref: Optional[str]) -> List[Tuple[str, str]]:
    refs = [ref] if ref else ["main", "master"]
    return [
        (f"https://gitlab.com/{owner}/{repo}/-/archive/{r}/{repo}-{r}.tar.gz", "tar.gz")
        for r in refs
    ]


# =========================================================================
# 下载 + 解压
# =========================================================================

async def _download(url: str) -> Tuple[bytes, str]:
    """安全下载（手动跟随重定向并逐跳校验主机），返回 (内容字节, 最终 URL)。"""
    import httpx

    timeout = httpx.Timeout(HTTP_TIMEOUT_SECONDS, connect=HTTP_CONNECT_TIMEOUT_SECONDS)
    current = url
    for _hop in range(6):
        _assert_url_safe(current)
        async with httpx.AsyncClient(follow_redirects=False, timeout=timeout) as client:
            async with client.stream(
                "GET", current, headers={"User-Agent": "Vibebara-SkillImporter"}
            ) as resp:
                if resp.is_redirect:
                    loc = resp.headers.get("location")
                    if not loc:
                        raise ValueError("重定向缺少 Location")
                    current = str(httpx.URL(current).join(loc))
                    continue
                if resp.status_code == 404:
                    raise FileNotFoundError(f"链接不存在或不可访问（404）：{current}")
                if resp.status_code != 200:
                    raise RuntimeError(f"下载失败（HTTP {resp.status_code}）：{current}")
                cl = resp.headers.get("content-length")
                if cl and int(cl) > MAX_DOWNLOAD_BYTES:
                    raise ValueError("远程内容过大（超过 80MB）")
                buf = bytearray()
                async for chunk in resp.aiter_bytes():
                    buf.extend(chunk)
                    if len(buf) > MAX_DOWNLOAD_BYTES:
                        raise ValueError("远程内容过大（超过 80MB）")
                return bytes(buf), current
    raise RuntimeError("重定向次数过多")


def _safe_extract(data: bytes, kind: str, dest: Path) -> None:
    """把归档字节安全解压到 dest（按内容自动识别 zip / tar，阻断路径逃逸、限制大小）。

    kind 仅作提示；实际格式由内容嗅探决定（zip magic / tar 探测），以兼容服务端
    返回的 Content-Type 与扩展名不一致的情况。
    """
    import io

    dest.mkdir(parents=True, exist_ok=True)
    dest_res = dest.resolve()
    total = 0
    count = 0

    def _check_member(name: str) -> Path:
        target = (dest / name).resolve()
        if target != dest_res and dest_res not in target.parents:
            raise ValueError(f"归档包含越界路径: {name!r}")
        return target

    bio = io.BytesIO(data)
    is_zip = zipfile.is_zipfile(bio)
    bio.seek(0)
    if is_zip:
        with zipfile.ZipFile(bio) as zf:
            for info in zf.infolist():
                if info.is_dir():
                    continue
                count += 1
                total += info.file_size
                if count > MAX_EXTRACT_FILES or total > MAX_EXTRACT_BYTES:
                    raise ValueError("归档解压后过大")
                target = _check_member(info.filename)
                target.parent.mkdir(parents=True, exist_ok=True)
                with zf.open(info) as src, open(target, "wb") as out:
                    shutil.copyfileobj(src, out)
        return

    # tar.* （含 gzip）
    bio.seek(0)
    try:
        tf = tarfile.open(fileobj=bio, mode="r:*")
    except tarfile.TarError as e:
        raise ValueError(f"无法识别的归档格式：{e}")
    with tf:
        for member in tf.getmembers():
            if member.isdir():
                continue
            if not (member.isfile() or member.issym() or member.islnk()):
                continue
            # 忽略符号链接 / 硬链接，避免逃逸与悬挂链接
            if member.issym() or member.islnk():
                continue
            count += 1
            total += member.size
            if count > MAX_EXTRACT_FILES or total > MAX_EXTRACT_BYTES:
                raise ValueError("归档解压后过大")
            target = _check_member(member.name)
            target.parent.mkdir(parents=True, exist_ok=True)
            src = tf.extractfile(member)
            if src is None:
                continue
            with src, open(target, "wb") as out:
                shutil.copyfileobj(src, out)


def _single_root(extract_dir: Path) -> Path:
    """归档常含单一顶层目录（如 owner-repo-<sha>/），自动下钻到该目录。"""
    try:
        entries = [e for e in extract_dir.iterdir() if not e.name.startswith(".")]
    except OSError:
        return extract_dir
    dirs = [e for e in entries if e.is_dir()]
    files = [e for e in entries if e.is_file()]
    if len(dirs) == 1 and not files:
        return dirs[0]
    return extract_dir


def _git_clone(clone_url: str, ref: Optional[str], dest: Path) -> None:
    git = shutil.which("git")
    if not git:
        raise RuntimeError("当前环境未安装 git，无法克隆该链接（仅 GitHub/Gitee/GitLab 仓库与归档链接可免 git 导入）")
    _assert_url_safe(clone_url)
    cmd = [git, "clone", "--depth", "1"]
    if ref:
        cmd += ["--branch", ref]
    cmd += ["--", clone_url, str(dest)]
    env = dict(os.environ)
    env["GIT_TERMINAL_PROMPT"] = "0"  # 禁止交互式凭证提示（私库直接失败）
    proc = subprocess.run(
        cmd, capture_output=True, timeout=GIT_TIMEOUT_SECONDS, env=env,
    )
    if proc.returncode != 0:
        err = proc.stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(f"git clone 失败：{err[:500]}")


# =========================================================================
# 发现 skill 目录 + 构建预览包
# =========================================================================

def _find_skill_dirs(root: Path) -> List[Path]:
    found: List[Path] = []

    def walk(d: Path, depth: int) -> None:
        if depth > MAX_SCAN_DEPTH:
            return
        if (d / "SKILL.md").is_file():
            found.append(d)
            return  # skill 自身的子目录（scripts/references/assets）不再下钻
        try:
            children = sorted(p for p in d.iterdir() if p.is_dir())
        except OSError:
            return
        for child in children:
            if child.name in _SKIP_DIRS or child.name.startswith("."):
                continue
            walk(child, depth + 1)

    walk(root, 0)
    return found


def _build_package(skill_dir: Path, root: Path, repo_name: str) -> Dict[str, Any]:
    frontmatter, _ = _parse_skill_md(skill_dir / "SKILL.md")
    if not isinstance(frontmatter, dict):
        frontmatter = {}
    rel = skill_dir.resolve().relative_to(root.resolve()).as_posix()
    if rel in ("", "."):
        rel = "."
    name = frontmatter.get("name") or (
        skill_dir.name if rel != "." else (repo_name or skill_dir.name)
    )
    origin = _detect_origin(skill_dir, frontmatter)
    resources = _scan_resources(skill_dir)
    description = frontmatter.get("description", "") or ""
    return {
        "id": str(name),
        "origin": origin,
        "origin_confidence": "high" if origin != "unknown" else "low",
        "origin_signals": [],
        "source_path": rel,
        "name": str(name),
        "display_name": "",
        "description": description,
        "short_description": "",
        "has_scripts": bool(resources.get("scripts")),
        "has_references": bool(resources.get("references")),
        "has_assets": bool(resources.get("assets")),
        "installed_at": {
            "cursor": False, "codex": False, "windsurf": False, "claude": False,
            "kiro": False, "trae": False, "qoder": False, "workbuddy": False,
        },
    }


# =========================================================================
# 对外：解析链接
# =========================================================================

async def scan_url(url: str) -> Dict[str, Any]:
    """下载链接源、缓存到服务端，返回 token + 发现的 skill 列表（预览）。"""
    url = (url or "").strip()
    if not url:
        raise ValueError("请输入链接")
    if not urlparse(url).scheme:
        url = "https://" + url  # 容忍用户省略协议
    _assert_url_safe(url)

    _sweep_stale()

    token = uuid.uuid4().hex
    base = _cache_root() / token
    base.mkdir(parents=True, exist_ok=True)
    extract_dir = base / "src"

    loop = asyncio.get_running_loop()
    repo_name = ""
    scan_root: Path

    try:
        known = _parse_known_host(url)

        if _looks_like_archive(url):
            data, _final = await _download(url)
            await loop.run_in_executor(None, _safe_extract, data, "auto", extract_dir)
            scan_root = _single_root(extract_dir)
            repo_name = Path(urlparse(url).path).name

        elif known:
            repo_name = known["repo"]
            fetched = False
            errors: List[str] = []
            for archive_url, kind in known.get("archives", []):
                try:
                    _assert_url_safe(archive_url)
                    data, _final = await _download(archive_url)
                    await loop.run_in_executor(None, _safe_extract, data, kind, extract_dir)
                    fetched = True
                    break
                except (FileNotFoundError, RuntimeError, ValueError) as e:
                    errors.append(str(e))
                    continue
            if not fetched:
                # 归档候选全失败 → git clone 兜底
                try:
                    await loop.run_in_executor(
                        None, _git_clone, known["clone_url"], known.get("ref"), extract_dir
                    )
                    fetched = True
                except Exception as e:  # noqa: BLE001
                    errors.append(str(e))
            if not fetched:
                raise RuntimeError("无法获取仓库内容：" + "；".join(e for e in errors if e))
            repo_root = _single_root(extract_dir)
            subdir = (known.get("subdir") or "").strip("/")
            scan_root = (repo_root / subdir) if subdir else repo_root
            if not scan_root.exists():
                raise FileNotFoundError(f"链接指向的子目录不存在：{subdir}")

        else:
            # 未识别的主机：尝试 git clone（自建 Git 等）
            await loop.run_in_executor(None, _git_clone, url, None, extract_dir)
            scan_root = _single_root(extract_dir)
            repo_name = Path(urlparse(url).path.rstrip("/")).name

        skill_dirs = _find_skill_dirs(scan_root)
        packages = [_build_package(d, scan_root, repo_name) for d in skill_dirs]
        # 同名去重（同一 skill 在多处出现时仅保留首个）
        seen: set = set()
        unique: List[Dict[str, Any]] = []
        for pkg in packages:
            key = pkg["source_path"]
            if key in seen:
                continue
            seen.add(key)
            unique.append(pkg)

        _CACHE[token] = {
            "root": str(scan_root.resolve()),
            "base": str(base),
            "created": time.time(),
        }
        return {"token": token, "packages": unique, "source_url": url}
    except Exception:
        _remove_dir(str(base))
        raise
