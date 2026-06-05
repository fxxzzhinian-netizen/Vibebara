/**
 * 前端编排链路（M4 前端分流，编排者=前端，见 M0 §3 / §9）。
 *
 * 桌面客户端形态下「云端够不着本地代理」，原一次性的 deploy/push/pull/import 必须由
 * 前端串成多步：「云端构建产物 → 本地代理落盘/读盘 → 云端登记/解析」。本模块封装这些
 * 编排函数，返回值刻意与旧的一次性 API（projects.ts / skillStore.ts）**同形状**，
 * 以便上层 store/view 在灰度分流时**无需改调用签名**。
 *
 * 云端协作端点 DTO 严格对齐 `contracts/local-agent-api.md` §9。
 *
 * ⚠️ 云端依赖（M1 落地）：build-artifact / register-deployment / commit-pull /
 * push（内容版）/ import-content 等端点属云端 C 类改造，**当前后端尚未实现**。
 * 因此这些编排路径仅在 runtimeConfig.orchestration=true（桌面/联调）时启用；web 灰度
 * 默认走旧端点（见各 api/*.ts 的分流）。所有依赖云端新端点处均以 TODO(cloud) 标注。
 */
import { cloudClient } from './client'
import * as localAgent from './localAgent'
import type {
  ResourcePayload,
  ToolType,
  FilePayload,
} from './localAgent'
import type {
  SkillDeploymentResponse,
  PullUpdateResponse,
  PushDeploymentResponse,
  DeploymentLocalStatusResponse,
  UserSkillDeploymentInfo,
} from './projects'
import type {
  DeployResponse,
  MutationResponse,
} from './skillStore'
import type { MigrateResponse, InstalledAtStatus } from './skillForge'

// ===================== 云端协作端点 DTO（契约 §9）=====================

/** 资源清单项：云端把 Store 的 scripts/references/assets 随产物下发，再转交 write-skill。 */
export interface CloudResourceItem {
  path: string
  transfer: localAgent.ResourceTransfer
  encoding?: localAgent.ContentEncoding
  content?: string
  url?: string
  sha256?: string
  size?: number
}

/** 抽象快照（云端权威生成；deploy/pull 由云端从构建产物直接产出）。 */
export type AbstractSnapshot = Record<string, unknown>

/** ① 云端构建产物（不写盘、不登记）。 */
export interface BuildArtifactResponse {
  success: boolean
  skillId: string
  tool: ToolType
  contents: Record<string, string>
  resources: CloudResourceItem[]
  repoHash: string
  repoVersion: number
  abstractSnapshot: AbstractSnapshot
  error?: string
}

/** ④ 云端登记部署元数据（对应原 deploy_project_skill 的写库段）。 */
export interface RegisterDeploymentRequest {
  tool: ToolType
  deployPath: string
  installPath: string
  installedHash: string
  repoHash: string
  repoVersion: number
  abstractSnapshot: AbstractSnapshot
  overwrite?: boolean
}

/** 拉取提交（对应原 pull-update 的写库段）。 */
export interface CommitPullRequest {
  installedHash: string
  repoHash: string
  repoVersion: number
  abstractSnapshot: AbstractSnapshot
}

/** 推送（接收本地 install 内容上传，云端 diff + 写回 Store）。 */
export interface PushDeploymentRequest {
  currentHash: string
  files: FilePayload[]
}

/** 导入（接收本地文件夹内容上传，云端落 Store）。 */
export interface ImportContentRequest {
  files: FilePayload[]
  origin?: string
  scope?: 'personal' | 'team'
  teamId?: string
}

// ===================== 云端编排端点调用（TODO: M1 后端落地）=====================

/** POST /projects/{pid}/skills/{sid}/build-artifact —— 项目 Skill 构建产物。 */
async function buildArtifactForProjectSkill(
  projectId: string,
  skillId: string,
  tool: ToolType,
): Promise<BuildArtifactResponse> {
  // TODO(cloud): 云端 C 类端点（M1）。返回 contents+resources+repoHash+abstractSnapshot。
  const { data } = await cloudClient.post<BuildArtifactResponse>(
    `/projects/${projectId}/skills/${skillId}/build-artifact`,
    { tool },
  )
  return data
}

