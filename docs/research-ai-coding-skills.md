# AI 编程助手 Skill / 指令系统跨平台调研

> 调研时间：2026-05-26  
> 覆盖平台：Cursor、OpenAI Codex CLI、Claude Code、GitHub Copilot、Windsurf、Cline、Aider、Continue.dev  
> 背景：2025-12 Anthropic 发布 **Agent Skills 开放标准**（SKILL.md 格式），已被 30+ 工具采纳，正在成为 AI Agent 插件事实标准

---

## 一、总览对比

| 特性 | Cursor | Codex CLI | Claude Code | GitHub Copilot | Windsurf | Cline | Aider | Continue.dev |
|------|--------|-----------|-------------|----------------|----------|-------|-------|-------------|
| **运行环境** | IDE（桌面） | 终端 | 终端 | VS Code / GitHub | IDE（桌面） | VS Code 扩展 | 终端 | VS Code / JetBrains |
| **核心指令文件** | `SKILL.md` | `AGENTS.md` + `SKILL.md` | `CLAUDE.md` | `copilot-instructions.md` | `.windsurfrules` | `.clinerules` | `CONVENTIONS.md` | `.continuerules` |
| **指令格式** | Markdown + YAML frontmatter | 纯 MD（AGENTS）/ YAML frontmatter（SKILL） | 纯 Markdown | 纯 Markdown / YAML frontmatter | Markdown + YAML frontmatter | Markdown + YAML frontmatter | 纯 Markdown | Markdown + YAML frontmatter |
| **正式 Skill 系统** | 有 | 有（与 Cursor 共享 + openai.yaml 扩展） | 有（rules/ + hooks + sub-agents） | 有（SKILL.md + .agent.md + plugin.json） | 无 | 无（有 skills/ 目录但非正式体系） | 无 | 无（有 Context Provider） |
| **脚本/资源捆绑** | 有 | 有（+ LICENSE + 依赖声明） | 无 | 无 | 无 | 无 | 无 | 无 |
| **UI 元数据** | 无独立文件 | `agents/openai.yaml` | 无 | `plugin.json` | 无 | 无 | 无 | 无 |
| **触发机制** | Agent 自动判断 | `$skill-name` 显式 / description 隐式 | 自动加载 + 路径过滤 | 自动加载 | always / glob / model_decision / manual | always / glob / manual | 需显式 `--read` | always / glob / manual |
| **项目级配置** | `.cursor/skills/` | `.codex/skills/` | `.claude/` | `.github/copilot/` | `.windsurf/rules/` | `.clinerules/` | `.aider.conf.yml` | `.continue/` |
| **全局配置** | `~/.cursor/skills/` | `~/.codex/skills/` | `~/.claude/` | VS Code settings | `~/.codeium/windsurf/` | `~/.cline/rules/` | `~/.aider.conf.yml` | `~/.continue/` |
| **MCP 支持** | 原生 | 是（stdio + HTTP） | 是（stdio + HTTP + SSE） | 通过 Extensions | 是 | 是（一等公民） | 无原生支持 | 是 |
| **级联/继承** | 目录扫描 | 就近覆盖 | 合并（不覆盖） | 无级联 | Git root 向上搜索 | 工作区优先合并 | 配置文件层叠 | 无级联 |
| **跨工具兼容** | — | 支持 AGENTS.md | 支持 SKILL.md | 支持 SKILL.md / AGENTS.md | 支持 AGENTS.md | 检测 .cursorrules / .windsurfrules / AGENTS.md | — | — |

---

## 二、各平台详细分析

### 2.1 Cursor — 最完整的 Skill 体系

Cursor 拥有目前最成熟的本地 Skill 系统，支持可发现、可组合、可捆绑资源的技能。

#### 目录结构

```
~/.cursor/
├── skills-cursor/              # 内置技能（系统管理，勿修改）
│   ├── .sync-manifest.json     # 同步状态追踪
│   ├── canvas/
│   │   ├── SKILL.md
│   │   └── sdk/                # TypeScript 类型声明
│   ├── create-skill/
│   │   └── SKILL.md
│   └── ...
├── skills/                     # 用户全局技能
│   └── my-skill/
│       ├── SKILL.md            # 必需 — 主指令文件
│       ├── scripts/            # 可选 — 可执行脚本
│       ├── references/         # 可选 — 参考文档（按需读取）
│       └── assets/             # 可选 — 静态资源

project/
└── .cursor/
    ├── skills/                 # 项目级技能
    │   └── project-skill/
    │       └── SKILL.md
    └── rules/                  # 规则文件（不同于 Skill）
        └── backend.mdc
```

