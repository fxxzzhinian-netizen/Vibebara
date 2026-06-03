import crypto from "node:crypto";

/**
 * 配对令牌校验 —— 与后端 backend/app/core/security.py 的算法语义**兼容**：
 *   · constant_time_compare(a,b) = hmac.compare_digest(a.utf8, b.utf8)
 *   · verify_pairing_token(provided, expected)：双方非空且常量时间相等
 *
 * 注意：本地代理只认 **配对令牌**（X-Pairing-Token），不认云端 Bearer（双令牌分离，
 * M0 §5.2）。本模块不签发令牌——令牌由桌面主进程（M5）/env/CLI 注入（D2）。
 */

/**
 * 常量时间字符串比较，避免基于耗时差异的时序侧信道泄露。
 *
 * 对齐 Python `hmac.compare_digest`：对 UTF-8 字节比较；长度不同直接判负
 * （compare_digest 对长度同样不保证恒定时间，二者语义一致）。
 */
export function constantTimeCompare(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) {
    // 长度不同：用一次等长自比较维持大致恒定耗时后判负（不泄露内容差异位置）。
    crypto.timingSafeEqual(ab, ab);
    return false;
  }
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * 校验配对令牌：要求双方均非空且常量时间相等。
 * 对齐后端 verify_pairing_token（空值一律拒绝，防空令牌绕过）。
 */
export function verifyPairingToken(
  provided: string | undefined | null,
  expected: string | undefined | null,
): boolean {
  if (!provided || !expected) {
    return false;
  }
  return constantTimeCompare(provided, expected);
}

/** 生成高熵、URL 安全的配对令牌（bearer 风格），对齐 generate_pairing_token。 */
export function generatePairingToken(nbytes = 32): string {
  return crypto.randomBytes(nbytes).toString("base64url");
}
