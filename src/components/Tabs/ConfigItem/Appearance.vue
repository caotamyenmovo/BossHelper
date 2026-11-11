<script lang="ts" setup>
import { computed } from 'vue'

import { appearanceConf, appearanceDefaults } from '@/composables/conf'

type NumberSetting = 'contentWidth' | 'contentOffset' | 'chatBoxWidth' | 'tableHeight'
function boundedNumber(key: NumberSetting, min: number, max: number) {
  return computed({
    get: () => appearanceConf.value[key],
    set: (value: number | null | undefined) => {
      if (typeof value === 'number' && Number.isFinite(value))
        appearanceConf.value[key] = Math.min(max, Math.max(min, value))
    },
  })
}
const contentWidth = boundedNumber('contentWidth', 600, 5000)
const contentOffset = boundedNumber('contentOffset', 0, 30)
const chatBoxWidth = boundedNumber('chatBoxWidth', 200, 1500)
const tableHeight = boundedNumber('tableHeight', 30, 500)
const offsetEnabled = computed({
  get: () => appearanceConf.value.contentOffsetEnabled ?? appearanceConf.value.contentOffset !== 25,
  set: (value: boolean | 'indeterminate') => {
    appearanceConf.value.contentOffsetEnabled = value === true
  },
})
function resetAppearance() {
  appearanceConf.value = { ...appearanceDefaults }
}
</script>

<template>
  <div class="appearance-settings flex flex-col gap-4 py-2">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-xs text-muted">调整后自动保存并生效；刷新页面后仍保留。</p>
      <UButton
        label="恢复默认外观"
        color="neutral"
        variant="outline"
        size="xs"
        @click="resetAppearance"
      />
    </div>
    <div class="flex flex-wrap gap-x-5 gap-y-3">
      <UCheckbox v-model="appearanceConf.hideHeader" label="隐藏 Boss 顶部导航" />
      <UCheckbox v-model="appearanceConf.changeIcon" label="使用计算器图标" />
      <UCheckbox v-model="appearanceConf.dynamicTitle" label="显示投递进度标题" />
      <UCheckbox v-model="appearanceConf.blurCard" label="模糊岗位卡片" />
      <UCheckbox v-model="appearanceConf.listSink" label="增加底部间距" />
    </div>
    <p class="text-xs text-muted">
      图标与标题关闭后恢复原样。卡片模糊仅用于卡片视图：鼠标附近清晰，键盘聚焦时完整显示，触屏保持清晰。底部间距开启后为
      300px。
    </p>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <UFormField label="岗位展示">
        <USelect
          v-model="appearanceConf.jobView"
          :items="[
            { label: '横向卡片', value: 'cards' },
            { label: '虚拟化表格', value: 'table' },
          ]"
          class="w-full"
          aria-label="岗位展示"
        />
      </UFormField>
      <UFormField
        v-if="appearanceConf.jobView === 'table'"
        label="表格高度（×10px）"
        description="30–500，即 300–5000px。"
      >
        <UInputNumber
          v-model="tableHeight"
          :step="1"
          :min="30"
          :max="500"
          size="sm"
          class="w-full"
          aria-label="表格高度"
        />
      </UFormField>
      <UFormField label="面板宽度（px）" description="600–5000px，超出窗口时自动适配。">
        <UInputNumber
          v-model="contentWidth"
          :step="10"
          :min="600"
          :max="5000"
          size="sm"
          class="w-full"
          aria-label="面板宽度"
        />
      </UFormField>
      <div class="flex flex-col gap-2">
        <UCheckbox v-model="offsetEnabled" label="启用内容偏移" />
        <UFormField
          v-if="offsetEnabled"
          label="内容偏移（%）"
          description="从侧栏相反一侧留出空间，0–30%；关闭后居中。"
        >
          <UInputNumber
            v-model="contentOffset"
            :step="0.5"
            :min="0"
            :max="30"
            size="sm"
            class="w-full"
            aria-label="内容偏移"
          />
        </UFormField>
      </div>
    </div>
    <div class="border-t border-default pt-3 flex flex-col gap-3">
      <p class="text-sm font-medium">AI 记录侧栏</p>
      <div class="flex flex-wrap gap-5">
        <UCheckbox v-model="appearanceConf.leftChat" label="侧栏显示在左侧" />
        <UCheckbox v-model="appearanceConf.defaultShowChatBox" label="默认打开 AI 记录" />
      </div>
      <p class="text-xs text-muted">
        默认打开开关立即控制侧栏显示，后续进入页面时也会沿用；不触发 AI 调用。
      </p>
      <UFormField
        label="侧栏宽度（px）"
        description="200–1500px，窄窗口下自动缩小，关闭后重新打开仍生效。"
      >
        <UInputNumber
          v-model="chatBoxWidth"
          :step="10"
          :min="200"
          :max="1500"
          size="sm"
          class="w-full sm:max-w-sm"
          aria-label="侧栏宽度"
        />
      </UFormField>
    </div>
  </div>
</template>