#### SKILL.md 格式

```yaml
---
name: my-skill                    # 必需，小写+连字符，最长 64 字符
description: >-                   # 必需，最长 1024 字符
  做什么 + 何时使用。Agent 据此判断是否激活。
disable-model-invocation: true    # 可选，设为 true 则仅显式调用时加载
---

# 技能标题

## 工作流程
1. 步骤一
2. 步骤二

## 参考资源
- 详细 API 见 [reference.md](reference.md)
- 示例见 [examples.md](examples.md)
```

#### 发现与加载流程

```
启动扫描 → 读取所有 SKILL.md 的 name + description
    ↓
用户请求 → Agent 匹配 description 判断相关性
    ↓
激活 → 加载完整 SKILL.md 内容
    ↓
执行 → 按需读取 scripts/ references/ assets/
```

#### 规则文件（`.mdc`，区别于 Skill）

```yaml
---
description: 后端开发规范
globs: "backend/**"
alwaysApply: false
---
# 规则内容（Markdown）
```

**Skill vs Rule 的区别**：Skill 是独立的可复用技能包，包含脚本和资源；Rule 是轻量的上下文规则，仅影响编辑行为。

---

### 2.2 OpenAI Codex CLI — 与 Cursor 共享 Skill 格式 + 独有产品层

Codex CLI 采用与 Cursor **完全相同的 SKILL.md 格式**，技能文件可跨平台复用。额外引入 `AGENTS.md` 层级化指令 + `agents/openai.yaml` UI/策略元数据 + `plugin.json` 插件打包。

#### 目录结构

```
~/.codex/
├── instructions.md             # 全局指令
├── config.toml                 # 全局配置（TOML 格式）
└── skills/
    ├── .system/                # 预装系统技能（勿修改）
    │   ├── .codex-system-skills.marker
    │   ├── imagegen/
    │   │   ├── SKILL.md
    │   │   ├── agents/openai.yaml    # UI + 策略元数据
    │   │   ├── assets/imagegen-small.svg
    │   │   ├── references/           # 多个参考文档
    │   │   ├── scripts/              # Python 脚本
    │   │   └── LICENSE.txt
    │   ├── skill-creator/
    │   ├── skill-installer/
    │   ├── openai-docs/
    │   └── plugin-creator/
    └── my-skill/               # 用户技能
        ├── SKILL.md
        ├── agents/openai.yaml  # 可选但推荐
        ├── scripts/
        │   └── requirements.txt  # Python 依赖声明
        ├── references/
        └── assets/

project/
├── AGENTS.md                   # 项目级指令（核心）
├── src/
│   ├── AGENTS.md               # 目录级指令（就近覆盖）
│   └── components/
│       └── AGENTS.md           # 更深层覆盖
└── .codex/
    └── skills/                 # 项目级技能
```

#### AGENTS.md — 层级化指令

```markdown
# 项目指令

- 使用 TypeScript strict 模式
- 所有 API 调用通过 service 层
- 测试使用 Vitest
```

- 纯 Markdown，无需 frontmatter
- **就近覆盖**：离工作文件最近的 `AGENTS.md` 优先级最高
- 与 Skill 互补：AGENTS.md 提供上下文规则，Skill 提供可复用技能

#### agents/openai.yaml — Codex 独有 UI 元数据

这是 Codex 区别于 Cursor 的独有配置，供产品 UI 层读取，**不注入** Agent 上下文：

```yaml
interface:
  display_name: "My Skill"           # UI 显示名
  short_description: "简短描述"       # 25-64 字符
  icon_small: "./assets/icon.svg"    # 小图标（列表视图）
  icon_large: "./assets/logo.svg"    # 大图标（详情页）
  brand_color: "#3B82F6"             # 品牌强调色
  default_prompt: "Use $my-skill to ..."  # 默认提示词，必须含 $skill-name

dependencies:
  tools:
    - type: "mcp"
      value: "github"
      transport: "streamable_http"
      url: "https://..."

policy:
  allow_implicit_invocation: true    # false = 仅 $skill-name 显式调用
```

