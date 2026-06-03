"""配对令牌 / 常量时间比较工具验证（方案 B M2，云端侧共享基础设施）。

仅验证 core.security 提供的共享算法基线（M3 本地代理将复用）：
- generate_pairing_token：高熵、URL 安全、长度足够、每次不同。
- constant_time_compare / verify_pairing_token：相等判定正确，空值拒绝。

可直接运行：`python -m tests.test_pairing_token`（无需 pytest，亦兼容 pytest）。
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.security import (
    constant_time_compare,
    generate_pairing_token,
    verify_pairing_token,
)


def test_generate_is_high_entropy_and_unique():
    t1 = generate_pairing_token()
    t2 = generate_pairing_token()
    assert t1 != t2, "两次生成不应相同"
    # token_urlsafe(32) ≈ 43 字符；至少 32 字符表明熵充足
    assert len(t1) >= 32
    assert all(c.isalnum() or c in "-_" for c in t1), "应为 URL 安全字符集"


def test_constant_time_compare():
    assert constant_time_compare("abc", "abc") is True
    assert constant_time_compare("abc", "abd") is False
    assert constant_time_compare("abc", "abcd") is False
    assert constant_time_compare("", "") is True


def test_verify_pairing_token():
    token = generate_pairing_token()
    assert verify_pairing_token(token, token) is True
    assert verify_pairing_token(token, generate_pairing_token()) is False
    # 空值一律拒绝（防止未注入 secret 时被空令牌绕过）
    assert verify_pairing_token("", "") is False
    assert verify_pairing_token(token, "") is False
    assert verify_pairing_token("", token) is False


def _run_all():
    tests = [
        test_generate_is_high_entropy_and_unique,
        test_constant_time_compare,
        test_verify_pairing_token,
    ]
    for t in tests:
        t()
        print(f"  PASS  {t.__name__}")
    print(f"\nAll {len(tests)} pairing-token tests passed.")


if __name__ == "__main__":
    _run_all()
