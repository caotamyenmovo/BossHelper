import ui from '@nuxt/ui/vue-plugin'
import { createApp } from 'vue'

import { initExtensionCounter } from '@/message'

import './theme'

async function main() {
  initExtensionCounter()
  const { default: App } = await import('./App.vue')
  createApp(App).use(ui).mount('#app')
}

void main().catch((error) => {
  console.error('Options initialization failed', error)
  const root = document.getElementById('app')
  if (root) root.textContent = `设置页面启动失败：${String(error)}`
})
