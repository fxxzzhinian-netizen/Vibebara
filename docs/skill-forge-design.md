# Skill Forge — 抽象 Skill 包 & 多平台构建设计

> 版本：v0.2 (Confirmed)  
> 目标平台：Cursor、Codex CLI（后续可扩展）

---

## 一、设计目标

1. 定义一个**平台无关的抽象 Skill 包**格式（`skill.config.yaml` + `VibeH.md`），作为所有平台信息的**超集**
2. 针对每个目标平台，定义**严格的构建规则**——生成的产物必须 100% 符合该平台规范，不含任何其他平台的文件或字段
3. 构建过程是**有损转换**——目标平台不支持的字段和文件会被精确丢弃
4. 支持**反向导入**——从任意已支持平台（Codex/Cursor）的原生 skill 解析为抽象包，这是平台核心能力
5. 明确区分**仓库快照**、**项目 Skill 列表**与**用户部署实例**——导入仓库后不再监听原始来源目录；用户部署后才监听其本地部署目录

---

## 二、抽象 Skill 包结构

### 2.1 目录布局

抽象包是所有平台信息的**超集**——包含每个平台可能用到的全部文件和字段，无论某个平台是否支持。

```
my-skill/
├── skill.config.yaml           # 必需 — 统一配置（该抽象包副本的 source of truth）
├── VibeH.md                    # 必需 — 技能正文（纯 Markdown，不含 frontmatter）
├── scripts/                    # 可选
│   ├── validate.py
│   └── requirements.txt        # Python 依赖声明
├── references/                 # 可选
│   └── api-spec.md
├── assets/                     # 可选
│   ├── icon-small.svg          # 小图标（Codex 用，Cursor 构建时丢弃）
│   ├── icon-large.svg          # 大图标（Codex 用，Cursor 构建时丢弃）
│   └── template.png            # 通用资源（所有平台保留）
└── LICENSE                     # 可选（仅 Codex 构建时输出）
```

### 2.2 `skill.config.yaml` Schema

```yaml
# ============================================================
# 核心字段（所有平台共用）
# ============================================================
name: "my-skill"                      # 必需 | 小写+连字符，最长 64 字符
description: >-                       # 必需 | 最长 1024 字符
  做什么 + 何时使用的完整描述。
  Agent 据此判断是否激活该技能。

# ============================================================
# UI / 展示元数据
# ============================================================
ui:
  display_name: "My Skill"            # 可选 | UI 显示名（人类可读）
  short_description: "简短描述"        # 可选 | 25-64 字符，面板摘要
  brand_color: "#3B82F6"              # 可选 | 品牌强调色
  icon_small: "./assets/icon-small.svg"  # 可选 | 小图标路径（相对 skill 根目录）
  icon_large: "./assets/icon-large.svg"  # 可选 | 大图标路径
  default_prompt: >-                  # 可选 | 用户选择该技能时自动填入的 prompt
    Use $my-skill to do something.

# ============================================================
# 策略 / 行为控制
# ============================================================
policy:
  auto_invoke: true                   # 可选 | 是否允许 Agent 自动激活（默认 true）
                                      # false = 仅显式调用时加载

# ============================================================
# 依赖声明
# ============================================================
dependencies:
  skills:                             # 可选 | 依赖的其他技能
    - "$imagegen"
  tools:                              # 可选 | 依赖的外部工具
    - type: "mcp"
      name: "github"
      transport: "streamable_http"
      url: "https://..."

# ============================================================
# 资源声明（显式列出，避免歧义）
# ============================================================
resources:
  scripts:                            # 可选
    - path: "scripts/validate.py"
      description: "校验输出格式"
    - path: "scripts/requirements.txt"
      description: "Python 依赖"
  references:                         # 可选
    - path: "references/api-spec.md"
      description: "API 参考文档"
  assets:                             # 可选
    - path: "assets/template.png"
      description: "模板图片"

# ============================================================
# 元数据
# ============================================================
metadata:
  license: "MIT"                      # 可选
  author: "your-name"                 # 可选
  version: "1.0.0"                    # 可选
  tags: ["coding", "review"]          # 可选
  surfaces: ["ide"]                   # 可选 | Cursor 特有：限定适用界面
```

