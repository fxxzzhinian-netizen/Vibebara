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

export interface CaptchaChallenge {
  success: boolean
  captcha_id: string
  bg: string
  piece: string
  piece_y: number
  bg_width: number
  bg_height: number
  piece_width: number
  piece_height: number
  error?: string
}

export interface CaptchaVerifyResponse {
  success: boolean
  captcha_token: string
  error?: string
}

export async function getCaptcha(): Promise<CaptchaChallenge> {
  const { data } = await apiClient.get<CaptchaChallenge>('/auth/captcha')
  return data
}

export async function verifyCaptcha(
  captchaId: string,
  x: number,
): Promise<CaptchaVerifyResponse> {
  const { data } = await apiClient.post<CaptchaVerifyResponse>(
    '/auth/captcha/verify',
    { captcha_id: captchaId, x },
  )
  return data
}

export async function register(
  username: string,
  password: string,
  inviteCode: string,
  captchaToken: string,
  display_name?: string,
  email?: string,
): Promise<TokenResponse> {
  const { data } = await apiClient.post<TokenResponse>('/auth/register', {
    username,
    password,
    invite_code: inviteCode,
    captcha_token: captchaToken,
    display_name: display_name ?? '',
    email: email ?? null,
  })
  return data
}

export async function login(
  username: string,
  password: string,
  captchaToken: string,
): Promise<TokenResponse> {
  const { data } = await apiClient.post<TokenResponse>('/auth/login', {
    username,
    password,
    captcha_token: captchaToken,
  })
  return data
}

export async function getMe(): Promise<UserResponse> {
  const { data } = await apiClient.get<UserResponse>('/auth/me')
  return data
}
