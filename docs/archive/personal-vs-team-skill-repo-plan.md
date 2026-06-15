# 个人 Skill 仓库 vs 团队 Skill 仓库 —— 隔离与编辑器并入团队协作设计文档

> **本文档已归档** — 所述功能均已落地，当前实现以 [`../design/skill-collaboration-sync.md`](../design/skill-collaboration-sync.md) 为准；本文仅作决策溯源。

> 状态：**待评审（未开始写代码）**
> 目标读者：本人 review 确认后再实施

---

## 1. 背景与问题

当前「Skill 编辑器」（`/skill-forge`，`SkillForge.vue`）在使用上被**当成了团队 Skill 仓库**，原因是：

1. **列表不区分归属**：编辑器左侧列表来自 `GET /skill-forge/store/list`，该接口**无认证、无任何过滤**，直接返回 `skill_packages` 表的全部记录 —— 既包含个人 skill（`scope=personal`），也包含所有团队 skill（`scope=team`），所有登录用户看到的列表完全相同。
2. **个人仓库没有用户隔离**：`SkillPackage.owner_id` 字段在模型里早已预留，但**全代码库从未写入/查询**，因此所有 `personal` skill 实际是"全局共享"的，并非"某个用户私有"。
3. **入口割裂**：Skill 编辑器挂在首页（Dashboard）导航，与"团队协作"（`/teams`）是两个并列入口，用户难以理解"编辑器里的东西"到底属于个人还是团队。

> 现状结论：**个人仓库与团队仓库在数据层、API 层、UI 层都没有真正隔离**，全部混在一张表 + 一个全量列表里。

### 需求（本次目标）

1. 明确区分「个人 Skill 仓库」与「团队 Skill 仓库」，**不要混淆**。
2. 把「Skill 编辑器」**并入团队协作**页面的导航体系。
3. 在团队协作页面**新增「个人 Skill 仓库」**入口/视图。
4. 先评审本文档，再写代码。

---

## 2. 现状梳理（关键文件与行为）

### 2.1 数据模型 `SkillPackage`
文件：`backend/app/models/skill_package.py`

| 字段 | 现状 |
| --- | --- |
| `scope` | `personal` / `team` 两种，默认 `personal` |
| `team_id` | `scope=team` 时由项目流程写入 |
| `owner_id` | **预留未用**（无任何赋值/查询） |
| `source_skill_id` | **预留未用**（本应用于溯源 personal→team 复制） |
| `content_hash` | 目录内容 SHA256，用于冲突检测 |
| `store_path` | 物理路径，personal/team **共用同一 `SKILL_STORE_DIR`** |

### 2.2 后端 API
| 路由 | 文件 | 认证 | 过滤 |
| --- | --- | --- | --- |
| `GET /skill-forge/store/list` | `api/skill_store.py` | **无** | **无**（全量） |
| `GET/POST/PUT/DELETE /skill-forge/store/*` | `api/skill_store.py` | **无** | 仅 `scope=team` 时禁止改/删 |
| `/projects/*`、`/teams/{id}/projects`、`/skill-deployments/*` | `api/projects.py` | **有** `get_current_user_id` | 有团队成员校验 |

- list 实现：`NativeSkillStore.list_all()`（`services/native_skill_store.py`），`select(SkillPackage).order_by(updated_at)`，无 where。
- create/import：默认 `scope=personal`，**不记录 owner**。
- update/delete：若 `scope=team` 抛 `PermissionError`，否则放行（不校验是谁的）。

### 2.3 团队 skill 的产生方式
- `add_skill_to_project()`：把一个 personal skill **原地改成** `scope=team` + `team_id`（**个人仓库从此看不到它了**），并建 `project_skills` 关联。
- `push_deployment()` / `promote_deployment()`：把本地部署改动写回 store，并设 `scope=team`。
- team skill = `skill_packages` 中 `scope=team` 的记录 + `project_skills` 关联，**没有独立表**。

### 2.4 前端
- `Dashboard.vue` 导航：`协作会话 / 适配器管理 / Skill 编辑器 / 团队协作`。
- `SkillForge.vue`：左侧 `v-for="s in store.skills"` 全量列表；`scope==='team'` 仅标记"团队仓库只读"。
- `Teams.vue`：左侧团队列表 + 右侧"项目列表 / 团队成员"。
- `apiClient`（`api/client.ts`）：**已自动注入 `Authorization: Bearer <token>`** → 给 store API 加认证无需改前端请求层。

---

## 3. 核心概念定义（统一口径）

| 概念 | 定义 | 数据条件 | 可写性 |
| --- | --- | --- | --- |
| **个人 Skill 仓库** | 当前登录用户私有的 skill 草稿区 | `scope='personal' AND owner_id = 当前用户` | 本人可自由 CRUD / 编辑 / 部署到本机 |
| **团队 Skill 仓库** | 某团队共享的 skill（经评审/推送进入团队） | `scope='team' AND team_id ∈ 用户所属团队` | 编辑器内只读；只能通过项目内 push/promote 同步 |

