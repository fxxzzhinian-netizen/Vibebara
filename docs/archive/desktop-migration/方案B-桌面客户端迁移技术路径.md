# 方案 B（桌面客户端）迁移技术路径

> 本文解析 Vibebara 从「本机 localhost 单体」迁移到「桌面客户端」形态的主要技术路径、关键改造埋点（代码落点）、接口边界与分阶段实施计划。
>
> 配套可视化评估见 Canvas：`方案 B 改造量评估`。本文为可落地的工程文档，所有埋点均标注到具体文件与函数。

---

## 0. 一句话结论

方案 B 真正可行的形态是 **「桌面端（UI + 本地代理）+ 云端中央后端」**，它 **是方案 A（SaaS + 本地代理）的超集**：必须先完成方案 A 的云端化与后端拆分，再叠加桌面外壳、签名与分发。整体约 **43–78 人天（单人）**，相对方案 A 的净增量约 **+15–28 人天**，外加签名/公证/自动更新的长期维护成本。

---

## 1. 背景与现状

### 1.1 当前为什么 localhost 能跑通

现状下 **浏览器、后端、用户真实开发文件三者同机**。后端代码里所有「本地」其实都是「后端进程所在机器」。一旦后端搬到云服务器，这些操作会作用在**服务器**上，而非每个用户的电脑。

三条决定性的架构事实：

| 事实 | 代码位置 | 影响 |
| --- | --- | --- |
| 部署目录取后端机器 home | `backend/app/services/native_skill_store.py:31-34` | 部署只会写到服务器，不是用户电脑 |
| 构建依赖后端机器的 `node` 子进程 | `backend/app/services/skill_forge_service.py:27-39` | 构建发生在服务器 |
| 实时同步是单进程内存广播 | `backend/app/websocket/hub.py:13-216` | 多个独立后端进程无法互相广播 |
| 数据库默认连本机无密码 | `backend/app/core/config.py:15` | 协作数据无法分散在各客户端 |

### 1.2 协作平台的本质约束

Vibebara 是**团队协作中台**：Skill 仓库、团队/项目关联、推送拉取、项目动态实时同步都依赖**集中的数据与广播**。因此：

- **数据库** 和 **WebSocket 广播** 必须留在云端。
- 只有**触达本地文件系统/本地进程**的能力需要下沉到用户机器。

> 结论：不能把现有单体后端整个塞进客户端连本地库（那会切断协作）。这是 B-1 与 B-2 形态分野的根因（见 §2.2）。

---

## 2. 目标形态

### 2.1 三层架构（B-1，推荐）

```
┌─────────────────────────────────────────────┐
│  桌面客户端 (Electron / Tauri)                 │
│  ┌────────────────┐   ┌──────────────────┐   │
│  │ 渲染层 (Vue 3) │   │ 本地代理 Local Agent│  │
│  │  现有前端       │←→│  localhost:PORT    │   │
│  └───────┬────────┘   │  · 文件落盘         │   │
│          │            │  · 目录浏览/扫描     │   │
│          │            │  · 本地 hash/监控    │   │
│          │            │  (· 可选 node 构建)  │   │
│          │            └─────────┬──────────┘   │
└──────────┼──────────────────────┼──────────────┘
           │ HTTPS / WSS          │ 配对令牌
           ▼                      ▼
┌─────────────────────────────────────────────┐
│  云端中央后端 (FastAPI)                        │
│  · Skill 仓库存储 + 抽象层 diff                │
│  · 团队/项目/部署元数据                         │
│  · 鉴权 / 多租户隔离                            │
│  · WebSocket 单一广播 hub (+Redis 可水平扩展)   │
│  · (可选) 云端 skill-forge 构建                 │
│             │                                  │
│             ▼                                  │
│  托管 MySQL                                     │
└─────────────────────────────────────────────┘
```

### 2.2 两种形态对比

| 维度 | **B-1 协作版**（符合平台定位） | **B-2 单机版**（最快但变味） |
| --- | --- | --- |
| 整体架构 | 桌面端 = UI + 本地代理；数据/广播/仓库在云端 | 整个单体后端 + 本地库全塞进客户端 |
| 团队协作 / 实时同步 | 保留 | 失去（各客户端各自为政） |
| 数据库 | 云端托管 MySQL | 本地 SQLite / 内嵌库 |
| 工作量（单人） | 43–78 人天 | 10–18 人天 |
| 是否符合中台价值 | 是 | 否 |

**本文后续以 B-1 为主线展开。**

---

