import apiClient from './client'
import { isOrchestrationEnabled } from '@/runtime/config'
import * as localAgent from './localAgent'
import { scanPlatformGlobalSkillsOrchestrated } from './orchestration'

// --- 目录浏览 ---

export interface DirEntry {
  name: string
  abs_path: string
  is_drive: boolean
}

export interface BrowseResponse {
  success: boolean
  current: string
  parent: string | null
  dirs: DirEntry[]
  error?: string
}

/** 本地代理 browse（camelCase）→ 旧 BrowseResponse（snake_case）归一，使调用方无需改动。 */
function normalizeBrowse(res: localAgent.BrowseResponse): BrowseResponse {
  return {
    success: true,
    current: res.current,
    parent: res.parent,
    dirs: res.dirs.map((d) => ({
      name: d.name,
      abs_path: d.absPath,
      is_drive: d.isDrive,
    })),
    error: res.note,
  }
}

export async function browseDirectory(path: string): Promise<BrowseResponse> {
  // 灰度分流：编排开启 → 本地代理 GET /local/browse；否则走旧的云端 /skill-forge/browse。
  if (isOrchestrationEnabled()) {
    try {
      const res = await localAgent.browse(path || undefined)
      return normalizeBrowse(res)
    } catch (e) {
      const err = e as { message?: string }
      return { success: false, current: '', parent: null, dirs: [], error: err?.message || '本地代理浏览失败' }
    }
  }
  const { data } = await apiClient.post<BrowseResponse>(
    '/skill-forge/browse',
    { path },
  )
  return data
}

// --- 外部扫描 + 迁移 ---

export interface InstalledAtStatus {
  cursor: boolean
  codex: boolean
  windsurf: boolean
  claude: boolean
  kiro: boolean
  trae: boolean
  qoder: boolean
}

export interface UnifiedSkillPackage {
  id: string
  origin: string
  origin_confidence: string
  origin_signals: string[]
  source_path: string
  name: string
  display_name: string
  description: string
  short_description: string
  has_scripts: boolean
  has_references: boolean
  has_assets: boolean
  installed_at: InstalledAtStatus
}

export interface ScanStatusResponse {
  status: string
  packages: UnifiedSkillPackage[]
  scan_dir: string
  last_scan: string | null
  error: string | null
}

export interface MigrateResponse {
  success: boolean
  id: string
  origin: string
  adapted: boolean
  target_platform: string
  dest_path: string
  error?: string
}

/** 本地代理 scan 包（camelCase）→ 旧 UnifiedSkillPackage（snake_case）归一。 */
export function normalizeScanPackage(
  p: localAgent.UnifiedSkillPackage,
): UnifiedSkillPackage {
  return {
    id: p.id,
    origin: p.origin,
    origin_confidence: p.originConfidence,
    origin_signals: p.originSignals,
    source_path: p.sourcePath,
    name: p.name,
    display_name: p.displayName,
    description: p.description,
    short_description: p.shortDescription,
    has_scripts: p.hasScripts,
    has_references: p.hasReferences,
    has_assets: p.hasAssets,
    installed_at: p.installedAt,
  }
}

export async function getPackages(): Promise<ScanStatusResponse> {
  // 编排模式下本地代理 scan 是无状态的（云端不再缓存扫描结果），无目录可拉，
  // 返回空 ready；调用方（project store.refreshFromBackend）仅在非空时更新，故安全。
  if (isOrchestrationEnabled()) {
    return { status: 'ready', packages: [], scan_dir: '', last_scan: null, error: null }
  }
  const { data } = await apiClient.get<ScanStatusResponse>('/skill-forge/packages')
  return data
}

export async function rescanSkills(scanDir?: string): Promise<ScanStatusResponse> {
  // 灰度分流：编排开启 → 本地代理 POST /local/scan；否则走旧的云端 /skill-forge/rescan。
  if (isOrchestrationEnabled()) {
    if (!scanDir) {
      return { status: 'error', packages: [], scan_dir: '', last_scan: null, error: '缺少扫描目录' }
    }
    try {
      const res = await localAgent.scan({ rootDir: scanDir })
      return {
        status: res.status,
        packages: res.packages.map(normalizeScanPackage),
        scan_dir: res.scanDir,
        last_scan: res.lastScan,
        error: res.scanError ?? null,
      }
    } catch (e) {
      const err = e as { message?: string }
      return { status: 'error', packages: [], scan_dir: scanDir, last_scan: null, error: err?.message || '本地代理扫描失败' }
    }
  }
  const { data } = await apiClient.post<ScanStatusResponse>(
    '/skill-forge/rescan',
    { scan_dir: scanDir ?? null },
  )
  return data
}

// --- 从 IDE 工具导入：检索各 IDE 全局目录 ---

/** 一个 IDE 全局目录的检索分组（packages 已归一为 snake_case，复用本地/链接同款渲染）。 */
export interface IdeSkillGroup {
  tool: localAgent.ToolType
  dir: string
  packages: UnifiedSkillPackage[]
}

/**
 * 检索本机各受支持 IDE 的全局 skill 目录并按 IDE 分组。
 * 仅桌面（编排）模式可用——扫描用户 home 目录只能经本地代理；web 模式直接给出提示。
 */
export async function scanIdeGlobalSkills(): Promise<{
  success: boolean
  groups: IdeSkillGroup[]
  error?: string
}> {
  if (!isOrchestrationEnabled()) {
    return { success: false, groups: [], error: '该功能仅桌面客户端支持' }
  }
  try {
    const raw = await scanPlatformGlobalSkillsOrchestrated()
    const groups: IdeSkillGroup[] = raw.map((g) => ({
      tool: g.tool,
      dir: g.dir,
      packages: g.packages.map(normalizeScanPackage),
    }))
    return { success: true, groups }
  } catch (e) {
    const err = e as { message?: string }
    return { success: false, groups: [], error: err?.message || '检索失败' }
  }
}
