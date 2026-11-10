<script setup lang="ts">
import { useResizeObserver } from '@vueuse/core'
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref } from 'vue'

import Alert from '@/components/Alert.vue'
import { useConf } from '@/composables/conf'
import { useConfigSections } from '@/composables/conf/sections'
import { HelperKey } from '@/composables/useHelper'
import type { HelperContext } from '@/composables/useHelper'
import { useModel, ChatModel } from '@/composables/useModel'
import { counter } from '@/message'
import { exportJson } from '@/utils/jsonImportExport'
import { registerToastSink } from '@/utils/toast'

import AIPage from './pages/AIPage.vue'
import CareerWorkbench from './pages/CareerWorkbench.vue'
import FeishuPage from './pages/FeishuPage.vue'
import GeneralPage from './pages/GeneralPage.vue'
import ManagementPage from './pages/ManagementPage.vue'
import ProvidersPage from './pages/ProvidersPage.vue'
import { themePreference, setThemePreference } from './theme'

function changeTheme(event: Event) {
  setThemePreference((event.target as HTMLSelectElement).value)
}

const formDataPresetsKey = 'local:FormDataPreses'

const formDataPresets = ref([{ label: '默认配置', value: 'default' }])

async function initPresets() {
  formDataPresets.value = await counter.storageGet(formDataPresetsKey, [
    { label: '默认配置', value: 'default' },
  ])
}

const header = ref<HTMLElement>()
const headerHeight = ref(0)
useResizeObserver(header, () => {
  headerHeight.value = header.value?.getBoundingClientRect().height ?? 0
})

const toast = useToast()
registerToastSink((options) => toast.add(options))
const conf = useConf()
const model = useModel()
const schema = useConfigSections()
const sections = computed(() => schema.value[1].filter((item) => item !== false))
const helpText = ref('悬浮或聚焦配置项，即可在这里查看说明。')
const hoveredHelp = ref('')
const focusedHelp = ref('')

function readHelp(target: EventTarget | null) {
  if (!(target instanceof Element)) return ''
  let element: Element | null = target
  while (element) {
    const text = element.getAttribute('data-help')?.trim()
    if (text && text !== 'no-help') return text
    element = element.parentElement
  }
  return ''
}

function updateHelp(event: Event) {
  if (event.type === 'pointerover') hoveredHelp.value = readHelp(event.target)
  if (event.type === 'pointerleave') hoveredHelp.value = ''
  if (event.type === 'focusin') focusedHelp.value = readHelp(event.target)
  if (event.type === 'focusout') focusedHelp.value = readHelp((event as FocusEvent).relatedTarget)
  helpText.value =
    hoveredHelp.value || focusedHelp.value || '悬浮或聚焦配置项，即可在这里查看说明。'
}

type CareerView = 'resume' | 'research' | 'interview' | 'history' | 'advice-history'
const page = ref('career')
const careerView = ref<CareerView>('resume')
const career = ref<InstanceType<typeof CareerWorkbench>>()
const settingsOpen = ref(false)
const careerLinks = [
  { value: 'resume', label: '简历档案', icon: 'i-lucide-file-user' },
  { value: 'research', label: '简历建议', icon: 'i-lucide-notebook-pen' },
  { value: 'interview', label: '模拟面试', icon: 'i-lucide-messages-square' },
  { value: 'history', label: '面试复盘', icon: 'i-lucide-history' },
  { value: 'advice-history', label: '建议记录', icon: 'i-lucide-book-open-check' },
] as const
function goCareer(value: CareerView) {
  page.value = 'career'
  career.value?.navigateView(value)
}
const pageTitle = computed(() =>
  page.value === 'career'
    ? careerLinks.find((item) => item.value === careerView.value)?.label
    : ({
        general: '投递规则',
        management: '预设与账号',
        ai: 'AI 功能',
        providers: '模型配置',
        feishu: '飞书集成',
      }[page.value] ?? '设置'),
)
const activeSection = ref('basic')
const ready = ref(false)
const busy = ref(false)
const error = ref('')
const baseline = ref('')
const modelBaseline = ref('')
const aiEditor = ref<InstanceType<typeof AIPage>>()
const revision = ref(0)
const snapshot = () => JSON.stringify(conf.formData)
const modelSnapshot = () => JSON.stringify(model.modelData.value)
const dirty = computed(
  () =>
    ready.value &&
    (snapshot() !== baseline.value ||
      modelSnapshot() !== modelBaseline.value ||
      aiEditor.value?.isDirty),
)

// Configuration components expect a helper, but options has no website session or jobs.
const context = {
  key: 'boss',
  label: 'Boss直聘',
  workflowRunning: ref(false),
  statistics: { todayData: ref({ success: 0 }) },
  jobList: ref([]),
  jobMaps: new Map(),
  models: model,
  onJobCardClick: async () => {},
} as unknown as HelperContext<any, unknown, unknown>
context.chatModel = new ChatModel(context)
provide(HelperKey, context)