### 2.3 资源分类：通用 vs 平台特有

抽象包中的每个文件在构建时会被判定为"通用"或"平台特有"：

| 文件 | 分类 | Cursor 构建 | Codex 构建 |
|------|------|-------------|-----------|
| `VibeH.md` | 通用（合并入 SKILL.md） | 合并 | 合并 |
| `skill.config.yaml` | 仅抽象包 | 丢弃 | 丢弃 |
| `scripts/*` | 通用 | 复制 | 复制 |
| `references/*` | 通用 | 复制 | 复制 |
| `assets/*`（非图标） | 通用 | 复制 | 复制 |
| `assets/icon-*.svg` | 平台特有（Codex UI） | **丢弃** | 复制 |
| `LICENSE` | 平台特有（Codex） | **丢弃** | 复制为 `LICENSE.txt` |

判定规则：一个文件是否"平台特有"取决于它是否被 `skill.config.yaml` 中的**平台特有字段**（如 `ui.icon_small`）引用。被 `VibeH.md` 正文引用的文件始终视为通用。

### 2.4 `VibeH.md` — 技能正文

纯 Markdown，**不含 YAML frontmatter**。这是技能的核心指令内容，构建时会被嵌入到各平台的 `SKILL.md` 中。

```markdown
# My Skill

## Overview
...

## Workflow
1. Step one
2. Step two

## Script
Run: `python scripts/validate.py`
```

---

## 三、Cursor 构建规则

### 3.1 产物目录

```
<output>/
├── SKILL.md                    # 合成：frontmatter + VibeH.md
├── scripts/                    # 原样复制
├── references/                 # 原样复制
└── assets/                     # 仅复制通用资源（图标文件丢弃）
```

### 3.2 生成 `SKILL.md`

将 `skill.config.yaml` 的字段映射为 Cursor frontmatter + `VibeH.md` 正文：

```yaml
---
name: "{name}"
description: "{description}"
disable-model-invocation: true        # 仅当 policy.auto_invoke == false 时输出
metadata:                             # 仅当 metadata.surfaces 有值时输出
  surfaces: ["{metadata.surfaces}"]
---

{VibeH.md 原文}
```

### 3.3 字段映射

| 抽象字段 | Cursor 映射 | 说明 |
|----------|-------------|------|
| `name` | frontmatter `name` | 直接映射 |
| `description` | frontmatter `description` | 直接映射 |
| `policy.auto_invoke: false` | `disable-model-invocation: true` | 反转布尔值 |
| `policy.auto_invoke: true` | **不输出该字段** | Cursor 默认允许 |
| `metadata.surfaces` | `metadata.surfaces` | 仅 Cursor 支持，直接映射 |
| `ui.*` | **全部丢弃** | Cursor 无 UI 元数据文件 |
| `dependencies.tools` | **丢弃** | Cursor 无独立依赖声明 |
| `dependencies.skills` | **构建时校验**是否已安装，但不输出到产物 | 正文中的 `$skill` 引用已足够 |
| `metadata.license` | **丢弃** | Cursor 不需要 LICENSE |
| `resources.*` | 按路径复制通用文件 | 排除平台特有资源 |

### 3.4 严格删除清单

构建 Cursor 产物时，以下文件/目录**绝对不能存在**：

| 禁止文件 | 原因 |
|----------|------|
| `agents/` 目录 | Codex 特有 |
| `openai.yaml` | Codex 特有 |
| `LICENSE` / `LICENSE.txt` | Cursor 不需要 |
| `skill.config.yaml` | 抽象包配置，非平台文件 |
| `VibeH.md` | 已合并入 SKILL.md |
| `ui.icon_small` 引用的图标文件 | Cursor 无 UI 元数据 |
| `ui.icon_large` 引用的图标文件 | Cursor 无 UI 元数据 |

### 3.5 部署目标

| 范围 | 目标路径 |
|------|----------|
| 用户全局 | `~/.cursor/skills/{name}/` |
| 项目级 | `{workspace}/.cursor/skills/{name}/` |

---

## 四、Codex 构建规则

### 4.1 产物目录