#### Skill 间引用

在 SKILL.md 和 default_prompt 中用 `$skill-name` 语法引用其他技能：
- `$imagegen` — 引用图像生成技能
- `$hatch-pet` — 引用宠物生成技能

#### 插件打包（Plugin）

Codex 支持将多个 Skill 打包为 Plugin 进行分发：

```json
// .codex-plugin/plugin.json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "skills": "./skills/"
}
```

通过 `config.toml` 中的 `[plugins]` 和 `[marketplaces]` 启用 marketplace 分发。

#### 沙箱机制

| 平台 | 沙箱方式 |
|------|---------|
| macOS | Apple Seatbelt (`sandbox-exec`) |
| Linux | Docker 容器 / Landlock |

`full-auto` 模式下默认禁用网络访问，文件系统限制在项目目录。

#### Cursor vs Codex 关键差异

| 维度 | Cursor | Codex |
|------|--------|-------|
| UI 元数据 | 无独立文件 | `agents/openai.yaml` |
| 禁止自动调用 | `disable-model-invocation: true` | `policy.allow_implicit_invocation: false` |
| 显式调用语法 | 提及 skill 名 / 上下文匹配 | `$skill-name` |
| 插件打包 | 无 | `plugin.json` + marketplace |
| Frontmatter 额外字段 | `metadata.surfaces` | `license`, `allowed-tools`, `metadata.short-description` |
| 系统技能标识 | `.sync-manifest.json` | `.codex-system-skills.marker` |
| 安装后重启 | 通常不需要 | skill-installer 要求重启 |

---

### 2.3 Anthropic Claude Code — 指令 + 命令 + 规则 + Hooks

Claude Code 通过 `CLAUDE.md` 指令 + 自定义命令 + 结构化规则目录 + Hooks 事件系统 + 子代理实现全面定制。其 SKILL.md 扩展字段（15+）远多于 Codex CLI。

#### 目录结构

```
~/.claude/
├── CLAUDE.md                   # 全局指令
├── settings.json               # 全局设置（权限 + MCP）
├── credentials.json            # API 凭据
├── commands/                   # 个人自定义命令
│   └── my-review.md            #   → /user:my-review
└── projects/
    └── <project-hash>/
        ├── settings.json       # 项目设置
        └── todos.json          # 持久化任务追踪

project/
├── CLAUDE.md                   # 项目指令（始终加载，Git 追踪）
├── CLAUDE.local.md             # 本地覆盖（不进 Git）
├── src/
│   └── CLAUDE.md               # 子目录指令（相关时加载）
└── .claude/
    ├── commands/               # 项目自定义命令
    │   ├── fix-lint.md         #   → /project:fix-lint
    │   └── deploy/
    │       └── staging.md      #   → /project:deploy:staging
    ├── rules/                  # 结构化规则（类似 Cursor .mdc）
    │   └── backend.md
    ├── agents/                 # 子代理定义
    └── settings.json           # 项目级权限 + MCP
```

#### CLAUDE.md 格式

```markdown
# 项目说明

本项目使用 Python + FastAPI。

## 代码规范
- 使用 type hints
- 遵循 PEP 8
- 测试覆盖率 > 80%
```

- 纯 Markdown，无 frontmatter
- **合并策略**：所有层级的 CLAUDE.md 合并（非覆盖）

#### 指令级联

| 文件 | 范围 | Git 追踪 |
|------|------|---------|
| `~/.claude/CLAUDE.md` | 全局 | N/A |
| `./CLAUDE.md` | 项目（共享） | 是 |
| `./CLAUDE.local.md` | 项目（私有） | 否 |
| `./subdir/CLAUDE.md` | 子目录 | 是 |

#### 自定义命令

```markdown
<!-- .claude/commands/review.md -->
Review the current git diff and provide feedback on:
1. Code quality
2. Potential bugs

Use $ARGUMENTS for additional context.
```

