/**
 * 本地代理（Local Agent）client 封装 —— 7 端点（M4 前端分流）。
 *
 * 类型严格对齐 `docs/方案B-桌面客户端迁移/contracts/local-agent-api.md`（冻结契约），
 * 字段命名 camelCase；鉴权头 `X-Pairing-Token` 由 localAgentClient 拦截器统一附加。
 *
 * Base：`http://127.0.0.1:<PORT>`，前缀 `/local`，版本 `local-agent/v1`。
 * 所有 HTTP 响应为 `LocalAgentResponse<T>`（成功 T | 统一失败 LocalAgentFailure）。
 */
import { localAgentClient } from './client'

// ===================== 通用类型（契约 §1）=====================

export type LocalAgentApiVersion = 'local-agent/v1'
export type ToolType = 'cursor' | 'codex' | 'windsurf'
export type DeployScope = 'project' | 'platform'
export type ContentEncoding = 'utf8' | 'base64'
export type ResourceTransfer = 'inline' | 'url'

export type LocalAgentErrorCode =
  | 'UNAUTHORIZED'
  | 'WRITE_ROOT_FORBIDDEN'
  | 'PATH_NOT_FOUND'
  | 'NOT_A_DIRECTORY'
  | 'INSTALL_EXISTS'
  | 'IO_ERROR'
  | 'UNSUPPORTED_TOOL'
  | 'BAD_REQUEST'

export interface LocalAgentError {
  code: LocalAgentErrorCode
  message: string
  detail?: string
}

export interface LocalAgentFailure {
  ok: false
  error: LocalAgentError
}

export interface LocalAgentSuccessBase {
  ok: true
  apiVersion?: LocalAgentApiVersion
}

export type LocalAgentResponse<TSuccess extends LocalAgentSuccessBase> =
  | TSuccess
  | LocalAgentFailure

/** 一个文件的内容载荷（read-folder 输出 / write-skill 资源）。 */
export interface FilePayload {
  /** 相对 root 的 POSIX 路径（正斜杠分隔），如 "assets/icon.png"。 */
  path: string
  encoding: ContentEncoding
  /** utf8=原始字符串（无 BOM、保留原始换行）；base64=标准 base64（无换行）。 */
  content: string
}

// ===================== health（契约 §2）=====================

export interface HealthResponse extends LocalAgentSuccessBase {
  agentVersion: string
  apiVersion: LocalAgentApiVersion
  platform: string
  paired: boolean
  platformSkillDirs: {
    cursor: string
    codex: string
    windsurf: string
  }
}

// ===================== browse（契约 §3）=====================

export interface DirEntry {
  name: string
  absPath: string
  isDrive: boolean
}

export interface BrowseResponse extends LocalAgentSuccessBase {
  current: string
  parent: string | null
  dirs: DirEntry[]
  note?: string
}

// ===================== scan（契约 §4）=====================

export interface ScanRequest {
  rootDir: string
}

export type SkillOrigin = 'cursor' | 'codex' | 'unknown'
export type OriginConfidence = 'high' | 'medium' | 'low'

export interface InstalledAtStatus {
  cursor: boolean
  codex: boolean
  windsurf: boolean
}

export interface UnifiedSkillPackage {
  id: string
  origin: SkillOrigin
  originConfidence: OriginConfidence
  originSignals: string[]
  sourcePath: string
  name: string
  displayName: string
  description: string
  shortDescription: string
  hasScripts: boolean
  hasReferences: boolean
  hasAssets: boolean
  installedAt: InstalledAtStatus
}

export interface ScanResponse extends LocalAgentSuccessBase {
  status: 'ready' | 'scanning' | 'error'
  scanDir: string
  lastScan: string | null
  packages: UnifiedSkillPackage[]
  scanError?: string | null
}

// ===================== read-folder（契约 §5）=====================

export interface ReadFolderRequest {
  path: string
  include?: 'skill' | 'all'
}

export interface ReadFolderResponse extends LocalAgentSuccessBase {
  root: string
  dirHash: string
  files: FilePayload[]
}

// ===================== write-skill（契约 §6）=====================

export interface ResourcePayload {
  path: string
  transfer: ResourceTransfer
  // transfer = "inline"
  encoding?: ContentEncoding
  content?: string
  // transfer = "url"
  url?: string
  sha256?: string
  size?: number
}