function markClean() {
  baseline.value = snapshot()
  modelBaseline.value = modelSnapshot()
}
function allowDiscard() {
  return (
    !dirty.value || window.confirm('存在未保存的配置或编辑器草稿，继续将丢弃这些修改。是否继续？')
  )
}
async function run(action: () => Promise<void> | void) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await action()
  } catch (e) {
    error.value = String(e)
  } finally {
    busy.value = false
  }
}

async function initialize() {
  await Promise.all([initPresets(), conf.confInit(), model.initModel()])
  ready.value = true
  markClean()
}

async function save() {
  await run(async () => {
    if ((await aiEditor.value?.save({ silent: true })) === false) return
    const saved = snapshot()
    const savedModels = modelSnapshot()
    await conf.confSaving({ silent: true })
    await model.saveModel({ silent: true })
    baseline.value = saved
    modelBaseline.value = savedModels
    toast.add({
      title: '配置与模型已保存',
      color: 'success',
      description: '回到投递页面记得手动刷新, 避免配置不同步',
    })
  })
}
async function reload() {
  if (!allowDiscard()) return
  await run(async () => {
    await initialize()
    revision.value++
  })
}

async function switchPreset(value: string) {
  if (value === conf.formDataPreset.value || !allowDiscard()) return
  await run(async () => {
    await conf.switchPreset(value)
    await model.initModel()
    markClean()
    revision.value++
  })
}

