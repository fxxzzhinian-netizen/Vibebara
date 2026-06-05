# 方案 B · 桌面客户端「上线前 Checklist」

> 本文是 VibeHub 桌面客户端（Electron 三层架构：桌面壳 + 本地代理 + 云端后端）**正式上线前的核对清单与发布 Runbook**。
>
> 状态基线（截至本文）：M5-a 桌面壳骨架已完成；M5-b 仅落「设备身份地基」；**M5-c（打包/签名/自动更新）整体未完成**；生产云端硬化（HTTPS / 运维清单）未执行。功能联调可用，正式对外分发尚未就绪。
>
> 上游依据：`M2-评审决议与上线清单.md`、`M5-实施计划.md`（§4 退出标准、§7 总验收）、`M5-功能修复记录.md`、`desktop/electron-builder.yml`、`README.md`。

---

## 0. 先定义「上线范围」

不同上线形态的门槛不同，先对齐再逐项核对：

| 形态 | 说明 | 必须完成的区块 |
| --- | --- | --- |
| **A. 受控内部试用** | 开发者/小团队手动 `build-desktop.ps1` 运行，内网或受控网络 | 第 4 节（已就绪项复核）+ 第 2 节 B 的最小子集（JWT_SECRET、cloud 模式） |
| **B. 正式对外分发** | 打包安装包发给外部用户，公网访问云端 | 第 1 节（全部）+ 第 2 节（全部）+ 第 3 节（按规模） |

> 下文按区块标注严重度：🔴 阻塞（B 形态必须）｜🟠 重要｜🟡 视规模｜🟢 知晓即可。

---

## 1. 桌面分发链路（M5-c）🔴 B 形态阻塞

当前 `desktop/electron-builder.yml` 为脚手架，签名/自动更新段均注释。`desktop/package.json` 已有 `pack:win` / `dist:win` 脚本但未实际产出并验证。

### 1.1 安装包产出与验证

- [ ] 三件套产物就绪：`frontend/dist`、`local-agent/dist`（含 `node_modules`）、`desktop/dist-electron`（`build-desktop.ps1 -BuildOnly` 或各自 `npm run build`）。
- [ ] `npm run dist:win`（`desktop/`）产出 NSIS 安装包到 `desktop/release/`。
- [ ] **干净机器**安装后：能启动壳、自动拉起本地代理（`GET /local/health` 通）、登录、跑通一次部署编排闭环。
- [ ] 校验 `extraResources` 路径与主进程 packaged 分支 `resolvePaths()` 对齐（local-agent / frontend 产物能被找到）。

### 1.2 代码签名 🔴

- [ ] 申请 Windows 代码签名证书（OV/EV，**长周期，需尽早并行启动**）或接入 Azure Trusted Signing。
- [ ] `electron-builder.yml` 的 `win` 段配置 `certificateFile`/`certificatePassword`（或 CI 安全注入）。
- [ ] 验证安装包**无 SmartScreen「未知发布者」拦截**（或已最小化）。

### 1.3 自动更新与版本兼容 🟠

- [ ] 接入 `electron-updater` + 发布通道（`publish: generic|github`），打开 `electron-builder.yml` 注释段并配置更新源 URL。
- [ ] 客户端启动校验**最低兼容云端 API 版本**，不兼容时提示/强制更新（M5-c 退出标准）。
- [ ] 验证一次「发布新版本 → 客户端检测到 → 下载 → 重启更新」完整链路。

---

## 2. 生产云端硬化 🔴 B 形态阻塞

当前 `docker-compose.yml` 无 TLS，后端 8000 明文 HTTP；README 联调地址为 `http://` + `ws://`。

### 2.1 传输层 HTTPS/TLS 🔴

- [ ] 在后端前置反向代理（nginx / Caddy）做 TLS 终止，对外 `https://` + `wss://`（自动证书或商用证书）。
- [ ] 桌面壳云端地址切到 `https://域名/api/v1` + `wss://域名`（环境变量或 `vibehub-desktop.config.json`）。
- [ ] 确认 `ALLOW_ORIGIN_REGEX` 仍放行 Electron `file://`（Origin=`null`）。

### 2.2 密钥与鉴权 🔴

- [ ] **JWT_SECRET 生产强随机值一次性注入**后再发布；发布后通知全员（含 DAIL/DAIL2）重新登录。
  - 生成：`python -c "import secrets;print(secrets.token_urlsafe(48))"`
  - 校验：启动日志**不得**出现「正在使用公开的开发默认密钥」告警。
- [ ] 修改/停用预设弱密码账号（`DAIL/DAIL2026`、`DAIL2/DAIL2027`）。
- [ ] 确认 `DEPLOYMENT_MODE=cloud`：启动日志端点列表**不含** `/api/v1/launcher/*`、`/api/v1/adapters/*`。