## 3. 关键技术决策

### 3.1 桌面壳：Electron vs Tauri

| | Electron | Tauri |
| --- | --- | --- |
| 运行时 | 内置 Chromium + Node | 系统 WebView + Rust |
| 安装包体积 | 大（~100MB+） | 小（~10MB） |
| 自带 Node | **是**（可直接跑 skill-forge bridge） | 否（需另带 node 或走薄代理） |
| 团队上手成本 | 低（全 JS/TS） | 中（需 Rust） |
| 与现有栈契合 | 高（前端 Vue、bridge 为 Node） | 中 |

**建议**：优先 **Electron**——现有 skill-forge bridge 是 Node 脚本，Electron 自带 Node 可直接复用，并顺带消除现状中「未找到 node」的痛点（见 `skill_forge_service.py:28`）。

### 3.2 本地代理：薄代理 vs 厚代理（重要）

现状 `deploy()` 流程是：`node 构建 → 得到文件内容字典 contents → 写入目标目录 + 复制资源`（`native_skill_store.py:947-992`）。据此有两种切法：

| | **薄代理（推荐）** | 厚代理 |
| --- | --- | --- |
| 构建 (skill-forge / node) | 放**云端**（云端装 node），返回构建产物 `contents` | 放本地，客户端内嵌 node |
| 本地代理职责 | 仅文件落盘 / 浏览 / 扫描 / hash / 监控 | 落盘 + 本地构建 |
| 客户端是否需要 node | **否** | 是（Electron 自带） |
| 复杂度 | 低，代理极薄 | 中 |

**建议**：采用**薄代理**——云端完成 build，把 `contents` + 资源文件清单通过 API 下发，本地代理只负责把文件写到用户项目目录。这样本地代理可用纯 TS 实现、体积极小，且 B-1/方案 A 共用同一份代理逻辑。

### 3.3 数据库

`MySQL@localhost` 无密码 → **云端托管 MySQL**，配置 TLS、连接池、独立凭据；引入数据库迁移工具（Alembic）。改造点 `core/config.py:15`。

### 3.4 鉴权与多租户

现状已有 HMAC token 框架（`auth_service.py:38-65`），但需强化：

- JWT secret 当前默认绑定 `LLM_API_KEY` 或硬编码 `"vibebara-default-secret"`（`auth_service.py:20`）→ 改为独立强密钥、环境注入。
- WebSocket token 校验**可选**（`websocket/routes.py:38` 中 `if token and not verify_token` —— token 为空直接放行）→ 改为强制。
- 前端 token 存 `localStorage`（`client.ts:11`、`useSkillSync.ts:66`）→ 桌面端改用安全存储（OS keychain / Electron safeStorage）。
- 本地代理与云端的**设备配对**：代理需持有用户身份令牌，确保「云端下发的写盘指令」只作用于本人客户端。

### 3.5 WebSocket 广播

单实例云端部署可**直接沿用**现有进程内 hub（`hub.py`）。仅当云端需要**多实例水平扩展**时，才需把广播改为 Redis pub/sub（或类似）后端。

---

## 4. 改造埋点清单（核心）

> 图例：**[本地]** = 下沉到本地代理；**[云端]** = 云端化改造；**[通信]** = 前后端通信；**[鉴权]** = 安全；**[壳]** = 桌面封装。

### 4.1 [本地] 文件系统 / 本地进程能力下沉

