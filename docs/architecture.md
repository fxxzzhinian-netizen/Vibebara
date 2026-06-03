# VibeHub - AI 协作中台架构设计

## 项目定位

不同终端用户使用不同的 Vibe Coding 工具（Cursor、Codex、GitHub Copilot、Windsurf 等）。VibeHub 以 `skill-forge` 作为统一 Skill 工具链，负责 Skill 的导入、抽象包管理、目标平台构建、部署、反向解析和项目实例同步。

---

## 架构总览

```
┌─────────────────────────────────────────────────────────────────┐
│                        前端 (Vue 3)                              │
│   Dashboard │ Teams │ Projects │ Skill Forge │ Activity Stream  │
└──────────────────────────┬──────────────────────────────────────┘
                           │  HTTP / WebSocket
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     后端 (Python FastAPI)                         │
│                                                                   │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │  REST API   │  │  WebSocket   │  │   skill-forge bridge   │  │
│  │  /api/v1    │  │  /ws/project │  │   Node.js/TypeScript   │  │
│  └──────┬──────┘  └──────┬───────┘  └───────────┬────────────┘  │
│         │                │                       │                │
│         ▼                ▼                       ▼                │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                    Skill Forge Service                       │ │
│  │     (导入 / 构建 / 部署 / 反向解析 / 变更检测)                  │ │
│  └──────────────────────────┬──────────────────────────────────┘ │
│                             │                                     │
│         ┌───────────────────┼───────────────────┐                │
│         ▼                   ▼                   ▼                │
│  ┌─────────────┐   ┌──────────────┐   ┌───────────────┐        │
│  │ Team Store  │   │ Project Skill│   │ User Deploy   │        │
│  │             │   │ Refs         │   │ Tracking      │        │
│  └─────────────┘   └──────────────┘   └───────────────┘        │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
   ┌────────────┐  ┌────────────┐  ┌────────────┐
   │  Cursor    │  │  Codex     │  │  Other     │
   │  Project   │  │  Project   │  │  Tool      │
   └────────────┘  └────────────┘  └────────────┘
```

---

## 核心设计原则

### 1. skill-forge 统一工具链
所有 Vibe Coding 终端相关能力统一通过 `skill-forge` 完成：
- **反向导入**：从 Cursor/Codex 等原生 Skill 目录解析为中台抽象包。
- **目标构建**：从中台抽象包生成目标工具的原生 Skill 产物。
- **项目部署**：用户选择工具和本地路径后，由 `skill-forge` 构建并写入部署目录。
- **变更解析**：监听用户部署实例后，仍通过 `skill-forge` 反向解析为抽象包再进入团队仓库流程。

后端不再为每个 Vibe Coding 工具维护独立工具层；新增工具支持应进入 `skill-forge` 的目标平台构建/解析能力。

### 2. 统一事件协议 (Unified Event Protocol)
所有协作行为抽象为统一事件：
- **会话事件**：创建/加入/离开/关闭
- **代码协作**：编辑/建议/采纳/拒绝
- **AI 交互**：Prompt/Response/Stream
- **文件操作**：打开/保存/创建/删除
- **任务管理**：创建/更新/完成

### 3. 项目与团队动态
- 基于项目和团队维度记录 Skill 变更、部署、冲突和提升操作。
- WebSocket 只负责把团队仓库动态和用户部署实例状态推送给前端。
- 工具格式转换、部署和解析不走 WebSocket 消息路由，统一交给 `skill-forge`。

---

## 技术栈

| 层级 | 技术选型 | 说明 |
|------|----------|------|
| 前端 | Vue 3 + TypeScript + Pinia | 响应式管理面板 |
| 构建 | Vite | 开发热重载 |
| 后端 | Python + FastAPI | 异步高性能 API |
| 实时通信 | WebSocket | 低延迟事件流 |
| 缓存/Pub-Sub | Redis | 跨实例消息广播 |
| 持久化 | SQLAlchemy + SQLite/PostgreSQL | 会话与事件存储 |
| 任务队列 | Celery | 异步重任务处理 |

---

## 目录结构