关键原则：
- **个人仓库 = per-user**，互不可见。
- **团队仓库 = per-team**，团队成员可见。
- 两者**列表分开、入口分开、归属字段分开**。

---

## 4. 设计目标 / 非目标

**目标**
- G1 数据层：启用 `owner_id`，个人仓库按用户隔离。
- G2 API 层：`/skill-forge/store/*` 加认证 + 按 `scope`/`owner` 过滤与鉴权。
- G3 前端：把"个人 Skill 仓库"并入团队协作页导航；编辑器只服务个人仓库；团队仓库在团队协作内独立呈现。
- G4 个人 → 团队 的转换关系清晰、可溯源、不再"偷走"个人 skill。

**非目标（本次不做）**
- 不改物理目录结构（personal/team 仍共用 `SKILL_STORE_DIR`，仅靠 DB + API 隔离；目录级隔离留作后续）。
- 不引入复杂权限角色体系（沿用现有 team owner/admin/member）。

---

## 5. 数据模型方案

### 5.1 启用 `owner_id`
- 个人 skill 在 **create / import** 时写入 `owner_id = 当前用户 id`。
- 个人仓库查询条件：`scope='personal' AND owner_id = 当前用户`。

### 5.2 存量数据迁移（⚠️ 决策点 D1）
现有 `scope=personal AND owner_id IS NULL` 的历史 skill 需要一个归属策略：

- **方案 D1-a（推荐）**：启动迁移，把所有无主 personal skill 归给"系统首个用户 / admin"。简单、可控；其他用户看不到这些遗留 skill（符合隔离语义）。
- 方案 D1-b：把无主 personal skill 标为"公共模板"，所有用户在个人仓库**只读可见**、可"复制为我的"。更友好但要加模板概念。
- 方案 D1-c：保持无主，登录后由用户手动"认领"。交互最重。

> 建议采用 **D1-a**（必要时叠加 D1-b 的"复制为我的"作为后续增强）。

### 5.3 个人 → 团队 的转换语义（⚠️ 决策点 D2，关键）
现状 `add_skill_to_project` 是**原地改 scope**：个人 skill 一旦加入项目就变 team，个人仓库再也看不到 → 与"隔离"目标冲突。

- **方案 D2-a（推荐，复制 + 溯源）**：把个人 skill 加入团队时，**复制**出一份新的 `scope=team` 记录（新 id 或带 team 命名空间），`source_skill_id` 指向个人原 skill；个人仓库**保留**原 skill。两边独立演进，关系可追溯。
- 方案 D2-b（维持现状，原地转换）：实现简单，但个人仓库会"丢失"该 skill，隔离不彻底。

> 建议采用 **D2-a**。需要落实 `source_skill_id` 的写入与（可选）store 目录命名约定（如 `team_{team_id}__{skill_id}`）以避免 id 冲突。

---

## 6. 后端 API 方案

### 6.1 给 `/skill-forge/store/*` 加认证
- 所有路由加 `user_id = Depends(get_current_user_id)`（来自 `app.api.auth`）。
- 前端无需改动（token 已自动注入）。

### 6.2 list 接口拆分/过滤
`GET /skill-forge/store/list?scope=personal|team[&team_id=...]`

- `scope=personal`（默认）：`WHERE scope='personal' AND owner_id = user_id`。
- `scope=team`：`WHERE scope='team' AND team_id ∈ 用户所属团队`（团队仓库总览，可选；项目维度仍走 `/projects/{id}/skills`）。
- `list_all()` 增加过滤参数；新增 service 方法 `list_personal(owner_id)` / `list_team(team_ids)`。

### 6.3 写操作鉴权
- `create` / `import`：写 `owner_id=user_id`，`scope=personal`。
- `update` / `delete` / `deploy`：
  - team skill → 维持 `PermissionError`（已有）。
  - personal skill → 增加 `owner_id == user_id` 校验，非本人 403。
- `get`：personal 校验 owner；team 校验团队成员。

### 6.4 个人 → 团队（配合 D2-a）
- 调整 `add_skill_to_project()`：由"原地改 scope" → "复制生成 team skill + 建 project_skills + 写 source_skill_id"。
- `push/promote/pull` 链路基本不变（仍作用于 team skill）。

### 6.5 Schema 调整
- `NativeSkillItem` 增加 `owner_id`（可选返回）。
- list 请求支持 `scope` query 参数。

---

## 7. 前端方案

### 7.1 导航整合（⚠️ 决策点 D3）
把"Skill 编辑器"从首页独立入口收编进团队协作体系：

