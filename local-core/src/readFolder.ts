import fs from "node:fs";
import { LocalCoreError } from "./errors";
import { readFilePayload } from "./fileio";
import { computeDirHash } from "./hash";
import { realResolve } from "./security";
import type { FilePayload, ReadFolderOptions, ReadFolderResult } from "./types";
import { walkFiles } from "./walk";

const SKILL_TOP_FILES = new Set([
  "SKILL.md",
  "AGENTS.md",
  "LICENSE",
  "LICENSE.txt",
]);
const SKILL_DIRS = ["agents/", "scripts/", "references/", "assets/"];

function isSkillFile(relPosix: string): boolean {
  return (
    SKILL_TOP_FILES.has(relPosix) ||
    SKILL_DIRS.some((dir) => relPosix.startsWith(dir))
  );
}

export function readFolder(input: ReadFolderOptions): ReadFolderResult {
  const inputPath = input?.path;
  if (!inputPath?.trim()) {
    throw new LocalCoreError("BAD_REQUEST", "缺少 path 字段");
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(inputPath);
  } catch {
    throw new LocalCoreError("PATH_NOT_FOUND", `路径不存在: ${inputPath}`);
  }
  if (!stat.isDirectory()) {
    throw new LocalCoreError("NOT_A_DIRECTORY", `不是目录: ${inputPath}`);
  }

  const root = realResolve(inputPath);
  const include = input.include === "skill" ? "skill" : "all";
  try {
    const files: FilePayload[] = [];
    for (const file of walkFiles(root)) {
      if (include === "skill" && !isSkillFile(file.rel)) continue;
      files.push(readFilePayload(file.abs, file.rel));
    }
    return { root, dirHash: computeDirHash(root), files };
  } catch (error) {
    if (error instanceof LocalCoreError) throw error;
    throw new LocalCoreError(
      "IO_ERROR",
      `读取失败: ${(error as Error).message}`,
    );
  }
}
