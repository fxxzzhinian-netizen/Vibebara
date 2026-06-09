# 团队/项目 Skill 仓库与同步重构计划

> **本文档已归档** — 所述功能均已落地，当前实现以 [`../skill-collaboration-sync.md`](../skill-collaboration-sync.md) 为准；本文仅作决策溯源。

> 状态：已确认，进入实现  
> 目标：厘清个人仓库、团队仓库、项目 Skill 列表、用户部署实例之间的边界，避免当前全局 Skill 与项目动态混在一起。

---

## 一、问题背景

当前实现里，平台把 `~/.cowork/skills/{skill_id}` 当作全局 Skill Store。团队/项目只通过 `ProjectSkill(project_id, skill_id)` 关联这个全局 Skill。

这导致几个问题：

- 团队成员的本地项目路径不同，项目级记录不能绑定单一 `local_path`。
- 团队成员使用的 Vibe Coding 工具不同，项目级记录不能绑定单一 `tool_type`。
- 一个 Skill 同时关联多个项目时，所有项目实际共享同一份仓库文件，无法区分用户部署实例。
- 项目动态来自中心仓库或后端补偿扫描，而不是来自真实项目目录。
- 从某个项目导入仓库的 Skill 缺少明确语义：导入后到底是持续监听原项目，还是只保存快照。

新的设计需要明确：导入仓库是快照；项目只列出可用 Skill；用户点击"部署"时才选择工具和本地路径；后续只监听该用户部署后的实例目录。

---

## 二、目标模型

### 2.1 三层 Skill 资产

| 层级 | 说明 | 是否作为同步源 |
|------|------|----------------|
| 个人 Skill 仓库 | 用户从本机项目、Cursor/Codex 全局目录或其他来源加入的 Skill 快照 | 否，只是个人可复用素材 |
| 团队 Skill 仓库 | 团队共享的 Skill 基线，可从个人仓库提取，也可从团队项目上传 | 是，作为团队分发基线 |
| 项目 Skill 列表 | 项目声明可使用哪些团队 Skill，不包含本地路径或工具类型 | 否 |
| 用户部署实例 | 某个用户把项目 Skill 部署到自己本地项目目录后的真实运行副本 | 是，监听它的变化并回写团队仓库动态 |

### 2.2 项目不绑定路径和工具

项目创建/编辑不要求填写本地路径，也不要求选择 Cursor/Codex。原因是同一个团队项目在不同成员机器上的 checkout 路径不同，使用的 Vibe Coding 工具也可能不同。

项目只维护团队协作语义：

- 团队 ID
- 项目名称/描述
- 项目 Skill 列表

用户点击"部署"时才提供个人部署参数：

- `tool_type`：`cursor` 或 `codex`
- `deploy_path`：该用户本地项目根目录或显式部署根目录
- `overwrite`：是否覆盖本地已存在同名 Skill

部署路径由用户选择的工具和路径推导：

| 工具 | 用户本地部署目录 |
|------|------------------|
| Cursor | `{deploy_path}/.cursor/skills/{skill_name}/` |
| Codex | `{deploy_path}/.codex/skills/{skill_name}/` |

### 2.3 导入是快照，不监听原始来源

当用户从某个项目点击"加入到仓库"：

1. 解析原项目中的原生 Skill。
2. 复制为个人仓库或团队仓库中的抽象 Skill 包。
3. 记录来源路径和来源平台作为元数据。
4. 不再监听原始来源目录。

后续原项目继续改那个 Skill，不会自动影响仓库副本。

---

## 三、核心流程

### 3.1 从项目已有 Skill 加入团队仓库

```
选择团队项目
  → 当前用户选择本地项目路径和工具类型
  → 扫描项目级 Skill 目录
  → 用户选择 Skill
  → 导入为团队仓库快照
  → 团队仓库出现该 Skill
```

适用场景：项目自己已经有 Skill，不需要先从平台仓库添加。

### 3.2 从个人仓库提取到团队仓库

```
个人 Skill 仓库
  → 用户选择目标团队
  → 复制为团队仓库 Skill
  → 记录来源为 personal_repo
```

个人仓库仍然保留原副本，团队仓库获得独立副本。

### 3.3 团队 Skill 添加到项目

```
选择团队仓库 Skill
  → 选择项目
  → 加入项目 Skill 列表
  → 项目页展示该 Skill，但未部署、未监听
```

