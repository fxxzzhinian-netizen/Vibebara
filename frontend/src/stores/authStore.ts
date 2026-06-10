import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  register,
  login,
  getMe,
  type UserInfo,
} from '@/api/auth'
import { ensureDeviceRegistered } from '@/api/devices'
import { getToken, setToken, removeToken } from '@/runtime/tokenStorage'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(getToken())
  const user = ref<UserInfo | null>(null)
  const loading = ref(false)
  const error = ref('')

  const isLoggedIn = computed(() => !!token.value && !!user.value)

  async function doRegister(
    username: string,
    password: string,
    inviteCode: string,
    captchaToken: string,
    displayName?: string,
  ) {
    loading.value = true
    error.value = ''
    try {
      const res = await register(
        username,
        password,
        inviteCode,
        captchaToken,
        displayName,
      )
      if (res.success) {
        token.value = res.token
        setToken(res.token)
        await fetchMe()
        // M5-b：桌面形态下登录成功后注册设备身份（web 形态安全跳过）。
        void ensureDeviceRegistered()
      } else {
        error.value = res.error || '注册失败'
      }
      return res
    } catch (e: any) {
      error.value = e?.response?.data?.detail || e.message
      return { success: false, error: error.value } as any
    } finally {
      loading.value = false
    }
  }

  async function doLogin(
    username: string,
    password: string,
    captchaToken: string,
  ) {
    loading.value = true
    error.value = ''
    try {
      const res = await login(username, password, captchaToken)
      if (res.success) {
        token.value = res.token
        setToken(res.token)
        await fetchMe()
        // M5-b：桌面形态下登录成功后注册设备身份（web 形态安全跳过）。
        void ensureDeviceRegistered()
      } else {
        error.value = res.error || '登录失败'
      }
      return res
    } catch (e: any) {
      error.value = e?.response?.data?.detail || e.message
      return { success: false, error: error.value } as any
    } finally {
      loading.value = false
    }
  }

  async function fetchMe() {
    if (!token.value) return
    try {
      const res = await getMe()
      if (res.success && res.user) {
        user.value = res.user
      }
    } catch {
      logout()
    }
  }

  function logout() {
    token.value = ''
    user.value = null
    removeToken()
  }

  async function init() {
    if (token.value) {
      await fetchMe()
      // M5-b：已登录会话恢复时也确保设备已注册（幂等，桌面形态有效）。
      if (user.value) {
        void ensureDeviceRegistered()
      }
    }
  }

  return {
    token,
    user,
    loading,
    error,
    isLoggedIn,
    doRegister,
    doLogin,
    fetchMe,
    logout,
    init,
  }
})
