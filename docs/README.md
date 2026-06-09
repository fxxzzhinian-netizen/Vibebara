# Vibebara — 文档索引

> Vibebara 是一个 AI 协作中台，以 `skill-forge` 为统一 Skill 工具链，让使用不同 Vibe Coding 工具（Cursor、Codex 等）的团队成员共享、部署、同步 Skill。

## 目录结构

```
docs/
├── 调研（Why & What）
│   ├── research-ai-coding-skills.md      8 大平台 Skill/指令体系全景调研
│   └── research-codex-vs-claude.md       Codex CLI vs Claude Code 深度对比
│
├── 架构与设计（How）
│   ├── architecture.md                   Vibebara 整体架构
│   └── skill-forge-design.md             抽象 Skill 包格式 & 多平台构建规则
│
├── 实现纪要（What's built）
│   └── skill-collaboration-sync.md       ★ Skill 协作与同步的当前实现（单一事实来源）
│
└── archive/                              已归档的过程计划（仅作决策溯源）
    ├── team-project-skill-sync-plan.md
    ├── skill-push-and-abstract-diff-plan.md
    ├── skill-push-user-isolation-plan.md
    └── personal-vs-team-skill-repo-plan.md
```

## 文档清单

| 文档 | 类别 | 状态 | 摘要 |
|------|------|------|------|
| [research-ai-coding-skills.md](research-ai-coding-skills.md) | 调研 | 参考 | Cursor、Codex、Claude Code、Copilot、Windsurf、Cline、Aider、Continue.dev 的 Skill/指令系统对比 |
| [research-codex-vs-claude.md](research-codex-vs-claude.md) | 调研 | 参考 | OpenAI Codex CLI 与 Anthropic Claude Code 指令系统、Agent Skills 开放标准的深度分析 |
| [architecture.md](architecture.md) | 架构 | 现行 | 前端 Vue 3 + 后端 FastAPI + skill-forge 工具链 + WebSocket 的整体架构 |
| [skill-forge-design.md](skill-forge-design.md) | 设计 | 现行 | 抽象 Skill 包（`skill.config.yaml` + `SKILL.md`）、多平台构建规则、反向导入 |
| [skill-collaboration-sync.md](skill-collaboration-sync.md) | 实现纪要 | **已实现** | 个人/团队仓库隔离、放入团队、部署、手动推送（抽象层 diff）、拉取更新的完整链路 |

> `archive/` 内的 4 篇是迭代过程中的设计/实施计划，相关功能**均已落地**，内容已被 `skill-collaboration-sync.md` 汇总收编。它们仅保留作决策溯源，不再单独维护；如与实现纪要或代码冲突，以后者为准。

## 阅读顺序

1. **了解背景** → `research-ai-coding-skills.md`、`research-codex-vs-claude.md`（各平台 Skill 体系）
2. **理解设计** → `skill-forge-design.md`（抽象包与多平台构建）
3. **把握全局** → `architecture.md`（Skill Forge 在中台中的位置）
4. **掌握当前实现** → `skill-collaboration-sync.md`（协作与同步链路、数据模型、API、前端入口）
5. **追溯决策**（可选）→ `archive/`（各特性当初的方案与取舍）
