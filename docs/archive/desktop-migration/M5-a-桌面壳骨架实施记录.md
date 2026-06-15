# 方案 B · M5-a 桌面壳骨架 实施记录

> 本文记录 **M5-a「Electron 桌面壳骨架（可运行）」** 的落地实现与验证结果。计划与决策见 `M5-实施计划.md`（§1 四项拍板决策、§4 M5-a 退出标准）。
>
> 范围：在项目根新建 `desktop/` Electron 工程；主进程负责拉起/守护本地代理、生成注入配对令牌、注入运行时配置、安全存储登录 token、重做一键启动；渲染层复用 `frontend/dist`。**不改** `local-agent/` 与后端核心实现（仅按现有接口对接）；前端仅做最小必要改动（token 存储分形态、launcher IPC 分流）。
>
> 状态：**已实现并通过分层验证**（含 cloud-demo deploy 编排闭环）。

---

## 1. 交付物与目录结构

新建 `desktop/`（Electron + TypeScript，编译至 `dist-electron/`）：

```
desktop/
├── package.json            # 脚本：dev / build / start / smoke:agent（+ M5-c 的 pack/dist）
├── tsconfig.json           # TS → dist-electron（CommonJS, ES2022）
├── electron-builder.yml    # M5-c 打包脚手架（Windows NSIS + extraResources，本阶段未启用）
├── README.md
├── .gitignore
├── scripts/
│   ├── smoke-agent.cjs       # 无 GUI 验证：拉起/令牌/崩溃重启/退出清理
│   └── verify-injection.cjs  # 起隐藏窗口验证：运行时配置注入/桌面桥/token/launcher
└── src/
    ├── shared/types.ts        # 主进程↔预加载 共享类型 + IPC 通道常量
    ├── main/
    │   ├── index.ts            # 主进程入口：启动顺序编排、窗口、退出清理
    │   ├── localAgentManager.ts  # 子进程管理（仅 Node 内置，无 electron 依赖 → 可单测）
    │   ├── portFinder.ts       # 探测空闲端口
    │   ├── pairing.ts          # 生成高熵配对令牌
    │   ├── runtimeConfig.ts    # 组装 __VIBEBARA_RUNTIME__ 负载
    │   ├── userConfig.ts       # 云端地址：内置默认 + 配置文件/env 覆盖
    │   ├── tokenStore.ts       # safeStorage 加密持久化登录 token
    │   ├── deviceId.ts         # device_id 预留（本机持久临时 uuid 占位）
    │   ├── launcher.ts         # cursor/codex-cli/codex-app 启动（重做 launcher.py）
    │   └── ipc.ts              # 注册 IPC 处理器
    └── preload/index.ts        # contextBridge 注入 __VIBEBARA_RUNTIME__ / __VIBEBARA_DESKTOP__
```

`package.json` 脚本：

| 脚本 | 作用 |
| --- | --- |
| `npm run build` | `tsc -p tsconfig.json` → `dist-electron/` |
| `npm start` | `electron .`（加载 `../frontend/dist/index.html`；设 `VIBEBARA_DEV_SERVER_URL` 则指向 Vite dev server） |
| `npm run dev` | 编译 + 启动 |
| `npm run smoke:agent` | 本地代理进程管理 smoke（无 GUI） |
| `pack:win` / `dist:win` | M5-c：electron-builder 打 Windows 包（需后续安装 electron-builder） |

---

## 2. 各任务项落地

### 2.1 Electron 脚手架（任务 1）

- 主进程 `src/main/index.ts` + 预加载 `src/preload/index.ts` + `BrowserWindow`。
- 窗口加载：prod 加载 `frontend/dist/index.html`（`resolvePaths()` 按 `app.isPackaged` 区分 dev 项目根 / packaged `resourcesPath`）；dev 设 `VIBEBARA_DEV_SERVER_URL` 时 `loadURL` 指向 Vite dev server。
- `webPreferences`：`contextIsolation:true` + `nodeIntegration:false` + `sandbox:false`（preload 需 require 编译后的电子模块，渲染层无 Node 能力）。

### 2.2 本地代理进程管理（任务 2，`localAgentManager.ts`）

