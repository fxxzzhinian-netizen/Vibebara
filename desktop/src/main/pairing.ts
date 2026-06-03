import crypto from "node:crypto";

/**
 * 生成高熵、URL 安全的配对令牌（bearer 风格）。
 *
 * 与 `local-agent/src/auth.ts` 的 `generatePairingToken` 及后端
 * `backend/app/core/security.py` 的 `generate_pairing_token` 算法语义兼容：
 *   · 均为 32 字节随机 → base64url（无填充）字符串；
 *   · 校验侧（本地代理 verifyPairingToken / 后端 verify_pairing_token）只做
 *     「双方非空 + 常量时间相等」比较，故只要主进程把同一令牌注入本地代理
 *     与渲染层即可（M2 决议④：云端不签发、主进程注入）。
 */
export function generatePairingToken(nbytes = 32): string {
  return crypto.randomBytes(nbytes).toString("base64url");
}
