"""
共享安全工具 — 常量时间比较 + 设备配对令牌（Pairing Token）基础设施。

方案 B M2 落地依据：M0 契约 §5「安全/配对模型」与分歧 D2。

设计要点（务必遵循，避免后续误用）：
- **双令牌分离**：
    · Bearer Token（云端 HMAC token，见 ``auth_service``）只发给云端，证明「我是用户 X」；
    · Pairing Token（设备配对令牌）只发给本地代理，证明「我是与本代理配对的合法渲染层」。
  二者**互不混用**：云端不签发、不持有 Pairing Token；本地代理不理解 Bearer Token。
- 按 M0 §5.2 / D2 冻结结论：**配对令牌由桌面主进程（Electron）生成并注入**
  「本地代理进程」与「渲染层」，云端**无需**新增「签发/下发配对令牌」端点。
  因此 M2 云端侧仅提供下列**共享算法基线**，确保 M3 本地代理实现与云端口径一致：
    · ``constant_time_compare`` —— 常量时间字符串比较（防时序侧信道）。
    · ``generate_pairing_token`` —— 高熵 bearer 风格令牌生成（供桌面主进程/工具复用）。
    · ``verify_pairing_token`` —— 基于常量时间比较的配对令牌校验（M3 占位复用点）。

M3 待对接点（本模块不实现，仅约定）：
    · 本地代理启动时由主进程注入 ``pairingSecret``（=本函数生成的高熵令牌）；
    · 本地代理对每个写类请求的 ``X-Pairing-Token`` 调用 ``verify_pairing_token``
      与本进程 ``pairingSecret`` 比较，失败 → 401 UNAUTHORIZED；
    · 配合「可写根白名单 + 仅监听 127.0.0.1」双重约束（M0 §5.3 / §5.4）。
"""

import hmac
import secrets

# 配对令牌默认熵（字节）。32 字节 ≈ 256 bit，token_urlsafe 后约 43 字符。
DEFAULT_PAIRING_TOKEN_BYTES = 32


def constant_time_compare(a: str, b: str) -> bool:
    """常量时间比较两个字符串，避免基于耗时差异的时序侧信道泄露。

    对 Bearer token 签名比较、配对令牌比较等敏感等值判断统一使用本函数，
    不要使用 ``==``（其比较耗时随首个不同字节位置变化）。
    """
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def generate_pairing_token(nbytes: int = DEFAULT_PAIRING_TOKEN_BYTES) -> str:
    """生成高熵、URL 安全的设备配对令牌（bearer 风格固定令牌）。

    对应 M0 §5.2「主进程启动本地代理时生成高熵随机配对密钥
    pairingSecret = randomBytes(32)」。M2 提供此共享生成器，桌面主进程（M5）/
    联调脚本可直接复用，保证令牌强度一致。
    """
    return secrets.token_urlsafe(nbytes)


def verify_pairing_token(provided: str, expected: str) -> bool:
    """校验配对令牌：要求双方均非空且常量时间相等。

    M2 云端侧占位实现，供本地代理（M3）落地「token == 本进程 pairingSecret」
    的强制校验时直接复用，避免两端实现口径漂移。
    """
    if not provided or not expected:
        return False
    return constant_time_compare(provided, expected)
