<script setup lang="ts">
import { computed } from 'vue'

import { useConf } from '@/composables/conf'
import { useHelper } from '@/composables/useHelper'
import { useJobActions } from '@/composables/useJobActions'

const props = defineProps<{ disabled?: boolean }>()
const emit = defineEmits<{ logs: [] }>()
const helper = useHelper()
const conf = useConf()
const actions = useJobActions()
const running = computed(() => helper.workflow?.status.value === 'running')
const startDisabled = computed(() => running.value || helper.jobActionBusy.value || props.disabled)
const deliveryMode = computed(() =>
  ['filter', 'generate', 'delivery'].includes(helper.workflow?.lastMode.value ?? '')
    ? 'delivery'
    : 'auto',
)
const deliveryLabel = computed(() =>
  helper.workflow?.status.value === 'stop' &&
  ['auto', 'delivery'].includes(helper.workflow?.lastMode.value ?? '')
    ? '继续投递'
    : '开始投递',
)
const filterLabel = computed(() =>
  helper.workflow?.status.value === 'stop' && helper.workflow?.lastMode.value === 'filter'
    ? '继续仅筛选'
    : '开始仅筛选',
)
const generateLabel = computed(() =>
  helper.workflow?.status.value === 'stop' && helper.workflow?.lastMode.value === 'generate'
    ? '继续仅生成'
    : '开始仅生成',
)
const failures = computed(
  () =>
    helper.jobList.value.filter((job) => helper.jobResultMaps.get(job.key)?.status === 'error')
      .length,
)
const progress = computed(() => {
  const workflow = helper.workflow
  return workflow?.total.value
    ? Math.min(100, Math.max(0, (workflow.current.value / workflow.total.value) * 100))
    : 0
})
</script>

<template>
  <section class="delivery-controls" aria-label="投递控制">
    <div class="delivery-action-row">
      <span class="delivery-state" role="status"
        ><span class="status-dot" :class="{ running }" />{{
          running
            ? '正在处理'
            : helper.workflow?.status.value === 'stop'
              ? '已暂停'
              : helper.workflow?.status.value === 'error'
                ? '处理出错'
                : '等待开始'
        }}</span
      >
      <div class="delivery-actions">
        <UButton
          v-if="running"
          label="暂停"
          icon="i-lucide-pause"
          color="warning"
          variant="solid"
          @click="helper.stop()"
        />
        <UButton
          v-else
          :label="deliveryLabel"
          icon="i-lucide-play"
          variant="solid"
          :disabled="startDisabled"
          :data-help="
            deliveryMode === 'delivery' ? '仅投递现有 ready 队列中的岗位' : '筛选、生成招呼语并投递'
          "
          @click="actions.run(deliveryLabel, () => helper.start(deliveryMode))"
        />
        <UButton
          :label="filterLabel"
          color="neutral"
          variant="outline"
          :disabled="startDisabled"
          @click="actions.run(filterLabel, () => helper.start('filter'))"
        />
        <UButton
          :label="generateLabel"
          color="neutral"
          variant="outline"
          :disabled="startDisabled"
          @click="actions.run(generateLabel, () => helper.start('generate'))"
        />
        <UButton
          v-if="helper.workflow?.status.value === 'stop'"
          label="重置筛选"
          icon="i-lucide-rotate-ccw"
          color="neutral"
          variant="ghost"
          :disabled="helper.jobActionBusy.value || props.disabled"
          @click="helper.reset()"
        />
      </div>
    </div>
    <div class="delivery-progress-row">
      <span
        >本页处理
        <strong
          >{{ helper.workflow?.current.value ?? 0 }} /
          {{ helper.workflow?.total.value ?? 0 }}</strong
        ></span
      >
      <UProgress
        :model-value="progress"
        aria-label="本页处理进度"
        class="delivery-progress"
        size="xs"
      />
      <span
        >今日成功
        <strong
          >{{ helper.statistics.todayData.value.success }} /
          {{ conf.formData.deliveryLimit.value }}</strong
        ></span
      >
      <UButton
        :label="`本页失败 ${failures}`"
        :color="failures ? 'error' : 'neutral'"
        variant="ghost"
        size="xs"
        icon="i-lucide-list-checks"
        @click="emit('logs')"
      />
    </div>
    <p v-if="helper.workflow?.errorMessage.value" role="alert" class="text-sm text-error mt-2">
      {{ helper.workflow.errorMessage.value }}
    </p>
  </section>
</template>
