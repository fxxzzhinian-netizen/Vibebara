"""独立 JWT secret 验证（方案 B M2）。

目标：
1. JWT_SECRET 解析：注入值优先；留空回退稳定开发默认值；**不再复用 LLM_API_KEY**。
2. 用某 secret 签发的 token 能通过同 secret 的 verify；切换 secret 后旧 token 失效。
3. 篡改签名 / 过期 / 畸形 token 一律拒绝。
4. 开发默认密钥稳定（同一进程多次解析一致，不随机化）。

可直接运行：`python -m tests.test_jwt_secret`（无需 pytest，亦兼容 pytest）。
"""

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import app.services.auth_service as a


def _sign_with(secret: str, user_id: str) -> str:
    """用指定 secret 临时签发一个 token（不污染后续断言）。"""
    saved = a._JWT_SECRET
    try:
        a._JWT_SECRET = secret
        return a._create_token(user_id)
    finally:
        a._JWT_SECRET = saved


def _verify_with(secret: str, token: str):
    saved = a._JWT_SECRET
    try:
        a._JWT_SECRET = secret
        return a.verify_token(token)
    finally:
        a._JWT_SECRET = saved


def test_resolve_prefers_injected_secret():
    saved_secret = a.settings.JWT_SECRET
    saved_llm = a.settings.LLM_API_KEY
    try:
        a.settings.JWT_SECRET = "super-strong-injected"
        a.settings.LLM_API_KEY = "llm-key-should-be-ignored"
        assert a._resolve_jwt_secret() == "super-strong-injected"
    finally:
        a.settings.JWT_SECRET = saved_secret
        a.settings.LLM_API_KEY = saved_llm


def test_resolve_falls_back_to_stable_dev_default_not_llm_key():
    saved_secret = a.settings.JWT_SECRET
    saved_llm = a.settings.LLM_API_KEY
    saved_mode = a.settings.DEPLOYMENT_MODE
    try:
        a.settings.JWT_SECRET = ""
        a.settings.LLM_API_KEY = "llm-key-should-not-be-used"
        a.settings.DEPLOYMENT_MODE = "local"
        resolved = a._resolve_jwt_secret()
        assert resolved == a._DEV_DEFAULT_JWT_SECRET
        assert resolved != a.settings.LLM_API_KEY, "禁止复用 LLM_API_KEY"
        # 稳定性：多次解析一致，不随机化（重启即等价于重新解析）
        assert a._resolve_jwt_secret() == resolved
    finally:
        a.settings.JWT_SECRET = saved_secret
        a.settings.LLM_API_KEY = saved_llm
        a.settings.DEPLOYMENT_MODE = saved_mode


def test_token_roundtrip_same_secret():
    token = _sign_with("secret-A", "user-123")
    assert _verify_with("secret-A", token) == "user-123"


def test_old_token_invalid_after_secret_rotation():
    token = _sign_with("secret-A", "user-123")
    # 切换到新 secret 后，旧 token 必须失效（用户需重新登录）
    assert _verify_with("secret-B", token) is None
    # 用新 secret 重新签发则通过
    token_b = _sign_with("secret-B", "user-123")
    assert _verify_with("secret-B", token_b) == "user-123"


def test_tampered_and_malformed_rejected():
    token = _sign_with("secret-A", "user-123")
    user_id, expire, sig = token.split(".")
    tampered = f"{user_id}.{expire}.{'0' * len(sig)}"
    assert _verify_with("secret-A", tampered) is None
    assert _verify_with("secret-A", "not-a-token") is None
    assert _verify_with("secret-A", "a.b") is None


def test_expired_token_rejected():
    saved = a._JWT_SECRET
    try:
        a._JWT_SECRET = "secret-A"
        payload = f"user-123.{int(time.time()) - 10}"
        import hashlib
        import hmac
        sig = hmac.new(
            b"secret-A", payload.encode(), hashlib.sha256
        ).hexdigest()[:32]
        expired = f"{payload}.{sig}"
        assert a.verify_token(expired) is None
    finally:
        a._JWT_SECRET = saved


def _run_all():
    tests = [
        test_resolve_prefers_injected_secret,
        test_resolve_falls_back_to_stable_dev_default_not_llm_key,
        test_token_roundtrip_same_secret,
        test_old_token_invalid_after_secret_rotation,
        test_tampered_and_malformed_rejected,
        test_expired_token_rejected,
    ]
    for t in tests:
        t()
        print(f"  PASS  {t.__name__}")
    print(f"\nAll {len(tests)} jwt-secret tests passed.")


if __name__ == "__main__":
    _run_all()
