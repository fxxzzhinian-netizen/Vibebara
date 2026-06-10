"""滑块拼图人机验证 — 程序化生成挑战 + 内存态校验

流程：
  1. ``create_challenge()`` 程序化生成背景图（随机渐变 + 几何纹理，无需素材
     图库），在随机位置抠出拼图块，返回带缺口背景图与透明底拼块（base64 PNG）；
  2. 前端拖动滑块对齐缺口后提交 x 坐标，``verify()`` 按 ±TOLERANCE 容差校验，
     成功签发一次性 captcha_token；
  3. 登录/注册请求附带 token，``consume_token()`` 校验并消费。

存储为进程内存 dict（挑战 TTL 2 分钟 / token TTL 5 分钟，均一次性）。
与 WS hub 一样依赖单进程部署（--workers 1），符合现状约束。
"""

import base64
import colorsys
import io
import math
import random
import secrets
import time
import uuid
from typing import Optional

from PIL import Image, ImageDraw, ImageFilter

# ---- 几何参数 ----
BG_W, BG_H = 320, 180
PIECE_BODY = 46          # 拼块主体边长
KNOB_R = 9               # 凸起半径
KNOB_D = KNOB_R * 2
PIECE_W = PIECE_BODY + KNOB_D   # 右侧凸起外扩
PIECE_H = PIECE_BODY + KNOB_D   # 顶部凸起外扩

# ---- 校验参数 ----
TOLERANCE = 6            # 像素容差
CHALLENGE_TTL = 120.0    # 挑战有效期（秒）
TOKEN_TTL = 300.0        # 验证通过后 token 有效期（秒）
_MAX_PENDING = 2000      # 内存兜底上限

# captcha_id -> (target_x, expires_at)
_challenges: dict[str, tuple[int, float]] = {}
# token -> expires_at
_tokens: dict[str, float] = {}


def _purge_expired() -> None:
    now = time.time()
    if len(_challenges) > _MAX_PENDING:
        for cid in [c for c, (_, exp) in _challenges.items() if exp < now]:
            _challenges.pop(cid, None)
    if len(_tokens) > _MAX_PENDING:
        for tok in [t for t, exp in _tokens.items() if exp < now]:
            _tokens.pop(tok, None)


def _hsv(h: float, s: float, v: float) -> tuple[int, int, int]:
    r, g, b = colorsys.hsv_to_rgb(h % 1.0, s, v)
    return int(r * 255), int(g * 255), int(b * 255)


def _draw_background() -> Image.Image:
    """随机深色渐变底 + 半透明几何纹理（纹理为缺口定位提供视觉锚点）。"""
    hue = random.random()
    c1 = _hsv(hue, random.uniform(0.35, 0.55), random.uniform(0.22, 0.32))
    c2 = _hsv(hue + random.uniform(0.06, 0.16), random.uniform(0.4, 0.6),
              random.uniform(0.45, 0.6))

    img = Image.new("RGB", (BG_W, BG_H))
    draw = ImageDraw.Draw(img)
    for yy in range(BG_H):
        t = yy / (BG_H - 1)
        color = tuple(int(a + (b - a) * t) for a, b in zip(c1, c2))
        draw.line([(0, yy), (BG_W, yy)], fill=color)

    overlay = Image.new("RGBA", (BG_W, BG_H), (0, 0, 0, 0))
    odraw = ImageDraw.Draw(overlay)
    for _ in range(random.randint(14, 20)):
        cx = random.randint(-30, BG_W + 30)
        cy = random.randint(-30, BG_H + 30)
        r = random.randint(8, 46)
        tone = _hsv(hue + random.uniform(-0.25, 0.25),
                    random.uniform(0.3, 0.7), random.uniform(0.3, 0.85))
        alpha = random.randint(28, 80)
        if random.random() < 0.6:
            odraw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=tone + (alpha,))
        else:
            angle = random.uniform(0, math.pi)
            dx, dy = math.cos(angle) * r * 2, math.sin(angle) * r * 2
            odraw.line([cx - dx, cy - dy, cx + dx, cy + dy],
                       fill=tone + (alpha,), width=random.randint(2, 5))
    overlay = overlay.filter(ImageFilter.GaussianBlur(1.2))
    img = Image.alpha_composite(img.convert("RGBA"), overlay)
    return img


