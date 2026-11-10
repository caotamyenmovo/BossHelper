<script lang="ts" setup>
import type { DropdownMenuItem } from '@nuxt/ui'
import { createReusableTemplate, usePreferredReducedMotion, useResizeObserver } from '@vueuse/core'
import { nextTick, ref } from 'vue'

import JobTable from '@/components/JobTable.vue'
import { appearanceConf } from '@/composables/conf'

const [DefineFollowing, FollowingControl] = createReusableTemplate()
const [DefineFilter, FilterControl] = createReusableTemplate()

import JobCard from '@/components/JobCard.vue'
import { useHelper } from '@/composables/useHelper'

const following = ref(true)
const reducedMotion = usePreferredReducedMotion()
const statusFilter = defineModel<'all' | 'error'>('statusFilter', { default: 'all' })

const cards = ref<HTMLDivElement>()
const helper = useHelper()

const filterItemsChecked = ref<Record<string, boolean>>({})

const filterItems = computed<(DropdownMenuItem & { value: string })[]>(() =>
  (
    [
      {
        type: 'checkbox',
        value: 'success',
        label: '投递成功',
        color: 'success',
      },
      { type: 'checkbox', value: 'ready', label: '待投递', color: 'info' },
      {
        type: 'checkbox',
        value: 'manualFilter',
        label: '手动过滤',
        color: 'warning',
      },
      ...(helper.workflow?.pipeline.value.map(
        (item) =>
          ({
            type: 'checkbox',
            label: item.label ?? item.id,
            value: item.id,
          }) satisfies DropdownMenuItem,
      ) ?? []),
      { type: 'checkbox', value: 'error', label: '投递错误', color: 'error' },
      { type: 'checkbox', value: 'not_started', label: '未开始' },
    ] satisfies DropdownMenuItem[]
  ).map((item) => ({
    ...item,
    checked: filterItemsChecked.value[item.value] ?? true,
    onUpdateChecked(checked: boolean) {
      filterItemsChecked.value[item.value] = checked
    },
    onSelect(e: Event) {
      e.preventDefault()
    },
  })),
)

const jobList = computed(() => {
  return helper.jobList.value.filter((job) => {
    const res = helper.jobResultMaps.get(job.key)
    if (statusFilter.value === 'error') return res?.status === 'error'
    if (res?.status === 'ready') {
      return filterItemsChecked.value.ready ?? true
    }
    if (res?.id === 'manualFilter') {
      return filterItemsChecked.value.manualFilter ?? true
    }
    if (!res || !res.id) {
      return filterItemsChecked.value.not_started ?? true
    }
    if (res.status === 'success') {
      return filterItemsChecked.value.success ?? true
    }
    if (res.status === 'error') {
      return filterItemsChecked.value.error ?? true
    }
    if (filterItemsChecked.value[res.id] === false) {
      return false
    }
    return true
  })
})

function filterSelectAll() {
  filterItems.value.forEach((item) => (filterItemsChecked.value[item.value] = true))
}

function filterToggle() {
  filterItems.value.forEach(
    (item) =>
      (filterItemsChecked.value[item.value] = !(filterItemsChecked.value[item.value] ?? true)),
  )
}

