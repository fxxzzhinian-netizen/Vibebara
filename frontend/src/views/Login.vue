<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import SliderCaptcha from '@/components/SliderCaptcha.vue'
import logoUrl from '@/img/logo.png'

const router = useRouter()
const authStore = useAuthStore()

const mode = ref<'login' | 'register'>('login')
const username = ref('')
const password = ref('')
const confirmPassword = ref('')
const inviteCode = ref('')
const captchaToken = ref('')
const loading = ref(false)
const error = ref('')
const captchaRef = ref<InstanceType<typeof SliderCaptcha> | null>(null)

function switchMode(target: 'login' | 'register') {
  if (mode.value === target) return
  mode.value = target
  error.value = ''
  resetCaptcha()
}

function resetCaptcha() {
  captchaToken.value = ''
  captchaRef.value?.reset()
}

function onCaptchaVerified(token: string) {
  captchaToken.value = token
  if (error.value === '请先完成滑块验证') error.value = ''
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
  if (!captchaToken.value) {
    error.value = '请先完成滑块验证'
    return
  }
  loading.value = true
  error.value = ''
  const res =
    mode.value === 'login'
      ? await authStore.doLogin(username.value, password.value, captchaToken.value)
      : await authStore.doRegister(
          username.value,
          password.value,
          inviteCode.value.trim(),
          captchaToken.value,
        )
  loading.value = false
  if (res.success) {
    localStorage.setItem('vibebara_user_id', authStore.user?.id || '')
    router.push('/')
  } else {
    error.value = res.error || (mode.value === 'login' ? '登录失败' : '注册失败')
    // 验证 token 已被服务端消费（一次性），失败后需重新验证
    resetCaptcha()
  }
}
</script>

<template>
  <div class="login-page">
    <form class="form" @submit.prevent="handleSubmit">
      <img class="form-logo" :src="logoUrl" alt="vibebara" draggable="false" />

      <div class="form-head">
        <h2>{{ mode === 'login' ? '欢迎回来' : '创建账号' }}</h2>
        <p>
          {{
            mode === 'login'
              ? '登录以继续使用 Vibebara'
              : '测试版需要邀请码，请联系管理员获取'
          }}
        </p>
      </div>

      <div class="flex-column">
        <label for="login-username">用户名</label>
      </div>
      <div class="inputForm">
        <svg height="20" viewBox="0 0 16 16" width="20" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M6 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6m-5 6s-1 0-1-1 1-4 6-4 6 3 6 4-1 1-1 1zM11 3.5a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 0 1h-4a.5.5 0 0 1-.5-.5m.5 2.5a.5.5 0 0 0 0 1h4a.5.5 0 0 0 0-1zm2 3a.5.5 0 0 0 0 1h2a.5.5 0 0 0 0-1zm0 3a.5.5 0 0 0 0 1h2a.5.5 0 0 0 0-1z"
          ></path>
        </svg>
        <input
          id="login-username"
          v-model="username"
          type="text"
          class="input"
          placeholder="输入用户名"
          autocomplete="username"
          spellcheck="false"
        />
      </div>

      <div class="flex-column">
        <label for="login-password">密码</label>
      </div>
      <div class="inputForm">
        <svg height="20" viewBox="-64 0 512 512" width="20" xmlns="http://www.w3.org/2000/svg">
          <path
            d="m336 512h-288c-26.453125 0-48-21.523438-48-48v-224c0-26.476562 21.546875-48 48-48h288c26.453125 0 48 21.523438 48 48v224c0 26.476562-21.546875 48-48 48zm-288-288c-8.8125 0-16 7.167969-16 16v224c0 8.832031 7.1875 16 16 16h288c8.8125 0 16-7.167969 16-16v-224c0-8.832031-7.1875-16-16-16zm0 0"
          ></path>
          <path
            d="m304 224c-8.832031 0-16-7.167969-16-16v-80c0-52.929688-43.070312-96-96-96s-96 43.070312-96 96v80c0 8.832031-7.167969 16-16 16s-16-7.167969-16-16v-80c0-70.59375 57.40625-128 128-128s128 57.40625 128 128v80c0 8.832031-7.167969 16-16 16zm0 0"
          ></path>
        </svg>
        <input
          id="login-password"
          v-model="password"
          type="password"
          class="input"
          :placeholder="mode === 'register' ? '设置密码' : '输入密码'"
          :autocomplete="mode === 'register' ? 'new-password' : 'current-password'"
        />
      </div>

      <template v-if="mode === 'register'">
        <div class="flex-column">
          <label for="login-confirm">确认密码</label>
        </div>
        <div class="inputForm">
          <svg height="20" viewBox="-64 0 512 512" width="20" xmlns="http://www.w3.org/2000/svg">
            <path
              d="m336 512h-288c-26.453125 0-48-21.523438-48-48v-224c0-26.476562 21.546875-48 48-48h288c26.453125 0 48 21.523438 48 48v224c0 26.476562-21.546875 48-48 48zm-288-288c-8.8125 0-16 7.167969-16 16v224c0 8.832031 7.1875 16 16 16h288c8.8125 0 16-7.167969 16-16v-224c0-8.832031-7.1875-16-16-16zm0 0"
            ></path>
            <path
              d="m304 224c-8.832031 0-16-7.167969-16-16v-80c0-52.929688-43.070312-96-96-96s-96 43.070312-96 96v80c0 8.832031-7.167969 16-16 16s-16-7.167969-16-16v-80c0-70.59375 57.40625-128 128-128s128 57.40625 128 128v80c0 8.832031-7.167969 16-16 16zm0 0"
            ></path>
          </svg>
          <input
            id="login-confirm"
            v-model="confirmPassword"
            type="password"
            class="input"
            placeholder="再次输入密码"
            autocomplete="new-password"
          />
        </div>

        <div class="flex-column">
          <label for="login-invite">邀请码</label>
        </div>
        <div class="inputForm">
          <svg height="20" viewBox="0 0 16 16" width="20" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M3.5 11.5a3.5 3.5 0 1 1 3.163-5H14L15.5 8 14 9.5l-1-1-1 1-1-1-1 1-1-1-1 1H6.663a3.5 3.5 0 0 1-3.163 2zM2.5 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"
            ></path>
          </svg>
          <input
            id="login-invite"
            v-model="inviteCode"
            type="text"
            class="input"
            placeholder="VH-XXXX-XXXX"
            autocomplete="off"
            spellcheck="false"
          />
        </div>
      </template>

      <div class="captcha-wrap">
        <SliderCaptcha ref="captchaRef" @verified="onCaptchaVerified" />
      </div>

      <div v-if="error" class="error-msg">{{ error }}</div>

      <button type="submit" class="button-submit" :disabled="loading">
        {{
          loading
            ? mode === 'login' ? '登录中…' : '注册中…'
            : mode === 'login' ? '登 录' : '注 册'
        }}
      </button>

      <p class="p">
        <template v-if="mode === 'login'">
          没有账号？<span class="span" @click="switchMode('register')">使用邀请码注册</span>
        </template>
        <template v-else>
          已有账号？<span class="span" @click="switchMode('login')">直接登录</span>
        </template>
      </p>
    </form>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #ffffff;
  padding: 24px;
  box-sizing: border-box;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  background-color: #ffffff;
  padding: 30px;
  width: 450px;
  max-width: 100%;
  border-radius: 20px;
  border: 1.5px solid #ecedec;
  box-sizing: border-box;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen,
    Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif;
}

