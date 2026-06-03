"""DEPLOYMENT_MODE 启动分支 + 路由挂载验证（方案 B M1 / M2 收尾）。

不连真实 DB：monkeypatch lifespan 内的 DB/seed/Store/Watcher 依赖，
仅断言运行模式分支正确：
- cloud：FileWatcherService.start(watch_deployments=False)，不调度本地扫描。
- local：FileWatcherService.start(watch_deployments=True 默认)，保留扫描调度入口。

M2 评审决议②（cloud 下线 launcher / adapters HTTP 路由）路由差异断言：
- cloud：create_app() 路由中不含 /api/v1/launcher、/api/v1/adapters 前缀；
  仍含 /api/v1/auth、/api/v1/projects、/api/v1/sessions、/ws。
- local：仍含 /api/v1/launcher、/api/v1/adapters（维持现状）。

可直接运行：`python -m tests.test_deployment_mode`（无需 pytest）。
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import app.main as m


class _Recorder:
    def __init__(self):
        self.start_calls = []
        self.auto_scan_calls = []


def _patch(monkey: _Recorder):
    async def fake_init_db():
        return None

    async def fake_seed():
        return None

    async def fake_store_init(store_dir):
        return None

    async def fake_start(store_dir, watch_deployments=True):
        monkey.start_calls.append({"store_dir": store_dir, "watch_deployments": watch_deployments})

    async def fake_stop():
        return None

    async def fake_init_all(adapters):
        return None

    def fake_get_all():
        return {}

    async def fake_shutdown_all():
        return None

    async def fake_close_db():
        return None

    async def fake_auto_scan(path):
        monkey.auto_scan_calls.append(path)

    m.init_db = fake_init_db
    m._seed_default_users = fake_seed
    m.NativeSkillStore.init = classmethod(lambda cls, store_dir: fake_store_init(store_dir))
    m.FileWatcherService.start = classmethod(lambda cls, store_dir, watch_deployments=True: fake_start(store_dir, watch_deployments))
    m.FileWatcherService.stop = classmethod(lambda cls: fake_stop())
    m.AdapterRegistry.initialize_all = classmethod(lambda cls, adapters: fake_init_all(adapters))
    m.AdapterRegistry.get_all_adapters = classmethod(lambda cls: fake_get_all())
    m.AdapterRegistry.shutdown_all = classmethod(lambda cls: fake_shutdown_all())
    m.SkillRegistry.auto_scan = classmethod(lambda cls, path: fake_auto_scan(path))
    m.close_db = fake_close_db


async def _run_lifespan_once(mode: str) -> _Recorder:
    rec = _Recorder()
    _patch(rec)
    m.settings.DEPLOYMENT_MODE = mode
    async with m.lifespan(m.app):
        pass
    return rec


def test_cloud_mode_disables_deployment_poll():
    rec = asyncio.run(_run_lifespan_once("cloud"))
    assert len(rec.start_calls) == 1, rec.start_calls
    assert rec.start_calls[0]["watch_deployments"] is False
    assert rec.auto_scan_calls == [], "cloud 模式不应自动扫描本地目录"


def test_local_mode_keeps_full_watcher():
    rec = asyncio.run(_run_lifespan_once("local"))
    assert len(rec.start_calls) == 1, rec.start_calls
    assert rec.start_calls[0]["watch_deployments"] is True


# --- M2 评审决议②：cloud 下线 launcher / adapters HTTP 路由 ---


def _route_paths(mode: str):
    """以指定运行模式构造 app，返回全部路由 path 列表。

    create_app() 在构造时读取 settings.DEPLOYMENT_MODE 决定挂载哪些路由，
    故先设置模式再构造。不触发 lifespan，无需 DB。
    """
    m.settings.DEPLOYMENT_MODE = mode
    app = m.create_app()
    return [getattr(r, "path", "") for r in app.routes]


def _has_prefix(paths, prefix: str) -> bool:
    return any(p.startswith(prefix) for p in paths)


def test_cloud_mode_unmounts_launcher_and_adapters():
    paths = _route_paths("cloud")
    # 决议②：cloud 下线 launcher / adapters 的 HTTP 路由
    assert not _has_prefix(paths, "/api/v1/launcher"), paths
    assert not _has_prefix(paths, "/api/v1/adapters"), paths
    # 其余路由保持挂载
    assert _has_prefix(paths, "/api/v1/auth"), paths
    assert _has_prefix(paths, "/api/v1/projects"), paths
    assert _has_prefix(paths, "/api/v1/sessions"), paths
    assert _has_prefix(paths, "/ws/"), paths


def test_local_mode_mounts_launcher_and_adapters():
    paths = _route_paths("local")
    # local 维持现状：launcher / adapters 照常挂载
    assert _has_prefix(paths, "/api/v1/launcher"), paths
    assert _has_prefix(paths, "/api/v1/adapters"), paths
    # 共用路由同样在位
    assert _has_prefix(paths, "/api/v1/auth"), paths
    assert _has_prefix(paths, "/api/v1/projects"), paths
    assert _has_prefix(paths, "/api/v1/sessions"), paths
    assert _has_prefix(paths, "/ws/"), paths


def _run_all():
    test_cloud_mode_disables_deployment_poll()
    print("  PASS  test_cloud_mode_disables_deployment_poll")
    test_local_mode_keeps_full_watcher()
    print("  PASS  test_local_mode_keeps_full_watcher")
    test_cloud_mode_unmounts_launcher_and_adapters()
    print("  PASS  test_cloud_mode_unmounts_launcher_and_adapters")
    test_local_mode_mounts_launcher_and_adapters()
    print("  PASS  test_local_mode_mounts_launcher_and_adapters")
    print("\nAll 4 deployment-mode tests passed.")


if __name__ == "__main__":
    _run_all()
