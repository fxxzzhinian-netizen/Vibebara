# VibeHub — AI 协作中台

VibeHub 是一个面向 Vibe Coding 工具（Cursor / Codex 等）的 **Skill 协作平台**：在平台抽象层统一管理 Skill，支持团队 / 项目维度的 Skill 关联、本地部署、改动推送与拉取更新，并通过 WebSocket 实时同步「项目动态」。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 后端 | Python 3.10+ · FastAPI · Uvicorn · SQLAlchemy(async) · MySQL(aiomysql) · WebSocket |
| 前端 | Node.js 18+ · Vue 3 · Vite · Pinia · Vue Router · Axios |
| Skill 构建 | Node 端 skill-forge bridge（`backend/skill-forge`，已预构建） |

## 目录结构

```
Cowork/
├── backend/            # FastAPI 后端（app/ 为主代码，skill-forge/ 为 Skill 构建桥）
├── frontend/           # Vue 3 + Vite 前端（渲染层，桌面壳复用其 dist/ 产物）
├── local-agent/        # 本地代理（纯 TS 薄代理，负责文件落盘/扫描/hash/监控）
├── desktop/            # Electron 桌面壳（主进程 + 预加载 + 打包配置）
├── docs/               # 设计与方案文档
├── start.ps1           # Windows 一键启动脚本（浏览器形态）
├── start.sh            # Linux / macOS 一键启动脚本（浏览器形态）
├── build-desktop.ps1   # Windows 桌面客户端一键构建/运行/打包脚本
└── README.md
```

## 环境要求

- **Python** 3.10 及以上
- **Node.js** 20 及以上（含 npm；桌面客户端要求 20+）
- **MySQL** 5.7 / 8.0（需可连接，默认 `root@localhost:3306` 无密码）

## 前置准备

1. **创建数据库**（表会在后端首次启动时自动创建，但需要先有空库）：

```sql
CREATE DATABASE cowork CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

2. **（可选）配置环境变量**：在 `backend/` 下新建 `.env` 覆盖默认配置。常用项：

```dotenv
# 数据库连接（默认 root 无密码连本机；按需修改）
DATABASE_URL=mysql+aiomysql://root:你的密码@localhost:3306/cowork?charset=utf8mb4

# LLM（用于 Skill 字段自动补齐，可留空，不影响核心功能）
LLM_BASE_URL=https://api.gptsapi.net
LLM_API_KEY=
LLM_MODEL=gpt-4o
```

> 不创建 `.env` 时，使用 `backend/app/core/config.py` 中的默认值。

## 一键启动（推荐）

启动脚本会自动：检查 Python / Node 环境 → 创建后端虚拟环境并安装依赖 → 安装前端依赖 → 分别拉起后端与前端。

### Windows（PowerShell）

```powershell
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

> 后端、前端会各自在新窗口启动；关闭对应窗口即可停止服务。

### Linux / macOS

```bash
chmod +x start.sh
./start.sh
```

> 前后端在当前终端后台运行，按 `Ctrl+C` 一并停止。

## 手动启动

### 后端（端口 8000）

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 前端（端口 5173）

```bash
cd frontend
npm install
npm run dev
```

前端通过 Vite 代理把 `/api` 与 `/ws` 转发到后端 `127.0.0.1:8000`（见 `frontend/vite.config.ts`），因此前后端需同时运行。

## 访问地址

| 服务 | 地址 |
| --- | --- |
| 前端应用 | http://localhost:5173 |
| 后端 API | http://localhost:8000 |
| API 文档（Swagger） | http://localhost:8000/docs |

### 预设账号

后端首次启动会自动创建以下账号，可直接登录：

| 用户名 | 密码 |
| --- | --- |
| `DAIL` | `DAIL2026` |
| `DAIL2` | `DAIL2027` |

## 核心功能流程

1. **关联 Skill**：在团队 / 项目下从平台仓库关联 Skill。
2. **部署到本地**：把 Skill 部署到本机项目目录（`.cursor/skills` 或 `.codex/skills`），平台开始跟踪该实例。
3. **推送（Push）**：本地改动后点「推送」，改动写回团队仓库并以抽象层改动点记录到「项目动态」，其他成员实例被标记为「可更新」。
4. **更新本地（Pull）**：其他成员一键把团队最新内容拉取覆盖到本地部署目录。
5. **实时同步**：项目动态通过 WebSocket 实时刷新，并带轮询兜底，断线自动重连。