/** POST /skill-deployments/{id}/build-artifact —— 拉取时取团队最新产物。 */
async function buildArtifactForDeployment(
  deploymentId: string,
): Promise<BuildArtifactResponse> {
  // TODO(cloud): 云端 C 类端点（M1）。build 团队仓库最新 → contents+resources+teamHash。
  const { data } = await cloudClient.post<BuildArtifactResponse>(
    `/skill-deployments/${deploymentId}/build-artifact`,
    {},
  )
  return data
}

/** POST /skill-forge/store/{sid}/build-artifact —— 个人/团队仓库 Skill 构建产物。 */
async function buildArtifactForStoreSkill(
  skillId: string,
  tool: ToolType,
): Promise<BuildArtifactResponse> {
  // TODO(cloud): 契约 §9 仅列了 project/deployment build-artifact；个人仓库部署所需的
  // store 级 build-artifact（返回 contents+resources）需 M1 补齐并与云端对齐字段。
  const { data } = await cloudClient.post<BuildArtifactResponse>(
    `/skill-forge/store/${skillId}/build-artifact`,
    { tool },
  )
  return data
}

/** POST /projects/{pid}/skills/{sid}/register-deployment —— 登记部署元数据。 */
async function registerDeployment(
  projectId: string,
  skillId: string,
  body: RegisterDeploymentRequest,
): Promise<SkillDeploymentResponse> {
  // TODO(cloud): 云端 C 类端点（M1）。UPSERT UserSkillDeployment + 写 change log。
  const { data } = await cloudClient.post<SkillDeploymentResponse>(
    `/projects/${projectId}/skills/${skillId}/register-deployment`,
    body,
  )
  return data
}

/** POST /skill-deployments/{id}/commit-pull —— 拉取提交登记。 */
async function commitPull(
  deploymentId: string,
  body: CommitPullRequest,
): Promise<PullUpdateResponse> {
  // TODO(cloud): 云端 C 类端点（M1）。status=synced, local_dirty=false, 写 change log(pulled)。
  const { data } = await cloudClient.post<PullUpdateResponse>(
    `/skill-deployments/${deploymentId}/commit-pull`,
    body,
  )
  return data
}

/** POST /skill-deployments/{id}/push —— 内容版推送（入参从路径改为 currentHash+files）。 */
async function pushContent(
  deploymentId: string,
  body: PushDeploymentRequest,
): Promise<PushDeploymentResponse> {
  // TODO(cloud): 同名端点 M1 改造为接收 {currentHash, files}（临时目录重建 → diff → 写回 Store）。
  const { data } = await cloudClient.post<PushDeploymentResponse>(
    `/skill-deployments/${deploymentId}/push`,
    body,
  )
  return data
}

/** POST /skill-forge/store/import-content —— 内容版导入。 */
async function importContent(
  body: ImportContentRequest,
): Promise<MutationResponse> {
  // TODO(cloud): 云端 C 类端点（M1）。临时目录重建 files → 复用 import_from_external 解析落 Store。
  const { data } = await cloudClient.post<MutationResponse>(
    '/skill-forge/store/import-content',
    body,
  )
  return data
}

// ===================== 内部辅助 =====================

/** CloudResourceItem[] → write-skill ResourcePayload[]（结构同形，直接透传）。 */
function toWriteResources(items: CloudResourceItem[] | undefined): ResourcePayload[] {
  if (!items) return []
  return items.map((r) => ({
    path: r.path,
    transfer: r.transfer,
    encoding: r.encoding,
    content: r.content,
    url: r.url,
    sha256: r.sha256,
    size: r.size,
  }))
}

function asTool(t: string): ToolType {
  if (t === 'codex') return 'codex'
  if (t === 'windsurf') return 'windsurf'
  if (t === 'claude') return 'claude'
  return 'cursor'
}

// ===================== 编排：项目 Skill 部署（M0 §3.1）=====================

/**
 * 部署项目 Skill（四步：云端产物 → 本地落盘 → 本地 hash → 云端登记）。
 * 返回 SkillDeploymentResponse（与旧 deployProjectSkill 同形）。
 */
