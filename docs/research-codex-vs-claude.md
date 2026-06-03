# OpenAI Codex CLI vs Anthropic Claude Code：指令/技能系统深度对比研究

> 研究日期：2026-05-26 | 信息来源：官方文档 + GitHub 仓库 + 社区实践

---

## 目录

1. [Agent Skills 开放标准](#1-agent-skills-开放标准)
2. [OpenAI Codex CLI 指令系统](#2-openai-codex-cli-指令系统)
3. [Anthropic Claude Code 指令系统](#3-anthropic-claude-code-指令系统)
4. [功能对比矩阵](#4-功能对比矩阵)

---

## 1. Agent Skills 开放标准

两者共享的底层标准。Anthropic 于 **2025-12-18** 发布 Agent Skills 开放规范，48 小时内 Microsoft 和 OpenAI 均完成集成。截至 2026-03，已有 32+ 工具支持（包括 Google Gemini CLI、JetBrains Junie、AWS Kiro、Cursor 等）。

- 规范仓库：`github.com/agentskills/agentskills`（19k+ stars）
- 官网：`agentskills.io`
- 许可：Apache 2.0

**核心理念：渐进式披露（Progressive Disclosure）**

1. **发现（Discovery）**：启动时仅加载每个 skill 的 `name` + `description`
2. **激活（Activation）**：任务匹配时读取完整 `SKILL.md` 指令
3. **执行（Execution）**：按需执行脚本或加载引用文件

**标准 SKILL.md 格式（跨平台通用）：**

```markdown
---
name: my-skill
description: "What this skill does and when to use it"
license: MIT
compatibility: "Requires Node.js 20+"
metadata:
  author: team-name
  version: "1.0"
allowed-tools:
  - Bash
  - Read
  - Write
---

# Skill Instructions

Step-by-step instructions for the agent to follow...
```

**标准目录结构：**

```
skill-name/
├── SKILL.md                 # 必需 - YAML frontmatter + Markdown 指令
├── agents/                  # 推荐
│   └── openai.yaml          # Codex 专用 UI/策略元数据
├── scripts/                 # 可选 - 可执行脚本 (Python/Bash 等)
├── references/              # 可选 - 参考文档（按需加载到上下文）
└── assets/                  # 可选 - 输出用文件（模板/图标/字体等）
```

---

## 2. OpenAI Codex CLI 指令系统

### 2.1 AGENTS.md — 项目指令

**文件格式**：纯 Markdown（无 frontmatter 要求）

**发现机制**：启动时从 home 目录向下遍历到 CWD，逐层合并

| 层级 | 路径 | 用途 |
|------|------|------|
| 全局 | `~/.codex/AGENTS.md` | 个人全局偏好 |
| 仓库根 | `$REPO_ROOT/AGENTS.md` | 团队级项目指导 |
| 当前目录 | `$CWD/AGENTS.md` | 子模块/特性级指导 |

**合并规则（关键）**：

1. 每个目录检查顺序：`AGENTS.override.md` → `AGENTS.md` → `project_doc_fallback_filenames` 中配置的后备文件名
2. 每个目录最多包含 **1 个**文件
3. 文件从根到叶拼接，**后出现的覆盖先出现的**（因为追加在末尾）
4. 合并大小上限默认 **32 KiB**（`project_doc_max_bytes` 配置）
5. 空文件被跳过

**覆盖优先级**：`AGENTS.override.md` > `AGENTS.md` > 后备文件名

**环境变量**：

- `CODEX_HOME`：自定义 Codex 主目录（默认 `~/.codex`）
- `CODEX_DISABLE_PROJECT_DOC=1`：禁用项目 AGENTS.md（仅保留全局）

**CLI 标志**：`codex --no-project-doc`

**自定义后备文件名示例**（在 `config.toml` 中配置）：

```toml
project_doc_fallback_filenames = ["TEAM_GUIDE.md", ".agents.md"]
```

### 2.2 Skills 系统 — 可复用工作流

**SKILL.md frontmatter 字段（Codex 专用字段仅 `name` 和 `description`）**：

```markdown
---
name: deploy-staging
description: >-
  Deploy the current project to staging environment. Use when the user
  asks to deploy, push to staging, or test in a pre-production environment.
---

# Deploy to Staging

1. Run the test suite...
2. Build the production bundle...
3. Push to the staging branch...
```

> **关键**：`description` 是主要触发机制。所有"何时使用"的信息必须写在 description 中（而非 body），因为 body 只在 skill 被选中后才加载。

**Skill 存放位置与作用域**：

| 作用域 | 路径 | 用途 |
|--------|------|------|
| `REPO` | `$CWD/.agents/skills/` | 当前工作目录的技能 |
| `REPO` | `$CWD/../.agents/skills/` | 父目录技能 |
| `REPO` | `$REPO_ROOT/.agents/skills/` | 仓库根目录技能 |
| `USER` | `$HOME/.agents/skills/` 或 `~/.codex/skills/` | 个人跨项目技能 |
| `ADMIN` | `/etc/codex/skills/` | 系统/容器级管理员技能 |
| `SYSTEM` | Codex 内置 | OpenAI 预装技能（skill-creator, skill-installer 等） |

**内置系统技能**（自动安装到 `$CODEX_HOME/skills/.system/`）：

- `skill-creator`：引导创建新技能
- `skill-installer`：从 GitHub 安装技能

**调用方式**：

1. **隐式调用**：Codex 根据 `description` 自动匹配
2. **显式调用**：`/skills` 菜单或 `$skill-name` 前缀

**上下文预算**：技能列表占用约 **2% 上下文窗口**（或最多 8,000 字符）。超出时先缩短 description，再省略技能。

**openai.yaml — 可选 UI/策略元数据**（放在 `agents/` 子目录）：

```yaml
# skill-name/agents/openai.yaml
interface:
  display_name: "Deploy to Staging"
  short_description: "One-click staging deployment"  # 25-64 字符
  icon_small: "./assets/small-logo.svg"
  icon_large: "./assets/large-logo.png"
  brand_color: "#3B82F6"
  default_prompt: "Deploy to staging with default settings"

policy:
  allow_implicit_invocation: false  # 默认 true

dependencies:
  tools:
    - type: "mcp"
      value: "server-name"
      description: "MCP server description"
      transport: "streamable_http"
      url: "https://example.com/mcp"

permissions:
  network: true
  fs_read:
    - "./data"
  fs_write:
    - "./output"
```

**禁用技能（不删除）**：

```toml
# ~/.codex/config.toml
[[skills.config]]
path = "/absolute/path/to/skill/SKILL.md"
enabled = false
```

### 2.3 config.toml — 主配置文件

**格式**：TOML

**位置层级（优先级从高到低）**：

1. CLI 标志和 `--config` 覆盖
2. Profile 值（`--profile <name>`）
3. 项目配置：`.codex/config.toml`（根到 CWD，最近的优先；仅受信项目）
4. 用户配置：`~/.codex/config.toml`
5. 系统配置：`/etc/codex/config.toml`（Unix）
6. 内置默认值

**核心配置键**：

```toml
# 模型选择
model = "gpt-5.5"
model_provider = "openai"
model_reasoning_effort = "high"

# 审批策略：untrusted | on-request(默认) | never
approval_policy = "on-request"

# 沙箱模式：read-only | workspace-write(默认) | danger-full-access
sandbox_mode = "workspace-write"

# 网络搜索：cached(默认) | live | disabled
web_search = "cached"

# AGENTS.md 控制
project_doc_max_bytes = 32768          # 默认 32 KiB
project_doc_fallback_filenames = ["TEAM_GUIDE.md"]

# 功能开关
[features]
shell_snapshot = true

# 命名 Profile（通过 --profile 切换）
[profiles.deep-review]
model = "gpt-5-pro"
model_reasoning_effort = "high"
approval_policy = "never"

[profiles.lightweight]
model = "gpt-4.1"
approval_policy = "untrusted"

# MCP 服务器
[mcp_servers.filesystem]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-filesystem", "/path"]
enabled = true
startup_timeout_sec = 30
tool_timeout_sec = 120

[mcp_servers.remote-api]
url = "https://mcp.example.com/api"
bearer_token_env_var = "MCP_TOKEN"
enabled = true
```

**项目级 `.codex/config.toml` 受限键**（不可在项目配置中覆盖）：
`openai_base_url`, `chatgpt_base_url`, `model_provider`, `model_providers`, `notify`, `profile`, `profiles`, `otel`

### 2.4 完整目录树

```
~/.codex/                            # 全局（CODEX_HOME）
├── config.toml                      # 全局配置
├── AGENTS.md                        # 全局指令
├── AGENTS.override.md               # 全局覆盖指令（优先于 AGENTS.md）
└── skills/                          # 个人技能
    ├── .system/                     # 内置系统技能（自动更新）
    │   ├── skill-creator/
    │   │   ├── SKILL.md
    │   │   ├── scripts/
    │   │   └── references/
    │   └── skill-installer/
    │       └── SKILL.md
    └── my-custom-skill/
        ├── SKILL.md
        ├── agents/
        │   └── openai.yaml
        ├── scripts/
        └── references/

$HOME/.agents/skills/                # 用户级 Agent Skills（开放标准路径）
    └── ...

project-root/
├── AGENTS.md                        # 仓库级指令
├── AGENTS.override.md               # 仓库级覆盖
├── .codex/
│   └── config.toml                  # 项目配置
├── .agents/
│   └── skills/                      # 仓库级技能
│       └── project-deploy/
│           ├── SKILL.md
│           └── scripts/
└── sub-module/
    ├── AGENTS.md                    # 子目录指令
    └── .agents/
        └── skills/                  # 子目录级技能
```

---

## 3. Anthropic Claude Code 指令系统

### 3.1 CLAUDE.md — 项目记忆

**文件格式**：纯 Markdown（支持 `@import` 语法）

**发现机制**：启动时从 CWD 向上遍历查找，加载所有找到的文件并拼接到系统提示词

| 层级 | 路径 | 用途 | 提交到 git |
|------|------|------|-----------|
| 全局 | `~/.claude/CLAUDE.md` | 个人跨项目偏好 | 否 |
| 项目根 | `./CLAUDE.md` 或 `./.claude/CLAUDE.md` | 团队级项目指导 | 是 |
| 子目录 | `子目录/CLAUDE.md` | 子模块级指导（按需加载） | 是 |
| 本地 | `./CLAUDE.local.md` | 个人项目覆盖（gitignore） | 否 |

**合并规则**：

- 三层拼接：`~/.claude/CLAUDE.md` → 项目 `CLAUDE.md` → 子目录 `CLAUDE.md`
- 更具体的覆盖更通用的
- 建议每个文件 **< 200 行**
- 支持 `@import` 语法引入外部文件（最多 5 级递归）

**`@import` 语法**：

```markdown
# CLAUDE.md
@~/.claude/CLAUDE.md
@./docs/architecture.md
@./coding-standards.md
```

**便捷命令**：

- `/init`：分析代码库自动生成初始 CLAUDE.md
- `/memory`：检查当前活跃的指令文件

> **注意**：`CLAUDE.local.md` 已被弃用，推荐使用 `@` import 从 `CLAUDE.md` 引入 `~/.claude/CLAUDE.md`。

### 3.2 .claude/rules/ — 模块化路径规则

将单体 CLAUDE.md 拆分为模块化、路径范围的规则文件。

**文件格式**：Markdown + YAML frontmatter

**位置**：

- 项目级：`.claude/rules/*.md`（支持子目录递归发现）
- 全局级：`~/.claude/rules/*.md`

**frontmatter 字段**：

```markdown
---
alwaysApply: false
paths: src/api/**/*.ts, src/services/**/*.ts
---

# API 设计规范

- 所有端点使用 RESTful 命名...
- 返回统一的响应格式...
```

**加载模式**：

| 目标 | frontmatter | 行为 |
|------|-------------|------|
| 始终加载（eager） | `globs: **/*.ts, **/*.tsx` | 会话启动时加载 |
| 按需加载（lazy） | `alwaysApply: false` + `paths: **/*.ts` | 仅当 Claude 操作匹配文件时加载 |
| 无条件加载 | 无 frontmatter | 始终加载 |

**目录结构示例**：

```
.claude/rules/
├── code-style.md              # 无 paths → 始终加载
├── api-guidelines.md          # paths: src/api/**/* → 仅 API 文件
├── react-patterns.md          # paths: src/components/**/* → 仅组件
├── testing-rules.md           # paths: **/*.test.* → 仅测试文件
└── security/
    └── auth-rules.md          # paths: src/auth/**/* → 仅认证模块
```

> **已知 bug（截至 2026 年初）**：`~/.claude/rules/` 中带 `paths:` 的规则不生效，需放在项目级 `.claude/rules/`。`paths:` 必须用未加引号的 CSV 单行格式。

### 3.3 Skills 系统 — 可复用工作流

**演进**：2026-03 起，commands 和 skills 统一。`.claude/commands/*.md` 仍可用，但推荐 `.claude/skills/`。技能优先于同名命令。

**SKILL.md frontmatter 完整字段**：

```markdown
---
# === Agent Skills 开放标准字段（跨平台通用） ===
name: deploy-staging
description: >-
  Deploy to staging environment. Use when user asks to deploy,
  push to staging, or test pre-production.
license: MIT
compatibility: "Requires Node.js 20+"
metadata:
  author: team-name
  version: "1.0"
allowed-tools: Read, Write, Edit, Bash(npm run:*)

# === Claude Code 扩展字段 ===
when_to_use: "Use when user asks 'deploy', 'push to staging'"
argument-hint: "<optional environment name>"
arguments: [environment, branch]
disable-model-invocation: true
user-invocable: true
model: sonnet
effort: high
context: fork
agent: Explore
paths: ["src/**/*.ts", "tests/**/*.ts"]
shell: bash
hooks:
  PreToolUse:
    - matcher: "Bash(git commit)"
      hooks:
        - type: command
          command: "./scripts/validate.sh"
---

# Deploy to Staging

1. Run test suite...
2. Build production bundle...
3. Push to staging branch...
```

**完整 frontmatter 字段参考**：

| 字段 | 标准/扩展 | 类型 | 说明 |
|------|----------|------|------|
| `name` | 标准 | string | 技能标识符，1-64 字符，小写+连字符 |
| `description` | 标准 | string | 技能描述，最大 1024 字符，用于自动调用匹配 |
| `license` | 标准 | string | 许可证 |
| `compatibility` | 标准 | string | 兼容性要求 |
| `metadata` | 标准 | object | 自定义键值对（author, version 等） |
| `allowed-tools` | 标准* | string | 空格/逗号分隔的预授权工具列表 |
| `when_to_use` | 扩展 | string | 自然语言的触发提示 |
| `argument-hint` | 扩展 | string | 调用时的参数提示 |
| `arguments` | 扩展 | array | 命名参数占位符 |
| `disable-model-invocation` | 扩展 | boolean | `true` 时仅允许手动 `/name` 调用（默认 `false`） |
| `user-invocable` | 扩展 | boolean | `false` 时隐藏于 `/` 菜单（背景知识）（默认 `true`） |
| `model` | 扩展 | string | 模型覆盖（haiku, sonnet, opus） |
| `effort` | 扩展 | string/int | 努力级别：low, medium, high 或整数 |
| `context` | 扩展 | string | 设为 `fork` 运行在隔离子代理上下文中 |
| `agent` | 扩展 | string | `context: fork` 时的子代理类型（Explore, Plan, general-purpose） |
| `paths` | 扩展 | string | gitignore 风格路径模式，技能仅对匹配文件激活 |
| `hooks` | 扩展 | object | 技能范围内的 Hooks 配置 |

**调用行为模式**：

| 模式 | frontmatter 配置 | 效果 |
|------|------------------|------|
| 仅自动调用 | 设置 `description`，使用默认值 | Claude 在任务匹配时自动调用 |
| 仅手动调用 | `disable-model-invocation: true` | 只能通过 `/name` 手动触发 |
| 背景知识 | `user-invocable: false` | Claude 可读取，用户在 `/` 菜单中不可见 |
| 自动+手动 | 设置 `description` + `user-invocable: true` | 两种方式均可 |
| 隔离执行 | `context: fork` + `agent: Explore` | 在独立子代理中运行，无对话历史 |

**技能位置**：

| 位置 | 命令名来源 | 示例 |
|------|-----------|------|
| `.claude/skills/<dir>/SKILL.md` | 目录名 | `.claude/skills/deploy/SKILL.md` → `/deploy` |
| `~/.claude/skills/<dir>/SKILL.md` | 目录名 | 全局技能 |
| `.claude/commands/<file>.md` | 文件名（去 .md） | `.claude/commands/review.md` → `/review` |
| `~/.claude/commands/<file>.md` | 文件名 | `~/.claude/commands/fix.md` → `/user:fix` |
| 插件 skills/ | 插件命名空间 | `plugin/skills/review/SKILL.md` → `/plugin:review` |

### 3.4 Subagents（子代理）

**文件格式**：Markdown + YAML frontmatter

**位置**：

- 项目级：`.claude/agents/*.md`
- 全局级：`~/.claude/agents/*.md`

**示例**（`.claude/agents/code-reviewer.md`）：

```markdown
---
name: code-reviewer
description: "Specialized code review agent"
tools: ["Read", "Grep", "Glob"]
model: "claude-sonnet-4-5"
---

You are a specialized code reviewer. Focus on:
- Security vulnerabilities
- Performance issues
- Code style consistency
```

**调用方式**：自然语言、`@` 提及、`--agent` CLI 标志

### 3.5 Hooks — 事件驱动自动化

**配置位置**：`settings.json` 中的 `hooks` 键

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/validate-bash.sh",
            "timeout": 5
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/format-code.sh",
            "timeout": 20
          }
        ]
      }
    ]
  }
}
```

**事件类型**：`PreToolUse`, `PostToolUse`, `ConfigChange` 等

**Hook 脚本通过 stdin 接收 JSON 输入**（包含 `tool_name` 和 `tool_input`），`exit 2` 可阻止操作。

### 3.6 settings.json — 权限与配置

**格式**：JSON（带 JSON Schema 支持）

**位置层级（优先级从高到低）**：

1. 组织级 managed-settings.json（不可覆盖）
2. CLI 标志（`--permission-mode` 等）
3. `.claude/settings.local.json`（个人本地覆盖，gitignore）
4. `.claude/settings.json`（项目级共享配置）
5. `~/.claude/settings.json`（用户级）

**核心配置键**：

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "permissions": {
    "allow": ["Read", "Grep", "Glob"],
    "deny": ["Bash(rm -rf *)"],
    "defaultMode": "ask",
    "additionalDirectories": ["/shared/libs"]
  },
  "hooks": { },
  "env": {
    "NODE_ENV": "development"
  },
  "agent": "code-reviewer",
  "mcpServers": { }
}
```

