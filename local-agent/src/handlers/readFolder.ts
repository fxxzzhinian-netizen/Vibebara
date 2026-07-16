import { LocalCoreError, readFolder } from "@vibebara/local-core";
import { API_VERSION } from "../constants";
import { AgentError } from "../errors";
import type { ReadFolderRequest, ReadFolderResponse } from "../types";

/**
 * POST /local/read-folder —— 递归读取一个 skill 文件夹全部内容（import/push/promote 用）。
 *
 * · include="all"（默认）：该目录下全部常规文件（与 hash 口径一致，最稳妥）。
 * · include="skill"：仅 skill 相关文件（SKILL.md / AGENTS.md / agents/** /
 *   scripts/** / references/** / assets/** / LICENSE[.txt]）。
 *
 * dirHash 始终对 root 全量计算（统一算法），便于云端核对一致性；files 视 include 过滤。
 */

export function handleReadFolder(input: ReadFolderRequest): ReadFolderResponse {
  try {
    const result = readFolder(input);
    return { ok: true, apiVersion: API_VERSION, ...result };
  } catch (error) {
    if (error instanceof LocalCoreError) {
      throw new AgentError(error.code, error.message, error.detail);
    }
    throw error;
  }
}
