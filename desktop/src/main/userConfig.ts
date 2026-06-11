import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

/**
 * 云端地址等可覆盖配置（方案 B M5-a / 决策 C）。
 *
 * 策略：**内置默认 + 可由本机配置文件覆盖**。
 *   · 内置默认按是否打包区分：dev（未打包）指向本机 cloud demo，
 *     打包安装包指向云端服务器（测试者无 env，必须 bake 真实地址）；
 *   · 用户可在 `<userData>/vibebara-desktop.config.json` 覆盖 cloudApiBase /
 *     cloudWsBase / writableRoots，从本地 demo 平滑切到真实云端无需改壳代码。
 *   · 也支持环境变量覆盖（便于联调）：VIBEBARA_CLOUD_API_BASE / VIBEBARA_CLOUD_WS_BASE /
 *     VIBEBARA_WRITABLE_ROOTS（; 分隔）。
 */

export interface CloudConfig {
  /** 云端 REST 基址（含 /api/v1）。 */
  cloudApiBase: string;
  /** 云端 WS 基址（不含路径）。 */
  cloudWsBase: string;
  /** 启动注入本地代理的可写根（可空）。 */
  writableRoots: string[];
}

// 本机 dev（未打包）默认：连本地 cloud demo 后端（零参数 build-desktop.ps1 起的 :8000）。
const DEV_DEFAULTS: CloudConfig = {
  cloudApiBase: "http://127.0.0.1:8000/api/v1",
  cloudWsBase: "ws://127.0.0.1:8000",
  writableRoots: [],
};

// 打包安装包（测试版/正式版）默认：连云端服务器。
// 测试者机器上没有 VIBEBARA_CLOUD_* 环境变量，故 packaged 默认必须直接指向真实云端，
// 否则会回退到 127.0.0.1 而连不上。换服务器时改这里即可（env / 配置文件仍可覆盖）。
const PACKAGED_DEFAULTS: CloudConfig = {
  cloudApiBase: "http://43.136.128.162:8000/api/v1",
  cloudWsBase: "ws://43.136.128.162:8000",
  writableRoots: [],
};

function builtinDefaults(): CloudConfig {
  return app.isPackaged ? { ...PACKAGED_DEFAULTS } : { ...DEV_DEFAULTS };
}

function configFile(): string {
  return path.join(app.getPath("userData"), "vibebara-desktop.config.json");
}

function splitRoots(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function loadCloudConfig(): CloudConfig {
  let merged: CloudConfig = builtinDefaults();

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
  if (process.env.VIBEBARA_CLOUD_API_BASE) {
    merged.cloudApiBase = process.env.VIBEBARA_CLOUD_API_BASE;
  }
  if (process.env.VIBEBARA_CLOUD_WS_BASE) {
    merged.cloudWsBase = process.env.VIBEBARA_CLOUD_WS_BASE;
  }
  if (process.env.VIBEBARA_WRITABLE_ROOTS) {
    merged.writableRoots = splitRoots(process.env.VIBEBARA_WRITABLE_ROOTS);
  }

  return merged;
}