---

## 桌面客户端（Electron，方案 B）

VibeHub 支持打包为 Electron 桌面客户端，架构为「桌面壳 + 本地代理 + 云端后端」三层：

| 层 | 说明 |
| --- | --- |
| 桌面壳 (`desktop/`) | Electron 主进程，负责窗口管理、拉起本地代理、注入运行时配置、安全存储 token |
| 本地代理 (`local-agent/`) | 纯 TS 薄代理，仅监听 `127.0.0.1`，承接文件落盘/目录浏览/扫描/hash/监控 |
| 云端后端 (`backend/`) | FastAPI，以 `DEPLOYMENT_MODE=cloud` 运行，提供数据/协作/广播能力 |

> 本地开发/联调时，后端以 cloud 模式跑在本机 `127.0.0.1:8000` 充当云端对端。

### 一键启动（零参数）

根目录 `build-desktop.ps1` **不带任何参数**即完成全流程：构建三件套 → 拉起 cloud 后端 → 启动桌面壳。

```powershell
.\build-desktop.ps1
```

> 需确保 MySQL 可连接且 `cowork` 库已创建。后端会在新窗口启动，关闭桌面壳窗口后可手动关闭后端窗口。
> 若 PowerShell 执行策略受限：`powershell -ExecutionPolicy Bypass -File .\build-desktop.ps1`

### 其他启动方式

```powershell
.\build-desktop.ps1 -Quick       # 跳过构建，直接启动（代码没改时用，秒开）
.\build-desktop.ps1 -NoBe        # 不启动后端（后端已在另一个窗口跑着）
.\build-desktop.ps1 -Dev         # 开发模式：前端走 Vite dev server，支持热更新
.\build-desktop.ps1 -BuildOnly   # 仅构建，不启动任何服务
```

### 打包为 Windows 安装包

```powershell
.\build-desktop.ps1 -Dist        # 构建 + 生成 NSIS 安装包（输出到 desktop/release/）
.\build-desktop.ps1 -Pack        # 构建 + 解压即用目录（不生成安装包，适合本地试运行）
```

> 首次打包会下载 Electron 和 NSIS 工具链。代码签名证书需另行配置（见 `desktop/electron-builder.yml`）。

### 云端地址覆盖

桌面壳默认连接本机 cloud demo。切换到真实云端时：

- **配置文件**：`%APPDATA%/@vibehub/desktop/vibehub-desktop.config.json`

```json
{
  "cloudApiBase": "https://api.vibehub.example/api/v1",
  "cloudWsBase": "wss://api.vibehub.example"
}
```

- **环境变量**（联调优先级最高）：

```powershell
$env:VIBEHUB_CLOUD_API_BASE = "https://api.vibehub.example/api/v1"
$env:VIBEHUB_CLOUD_WS_BASE = "wss://api.vibehub.example"
```

---

## 常见问题

- **后端启动报数据库连接错误**：确认 MySQL 已启动、`cowork` 库已创建，并核对 `backend/.env` 的 `DATABASE_URL`。
- **Skill 部署 / 构建失败，提示未找到 node**：skill-forge bridge 依赖 Node.js；确认 `node` 在 PATH 中。`backend/skill-forge` 已预构建，若 `dist/` 缺失可在该目录执行 `npm install && npm run build`。
- **项目动态不实时**：确认前后端均在运行、页面顶部显示「实时同步中」；前端已内置 WebSocket 自动重连与轮询兜底。
- **Windows 无法执行 `start.ps1`**：使用 `powershell -ExecutionPolicy Bypass -File .\start.ps1` 绕过执行策略限制。
- **桌面壳启动白屏 / 接口 401**：确认 cloud 模式后端已启动，且设置了 `ALLOW_ORIGIN_REGEX=.*`（Electron `file://` Origin 为 `null`，需放行）。
- **桌面壳提示本地代理不可用**：确认 `local-agent/dist/index.js` 已构建。主进程会自动拉起代理进程；崩溃后自动重启并漂移端口。
- **`npm run dist:win` 报错找不到 electron-builder**：在 `desktop/` 目录执行 `npm install` 安装依赖（含 `electron-builder`）。
