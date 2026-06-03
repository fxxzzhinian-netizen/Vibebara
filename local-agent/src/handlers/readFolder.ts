import fs from "node:fs";
import { API_VERSION } from "../constants";
import { AgentError } from "../errors";
import { readFilePayload } from "../fileio";
import { computeDirHash } from "../hash";
import { realResolve } from "../security";
import type { FilePayload, ReadFolderRequest, ReadFolderResponse } from "../types";
import { walkFiles } from "../walk";

/**
 * POST /local/read-folder —— 递归读取一个 skill 文件夹全部内容（import/push/promote 用）。
 *
 * · include="all"（默认）：该目录下全部常规文件（与 hash 口径一致，最稳妥）。
 * · include="skill"：仅 skill 相关文件（SKILL.md / AGENTS.md / agents/** /
 *   scripts/** / references/** / assets/** / LICENSE[.txt]）。
 *
 * dirHash 始终对 root 全量计算（统一算法），便于云端核对一致性；files 视 include 过滤。
 */

const SKILL_TOP_FILES = new Set([
  "SKILL.md",
  "AGENTS.md",
  "LICENSE",
  "LICENSE.txt",
]);
const SKILL_DIRS = ["agents/", "scripts/", "references/", "assets/"];

function isSkillFile(relPosix: string): boolean {
  if (SKILL_TOP_FILES.has(relPosix)) return true;
  return SKILL_DIRS.some((d) => relPosix.startsWith(d));
}

export function handleReadFolder(input: ReadFolderRequest): ReadFolderResponse {
  const inputPath = input?.path;
  if (!inputPath || typeof inputPath !== "string" || !inputPath.trim()) {
    throw new AgentError("BAD_REQUEST", "缺少 path 字段");
  }
  const include = input.include === "skill" ? "skill" : "all";

  let stat: fs.Stats;
  try {
    stat = fs.statSync(inputPath);
  } catch {
    throw new AgentError("PATH_NOT_FOUND", `路径不存在: ${inputPath}`);
  }
  if (!stat.isDirectory()) {
    throw new AgentError("NOT_A_DIRECTORY", `不是目录: ${inputPath}`);
  }

  // root = realpath（契约 §5：root = 请求 path 的 realpath）
  const root = realResolve(inputPath);

  let dirHash: string;
  let allFiles: ReturnType<typeof walkFiles>;
  try {
    dirHash = computeDirHash(root);
    allFiles = walkFiles(root);
  } catch (err) {
    throw new AgentError("IO_ERROR", `读取失败: ${(err as Error).message}`);
  }

  const files: FilePayload[] = [];
  for (const f of allFiles) {
    if (include === "skill" && !isSkillFile(f.rel)) continue;
    try {
      files.push(readFilePayload(f.abs, f.rel));
    } catch (err) {
      throw new AgentError("IO_ERROR", `读取文件失败 ${f.rel}: ${(err as Error).message}`);
    }
  }

  return { ok: true, apiVersion: API_VERSION, root, dirHash, files };
}
