import asyncio
import shutil
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.adapters.registry import AdapterRegistry
from app.api.sessions import api_router as sessions_router
from app.api.adapters import api_router as adapters_router
from app.api.launcher import api_router as launcher_router
from app.api.skill_forge import api_router as skill_forge_router
from app.api.skill_store import api_router as skill_store_router
from app.api.auth import api_router as auth_router
from app.api.invites import api_router as invites_router
from app.api.teams import api_router as teams_router
from app.api.projects import api_router as projects_router
from app.api.devices import api_router as devices_router
from app.websocket.routes import ws_router
from app.core.database import init_db, close_db
from app.services.skill_forge_service import SkillRegistry
from app.services.native_skill_store import NativeSkillStore
from app.services.file_watcher_service import FileWatcherService


def _print_startup_diagnostics():
    """打印启动诊断信息"""
    print("\n" + "=" * 60)
    print("  Vibebara 后端 - 启动诊断")
    print("=" * 60)

    # skill-forge bridge 检查
    bridge_path = Path(__file__).resolve().parent.parent / "skill-forge" / "bridge.mjs"
    print(f"\n  [skill-forge] bridge 路径: {bridge_path}")
    print(f"  [skill-forge] bridge 存在: {'是' if bridge_path.exists() else '否 ⚠️'}")

    dist_index = bridge_path.parent / "dist" / "index.js"
    print(f"  [skill-forge] dist/index.js 存在: {'是' if dist_index.exists() else '否 ⚠️'}")

    # Node.js 检查
    node_path = shutil.which("node")
    print(f"\n  [Node.js] 路径: {node_path or '未找到 ⚠️'}")
    if node_path:
        import subprocess
        try:
            ver = subprocess.check_output(["node", "--version"], text=True).strip()
            print(f"  [Node.js] 版本: {ver}")
        except Exception as e:
            print(f"  [Node.js] 获取版本失败: {e}")

    print("")


def _print_routes(app: FastAPI):
    """打印所有注册的路由"""
    print("  [路由] 已注册的 API 端点:")
    for route in app.routes:
        if hasattr(route, "methods") and hasattr(route, "path"):
            methods = ",".join(route.methods)
            print(f"    {methods:10s} {route.path}")
    print("")
    print("=" * 60 + "\n")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    mode = settings.DEPLOYMENT_MODE
    is_cloud = mode == "cloud"

    _print_startup_diagnostics()
    print(f"  [启动] 运行模式 DEPLOYMENT_MODE = {mode}")

    print("  [启动] 初始化适配器...")
    await AdapterRegistry.initialize_all(settings.ENABLED_ADAPTERS)
    print(f"  [启动] 已加载适配器: {list(AdapterRegistry.get_all_adapters().keys())}")

    _print_routes(app)

    # MySQL + 表创建（云/本地两种模式均需 DB）
    print("  [启动] 初始化 MySQL 数据库...")
    await init_db()
    print("  [启动] MySQL 表就绪")

    # 初始化预设用户
    print("  [启动] 检查预设用户...")
    await _seed_default_users()

    # Native Skill Store 初始化（对象存储 → DB 同步，云/本地共用）
    print(f"  [启动] 初始化 Native Skill Store: backend={settings.STORAGE_BACKEND}")
    await NativeSkillStore.init(settings.SKILL_STORE_DIR)

    if is_cloud:
        # 云端模式：不主动扫描"用户本地目录"，不轮询本地部署 dirty。
        # STORAGE_BACKEND=cos 时 store 无本地 FS 事件，FileWatcher 会自动跳过监控。
        print("  [启动] cloud 模式：跳过本地 Skill 扫描与本地部署轮询")
        await FileWatcherService.start(
            settings.SKILL_STORE_DIR, watch_deployments=False
        )
    else:
        # 本地模式：维持现状（全功能）
        if settings.SKILL_SCAN_DIR:
            print(f"  [启动] 自动扫描 Skill 目录: {settings.SKILL_SCAN_DIR}")
            asyncio.create_task(SkillRegistry.auto_scan(settings.SKILL_SCAN_DIR))
        else:
            print("  [启动] SKILL_SCAN_DIR 未配置，跳过自动扫描")

        print(f"  [启动] 启动文件监控服务（含本地部署轮询）: {settings.SKILL_STORE_DIR}")
        await FileWatcherService.start(settings.SKILL_STORE_DIR)

    yield
    # Shutdown
    print("\n  [关闭] 正在清理资源...")
    await FileWatcherService.stop()
    await AdapterRegistry.shutdown_all()
    await close_db()
    print("  [关闭] 完成")