export async function deployProjectSkillOrchestrated(
  projectId: string,
  skillId: string,
  payload: { tool_type: string; deploy_path: string; overwrite?: boolean },
): Promise<SkillDeploymentResponse> {
  const tool = asTool(payload.tool_type)
  try {
    // ① 云端构建产物（不写盘、不登记）
    const artifact = await buildArtifactForProjectSkill(projectId, skillId, tool)
    if (!artifact.success) {
      return { success: false, deployed: [], error: artifact.error || '云端构建失败' }
    }

    // ② 本地代理落盘（覆盖语义） + ③ write-skill 顺带返回 installedHash（省一次 /local/hash）
    // 【M5-b 任务③】deploy_path = 用户确认选定的目标根，作为本地代理写盘授权来源
    // （write-skill 据此登记可写根 + 逃逸校验；browse 不再被动授权）。
    const write = await localAgent.writeSkill({
      deployPath: payload.deploy_path,
      scope: 'project',
      tool,
      skillId: artifact.skillId || skillId,
      contents: artifact.contents,
      resources: toWriteResources(artifact.resources),
      overwrite: payload.overwrite ?? false,
      ensureGitignore: true,
    })

    // ④ 云端登记部署元数据 + change log
    return await registerDeployment(projectId, skillId, {
      tool,
      deployPath: payload.deploy_path,
      installPath: write.installPath,
      installedHash: write.installedHash,
      repoHash: artifact.repoHash,
      repoVersion: artifact.repoVersion,
      abstractSnapshot: artifact.abstractSnapshot,
      overwrite: payload.overwrite,
    })
  } catch (e) {
    return { success: false, deployed: [], error: errMsg(e) }
  }
}

/**
 * 全局部署项目 Skill（落本机平台目录 ~/.{tool}/skills/{skillId}，不登记跟踪）。
 * 复用项目 build-artifact 取产物（兼容团队/项目权限），交本地代理以 platform scope 落盘。
 * 与项目级部署的差异：scope=platform、无 deployPath、不调用 register-deployment。
 */
export async function deployProjectSkillGlobalOrchestrated(
  projectId: string,
  skillId: string,
  payload: { tool_type: string; overwrite?: boolean },
): Promise<SkillDeploymentResponse> {
  const tool = asTool(payload.tool_type)
  try {
    const artifact = await buildArtifactForProjectSkill(projectId, skillId, tool)
    if (!artifact.success) {
      return { success: false, deployed: [], error: artifact.error || '云端构建失败' }
    }
    const write = await localAgent.writeSkill({
      scope: 'platform',
      tool,
      skillId: artifact.skillId || skillId,
      contents: artifact.contents,
      resources: toWriteResources(artifact.resources),
      overwrite: payload.overwrite ?? true,
      ensureGitignore: false,
    })
    return { success: true, deployed: [{ target: tool, path: write.installPath }] }
  } catch (e) {
    return { success: false, deployed: [], error: errMsg(e) }
  }
}

// ===================== 编排：拉取更新（M0 §3.3）=====================

export async function pullUpdateOrchestrated(
  deploymentId: string,
  deployment: UserSkillDeploymentInfo,
  overwrite: boolean,
): Promise<PullUpdateResponse> {
  const tool = asTool(deployment.tool_type)
  try {
    // 本地当前 hash 与基线比对：有未推送改动且未授权覆盖 → 拦截冲突
    const cur = await localAgent.hashOne(deployment.install_path)
    if (cur.exists && cur.hash !== deployment.installed_hash && !overwrite) {
      return { success: false, conflict: true }
    }

    // 取团队最新产物（云端）
    const artifact = await buildArtifactForDeployment(deploymentId)
    if (!artifact.success) {
      return { success: false, error: artifact.error || '云端构建失败' }
    }

    // 覆盖写本地（write-skill overwrite:true 顺带回 installedHash）
    const write = await localAgent.writeSkill({
      deployPath: deployment.deploy_path,
      scope: 'project',
      tool,
      skillId: artifact.skillId,
      contents: artifact.contents,
      resources: toWriteResources(artifact.resources),
      overwrite: true,
      ensureGitignore: true,
    })

    // 云端登记拉取提交
    return await commitPull(deploymentId, {
      installedHash: write.installedHash,
      repoHash: artifact.repoHash,
      repoVersion: artifact.repoVersion,
      abstractSnapshot: artifact.abstractSnapshot,
    })
  } catch (e) {
    return { success: false, error: errMsg(e) }
  }
}

// ===================== 编排：推送（M0 §3.2）=====================

