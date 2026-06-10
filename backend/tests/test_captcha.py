"""滑块人机验证单元验证（纯内存，无需 DB）。

目标：
1. 挑战生成：返回 base64 图片与几何参数，目标 x 不外泄。
2. 容差校验：±TOLERANCE 内通过，超出拒绝。
3. 一次性：挑战验证后即作废（无论成败）；token 消费后即失效。
4. 过期：挑战/﻿token 过期后拒绝。

可直接运行：`python -m tests.test_captcha`（无需 pytest，亦兼容 pytest）。
"""

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services import captcha_service as cap


def _new_challenge_with_target() -> tuple[str, int, dict]:
    ch = cap.create_challenge()
    target_x, _ = cap._challenges[ch["captcha_id"]]
    return ch["captcha_id"], target_x, ch


def test_challenge_payload_shape():
    cid, _target_x, ch = _new_challenge_with_target()
    assert ch["bg"] and ch["piece"], "应返回 base64 图片"
    assert ch["bg_width"] == cap.BG_W and ch["bg_height"] == cap.BG_H
    assert 0 < ch["piece_y"] < cap.BG_H - cap.PIECE_H
    # 目标 x 不外泄：响应中不含任何 x 字段
    assert "x" not in ch and "target_x" not in ch
    cap._challenges.pop(cid, None)


def test_verify_within_tolerance():
    cid, target_x, _ = _new_challenge_with_target()
    token = cap.verify(cid, target_x + cap.TOLERANCE - 1)
    assert token, "容差内应通过"
    assert cap.consume_token(token), "token 应可消费一次"
    assert not cap.consume_token(token), "token 不可重复消费"


def test_verify_outside_tolerance_rejected():
    cid, target_x, _ = _new_challenge_with_target()
    assert cap.verify(cid, target_x + cap.TOLERANCE + 3) is None
    # 挑战一次性：失败后再用正确答案也无效
    assert cap.verify(cid, target_x) is None


def test_unknown_or_reused_challenge_rejected():
    assert cap.verify("nonexistent-id", 100) is None
    cid, target_x, _ = _new_challenge_with_target()
    assert cap.verify(cid, target_x) is not None
    assert cap.verify(cid, target_x) is None, "挑战不可复用"


def test_expired_challenge_and_token_rejected():
    cid, target_x, _ = _new_challenge_with_target()
    cap._challenges[cid] = (target_x, time.time() - 1)
    assert cap.verify(cid, target_x) is None, "过期挑战应拒绝"

    cid2, target_x2, _ = _new_challenge_with_target()
    token = cap.verify(cid2, target_x2)
    cap._tokens[token] = time.time() - 1
    assert not cap.consume_token(token), "过期 token 应拒绝"


def test_consume_empty_token_rejected():
    assert not cap.consume_token("")
    assert not cap.consume_token("cap_not_issued")


def _run_all():
    tests = [
        test_challenge_payload_shape,
        test_verify_within_tolerance,
        test_verify_outside_tolerance_rejected,
        test_unknown_or_reused_challenge_rejected,
        test_expired_challenge_and_token_rejected,
        test_consume_empty_token_rejected,
    ]
    for t in tests:
        t()
        print(f"  PASS  {t.__name__}")
    print(f"\nAll {len(tests)} captcha tests passed.")


if __name__ == "__main__":
    _run_all()
