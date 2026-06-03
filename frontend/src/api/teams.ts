import apiClient from './client'

export interface TeamInfo {
  id: string
  name: string
  description: string
  owner_id: string
  invite_code: string
  max_members: number
  member_count: number
  auto_skill_hot_update: boolean
  created_at: string | null
  updated_at: string | null
}

export interface TeamMemberInfo {
  user_id: string
  username: string
  display_name: string
  role: string
  joined_at: string | null
}

export interface TeamResponse {
  success: boolean
  team?: TeamInfo
  error?: string
}

export interface TeamListResponse {
  success: boolean
  teams: TeamInfo[]
  error?: string
}

export interface MemberListResponse {
  success: boolean
  members: TeamMemberInfo[]
  error?: string
}

export async function createTeam(
  name: string,
  description: string = '',
): Promise<TeamResponse> {
  const { data } = await apiClient.post<TeamResponse>('/teams', {
    name,
    description,
  })
  return data
}

export async function listTeams(): Promise<TeamListResponse> {
  const { data } = await apiClient.get<TeamListResponse>('/teams')
  return data
}

export async function getTeam(teamId: string): Promise<TeamResponse> {
  const { data } = await apiClient.get<TeamResponse>(`/teams/${teamId}`)
  return data
}

export async function updateTeam(
  teamId: string,
  name?: string,
  description?: string,
): Promise<TeamResponse> {
  const { data } = await apiClient.put<TeamResponse>(`/teams/${teamId}`, {
    name: name ?? null,
    description: description ?? null,
  })
  return data
}

export async function updateTeamSettings(
  teamId: string,
  autoSkillHotUpdate: boolean,
): Promise<TeamResponse> {
  const { data } = await apiClient.patch<TeamResponse>(`/teams/${teamId}/settings`, {
    auto_skill_hot_update: autoSkillHotUpdate,
  })
  return data
}

export async function deleteTeam(
  teamId: string,
): Promise<{ success: boolean }> {
  const { data } = await apiClient.delete<{ success: boolean }>(
    `/teams/${teamId}`,
  )
  return data
}

export async function regenerateInvite(
  teamId: string,
): Promise<{ success: boolean; invite_code: string }> {
  const { data } = await apiClient.post(`/teams/${teamId}/invite`)
  return data as { success: boolean; invite_code: string }
}

export async function joinTeam(
  inviteCode: string,
): Promise<TeamResponse> {
  const { data } = await apiClient.post<TeamResponse>('/teams/join', {
    invite_code: inviteCode,
  })
  return data
}

export async function listMembers(
  teamId: string,
): Promise<MemberListResponse> {
  const { data } = await apiClient.get<MemberListResponse>(
    `/teams/${teamId}/members`,
  )
  return data
}

export async function updateMemberRole(
  teamId: string,
  userId: string,
  role: string,
): Promise<{ success: boolean }> {
  const { data } = await apiClient.put(`/teams/${teamId}/members/${userId}`, {
    role,
  })
  return data as { success: boolean }
}

export async function removeMember(
  teamId: string,
  userId: string,
): Promise<{ success: boolean }> {
  const { data } = await apiClient.delete(
    `/teams/${teamId}/members/${userId}`,
  )
  return data as { success: boolean }
}