```
Cowork/
├── backend/
│   ├── app/
│   │   ├── api/               # REST API 路由
│   │   │   ├── teams.py       # 团队管理接口
│   │   │   ├── projects.py    # 项目与 Skill 列表接口
│   │   │   └── skill_store.py # 个人/团队 Skill 仓库接口
│   │   ├── core/              # 核心配置与协议
│   │   │   ├── config.py      # 应用配置
│   │   │   └── events.py      # 统一事件定义
│   │   ├── models/            # 数据库模型
│   │   ├── schemas/           # Pydantic 请求/响应模型
│   │   ├── services/          # 业务逻辑层
│   │   │   ├── skill_forge_service.py   # Python ↔ skill-forge bridge
│   │   │   ├── native_skill_store.py    # Skill 仓库读写
│   │   │   └── skill_sync_service.py    # 项目/团队动态与同步
│   │   ├── websocket/         # WebSocket 通信
│   │   │   ├── hub.py         # 连接管理器
│   │   │   └── routes.py      # WS 路由
│   │   └── main.py            # 应用入口
│   ├── skill-forge/           # Skill 统一编写工具 (Node.js/TypeScript)
│   │   ├── src/
│   │   │   ├── adapters/      # 目标平台构建器/解析器 (Cursor, Codex)
│   │   │   ├── commands/      # CLI 命令 (init, build, deploy, validate, import)
│   │   │   ├── schema/        # 统一 Skill 配置 Schema (Zod)
│   │   │   └── utils/         # 工具函数 (文件/YAML 操作)
│   │   ├── dist/              # 编译产物
│   │   ├── tests/             # Vitest 测试
│   │   ├── templates/         # Skill 初始化模板
│   │   ├── bridge.mjs         # Python↔Node 桥接脚本
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── vitest.config.ts
│   ├── tests/
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/               # 后端 API 调用
│   │   ├── composables/       # 可复用逻辑 (WebSocket等)
│   │   ├── components/        # 通用组件
│   │   ├── stores/            # Pinia 状态管理
│   │   ├── types/             # TypeScript 类型
│   │   ├── views/             # 页面视图
│   │   └── router/            # 路由配置
│   ├── package.json
│   └── vite.config.ts
└── ARCHITECTURE.md
```

---

## API 设计

### REST API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/teams | 列出用户团队 |
| POST | /api/v1/teams | 创建团队 |
| GET | /api/v1/teams/{team_id}/projects | 列出团队项目 |
| POST | /api/v1/teams/{team_id}/projects | 创建项目 |
| GET | /api/v1/projects/{project_id}/skills | 列出项目 Skill |
| POST | /api/v1/projects/{project_id}/skills/{team_skill_id} | 将团队 Skill 加入项目列表 |
| POST | /api/v1/projects/{project_id}/skills/{team_skill_id}/deploy | 当前用户选择工具/路径并部署 |
| GET | /api/v1/teams/{team_id}/skill-changes | 查看团队 Skill 动态 |

### WebSocket

```
WS /ws/{session_id}?user_id=xxx&adapter_id=xxx
```

消息格式（JSON）：
```json
{
  "type": "event",
  "event_type": "code.edit",
  "from_user": "user-abc",
  "from_adapter": "cursor",
  "payload": { "file": "main.py", "change": "..." },
  "timestamp": "2026-05-26T01:37:00Z"
}
```

---

## 扩展新 Vibe Coding 工具

新增工具统一扩展 `skill-forge`，不在后端新增独立工具层：

1. 在 `backend/skill-forge/src/` 中增加目标平台构建/解析能力。
2. 定义该工具的原生 Skill 目录结构、字段映射、严格删除清单和项目级部署路径。
3. 接入 `build`、`preview`、`import`、`deploy` 流程。
4. 后端只通过 `skill_forge_service.call_bridge(...)` 调用，不直接理解目标工具私有格式。

---

## 启动方式

### 后端
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 前端
```bash
cd frontend
npm install
npm run dev
```

---

## skill-forge - Skill 统一编写工具

独立的 Node.js/TypeScript CLI 工具，用于统一编写 Cursor 和 Codex 平台的 Skill。

### 核心功能
- **init** — 初始化新的 Skill 项目（从模板生成 `skill.config.yaml`）
- **validate** — 校验统一配置文件（基于 Zod Schema）
- **build** — 将统一配置编译为目标平台格式（Cursor SKILL.md / Codex agents yaml）
- **deploy** — 构建并部署到目标平台的 skills 目录
- **import** — 从现有 Cursor/Codex skill 反向导入为统一配置
- **scan** — 自动扫描目录，检测来源（规则引擎），批量生成统一 Skill 包
- **migrate** — 跨平台迁移：统一 Skill 包 → 目标平台格式（Cursor/Codex）

### 技术栈
| 组件 | 技术 | 说明 |
|------|------|------|
| 语言 | TypeScript (ESM) | Node16 模块系统 |
| CLI | Commander.js | 命令行解析 |
| Schema | Zod | 配置验证 |
| YAML | js-yaml + gray-matter | YAML/Frontmatter 处理 |
| 测试 | Vitest | 单元测试 |

### 使用方式
```bash
cd backend/skill-forge
npm install
npm run build
skill-forge init my-skill                          # 创建新 skill
skill-forge build --target all                     # 构建所有平台
skill-forge deploy --target cursor                 # 部署到 Cursor
skill-forge scan ~/.cursor/skills-cursor           # 扫描并生成统一 Skill 包
skill-forge migrate -p ./my-skill -t codex         # 迁移到 Codex
```

### 外部扫描与快照导入流程

外部扫描只用于发现可导入的 Skill 候选，不表示持续监听来源目录：
1. 用户选择本机目录、个人工具目录或某个项目路径
2. 系统遍历子目录，检测含 `SKILL.md` 的 skill 文件夹
3. 规则引擎 `detectOrigin()` 识别来源（Cursor/Codex/未知）
4. 前端展示扫描结果列表
5. 用户点击"加入个人仓库"或"加入团队仓库"
6. 系统将原生 Skill 反向导入为抽象包快照，并记录来源路径用于溯源
7. 导入完成后不再监听原始来源目录；后续同步只发生在团队仓库与用户部署实例之间

