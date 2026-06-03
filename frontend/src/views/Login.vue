<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'

const router = useRouter()
const authStore = useAuthStore()

const username = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

async function handleLogin() {
  if (!username.value || !password.value) {
    error.value = '请输入用户名和密码'
    return
  }
  loading.value = true
  error.value = ''
  const res = await authStore.doLogin(username.value, password.value)
  loading.value = false
  if (res.success) {
    localStorage.setItem('vibehub_user_id', authStore.user?.id || '')
    router.push('/')
  } else {
    error.value = res.error || '登录失败'
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-header">
        <h1>VibeHub</h1>
        <p>团队 Skill 协作平台</p>
      </div>

      <form class="login-form" @submit.prevent="handleLogin">
        <div class="field">
          <label>用户名</label>
          <input
            v-model="username"
            type="text"
            placeholder="输入用户名"
            autocomplete="username"
          />
        </div>

        <div class="field">
          <label>密码</label>
          <input
            v-model="password"
            type="password"
            placeholder="输入密码"
            autocomplete="current-password"
          />
        </div>

        <div v-if="error" class="error-msg">{{ error }}</div>

        <button type="submit" class="btn-login" :disabled="loading">
          {{ loading ? '登录中...' : '登 录' }}
        </button>
      </form>

      <div class="login-footer">
        <span>预设账号: DAIL / DAIL2026 或 DAIL2 / DAIL2027</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
}

.login-card {
  width: 400px;
  background: #1e1e2e;
  border-radius: 16px;
  padding: 48px 40px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  border: 1px solid #2a2a3e;
}

.login-header {
  text-align: center;
  margin-bottom: 36px;
}

.login-header h1 {
  font-size: 28px;
  color: #e0e0e0;
  margin: 0 0 8px;
  font-weight: 700;
  letter-spacing: 1px;
}

.login-header p {
  color: #888;
  font-size: 14px;
  margin: 0;
}

.login-form .field {
  margin-bottom: 20px;
}

.login-form label {
  display: block;
  font-size: 13px;
  color: #aaa;
  margin-bottom: 6px;
  font-weight: 500;
}

.login-form input {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid #333;
  border-radius: 8px;
  background: #262636;
  color: #e0e0e0;
  font-size: 15px;
  outline: none;
  transition: border-color 0.2s;
  box-sizing: border-box;
}

.login-form input:focus {
  border-color: #5b7fff;
}

.error-msg {
  color: #ff6b6b;
  font-size: 13px;
  margin-bottom: 16px;
  text-align: center;
}

.btn-login {
  width: 100%;
  padding: 13px;
  border: none;
  border-radius: 8px;
  background: linear-gradient(135deg, #5b7fff, #8b5cf6);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}

.btn-login:hover:not(:disabled) {
  opacity: 0.9;
}

.btn-login:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.login-footer {
  margin-top: 24px;
  text-align: center;
  font-size: 12px;
  color: #666;
}
</style>