- **方案 D3-a（推荐，路由级共享顶栏）**：`Teams.vue` 与 `SkillForge.vue` 顶部使用同一套切换导航：`团队协作 | 个人 Skill 仓库`。两页通过路由互跳，改动小、风险低。首页 Dashboard 的"Skill 编辑器"入口改名为"个人 Skill 仓库"或直接移除（统一从"团队协作"进入）。
- 方案 D3-b（组件级内嵌 Tab）：把 SkillForge 拆成组件，作为 Teams 页的一个 Tab 内嵌。体验最统一，但 `SkillForge.vue`（~1200 行）拆分成本高、风险大。

> 建议先做 **D3-a**（快速达成"并入"与"区分"），后续如需再演进到 D3-b。

### 7.2 SkillForge 改造为「个人 Skill 仓库」
- 列表只拉 `scope=personal`（`listNativeSkills({scope:'personal'})`）→ 只显示当前用户的个人 skill。
- 标题改为「个人 Skill 仓库」，移除 team skill 混入（team 只读项不再出现在这里）。
- 顶部加"团队协作"返回/切换入口。

### 7.3 团队协作页 `Teams.vue`
- 顶栏加导航分段：`团队协作 | 个人 Skill 仓库`。
- 团队仓库呈现：维持现有"项目 → 项目内 skill"（`ProjectSkills.vue`），可选新增"团队 Skill 仓库总览"区块（`scope=team` 汇总，区别于项目维度）。
- 复用已完成的只读详情页 `SkillDetail.vue` 查看任意 skill 详情。

### 7.4 受影响前端文件
- `api/skillStore.ts`：`listNativeSkills` 增加 `scope` 参数。
- `stores/skillStore.ts`：`fetchList(scope)`。
- `views/SkillForge.vue`：默认拉个人仓库 + 改名 + 顶栏导航。
- `views/Teams.vue`：顶栏导航分段 +（可选）团队仓库总览。
- `views/Dashboard.vue`：导航入口语义调整。
- `router/index.ts`：如需新增 `/my-skills` 别名（可选，或继续用 `/skill-forge`）。

---

## 8. 关键决策点汇总（请确认）

| 编号 | 决策 | 选项 | 推荐 |
| --- | --- | --- | --- |
| **D1** | 存量无主 personal skill 归属 | a) 归 admin / b) 公共模板可复制 / c) 手动认领 | **a** |
| **D2** | 个人→团队 转换语义 | a) 复制+溯源（保留个人副本）/ b) 原地改 scope（现状） | **a** |
| **D3** | 前端整合方式 | a) 路由级共享顶栏（轻）/ b) 组件级内嵌 Tab（重） | **a** |
| **D4** | 团队仓库在团队页是否做"team skill 总览" | a) 仅项目维度（现状）/ b) 额外加总览区 | a（先不加，可后补） |
| **D5** | 首页"Skill 编辑器"入口 | a) 改名"个人 Skill 仓库"保留 / b) 移除，统一从团队协作进入 | a |

---

## 9. 分阶段实施步骤（评审通过后执行）

**阶段一：后端隔离地基**
1. `add columns` 迁移确认 `owner_id` 可用（已在 schema，确保 migration 生效）。
2. `/skill-forge/store/*` 全部加认证 `Depends(get_current_user_id)`。
3. `create/import` 写 `owner_id`；`update/delete/deploy/get` 加 owner 校验。
4. `list` 支持 `scope=personal`（owner 过滤）/ `scope=team`（团队过滤）。
5. （D1-a）启动迁移：无主 personal skill 归 admin。

**阶段二：个人→团队 转换语义（D2-a）**
6. 改造 `add_skill_to_project` 为"复制 + source_skill_id"，确定 team skill 命名约定。

**阶段三：前端整合**
7. `skillStore` / `listNativeSkills` 支持 `scope`。
8. `SkillForge.vue` 改个人仓库（过滤 + 改名 + 顶栏导航）。
9. `Teams.vue` 顶栏导航分段；Dashboard 入口语义调整。
10. 复用 `SkillDetail.vue`。

**阶段四：验证**
11. `vue-tsc` 类型检查 + lint；多用户隔离手测（A 用户看不到 B 的个人 skill）。

---

## 10. 兼容性、风险与回滚

- **风险 R1**：store API 加认证后，任何未带 token 的调用会 401。需确认所有前端调用都经 `apiClient`（已确认会注入 token）；文件 watcher / 启动同步等**后端内部调用**不经 HTTP，不受影响。
- **风险 R2**：D2-a 改"复制"后，已存在的、由旧逻辑原地转成 team 的 skill 不受影响（仍是 team），只影响后续新加入项目的行为。
- **风险 R3**：D1 迁移把存量 personal 归 admin 后，其他用户将看不到这些 skill。若有共享诉求，再叠加 D1-b 模板能力。
- **回滚**：后端过滤可通过特性开关（如配置 `SKILL_STORE_REQUIRE_AUTH`）快速关闭回到全量列表；前端导航改动可还原。

---

## 11. 待确认

请确认 **D1 / D2 / D3 / D4 / D5** 的选择（默认采用各自推荐项）。确认后我将按第 9 节分阶段实施。