```
<output>/
├── SKILL.md                    # 合成：精简 frontmatter + BODY.md
├── agents/
│   └── openai.yaml             # 从 ui + policy + dependencies 生成
├── scripts/                    # 原样复制（含 requirements.txt）
├── references/                 # 原样复制
├── assets/                     # 原样复制（含图标）
└── LICENSE.txt                 # 从 metadata.license 生成（可选）
```

### 4.2 生成 `SKILL.md`

Codex 的 SKILL.md **不含** 策略/UI 字段，仅保留 Agent 指令：

```yaml
---
name: "{name}"
description: "{description}"
---

{VibeH.md 原文}
```

### 4.3 生成 `agents/openai.yaml`

```yaml
interface:
  display_name: "{ui.display_name}"               # 回退到 name 的 Title Case
  short_description: "{ui.short_description}"      # 回退到 description 截取前 64 字符
  brand_color: "{ui.brand_color}"                  # 可选，有值才输出
  icon_small: "{ui.icon_small}"                    # 可选，有值才输出
  icon_large: "{ui.icon_large}"                    # 可选，有值才输出
  default_prompt: "{ui.default_prompt}"            # 回退到 "Use ${name} to ..."

dependencies:                                      # 仅当 dependencies.tools 有值时输出
  tools:
    - type: "{dependencies.tools[].type}"
      value: "{dependencies.tools[].name}"
      transport: "{dependencies.tools[].transport}"
      url: "{dependencies.tools[].url}"

policy:                                            # 仅当 auto_invoke != true 时输出
  allow_implicit_invocation: false                 # policy.auto_invoke 的直接映射
```

### 4.4 字段映射

| 抽象字段 | Codex 映射 | 说明 |
|----------|------------|------|
| `name` | SKILL.md frontmatter `name` | 直接映射 |
| `description` | SKILL.md frontmatter `description` | 直接映射 |
| `policy.auto_invoke` | openai.yaml `policy.allow_implicit_invocation` | 直接映射（同义） |
| `ui.display_name` | openai.yaml `interface.display_name` | 回退：name 转 Title Case |
| `ui.short_description` | openai.yaml `interface.short_description` | 回退：description[:64] |
| `ui.brand_color` | openai.yaml `interface.brand_color` | 可选 |
| `ui.icon_small` | openai.yaml `interface.icon_small` | 可选 |
| `ui.icon_large` | openai.yaml `interface.icon_large` | 可选 |
| `ui.default_prompt` | openai.yaml `interface.default_prompt` | 回退：`"Use ${name} to ..."` |
| `dependencies.skills` | **构建时校验**是否已安装，但不输出到产物 | 正文中的 `$skill` 引用已足够 |
| `dependencies.tools` | openai.yaml `dependencies.tools` | 直接映射 |
| `metadata.license` | `LICENSE.txt` 文件 | 生成标准 License 文本 |
| `metadata.surfaces` | **丢弃** | Codex 无此概念 |

### 4.5 严格删除清单

构建 Codex 产物时，以下**绝对不能存在**：

| 禁止内容 | 原因 |
|----------|------|
| SKILL.md 中的 `disable-model-invocation` | Cursor 特有字段 |
| SKILL.md 中的 `metadata.surfaces` | Cursor 特有字段 |
| `skill.config.yaml` | 抽象包配置，非平台文件 |
| `VibeH.md` | 已合并入 SKILL.md |

### 4.6 部署目标

| 范围 | 目标路径 |
|------|----------|
| 用户全局 | `~/.codex/skills/{name}/` |
| 项目级 | `{workspace}/.codex/skills/{name}/` |

---

## 五、构建流程

### 5.1 正向构建（Build）

```
skill.config.yaml + VibeH.md + resources/
          │
          ▼
    ┌──────────────┐
    │   Validate    │   Zod Schema 校验 + 依赖 skill 校验
    └──────┬───────┘
           │
     ┌─────┴─────┐
     ▼           ▼
┌─────────┐ ┌─────────┐
│ Cursor  │ │  Codex  │
│ Builder │ │ Builder │
└────┬────┘ └────┬────┘
     │           │
     ▼           ▼
┌─────────┐ ┌──────────────┐
│SKILL.md │ │ SKILL.md     │
│(含策略) │ │ (纯指令)     │
│         │ │ openai.yaml  │
│scripts/ │ │ LICENSE.txt  │
│refs/    │ │ scripts/     │
│assets/  │ │ refs/        │
│(无图标) │ │ assets/      │
└─────────┘ └──────────────┘
     │           │
     ▼           ▼
~/.cursor/   ~/.codex/
  skills/      skills/
```

