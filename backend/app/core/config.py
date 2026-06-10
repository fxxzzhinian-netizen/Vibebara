import os
from pathlib import Path
from typing import List, Literal, Optional

from pydantic import model_validator
from pydantic_settings import BaseSettings

# backend 根目录（config.py 位于 backend/app/core/config.py → parents[2] = backend）
_BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    APP_NAME: str = "Vibebara"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = True

    # 运行模式开关（方案 B M1）：
    #   "local" = 浏览器+后端+用户文件同机的现状形态（默认，保持兼容）
    #   "cloud" = 云端中央后端，不依赖本地用户文件、不轮询本地部署目录
    DEPLOYMENT_MODE: Literal["local", "cloud"] = "local"

    # 监听地址/端口（云端通常由反向代理/HTTPS 终止，这里仅代码层可配置）
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # ------------------------------------------------------------------
    # 数据库
    # ------------------------------------------------------------------
    DATABASE_URL: str = "mysql+aiomysql://root:@localhost:3306/cowork?charset=utf8mb4"

    # 连接池（供托管 MySQL 调优；默认值与既有 database.py 行为一致）
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20
    DB_POOL_RECYCLE: int = 1800
    DB_POOL_PRE_PING: bool = False
    # SQL echo：None → 跟随 DEBUG（保持现状）；显式 True/False 可覆盖
    DB_ECHO: Optional[bool] = None
    # 启动时自动建表（init_db 的 create_all + 增量列迁移）。
    # 开发/本地默认开启作为兜底；云端用 Alembic 管理时可设为 false。
    DB_AUTO_CREATE: bool = True

    # 托管 MySQL TLS（默认关闭，不影响本地明文连接）
    DB_SSL_ENABLED: bool = False
    DB_SSL_CA: str = ""          # CA 证书路径（设置后自动启用 TLS）
    DB_SSL_VERIFY: bool = True   # 是否校验服务端证书/主机名

    # ------------------------------------------------------------------
    # CORS / 来源
    # ------------------------------------------------------------------
    ALLOWED_ORIGINS: List[str] = ["http://localhost:5173", "http://localhost:3000"]
    # 桌面端来源（Electron）匹配：file:// 的 Origin 多为 "null"，app://、自定义 scheme
    # 需用正则匹配。默认空字符串=不启用（不影响本地开发）。
    # 示例：^(app|vibebara|file)://.*$
    ALLOW_ORIGIN_REGEX: str = ""

    ENABLED_ADAPTERS: List[str] = ["cursor", "copilot", "windsurf", "claude"]

    # ------------------------------------------------------------------
    # 安全 / 鉴权（方案 B M2）
    # ------------------------------------------------------------------
    # 独立的 token 签名密钥（停止复用 LLM_API_KEY）。
    #   - 留空 → auth_service 回退到「稳定的开发默认密钥」（重启不失效，
    #     不会因随机化导致已签发 token 全部失效）；
    #   - cloud 模式下若仍为空将打印显著告警，生产务必通过环境注入高熵值。
    # 注意：切换该值会使所有旧 token 失效（用户需重新登录）。
    JWT_SECRET: str = ""

    # session WS（/ws/{session_id}）是否强制鉴权（local 形态的显式开关）。
    #   - 默认 False = local 形态保持现有 sessions 协作功能（历史前端可能未传 token）不被破坏；
    #   - 置 True 后该端点强制校验 token 且 user_id 必须与 token 一致。
    # 方案 B · M4（M2 决议①）：**cloud 形态默认强制**会话 WS 鉴权——
    #   routes.py 的有效判定为 `WS_SESSION_AUTH_REQUIRED or DEPLOYMENT_MODE=="cloud"`，
    #   故 cloud 下本字段即便为 False 也强制校验（前端 useWebSocket 已补传 token）。
    # 项目级 WS（/ws/project/{project_id}）为 M2 硬性强制鉴权，不受此开关影响。
    WS_SESSION_AUTH_REQUIRED: bool = False

    # ------------------------------------------------------------------
    # 滑块人机验证（登录/注册）
    # ------------------------------------------------------------------
    # True = 登录/注册必须携带滑块验证 token（默认）；本地开发/脚本调试可设 false。
    # 挑战与 token 为进程内存态，依赖单进程部署（同 WS hub 约束）。
    CAPTCHA_REQUIRED: bool = True

    # ------------------------------------------------------------------
    # 注册邀请码（测试版收口注册入口）
    # ------------------------------------------------------------------
    # True = 注册必须提供有效邀请码（种子用户不受影响）；本地开发可设 false 放开。
    INVITE_CODE_REQUIRED: bool = True
    # 邀请码管理端点（签发/列表/禁用）的管理员用户名白名单。
    # 环境变量注入用 JSON 形式：ADMIN_USERNAMES=["DAIL"]
    ADMIN_USERNAMES: List[str] = ["DAIL"]

    # ------------------------------------------------------------------
    # 数据目录 / Skill 存储（去 user-home 语义耦合）
    # ------------------------------------------------------------------
    # 显式数据根目录。空 → 取环境变量 COWORK_DATA_DIR；再空 → backend/data。
    # 不再隐含 Path.home()，Windows/Linux 通用。
    COWORK_DATA_DIR: str = ""
    SKILL_SCAN_DIR: str = ""
    # 平台原生 skill 集中存储目录。空 → {data_dir}/skills。仅 STORAGE_BACKEND=local 使用。
    SKILL_STORE_DIR: str = ""

    # ------------------------------------------------------------------
    # 对象存储（Skill 持久化后端）
    # ------------------------------------------------------------------
    # "local" = 本地文件系统（开发默认，键映射到 COWORK_DATA_DIR 下）；
    # "cos"   = 腾讯云 COS 对象存储（生产，需配 COS_* 凭证）。
    STORAGE_BACKEND: Literal["local", "cos"] = "local"
    COS_BUCKET: str = ""          # 形如 vibebara-1327732770（含 AppId）
    COS_REGION: str = ""          # 形如 ap-chengdu
    COS_SECRET_ID: str = ""       # 经环境变量注入，勿入库/前端/git
    COS_SECRET_KEY: str = ""
    COS_PREFIX: str = ""          # 桶内统一前缀（多环境共享一桶时区分），默认空
    # 启动时按 COS 前缀列举重建 DB 索引（_sync_from_filesystem）。skill 多时可关，信任 DB。
    SKILL_STORE_SYNC_ON_START: bool = True

    LLM_BASE_URL: str = "https://api.gptsapi.net"
    LLM_API_KEY: str = ""
    LLM_MODEL: str = "gpt-4o"

    class Config:
        env_file = ".env"

    @model_validator(mode="after")
    def _resolve_paths(self) -> "Settings":
        """解析数据目录与 Skill 存储目录，移除对 user home 的依赖。"""
        if not self.COWORK_DATA_DIR:
            self.COWORK_DATA_DIR = str(_BACKEND_DIR / "data")
        if not self.SKILL_STORE_DIR:
            self.SKILL_STORE_DIR = str(Path(self.COWORK_DATA_DIR) / "skills")
        return self

    @property
    def db_echo(self) -> bool:
        """SQL echo 最终值：DB_ECHO 显式设置则用之，否则跟随 DEBUG。"""
        return self.DB_ECHO if self.DB_ECHO is not None else self.DEBUG


settings = Settings()