export async function pushOrchestrated(
  deploymentId: string,
  deployment: UserSkillDeploymentInfo,
): Promise<PushDeploymentResponse> {
  try {
    const cur = await localAgent.hashOne(deployment.install_path)
    if (!cur.exists) {
      return {
        success: false,
        change_items: [],
        diff_summary: '',
        status: 'missing',
        error: '本地部署目录缺失，无法推送',
      }
    }
    if (cur.hash === deployment.installed_hash) {
      // 本地无改动，直接返回（与旧 push_deployment no_change 语义一致）
      return { success: true, no_change: true, change_items: [], diff_summary: '' }
    }

    // 读取本地 install 全部文件（文本/二进制按契约编码）
    const folder = await localAgent.readFolder({
      path: deployment.install_path,
      include: 'all',
    })

    // 上传云端解析 + diff + 写回 Store
    return await pushContent(deploymentId, {
      currentHash: cur.hash,
      files: folder.files,
    })
  } catch (e) {
    return {
      success: false,
      change_items: [],
      diff_summary: '',
      error: errMsg(e),
    }
  }
}

// ===================== 编排：本地状态（M0 §3.6 方式二）=====================

/**
 * 本地状态：本地代理算 hash → 与基线 installed_hash 比对判定 dirty。
 * dirty 判定纯本地 hash 比较（M0 §3.6），无需云端往返。
 */
export async function getLocalStatusOrchestrated(
  _deploymentId: string,
  deployment: UserSkillDeploymentInfo,
): Promise<DeploymentLocalStatusResponse> {
  try {
    const cur = await localAgent.hashOne(deployment.install_path)
    const dirty = cur.exists && cur.hash !== deployment.installed_hash
    const status = !cur.exists ? 'missing' : dirty ? 'changed' : 'synced'
    return {
      success: true,
      exists: cur.exists,
      has_local_changes: dirty,
      installed_hash: deployment.installed_hash,
      current_hash: cur.hash,
      status,
    }
  } catch (e) {
    return {
      success: false,
      exists: false,
      has_local_changes: false,
      installed_hash: deployment.installed_hash,
      current_hash: '',
      status: 'error',
      error: errMsg(e),
    }
  }
}

// ===================== 编排：个人/团队仓库 Skill 部署（M0 §3.1 变体）=====================

/**
 * 个人/团队仓库 Skill 部署到平台或项目目录。
 * destPath 有值 → scope=project；无值 → scope=platform（落本地平台 skill 目录）。
 * 注意：个人仓库部署不登记 deployment（与旧 deployNativeSkill 一致）。
 */
export async function deployNativeSkillOrchestrated(
  id: string,
  target: string,
  destPath?: string,
): Promise<DeployResponse> {
  const tool = asTool(target)
  const scope = destPath ? 'project' : 'platform'
  try {
    const artifact = await buildArtifactForStoreSkill(id, tool)
    if (!artifact.success) {
      return { success: false, deployed: [], error: artifact.error || '云端构建失败' }
    }
    const write = await localAgent.writeSkill({
      deployPath: destPath,
      scope,
      tool,
      skillId: artifact.skillId || id,
      contents: artifact.contents,
      resources: toWriteResources(artifact.resources),
      overwrite: true,
      ensureGitignore: scope === 'project',
    })
    // 平台部署状态（deployed_cursor/codex）：薄代理形态下「本机是否已装」由本地代理
    // scan.installedAt 实时回答、前端用其展示（见 getPlatformInstalledStatus + 决定①），
    // 云端 cloud 模式不依赖该标记，故此处无需回写云端。
    return { success: true, deployed: [{ target, path: write.installPath }] }
  } catch (e) {
    return { success: false, deployed: [], error: errMsg(e) }
  }
}

// ===================== 编排：跨平台迁移（M0 §3.1 变体 / 决定②）=====================

/**
 * 跨平台迁移（migrate）—— 决定②：复用「云端 build-artifact（目标平台产物）→
 * 本地代理 write-skill 落盘」，**不新增云端端点**。
 *
 * 与 deploy 变体一致：迁移产物由云端按目标平台构建（store 级 build-artifact），
 * 落到本机平台 skill 目录（scope=platform → ~/.{target}/skills/{skillId}），不登记 deployment。
 *
 * ⚠️ 语义说明：薄代理下「云端够不着本地代理」，迁移产物只能由云端构建。因此编排路径以
 * **云端 Store 中的同 id Skill** 为产物来源（cloud 形态下 Store 即权威）。若目标 Skill
 * 尚未入库（仅存在于本机文件夹），build-artifact 会失败——此时仍可走 web 灰度的旧
 * 一次性 /skill-forge/migrate（node 直接读本机文件夹适配）。详见 M4-收尾与联调记录。
 */
