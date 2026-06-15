# 团队权限分级（owner / admin / member）

## 背景与目标

团队此前虽然在数据层已有 `owner/admin/member` 三种角色，但前端缺少「分配权限」入口，
且没有面向管理者的提交审计视图。本次实现以下目标：

- **owner（所有者）**：可解散团队；可通过新增的「分配权限」入口给成员分配 `admin` / `member`。
- **admin（管理员）+ owner**：可编辑团队信息；可在团队管理页查看「提交历史 / 审计」聚合视图。
- **member（成员）**：浏览 / 使用团队 Skill，参与项目协作；看不到聚合审计页，不能改成员角色。

## 现状（实现前已具备）

角色体系在后端基本完整，本次主要补 UI 与一个团队级聚合接口：

- `team_members.role` 为枚举 `owner/admin/member`（`backend/app/models/team.py`）。
- API 层既有权限闸门（`backend/app/api/teams.py`）：
  - `DELETE /teams/{id}` 解散 → 仅 owner。
  - `PUT /teams/{id}` 改信息、`PATCH /teams/{id}/settings` → owner + admin。
  - `PUT /teams/{id}/members/{uid}` 改角色 → 原 owner + admin；service 限定只能设 `admin/member`，且不能改 owner。
- 前端 `TeamWorkspace.vue` 已算出 `myRole` / `isOwner` / `canManageProjects`；
  解散按钮已 `v-if="isOwner"`，编辑信息已 `v-if="canManageProjects"`。
- 前端 API `updateMemberRole` 已存在但全站未被调用。
- 数据源 `skill_versions`（团队 Skill 版本快照）已带 `team_id`，可按团队聚合。

## 权限矩阵

| 能力 | owner | admin | member |
| --- | :---: | :---: | :---: |
| 解散团队 | ✓ | | |
| 分配 / 调整成员角色 | ✓ | | |
| 编辑团队信息 / 设置 / 邀请码 | ✓ | ✓ | |
| 查看「提交历史 / 审计」聚合页 | ✓ | ✓ | |
| 浏览 / 使用团队 Skill | ✓ | ✓ | ✓ |
| Skill 详情页版本历史 | ✓ | ✓ | ✓ |

说明：

- 本次把「分配 / 调整成员角色」从 owner + admin **收紧为 owner only**，贴合「owner 给人分配 admin」的需求。
- 「编辑团队信息」后端 + 前端均已满足，仅做验证、不改动。
- Skill 详情页的版本历史按确认保持对所有成员可见，不收紧。

## 接口契约

### 收紧：调整成员角色（owner only）

`PUT /teams/{team_id}/members/{target_user_id}`

- 闸门由 `role in (owner, admin)` 改为 `role == owner`，否则 `403 仅 owner 可分配权限`。
- 请求体 `{ "role": "admin" | "member" }`；service 仍拒绝把目标改成 / 改自 `owner`。

### 新增：团队提交历史 / 审计聚合

`GET /teams/{team_id}/skill-history?skill_id=&limit=50&offset=0`

- 鉴权：`get_current_user_id`；闸门 `role in (owner, admin)`，否则 `403`。
- 数据源：`skill_versions`（按 `team_id` 过滤），join `team_skills` 补 `skill_name`，
  按 `created_at` 倒序，支持按 `skill_id` 过滤与 `limit/offset` 分页。
- 响应：

```jsonc
{
  "success": true,
  "items": [
    {
      "id": "…", "skill_id": "…", "skill_name": "…",
      "team_id": "…", "seq": 3, "label": "",
      "change_summary": "更新了脚本", "change_items": [],
      "resource_count": 2, "source": "push",
      "created_by": "…", "created_by_name": "张三",
      "created_at": "2026-06-15T07:00:00"
    }
  ]
}
```

### 数据源选型说明

后端有两套历史：

- `skill_versions`：用户**显式建版本**时落的完整内容快照，可靠带 `team_id`，含 `change_summary` / `source` / `created_by`。
- `skill_change_log`：每次推送 / 拉取自动记的审计流，但 `team_id` 并非所有写入路径都设置（如 `SkillSyncService.on_skill_changed` 未写 `team_id`）。

为保证团队级聚合的可靠性与「每个 skill 的每次提交（版本）」语义，本次以 `skill_versions` 为聚合源；
后续如需更细粒度的推送 / 拉取审计，可再叠加 `skill_change_log`（需先补齐其 `team_id`）。

## 前端改动点

- `frontend/src/api/teams.ts`：新增 `listTeamSkillHistory(teamId, { skillId?, limit?, offset? })` 与类型 `TeamSkillHistoryItem`。
- `frontend/src/stores/teamStore.ts`：新增 `changeMemberRole(userId, role)`，成功后重新 `listMembers` 刷新 `members`。
- `frontend/src/views/TeamWorkspace.vue`：
  - 工具栏在「解散团队」左侧加 `v-if="isOwner"` 的「分配权限」按钮（纯色紫 `#4f46e5`，遵循 `.cursor/rules/solid-color-buttons.mdc`）。
  - 「分配权限」`BaseModal`：列出成员，每行角色下拉（管理员 / 成员；owner 行禁用并标注「所有者」），改动即调 `changeMemberRole` + toast。
  - 成员列表角色文案本地化：owner→所有者、admin→管理员、member→成员。
  - 团队管理页新增「提交历史 / 审计」卡片 `v-if="canManageProjects"`：拉 `listTeamSkillHistory`，
    展示 `skill_name · v{seq} · 来源 · 提交人 · 时间 · change_summary`，支持按 skill 过滤与「加载更多」。

## 校验

- 后端：跑既有团队相关测试确认无回归；新接口手测 owner / admin / member 三角色的 200 / 403。
- 前端：`npm run build` 类型检查通过；按角色切换验证按钮可见性与弹窗交互。
