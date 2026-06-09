# Skill 手动推送 + 抽象层改动点展示 改造方案

> **本文档已归档** — 所述功能均已落地，当前实现以 [`../skill-collaboration-sync.md`](../skill-collaboration-sync.md) 为准；本文仅作决策溯源。

> 状态：待确认（先评审本文档，确认无误后再改代码）
> 关联文档：`team-project-skill-sync-plan.md`（同目录）、`../architecture.md`
> 目标：
> 1. 项目动态里具体展示一次 Skill 改动的"改动点"，且改动点以**平台抽象层**（抽象包 `skill.config.yaml` + `SKILL.md`）维度表达，而不是 Cursor/Codex 原生文件维度。
> 2. 用户在本地修改部署实例后**不再自动同步**，必须在平台手动点击「推送」，平台才记录这次改动并写入动态。

---

## 一、需求与当前实现的差距

### 1.1 需求一：动态展示抽象层改动点

当前：
- `skill_change_log` 只有 `action`（changed/conflict/...）、`base_hash`、`new_hash` 和一段文本 `diff_summary`（例如 `"deployment files changed"`）。
- 前端 `notificationStore.formatNotification()` 只能渲染成「{用户} 修改了 {skill}」，看不到任何具体改动。

需要：
- 一次推送要计算出**结构化改动点列表**，例如：
  - `description`：旧值 → 新值
  - `policy.auto_invoke`：`true` → `false`
  - `SKILL.md` 正文：+12 行 / -3 行
  - 新增脚本 `scripts/foo.py`
- 改动点必须基于抽象包对比得出（把本地原生 Skill 反向解析为抽象包后再 diff），而不是直接 diff Cursor/Codex 原生文件。

### 1.2 需求二：手动推送

当前：
- `FileWatcherService._deployment_poll_loop` 每 3 秒轮询 `tracking_enabled=True` 的部署实例 → `handle_deployment_files_changed` 自动：
  - 计算 install_path 的 hash；
  - 与 `installed_hash` 不同则写 `skill_change_log`（changed/conflict）、改状态、广播；
  - 团队开启 `auto_skill_hot_update` 且无冲突时自动 `promote_deployment`。

需要：
- 本地改动**不自动写动态、不自动 promote**。
- 平台只在用户点击「推送」时：解析 → diff → 写动态 → 更新状态 →（可选）按团队设置触发自动热更新。
- 平台可以**只读**地探测"本地是否有未推送改动"，用于前端显示「有改动待推送」徽标，但探测本身不写库、不进动态。

---

## 二、抽象包解析与 Diff（需求一核心）

### 2.1 新增"只解析不落盘"函数

当前把原生目录转抽象包的唯一入口是 `NativeSkillStore.import_from_external()`，它会写盘到 store 并 upsert DB——不能用于 diff（会污染团队仓库）。

新增纯函数（建议放在 `native_skill_store.py` 或新文件 `skill_diff_service.py`）：

```
def parse_native_skill(path: str, origin: str | None = None) -> dict:
    """把一个原生 Skill 目录解析为内存抽象包，不写盘、不碰 DB。
    返回:
    {
      "config": {...},          # 与 skill.config.yaml 同构（ui/policy/metadata/dependencies）
      "vibeh_body": "...",      # 正文 Markdown（来自 SKILL.md body）
      "resources": {            # scripts/references/assets 的相对路径 -> 文件内容 hash
         "scripts":   {"scripts/foo.py": "<sha256>"},
         "references":{...},
         "assets":    {...}
      }
    }
    """
```

实现复用现有逻辑：`_parse_skill_md()` 解析 frontmatter+body；`agents/openai.yaml` 解析 ui/policy/dependencies；资源目录遍历计算每文件 hash。把 `import_from_external` 里"读"的部分抽出来共用。

### 2.2 抽象包对比，生成改动点

```
def diff_abstract_packages(base: dict, current: dict) -> list[ChangeItem]
```

对比维度与输出结构：

| kind | 说明 | 示例输出 |
|------|------|----------|
| `field` | 标量/简单字段变化 | `{kind:"field", path:"description", label:"描述", old:"A", new:"B"}` |
| `field` | 嵌套字段 | `{kind:"field", path:"policy.auto_invoke", label:"自动调用", old:true, new:false}` |
| `body` | `SKILL.md` 正文变化 | `{kind:"body", path:"SKILL.md", added_lines:12, removed_lines:3}` |
| `resource` | 资源文件增删改 | `{kind:"resource", path:"scripts/foo.py", change:"added"\|"removed"\|"modified"}` |