- `$ARGUMENTS` 变量接收用户额外输入
- 文件名即命令名，子目录形成命名空间

#### 权限系统

```json
// .claude/settings.json
{
  "permissions": {
    "allow": ["Bash(git *)", "Bash(npm test)", "Read(*)"],
    "deny": ["Bash(rm -rf *)"]
  }
}
```

---

### 2.4 GitHub Copilot — 六层渐进式扩展体系

Copilot 2025-2026 年大幅扩展了本地能力，形成从简单指令到完整插件的六层体系。

#### 完整目录结构

```
project/
├── .github/
│   ├── copilot-instructions.md      # 全局指令（始终加载）
│   ├── copilot/
│   │   └── settings.json            # Copilot 项目配置
│   └── *.instructions.md            # 按场景指令（如 test.instructions.md）
├── .copilot/
│   ├── skills/                      # SKILL.md 技能（跨平台标准）
│   │   └── my-skill/
│   │       └── SKILL.md
│   ├── agents/                      # 自定义代理
│   │   └── reviewer.agent.md
│   ├── prompts/                     # Prompt 文件
│   │   └── test.prompt.md
│   └── hooks/                       # 生命周期钩子
└── .copilot-plugin/
    └── plugin.json                  # 插件打包清单
```

#### 六层能力梯度

| 层级 | 文件 | 复杂度 | 说明 |
|------|------|--------|------|
| 1 | `copilot-instructions.md` | 最简 | 纯 Markdown 项目指令，5 分钟生效 |
| 2 | `*.instructions.md` | 简单 | 按场景的指令文件 |
| 3 | `.prompt.md` | 中等 | 可复用 Prompt 模板，支持变量 |
| 4 | `.agent.md` | 中等 | 自定义 Agent，定义工具和行为边界 |
| 5 | `SKILL.md` | 较高 | 跨平台标准技能格式 |
| 6 | Extensions（远程服务） | 最高 | Web 服务，需部署基础设施 |

#### 本地指令

```markdown
<!-- .github/copilot-instructions.md -->
# 项目规范

- TypeScript + React 18
- Tailwind CSS
- Zustand 状态管理
```

- 需在 VS Code 设置中启用：`github.copilot.chat.codeGeneration.useInstructionFiles: true`

#### VS Code 设置中的指令

```json
{
  "github.copilot.chat.codeGeneration.instructions": [
    { "text": "使用 async/await，不用 .then()" },
    { "file": "docs/coding-standards.md" }
  ]
}
```

#### 自定义 Agent（`.agent.md`，较新）

```yaml
---
name: reviewer
description: Code review agent
tools: [read_file, search, terminal]
---
你是一个代码审查专家...
```

#### Extensions（远程服务）

```
用户 ↔ GitHub Copilot ↔ Extension Server (你的服务)
```

| 类型 | 说明 | 复杂度 |
|------|------|--------|
| **Skillset** | 定义 API 端点，Copilot 按需调用 | 轻量 |
| **Agent** | 处理完整对话线程 | 完整 |

- 通过 `@extension-name` 调用
- 需注册为 GitHub App + 部署服务器

#### 跨平台兼容

GitHub Copilot 现已支持读取 `SKILL.md` 和 `AGENTS.md`，这意味着为 Cursor/Codex 编写的技能文件在 Copilot 中也可被识别。

---

### 2.5 Windsurf (Codeium) — 规则 + 记忆系统

#### 目录结构

```
project/
├── .windsurfrules              # 旧格式（向后兼容，无触发器）
├── AGENTS.md                   # 跨工具兼容（根级 = always-on）
└── .windsurf/
    └── rules/                  # 目录规则（支持触发器，限 12K 字符/文件）
        ├── general.md
        └── react.md

~/.codeium/windsurf/memories/
    └── global_rules.md         # 全局规则（限 6K 字符）
```

#### 规则文件格式

**目录格式（`.windsurf/rules/*.md`，Wave 8 起）：**

```yaml
---
trigger: always_on              # 每次对话都注入
# trigger: model_decision       # 仅 description 进入提示词，模型决定是否读取全文
# trigger: glob                 # 匹配文件被读取/编辑时触发
# trigger: manual               # 仅 @规则名 显式引用
glob: ["*.tsx"]                 # glob 触发模式需要
description: React 组件规范     # model_decision 时尤为关键
---
# React 组件规则
...
```

