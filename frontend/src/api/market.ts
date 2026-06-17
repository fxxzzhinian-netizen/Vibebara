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

/** 把个人 / 团队 Skill 发布为市场快照。 */
export async function publishSkillToMarket(skillId: string): Promise<PublishResponse> {
  if (DEV_SKIP_AUTH) return { success: true }
  const { data } = await apiClient.post<PublishResponse>('/market/publish', {
    skill_id: skillId,
  })
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