纳入对比的抽象层字段（白名单，避免噪音）：
- `name`、`description`
- `ui.display_name`、`ui.short_description`、`ui.brand_color`、`ui.default_prompt`、`ui.icon_small`、`ui.icon_large`
- `policy.auto_invoke`
- `metadata.version`、`metadata.tags`
- `dependencies.tools`
- `SKILL.md` 正文（行级 diff，统计 +/-；可选保存前 N 行 unified diff 文本供详情展开）
- 资源文件（按相对路径 + 文件 hash 判断 added/removed/modified）

每个改动点带中文 `label`，前端直接展示。

### 2.3 Diff 基线的选择（**待确认决策点 A**）

一次推送的"改动点"是相对谁算的？两种方案：

- **方案 A1（增量快照，推荐）**：基线 = 该部署实例上次推送时的抽象包快照。
  - 优点：每条动态精确表达"这次推送相对上次推送的增量"，符合"记录用户每次改动"。
  - 代价：需要在 `user_skill_deployments` 保存上次推送的抽象包快照（新增字段，见 4.2）。首次推送时基线 = 部署时团队仓库抽象包。

- **方案 A2（团队基线，更省存储）**：基线 = 团队仓库当前抽象包。
  - 优点：无需保存额外快照。
  - 缺点：连续两次推送（未 promote）时，第二次会把第一次的改动也重复算进去（因为团队仓库没变）。

> 默认按 **A1** 设计。若你倾向更简单的 A2，请在评审时说明。

---

## 三、手动推送流程（需求二核心）

### 3.1 取消自动同步

改造 `FileWatcherService._deployment_poll_loop`：

- **移除**自动调用 `handle_deployment_files_changed`（即不再自动写动态 / 自动 promote）。
- 轮询循环有两种处理方式（**待确认决策点 B**）：
  - **方案 B1（推荐）**：完全移除部署实例轮询任务。前端通过只读接口（见 3.3）按需检测"本地是否有未推送改动"。
  - **方案 B2**：保留轮询，但**降级为只读 dirty 探测**——只更新 `deployment.local_dirty` 布尔标志（轻量 UPDATE），不写 change log、不广播、不 promote。

> `.skill-store/` 抽象层自身的 `_watch_loop`（团队仓库目录监听）是否保留？当前它会对 store 目录变更自动写动态。本次改造只针对**用户部署实例**的同步；store 目录监听保持现状（建议评审时一并确认是否也要改为手动，见决策点 D）。

### 3.2 新增「推送」接口

`POST /api/v1/skill-deployments/{deployment_id}/push`

服务层新增 `push_deployment(deployment_id, user_id)`，逻辑：

1. 校验 deployment 存在、属于当前用户、`tracking_enabled`。
2. 计算 `install_path` 当前 content_hash：
   - 路径不存在 → 状态置 `missing`，写一条 `missing` 动态，返回。
   - hash == `installed_hash`（平台已记录基线）→ 无改动，返回 `{success:true, no_change:true}`。
3. `parse_native_skill(install_path)` → 当前抽象包。
4. 取基线抽象包（按决策点 A）：上次推送快照 / 团队仓库抽象包。
5. `diff_abstract_packages(base, current)` → 改动点列表。
6. 判断冲突：`deployment.repo_hash != team_skill.content_hash` → `conflict`，否则 `changed`。
7. 写 `skill_change_log`：
   - `action = "pushed"`（冲突时仍记 `changed`/`conflict`，见决策点 C）
   - `source = "user_deployment"`
   - `base_hash` / `new_hash`
   - `change_items`（结构化改动点 JSON，新增字段，见 4.1）
   - `diff_summary`（自动生成的中文一句话摘要，如「修改正文、更新 description、新增 1 个脚本」）
8. 更新 deployment：`installed_hash = 当前hash`、`status`、`abstract_snapshot = 当前抽象包`（A1）、`last_seen_at`、`local_dirty = false`。
9. 广播 WebSocket 事件到项目通道（带改动点）。
10. 若团队 `auto_skill_hot_update` 且无冲突 → 调用现有 `promote_deployment(auto=True)`。

### 3.3 新增"检查本地改动"只读接口

`GET /api/v1/skill-deployments/{deployment_id}/local-status`

- 计算 install_path 实时 hash，与 `installed_hash` 比较。
- 返回 `{exists, has_local_changes, installed_hash, current_hash, status}`。
- **不写库、不进动态**。供前端进入项目页或点击「检查更新」时显示「有改动待推送」。

### 3.4 与 promote 的关系

- `promote_deployment`（提升为团队仓库版本）保持不变，仍是独立操作。
- 现在的链路：本地改 → 点「推送」（记录改动、进动态）→ 需要时再点「提升」（写回团队仓库）。
- 团队开启自动热更新时，推送后无冲突会自动 promote（与现状语义一致，只是触发点从轮询改为手动推送）。

