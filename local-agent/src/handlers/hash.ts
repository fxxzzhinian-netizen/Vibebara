import { API_VERSION } from "../constants";
import { AgentError } from "../errors";
import { hashPath } from "../hash";
import type { HashRequest, HashResponse, HashResult } from "../types";

/**
 * POST /local/hash —— 按 §7 统一算法计算每个路径的目录/文件 hash。
 * 路径不存在/空目录 → hash:""；exists 反映路径真实存在性。
 */
export function handleHash(input: HashRequest): HashResponse {
  if (!input || !Array.isArray(input.paths)) {
    throw new AgentError("BAD_REQUEST", "缺少 paths 数组");
  }
  const results: HashResult[] = input.paths.map((p) => {
    const { hash, exists } = hashPath(p);
    return { path: p, hash, exists };
  });
  return { ok: true, apiVersion: API_VERSION, results };
}
