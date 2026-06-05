import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useAuthStore } from './stores/authStore'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)

const authStore = useAuthStore()
// 启动恢复会话（fetchMe）需要网络；但首屏不应被慢/挂起的云端阻塞，否则表现为白屏“进不去”。
// 以 init 完成或封顶等待（取先到者）触发挂载：路由守卫只依赖同步 token，登录页能尽快可见。
const MOUNT_WAIT_MS = 6000
Promise.race([
  authStore.init(),
  new Promise<void>((resolve) => setTimeout(resolve, MOUNT_WAIT_MS)),
]).finally(() => {
  app.mount('#app')
})
