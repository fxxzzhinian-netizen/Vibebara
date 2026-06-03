import fs from "node:fs";
import path from "node:path";

/**
 * 可写根白名单（Writable Roots）+ 路径逃逸防护 —— M0 §5.3 / §5.4。
 *
 * 约束语义：任何写操作（write-skill）的目标 installPath 必须经规范化后落在某个
 * **已授权根目录** 之内，杜绝 `..` / 符号链接逃逸。
 *
 * 白名单来源：
 *   1. 启动注入：CLI `--writable-root` / env（见 config.ts），M5 由 Electron 主进程注入。
 *   2. 平台 skill 目录（~/.cursor/skills、~/.codex/skills）—— scope=platform 始终允许。
 *   3. 运行期登记（**M5-b 任务③ 收紧**）：write-skill 时把「用户确认选定的 deployPath
 *      根」登记为可写根——授权来源 = 真正要写的目标目录（经桌面部署/导入确认流程），
 *      **不再**由 browse 被动登记（消除「看一眼就扩大白名单」）。
 *
 * 维持 7 端点冻结：登记复用 write-skill 的入参 deployPath，无新增契约端点；写盘前
 * 仍做 realpath/`..` 逃逸校验，确保 installPath 严格落在已确认根内。
 */

/** 规范化为绝对路径（解析 `.`/`..`，不要求存在）。 */
export function normalizeAbs(p: string): string {
  return path.resolve(p);
}

/**
 * 解析路径中"已存在前缀"的真实路径（realpath），再拼回剩余不存在的部分。
 * 用于对尚未创建的 installPath 做符号链接逃逸防护：已存在的祖先若是软链，
 * 解析到真实位置后再做包含判断。
 */
export function realResolve(p: string): string {
  const abs = normalizeAbs(p);
  let current = abs;
  const tail: string[] = [];
  // 向上找到第一个真实存在的祖先
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (fs.existsSync(current)) {
      let real: string;
      try {
        real = fs.realpathSync.native(current);
      } catch {
        real = current;
      }
      return tail.length ? path.join(real, ...tail.reverse()) : real;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      // 到根仍不存在（罕见）：返回规范化绝对路径
      return abs;
    }
    tail.push(path.basename(current));
    current = parent;
  }
}

/** Windows 大小写不敏感比较的归一化键。 */
function caseKey(p: string): string {
  return process.platform === "win32" ? p.toLowerCase() : p;
}

/**
 * child 是否在 parent 之内（含 parent 自身）。两侧均应先 realResolve。
 * 用 path.relative 判定：相对路径不以 `..` 开头且非绝对路径即为内部。
 */
export function isInside(child: string, parent: string): boolean {
  const c = caseKey(normalizeAbs(child));
  const pa = caseKey(normalizeAbs(parent));
  if (c === pa) return true;
  const rel = path.relative(pa, c);
  if (rel === "") return true;
  if (rel.startsWith("..")) return false;
  if (path.isAbsolute(rel)) return false;
  // 在 Windows 上跨盘符时 path.relative 会返回带盘符的绝对路径，已被上面拦截。
  return true;
}

export class WritableRoots {
  private readonly roots = new Set<string>();

  constructor(initial: string[] = []) {
    for (const r of initial) {
      this.register(r);
    }
  }

  /** 登记一个可写根（存空目录/相对路径会被规范化；空串忽略）。 */
  register(dir: string): void {
    if (!dir || !dir.trim()) return;
    this.roots.add(caseKey(realResolve(dir)));
  }

  /** 已登记可写根（真实路径、case 归一后）列表，便于诊断/日志。 */
  list(): string[] {
    return [...this.roots];
  }

  /**
   * 目标绝对路径是否被允许写入：realResolve 后必须落在某个已登记根之内。
   * targetAbs 可以是尚不存在的 installPath。
   */
  isAllowed(targetAbs: string): boolean {
    const target = realResolve(targetAbs);
    for (const root of this.roots) {
      if (isInside(target, root)) {
        return true;
      }
    }
    return false;
  }
}

/**
 * 校验「相对 install 根的写入条目路径」安全：禁止绝对路径与 `..` 逃逸。
 * 返回拼接后的绝对路径；非法抛出由调用方转 BAD_REQUEST。
 */
export function safeJoinUnder(installPath: string, relPosix: string): string {
  if (!relPosix || typeof relPosix !== "string") {
    throw new Error("空相对路径");
  }
  // 统一按 POSIX 拆分（契约约定 contents/resources 的 key 为相对 POSIX 路径）
  const segments = relPosix.split("/").filter((s) => s.length > 0);
  if (segments.some((s) => s === "..")) {
    throw new Error(`相对路径含 '..'：${relPosix}`);
  }
  if (path.isAbsolute(relPosix) || /^[a-zA-Z]:/.test(relPosix)) {
    throw new Error(`相对路径不可为绝对路径：${relPosix}`);
  }
  const joined = path.join(installPath, ...segments);
  // 双保险：拼接后仍须在 installPath 之内
  if (!isInside(joined, installPath)) {
    throw new Error(`写入路径逃逸 install 根：${relPosix}`);
  }
  return joined;
}