export async function migrateSkillOrchestrated(
  skillId: string,
  targetPlatform: string,
): Promise<MigrateResponse> {
  const tool = asTool(targetPlatform)
  try {
    const artifact = await buildArtifactForStoreSkill(skillId, tool)
    if (!artifact.success) {
      return {
        success: false,
        id: skillId,
        origin: '',
        adapted: false,
        target_platform: targetPlatform,
        dest_path: '',
        error: artifact.error || '云端构建迁移产物失败',
      }
    }
    const write = await localAgent.writeSkill({
      scope: 'platform',
      tool,
      skillId: artifact.skillId || skillId,
      contents: artifact.contents,
      resources: toWriteResources(artifact.resources),
      overwrite: true,
      ensureGitignore: false,
    })
    return {
      success: true,
      id: artifact.skillId || skillId,
      origin: '',
      adapted: true,
      target_platform: targetPlatform,
      dest_path: write.installPath,
    }
  } catch (e) {
    return {
      success: false,
      id: skillId,
      origin: '',
      adapted: false,
      target_platform: targetPlatform,
      dest_path: '',
      error: errMsg(e),
    }
  }
}

// ===================== 平台安装状态（决定①：deployed_* 降级为 scan.installedAt）=====================

/**
 * 经本地代理实时探测「某 Skill 是否已装到本机 cursor/codex/windsurf」（决定①）。
 *
 * 薄代理形态下 `SkillPackage.deployed_cursor/codex/windsurf` 由后端探测后端机器 home 得来，
 * cloud 下无意义；改由本地代理扫描**用户机器**的平台 skill 目录（health.platformSkillDirs），
 * 按 `scan.installedAt` 汇总每个 skillId 的安装状态。前端展示点据此覆盖 deployed_* 展示。
 *
 * 返回 `{ [skillId]: { cursor, codex, windsurf } }`；本地代理不可达/目录为空时返回空表（调用方回退）。
 */
export async function getPlatformInstalledStatus(): Promise<
  Record<string, InstalledAtStatus>
> {
  const map: Record<string, InstalledAtStatus> = {}
  let dirs: { cursor: string; codex: string; windsurf: string; claude: string }
  try {
    const h = await localAgent.health()
    dirs = h.platformSkillDirs
  } catch {
    return map
  }
  // 扫描四个平台目录；每个包的 installedAt 已对各平台目录各自探测，直接汇总即可。
  for (const dir of [dirs.cursor, dirs.codex, dirs.windsurf, dirs.claude]) {
    if (!dir) continue
    try {
      const res = await localAgent.scan({ rootDir: dir })
      for (const p of res.packages) {
        map[p.id] = {
          cursor: p.installedAt.cursor,
          codex: p.installedAt.codex,
          windsurf: p.installedAt.windsurf,
          claude: p.installedAt.claude,
        }
      }
    } catch {
      // 平台目录可能不存在/为空 → 忽略，对应 skill 视为未安装
    }
  }
  return map
}

// ===================== 编排：从本地文件夹导入（M0 §3.5）=====================

export async function importContentOrchestrated(
  sourcePath: string,
  origin?: string,
  scope: 'personal' | 'team' = 'personal',
  teamId?: string,
): Promise<MutationResponse> {
  try {
    const folder = await localAgent.readFolder({ path: sourcePath, include: 'skill' })
    return await importContent({
      files: folder.files,
      origin,
      scope,
      teamId,
    })
  } catch (e) {
    return { success: false, error: errMsg(e) }
  }
}

// ===================== 错误信息提取 =====================

function errMsg(e: unknown): string {
  if (e instanceof localAgent.LocalAgentCallError) {
    return `[本地代理:${e.code}] ${e.message}`
  }
  const anyE = e as { response?: { data?: { detail?: string; error?: string } }; message?: string }
  return (
    anyE?.response?.data?.detail ||
    anyE?.response?.data?.error ||
    anyE?.message ||
    '编排请求失败'
  )
}