#### 四种触发模式

| 模式 | 行为 |
|------|------|
| `always_on` | 始终注入系统提示词 |
| `model_decision` | 仅 description 进入提示词，模型自主决定是否读取全文 |
| `glob` | 匹配文件被操作时触发 |
| `manual` | 仅用户用 `@规则名` 显式引用 |

`model_decision` 是 Windsurf 独有的——类似 Cursor Skill 的 Agent 自主判断，但粒度更细。

#### 字符限制

- 全局规则：6,000 字符
- 单个工作区规则：12,000 字符/文件
- 超限时全局规则优先保留

#### Memories 系统

Windsurf 独有的持久化记忆功能——Cascade（AI）可以跨会话记住事实，存储在 `~/.codeium/windsurf/memories/`，与规则不同，记忆是从对话中自动生成的。

---

### 2.6 Cline — 规则 + Memory Bank + 跨工具兼容

#### 目录结构

```
~/.cline/
├── rules/                      # 全局规则（跨所有 Cline 客户端）
├── hooks/                      # 全局钩子
├── skills/                     # 全局技能（目录存在但非正式体系）
├── agents/                     # 全局代理定义
└── data/settings/
    ├── providers.json          # API 密钥
    └── cline_mcp_settings.json # 全局 MCP 配置

project/
├── .clinerules/                # 项目规则目录（推荐，可 Git 追踪）
│   ├── 01-coding.md            # 数字前缀排序（可选）
│   └── api.md
├── .clinerules                 # 或单文件（旧格式）
└── .cline/
    ├── rules/                  # 项目规则（备选位置）
    ├── mcp_settings.json       # 项目 MCP 配置
    └── memory-bank/            # 持久化上下文
        ├── projectbrief.md
        ├── productContext.md
        ├── systemPatterns.md
        ├── techContext.md
        ├── activeContext.md
        └── progress.md
```

#### 规则格式

```yaml
---
paths:                          # glob 模式，限定生效范围
  - "src/api/**"
  - "src/services/**"
description: API 层规范         # UI 中显示的标签
alwaysApply: false              # true = 无视路径始终加载
---
# API 规则
...
```

- 无 frontmatter 的文件**始终生效**
- `paths: []`（空数组）= 规则永不激活（临时禁用）
- 通过 `/newrule` 斜杠命令可交互式创建规则

#### 跨工具兼容

Cline 自动检测并加载其他工具的规则文件：`.cursorrules`、`.windsurfrules`、`AGENTS.md`。

#### Memory Bank

Cline 独有的结构化上下文持久机制，将项目知识分层存储：

| 文件 | 内容 |
|------|------|
| `projectbrief.md` | 项目概述和核心需求 |
| `productContext.md` | 产品上下文和用户场景 |
| `systemPatterns.md` | 系统架构和设计模式 |
| `techContext.md` | 技术栈和依赖 |
| `activeContext.md` | 当前工作上下文 |
| `progress.md` | 进度追踪 |

---

### 2.7 Aider — 极简主义

Aider 没有 Skill 系统，没有 frontmatter，没有触发器。它用最简单的配置文件 + 独特的 Repo Map 技术补偿。

#### 文件布局

```
project/
├── CONVENTIONS.md              # 编码规范（⚠️ 需显式声明，非自动加载）
├── .aider.conf.yml             # 项目配置
├── .aiderignore                # 排除文件（gitignore 语法）
└── .aider.model.settings.yml   # 模型覆盖配置

~/.aider.conf.yml               # 全局配置（项目配置覆盖全局）
```

#### 配置文件

```yaml
# .aider.conf.yml
model: anthropic/claude-sonnet-4.6
weak-model: anthropic/claude-haiku-4.5
edit-format: diff

auto-commits: true
auto-lint: true
lint-cmd:
  - "python: ruff check --fix"
  - "javascript: eslint --fix"
test-cmd: "pytest -x"

read:                           # ⚠️ CONVENTIONS.md 必须在此显式声明
  - CONVENTIONS.md
  - docs/architecture.md

map-tokens: 2048                # Repo Map token 预算
stream: true
aiderignore: .aiderignore

alias:
  - "sonnet:anthropic/claude-sonnet-4.6"
  - "opus:anthropic/claude-opus-4.7"
```