### 5.2 构建时校验

| 校验项 | 说明 | 失败行为 |
|--------|------|----------|
| Schema 校验 | `skill.config.yaml` 符合 Zod schema | 阻断构建，报错 |
| `VibeH.md` 存在性 | 正文文件必须存在且非空 | 阻断构建，报错 |
| 资源文件存在性 | `resources` 中声明的路径必须存在 | 阻断构建，报错 |
| 依赖 skill 校验 | `dependencies.skills` 中的 skill 在目标平台是否已安装 | **警告**（不阻断） |
| `name` 格式 | 小写 + 连字符，≤64 字符 | 阻断构建，报错 |
| `description` 长度 | ≤1024 字符 | 阻断构建，报错 |
| `ui.short_description` 长度 | 25-64 字符（有值时） | 警告 |

---

## 六、反向导入（Import）— 平台核心能力

从已有的 Cursor / Codex 原生 skill 目录，反向解析为抽象包（`skill.config.yaml` + `VibeH.md`）。

### 6.1 用户操作流程

```
用户在主界面选择文件路径
          │
          ▼
    ┌──────────────┐
    │   自动扫描    │   识别目录下的 skill 文件（含 SKILL.md）
    └──────┬───────┘
           │
           ▼
    展示扫描结果列表（来源平台、名称、状态）
          │
          ▼
    用户点击【加入到个人仓库】或【加入到团队仓库】
          │
          ▼
    ┌──────────────┐
    │   反向导入    │   解析 → 生成 skill.config.yaml + VibeH.md
    │  （不补齐）   │   缺失字段标记为 incomplete，不调用 LLM
    └──────┬───────┘
           │
           ▼
    Skill 出现在目标仓库列表中（标记为"待补齐"）
```

导入是一次性快照。`_import_meta.source_path` 只用于溯源和展示，不作为持续同步源；原项目中的 Skill 后续变化不会自动写回个人仓库或团队仓库。

### 6.2 导入时的解析流程

```
原生 Skill 目录（Cursor 或 Codex）
          │
          ▼
    ┌──────────────┐
    │ detectOrigin │   识别来源平台（Cursor / Codex / 未知）
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │  parseSKILL  │   解析 SKILL.md → frontmatter + body
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │ parseExtras  │   解析平台特有文件（openai.yaml 等）
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │   merge &    │   合并为 skill.config.yaml + VibeH.md
    │   generate   │   标记 _import_meta.incomplete_fields
    └──────────────┘
```

### 6.2 来源检测规则

| 特征 | 判定为 |
|------|--------|
| 有 `agents/openai.yaml` | **Codex** |
| SKILL.md 中有 `disable-model-invocation` | **Cursor** |
| SKILL.md 中有 `metadata.surfaces` | **Cursor** |
| 仅有 `SKILL.md` + scripts/references/assets | **未知**（按通用处理） |

### 6.3 Cursor → 抽象包 映射

| Cursor 文件/字段 | 抽象包映射 |
|------------------|-----------|
| SKILL.md frontmatter `name` | `name` |
| SKILL.md frontmatter `description` | `description` |
| SKILL.md frontmatter `disable-model-invocation: true` | `policy.auto_invoke: false` |
| SKILL.md frontmatter `metadata.surfaces` | `metadata.surfaces` |
| SKILL.md body（frontmatter 之后） | `VibeH.md` |
| `scripts/` 目录 | `resources.scripts` + 复制文件 |
| `references/` 目录 | `resources.references` + 复制文件 |
| `assets/` 目录 | `resources.assets` + 复制文件 |
| `ui.*` | **全部留空**（Cursor 无 UI 元数据，导入后需手动补充） |

### 6.4 Codex → 抽象包 映射

