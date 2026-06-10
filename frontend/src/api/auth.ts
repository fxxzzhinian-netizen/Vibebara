import apiClient from './client'

export interface TokenResponse {
  success: boolean
  token: string
  user_id: string
  username: string
  error?: string
}

export interface UserInfo {
  id: string
  username: string
  display_name: string
  email: string | null
  avatar_url: string | null
  created_at: string | null
}

export interface UserResponse {
  success: boolean
  user?: UserInfo
  error?: string
}

export async function register(
  username: string,
  password: string,
  inviteCode: string,
  display_name?: string,
  email?: string,
): Promise<TokenResponse> {
  const { data } = await apiClient.post<TokenResponse>('/auth/register', {
    username,
    password,
    invite_code: inviteCode,
    display_name: display_name ?? '',
    email: email ?? null,
  })
  return data
}

export async function login(
  username: string,
  password: string,
): Promise<TokenResponse> {
  const { data } = await apiClient.post<TokenResponse>('/auth/login', {
    username,
    password,
  })
  return data
}

export async function getMe(): Promise<UserResponse> {
  const { data } = await apiClient.get<UserResponse>('/auth/me')
  return data
}