::placeholder {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen,
    Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif;
  color: #9ca3af;
}

.form-logo {
  height: 28px;
  align-self: center;
  margin-bottom: 6px;
}

.form-head {
  text-align: center;
  margin-bottom: 8px;
}

.form-head h2 {
  font-size: 22px;
  font-weight: 650;
  color: #151717;
  margin: 0 0 6px;
}

.form-head p {
  font-size: 13.5px;
  color: #6b7280;
  margin: 0;
}

.flex-column > label {
  color: #151717;
  font-size: 14px;
  font-weight: 600;
}

.inputForm {
  border: 1.5px solid #ecedec;
  border-radius: 10px;
  height: 50px;
  display: flex;
  align-items: center;
  padding-left: 10px;
  transition: 0.2s ease-in-out;
}

.inputForm svg {
  flex: 0 0 auto;
  fill: #151717;
}

.input {
  margin-left: 10px;
  border-radius: 10px;
  border: none;
  background: transparent;
  color: #151717;
  font-size: 14.5px;
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  padding-right: 10px;
}

.input:focus {
  outline: none;
}

.inputForm:focus-within {
  border: 1.5px solid #2d79f3;
}

.captcha-wrap {
  margin-top: 4px;
}

.error-msg {
  color: #dc2626;
  font-size: 13.5px;
}

.button-submit {
  margin: 20px 0 10px 0;
  background-color: #151717;
  border: none;
  color: white;
  font-size: 15px;
  font-weight: 500;
  letter-spacing: 0.06em;
  border-radius: 10px;
  height: 50px;
  width: 100%;
  cursor: pointer;
  transition: background-color 0.2s ease-in-out;
}

.button-submit:hover:not(:disabled) {
  background-color: #252727;
}

.button-submit:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.p {
  text-align: center;
  color: black;
  font-size: 14px;
  margin: 5px 0;
}

.span {
  font-size: 14px;
  margin-left: 5px;
  color: #2d79f3;
  font-weight: 500;
  cursor: pointer;
}

.span:hover {
  text-decoration: underline;
}

/* ============ 滑块验证组件浅色适配 ============ */
:deep(.track) {
  height: 50px;
  border-radius: 10px;
  background: #fafafa;
  border: 1.5px solid #ecedec;
}

:deep(.track.is-success) {
  border-color: rgba(16, 185, 129, 0.55);
}

:deep(.track.is-fail) {
  border-color: rgba(220, 38, 38, 0.55);
}

:deep(.track-fill) {
  background: rgba(45, 121, 243, 0.12);
}

:deep(.is-success .track-fill) {
  background: rgba(16, 185, 129, 0.12);
}

:deep(.track-text) {
  color: #6b7280;
}

:deep(.is-success .track-text) {
  color: #059669;
}

:deep(.is-fail .track-text) {
  color: #dc2626;
}

:deep(.handle) {
  background: #ffffff;
  border: 1.5px solid #ecedec;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  color: #6b7280;
}

:deep(.handle:hover) {
  background: #2d79f3;
  border-color: #2d79f3;
  color: #fff;
}

:deep(.is-dragging .handle) {
  background: #2d79f3;
  border-color: #2d79f3;
  color: #fff;
}

:deep(.is-success .handle) {
  background: rgba(16, 185, 129, 0.12);
  border-color: rgba(16, 185, 129, 0.55);
  color: #059669;
}

:deep(.is-fail .handle) {
  background: rgba(220, 38, 38, 0.08);
  border-color: rgba(220, 38, 38, 0.55);
  color: #dc2626;
}

:deep(.puzzle-panel) {
  border: 1.5px solid #ecedec;
  background: #f3f4f6;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.14);
}

@media (max-width: 520px) {
  .form {
    padding: 24px 20px;
    border: none;
  }
}
</style>