### 3.7 MCP 配置

**位置**：`.mcp.json`（项目级）或 `~/.claude.json`（全局）

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"],
      "env": {
        "DEBUG": "mcp:*"
      }
    },
    "database": {
      "command": "python3",
      "args": ["-m", "my_mcp_server"],
      "env": {
        "DATABASE_URL": "postgresql://localhost/mydb"
      }
    }
  }
}
```

**传输协议支持**：stdio、HTTP、SSE（Codex CLI 仅支持 stdio + HTTP url）

### 3.8 完整目录树

```
project-root/
├── CLAUDE.md                            # 项目指令（提交到 git）
├── CLAUDE.local.md                      # 个人覆盖（gitignore，已弃用）
├── .mcp.json                            # 项目 MCP 配置
├── .worktreeinclude                     # worktree 包含规则
└── .claude/
    ├── settings.json                    # 权限 + hooks + env（提交）
    ├── settings.local.json              # 个人覆盖（gitignore）
    ├── rules/                           # 模块化路径规则
    │   ├── code-style.md                # 始终加载
    │   ├── api-guidelines.md            # paths: src/api/**/*
    │   └── testing-rules.md             # paths: **/*.test.*
    ├── skills/                          # 可复用工作流
    │   ├── deploy/
    │   │   ├── SKILL.md
    │   │   └── scripts/
    │   │       └── health-check.sh
    │   └── code-review/
    │       └── SKILL.md
    ├── commands/                        # 自定义斜杠命令（已统一到 skills）
    │   └── review.md                    # → /project:review
    ├── agents/                          # 子代理定义
    │   ├── code-reviewer.md
    │   └── security-auditor.md
    ├── hooks/                           # Hook 脚本存放
    │   └── validate-bash.sh
    ├── output-styles/                   # 自定义输出样式
    │   └── minimal.md
    └── agent-memory/                    # 子代理持久记忆
        └── code-reviewer/

