<script setup lang="ts">
import logoUrl from '@/img/logo_icon.png'

// textOnly：仅展示滚动文字（隐藏大 logo），用于副标题等内联场景
// prefix：在 loading 前追加说明文案（如「正在检测本机工具」）
withDefaults(defineProps<{ textOnly?: boolean; prefix?: string }>(), {
  textOnly: false,
  prefix: '',
})

// 当前已兼容的 Vibe Coding 工具（与 Onboarding 的 PLATFORM_TOOLS 一致）
const TOOLS = ['Cursor', 'Codex', 'Windsurf', 'Claude Code', 'Kiro', 'Trae', 'Qoder']
// 末尾重复首项，循环回绕时无缝衔接
const cycleWords = [...TOOLS, TOOLS[0]]
</script>

<template>
  <div class="app-loader" :class="{ 'text-only': textOnly }" role="status" aria-live="polite">
    <img class="loader-logo" :src="logoUrl" alt="" />

    <div class="loader">
      <!-- loading 固定不动，仅右侧工具名循环上滚 -->
      <span v-if="prefix" class="loader-prefix">{{ prefix }}</span>
      <span class="pre">loading</span>
      <div class="words">
        <span v-for="(w, i) in cycleWords" :key="i" class="word">{{ w }}...</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-loader {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 30px;
  width: 100%;
}

.loader-logo {
  height: 176px;
  width: auto;
  display: block;
}

/* 纯文字模式：隐藏大 logo、去偏移、缩小字号，适配内联/副标题场景 */
.app-loader.text-only {
  gap: 0;
}

.app-loader.text-only .loader-logo {
  display: none;
}

.app-loader.text-only .loader {
  font-size: 18px;
  height: 28px;
  transform: none;
}

.app-loader.text-only .loader-prefix,
.app-loader.text-only .pre {
  line-height: 28px;
}

.app-loader.text-only .words {
  height: 28px;
}

.app-loader.text-only .word {
  height: 28px;
  line-height: 28px;
}

.loader {
  display: flex;
  align-items: center;
  font-family: 'Poppins', sans-serif;
  font-weight: 500;
  font-size: 32px;
  height: 44px;
  /* 整体右移，让可见短语在 logo 下方更居中 */
  transform: translateX(60px);
}

/* 前缀说明（如「正在检测本机工具」）：与 loading 之间留较大间距 */
.loader-prefix {
  color: #4a4a4a;
  margin-right: 16px;
  line-height: 44px;
}

.pre {
  color: #4a4a4a;
  line-height: 44px;
}

.words {
  overflow: hidden;
  height: 44px;
}

.word {
  display: block;
  height: 44px;
  line-height: 44px;
  padding-left: 10px;
  /* 父级 .stage-head 为居中对齐，会让较短工具名在块内居中而显得离 loading 很远，
     这里强制左对齐，使工具名始终紧贴 loading */
  text-align: left;
  color: #299fff;
  white-space: nowrap;
  animation: cycle-words 8s infinite;
}

/* 7 个工具依次上滚（每步 -100%），末尾回到首项无缝循环 */
@keyframes cycle-words {
  5.71% {
    transform: translateY(-105%);
  }
  14.29% {
    transform: translateY(-100%);
  }
  20% {
    transform: translateY(-205%);
  }
  28.57% {
    transform: translateY(-200%);
  }
  34.29% {
    transform: translateY(-305%);
  }
  42.86% {
    transform: translateY(-300%);
  }
  48.57% {
    transform: translateY(-405%);
  }
  57.14% {
    transform: translateY(-400%);
  }
  62.86% {
    transform: translateY(-505%);
  }
  71.43% {
    transform: translateY(-500%);
  }
  77.14% {
    transform: translateY(-605%);
  }
  85.71% {
    transform: translateY(-600%);
  }
  91.43% {
    transform: translateY(-705%);
  }
  100% {
    transform: translateY(-700%);
  }
}
</style>