### 2.3 数据库与迁移 🟠

- [ ] 托管 MySQL 若强制 TLS：设 `DB_SSL_ENABLED=true`（或 `DB_SSL_CA`），自签可 `DB_SSL_VERIFY=false`。
- [ ] 现网库启用 Alembic：执行一次 `alembic stamp head`，并设 `DB_AUTO_CREATE=false` 避免双写 schema。
- [ ] 确认设备表迁移已应用（`a1b2c3d4e5f6 add_devices`）。
- [ ] 配置数据库定时备份（`mysqldump`，见 README 运维段）。

### 2.4 运行约束 🟠

- [ ] 后端**必须单进程** `--workers 1`（WS 为进程内内存态）；若需多副本，须先引入外部 pub/sub（Redis 等）—— 当前**未实现**，多副本会导致 WS 广播丢失。
- [ ] 安全组仅放行必要端口（对外仅 443；8000 不直接暴露公网）。

---

## 3. 功能完整性（按上线规模）

### 3.1 多机安装态持久化（M5-b 剩余）🟡

- [ ] `platform_skill_installs` 表 + 上报对账端点（`POST /devices/{id}/platform-installs/sync`）—— **未实现**，依赖未定项 U2（团队看板隐私粒度）拍板。
- [ ] 个人/团队安装态聚合看板 —— 未实现。
- [ ] 现状：仅靠本地代理实时 `scan.installedAt`，**多机持久同步缺失**。若上线不依赖跨设备安装态视图，可暂缓。

### 3.2 平台范围 🟡

- [ ] 当前 **Windows-first**；macOS 的 hash/文件名（NFD）一致性**未验证**、未签名/公证。仅承诺 Windows 上线。

### 3.3 残留安全假设 🟢

- [ ] 本地代理信任「已配对的渲染层」；防御"被攻陷渲染层"需新增「显式确认可写根」端点（会突破 7 端点冻结）。当前维持冻结，知晓即可。

---

## 4. 已就绪项复核（确认无回归）

> 这些已实现并通过分层验证，上线前过一遍确认没退化即可。

- [ ] 核心闭环：登录 → 浏览 Skill → 实时项目动态 → 部署到本地（项目级 + 全局级）→ 推送/拉取。
- [ ] 本地代理仅监听 `127.0.0.1`，写盘受配对令牌 + 可写根白名单（确认目录授权 + realpath/`..` 逃逸防护）约束。
- [ ] REST 全量 Bearer 鉴权；会话级 WS 鉴权（cloud 默认开 / `WS_SESSION_AUTH_REQUIRED`）。
- [ ] 登录 token 用 `safeStorage` 加密持久化。
- [ ] 设备身份：登录后 `POST /devices/register` 服务端铸造 `device_id` 并回写本机。
- [ ] 本地代理崩溃重启 + 端口漂移 IPC 热更（渲染层 `localAgentClient` 透明跟随）。
- [ ] 回归测试：后端（pairing/jwt/deployment_mode/ws_auth/m4_orchestration/hash_convergence/devices）、local-agent（vitest 44）、skill-forge 适配器、前端 `vue-tsc` + build。

---

## 5. 发布日切换 Runbook

> 按顺序执行；每步留校验点。

1. **服务器**：拉取代码 → 注入生产 `.env`（`JWT_SECRET`/`DB_*`/`DEPLOYMENT_MODE=cloud`/TLS 相关）→ `docker compose up -d --build`。
2. 校验：`docker compose ps`（healthy）、`curl https://域名/health`、启动日志无弱密钥告警、端点不含 launcher/adapters。
3. 反代/TLS 生效，`https://` + `wss://` 可达。
4. **客户端**：用生产云端地址打**签名安装包**；冒烟一遍核心闭环（4 节）。
5. 通知全员重新登录（JWT 切换后旧 token 失效）。
6. 灰度小范围 → 观察日志/错误 → 全量。

---

## 6. 回滚预案

- [ ] 后端：`docker compose down`（保数据卷）→ 切回上一个镜像 tag / 上一个 commit 重新 `up -d --build`。
- [ ] 数据库：迁移前已备份；如新迁移有问题，`alembic downgrade -1` 回退（设备表 revision 已验证可逆）。
- [ ] 客户端：自动更新通道发布回退版本；或提供上一版安装包下载。
- [ ] 数据卷（`mysql-data`/`skill-store`）默认不随 `down` 删除，**严禁** `down -v`。

---

## 7. 一句话结论

- **受控内部试用（形态 A）**：补齐第 2 节 B 的最小子集（JWT_SECRET + cloud 模式）即可用，功能已通。
- **正式对外分发（形态 B）**：当前**未就绪**，硬门槛是第 1 节（签名 + 自动更新 + 安装包验证）与第 2 节（HTTPS + 密钥/运维）。两块完成后方可对外发版。