- **拉起**：`spawn(process.execPath, [agentEntry, ...], { env: { ELECTRON_RUN_AS_NODE:'1', ... } })`——用 Electron 自带 Node 以纯 Node 模式跑 `local-agent/dist/index.js`，**用户机无需预装 node**。
- **端口分配**：`portFinder.findFreePort(51873)` 优先用 local-agent dev 默认端口（便于诊断），占用则回退 OS 临时端口。
- **令牌/端口/可写根注入（env）**：`VIBEBARA_PAIRING_TOKEN` / `VIBEBARA_LOCAL_AGENT_PORT` / `VIBEBARA_WRITABLE_ROOTS`（`;` 分隔），与 `local-agent/src/config.ts` 的 env 解析对齐。
- **健康探测**：轮询 `GET /local/health`（免令牌端点），就绪（`ok:true`）才返回；超时（默认 15s）抛错但不阻塞建窗（代理后台自重启）。
- **崩溃自动重启**：子进程 `exit` 且非主动停止 → 退避重启（500ms→1s→2s→4s→8s），连续失败上限 10 次保护防风暴；重启后健康恢复则重置计数。
- **退出清理**：`stop()` 同步置 `stopping=true` + `child.kill()`；主进程 `before-quit` / `will-quit` / `process exit` / SIGINT / SIGTERM 均挂 `shutdownAgent`，杜绝僵尸 node。
- 本模块**仅依赖 Node 内置**（`child_process`/`http`），不 import electron，故可被 `smoke-agent.cjs` 在纯 node 下直接加载验证。

### 2.3 配对令牌（任务 3，`pairing.ts`）

- `generatePairingToken(32)` = `crypto.randomBytes(32).toString('base64url')`（43 字符），与 `local-agent/src/auth.ts`、`backend/app/core/security.py` 算法语义兼容（校验侧只做「非空 + 常量时间相等」）。
- **主进程生成 → env 注入本地代理 + 经 preload 注入渲染层 `__VIBEBARA_RUNTIME__.pairingToken`**，符合 M2 决议④「主进程注入、云端不签发」。

### 2.4 运行时配置注入（任务 4，`runtimeConfig.ts` + `preload/index.ts`）

- 注入字段与 `frontend/src/runtime/config.ts` 的 `VibebaraRuntimeConfig` **一致**：`mode='desktop'`、`cloudApiBase`、`cloudWsBase`、`localAgentBase`、`localAgentPort`、`pairingToken`、`orchestration=true`、`deviceId`。
- 云端地址（决策 C）：内置默认指向本机 cloud demo（`http://127.0.0.1:8000/api/v1`、`ws://127.0.0.1:8000`），可由 `<userData>/vibebara-desktop.config.json` 或 env（`VIBEBARA_CLOUD_API_BASE` / `VIBEBARA_CLOUD_WS_BASE`）覆盖。
- **注入时序**：主进程先组装 runtimeConfig + 注册 IPC，再建窗口；preload 用 `ipcRenderer.sendSync` 同步取已就绪配置后 `contextBridge.exposeInMainWorld('__VIBEBARA_RUNTIME__', cfg)`，确保窗口脚本读到时已就绪。

### 2.5 token 安全存储（任务 5，`tokenStore.ts` + 前端 `tokenStorage.ts`）

- 桌面侧：`safeStorage`（Windows DPAPI）加密落盘 `<userData>/vibebara-token.bin`；加密不可用时回退明文并告警。
- 暴露：preload 启动 `sendSync(TOKEN_GET_SYNC)` 同步缓存进渲染层；`__VIBEBARA_DESKTOP__.token.{getSync,set,clear}`，写时更新缓存 + 异步 `invoke` 加密落盘（解决「拦截器/路由守卫同步读」与「safeStorage 跨进程异步」的矛盾）。
- 前端：新增 `frontend/src/runtime/tokenStorage.ts`，桥存在→走桥，否则→localStorage。**web 形态保持不变**。

### 2.6 launcher 一键启动重做（任务 6，`launcher.ts` + `ipc.ts`）

- 在主进程用 TS 重做 `cursor`/`codex-cli`/`codex-app` 解析与启动，口径对齐 `backend/app/api/launcher.py`：
  - `which()`（`where`/`which`）查可执行；`codex-app` 在 Windows 走 `Get-StartApps` AppX → `shell:AppsFolder\<AppID>`（`explorer.exe` 启动）。
  - `codex-cli` 新终端窗口启动；`cursor`/`codex-app` 后台 detached 启动。
- 经 IPC（`LAUNCHER_LIST` / `LAUNCHER_LAUNCH`）暴露；前端 `api/launcher.ts` 桥存在→IPC，否则→云端 `/launcher`（local 模式后端仍挂载）。

### 2.7 device_id 预留（任务 7，`deviceId.ts`）

- `getOrCreateDeviceId()` 生成并持久化本机临时 uuid（`<userData>/vibebara-device.json`），注入 `runtimeConfig.deviceId` 与桥 `deviceId`。
- **占位声明**：文件内 `note` 与代码注释均标注「最终设备身份/注册方案由『平台安装态多机持久化设计』定夺」，**未自创最终设备模型**。前端 `VibebaraRuntimeConfig.deviceId?` 为可选预留，仅透传不做业务判断。

---

## 3. 前端改动清单（最小、灰度安全）

