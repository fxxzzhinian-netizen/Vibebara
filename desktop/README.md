# Vibebara 桌面壳（Electron / 方案 B M5-a）

桌面客户端外壳：主进程拉起并守护本地代理 `local-agent`、生成并注入配对令牌、注入
`window.__VIBEBARA_RUNTIME__` 运行时配置、用 `safeStorage` 安全存储登录 token、在本机
重做一键启动 launcher。渲染层复用 `../frontend/dist` 构建产物。

> 设计与决策见 `docs/archive/desktop-migration/M5-实施计划.md`、落地与验证见
> `docs/archive/desktop-migration/M5-a-桌面壳骨架实施记录.md`。

## 目录结构

```
desktop/
├── package.json            # Electron 工程 + dev/build/start/smoke 脚本
├── tsconfig.json           # TS → dist-electron（CommonJS）
├── electron-builder.yml    # M5-c 打包脚手架（Windows-first，本阶段未启用）
├── scripts/
│   └── smoke-agent.cjs      # 无 GUI 验证本地代理拉起/令牌/重启/清理
└── src/
    ├── shared/types.ts      # 主进程↔预加载 共享类型 + IPC 通道常量
    ├── main/
    │   ├── index.ts          # 主进程入口：启动顺序编排、窗口、退出清理
    │   ├── localAgentManager.ts  # 子进程管理（端口/令牌/健康/重启/清理，仅 Node 内置）
    │   ├── portFinder.ts     # 探测空闲端口
    │   ├── pairing.ts        # 生成高熵配对令牌（与 security.py 兼容）
    │   ├── runtimeConfig.ts  # 组装 window.__VIBEBARA_RUNTIME__ 负载
    │   ├── userConfig.ts     # 云端地址：内置默认 + 配置文件/env 覆盖
    │   ├── tokenStore.ts     # safeStorage 加密持久化登录 token
    │   ├── deviceId.ts       # device_id 预留（本机持久临时 uuid 占位）
    │   ├── launcher.ts       # cursor/codex-cli/codex-app 启动（重做 launcher.py）
    │   └── ipc.ts            # 注册 IPC 处理器
    └── preload/index.ts      # contextBridge 注入 __VIBEBARA_RUNTIME__ / __VIBEBARA_DESKTOP__
```

## 前置

- Node ≥ 20。
- 先构建本地代理：`cd ../local-agent && npm install && npm run build`。
- 前端产物（prod 加载）：`cd ../frontend && npm install && npm run build`（生成 `frontend/dist`）。

## 开发 / 运行

```powershell
cd desktop
npm install
npm run build      # 编译 TS → dist-electron
npm start          # 启动桌面壳（默认加载 ../frontend/dist/index.html）
# 或指向 Vite dev server（前端 npm run dev 后）：
#   $env:VIBEBARA_DEV_SERVER_URL = "http://localhost:5173"; npm start
```

`npm run dev` = 编译 + 启动。

## 验证（无 GUI）

```powershell
npm run build
npm run smoke:agent   # 验证本地代理拉起/配对令牌/崩溃重启/退出清理
```

## 云端地址覆盖

默认指向本机 cloud demo（`http://127.0.0.1:8000/api/v1`、`ws://127.0.0.1:8000`）。覆盖方式：

- 配置文件：`<userData>/vibebara-desktop.config.json`（`cloudApiBase` / `cloudWsBase` / `writableRoots`）。
- 环境变量（联调优先）：`VIBEBARA_CLOUD_API_BASE` / `VIBEBARA_CLOUD_WS_BASE` / `VIBEBARA_WRITABLE_ROOTS`（`;` 分隔）。

`<userData>` 在 Windows 为 `%APPDATA%/@vibebara/desktop`（以 Electron app name 为准）。

## 打包（M5-c）

`electron-builder.yml` 已提供脚手架（Windows NSIS + extraResources 打入 local-agent/frontend 产物）。
完整打包/签名/自动更新属 M5-c，需安装 `electron-builder` 并配置代码签名证书（长周期项，提前申请）。
