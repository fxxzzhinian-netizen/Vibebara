import fs from "node:fs";
import { API_VERSION } from "../constants";
import { AgentError } from "../errors";
import { scanAndPackage } from "../scan/scan";
import type { ScanRequest, ScanResponse } from "../types";

/**
 * POST /local/scan —— 纯 TS 扫描 + 来源识别（替代 bridge scan-and-package，R1/D3）。
 * 字段与契约 UnifiedSkillPackage 对齐（camelCase），便于云端复用。
 */
export function handleScan(input: ScanRequest): ScanResponse {
  const rootDir = input?.rootDir;
  if (!rootDir || typeof rootDir !== "string" || !rootDir.trim()) {
    throw new AgentError("BAD_REQUEST", "缺少 rootDir 字段");
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(rootDir);
  } catch {
    throw new AgentError("PATH_NOT_FOUND", `路径不存在: ${rootDir}`);
  }
  if (!stat.isDirectory()) {
    throw new AgentError("NOT_A_DIRECTORY", `不是目录: ${rootDir}`);
  }

  try {
    const packages = scanAndPackage(rootDir);
    return {
      ok: true,
      apiVersion: API_VERSION,
      status: "ready",
      scanDir: rootDir,
      lastScan: new Date().toISOString(),
      packages,
    };
  } catch (err) {
    return {
      ok: true,
      apiVersion: API_VERSION,
      status: "error",
      scanDir: rootDir,
      lastScan: null,
      packages: [],
      scanError: (err as Error).message,
    };
  }
}