def _piece_mask() -> Image.Image:
    """拼图块蒙版：主体方块 + 顶部/右侧圆形凸起。"""
    mask = Image.new("L", (PIECE_W, PIECE_H), 0)
    d = ImageDraw.Draw(mask)
    # 主体（左下对齐：顶部留凸起空间，右侧留凸起空间）
    d.rounded_rectangle(
        [0, KNOB_D, PIECE_BODY, KNOB_D + PIECE_BODY], radius=4, fill=255
    )
    # 顶部凸起
    d.ellipse(
        [PIECE_BODY // 2 - KNOB_R, KNOB_D - KNOB_R,
         PIECE_BODY // 2 + KNOB_R, KNOB_D + KNOB_R],
        fill=255,
    )
    # 右侧凸起
    d.ellipse(
        [PIECE_BODY - KNOB_R, KNOB_D + PIECE_BODY // 2 - KNOB_R,
         PIECE_BODY + KNOB_R, KNOB_D + PIECE_BODY // 2 + KNOB_R],
        fill=255,
    )
    return mask


def _to_base64(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


def create_challenge() -> dict:
    """生成一个滑块挑战。返回前端渲染所需的全部数据。"""
    _purge_expired()

    bg = _draw_background()
    mask = _piece_mask()

    # 目标位置：x 远离滑块起点，y 保证拼块完整落在图内
    target_x = random.randint(80, BG_W - PIECE_W - 10)
    piece_y = random.randint(8, BG_H - PIECE_H - 8)

    # 拼块 = 背景对应区域 × 蒙版，加亮边便于辨认
    region = bg.crop((target_x, piece_y, target_x + PIECE_W, piece_y + PIECE_H))
    piece = Image.new("RGBA", (PIECE_W, PIECE_H), (0, 0, 0, 0))
    piece.paste(region, (0, 0), mask)
    outline = mask.filter(ImageFilter.FIND_EDGES).point(lambda p: 255 if p > 40 else 0)
    piece.paste(Image.new("RGBA", piece.size, (255, 255, 255, 150)), (0, 0), outline)

    # 背景挖洞：缺口区域压暗 + 描边
    hole_shadow = Image.new("RGBA", (PIECE_W, PIECE_H), (0, 0, 0, 0))
    hole_shadow.paste(Image.new("RGBA", (PIECE_W, PIECE_H), (8, 10, 18, 175)),
                      (0, 0), mask)
    bg.alpha_composite(hole_shadow, (target_x, piece_y))
    edge_layer = Image.new("RGBA", (PIECE_W, PIECE_H), (0, 0, 0, 0))
    edge_layer.paste(Image.new("RGBA", (PIECE_W, PIECE_H), (255, 255, 255, 90)),
                     (0, 0), outline)
    bg.alpha_composite(edge_layer, (target_x, piece_y))

    captcha_id = str(uuid.uuid4())
    _challenges[captcha_id] = (target_x, time.time() + CHALLENGE_TTL)

    return {
        "captcha_id": captcha_id,
        "bg": _to_base64(bg.convert("RGB")),
        "piece": _to_base64(piece),
        "piece_y": piece_y,
        "bg_width": BG_W,
        "bg_height": BG_H,
        "piece_width": PIECE_W,
        "piece_height": PIECE_H,
    }


def verify(captcha_id: str, x: float) -> Optional[str]:
    """校验滑块位置；成功返回一次性 captcha_token，失败返回 None。

    挑战一次性：无论成败均作废（失败需前端换题重试，防爆破枚举）。
    """
    entry = _challenges.pop(captcha_id, None)
    if not entry:
        return None
    target_x, expires_at = entry
    if time.time() > expires_at:
        return None
    if abs(x - target_x) > TOLERANCE:
        return None

    token = f"cap_{secrets.token_urlsafe(32)}"
    _tokens[token] = time.time() + TOKEN_TTL
    return token


def consume_token(token: str) -> bool:
    """校验并消费 captcha_token（一次性）。"""
    if not token:
        return False
    expires_at = _tokens.pop(token, None)
    return expires_at is not None and time.time() <= expires_at