export interface WriteSkillRequest {
  /** scope=project 时必填：本地项目根目录绝对路径。 */
  deployPath?: string
  scope: DeployScope
  tool: ToolType
  skillId: string
  /** 构建产物文本：相对 install 根的 POSIX 路径 → UTF-8 文本。 */
  contents: Record<string, string>
  /** 资源文件（可含二进制）；空数组表示无资源。 */
  resources: ResourcePayload[]
  overwrite?: boolean
  /** 仅 scope=project 生效：维护 deployPath/.gitignore 的 VibeHub 块。 */
  ensureGitignore?: boolean
}

export interface WriteSkillResponse extends LocalAgentSuccessBase {
  installPath: string
  written: string[]
  /** 落盘后立即用统一算法计算的 install 目录 hash（= 后端 installed_hash）。 */
  installedHash: string
}

// ===================== hash（契约 §7）=====================

export interface HashRequest {
  paths: string[]
}

export interface HashResult {
  path: string
  hash: string
  exists: boolean
}

export interface HashResponse extends LocalAgentSuccessBase {
  results: HashResult[]
}

// ===================== watch（契约 §8）=====================

export interface WatchSubscription {
  deploymentId: string
  installPath: string
  installedHash: string
}

export type WatchClientMessage =
  | { op: 'subscribe'; deployments: WatchSubscription[] }
  | { op: 'unsubscribe'; deploymentIds: string[] }
  | { op: 'ping' }

export type WatchEventType = 'changed' | 'missing' | 'unchanged' | 'error'

export interface WatchServerEvent {
  type: WatchEventType
  deploymentId: string
  installPath: string
  currentHash: string
  dirty: boolean
  exists: boolean
  ts: string
  error?: string
}

export type WatchServerMessage =
  | WatchServerEvent
  | { type: 'pong' }
  | { type: 'subscribed'; deploymentIds: string[] }

// ===================== 错误辅助 =====================

/** 本地代理调用失败异常：携带契约错误码，便于上层分支处理。 */
export class LocalAgentCallError extends Error {
  code: LocalAgentErrorCode
  detail?: string
  constructor(err: LocalAgentError) {
    super(err.message)
    this.name = 'LocalAgentCallError'
    this.code = err.code
    this.detail = err.detail
  }
}

function unwrap<T extends LocalAgentSuccessBase>(data: LocalAgentResponse<T>): T {
  if (data && (data as LocalAgentFailure).ok === false) {
    throw new LocalAgentCallError((data as LocalAgentFailure).error)
  }
  return data as T
}

// ===================== 端点调用 =====================

/** GET /local/health — 存活探测（无需配对令牌；这里仍走带头的 client，无害）。 */
export async function health(): Promise<HealthResponse> {
  const { data } = await localAgentClient.get<LocalAgentResponse<HealthResponse>>(
    '/local/health',
  )
  return unwrap(data)
}

/** GET /local/browse?path= — 目录浏览。 */
export async function browse(path?: string): Promise<BrowseResponse> {
  const { data } = await localAgentClient.get<LocalAgentResponse<BrowseResponse>>(
    '/local/browse',
    { params: path ? { path } : {} },
  )
  return unwrap(data)
}

/** POST /local/scan — 扫描已装/可导入 Skill。 */
export async function scan(req: ScanRequest): Promise<ScanResponse> {
  const { data } = await localAgentClient.post<LocalAgentResponse<ScanResponse>>(
    '/local/scan',
    req,
  )
  return unwrap(data)
}

/** POST /local/read-folder — 读取本地文件夹内容（导入/推送/提升用）。 */
export async function readFolder(
  req: ReadFolderRequest,
): Promise<ReadFolderResponse> {
  const { data } = await localAgentClient.post<
    LocalAgentResponse<ReadFolderResponse>
  >('/local/read-folder', req)
  return unwrap(data)
}

/** POST /local/write-skill — 落盘部署产物（核心写端点）。 */
export async function writeSkill(
  req: WriteSkillRequest,
): Promise<WriteSkillResponse> {
  const { data } = await localAgentClient.post<
    LocalAgentResponse<WriteSkillResponse>
  >('/local/write-skill', req)
  return unwrap(data)
}

/** POST /local/hash — 计算内容 hash（dirty 检测）。 */
export async function hash(paths: string[]): Promise<HashResponse> {
  const { data } = await localAgentClient.post<LocalAgentResponse<HashResponse>>(
    '/local/hash',
    { paths } as HashRequest,
  )
  return unwrap(data)
}

/** 便捷：对单个路径取 hash 结果（不存在 → { hash:"", exists:false }）。 */
export async function hashOne(path: string): Promise<HashResult> {
  const res = await hash([path])
  return res.results[0] ?? { path, hash: '', exists: false }
}