async function manage(action: () => Promise<unknown> | unknown, reload = true) {
  if (!allowDiscard()) return
  await run(async () => {
    if (reload) await initialize()
    await action()
    if (reload) await initialize()
    else await model.initModel()
    markClean()
    revision.value++
  })
}
async function navigate(value: string | undefined) {
  if (!value) return
  page.value = 'general'
  activeSection.value = value
  await nextTick()
  document
    .getElementById(`section-${value}`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (!dirty.value) return
  event.preventDefault()
  event.returnValue = ''
}
onMounted(() => {
  window.addEventListener('beforeunload', beforeUnload)
  void run(initialize)
})
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
</script>

<template>
  <UApp>
    <div
      class="options-page product-theme"
      :style="{ '--options-header-height': headerHeight + 'px' }"
      @pointerover="updateHelp"
      @focusin="updateHelp"
      @focusout="updateHelp"
      @pointerleave="updateHelp"
    >
      <aside class="options-sidebar">
        <button class="product-brand" aria-label="求职工作台" @click="goCareer('resume')">
          <span class="product-mark"><UIcon name="i-lucide-briefcase-business" /></span
          ><span>BossHelper<small>你的求职工作空间</small></span>
        </button>
        <p class="nav-caption">求职工作台</p>
        <nav class="product-nav" aria-label="求职工作台功能">
          <UButton
            v-for="item in careerLinks"
            :key="item.value"
            :label="item.label"
            :icon="item.icon"
            :variant="page === 'career' && careerView === item.value ? 'soft' : 'ghost'"
            :color="page === 'career' && careerView === item.value ? 'primary' : 'neutral'"
            :aria-current="page === 'career' && careerView === item.value ? 'page' : undefined"
            :disabled="!ready"
            @click="goCareer(item.value)"
          />
        </nav>
        <div class="settings-nav">
          <UButton
            label="设置"
            icon="i-lucide-settings-2"
            color="neutral"
            variant="ghost"
            :trailing-icon="settingsOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
            :aria-expanded="settingsOpen"
            @click="settingsOpen = !settingsOpen"
          />
          <nav v-show="settingsOpen" class="product-nav settings-links" aria-label="设置目录">
            <UButton
              label="预设/账号管理"
              icon="i-lucide-users-round"
              :variant="page === 'management' ? 'soft' : 'ghost'"
              color="neutral"
              :disabled="!ready || busy"
              @click="page = 'management'"
            />
            <UButton
              label="基础设置"
              icon="i-lucide-sliders-horizontal"
              :variant="page === 'general' && activeSection === 'basic' ? 'soft' : 'ghost'"
              color="neutral"
              @click="navigate('basic')"
            />
            <UButton
              v-for="section in sections"
              :key="section.value"
              :label="section.label"
              :variant="page === 'general' && activeSection === section.value ? 'soft' : 'ghost'"
              color="neutral"
              @click="navigate(section.value)"
            />
            <UButton
              label="AI 配置"
              icon="i-lucide-sparkles"
              :variant="page === 'ai' ? 'soft' : 'ghost'"
              color="neutral"
              @click="page = 'ai'"
            />
            <UButton
              label="AI 模型配置"
              icon="i-lucide-server"
              :variant="page === 'providers' ? 'soft' : 'ghost'"
              color="neutral"
              @click="page = 'providers'"
            />
            <UButton
              label="飞书多维表格集成"
              icon="i-lucide-table-properties"
              :variant="page === 'feishu' ? 'soft' : 'ghost'"
              color="neutral"
              @click="page = 'feishu'"
            />
          </nav>
        </div>
        <div class="sidebar-foot">
          <UIcon name="i-lucide-hard-drive" /><span>简历与练习记录保存在本地</span>
        </div>
      </aside>
      <div class="options-content">
        <header ref="header" class="options-topbar">
          <div class="flex items-center gap-2 text-sm">
            <span class="text-muted">{{ page === 'career' ? '求职工作台' : '设置' }}</span
            ><UIcon name="i-lucide-chevron-right" class="size-3 text-muted" /><strong
              class="font-medium"
              >{{ pageTitle }}</strong
            >
          </div>
          <div class="flex items-center gap-3">
            <UBadge v-if="dirty" color="warning" variant="soft">配置有未保存修改</UBadge
            ><span class="text-xs text-muted hidden sm:inline">本地工作空间</span>
            <select
              aria-label="页面主题"
              class="rounded border border-default bg-default px-2 py-1 text-xs text-default"
              :value="themePreference"
              @change="changeTheme"
            >
              <option value="light">浅色</option>
              <option value="dark">深色</option>
              <option value="system">跟随系统</option>
            </select>
          </div>
        </header>
        <div class="options-layout" :class="{ 'is-settings': page !== 'career' }">
          <main class="options-main">
            <Alert v-if="error" color="error" title="操作失败" :description="error" />
            <div v-if="!ready" role="status" class="product-empty">
              <p>{{ busy ? '正在加载本地工作空间…' : '工作空间未加载' }}</p>
              <UButton v-if="!busy" label="重新加载" @click="run(initialize)" />
            </div>
            <CareerWorkbench
              v-if="ready"
              ref="career"
              v-model:view="careerView"
              v-show="page === 'career'"
            />
            <div v-if="ready" :key="revision" class="space-y-5">
              <div v-show="page !== 'career'" class="settings-context">
                <div>
                  <p class="nav-caption">偏好与配置</p>
                  <h1>{{ pageTitle }}</h1>
                </div>
                <UFormField label="当前预设" orientation="vertical"
                  ><USelect
                    aria-label="当前配置预设"
                    :model-value="conf.formDataPreset.value"
                    :items="formDataPresets"
                    :disabled="busy"
                    class="min-w-40"
                    @update:model-value="switchPreset"
                /></UFormField>
              </div>
              <ManagementPage
                v-show="page === 'management'"
                :busy="busy"
                v-model="formDataPresets"
                :manage="manage"
              />
              <GeneralPage v-show="page === 'general'" :busy="busy" />
              <AIPage v-show="page === 'ai'" ref="aiEditor" />
              <ProvidersPage v-show="page === 'providers'" />
              <FeishuPage v-show="page === 'feishu'" />
            </div>
          </main>
          <aside v-show="page !== 'career'" class="options-help" aria-label="配置帮助">
            <h2><UIcon name="i-lucide-circle-help" />配置帮助</h2>
            <p>{{ helpText }}</p>
            <hr />
            <UButton
              label="导入配置"
              icon="i-lucide-upload"
              color="neutral"
              variant="ghost"
              :disabled="!ready || busy"
              @click="run(conf.confImport)"
            /><UButton
              label="导出当前配置"
              icon="i-lucide-download"
              color="neutral"
              variant="ghost"
              :disabled="!ready || busy"
              @click="exportJson(JSON.parse(snapshot()), 'BossHelper配置')"
            />
          </aside>
        </div>
        <footer v-show="page !== 'career' || dirty" class="options-footer">
          <div class="flex flex-wrap items-center gap-2">
            <UButton
              label="保存配置与模型"
              icon="i-lucide-save"
              variant="solid"
              :loading="busy"
              :disabled="!ready"
              @click="save"
            /><UButton
              label="重载"
              color="neutral"
              variant="outline"
              :disabled="busy"
              @click="reload"
            /><UButton
              label="推荐配置"
              color="neutral"
              variant="ghost"
              :disabled="!ready || busy"
              @click="conf.confRecommend"
            /><span class="text-xs text-muted sm:ml-auto">{{
              page === 'management'
                ? '管理操作即时保存'
                : page === 'feishu'
                  ? '飞书配置请在页面内单独保存'
                  : '配置修改后请点击保存'
            }}</span>
          </div>
        </footer>
      </div>
    </div>
  </UApp>
</template>