**注意**：`CONVENTIONS.md` **不会自动加载**，必须通过 `read:` 配置或 `aider --read CONVENTIONS.md` 命令行参数显式引入。`read` 中的文件以只读方式加入上下文，支持提示缓存。

#### 配置的四种等价方式

每个选项均支持：命令行（`--dark-mode`）、YAML（`dark-mode: true`）、环境变量（`AIDER_DARK_MODE=true`）、.env 文件。

#### Repo Map

Aider 的独特优势——使用 tree-sitter 自动提取代码库的函数/类签名，生成压缩视图帮助模型理解代码结构。通过 `--map-tokens` 控制预算（默认 1024）。

---

### 2.8 Continue.dev — 最灵活的扩展体系

Continue.dev 没有正式的 Skill 系统，但通过 Context Provider + 自定义 Prompt 文件提供最灵活的扩展性。

#### 目录结构

```
~/.continue/
├── config.yaml                 # 全局配置（主力）
└── config.json                 # 遗留 JSON 格式

project/
├── .continuerules              # 项目规则
└── .continue/
    ├── config.yaml             # 项目级覆盖
    ├── rules/                  # 目录规则
    │   └── python.md
    └── prompts/                # 自定义斜杠命令
        └── test.prompt
```

#### 自定义 Prompt

```yaml
# .continue/prompts/test.prompt
---
name: test
description: 生成单元测试
---

为选中的代码编写单元测试，使用 {{{ input }}}

上下文：
{{{ codebase }}}
```

#### Context Provider 体系

| Provider | 说明 |
|----------|------|
| `codebase` | 语义搜索整个代码库 |
| `docs` | 索引外部文档 |
| `terminal` | 终端输出 |
| `open` | 当前打开的文件 |
| `diff` | Git diff |
| `url` | 网页内容 |
| `database` | 数据库 schema |

---

## 三、架构模式分类

### 3.1 本地优先 vs 远程优先

| 模式 | 平台 | 特点 |
|------|------|------|
| **本地优先** | Cursor、Codex CLI、Claude Code、Aider | 所有指令和技能存为本地文件，无需服务器 |
| **远程优先** | GitHub Copilot Extensions | 技能以远程 Web 服务形式存在，需部署基础设施 |
| **混合** | Windsurf、Cline、Continue.dev、Copilot（新增本地层） | 本地规则 + MCP / 远程服务 |

### 3.2 指令复杂度梯度

```
简单 ←——————————————————————————————————————→ 复杂

Aider         Windsurf      Claude Code    Cursor/Codex     Copilot
(纯 Markdown)  (规则+触发器)  (指令+命令      (Skill 系统       (6层渐进：
               Cline         +规则+hooks     ├── SKILL.md     instructions
              Continue.dev   +子代理)        ├── scripts/     → prompts
                                             ├── references/  → agents
                                             ├── assets/      → skills
                                             └── openai.yaml) → plugins
                                                               → extensions)
```

### 3.3 规则格式趋势

**趋势一：触发器模式趋同**

Windsurf、Cline、Continue.dev 均采用类似的条件激活模式，但字段名存在差异：

| 平台 | 触发字段 | 路径字段 | 始终生效 |
|------|----------|----------|---------|
| Windsurf | `trigger: always_on / model_decision / glob / manual` | `globs` | `always_on` |
| Cline | 无 trigger 字段 | `paths` | `alwaysApply: true` |
| Continue.dev | 无 trigger 字段 | `globs` | `alwaysApply: true` |

**趋势二：SKILL.md / AGENTS.md 正在成为跨平台标准**

| 文件 | 支持的平台 |
|------|-----------|
| `SKILL.md` | Cursor、Codex CLI、Claude Code、GitHub Copilot |
| `AGENTS.md` | Codex CLI、Windsurf、Cline、GitHub Copilot |

这两个文件正在成为 AI Agent 插件生态的**事实标准**。

### 3.4 独有特性矩阵

