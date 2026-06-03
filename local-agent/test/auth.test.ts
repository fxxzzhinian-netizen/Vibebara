import { describe, expect, it } from "vitest";
import { constantTimeCompare, verifyPairingToken } from "../src/auth";

/**
 * 配对令牌校验测试 —— 对齐 backend core/security.py 语义：
 *  · 常量时间比较相等/不等/长度不同；
 *  · verify_pairing_token 缺失（空值）/错误/正确三态。
 */

describe("constantTimeCompare", () => {
  it("相同字符串返回 true", () => {
    expect(constantTimeCompare("abc123", "abc123")).toBe(true);
    expect(constantTimeCompare("中文令牌", "中文令牌")).toBe(true);
  });

  it("不同内容返回 false", () => {
    expect(constantTimeCompare("abc123", "abc124")).toBe(false);
  });

  it("长度不同返回 false（不抛错）", () => {
    expect(constantTimeCompare("short", "longer-token")).toBe(false);
    expect(constantTimeCompare("", "x")).toBe(false);
  });
});

describe("verifyPairingToken", () => {
  const secret = "vibehub-pairing-secret-xyz";

  it("缺失令牌（undefined/null/空串）一律拒绝", () => {
    expect(verifyPairingToken(undefined, secret)).toBe(false);
    expect(verifyPairingToken(null, secret)).toBe(false);
    expect(verifyPairingToken("", secret)).toBe(false);
  });

  it("expected 为空一律拒绝（防空令牌绕过）", () => {
    expect(verifyPairingToken(secret, "")).toBe(false);
    expect(verifyPairingToken(secret, undefined)).toBe(false);
  });

  it("错误令牌拒绝，正确令牌通过", () => {
    expect(verifyPairingToken("wrong-token", secret)).toBe(false);
    expect(verifyPairingToken(secret, secret)).toBe(true);
  });
});