| 埋点 | 文件:行 | 现状 | 改造方向 |
| --- | --- | --- | --- |
| 部署目录常量 | `native_skill_store.py:31-34` | `CURSOR_SKILLS_DIR = Path.home()/.cursor/skills` 等取后端 home | 改由**本地代理**解析用户机器的 home；云端不再持有这些路径 |
| 部署写盘 | `native_skill_store.py:916-1006`（写盘 `963-992`） | 云端直接 `write_text` 到 `dest_path/.cursor/skills` | 云端 build 得到 `contents`，经 API 交给**本地代理写盘** |
| 部署状态探测 | `native_skill_store.py:288-296` | 用 `Path(...).exists()` 探测后端机器 | 由本地代理**上报**部署状态 |
| 外部导入 | `native_skill_store.py:601-732` | `import_from_external(source_path)` 读后端磁盘文件夹 | 本地代理读取用户选定文件夹并上传内容到云端 |
| store 初始化 | `native_skill_store.py:178-181` | 扫描后端 `SKILL_STORE_DIR` | store 迁到云端集中存储（见 4.2） |
| node 构建桥 | `skill_forge_service.py:27-39` | 后端机器 `subprocess` 跑 node | 薄代理：留云端；厚代理：迁本地 |
| 目录浏览 | `skill_forge_service.py:77-123` | `browse_directory` 列后端磁盘盘符 | 迁**本地代理**（浏览用户机器目录） |
| 外部扫描 | `skill_forge_service.py:137-215` | `SkillRegistry` 扫描后端目录 | 迁**本地代理** |
| 跨平台迁移 | `skill_forge_service.py:222-241` | node bridge 迁移本地文件 | 迁**本地代理**（或薄代理下云端构建+本地落盘） |
| 部署入口 | `project_service.py:352-470`（校验 `363-366`） | `deploy_project_skill` 校验 `Path(deploy_path).is_dir()` 在后端 | 校验与落盘交给本地代理；云端只记录部署元数据 |
| 本地改动检测 | `project_service.py:591-622` | `refresh_deployment_dirty` 读 `install_path` hash | 本地代理计算并上报 hash |
| 本地状态查询 | `project_service.py:625-648` | `get_deployment_local_status` 读本地文件 | 本地代理上报 |
| 推送 | `project_service.py:759-982` | `push_deployment` 解析 `install_path` 本地内容 | 本地代理读取本地内容上传，云端做 diff/提升 |
| 拉取更新 | `project_service.py:986-1100` | `pull_update_deployment` 调 `deploy()` 覆盖本地 | 云端 build → 本地代理覆盖写盘 |
| 内容哈希 / 安装根 | `project_service.py:48-89` | `_compute_content_hash` / `_install_root` 读本地路径 | hash 计算移到本地代理 |
| 文件监控 | `file_watcher_service.py`（全文） | 监控后端 `SKILL_STORE_DIR` + 轮询部署 dirty | **本地监控本地**（天然契合）；store 监控逻辑随 store 去向调整 |

### 4.2 [云端] 去本地化

| 埋点 | 文件:行 | 改造方向 |
| --- | --- | --- |
| Skill 存储目录 | `core/config.py:21`（`SKILL_STORE_DIR = ~/.cowork/skills`） | 改为云端集中存储（卷 / 对象存储），移除 `Path.home()` 假设 |
| 数据库连接 | `core/config.py:15` | 托管 MySQL + TLS + 连接池；引入 Alembic 迁移 |
| CORS 白名单 | `core/config.py:17` | 改为线上前端域名 + 桌面端来源 |
| 监听地址 | `core/config.py:12-13` | 云端规范化（反向代理 / HTTPS 终止） |
| 启动编排 | `main.py:65-105`（lifespan） | 拆分：云端只保留 DB/seed/store 同步/广播；本地监控随代理 |

### 4.3 [通信] 前端去 localhost 化

| 埋点 | 文件:行 | 现状 | 改造方向 |
| --- | --- | --- | --- |
| API base | `frontend/src/api/client.ts:3-4` | `baseURL: '/api/v1'`，靠 Vite 代理 | 注入**云端 API 基址**；**本地代理调用**走独立 client（`http://127.0.0.1:PORT`） |
| WebSocket URL | `frontend/src/composables/useSkillSync.ts:66-72` | `window.location.host` 拼 ws | 指向云端 WSS 域名 |
| Vite 代理 | `frontend/vite.config.ts:12-24` | dev 代理 `/api`、`/ws` 到 8000 | 仅开发用；打包后由运行时配置替代 |
| 调用分流 | 全前端 API 层 | 所有请求走同一 client | 区分「云端数据请求」与「本地代理请求（浏览/落盘/扫描/状态）」 |

### 4.4 [鉴权] 安全强化

| 埋点 | 文件:行 | 改造方向 |
| --- | --- | --- |
| JWT secret | `auth_service.py:20` | 独立强密钥、环境注入，停止复用 `LLM_API_KEY` |
| WS 鉴权 | `websocket/routes.py:38-39` | token 由「可选」改为「强制」 |
| token 存储 | `client.ts:11`、`useSkillSync.ts:66` | 桌面端改用 OS 安全存储 |
| 多租户隔离 | `skill_store.py`、`projects.py`（已有 `Depends(get_current_user_id)` 与 team 校验） | 复核所有本地代理回调路径的鉴权，新增设备配对令牌 |

### 4.5 [壳] 桌面封装（B 独有增量）