这一步只是建立项目可用 Skill，不创建用户部署实例。

### 3.4 用户部署项目 Skill

```
项目 Skill 列表
  → 用户点击【部署】
  → 选择 Vibe Coding 工具（Cursor/Codex）
  → 选择本地项目路径或部署路径
  → 构建目标平台产物
  → 写入用户本地项目级 Skill 目录
  → 幂等维护项目 .gitignore
  → 创建用户部署实例记录
  → 启动或更新该部署实例监听
```

部署时必须向目标项目 `.gitignore` 追加：

```gitignore
# Vibebara local skill deployments
.cursor/skills/
.codex/skills/
```

追加规则：

- `.gitignore` 不存在则创建。
- 已存在相同规则则不重复追加。
- 只忽略 skills 目录，不忽略整个 `.cursor/` 或 `.codex/`。
- 如果这些目录已经被 Git 跟踪，应提示用户从 Git 索引移除，`.gitignore` 不能自动解决已跟踪文件。

### 3.5 用户部署实例变更回写团队仓库

```
监听到 {deploy_path}/.{tool}/skills/{skill_name} 变化
  → 解析为抽象包
  → 计算 hash/diff
  → 根据团队自动热更新设置写入团队仓库或生成待确认变更
  → 记录项目动态
  → WebSocket 推送团队/项目消息
```

是否自动覆盖团队仓库由团队设置控制。`auto_skill_hot_update` 默认关闭：关闭时只生成待确认变更；开启时在无冲突的情况下自动提升为团队仓库新版本。

---

## 四、建议数据模型

### 4.1 `projects`

项目不增加 `local_path` 和 `tool_type`。这两个值属于用户部署实例，不属于团队项目。

项目仍只保存：

| 字段 | 类型 | 说明 |
|------|------|------|
| `team_id` | string | 所属团队 |
| `name` | string | 项目名称 |
| `description` | string | 项目描述 |
| `created_by` | string | 创建人 |

### 4.2 `skill_packages`

建议拆分或扩展为仓库级 Skill：

| 字段 | 说明 |
|------|------|
| `scope` | `personal` / `team` |
| `owner_id` | 个人仓库所属用户 |
| `team_id` | 团队仓库所属团队 |
| `source_type` | `project_upload` / `personal_repo` / `external_cursor` / `external_codex` / `manual` |
| `source_path` | 仅溯源，不监听 |
| `version` | 团队仓库版本 |
| `content_hash` | 仓库抽象包 hash |

如果希望更清晰，可拆成 `personal_skill_packages` 和 `team_skill_packages`。第一版可以先用 `scope` 降低迁移成本。

### 4.3 `project_skill_refs`

新增表，记录项目可用的团队 Skill。

| 字段 | 说明 |
|------|------|
| `id` | 关联 ID |
| `project_id` | 项目 ID |
| `team_skill_id` | 团队仓库 Skill ID |
| `added_by` | 添加人 |
| `created_at` | 添加时间 |

这张表只表达"这个项目可以使用这个团队 Skill"，不表示已部署，也不表示已监听。

### 4.4 `user_skill_deployments`

新增表，替代"项目直接绑定部署实例"的设计。部署实例归属于用户，因为每个成员的本地路径和工具不同。

| 字段 | 说明 |
|------|------|
| `id` | 部署实例 ID |
| `user_id` | 部署用户 |
| `project_id` | 项目 ID |
| `team_skill_id` | 团队仓库 Skill ID |
| `skill_name` | 部署到项目中的目录名 |
| `tool_type` | 用户选择的 Vibe Coding 工具 |
| `deploy_path` | 用户选择的本地项目根路径 |
| `install_path` | 实际 Skill 绝对路径 |
| `repo_version` | 部署时的团队仓库版本 |
| `repo_hash` | 部署时的团队仓库 hash |
| `installed_hash` | 当前用户部署实例 hash |
| `status` | `synced` / `changed` / `conflict` / `missing` |
| `tracking_enabled` | 是否启用监听，部署成功后为 true |
| `last_seen_at` | 最近一次检测时间 |

### 4.5 `skill_change_log`

扩展字段：

