import apiClient from './client'
import type { NativeSkillItem } from './skillStore'
import { DEV_SKIP_AUTH } from '@/runtime/devAuth'

export type MarketStatus = 'pending' | 'approved' | 'rejected'

export interface MarketSkillItem {
  id: string
  display_name: string
  description: string
  short_description: string
  version: string
  tags: string[]
  content_hash: string
  // 介绍页信息（取自 Skill config.intro，发布时随快照带入）
  intro_title?: string
  intro_author?: string
  intro_category?: string
  intro_md?: string
  source_scope: 'personal' | 'team'
  source_skill_id: string
  source_team_id: string | null
  publisher_id: string
  publisher_name: string
  status: MarketStatus
  reviewed_by: string | null
  reviewed_at: string | null
  review_note: string | null
  created_at: string | null
  updated_at: string | null
}

/** 市场条目完整详情（只读「SKILL 介绍」页）。 */
export interface MarketSkillDetail {
  success: boolean
  id: string
  config: Record<string, any>
  vibeh_content: string
  store_path: string
  listing: MarketSkillItem | null
  error?: string
}

export interface MarketResourceFileResponse {
  success: boolean
  path: string
  encoding: 'utf8' | 'base64'
  content: string
  size: number
  is_binary: boolean
  error?: string
}

export interface MarketListResponse {
  success: boolean
  skills: MarketSkillItem[]
  error?: string
}

export interface PublishResponse {
  success: boolean
  skill?: MarketSkillItem
  // 本次是否为覆盖更新（再次推送已有条目）；false 表示首次发布。
  replaced?: boolean
  error?: string
}

/** 市场条目的「前一代版本」元数据。 */
export interface MarketVersionItem {
  id: string
  listing_id: string
  seq: number
  display_name: string
  description: string
  short_description: string
  version: string
  tags: string[]
  content_hash: string
  intro_title?: string
  intro_author?: string
  intro_category?: string
  intro_md?: string
  status: MarketStatus
  published_by: string | null
  published_at: string | null
  created_at: string | null
}

export interface MarketVersionListResponse {
  success: boolean
  versions: MarketVersionItem[]
  error?: string
}

/** 前一代版本完整详情（与市场详情同构，便于复用渲染）。 */
export interface MarketVersionDetail {
  success: boolean
  id: string
  config: Record<string, any>
  vibeh_content: string
  store_path: string
  listing: MarketSkillItem | null
  error?: string
}

export interface ReviewResponse {
  success: boolean
  skill?: MarketSkillItem
  error?: string
}

export interface AcquireResponse {
  success: boolean
  skill?: NativeSkillItem
  error?: string
}

export interface SimpleOkResponse {
  success: boolean
  error?: string
}

const EMPTY_LIST: MarketListResponse = { success: true, skills: [] }

/** 市场页：审核通过、全体可见的 Skill 快照。 */
export async function listMarket(): Promise<MarketListResponse> {
  if (DEV_SKIP_AUTH) return EMPTY_LIST
  const { data } = await apiClient.get<MarketListResponse>('/market')
  return data
}

/** 我的发布（含待审核 / 已拒绝）。 */
export async function listMine(): Promise<MarketListResponse> {
  if (DEV_SKIP_AUTH) return EMPTY_LIST
  const { data } = await apiClient.get<MarketListResponse>('/market/mine')
  return data
}

/** 审核队列（仅审核员可访问）。 */
export async function listPending(): Promise<MarketListResponse> {
  if (DEV_SKIP_AUTH) return EMPTY_LIST
  const { data } = await apiClient.get<MarketListResponse>('/market/pending')
  return data
}

/** 把个人 / 团队 Skill 发布为市场快照（介绍页信息取自 Skill 自身 config.intro）。 */
export async function publishSkillToMarket(
  skillId: string,
): Promise<PublishResponse> {
  if (DEV_SKIP_AUTH) return { success: true }
  const { data } = await apiClient.post<PublishResponse>('/market/publish', {
    skill_id: skillId,
  })
  return data
}

/** 获取市场条目完整详情（只读「SKILL 介绍」页）。 */
export async function getMarketSkillDetail(
  marketId: string,
): Promise<MarketSkillDetail> {
  const { data } = await apiClient.get<MarketSkillDetail>(`/market/${marketId}`)
  return data
}

