import { app, safeStorage } from "electron";
import fs from "node:fs";
import path from "node:path";

/**
 * 登录 Bearer Token 的安全持久化（方案 B M5-a / §3.4 / §4.4）。
 *
 * 桌面形态用 Electron `safeStorage`（Windows DPAPI / macOS Keychain）加密落盘，
 * 替代渲染层 localStorage（明文）。渲染层经 preload/IPC 读写：
 *   · 启动时 preload 同步取一次缓存进渲染层（getToken）；
 *   · 登录/登出时写（setToken / clearToken），加密落盘。
 *
 * web 形态不受影响——前端 tokenStorage 仍走 localStorage（按形态选择）。
 */

function tokenFile(): string {
  return path.join(app.getPath("userData"), "vibebara-token.bin");
}

function encryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

export function getToken(): string {
  try {
    const f = tokenFile();
    if (!fs.existsSync(f)) return "";
    const buf = fs.readFileSync(f);
    if (buf.length === 0) return "";
    if (encryptionAvailable()) {
      return safeStorage.decryptString(buf);
    }
    // 加密不可用（极少见）：回退明文读取（已在写入侧告警）。
    return buf.toString("utf-8");
  } catch {
    return "";
  }
}

export function setToken(token: string): void {
  try {
    const f = tokenFile();
    if (!token) {
      if (fs.existsSync(f)) fs.unlinkSync(f);
      return;
    }
    if (encryptionAvailable()) {
      fs.writeFileSync(f, safeStorage.encryptString(token));
    } else {
      console.warn(
        "[token-store] safeStorage 加密不可用，回退明文存储（不安全，请检查 OS keychain）",
      );
      fs.writeFileSync(f, Buffer.from(token, "utf-8"));
    }
  } catch (e) {
    console.error("[token-store] 写入失败:", (e as Error)?.message);
  }
}

export function clearToken(): void {
  try {
    const f = tokenFile();
    if (fs.existsSync(f)) fs.unlinkSync(f);
  } catch {
    /* ignore */
  }
}
