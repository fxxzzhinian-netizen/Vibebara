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
  // 介绍页信息（发布时填写，可 AI 辅助生成）
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

/** 发布表单填写的介绍页信息（提交发布时携带）。 */
export interface MarketIntroPayload {
  intro_title?: string
  intro_author?: string
  intro_category?: string
  intro_md?: string
  short_description?: string
  description?: string
}

/** AI 辅助生成的介绍页草稿。 */
export interface MarketIntroDraft {
  title: string
  category: string
  short_description: string
  intro_md: string
}

export interface IntroDraftResponse {
  success: boolean
  draft?: MarketIntroDraft
  error?: string
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

/** 把个人 / 团队 Skill 发布为市场快照，携带发布表单填写的介绍页信息。 */
export async function publishSkillToMarket(
  skillId: string,
  intro: MarketIntroPayload = {},
): Promise<PublishResponse> {
  if (DEV_SKIP_AUTH) return { success: true }
  const { data } = await apiClient.post<PublishResponse>('/market/publish', {
    skill_id: skillId,
    ...intro,
  })
  return data
}

/** 发布表单「AI 辅助生成」：根据源 Skill 内容生成介绍页草稿（不落库）。 */
export async function generateMarketIntroDraft(
  skillId: string,
): Promise<IntroDraftResponse> {
  const { data } = await apiClient.post<IntroDraftResponse>('/market/intro/generate', {
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
