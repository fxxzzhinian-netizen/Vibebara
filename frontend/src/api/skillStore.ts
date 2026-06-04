import apiClient from './client'
import type { ChangeItem } from './projects'
import type { UnifiedSkillPackage } from './skillForge'
import { normalizeScanPackage } from './skillForge'
import { isOrchestrationEnabled } from '@/runtime/config'
import * as localAgent from './localAgent'
import {
  deployNativeSkillOrchestrated,
  importContentOrchestrated,
} from './orchestration'

export interface NativeSkillItem {
  id: string
  display_name: string
  description: string
  short_description: string
  version: string
  tags: string[]
  imported_from: string | null
  store_path: string
  scope: string
  team_id: string | null
  owner_id: string | null
  source_skill_id: string | null
  content_hash: string
  deployed_cursor: boolean
  deployed_codex: boolean
  deployed_windsurf: boolean
  created_at: string | null
  updated_at: string | null
}

export interface NativeSkillDetail {
  success: boolean
  id: string
  config: Record<string, unknown>
  vibeh_content: string
  store_path: string
  db: NativeSkillItem | null
  error?: string
}

export interface CompleteFieldsResponse {
  success: boolean
  incomplete_fields: string[]
  suggestions: Record<string, string>
  error?: string
}

export interface LLMTestResponse {
  success: boolean
  model?: string
  base_url?: string
  response?: string
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
  error?: string
}

export interface NativeSkillListResponse {
  success: boolean
  skills: NativeSkillItem[]
  error?: string
}

export interface MutationResponse {
  success: boolean
  skill?: NativeSkillItem
  error?: string
  no_change?: boolean
  diff_summary?: string
  change_items?: ChangeItem[]
}

export interface DeployResponse {
  success: boolean
  deployed: { target: string; path: string }[]
  error?: string
}

export interface PreviewOutput {
  target: string
  contents: Record<string, string>
}

export interface PreviewResponse {
  success: boolean
  data?: PreviewOutput[]
  error?: string
}

export async function listNativeSkills(
  scope: 'personal' | 'team' = 'personal',
): Promise<NativeSkillListResponse> {
  const { data } = await apiClient.get<NativeSkillListResponse>(
    '/skill-forge/store/list',
    { params: { scope } },
  )
  return data
}

export async function getNativeSkill(id: string): Promise<NativeSkillDetail> {
  const { data } = await apiClient.get<NativeSkillDetail>(
    `/skill-forge/store/${id}`,
  )
  return data
}

export async function createNativeSkill(
  config: Record<string, unknown>,
  vibeh_content?: string,
): Promise<MutationResponse> {
  const { data } = await apiClient.post<MutationResponse>(
    '/skill-forge/store/create',
    { config, vibeh_content: vibeh_content ?? null },
  )
  return data
}

export async function updateNativeSkill(
  id: string,
  partial: Record<string, unknown>,
  vibeh_content?: string,
): Promise<MutationResponse> {
  const { data } = await apiClient.put<MutationResponse>(
    `/skill-forge/store/${id}`,
    { partial, vibeh_content: vibeh_content ?? null },
  )
  return data
}

export async function completeSkillFields(
  id: string,
): Promise<CompleteFieldsResponse> {
  const { data } = await apiClient.post<CompleteFieldsResponse>(
    `/skill-forge/store/${id}/complete`,
  )
  return data
}

export async function testLLMConnection(): Promise<LLMTestResponse> {
  const { data } = await apiClient.get<LLMTestResponse>(
    '/skill-forge/store/llm/test',
  )
  return data
}

export async function deleteNativeSkill(id: string): Promise<{ success: boolean }> {
  const { data } = await apiClient.delete<{ success: boolean }>(
    `/skill-forge/store/${id}`,
  )
  return data
}

export async function importToNativeStore(
  sourcePath: string,
  origin?: string,
): Promise<MutationResponse> {
  // 灰度分流：编排开启 → 本地代理 read-folder → 云端 import-content（M0 §3.5）；
  // 否则走旧的一次性云端 /skill-forge/store/import。
  if (isOrchestrationEnabled()) {
    return importContentOrchestrated(sourcePath, origin, 'personal')
  }
  const { data } = await apiClient.post<MutationResponse>(
    '/skill-forge/store/import',
    { source_path: sourcePath, origin: origin ?? null },
  )
  return data
}

export async function deployNativeSkill(
  id: string,
  target: string,
  destPath?: string,
): Promise<DeployResponse> {
  // 灰度分流：编排开启 → 云端产物 → 本地代理 write-skill 落盘（M0 §3.1 变体）；
  // 否则走旧的一次性云端 /skill-forge/store/{id}/deploy。
  if (isOrchestrationEnabled()) {
    return deployNativeSkillOrchestrated(id, target, destPath)
  }
  const { data } = await apiClient.post<DeployResponse>(
    `/skill-forge/store/${id}/deploy`,
    { target, dest_path: destPath ?? null },
  )
  return data
}

export async function buildNativeSkill(
  id: string,
  target: string = 'all',
): Promise<Record<string, unknown>> {
  const { data } = await apiClient.post<Record<string, unknown>>(
    `/skill-forge/store/${id}/build`,
    { target },
  )
  return data
}

export async function previewNativeSkill(
  id: string,
  target: string = 'all',
): Promise<PreviewResponse> {
  const { data } = await apiClient.get<PreviewResponse>(
    `/skill-forge/store/${id}/preview`,
    { params: { target } },
  )
  return data
}

export async function copySkillToTeam(
  teamId: string,
  skillId: string,
): Promise<MutationResponse> {
  const { data } = await apiClient.post<MutationResponse>(
    `/teams/${teamId}/skills/from-personal/${skillId}`,
  )
  return data
}

export interface TeamSkillScanResponse {
  success: boolean
  packages: UnifiedSkillPackage[]
  error?: string
}

export async function scanLocalSkills(
  teamId: string,
  path: string,
): Promise<TeamSkillScanResponse> {
  // 灰度分流：编排开启 → 本地代理 POST /local/scan；否则走旧的云端 scan-local。
  if (isOrchestrationEnabled()) {
    try {
      const res = await localAgent.scan({ rootDir: path })
      return { success: res.status === 'ready', packages: res.packages.map(normalizeScanPackage), error: res.scanError ?? undefined }
    } catch (e) {
      const err = e as { message?: string }
      return { success: false, packages: [], error: err?.message || '本地代理扫描失败' }
    }
  }
  const { data } = await apiClient.post<TeamSkillScanResponse>(
    `/teams/${teamId}/skills/scan-local`,
    { path },
  )
  return data
}

export async function importLocalSkillToTeam(
  teamId: string,
  sourcePath: string,
  origin?: string,
): Promise<MutationResponse> {
  // 灰度分流：编排开启 → 本地代理 read-folder → 云端 import-content(scope=team)（M0 §3.5）；
  // 否则走旧的一次性云端 import-local。
  if (isOrchestrationEnabled()) {
    return importContentOrchestrated(sourcePath, origin, 'team', teamId)
  }
  const { data } = await apiClient.post<MutationResponse>(
    `/teams/${teamId}/skills/import-local`,
    { source_path: sourcePath, origin: origin ?? null },
  )
  return data
}