### Skill 仓库与项目部署模型

平台不再把一个全局 Skill 目录直接视为所有项目的唯一事实源，而是区分三层：

- **个人 Skill 仓库**：用户从本机项目、Cursor/Codex 全局目录或其他来源点击"加入到仓库"后生成的快照。导入完成后只保留来源路径用于溯源，不继续监听原始项目目录。
- **团队 Skill 仓库**：团队可从成员个人仓库提取 Skill，也可从团队项目上传/导入项目已有 Skill。团队仓库是团队内分发的基线。
- **项目 Skill 列表**：项目侧只声明该项目可用哪些团队 Skill，不绑定任何成员的本地路径或 Vibe Coding 工具。
- **用户部署实例**：团队成员在项目 Skill 列表中点击"部署"时，选择自己的 Vibe Coding 工具（Cursor/Codex）和本地项目路径。部署完成后，系统才创建个人维度的部署实例并开始监听该部署目录。

项目创建/配置不要求本地路径和工具类型，因为团队成员的本地 checkout 路径和使用工具可能不同。部署时由当前用户提供：

- **Vibe Coding 工具**：当前至少支持 `cursor`、`codex`。
- **本地项目路径或部署路径**：用于定位该用户机器上的项目级 Skill 目录。
- **部署目标目录**：例如 `{deploy_path}/.cursor/skills/{name}` 或 `{deploy_path}/.codex/skills/{name}`。

同步与热更新规则：

- 导入个人/团队仓库是一次性快照，不监听原始来源目录。
- 添加到项目的 Skill 只进入项目 Skill 列表，不自动写入任何成员本地目录。
- 用户点击"部署"并选择工具/路径后，系统构建目标平台产物并写入该用户指定目录。
- 当前阶段部署路径只支持用户本机路径，不支持远程 Agent/Worker 路径。
- 部署时系统应幂等维护目标项目的 `.gitignore`，至少追加 `.cursor/skills/` 或 `.codex/skills/`，避免不同成员的本地 Skill 部署产物进入 Git 造成合并冲突。
- 后续监听的是用户部署实例目录，而不是项目记录、个人仓库或原始来源项目。
- 当用户部署实例发生变更时，变更事件写入团队仓库动态；团队仓库对应 Skill 可按团队设置热更新，默认关闭，并记录哪个项目、哪个成员、哪个部署实例触发了更新。
- 团队仓库 Skill 当前不允许直接在线编辑，只能通过用户部署实例提升；个人仓库复制到团队仓库后不保留版本关联。
- 如果一个项目本身已经有 Skill，不需要先从平台仓库添加；用户可以在部署/导入时选择本地路径扫描并上传到团队仓库，再决定是否加入项目 Skill 列表。

核心数据关系应从"项目只关联 skill_id"调整为"项目列出团队 Skill，用户部署后生成个人部署实例"：

- `team_skill_packages`：团队仓库 Skill 的抽象包与版本。
- `project_skill_refs`：记录某项目可用哪些团队 Skill。
- `user_skill_deployments`：记录用户、项目、团队 Skill、Vibe Coding 工具、部署路径、部署版本、当前 hash、监听状态。
- `skill_change_log`：记录团队仓库和用户部署实例之间的变更来源、版本推进和冲突状态。

---

## LLM 能力集成

通过 GPTs API Gateway 统一接入大模型能力，当前用于 Skill Forge 的字段补齐场景。

### 配置

| 配置项 | 环境变量 | 说明 |
|--------|----------|------|
| Base URL | `LLM_BASE_URL` | `https://api.gptsapi.net`（兼容 OpenAI/Claude/Gemini） |
| API Key | `LLM_API_KEY` | GPTs API 密钥 |
| Model | `LLM_MODEL` | 默认 `gpt-4o` |

### 当前用途

**Skill 部署时字段补齐**：从其他平台导入的 Skill 可能缺少目标平台所需的字段（如从 Cursor 导入缺少 `ui.display_name`）。部署前系统调用 LLM 根据已有的 name、description、正文摘要推断缺失值，生成建议后由用户手动确认。

### 调用链路

```
用户点击【部署】
    → 后端检测缺失字段
    → POST GPTs API (OpenAI-compatible chat completions)
    → 返回建议值 JSON
    → 前端展示确认对话框
    → 用户确认/修改
    → 写入 skill.config.yaml
    → 执行构建 & 部署
```

### 服务模块

- `app/services/llm_service.py` — LLM 调用封装（`complete_skill_fields`、`detect_incomplete_fields`）

---

## 后续演进方向

- [ ] 扩展更多 skill-forge 目标平台（Copilot、Windsurf 等）
- [ ] 用户认证系统（JWT）
- [ ] 持久化事件日志（用于回放和审计）
- [ ] Redis 集群支持多实例部署
- [ ] 冲突检测与合并策略
- [ ] 插件市场（第三方 skill-forge 目标平台能力）
- [ ] 项目级权限管理
- [x] LLM 语义增强（为导入的 Skill 自动补全缺失元数据）