const canScrollLeft = ref(false)
const canScrollRight = ref(false)
const dragging = ref(false)
let drag: { id: number; x: number; left: number } | undefined
let suppressClick = false
function updateScroll() {
  const el = cards.value
  canScrollLeft.value = !!el && el.scrollLeft > 2
  canScrollRight.value = !!el && el.scrollLeft + el.clientWidth < el.scrollWidth - 2
}
useResizeObserver(cards, updateScroll)
watch(
  [jobList, () => appearanceConf.value.jobView],
  async () => {
    await nextTick()
    updateScroll()
  },
  { flush: 'post' },
)
function moveCards(direction: number) {
  following.value = false
  cards.value?.scrollBy({
    left:
      direction *
      (cards.value.querySelectorAll<HTMLElement>('.job-card')[1]?.offsetLeft
        ? cards.value.querySelectorAll<HTMLElement>('.job-card')[1]!.offsetLeft -
          cards.value.querySelector<HTMLElement>('.job-card')!.offsetLeft
        : 320),
    behavior: reducedMotion.value === 'reduce' ? 'auto' : 'smooth',
  })
}
function onWheel(event: WheelEvent) {
  following.value = false
  const el = cards.value
  if (!el || event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return
  const content = (event.target as Element).closest('.card-content')
  if (content && content.scrollHeight > content.clientHeight) return
  const delta =
    event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? el.clientWidth : 1)
  if ((delta > 0 && canScrollRight.value) || (delta < 0 && canScrollLeft.value)) {
    event.preventDefault()
    el.scrollLeft += delta
  }
}
function pointerDown(event: PointerEvent) {
  suppressClick = false
  if (
    event.pointerType !== 'mouse' ||
    event.button !== 0 ||
    (event.target as Element).closest('a,button,input,select,textarea')
  )
    return
  drag = { id: event.pointerId, x: event.clientX, left: cards.value?.scrollLeft ?? 0 }
}
function pointerMove(event: PointerEvent) {
  if (event.buttons === 0) return pointerEnd()
  if (!drag || drag.id !== event.pointerId || !cards.value) return
  const offset = event.clientX - drag.x
  if (!dragging.value && Math.abs(offset) < 6) return
  cards.value.setPointerCapture(event.pointerId)
  dragging.value = true
  suppressClick = true
  following.value = false
  cards.value.scrollLeft = drag.left - offset
}
function pointerEnd() {
  if (drag && cards.value?.hasPointerCapture(drag.id)) cards.value.releasePointerCapture(drag.id)
  drag = undefined
  dragging.value = false
}
function preventDragClick(event: MouseEvent) {
  if (suppressClick) {
    event.preventDefault()
    event.stopPropagation()
    suppressClick = false
  }
}
function onKey(event: KeyboardEvent) {
  if (event.target !== cards.value || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return
  event.preventDefault()
  moveCards(event.key === 'ArrowLeft' ? -1 : 1)
}
function scrollHandler(key = helper.currentJob.value) {
  if (!key) {
    return
  }
  helper.shadowRoot?.getElementById(`boss-card-${key}`)?.scrollIntoView({
    behavior: reducedMotion.value === 'reduce' ? 'auto' : 'smooth',
    block: 'nearest',
    inline: 'center',
  })
}

watch(
  () => helper.currentJob.value,
  (v) => {
    if (following.value && v) {
      scrollHandler(v)
    }
  },
)
</script>

<template>
  <DefineFollowing>
    <UButton
      size="md"
      :color="following ? 'primary' : 'neutral'"
      variant="outline"
      @click="following = !following"
      icon="i-lucide-accessibility"
      label="跟随"
      title="自动跟随"
      aria-label="自动跟随当前岗位"
      :aria-pressed="following"
    />
  </DefineFollowing>
  <DefineFilter>
    <UDropdownMenu :items="filterItems" :content="{ side: 'top' }" :ui="{ content: 'w-48' }">
      <UButton
        size="md"
        color="neutral"
        variant="outline"
        icon="lucide:list-filter"
        label="状态过滤"
        title="过滤"
        aria-label="按处理状态过滤岗位"
      />
      <template #content-top>
        <div class="p-2 flex flex-wrap gap-1">
          <UButton size="sm" variant="outline" @click="filterSelectAll" label="全选" />
          <UButton size="sm" variant="outline" @click="filterToggle" label="反选" />
        </div>
      </template>
    </UDropdownMenu>
  </DefineFilter>
  <div class="boss-helper-card relative">
    <div class="job-list-heading">
      <div class="flex items-center gap-2">
        <strong class="text-sm font-medium">本页岗位</strong
        ><span class="text-xs text-muted"
          >{{ jobList.length }} / {{ helper.jobList.value.length }}</span
        >
      </div>
      <div class="job-list-tools">
        <UButton
          label="卡片"
          size="xs"
          color="neutral"
          :variant="appearanceConf.jobView === 'cards' ? 'soft' : 'ghost'"
          @click="appearanceConf.jobView = 'cards'"
        />
        <UButton
          label="表格"
          size="xs"
          color="neutral"
          :variant="appearanceConf.jobView === 'table' ? 'soft' : 'ghost'"
          @click="appearanceConf.jobView = 'table'"
        />
        <FollowingControl />
        <FilterControl />
        <UButton
          label="全部岗位"
          size="xs"
          :variant="statusFilter === 'all' ? 'soft' : 'ghost'"
          color="neutral"
          @click="statusFilter = 'all'"
        /><UButton
          label="仅看失败"
          size="xs"
          :variant="statusFilter === 'error' ? 'soft' : 'ghost'"
          :color="statusFilter === 'error' ? 'error' : 'neutral'"
          @click="statusFilter = 'error'"
        />
      </div>
    </div>
    <div v-if="!jobList.length" class="product-empty" role="status">
      <p>
        {{
          statusFilter === 'error'
            ? '本页暂无处理失败的岗位'
            : helper.jobList.value.length
              ? '当前过滤条件下没有岗位'
              : '等待 Boss 页面加载岗位'
        }}
      </p>
      <UButton
        v-if="statusFilter === 'error'"
        label="返回全部岗位"
        variant="outline"
        color="neutral"
        @click="statusFilter = 'all'"
      /><UButton
        v-else-if="helper.jobList.value.length"
        label="清除状态过滤"
        variant="outline"
        color="neutral"
        @click="filterSelectAll"
      />
    </div>
    <JobTable
      v-if="appearanceConf.jobView === 'table'"
      :jobs="jobList"
      v-model:following="following"
    >
      <template #following><FollowingControl /></template>
      <template #filter><FilterControl /></template>
    </JobTable>
    <div
      v-else
      ref="cards"
      class="card-grid"
      :class="{ 'is-dragging': dragging }"
      tabindex="0"
      role="region"
      aria-label="横向岗位卡片，使用左右方向键或拖动浏览"
      @wheel="onWheel"
      @scroll.passive="updateScroll"
      @pointerdown="pointerDown"
      @pointermove="pointerMove"
      @pointerup="pointerEnd"
      @pointercancel="pointerEnd"
      @lostpointercapture="pointerEnd"
      @click.capture="preventDragClick"
      @keydown="onKey"
      @dragstart.prevent
    >
      <JobCard
        v-for="(job, index) in jobList"
        :key="job.key"
        :job="job"
        :position="index + 1"
        hover
      />
    </div>
    <div v-if="appearanceConf.jobView !== 'table' && jobList.length" class="card-strip-footer">
      <span>拖动卡片或滚动浏览更多岗位</span>
      <div class="flex gap-2">
        <UButton
          label="上一组"
          size="xs"
          color="neutral"
          variant="outline"
          :disabled="!canScrollLeft"
          @click="moveCards(-1)"
        />
        <UButton
          label="下一组"
          size="xs"
          color="neutral"
          variant="outline"
          :disabled="!canScrollRight"
          @click="moveCards(1)"
        />
      </div>
    </div>
  </div>
</template>