def create_app() -> FastAPI:
    """构造 FastAPI app；按 DEPLOYMENT_MODE 条件挂载路由。

    工厂化以便在不同运行模式下可重复构造（含测试断言路由差异）。
    模块级 `app = create_app()` 供 `uvicorn app.main:app` 使用。
    """
    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.ALLOWED_ORIGINS,
        # 桌面端来源（Electron file://、app://、自定义 scheme）经正则放行；
        # 默认空字符串 → None，不影响本地开发的显式 origins 列表。
        allow_origin_regex=settings.ALLOW_ORIGIN_REGEX or None,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    is_cloud = settings.DEPLOYMENT_MODE == "cloud"

    # 始终挂载的 REST 路由（local/cloud 共用）
    app.include_router(sessions_router, prefix="/api/v1")
    app.include_router(skill_forge_router, prefix="/api/v1")
    app.include_router(skill_store_router, prefix="/api/v1")
    app.include_router(auth_router, prefix="/api/v1")
    app.include_router(invites_router, prefix="/api/v1")
    app.include_router(teams_router, prefix="/api/v1")
    app.include_router(projects_router, prefix="/api/v1")
    # 设备身份端点（M5-b 地基）：local/cloud 均挂载（云端数据端点，无本地盘依赖）。
    app.include_router(devices_router, prefix="/api/v1")

    # 本地能力路由：cloud 模式下线 launcher 与 adapters 的 HTTP 路由（M2 评审决议②）。
    # 注意：仅下线 HTTP 路由；lifespan 内的 AdapterRegistry.initialize_all 仍保留，
    # 会话级 WS（/ws/{session_id}）的消息处理仍依赖适配器实例（且有 fallback）。
    if not is_cloud:
        app.include_router(adapters_router, prefix="/api/v1")
        app.include_router(launcher_router, prefix="/api/v1")

    # WebSocket 路由（会话级 /ws/{session_id} + 项目级 /ws/project/{project_id}
    # + 团队级 /ws/team/{team_id}）
    app.include_router(ws_router)

    @app.get("/")
    async def root():
        return {
            "name": settings.APP_NAME,
            "version": settings.APP_VERSION,
            "status": "running",
        }

    @app.get("/health")
    async def health():
        adapters = AdapterRegistry.get_all_adapters()
        adapter_status = {}
        for aid, adapter in adapters.items():
            adapter_status[aid] = await adapter.health_check()

        return {
            "status": "healthy",
            "adapters": adapter_status,
            "active_adapters": len(adapters),
        }

    return app


app = create_app()


async def _seed_default_users():
    """创建预设用户（幂等，已存在则跳过）"""
    from app.services import auth_service

    default_users = [
        {"username": "DAIL", "password": "DAIL2026", "display_name": "DAIL"},
        {"username": "DAIL2", "password": "DAIL2027", "display_name": "DAIL2"},
    ]
    for u in default_users:
        result = await auth_service.register(
            username=u["username"],
            password=u["password"],
            display_name=u["display_name"],
            bypass_invite=True,
        )
        if result.get("success"):
            print(f"  [启动] 创建用户: {u['username']}")
        else:
            print(f"  [启动] 用户已存在: {u['username']}")
