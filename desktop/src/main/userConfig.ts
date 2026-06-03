import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

/**
 * 云端地址等可覆盖配置（方案 B M5-a / 决策 C）。
 *
 * 策略：**内置默认 + 可由本机配置文件覆盖**。
 *   · 内置默认指向本机 cloud demo（DEPLOYMENT_MODE=cloud 后端）；
 *   · 用户可在 `<userData>/vibehub-desktop.config.json` 覆盖 cloudApiBase /
 *     cloudWsBase / writableRoots，从本地 demo 平滑切到真实云端无需改壳代码。
 *   · 也支持环境变量覆盖（便于联调）：VIBEHUB_CLOUD_API_BASE / VIBEHUB_CLOUD_WS_BASE /
 *     VIBEHUB_WRITABLE_ROOTS（; 分隔）。
 */

export interface CloudConfig {
  /** 云端 REST 基址（含 /api/v1）。 */
  cloudApiBase: string;
  /** 云端 WS 基址（不含路径）。 */
  cloudWsBase: string;
  /** 启动注入本地代理的可写根（可空）。 */
  writableRoots: string[];
}

const BUILTIN_DEFAULTS: CloudConfig = {
  cloudApiBase: "http://127.0.0.1:8000/api/v1",
  cloudWsBase: "ws://127.0.0.1:8000",
  writableRoots: [],
};

function configFile(): string {
  return path.join(app.getPath("userData"), "vibehub-desktop.config.json");
}

function splitRoots(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function loadCloudConfig(): CloudConfig {
  let merged: CloudConfig = { ...BUILTIN_DEFAULTS };

  // 1) 配置文件覆盖
  try {
    const f = configFile();
    if (fs.existsSync(f)) {
      const j = JSON.parse(fs.readFileSync(f, "utf-8")) as Partial<CloudConfig>;
      if (typeof j.cloudApiBase === "string" && j.cloudApiBase) {
        merged.cloudApiBase = j.cloudApiBase;
      }
      if (typeof j.cloudWsBase === "string" && j.cloudWsBase) {
        merged.cloudWsBase = j.cloudWsBase;
      }
      if (Array.isArray(j.writableRoots)) {
        merged.writableRoots = j.writableRoots.filter(
          (r) => typeof r === "string" && r.trim(),
        );
      }
    }
  } catch (e) {
    console.warn("[user-config] 读取配置文件失败，用内置默认:", (e as Error)?.message);
  }

  // 2) 环境变量覆盖（联调优先级最高）
  if (process.env.VIBEHUB_CLOUD_API_BASE) {
    merged.cloudApiBase = process.env.VIBEHUB_CLOUD_API_BASE;
  }
  if (process.env.VIBEHUB_CLOUD_WS_BASE) {
    merged.cloudWsBase = process.env.VIBEHUB_CLOUD_WS_BASE;
  }
  if (process.env.VIBEHUB_WRITABLE_ROOTS) {
    merged.writableRoots = splitRoots(process.env.VIBEHUB_WRITABLE_ROOTS);
  }

  return merged;
}