| 字段 | 说明 |
|------|------|
| `team_id` | 团队 ID |
| `project_id` | 触发变更的项目，可空 |
| `deployment_id` | 触发变更的用户部署实例，可空 |
| `user_id` | 触发变更或执行部署的用户 |
| `skill_id` | 团队仓库 Skill |
| `source` | `team_repo` / `user_deployment` |
| `action` | `created` / `updated` / `deployed` / `pulled` / `conflict` |
| `base_hash` | 修改前 hash |
| `new_hash` | 修改后 hash |
| `diff_summary` | 摘要 |

---

## 五、接口调整

### 5.1 项目接口

- `POST /api/v1/teams/{team_id}/projects`
  - 只创建团队项目，不接收 `local_path`、`tool_type`

- `PUT /api/v1/projects/{project_id}`
  - 只更新项目名称、描述等团队共享信息

- `GET /api/v1/projects/{project_id}/scan-skills`
  - 需要 query 参数 `tool_type`、`deploy_path`
  - 扫描当前用户指定的本地 Skill 目录，返回项目已有 Skill 列表

### 5.2 仓库接口

- `POST /api/v1/teams/{team_id}/skills/import-from-project`
  - 请求体包含 `tool_type`、`deploy_path`、`skill_path`
  - 从当前用户指定路径中的已有 Skill 导入团队仓库

- `POST /api/v1/teams/{team_id}/skills/import-from-personal`
  - 从个人仓库复制到团队仓库

- `GET /api/v1/teams/{team_id}/skills`
  - 列出团队仓库 Skill

### 5.3 项目 Skill 列表接口

- `POST /api/v1/projects/{project_id}/skills/{team_skill_id}`
  - 将团队 Skill 加入项目 Skill 列表，不部署

- `DELETE /api/v1/projects/{project_id}/skills/{team_skill_id}`
  - 从项目 Skill 列表移除，不主动删除任何用户本地部署实例

- `GET /api/v1/projects/{project_id}/skills`
  - 查看项目可用 Skill 列表，以及当前用户是否已部署

### 5.4 用户部署接口

- `POST /api/v1/projects/{project_id}/skills/{team_skill_id}/deploy`
  - 请求体包含 `tool_type`、`deploy_path`、`overwrite`
  - 构建并部署到当前用户指定路径，维护 `.gitignore`，创建或更新部署实例

- `DELETE /api/v1/skill-deployments/{deployment_id}`
  - 停止跟踪部署实例，可选择是否删除本地 Skill 文件

- `PATCH /api/v1/teams/{team_id}/settings`
  - 更新 `auto_skill_hot_update`，默认关闭

### 5.5 变更处理接口

- `GET /api/v1/teams/{team_id}/skill-changes`
  - 团队仓库动态

- `POST /api/v1/skill-deployments/{deployment_id}/promote`
  - 将用户部署实例变更提升为团队仓库新版本

- 回滚/另存为新 Skill 属于后续冲突处理增强，本轮不作为必需接口。

---

## 六、冲突策略

### 6.1 默认策略：待确认更新，可由团队开启自动热更新

团队 `auto_skill_hot_update` 默认关闭。用户部署实例发生变化时，不直接覆盖团队仓库，而是：

1. 标记部署实例为 `changed`。
2. 写入团队动态。
3. 显示"来自项目 X 的 Skill 变更"。
4. 由团队成员点击"提升到团队仓库"或"丢弃/回滚"。

团队管理员可以开启自动热更新。开启后，只有当部署实例的 `repo_hash` 等于团队仓库当前 `content_hash` 时，才允许自动提升；否则仍进入 `conflict`。

### 6.2 冲突判断

如果用户部署实例的 `repo_hash` 不等于团队仓库当前 `content_hash`，说明它基于旧版本修改：

```text
deployment.repo_hash != team_skill.content_hash
```

此时状态应为 `conflict`，不能自动提升。

处理选项：

- 查看差异
- 手动合并后提升
- 用团队仓库覆盖当前用户部署实例
- 将用户部署实例另存为新的团队 Skill

### 6.3 多项目变更

同一个团队 Skill 被加入多个项目或被多个用户部署时：

- 每个用户部署实例独立维护 hash 和状态。
- 某用户本地修改只先影响自己的部署实例状态。
- 团队仓库是否更新，由显式提升操作决定。
- 团队仓库更新后，其他项目或其他用户部署实例显示"可更新"，由用户选择拉取。

---

## 七、文件监听策略

监听对象不是个人仓库，也不是导入来源路径，而是用户部署实例路径。只有部署成功并启用跟踪后才监听。

