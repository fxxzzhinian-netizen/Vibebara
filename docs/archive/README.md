# 归档文档（仅作决策溯源）

> 本目录保存**历史过程文档**：早期设计计划与已完成的迁移记录。所述功能/改造**均已落地**，当前实现以 [`../design/`](../design/) 下的现行文档与代码为准。归档内容不再单独维护；如与现行文档或代码冲突，**以后者为准**。

## 一、早期设计计划（已被 `design/skill-collaboration-sync.md` 收编）

| 文档 | 贡献的内容 |
|------|------------|
| [team-project-skill-sync-plan.md](team-project-skill-sync-plan.md) | 四层资产模型、数据模型、部署/监听/冲突的总体设计 |
| [skill-push-and-abstract-diff-plan.md](skill-push-and-abstract-diff-plan.md) | 手动推送 + 抽象层改动点 diff |
| [skill-push-user-isolation-plan.md](skill-push-user-isolation-plan.md) | 推送即同步、outdated、拉取更新、用户隔离边界 |
| [personal-vs-team-skill-repo-plan.md](personal-vs-team-skill-repo-plan.md) | 个人/团队仓库隔离、`owner_id`、编辑器并入团队协作 |

## 二、方案 B 桌面客户端迁移（`desktop-migration/`，已完成）

「本机 localhost 单体 → 桌面客户端（桌面壳 + 本地代理 + 云端后端）」迁移的全过程记录。迁移产物即当前的 `desktop/` + `local-agent/` + cloud 模式后端。

| 文档 | 内容 |
|------|------|
| [desktop-migration/方案B-桌面客户端迁移技术路径.md](desktop-migration/方案B-桌面客户端迁移技术路径.md) | 技术路径总览：形态选型、改造埋点、接口边界、分阶段计划 |
| [desktop-migration/M0-解耦设计与接口契约.md](desktop-migration/M0-解耦设计与接口契约.md) | 解耦设计与接口契约（冻结版） |
| [desktop-migration/M1-云端化实施记录.md](desktop-migration/M1-云端化实施记录.md) | 云端化：后端脱离本地文件依赖 |
| [desktop-migration/M2-鉴权强化实施记录.md](desktop-migration/M2-鉴权强化实施记录.md) | 鉴权强化实施 |
| [desktop-migration/M2-评审决议与上线清单.md](desktop-migration/M2-评审决议与上线清单.md) | 评审决议（ADR）与上线清单 |
| [desktop-migration/M3-本地代理实施记录.md](desktop-migration/M3-本地代理实施记录.md) | 本地代理 Local Agent 实施 |
| [desktop-migration/M4-云端编排端点实施记录.md](desktop-migration/M4-云端编排端点实施记录.md) | 云端编排端点（后端侧） |
| [desktop-migration/M4-前端分流实施记录.md](desktop-migration/M4-前端分流实施记录.md) | 前端分流（灰度走编排/旧端点） |
| [desktop-migration/M4-收尾与联调记录.md](desktop-migration/M4-收尾与联调记录.md) | M4 收尾与联调 |
| [desktop-migration/M5-实施计划.md](desktop-migration/M5-实施计划.md) | M5 桌面封装实施计划 |
| [desktop-migration/M5-a-桌面壳骨架实施记录.md](desktop-migration/M5-a-桌面壳骨架实施记录.md) | M5-a 桌面壳骨架 |
| [desktop-migration/M5-平台安装状态-多用户多机设计.md](desktop-migration/M5-平台安装状态-多用户多机设计.md) | M5-b 平台安装态多用户多机持久化设计 |
| [desktop-migration/M5-功能修复记录.md](desktop-migration/M5-功能修复记录.md) | M5 三项功能修复 |
| [desktop-migration/上线前-Checklist.md](desktop-migration/上线前-Checklist.md) | 上线前 Checklist |
| [desktop-migration/contracts/local-agent-api.md](desktop-migration/contracts/local-agent-api.md) | 本地代理 API 契约（机器可读 · 冻结版） |