| Codex 文件/字段 | 抽象包映射 |
|-----------------|-----------|
| SKILL.md frontmatter `name` | `name` |
| SKILL.md frontmatter `description` | `description` |
| SKILL.md body（frontmatter 之后） | `VibeH.md` |
| openai.yaml `interface.display_name` | `ui.display_name` |
| openai.yaml `interface.short_description` | `ui.short_description` |
| openai.yaml `interface.brand_color` | `ui.brand_color` |
| openai.yaml `interface.icon_small` | `ui.icon_small` + 复制图标到 `assets/` |
| openai.yaml `interface.icon_large` | `ui.icon_large` + 复制图标到 `assets/` |
| openai.yaml `interface.default_prompt` | `ui.default_prompt` |
| openai.yaml `policy.allow_implicit_invocation` | `policy.auto_invoke`（直接映射） |
| openai.yaml `dependencies.tools` | `dependencies.tools` |
| `scripts/` 目录 | `resources.scripts` + 复制文件 |
| `references/` 目录 | `resources.references` + 复制文件 |
| `assets/` 目录 | `resources.assets` + 复制文件 |
| `LICENSE.txt` | `LICENSE` + `metadata.license`（尝试检测 license 类型） |

### 6.5 导入后的信息损失标记与来源语义

导入时**不补齐缺失字段**，仅标记哪些字段缺失：

```yaml
# skill.config.yaml — 从 Cursor 导入后
_import_meta:
  source: "cursor"
  source_path: "~/.cursor/skills/test-helper"
  imported_at: "2026-05-26T16:00:00Z"
  tracking: false                 # 导入后不监听 source_path
  incomplete_fields:             # 缺失字段，部署时由 LLM 补齐
    - "ui.display_name"
    - "ui.short_description"
    - "ui.default_prompt"
```

```yaml
# skill.config.yaml — 从 Codex 导入后
_import_meta:
  source: "codex"
  source_path: "~/.codex/skills/test-helper"
  imported_at: "2026-05-26T16:00:00Z"
  tracking: false                 # 导入后不监听 source_path
  incomplete_fields: []          # Codex 信息较完整，通常无缺失
```

仓库层级：

| 层级 | 用途 | 是否监听来源 |
|------|------|--------------|
| 个人仓库 | 用户从本机或其他项目收集的 Skill 快照 | 否 |
| 团队仓库 | 团队共享、分发、项目部署的 Skill 基线 | 不监听导入来源，只接收用户部署实例回写 |
| 项目 Skill 列表 | 项目声明可用哪些团队 Skill，不绑定本地路径或工具 | 否 |
| 用户部署实例 | 用户点击"部署"后，将项目 Skill 部署到个人本地项目目录 | 是，监听该用户选择的部署目录 |

### 6.6 项目部署与监听规则

将团队仓库 Skill 添加到项目时，只进入项目 Skill 列表，不自动部署。因为团队成员可能使用不同 Vibe Coding 工具，也可能有不同的本地项目路径。

只有用户在项目 Skill 列表中点击**部署**时，才需要选择部署参数：

- Vibe Coding 工具：`cursor` 或 `codex`
- 本地项目路径或部署根路径
- 是否覆盖已存在同名 Skill

部署路径由用户选择的工具和路径推导：

| 工具 | 项目级部署路径 |
|------|----------------|
| Cursor | `{deploy_path}/.cursor/skills/{name}/` |
| Codex | `{deploy_path}/.codex/skills/{name}/` |

部署流程：

```
团队仓库 Skill
      │
      ▼
加入项目 Skill 列表
      │
      ▼
用户点击【部署】
      │
      ▼
选择工具 + 本地部署路径
      │
      ▼
按目标工具构建 Cursor/Codex 原生产物
      │
      ▼
写入用户指定的项目级 skills 目录
      │
      ▼
幂等维护项目 .gitignore
      │
      ▼
创建 user_skill_deployments 记录
      │
      ▼
监听该用户部署实例目录的后续变更
```

部署时必须维护 `.gitignore`：

```gitignore
# VibeHub local skill deployments
.cursor/skills/
.codex/skills/
```

写入规则：

- 如果项目根目录没有 `.gitignore`，则创建。
- 如果 `.gitignore` 已存在，则幂等追加上述块，避免重复写入。
- 不忽略整个 `.cursor/` 或 `.codex/`，只忽略项目级 skills 目录，避免误伤其他可提交配置。
- 如果相关目录此前已经被 Git 跟踪，`.gitignore` 不能自动取消跟踪，前端应提示用户需要手动从 Git 索引移除。

