<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'

const router = useRouter()
const authStore = useAuthStore()

const mode = ref<'login' | 'register'>('login')
const username = ref('')
const password = ref('')
const confirmPassword = ref('')
const inviteCode = ref('')
const loading = ref(false)
const error = ref('')

function switchMode(target: 'login' | 'register') {
  mode.value = target
  error.value = ''
}

async function handleSubmit() {
  if (!username.value || !password.value) {
    error.value = '请输入用户名和密码'
    return
  }
  if (mode.value === 'register') {
    if (!inviteCode.value.trim()) {
      error.value = '请输入邀请码'
      return
    }
    if (password.value !== confirmPassword.value) {
      error.value = '两次输入的密码不一致'
      return
    }
  }
  loading.value = true
  error.value = ''
  const res =
    mode.value === 'login'
      ? await authStore.doLogin(username.value, password.value)
      : await authStore.doRegister(
          username.value,
          password.value,
          inviteCode.value.trim(),
        )
  loading.value = false
  if (res.success) {
    localStorage.setItem('vibebara_user_id', authStore.user?.id || '')
    router.push('/')
  } else {
    error.value = res.error || (mode.value === 'login' ? '登录失败' : '注册失败')
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-header">
        <h1>Vibebara</h1>
        <p>团队 Skill 协作平台</p>
      </div>

      <div class="mode-tabs">
        <button
          type="button"
          :class="{ active: mode === 'login' }"
          @click="switchMode('login')"
        >
          登录
        </button>
        <button
          type="button"
          :class="{ active: mode === 'register' }"
          @click="switchMode('register')"
        >
          注册
        </button>
      </div>

      <form class="login-form" @submit.prevent="handleSubmit">
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
            :placeholder="mode === 'register' ? '设置密码' : '输入密码'"
            :autocomplete="mode === 'register' ? 'new-password' : 'current-password'"
          />
        </div>

        <template v-if="mode === 'register'">
          <div class="field">
            <label>确认密码</label>
            <input
              v-model="confirmPassword"
              type="password"
              placeholder="再次输入密码"
              autocomplete="new-password"
            />
          </div>

          <div class="field">
            <label>邀请码</label>
            <input
              v-model="inviteCode"
              type="text"
              placeholder="VH-XXXX-XXXX"
              autocomplete="off"
              spellcheck="false"
            />
          </div>
        </template>

        <div v-if="error" class="error-msg">{{ error }}</div>

        <button type="submit" class="btn-login" :disabled="loading">
          {{
            loading
              ? mode === 'login' ? '登录中...' : '注册中...'
              : mode === 'login' ? '登 录' : '注 册'
          }}
        </button>
      </form>

      <div class="login-footer">
        <span v-if="mode === 'register'">注册需要邀请码，请联系管理员获取</span>
        <span v-else>测试版 · 没有账号？切换到「注册」并填写邀请码</span>
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

.mode-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 24px;
  background: #262636;
  border-radius: 10px;
  padding: 4px;
}

.mode-tabs button {
  flex: 1;
  padding: 9px 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #888;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}

.mode-tabs button.active {
  background: linear-gradient(135deg, #5b7fff, #8b5cf6);
  color: #fff;
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