| 工作 | 说明 |
| --- | --- |
| Electron/Tauri 脚手架 | 主进程、窗口、渲染层加载现有前端构建产物 |
| 本地代理进程管理 | 主进程拉起/守护本地代理，端口分配、崩溃重启 |
| 打包构建矩阵 | Win / macOS（/ Linux）多平台产物 |
| 代码签名 / 公证 | Windows 代码签名证书 + macOS notarization |
| 自动更新 | electron-updater / Tauri updater 通道 + 「客户端版本 × 云端 API 版本」兼容矩阵 |

---

## 5. 接口边界设计（云端 ↔ 本地代理）

### 5.1 留在云端的纯数据端点（无需改造数据流）

`auth`、`teams`、`projects` CRUD、Skill 关联、Skill 仓库 CRUD（list/get/create/update/delete）、项目动态、WebSocket 广播。这些已带鉴权（`Depends(get_current_user_id)` + team 成员校验），保持不变。

### 5.2 需要本地代理承接的端点（当前的「本地能力」）

| 当前端点 | 当前实现 | 迁移后 |
| --- | --- | --- |
| `POST /api/v1/skill-forge/browse` | 列后端磁盘 | → 本地代理 `GET /local/browse` |
| `GET /api/v1/skill-forge/packages`、`POST .../rescan` | 扫描后端目录 | → 本地代理 `POST /local/scan` |
| `POST /api/v1/skill-forge/migrate` | node 迁移本地文件 | → 云端 build + 本地代理落盘 |
| `POST /api/v1/skill-forge/store/import` | 读后端文件夹 | → 本地代理读取并上传内容 |
| `POST /api/v1/skill-forge/store/{id}/build` | node 构建 | → 云端构建（薄代理）|
| `POST /api/v1/skill-forge/store/{id}/deploy` | 构建 + 写后端盘 | → 云端构建 → 本地代理 `POST /local/write-skill` |
| `GET /api/v1/skill-forge/store/{id}/preview` | node 预览 | → 云端构建预览 |
| `POST /api/v1/projects/{pid}/skills/{sid}/deploy` | 校验本地目录 + 部署 | → 本地代理落盘 + 云端登记部署元数据 |
| `POST /api/v1/skill-deployments/{id}/push` | 读本地内容上推 | → 本地代理读取上传 + 云端 diff/提升 |
| `POST /api/v1/skill-deployments/{id}/pull-update` | 覆盖写本地 | → 云端构建 + 本地代理覆盖 |
| `GET /api/v1/skill-deployments/{id}/local-status` | 读本地 hash | → 本地代理上报 |
| `POST /api/v1/skill-deployments/{id}/promote` | 读本地内容 | → 本地代理读取上传 |

### 5.3 本地代理需暴露的最小 API（建议）

```
GET    /local/health                      # 存活探测
GET    /local/browse?path=...             # 目录浏览（替代 skill-forge/browse）
POST   /local/scan        {rootDir}       # 扫描已装 skill（替代 packages/rescan）
POST   /local/read-folder {path}          # 读取本地文件夹内容用于导入
POST   /local/write-skill {destPath, tool, contents, resources}  # 落盘部署产物
POST   /local/hash        {paths[]}       # 计算内容 hash（dirty 检测）
WS     /local/watch                       # 本地变更事件流（替代 file_watcher）
```

> 本地代理所有写操作需校验**配对令牌**，且应将可写根限制在用户选定的项目目录，避免任意路径写入。

---

## 6. 分阶段实施路径

> 工作量单位：单名熟悉该技术栈的工程师人天，含设计/实现/联调，未含产品/测试/文档。

| 里程碑 | 内容 | 归属 | 人天 | 退出标准 |
| --- | --- | --- | --- | --- |
| **M0 解耦设计** | 定义云端↔本地代理协议与边界（§5）；冻结接口 | A 共用 | 5–8 | 接口契约评审通过 |
| **M1 云端化** | DB 迁托管 MySQL；store 集中存储；去 `Path.home`；CORS/监听规范化 | A 共用 | 5–9 | 云端可无本地依赖独立运行 |
| **M2 鉴权强化** | 独立 JWT secret；WS 强制鉴权；多租户复核；设备配对 | A 共用 | 5–8 | 安全评审通过 |
| **M3 本地代理** | 实现 §5.3 本地 API；接管 browse/scan/写盘/hash/watch | A 共用 | 6–10 | 代理可独立完成部署/扫描 |
| **M4 前端分流** | 云端 client 与本地代理 client 分离；运行时配置注入；去代理依赖 | B（部分共用） | 3–5 | 前端同时连云端与本地代理 |
| **M5 桌面封装** | Electron 脚手架 + 代理进程管理 + 本地代理载体打包 + 签名/公证 + 自动更新 | **B 独有** | 19–38 | 三平台可安装、可自更新 |
| | **合计（B-1）** | | **43–78** | |