| 独有特性 | 平台 | 说明 |
|----------|------|------|
| `agents/openai.yaml` | Codex CLI | UI/策略元数据，品牌色、图标、默认提示词 |
| `model_decision` 触发 | Windsurf | 模型自主决定是否读取全文 |
| Memory Bank | Cline | 结构化分层项目知识持久化 |
| Memories | Windsurf | 对话自动生成的跨会话记忆 |
| Repo Map | Aider | tree-sitter 提取的代码结构压缩视图 |
| Context Provider | Continue.dev | 可插拔上下文源（codebase/docs/url/database） |
| `CLAUDE.local.md` | Claude Code | 不进 Git 的本地指令覆盖 |
| Hooks 事件系统 | Claude Code、Cursor | 生命周期钩子绑定 |
| Sub-agents | Claude Code | `context: fork` 隔离子代理 |
| 远程 Extensions | GitHub Copilot | HTTP Web 服务式插件 |
| Plugin + Marketplace | Codex CLI | `plugin.json` 打包 + 远程分发 |

---

## 四、关键洞察

1. **SKILL.md 正在成为跨平台标准**：起源于 Anthropic 2025-12 发布的 Agent Skills 开放标准，已被 Cursor、Codex CLI、Claude Code、GitHub Copilot 等 30+ 工具采纳。**以 SKILL.md 编写技能是当前最安全的投资**。

2. **Codex CLI 的产品层最完整**：共享 Cursor 的 SKILL.md 核心，额外提供 `openai.yaml`（UI 元数据）、`plugin.json`（打包分发）、marketplace（远程安装）、`skill-installer`（GitHub 安装器）等产品化能力。

3. **Claude Code 的运行时控制最精细**：15+ 个 SKILL.md 扩展字段、Hooks 事件系统、`context: fork` 子代理隔离、`rules/` 结构化规则目录，在不引入正式插件体系的情况下实现了高度定制。

4. **GitHub Copilot 从"远程优先"转向"混合"**：2025-2026 年大幅增加本地能力（SKILL.md、.agent.md、.prompt.md、plugin.json），从纯远程服务模式转向六层渐进式体系。

5. **触发器格式已趋同但不统一**：Windsurf 用 `trigger`/`globs`，Cline 用 `paths`/`alwaysApply`，Continue.dev 用 `globs`/`alwaysApply`——语义相同但字段名不同。

6. **MCP 正在成为通用扩展协议**：除 Aider 外所有主流平台已支持。Claude Code 支持最多传输协议（stdio + HTTP + SSE）。

7. **指令级联方式各异**：Codex CLI 就近覆盖，Claude Code 全部合并，Windsurf 向 Git root 向上搜索，Cline 工作区优先合并，Aider 配置文件层叠。

8. **所有平台的最大公约数是纯 Markdown**：即使最复杂的 Skill 系统，其核心也是 Markdown 文件。YAML frontmatter 是第二大公约数。

---

## 五、跨平台兼容 Skill 设计方案

基于以上调研，最大兼容性方案：

```
my-skill/
├── SKILL.md                    # 核心（Cursor / Codex / Claude Code / Copilot）
├── AGENTS.md                   # 层级指令（Codex / Windsurf / Cline / Copilot）
├── CLAUDE.md                   # Claude Code（可 symlink 到 SKILL.md 正文）
├── agents/
│   └── openai.yaml             # Codex UI 元数据（可选）
├── .github/
│   └── copilot-instructions.md # GitHub Copilot 回退（可选）
├── scripts/                    # Cursor / Codex 可执行
│   ├── validate.py
│   └── requirements.txt
├── references/                 # Cursor / Codex 按需读取
│   └── api-spec.md
└── assets/                     # 静态资源
    └── icon.svg
```

核心原则：

1. **以 SKILL.md 为主体**——这是跨平台覆盖面最广的格式
2. **添加 AGENTS.md 扩大兼容性**——覆盖 Windsurf、Cline 等支持该格式的工具
3. **按需生成平台特定文件**——`openai.yaml`（Codex UI）、`CLAUDE.md`（Claude Code）等
4. **脚本和资源只有 Cursor/Codex 能执行**——其他平台仅使用 Markdown 指令部分
