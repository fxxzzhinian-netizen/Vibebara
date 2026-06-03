import { createHash } from "node:crypto";
import fs from "node:fs";
import { walkFiles } from "./walk";

/**
 * 统一目录 hash —— 必须与云端**位级一致**（dirty 检测的命门，M0 §7）。
 *
 * 对应：
 *   · backend/app/services/project_service.py::_compute_content_hash
 *   · backend/app/services/native_skill_store.py::_compute_dir_hash
 *
 * 冻结算法（M0 §7.1–§7.3）：
 *   1. root 不存在 → ""。
 *   2. 递归收集所有"常规文件"（含隐藏文件；排除目录；symlink→file 计为文件，
 *      symlink→dir 不递归，对齐 Python rglob 不跟随目录符号链接 + is_file 跟随）。
 *      —— 复用 walkFiles，与 read-folder 共用同一遍历口径。
 *   3. 转为相对 root 的 POSIX 路径（'/' 分隔）。
 *   4. **按相对路径的 UTF-8 字节序升序排序**（大小写敏感、不 normcase、不 NFC 归一）。
 *      —— 用 Buffer.compare(utf8(x), utf8(y))，不可用 localeCompare / 默认 <。
 *   5. 流式喂入 sha256：对每个文件 update(utf8(rel)) → update(0x00) →
 *      update(原始字节) → update(0x00)。
 *   6. 无任何文件（空目录 / root 是文件）→ ""。
 *   7. 输出小写 hex。
 */

/** 计算目录（或文件）hash，返回小写 hex；不存在/空目录/文件路径 → ""。 */
export function computeDirHash(rootAbsPath: string): string {
  if (!fs.existsSync(rootAbsPath)) {
    return "";
  }
  const files = walkFiles(rootAbsPath);
  if (files.length === 0) {
    return "";
  }
  // 按相对 POSIX 路径的 UTF-8 字节序升序（关键收敛点，M0 §7.2 R2）。
  files.sort((x, y) =>
    Buffer.compare(Buffer.from(x.rel, "utf8"), Buffer.from(y.rel, "utf8")),
  );

  const digest = createHash("sha256");
  const NUL = Buffer.from([0]);
  for (const f of files) {
    digest.update(Buffer.from(f.rel, "utf8"));
    digest.update(NUL);
    digest.update(fs.readFileSync(f.abs)); // 原始字节，不做编码转换
    digest.update(NUL);
  }
  return digest.digest("hex");
}

/** /local/hash 单条结果：hash + exists（exists = 路径真实存在；与 hash 是否为空解耦）。 */
export function hashPath(absPath: string): { hash: string; exists: boolean } {
  const exists = fs.existsSync(absPath);
  return { hash: computeDirHash(absPath), exists };
}