/** 读取市场快照中的单个资源文件内容。 */
export async function readMarketResourceFile(
  marketId: string,
  path: string,
): Promise<MarketResourceFileResponse> {
  const { data } = await apiClient.get<MarketResourceFileResponse>(
    `/market/${marketId}/resource-file`,
    { params: { path } },
  )
  return data
}

/** 列出某市场条目的全部「前一代版本」（按 seq 倒序）。 */
export async function listMarketSkillVersions(
  marketId: string,
): Promise<MarketVersionListResponse> {
  const { data } = await apiClient.get<MarketVersionListResponse>(
    `/market/${marketId}/versions`,
  )
  return data
}

/** 获取某前一代版本完整详情（归档快照 config / 正文 / 资源 + 版本元数据）。 */
export async function getMarketSkillVersionDetail(
  marketId: string,
  versionId: string,
): Promise<MarketVersionDetail> {
  const { data } = await apiClient.get<MarketVersionDetail>(
    `/market/${marketId}/versions/${versionId}`,
  )
  return data
}

/** 读取某前一代版本归档快照中的单个资源文件内容。 */
export async function readMarketVersionResourceFile(
  marketId: string,
  versionId: string,
  path: string,
): Promise<MarketResourceFileResponse> {
  const { data } = await apiClient.get<MarketResourceFileResponse>(
    `/market/${marketId}/versions/${versionId}/resource-file`,
    { params: { path } },
  )
  return data
}

export interface IntroUpdatePayload {
  intro_title: string
  intro_author: string
  intro_category: string
  intro_md: string
}

export interface IntroUpdateResponse {
  success: boolean
  skill?: MarketSkillItem
  error?: string
}

/** 修改市场条目「介绍页」（审核员或发布者本人）。 */
export async function updateMarketSkillIntro(
  marketId: string,
  payload: IntroUpdatePayload,
): Promise<IntroUpdateResponse> {
  const { data } = await apiClient.put<IntroUpdateResponse>(
    `/market/${marketId}/intro`,
    payload,
  )
  return data
}

export async function approveMarketSkill(marketId: string): Promise<ReviewResponse> {
  const { data } = await apiClient.post<ReviewResponse>(`/market/${marketId}/approve`)
  return data
}

export async function rejectMarketSkill(
  marketId: string,
  note = '',
): Promise<ReviewResponse> {
  const { data } = await apiClient.post<ReviewResponse>(`/market/${marketId}/reject`, {
    note,
  })
  return data
}

/** 获取：把市场快照复制一份到自己的个人仓库。 */
export async function acquireMarketSkill(marketId: string): Promise<AcquireResponse> {
  const { data } = await apiClient.post<AcquireResponse>(`/market/${marketId}/acquire`)
  return data
}

/** 删除 / 撤回市场条目（发布者本人或审核员）。 */
export async function removeMarketSkill(marketId: string): Promise<SimpleOkResponse> {
  const { data } = await apiClient.delete<SimpleOkResponse>(`/market/${marketId}`)
  return data
}

// =========================================================================
// 平台管理员管理（仅种子用户）
// =========================================================================

export interface PlatformAdminItem {
  id: string
  username: string
  display_name: string
  is_seed_user: boolean
}

export interface PlatformAdminListResponse {
  success: boolean
  admins: PlatformAdminItem[]
  error?: string
}

export interface GrantAdminResponse {
  success: boolean
  admin?: PlatformAdminItem
  error?: string
}

export async function listPlatformAdmins(): Promise<PlatformAdminListResponse> {
  if (DEV_SKIP_AUTH) return { success: true, admins: [] }
  const { data } = await apiClient.get<PlatformAdminListResponse>('/admin/platform-admins')
  return data
}

export async function grantPlatformAdmin(username: string): Promise<GrantAdminResponse> {
  const { data } = await apiClient.post<GrantAdminResponse>('/admin/platform-admins', {
    username,
  })
  return data
}

export async function revokePlatformAdmin(userId: string): Promise<SimpleOkResponse> {
  const { data } = await apiClient.delete<SimpleOkResponse>(
    `/admin/platform-admins/${userId}`,
  )
  return data
}