| 文件 | 改动 | 形态影响 |
| --- | --- | --- |
| `runtime/config.ts` | 接口新增可选 `deviceId?` + `getDeviceId()` | 仅预留，web 下 undefined |
| `runtime/desktopBridge.ts`（新增） | 桌面桥类型 + `getDesktopBridge()` / `isDesktop()` | web 下桥不存在 → null |
| `runtime/tokenStorage.ts`（新增） | token 存储抽象（桥/localStorage 分流） | web 走 localStorage（不变） |
| `api/client.ts` | 拦截器 token 取值改 `getToken()` | web 行为等价 |
| `stores/authStore.ts` | token 读/写/清改 `getToken/setToken/removeToken` | web 行为等价 |
| `router/index.ts` | 守卫 token 改 `getToken()` | web 行为等价 |
| `composables/useWebSocket.ts`、`useSkillSync.ts` | WS token 改 `getToken()` | web 行为等价 |
| `api/launcher.ts` | `launchTool`/`listTools` 桥存在→IPC，否则→云端 | web 走 `/launcher`（不变） |

> 未改 `local-agent/` 与后端任何实现。`vibebara_user_id`（非敏感）仍存 localStorage，未纳入安全存储。

---

## 4. 验证结果

环境：Windows / Node v22.22.0 / Electron 33 / MySQL 监听 3306。

### 4.1 构建

| 项 | 命令 | 结果 |
| --- | --- | --- |
| local-agent 构建 | `local-agent> npm run build` | ✅ |
| desktop 依赖安装 | `desktop> npm install` | ✅ 72 包 |
| desktop 编译 | `desktop> npm run build` | ✅ `dist-electron/{main,preload,shared}` |
| 前端构建（含改动） | `frontend> npm run build` | ✅ `vue-tsc` 类型检查 + vite build 通过 |

### 4.2 本地代理进程管理 smoke（`npm run smoke:agent`，无 GUI）

```
PASS  拉起+健康  agentVersion=1.0.0 apiVersion=local-agent/v1 paired=true pid=3156
PASS  配对令牌  带令牌→200 browse；缺令牌→401 UNAUTHORIZED
PASS  崩溃重启  oldPid=3156 → newPid=25832（健康恢复）
PASS  退出清理  stop() 后端口无响应（子进程已清理）
```

→ 拉起（env 注入令牌生效 `paired=true`）、健康探测、配对令牌强制、崩溃自动重启、退出清理 全部通过。

### 4.3 注入生效验证（`electron scripts/verify-injection.cjs`，隐藏窗口回读渲染层全局）

```json
{
  "agentHealthy": true, "agentPort": 51920,
  "runtimeMode": "desktop", "orchestration": true,
  "cloudApiBase": "http://127.0.0.1:8000/api/v1", "cloudWsBase": "ws://127.0.0.1:8000",
  "localAgentBase": "http://127.0.0.1:51920", "pairingTokenLen": 43,
  "runtimeDeviceId": "verify-device-uuid-0001",
  "desktopMode": "desktop", "bridgeDeviceId": "verify-device-uuid-0001",
  "tokenSync": "persisted-bearer-token-abc", "hasTokenSet": true,
  "toolCount": 3, "toolIds": ["cursor", "codex-cli", "codex-app"]
}
```

→ 渲染层读到 `window.__VIBEBARA_RUNTIME__`（`mode=desktop`、`orchestration=true`、云端地址、`localAgentBase`=分配端口、43 字符配对令牌、`deviceId`）；桌面桥 `__VIBEBARA_DESKTOP__` 的 token 同步读 + launcher IPC 列举（3 工具）均生效。前端 `getRuntimeConfig()` 将走 desktop 分支。

### 4.4 cloud-demo deploy 编排闭环（最佳验证，`backend> python -m tests.test_e2e_orchestration`）

后端 `DEPLOYMENT_MODE=cloud` + 真实 MySQL + 真实 local-agent（node 子进程），按 `frontend/src/api/orchestration.ts` 步骤串通：

```
PASS  deploy    installedHash=a7d86ba876c2a4dc… (云端/本地代理位级一致), status=synced
PASS  push      change_items=1, repo_version→2, broadcast skill.pushed
PASS  pull      installedHash=d76c15a69494cb8b… (位级一致), status=synced, change_log actions=['deployed','pulled','pushed']
PASS  security  缺令牌→401 UNAUTHORIZED；白名单外路径→403 WRITE_ROOT_FORBIDDEN
```

→ `build-artifact → write-skill → hash → register-deployment` 闭环跑通，云端与本地代理 hash 位级一致；push/pull/安全约束均通过。该测试是桌面壳所注入的**同一套前端编排链路**在后端+代理层的等价闭环验证。