---

## 四、数据模型改动

### 4.1 `skill_change_log` 新增字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `change_items` | Text(JSON) | 结构化改动点列表（见 2.2）。默认 `"[]"` |

`action` 取值新增 `pushed`。`diff_summary` 改为存中文一句话摘要。

### 4.2 `user_skill_deployments` 新增字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `local_dirty` | Boolean | 本地是否有未推送改动（B2 方案才需要写；B1 可不加，前端实时查） |
| `abstract_snapshot` | Text(JSON) | 上次推送时的抽象包快照（A1 方案需要；A2 不需要） |

> 字段是否新增取决于决策点 A / B。两者都按"推荐方案"则两个字段都加。

### 4.3 迁移说明

SQLite 开发库可直接重建或加列。需要确认是否有现存数据要保留（**待确认决策点 E**）。

---

## 五、接口汇总

| 方法 | 路径 | 说明 | 变化 |
|------|------|------|------|
| POST | `/api/v1/skill-deployments/{id}/push` | 手动推送本地改动，记录抽象层改动点 | 新增 |
| GET | `/api/v1/skill-deployments/{id}/local-status` | 只读检测本地是否有未推送改动 | 新增 |
| GET | `/api/v1/projects/{id}/sync/changes` | 项目动态，返回带 `change_items` | 扩展返回字段 |
| POST | `/api/v1/skill-deployments/{id}/promote` | 提升到团队仓库 | 不变 |

`get_changes_since()` 返回每条记录追加 `change_items` 与 `diff_summary`。

---

## 六、前端改动

### 6.1 部署卡片（`ProjectSkills.vue`）

- 新增「推送」按钮：当 `deployment.tracking_enabled` 且本地有改动时高亮（依据 `local-status` 返回）。
- 显示「有改动待推送」徽标（来自 `local-status`）。
- 进入页面时对已部署实例调用 `local-status` 检测；保留「检查更新」手动刷新按钮。
- 「提升」按钮逻辑不变。

### 6.2 项目动态（改动点展示）

- `notificationStore.NotificationMessage` 增加 `change_items?` 与 `diff_summary?`。
- `formatNotification` 在主行展示「{用户} 推送了 {skill}」+ 摘要；
- 动态条目可展开显示改动点明细列表，按 kind 渲染：
  - `field`：`描述: 旧 → 新`
  - `body`：`正文: +12 / -3`
  - `resource`：`新增脚本 scripts/foo.py`
- `loadMessageHistory()` 与 WS 事件都带上 `change_items`。

### 6.3 API/Store

- `api/projects.ts` 增加 `pushDeployment`、`getDeploymentLocalStatus`。
- `projectSyncStore` 增加对应 action，推送成功后刷新项目与动态。

---

## 七、待确认决策点（请评审时逐条确认）

- **A. Diff 基线**：A1 增量快照（推荐，需存 `abstract_snapshot`）/ A2 团队仓库基线（省存储但连续推送会重复改动点）。
- **B. 轮询处理**：B1 完全移除部署实例轮询（推荐，前端按需只读检测）/ B2 保留为只读 dirty 探测（写 `local_dirty`）。
- **C. action 命名**：推送统一记为 `pushed`，冲突时另记 `conflict`？还是沿用现有 `changed`/`conflict` 并增加 `pushed`？
- **D. store 目录监听**：抽象层 `.skill-store/` 的 `_watch_loop` 是否也改为手动？本方案默认**保留现状**（仅改用户部署实例）。
- **E. 数据迁移**：现有 `user_skill_deployments` / `skill_change_log` 是否有需保留的数据，还是可重建开发库。
- **F. 正文 diff 粒度**：第一版只给 `+/-` 行数摘要，还是同时保存 unified diff 文本供详情展开？

---

## 八、改动文件清单（确认后执行）

后端：
- `app/services/native_skill_store.py`：抽取 `parse_native_skill()`。
- `app/services/skill_diff_service.py`（新增）：`diff_abstract_packages()` + 摘要生成。
- `app/services/project_service.py`：新增 `push_deployment()`、`get_deployment_local_status()`；`get_changes_since()` 返回 `change_items`；移除/降级自动同步。
- `app/services/file_watcher_service.py`：移除/降级 `_deployment_poll_loop`。
- `app/models/skill_change_log.py`：加 `change_items`。
- `app/models/project.py`：`UserSkillDeployment` 加 `abstract_snapshot` / `local_dirty`（按决策点）。
- `app/api/projects.py`：新增 push / local-status 路由。
- `app/schemas/project.py`：相关请求/响应模型。

前端：
- `api/projects.ts`、`stores/projectSyncStore.ts`、`stores/notificationStore.ts`、`views/ProjectSkills.vue`。