### 7.1 监听注册

后端启动时：

1. 读取所有 `user_skill_deployments` 中 `tracking_enabled = true` 的记录。
2. 对有效 `install_path` 注册 watchfiles 监听。
3. 对路径不存在的实例标记为 `missing`。

### 7.2 监听范围

监听整个用户部署实例目录：

- `SKILL.md`
- `agents/openai.yaml`
- `scripts/`
- `references/`
- `assets/`
- `LICENSE` / `LICENSE.txt`

忽略：

- `.git`
- `node_modules`
- `dist`
- 临时文件
- 编辑器 swap 文件

### 7.3 解析方向

监听到项目原生格式变化后，需要反向导入为抽象包，再与团队仓库抽象包比较。

---

## 八、前端调整

### 8.1 项目创建/编辑

项目表单不包含本地路径和工具选择，只维护团队共享信息：

- 项目名称
- 项目描述
- 所属团队

### 8.2 项目 Skill 页面

页面分为两类：

- 项目 Skill 列表：展示该项目可用的团队 Skill。
- 团队仓库 Skill：可添加到当前项目 Skill 列表。
- 当前用户部署状态：展示当前用户是否已部署、部署到哪个工具和路径。

用户点击"部署"时弹窗选择：

- Vibe Coding 工具：Cursor / Codex
- 本地项目路径或部署路径
- 是否覆盖已有同名 Skill

部署后显示：

- 部署路径
- 当前状态：已同步 / 项目有改动 / 冲突 / 路径缺失
- 仓库版本和用户部署实例 hash

### 8.3 团队仓库页面

显示：

- 团队 Skill 列表
- 来源：个人仓库 / 项目上传 / 外部导入
- 关联项目数量
- 最新动态
- 待确认项目变更

当前阶段团队仓库 Skill 不提供直接在线编辑入口。团队仓库版本只能通过用户部署实例的手动提升，或团队开启自动热更新后由部署实例自动提升产生。个人仓库复制到团队仓库后，两者不保留版本关联。

---

## 九、迁移步骤

### Phase 1：数据模型与文档对齐

- 明确项目不保存 `local_path`、`tool_type`。
- 新增 `project_skill_refs`。
- 新增 `user_skill_deployments`。
- 为 `skill_packages` 增加 `scope`、`team_id`、`source_type`、`source_path`、`content_hash`。
- 保留旧 `ProjectSkill`，但不再作为新逻辑核心。

### Phase 2：项目 Skill 列表与用户路径扫描

- 项目创建/编辑保持团队共享信息。
- 项目页支持添加团队 Skill 到项目 Skill 列表。
- 增加基于用户输入 `tool_type + deploy_path` 的本地 Skill 扫描接口。
- 支持从用户指定路径中的已有 Skill 导入团队仓库。

### Phase 3：用户部署项目 Skill

- 用户点击部署时选择工具和路径。
- 从团队仓库构建目标平台产物。
- 写入用户指定项目目录。
- 幂等维护 `.gitignore`。
- 创建用户部署实例记录。
- 项目页展示当前用户部署状态。

### Phase 4：用户部署实例监听与动态

- 后端启动时注册用户部署实例监听。
- 监听变更后反向解析、计算 diff、写入团队动态。
- WebSocket 推送项目/团队消息。

### Phase 5：冲突处理与提升

- 实现 `changed` / `conflict` 状态。
- 实现"提升为团队版本"、"回滚项目实例"、"另存为新 Skill"。
- 前端提供差异查看和确认操作。

---

## 十、暂不处理

第一版不建议做：

- 自动三方合并 Markdown 和资源目录。
- 多机器路径同步。
- 跨团队共享同一个团队 Skill 实例。
- 原始导入来源目录持续监听。

这些都可以后续补，但第一版先把资产边界和同步方向建立清楚。

---

## 十一、已确认产品决策

1. 团队仓库 Skill 当前不允许直接在线编辑，只能从用户部署实例提升。
2. 个人仓库 Skill 提取到团队仓库后，当前阶段不保留两者的版本关联。
3. 用户部署实例变更默认进入团队动态；团队可配置是否自动热更新团队仓库，默认关闭。
4. 用户部署路径当前只支持本机路径，暂不支持远程 Agent/Worker 路径。
5. 停止跟踪部署实例时，不默认删除本地 Skill 文件，只停止平台跟踪关系。