### 4.5 验证范围说明

- 桌面壳自身的进程管理（4.2）、渲染层注入（4.3）、编排闭环（4.4）三层均绿。
- **未自动化**的仅剩「在可见 Electron 窗口内手动点击 deploy 驱动 4.4 闭环」——需运行中的 cloud-demo 后端 + 登录 + 选定项目目录的人工交互。4.3 已证明 `BrowserWindow + preload + loadURL` 在本环境可用、注入与桥可调；4.4 已证明闭环逻辑正确。手动 GUI 联调步骤见 §6。

---

## 5. device_id 预留方式（小结）

- 主进程 `deviceId.ts` 生成/持久化本机临时 uuid（`<userData>/vibebara-device.json`，含 `note` 占位声明）。
- 注入 `runtimeConfig.deviceId` + 桥 `deviceId`；前端 `VibebaraRuntimeConfig.deviceId?` 可选预留 + `getDeviceId()`。
- **不定型最终模型**：等「平台安装态多机持久化设计」定稿后替换为最终设备身份/注册方案。

---

## 6. 手动 GUI 联调步骤（环境就绪时执行）

1. 起 cloud-demo 后端：`backend> set DEPLOYMENT_MODE=cloud` 后 `uvicorn app.main:app --host 127.0.0.1 --port 8000`（确保 MySQL 可连）。
2. 构建前端：`frontend> npm run build`；构建本地代理：`local-agent> npm run build`。
3. 起桌面壳：`desktop> npm run build && npm start`（云端默认即指向 127.0.0.1:8000；如需可在 `<userData>/vibebara-desktop.config.json` 覆盖，并按需在该配置或 `VIBEBARA_WRITABLE_ROOTS` 注入项目可写根）。
4. 壳内登录 → 浏览/选定项目目录（browse 即登记可写根）→ 部署 Skill，观察 deploy/push/pull 闭环与项目动态实时同步。

---

## 7. 需协调者拍板 / 待与持久化设计对齐的点

1. **最终 `deviceId` / 设备身份模型**（待与「平台安装态多机持久化设计」对齐）：M5-a 仅占位，是否需要「设备注册」云端端点、与配对令牌职责如何切分，由该设计定夺（M5-b）。
   - ✅ **已落地（见 `M5-功能修复记录.md` §1）**：占位 uuid 升格 `clientUuid`，登录后调 `POST /devices/register` 由云端服务端铸造规范 `device_id` 回写本机（注入优先级 `registeredDeviceId ?? clientUuid`）；注册端点只铸造身份、不签发配对令牌（守决议④）。
2. **本地代理端口漂移**（待确认策略）：M5-a 重启复用同一探测端口；若需「重启后端口变化时经 IPC 向渲染层推送更新 localAgentBase」更稳妥，需在 M5-b/收尾确认是否实现（当前固定端口 + 文档登记）。
   - ✅ **已落地（见 `M5-功能修复记录.md` §2）**：`localAgentManager` 重启重探端口 + 解析实际监听端口，端口漂移经 IPC `LOCAL_AGENT_CHANGED` 推送渲染层；前端 `localAgentClient` baseURL 动态读取 + 订阅热更，对用户透明。
3. **白名单「显式注册端点」**（M2 决议⑤延后项）：是否在桌面交互阶段新增「确认可写根」端点（突破本地代理 7 端点冻结），与桌面「确认部署目录」交互一并设计；当前沿用 browse 登记。
   - ✅ **已收紧（见 `M5-功能修复记录.md` §3）**：`/local/browse` 去掉登记副作用（纯只读），写盘授权绑定到「用户确认选定的 deployPath 根」（write-skill 登记 + realpath/`..` 逃逸校验），**保持 7 端点冻结**。是否进一步加「显式确认端点」防御被攻陷渲染层仍待拍板。
4. **资源 inline→url**（M2 决议⑥延后项）：大二进制切对象存储 + 带 Bearer 下载校验 sha256，触发时机由协调者按膨胀压力定。
5. **migrate「先入库再迁移」UI**（M4 收尾遗留）：薄代理下迁移要求目标 Skill 已入库，需桌面端补引导 UI。
6. **token 安全存储灰度**：`safeStorage` 加密不可用（极少见）时当前回退明文并告警；是否改为「拒绝存储 + 提示」由协调者定。

---

## 8. 约束遵守

- 新建 `desktop/` 工程；前端仅最小改动（token 分形态、launcher IPC 分流、deviceId 预留），未破坏 web/local 形态。
- 未改 `local-agent/` 与后端核心实现，仅按现有接口对接（env 注入 + 7 端点 + 现有云端编排端点）。
- 未编辑「平台安装态多机持久化设计」相关文件；本次仅新增 `M5-实施计划.md` 与本实施记录。