~/.claude/                               # 全局（个人，所有项目）
├── CLAUDE.md                            # 全局指令
├── settings.json                        # 全局设置
├── keybindings.json                     # 快捷键
├── rules/                              # 全局规则
├── skills/                             # 全局技能
├── commands/                           # 全局命令
├── agents/                             # 全局子代理
├── output-styles/                      # 全局输出样式
├── themes/                             # 自定义主题
├── plugins/                            # 已安装插件
├── projects/                           # 按项目的会话数据
│   └── <workspace>/
│       ├── memory/                     # 自动记忆
│       └── sessions/                   # 会话记录
└── ~/.claude.json                       # 应用状态 + OAuth + 全局 MCP
```

---

## 4. 功能对比矩阵

### 4.1 指令系统对比

| 特性 | Codex CLI | Claude Code |
|------|-----------|-------------|
| **主指令文件** | `AGENTS.md` | `CLAUDE.md` |
| **文件格式** | 纯 Markdown | 纯 Markdown + `@import` |
| **覆盖文件** | `AGENTS.override.md` | 已弃用 `CLAUDE.local.md` |
| **全局指令** | `~/.codex/AGENTS.md` | `~/.claude/CLAUDE.md` |
| **项目指令** | `$REPO_ROOT/AGENTS.md` | `./CLAUDE.md` 或 `./.claude/CLAUDE.md` |
| **子目录指令** | `$CWD/AGENTS.md` | 子目录 `CLAUDE.md`（按需加载） |
| **合并策略** | 从根到叶拼接，后者覆盖 | 三层拼接，更具体的覆盖更通用 |
| **大小限制** | 32 KiB（可配置） | 建议 < 200 行（无硬限制） |
| **跨文件引用** | 不支持 | `@import` 语法（5 级递归） |
| **自动生成** | 无 | `/init` 命令 |
| **检查命令** | 无内置 | `/memory` 查看活跃指令 |
| **禁用方式** | `--no-project-doc` / `CODEX_DISABLE_PROJECT_DOC=1` | 删除文件 |
| **模块化规则** | 不支持（仅目录层级） | `.claude/rules/` + 路径 glob 过滤 |
| **后备文件名** | 可配置 `project_doc_fallback_filenames` | 不支持 |

### 4.2 技能系统对比

| 特性 | Codex CLI | Claude Code |
|------|-----------|-------------|
| **技能格式** | Agent Skills 开放标准 | Agent Skills 开放标准 + Claude 扩展字段 |
| **SKILL.md frontmatter** | 仅 `name` + `description` | 完整字段集（15+ 字段） |
| **用户级技能路径** | `~/.codex/skills/` 或 `$HOME/.agents/skills/` | `~/.claude/skills/` |
| **项目级技能路径** | `.agents/skills/` | `.claude/skills/` |
| **系统级技能** | `/etc/codex/skills/` + 内置 .system | 无 |
| **触发方式** | `$skill-name` 或隐式匹配 | `/skill-name` 或隐式匹配 |
| **隐式调用控制** | `openai.yaml` → `allow_implicit_invocation` | `disable-model-invocation: true` |
| **子代理隔离** | 不支持 | `context: fork` + `agent: <type>` |
| **路径范围过滤** | 不支持 | `paths: src/**/*.ts` |
| **模型覆盖** | 不支持 | `model: sonnet` |
| **工具白名单** | 标准字段（标记实验性） | `allowed-tools` 完整实现 |
| **支持文件** | `scripts/`, `references/`, `assets/` | 目录内任意文件 |
| **附加元数据文件** | `agents/openai.yaml`（UI + 策略 + 依赖） | 无（全在 frontmatter 中） |
| **安装分发** | `$skill-installer` + 插件系统 | 插件系统 (`claude plugin`) |
| **禁用技能** | `config.toml` → `[[skills.config]]` | 删除或移动 |

### 4.3 配置系统对比

| 特性 | Codex CLI | Claude Code |
|------|-----------|-------------|
| **配置格式** | TOML | JSON（带 JSON Schema） |
| **配置文件** | `~/.codex/config.toml` + `.codex/config.toml` | `~/.claude/settings.json` + `.claude/settings.json` |
| **个人覆盖** | 无单独文件 | `.claude/settings.local.json`（gitignore） |
| **Profile 系统** | `[profiles.NAME]` + `--profile` | 不支持 |
| **沙箱配置** | `sandbox_mode`（3 级） | `permissions`（allow/deny/ask） |
| **事件 Hooks** | 不支持（截至目前） | `PreToolUse` / `PostToolUse` / `ConfigChange` |
| **子代理定义** | 不支持 | `.claude/agents/*.md` |
| **环境变量** | `[shell_environment_policy]` | `settings.json` → `env` |
| **组织级管控** | 系统级 `/etc/codex/config.toml` | `managed-settings.json` |
| **热重载** | 需重启 | 自动检测变更并重载 |

### 4.4 MCP 集成对比

| 特性 | Codex CLI | Claude Code |
|------|-----------|-------------|
| **配置格式** | TOML (`[mcp_servers.NAME]`) | JSON (`mcpServers` in .mcp.json) |
| **配置位置** | `~/.codex/config.toml`（统一） | `.mcp.json`（项目）+ `~/.claude.json`（全局） |
| **传输协议** | stdio + HTTP (url) | stdio + HTTP + SSE |
| **CLI/IDE 共享** | 是（共享 config.toml） | 否（Code 和 Desktop 配置分离） |
| **环境变量** | `[mcp_servers.NAME.env]` | `env: {}` 对象 |
| **认证** | `bearer_token_env_var` | 按服务器类型 |
| **超时控制** | `startup_timeout_sec` / `tool_timeout_sec` | 全局默认 |
| **启用/禁用** | `enabled = true/false` | 删除或注释 |
| **技能依赖声明** | `openai.yaml` → `dependencies.tools` | 无直接等价 |
| **OAuth 支持** | `mcp_oauth_credentials_store` | 内置 |

### 4.5 独有特性

**Codex CLI 独有**：
- AGENTS.override.md 覆盖机制
- 自定义后备文件名 (`project_doc_fallback_filenames`)
- Profile 系统（`[profiles.NAME]`）
- openai.yaml 元数据（UI 品牌、图标、颜色）
- 管理员级技能路径（`/etc/codex/skills/`）
- 技能依赖声明（MCP 工具依赖自动关联）
- 内置技能安装器（`$skill-installer`）

**Claude Code 独有**：
- `@import` 语法（指令文件引用链）
- `.claude/rules/` 路径范围模块化规则
- Hooks 事件系统（PreToolUse / PostToolUse）
- 子代理系统（.claude/agents/）
- `context: fork` 隔离执行
- settings.local.json 个人覆盖
- `/init` 自动生成指令
- `/memory` 检查当前活跃指令
- 自动记忆系统（projects/<workspace>/memory/）
- 输出样式自定义（output-styles/）
- 配置热重载
- 会话数据自动清理（`cleanupPeriodDays`）

---

## 数据来源

- OpenAI 官方文档：`developers.openai.com/codex/`
- OpenAI Codex GitHub：`github.com/openai/codex`
- Anthropic Claude Code 官方文档：`code.claude.com/docs/en/`
- Agent Skills 规范：`agentskills.io`、`github.com/agentskills/agentskills`
- 社区实践与 GitHub Issues