变更回写规则：

- 只有用户完成部署后的部署实例变化，才会触发团队仓库动态和团队 Skill 热更新。
- 团队 Skill 热更新由团队设置控制，默认关闭；关闭时变更进入待确认状态，开启时在无冲突时自动提升团队仓库版本。
- 团队仓库 Skill 当前不允许直接在线编辑，只能通过用户部署实例提升产生新版本。
- 个人仓库和导入来源项目不会被自动监听。
- 个人仓库复制到团队仓库后是独立快照，当前阶段不保留两者的版本关联。
- 项目原本已有的 Skill 可以在用户选择本地路径后被扫描/上传到团队仓库；进入团队仓库后也成为快照，后续要通过用户部署实例触发同步。

### 6.7 部署时 LLM 补齐流程

当用户点击**【部署】**按钮时，如果存在缺失字段，触发以下流程：

```
用户点击【部署到 Cursor / Codex】
          │
          ▼
    ┌──────────────┐
    │  检测缺失字段 │   读取 _import_meta.incomplete_fields 或动态检测
    └──────┬───────┘
           │
     有缺失字段？
     ┌─────┴─────┐
     │ 否        │ 是
     ▼           ▼
   直接构建   ┌──────────────┐
   & 部署    │  调用 LLM API │   发送 name + description + VibeH.md 摘要
             └──────┬───────┘
                    │
                    ▼
             ┌──────────────┐
             │ 返回建议值    │   JSON: { "ui.display_name": "...", ... }
             └──────┬───────┘
                    │
                    ▼
             ┌──────────────┐
             │ 前端展示      │   用户可编辑每个建议值
             │ 确认对话框    │
             └──────┬───────┘
                    │
              用户确认？
              ┌─────┴─────┐
              │ 取消       │ 确认
              ▼           ▼
            返回        ┌──────────────┐
                       │  写入配置     │   更新 skill.config.yaml
                       │  清除标记     │   移除 _import_meta.incomplete_fields
                       └──────┬───────┘
                              │
                              ▼
                       ┌──────────────┐
                       │  构建 & 部署  │   按目标平台规则生成产物
                       └──────────────┘
```

### 6.8 LLM 补齐 API

```
POST /api/v1/skill-forge/store/{id}/complete

Request: { "target": "cursor" }

Response: {
  "success": true,
  "incomplete_fields": ["ui.display_name", "ui.short_description", "ui.default_prompt"],
  "suggestions": {
    "ui.display_name": "Test Helper",
    "ui.short_description": "Validate skill loading, scripts, and assets.",
    "ui.default_prompt": "Use $test-helper to run a full bundled-resource skill validation."
  }
}
```

前端拿到 `suggestions` 后展示确认对话框，用户可修改每个值。确认后调用 `PUT /api/v1/skill-forge/store/{id}` 更新配置，然后再调用 `POST /api/v1/skill-forge/store/{id}/deploy`。

---

## 七、字段回退策略

当抽象包中某些可选字段未填写时，构建过程使用以下回退逻辑：

| 字段 | 回退规则 | 示例 |
|------|----------|------|
| `ui.display_name` | `name` 转 Title Case | `"my-skill"` → `"My Skill"` |
| `ui.short_description` | `description` 截取前 64 字符（不截断单词） | `"Full test skill for validating..."` |
| `ui.default_prompt` | `"Use ${{name}} to {{description 前 30 字符}}."` | `"Use $my-skill to validate output format."` |
| `ui.brand_color` | 不输出该字段 | — |
| `ui.icon_*` | 不输出该字段 | — |
| `policy.auto_invoke` | 默认 `true` | 两个平台均默认允许 |
| `metadata.license` | 不生成 `LICENSE` / `LICENSE.txt` | — |
| `metadata.version` | `"0.0.0"` | — |

---

## 八、完整示例

### 8.1 抽象包

**`skill.config.yaml`：**

