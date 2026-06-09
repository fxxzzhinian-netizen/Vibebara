import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

// 注意（M4 前端分流）：
// 下面的 server.proxy 仅在 **本地开发（vite dev）** 生效，用于把同源的 `/api`、`/ws`
// 转发到本地后端，避免 dev 跨域。**打包后（vite build）此配置不参与运行**——生产/桌面
// 形态下，云端 API/WS 地址、本地代理地址与配对令牌一律由运行时配置 src/runtime/config.ts
// 决定（web 灰度走 VITE_* 或默认；M5 桌面壳通过 window.__VIBEBARA_RUNTIME__ 注入真实值）。
// 本地代理（127.0.0.1:PORT）不经过此代理，由 localAgentClient 直连。
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.VITE_DEV_API_PROXY || 'http://127.0.0.1:8000'
  const wsTarget = env.VITE_DEV_WS_PROXY || 'ws://127.0.0.1:8000'
  return {
    base: './',
    plugins: [vue()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
    server: {
      port: 5173,
      proxy: {
        // 仅开发用：转发云端 REST。打包后由 runtimeConfig.cloudApiBase 取代。
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
        // 仅开发用：转发云端 WS。打包后由 runtimeConfig.cloudWsBase 取代。
        '/ws': {
          target: wsTarget,
          ws: true,
        },
      },
    },
  }
})