> 与 Canvas 评估的 43–78 区间一致。M0–M3 与方案 A **完全复用**，M4 部分复用；**B 相对方案 A 的净增量约 +15–28 人天，集中在 M4 后半与 M5**（桌面壳、签名/公证、自动更新含较大不确定性，按团队经验上浮）。

---

## 7. 风险与回滚

| 风险 | 说明 | 缓解 |
| --- | --- | --- |
| 签名/公证流程 | 证书申请、macOS 公证审核耗时且易卡 | 提前申请证书；预留缓冲；先做无签名内测包 |
| 版本兼容矩阵 | 客户端版本与云端 API 版本错配 | API 版本化；客户端启动校验最低兼容版本；强制更新机制 |
| 本地代理安全 | 任意路径写入风险 | 配对令牌 + 可写根白名单 + 仅监听 127.0.0.1 |
| 打包体积/原生依赖 | 厚代理下 Python 打包（aiomysql/watchfiles）体积大 | 采用**薄代理 + 纯 TS**，规避 Python 打包 |
| WebSocket 扩展 | 多实例云端无法跨进程广播 | 单实例先行；扩展时引入 Redis pub/sub |

**回滚策略**：M1–M4 可在现有 localhost 形态下灰度（云端能力与本地能力并存）；M5 桌面包独立发布，失败不影响 Web 形态，可回退到「浏览器访问云端 + 本地代理」过渡形态（即方案 A）。

---

## 8. 验收 Checklist

- [ ] 云端后端在**无任何本地文件依赖**下可独立运行（无 `Path.home` 路径耦合）
- [ ] 桌面客户端可登录、浏览 Skill、查看实时项目动态
- [ ] 「部署到本地项目目录」写入的是**用户本机**而非服务器
- [ ] 「扫描本机已装 Skill」「从本地文件夹导入」作用于用户本机
- [ ] 本地改动可被检测并正确「推送 / 拉取」
- [ ] WebSocket 强制鉴权；token 安全存储
- [ ] 本地代理仅监听 127.0.0.1，写操作受配对令牌 + 白名单约束
- [ ] 三平台安装包可签名、可自动更新

---

## 附录 A：当前涉及「本地」的端点速查

| 端点 | 服务实现 | 本地依赖 |
| --- | --- | --- |
| `POST /skill-forge/browse` | `skill_forge_service.browse_directory` | 后端磁盘 |
| `GET /skill-forge/packages` / `POST /skill-forge/rescan` | `SkillRegistry` | 后端目录扫描 |
| `POST /skill-forge/migrate` | `migrate_skill_via_bridge` | node + 本地文件 |
| `POST /skill-forge/store/import` | `NativeSkillStore.import_from_external` | 后端文件夹 |
| `POST /skill-forge/store/{id}/build` | `NativeSkillStore.build` | node |
| `POST /skill-forge/store/{id}/deploy` | `NativeSkillStore.deploy` | node + 写盘 |
| `GET /skill-forge/store/{id}/preview` | `NativeSkillStore.preview` | node |
| `POST /projects/{pid}/skills/{sid}/deploy` | `project_service.deploy_project_skill` | 校验本地目录 + 写盘 |
| `POST /skill-deployments/{id}/push` | `project_service.push_deployment` | 读本地内容 |
| `POST /skill-deployments/{id}/pull-update` | `project_service.pull_update_deployment` | 覆盖写本地 |
| `GET /skill-deployments/{id}/local-status` | `project_service.get_deployment_local_status` | 读本地 hash |
| `POST /skill-deployments/{id}/promote` | `project_service.promote_deployment` | 读本地内容 |

## 附录 B：技术栈现状

| 层 | 技术 | 迁移注意 |
| --- | --- | --- |
| 后端 | FastAPI · Uvicorn · SQLAlchemy(async) · aiomysql · WebSocket | DB 迁托管；广播保持单实例或加 Redis |
| 前端 | Vue 3 · Vite · Pinia · Vue Router · Axios | 复用为渲染层；通信分流 |
| Skill 构建 | Node 端 skill-forge bridge（`backend/skill-forge`） | 薄代理下留云端；Electron 自带 node 可选厚代理 |
| 鉴权 | HMAC token（`auth_service`） | secret 独立化、WS 强制、安全存储 |