```yaml
name: "test-helper"
description: >-
  Full test skill for validating that agents can discover, load,
  and follow a local skill with scripts, references, assets, and
  UI metadata.

ui:
  display_name: "Test Helper"
  short_description: "Full test skill for validating scripts, references, assets, and invocation."
  default_prompt: "Use $test-helper to run a full bundled-resource skill validation."

policy:
  auto_invoke: false

resources:
  scripts:
    - path: "scripts/self_check.py"
  references:
    - path: "references/test-cases.md"
  assets:
    - path: "assets/sample-output.txt"
```

**`VibeH.md`：**

```markdown
# Test Helper

## Overview
Use this skill to confirm that a local skill loads correctly...

## Workflow
1. State that `test-helper` was loaded.
2. Echo the user's requested test goal.
...
```

### 8.2 Cursor 构建产物

```
test-helper/
├── SKILL.md                    ← frontmatter(name + description + disable-model-invocation) + VibeH.md
├── scripts/
│   └── self_check.py           ← 原样复制
├── references/
│   └── test-cases.md           ← 原样复制
└── assets/
    └── sample-output.txt       ← 原样复制
```

生成的 `SKILL.md`：

```yaml
---
name: test-helper
description: >-
  Full test skill for validating that agents can discover, load,
  and follow a local skill with scripts, references, assets, and
  UI metadata.
disable-model-invocation: true
---

# Test Helper

## Overview
Use this skill to confirm that a local skill loads correctly...
...
```

### 8.3 Codex 构建产物

```
test-helper/
├── SKILL.md                    ← frontmatter(name + description 仅两字段) + VibeH.md
├── agents/
│   └── openai.yaml             ← 从 ui + policy 生成
├── scripts/
│   └── self_check.py           ← 原样复制
├── references/
│   └── test-cases.md           ← 原样复制
└── assets/
    └── sample-output.txt       ← 原样复制
```

生成的 `SKILL.md`：

```yaml
---
name: test-helper
description: >-
  Full test skill for validating that agents can discover, load,
  and follow a local skill with scripts, references, assets, and
  UI metadata.
---

# Test Helper

## Overview
Use this skill to confirm that a local skill loads correctly...
...
```

生成的 `agents/openai.yaml`：

```yaml
interface:
  display_name: "Test Helper"
  short_description: "Full test skill for validating scripts, references, assets, and invocation."
  default_prompt: "Use $test-helper to run a full bundled-resource skill validation."

policy:
  allow_implicit_invocation: false
```

### 8.4 反向导入示例：Codex → 抽象包

**输入**：`~/.codex/skills/test-helper/` 目录

**输出**：

```
~/.cowork/personal-skills/{uuid}/        # 加入个人仓库时
# 或
~/.cowork/teams/{team_id}/skills/{uuid}/ # 加入团队仓库时
├── skill.config.yaml           ← 合并 SKILL.md frontmatter + openai.yaml 生成
├── VibeH.md                    ← SKILL.md body 部分提取
├── scripts/
│   └── self_check.py           ← 原样复制
├── references/
│   └── test-cases.md           ← 原样复制
└── assets/
    └── sample-output.txt       ← 原样复制
```

---

## 九、设计决策记录

| # | 决策 | 理由 |
|---|------|------|
| 1 | 正文文件名固定为 `VibeH.md` | 平台品牌标识，无需支持自定义 |
| 2 | 抽象包是所有平台信息的超集 | 抽象包包含图标、LICENSE 等所有平台可能用到的文件；构建时按目标平台严格过滤 |
| 3 | 平台特有字段保留在抽象层 | 如 `metadata.surfaces`（Cursor 特有），构建到不支持的平台时丢弃 |
| 4 | 构建时校验依赖 skill 是否已安装 | 以警告形式提示，不阻断构建 |
| 5 | LICENSE 为可选项 | 抽象包中可包含 `LICENSE` 文件；仅 Codex 构建时输出为 `LICENSE.txt` |
| 6 | 反向导入是平台核心能力 | 从 Cursor/Codex 原生 skill 解析为抽象包，并标记导入后的信息缺失字段 |
| 7 | 导入时不补齐，部署时 LLM 补齐 | 导入阶段保持原始信息不变；部署前调用 LLM 生成建议值，用户手动确认后才写入 |
| 8 | LLM API 使用 GPTs API Gateway | Base URL: `api.gptsapi.net`，兼容 OpenAI / Claude / Gemini 接口 |
