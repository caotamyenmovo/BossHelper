<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import OperationError from '@/components/OperationError.vue'
import { createCareerAssistant, hasResearchContent } from '@/composables/careerAi'
import type { ParsedResume } from '@/composables/careerAi'
import { runCareerCompletion } from '@/composables/careerCompletion'
import type { CareerCompletionOptions } from '@/composables/careerCompletion'
import { createCareerInterview } from '@/composables/careerInterview'
import { useConf } from '@/composables/conf'
import { searchPublicXiaohongshu } from '@/composables/publicResearch'
import type { PublicCareerSource } from '@/composables/publicResearch'
import { extractResumeText } from '@/composables/resumeImport'
import { createCareerWorkbench, createEmptyResumeProfile } from '@/composables/useCareerWorkbench'
import type { ResumeProfile, CareerAdviceRecord } from '@/composables/useCareerWorkbench'
import type { CareerExperience } from '@/composables/useCareerWorkbench'
import type { CareerInterviewSession } from '@/composables/useCareerWorkbench'
import { useModel } from '@/composables/useModel'
import { createModel } from '@/composables/useModel/providers'
import { counter } from '@/message'
import { BOSS_IMPORT_KEY } from '@/utils/bossResumeImport'
import type { BossImportState } from '@/utils/bossResumeImport'
import {
  defaultResearchPlan,
  planResearch,
  safeResearchQuery,
  mergeResearchSources,
  rankResearchSources,
  classifyResearchSources,
  readResearchImages,
  waitForResearchTask,
  validateResearchCitations,
} from '@/utils/careerResearchFlow'
import type { ResearchPlan } from '@/utils/careerResearchFlow'
import { jsonClone } from '@/utils/deepmerge'
import { exportJson } from '@/utils/jsonImportExport'
import { extractResumeFields, hasResumeFields } from '@/utils/resumeFields'
import { createXiaohongshuResearch } from '@/utils/xiaohongshuResearch'

const workbench = createCareerWorkbench({
  storageGet: (key, fallback) => counter.storageGet(key, fallback),
  storageSet: (key, value) => counter.storageSet(key, value),
  async careerWrite(command) {
    const result = (await browser.runtime.sendMessage({
      type: 'career-repository-write',
      command,
    })) as { records?: unknown; error?: string } | undefined
    if (!result || result.error)
      throw new Error(result?.error || '扩展后台未响应，请保留输入并重新加载扩展后重试。')
    return result.records
  },
})
const profiles = ref<ResumeProfile[]>([])
const selectedId = ref('')
const draft = ref<ResumeProfile | null>(null)
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const saved = ref(false)
const fileInput = ref<HTMLInputElement>()
const resumeText = ref('')
const resumeFileName = ref('')
const fileBusy = ref(false)
const fieldBusy = ref(false)
const importReviewed = ref(false)
const bossImportBusy = ref(false)
const bossImportMessage = ref('')
let bossImportPoll: number | undefined
let importEpoch = 0
let lastBossToken = ''
const recognitionMessage = ref('')
const pendingBossImportToken = ref('')
const bossImportedProfile = ref<ParsedResume | null>(null)
const conf = useConf()
const models = useModel()
const configuredModelKey = computed(
  () =>
    conf.formData.aiGreeting.model ||
    conf.formData.aiFiltering.model ||
    conf.formData.aiReply.model ||
    models.modelData.value[0]?.key ||
    '',
)
const configuredModelName = computed(() => {
  const provider = models.modelData.value.find((item) => item.key === configuredModelKey.value)
  return provider ? `${provider.name} · ${provider.data?.model ?? ''}` : '尚未配置'
})
type CareerView = 'resume' | 'research' | 'interview' | 'history' | 'advice-history'
const view = defineModel<CareerView>('view', { default: 'resume' })
const viewInfo = computed(
  () =>
    ({
      resume: ['简历档案', '整理你的经历，让每次求职都有清晰的起点。'],
      research: ['简历建议', '查阅岗位经验，结合来源打磨你的简历。'],
      interview: ['模拟面试', '一次专注一道问题，用文字练习表达。'],
      history: ['面试复盘', '回顾回答与反馈，继续未完成的练习。'],
      'advice-history': ['建议记录', '回看每次分析，以及当时的简历和经验来源。'],
    })[view.value],
)
function navigateView(value: CareerView) {
  if (value === 'research') openResearch()
  else if (value === 'history' || value === 'advice-history') void openHistory(value)
  else view.value = value
}
function selectContext(value: string | undefined) {
  const profile = profiles.value.find((item) => item.id === value)
  if (profile && profile.id !== selectedId.value) editProfile(profile)
}
defineExpose({ navigateView })
const adviceRecords = ref<CareerAdviceRecord[]>([])
const pendingAdvice = ref<CareerAdviceRecord[]>([])
const adviceRetryBusy = ref(false)
let profileContextEpoch = 0
const analysis = ref('')
const analysisBusy = ref(false)
const analysisStatus = ref('')
let analysisController: AbortController | undefined
const researchAdviceBusy = ref(false)
const researchAdviceStatus = ref('')
let researchAdviceController: AbortController | undefined
const researchRole = ref('')
const researchJd = ref('')
const researchPlan = ref<ResearchPlan>(defaultResearchPlan(''))
const researchPlanEdited = ref(false)
const researchAutoBusy = ref(false)
let researchAutoController: AbortController | undefined
const researchRunKey = 'careerResearchRunV2'
const researchSources = ref<PublicCareerSource[]>([])
const researchSummary = ref('')
const researchContentCount = computed(() => researchSources.value.filter(hasResearchContent).length)
const researchBusy = ref(false)
const researchWebBusy = ref(false)
const researchNotice = ref('')
const publicResearchFailed = ref(false)
watch(
  researchNotice,
  () => {
    publicResearchFailed.value = false
  },
  { flush: 'sync' },
)
const researchSourceRole = ref('')
const xhsResearch = createXiaohongshuResearch(browser)
let researchEpoch = 0
let xhsPolling = false
let xhsPoll: number | undefined
const sourceKindLabels: Record<string, string> = {
  'search-snippet': '搜索摘要',
  'page-description': '网页摘要',
  'visible-card': '搜索卡片标题（未读取正文）',
  'visible-note': '页面正文',
  pasted: '手动导入内容',
}

const pastedSourceTitle = ref('')
const pastedSourceUrl = ref('')
const pastedSourceText = ref('')
const interviewRole = ref('')
const interviewCompany = ref('')
const interviewDescription = ref('')
const interviewFlow = createCareerInterview(
  workbench,
  createCareerAssistant(completeWithConfiguredAi),
)
const currentSession = computed(() => interviewFlow.state.session)
const currentQuestion = computed(() => currentSession.value?.currentQuestion ?? '')
const interviewAnswer = computed({
  get: () => currentSession.value?.draftAnswer ?? '',
  set: (text: string) => interviewFlow.setAnswer(text),
})
const interviewBusy = computed(() => interviewFlow.state.busy)
const interviews = ref<CareerInterviewSession[]>([])
const selectedProfile = computed(
  () => draft.value ?? profiles.value.find((profile) => profile.id === selectedId.value),
)
const draftDirty = computed(
  () =>
    !!draft.value &&
    JSON.stringify(draft.value) !==
      JSON.stringify(profiles.value.find((item) => item.id === draft.value?.id)),
)
function allowDiscardDraft() {
  return !draftDirty.value || window.confirm('当前简历有未保存的修改，放弃这些修改并切换？')
}
function clearProfileContext(keepSources = false) {
  researchAutoController?.abort()
  profileContextEpoch++
  analysisController?.abort()
  researchAdviceController?.abort()
  analysis.value = ''
  analysisStatus.value = ''
  researchSummary.value = ''
  researchAdviceStatus.value = ''
  if (!keepSources) {
    researchJd.value = ''
    researchPlan.value = defaultResearchPlan('')
    researchPlanEdited.value = false
    researchRole.value = ''
    researchSources.value = []
    researchSourceRole.value = ''
    researchNotice.value = ''
  }
  pastedSourceTitle.value = ''
  pastedSourceUrl.value = ''
  pastedSourceText.value = ''
  interviewRole.value = ''
  if (!keepSources) {
    researchEpoch++
    researchBusy.value = false
    researchWebBusy.value = false
    void xhsResearch.cancel().catch(() => undefined)
  }
}
watch(
  draft,
  () => {
    if (draftDirty.value) {
      researchAutoController?.abort()
      profileContextEpoch++
      saved.value = false
      analysisController?.abort()
      researchAdviceController?.abort()
      analysis.value = ''
      researchSummary.value = ''
      analysisStatus.value = ''
      researchAdviceStatus.value = ''
    }
  },
  { deep: true, flush: 'sync' },
)

// Keep references to both stored lists so existing internship records remain editable.
const experienceSections = computed(() => {
  if (!draft.value) return []
  return [
    {
      key: 'workExperience' as const,
      title: '工作/实习经历',
      items: [...draft.value.workExperience, ...draft.value.internshipExperience],
    },
    {
      key: 'educationExperience' as const,
      title: '教育经历',
      items: draft.value.educationExperience,
    },
    { key: 'projects' as const, title: '项目经历', items: draft.value.projects },
  ]
})

function removeExperience(
  section: 'workExperience' | 'educationExperience' | 'projects',
  id: string,
) {
  if (!draft.value) return
  const keys =
    section === 'workExperience' ? (['workExperience', 'internshipExperience'] as const) : [section]
  for (const key of keys) {
    const index = draft.value[key].findIndex((item) => item.id === id)
    if (index !== -1) {
      draft.value[key].splice(index, 1)
      break
    }
  }
}

async function completeWithConfiguredAi(
  prompt: string,
  options?: CareerCompletionOptions,
): Promise<string> {
  const selectedModel = configuredModelKey.value
  if (!selectedModel) throw new Error('请先在“AI 模型配置”中添加一个可用模型。')
  const provider = models.modelData.value.find((item) => item.key === selectedModel)
  if (!provider?.data) throw new Error('当前 AI 模型配置不可用，请检查“AI 模型配置”。')
  return runCareerCompletion(provider.data, prompt, createModel, options)
}

const assistant = createCareerAssistant(completeWithConfiguredAi)

function newAdviceRecord(kind: CareerAdviceRecord['kind']): CareerAdviceRecord {
  return {
    id: crypto.randomUUID(),
    kind,
    profileSnapshot: jsonClone(selectedProfile.value!),
    role:
      kind === 'research'
        ? researchRole.value.trim()
        : (selectedProfile.value?.targetRoles.join('、') ?? ''),
    model: configuredModelName.value,
    jobDescription: kind === 'research' ? researchJd.value : undefined,
    sources:
      kind === 'research'
        ? jsonClone(
            researchSources.value
              .map((s, i) => ({ ...s, sourceId: s.sourceId ?? i + 1 }))
              .filter(hasResearchContent),
          )
        : [],
    text: '',
    status: 'partial',
    done: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}
async function saveAdviceRecord(record: CareerAdviceRecord) {
  try {
    adviceRecords.value = await workbench.saveAdvice(record)
    pendingAdvice.value = pendingAdvice.value.filter((item) => item.id !== record.id)
  } catch (cause) {
    if (!pendingAdvice.value.some((item) => item.id === record.id))
      pendingAdvice.value.push(jsonClone(record))
    error.value = `建议尚未保存，内容已保留，可重试保存：${cause instanceof Error ? cause.message : String(cause)}`
  }
}
async function retryAdviceSave() {
  if (adviceRetryBusy.value) return
  adviceRetryBusy.value = true
  if (error.value.startsWith('建议尚未保存，')) error.value = ''
  try {
    for (const record of [...pendingAdvice.value]) await saveAdviceRecord(record)
  } finally {
    adviceRetryBusy.value = false
  }
}
async function removeAdvice(record: CareerAdviceRecord) {
  if (!window.confirm('删除这条建议及其来源记录？')) return
  try {
    adviceRecords.value = await workbench.deleteAdvice(record.id, record.revision)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  }
}
async function toggleAdvice(record: CareerAdviceRecord) {
  await saveAdviceRecord({ ...jsonClone(record), done: !record.done })
}

async function analyzeResume() {
  if (!selectedProfile.value || analysisBusy.value || researchAdviceBusy.value) return
  const controller = new AbortController()
  const owner = profileContextEpoch
  const record = newAdviceRecord('analysis')
  let received = ''
  analysisController = controller
  analysisBusy.value = true
  analysis.value = ''
  analysisStatus.value = '正在连接模型…'
  error.value = ''
  try {
    const result = await assistant.analyzeResume(record.profileSnapshot, {
      signal: controller.signal,
      onText: (text) => {
        received = text
        if (owner === profileContextEpoch) analysis.value = text
      },
      onStatus: (status) => {
        if (owner === profileContextEpoch) analysisStatus.value = status
      },
    })
    received = result
    record.status = 'complete'
    if (owner === profileContextEpoch) {
      analysis.value = result
      analysisStatus.value = '已完成'
    }
  } catch (cause) {
    if (owner !== profileContextEpoch) return
    if (controller.signal.aborted) analysisStatus.value = '已停止生成，已保留收到的内容。'
    else {
      analysisStatus.value = '生成未完成，已保留收到的内容。'
      error.value = cause instanceof Error ? cause.message : String(cause)
    }
  } finally {
    if (received.trim()) {
      record.text = received
      await saveAdviceRecord(record)
    }
    analysisController = undefined
    analysisBusy.value = false
  }
}

function stopAnalysis() {
  analysisController?.abort()
}
function stopResearchAdvice() {
  researchAdviceController?.abort()
}

function prepareResearch() {
  const role = researchRole.value.trim() || selectedProfile.value?.targetRoles[0] || ''
  if (!role) {
    error.value = '请填写目标岗位后再检索。'
    return ''
  }
  researchRole.value = role
  researchSourceRole.value = role
  researchSources.value = []
  researchSummary.value = ''
  researchAdviceStatus.value = ''
  researchNotice.value = ''
  error.value = ''
  researchEpoch++
  return role
}

async function persistResearchRun() {
  await browser.storage.local.set({
    [researchRunKey]: jsonClone({
      profileId: selectedId.value,
      role: researchRole.value,
      jobDescription: researchJd.value,
      plan: researchPlan.value,
      sources: researchSources.value,
      message: researchNotice.value,
    }),
  })
}
async function restoreResearchRun() {
  const owner = researchEpoch
  const profileId = selectedId.value
  const savedRun = (await browser.storage.local.get(researchRunKey))[researchRunKey] as
    | {
        profileId: string
        role: string
        jobDescription: string
        plan: ResearchPlan
        sources: PublicCareerSource[]
        message: string
      }
    | undefined
  if (
    owner !== researchEpoch ||
    profileId !== selectedId.value ||
    !savedRun ||
    savedRun.profileId !== selectedId.value ||
    !Array.isArray(savedRun.sources)
  )
    return
  researchRole.value = savedRun.role
  researchSourceRole.value = savedRun.role
  researchJd.value = savedRun.jobDescription || ''
  researchPlan.value = savedRun.plan || defaultResearchPlan(savedRun.role)
  researchPlanEdited.value = true
  researchSources.value = mergeResearchSources([], savedRun.sources)
  researchNotice.value = '已恢复上次候选和读取进度；可以调整来源、生成建议或补充检索。'
}
async function toggleResearchSource(source: PublicCareerSource) {
  source.selected = source.selected === false
  source.excludedByUser = !source.selected
  researchSummary.value = ''
  researchAdviceStatus.value = ''
  try {
    await persistResearchRun()
  } catch {
    error.value = '来源选择尚未保存，请重试。'
  }
}
async function runAutomaticResearch(supplement = false) {
  if (
    researchAutoBusy.value ||
    researchBusy.value ||
    researchWebBusy.value ||
    researchAdviceBusy.value ||
    analysisBusy.value
  )
    return
  if (!selectedProfile.value || !configuredModelKey.value) {
    error.value = '请先选择简历并配置 AI 模型。'
    return
  }
  const role = researchRole.value.trim() || selectedProfile.value.targetRoles[0] || ''
  if (!safeResearchQuery(role)) {
    error.value = '请填写简短岗位名称，不要包含电话、邮箱或网址。'
    return
  }
  researchRole.value = role
  researchSourceRole.value = role
  const controller = new AbortController()
  researchAutoController = controller
  const signal = controller.signal
  const owner = ++researchEpoch
  researchAutoBusy.value = true
  researchBusy.value = true
  researchSummary.value = ''
  researchAdviceStatus.value = ''
  error.value = ''
  if (!supplement) researchSources.value = []
  let tabId: number | undefined
  let completed = false
  const report = (message: string) => {
    if (owner === researchEpoch) researchNotice.value = message
  }
  try {
    await xhsResearch.cancel()
    signal.throwIfAborted()
    report('正在规划搜索词，仅使用目标岗位，不向搜索网站发送简历。')
    if (!researchPlanEdited.value) {
      const planned = await planResearch(role, completeWithConfiguredAi, signal)
      signal.throwIfAborted()
      researchPlan.value = planned
    }
    const plan = jsonClone(researchPlan.value)
    if (!plan.queries.length || plan.queries.some((q) => !safeResearchQuery(q.text)))
      throw new Error('搜索词无效，请在搜索计划中调整。')
    for (const [index, query] of plan.queries.slice(0, 4).entries()) {
      signal.throwIfAborted()
      if (query.scope === 'adjacent' && rankResearchSources(researchSources.value).length >= 6)
        continue
      report('检索 ' + (index + 1) + '/4：' + query.text)
      const started = await xhsResearch.start(role, query.text, undefined, tabId)
      tabId = started.tabId
      const task = await waitForResearchTask(xhsResearch.poll, signal, (message) =>
        report('检索 ' + (index + 1) + '/4 · ' + message),
      )
      researchSources.value = mergeResearchSources(
        researchSources.value,
        task.sources.map((s) => ({ ...s, query: query.text })),
      )
      report('正在筛选相关帖子，排除工具推广和无关经验…')
      const classified = await classifyResearchSources(
        plan.direction,
        researchSources.value,
        completeWithConfiguredAi,
        signal,
      )
      signal.throwIfAborted()
      researchSources.value = classified
      await persistResearchRun()
    }
    const candidates = rankResearchSources(researchSources.value)
      .filter((s) => !hasResearchContent(s) || (s.images?.length && !s.imageText))
      .slice(0, 6)
    for (const [index, source] of candidates.entries()) {
      signal.throwIfAborted()
      report('读取 ' + (index + 1) + '/' + candidates.length + ' · ' + source.title)
      const started = await xhsResearch.readNote(
        role,
        jsonClone(source),
        jsonClone(researchSources.value),
        tabId,
      )
      tabId = started.tabId
      const task = await waitForResearchTask(xhsResearch.poll, signal, (message, snapshot) => {
        report('读取 ' + (index + 1) + '/' + candidates.length + ' · ' + message)
        researchSources.value = mergeResearchSources(researchSources.value, snapshot.sources)
      })
      researchSources.value = mergeResearchSources(researchSources.value, task.sources)
      const note = researchSources.value.find((s) => s.sourceId === source.sourceId)!
      if (note.images?.length) {
        report('正在识别来源 ' + note.sourceId + ' 的图片（最多 3 张）…')
        const enriched = await readResearchImages(jsonClone(note), completeWithConfiguredAi, signal)
        signal.throwIfAborted()
        researchSources.value = researchSources.value.map((s) =>
          s.sourceId === note.sourceId ? enriched : s,
        )
      }
      await persistResearchRun()
    }
    report('正在根据正文与图片重新核验经验适用性…')
    const classified = await classifyResearchSources(
      plan.direction,
      researchSources.value,
      completeWithConfiguredAi,
      signal,
    )
    signal.throwIfAborted()
    researchSources.value = classified
    report(
      '检索与读取完成：' +
        researchContentCount.value +
        ' 条已选用证据。热度仅比较本次候选，未知数据不等于 0。',
    )
    await persistResearchRun()
    completed = true
  } catch (cause) {
    report(
      signal.aborted
        ? '已停止，保留已取得的帖子和正文。可补充检索或手动生成建议。'
        : '流程已暂停：' + (cause instanceof Error ? cause.message : String(cause)),
    )
    await xhsResearch.cancel(true)
  } finally {
    if (owner === researchEpoch) {
      researchBusy.value = false
      try {
        await persistResearchRun()
      } catch {
        error.value = '读取进度暂未保存，当前内容仍保留在页面。'
      }
    }
  }
  try {
    if (completed && !signal.aborted && owner === researchEpoch) {
      if (researchContentCount.value) await createResearchAdvice()
      else
        report(
          '当前没有足够的相关正文证据。请调整搜索词补充检索，或手动选用并读取来源；不会仅凭标题生成建议。',
        )
    }
  } finally {
    researchAutoBusy.value = false
    researchAutoController = undefined
  }
}

async function searchResearch() {
  if (
    researchBusy.value ||
    researchAutoBusy.value ||
    researchWebBusy.value ||
    researchAdviceBusy.value ||
    analysisBusy.value
  )
    return
  const role = prepareResearch()
  if (!role) return
  const epoch = researchEpoch
  researchBusy.value = true
  try {
    await xhsResearch.cancel()
    const results = await searchPublicXiaohongshu(
      role,
      (researchPlanEdited.value ? researchPlan.value : defaultResearchPlan(role)).queries[0]?.text,
    )
    if (epoch !== researchEpoch) return
    researchSources.value = mergeResearchSources([], results.slice(0, 8))
    researchSourceRole.value = role
    researchNotice.value = `检索完成：找到 ${researchSources.value.length} 条帖子。请手动点击感兴趣帖子下方的“读取正文和评论”。`
  } catch (cause) {
    if (epoch === researchEpoch) {
      researchWebBusy.value = false
      researchNotice.value = cause instanceof Error ? cause.message : String(cause)
      publicResearchFailed.value = true
    }
  } finally {
    if (epoch === researchEpoch) researchBusy.value = false
  }
}

async function startWebResearch() {
  if (
    researchBusy.value ||
    researchAutoBusy.value ||
    researchWebBusy.value ||
    researchAdviceBusy.value ||
    analysisBusy.value
  )
    return
  const role = prepareResearch()
  if (!role) return
  researchWebBusy.value = true
  try {
    const task = await xhsResearch.start(
      role,
      (researchPlanEdited.value ? researchPlan.value : defaultResearchPlan(role)).queries[0]?.text,
    )
    researchNotice.value = task.message
  } catch (cause) {
    researchWebBusy.value = false
    researchNotice.value = cause instanceof Error ? cause.message : String(cause)
  }
}

async function readResearchNote(source: PublicCareerSource) {
  if (researchBusy.value || researchWebBusy.value || researchAdviceBusy.value || analysisBusy.value)
    return
  researchEpoch++
  researchWebBusy.value = true
  researchSummary.value = ''
  researchAdviceStatus.value = ''
  error.value = ''
  try {
    const task = await xhsResearch.readNote(
      researchSourceRole.value,
      jsonClone(source),
      jsonClone(researchSources.value),
    )
    researchNotice.value = task.message
  } catch (cause) {
    researchWebBusy.value = false
    researchNotice.value = cause instanceof Error ? cause.message : String(cause)
  }
}
async function recognizeSourceImages(source: PublicCareerSource) {
  if (
    researchBusy.value ||
    researchAutoBusy.value ||
    researchWebBusy.value ||
    researchAdviceBusy.value
  )
    return
  const controller = new AbortController()
  researchAutoController = controller
  researchAutoBusy.value = true
  researchBusy.value = true
  const owner = researchEpoch
  researchNotice.value = '正在使用当前 AI 配置识别最多 3 张帖子图片…'
  try {
    const result = await readResearchImages(
      jsonClone(source),
      completeWithConfiguredAi,
      controller.signal,
    )
    controller.signal.throwIfAborted()
    if (owner !== researchEpoch) return
    researchSources.value = researchSources.value.map((s) => (s.url === source.url ? result : s))
    researchSummary.value = ''
    researchNotice.value = result.imageStatus || '未发现可读取图片。'
    await persistResearchRun()
  } catch (cause) {
    if (owner === researchEpoch)
      researchNotice.value = controller.signal.aborted
        ? '已停止图片识别，保留已有正文。'
        : String(cause)
  } finally {
    researchAutoBusy.value = false
    researchAutoController = undefined
    if (owner === researchEpoch) researchBusy.value = false
  }
}

async function syncWebResearch(restore = false) {
  if (researchAutoBusy.value) return
  if (xhsPolling || (!restore && !researchWebBusy.value)) return
  const epoch = researchEpoch
  xhsPolling = true
  try {
    const task = await xhsResearch.poll()
    if (epoch !== researchEpoch) return
    if (!task) {
      researchWebBusy.value = false
      return
    }
    if (restore) researchRole.value = task.role
    researchNotice.value = task.message
    researchWebBusy.value = task.status === 'pending'
    if (task.sources.length || task.status === 'ready') {
      researchSourceRole.value = task.role
      researchSources.value = mergeResearchSources([], task.sources)
    }
  } catch (cause) {
    researchNotice.value = `读取小红书页面失败：${cause instanceof Error ? cause.message : String(cause)}`
    researchWebBusy.value = false
  } finally {
    xhsPolling = false
  }
}

async function stopWebResearch() {
  if (researchAutoBusy.value) {
    researchAutoController?.abort()
    researchAdviceController?.abort()
    await xhsResearch.cancel(true)
    return
  }
  researchEpoch++
  researchWebBusy.value = false
  const task = await xhsResearch.cancel(true)
  if (task) researchSources.value = task.sources
  researchNotice.value = '已停止读取，已保留取得的正文和评论。'
}

function changeResearchRole(value: string) {
  researchAutoController?.abort()
  researchRole.value = value
  researchPlan.value = defaultResearchPlan(value)
  researchPlanEdited.value = false
  researchEpoch++
  researchSources.value = []
  researchSummary.value = ''
  researchAdviceStatus.value = ''
  researchNotice.value = ''
  void xhsResearch.cancel()
}

async function createResearchAdvice() {
  if (researchAdviceBusy.value || analysisBusy.value || researchBusy.value || researchWebBusy.value)
    return
  if (!selectedProfile.value || !researchContentCount.value) {
    error.value = !selectedProfile.value
      ? '请先选择简历档案。'
      : '请先检索并读取帖子正文或导入内容。只有标题时无法生成有依据的修改意见。'
    return
  }
  const role = researchRole.value.trim()
  if (!role) {
    error.value = '请填写目标岗位后再生成建议。'
    return
  }
  const controller = new AbortController()
  const owner = profileContextEpoch
  const record = newAdviceRecord('research')
  let received = ''
  researchAdviceController = controller
  researchAdviceBusy.value = true
  researchSummary.value = ''
  researchAdviceStatus.value = '正在连接模型…'
  error.value = ''
  try {
    const result = await assistant.summarizeResearch(role, record.sources, record.profileSnapshot, {
      jobDescription: record.jobDescription,
      signal: controller.signal,
      onText: (text) => {
        received = text
        if (owner === profileContextEpoch) researchSummary.value = text
      },
      onStatus: (status) => {
        if (owner === profileContextEpoch) researchAdviceStatus.value = status
      },
    })
    received = result
    validateResearchCitations(result, record.sources)
    record.status = 'complete'
    if (owner === profileContextEpoch) {
      researchSummary.value = result
      researchAdviceStatus.value = '已完成'
    }
  } catch (cause) {
    if (owner !== profileContextEpoch) return
    if (controller.signal.aborted) researchAdviceStatus.value = '已停止生成，已保留收到的内容。'
    else {
      researchAdviceStatus.value = '生成未完成，已保留收到的内容。'
      error.value = cause instanceof Error ? cause.message : String(cause)
    }
  } finally {
    if (received.trim()) {
      record.text = received
      await saveAdviceRecord(record)
    }
    researchAdviceController = undefined
    researchAdviceBusy.value = false
  }
}

async function summarizePastedSource() {
  const url = pastedSourceUrl.value.trim()
  if (!url || !pastedSourceText.value.trim()) {
    error.value = '请填写笔记链接和可阅读的正文或摘要。'
    return
  }
  try {
    const parsed = new URL(url)
    if (
      !['xiaohongshu.com', 'www.xiaohongshu.com', 'xhslink.com', 'www.xhslink.com'].includes(
        parsed.hostname,
      )
    ) {
      throw new Error('请使用小红书笔记链接。')
    }
    const source = {
      title: pastedSourceTitle.value.trim() || '用户导入的小红书内容',
      author: '',
      url: parsed.toString(),
      excerpt: pastedSourceText.value.trim(),
      contentKind: 'pasted' as const,
    }
    await stopWebResearch()
    researchNotice.value = ''
    researchSummary.value = ''
    researchSourceRole.value =
      researchRole.value.trim() || selectedProfile.value?.targetRoles[0] || ''
    if (!researchSourceRole.value) throw new Error('请填写目标岗位后再生成建议。')
    researchSources.value = mergeResearchSources(researchSources.value, [source])
    await createResearchAdvice()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  }
}

async function startInterview() {
  const profile = selectedProfile.value
  const role = interviewRole.value.trim()
  if (!profile || !role) {
    error.value = '请先选择简历档案和目标岗位。'
    return
  }
  await interviewFlow.start({
    profile: jsonClone(profile),
    role,
    company: interviewCompany.value.trim(),
    jobDescription: interviewDescription.value.trim(),
  })
  interviews.value = await workbench.listInterviews()
}
async function submitInterviewAnswer() {
  await interviewFlow.submit()
  interviews.value = await workbench.listInterviews()
}
async function askNextQuestion() {
  await interviewFlow.next()
  interviews.value = await workbench.listInterviews()
}
async function finishInterview() {
  await interviewFlow.finish()
  interviews.value = await workbench.listInterviews()
}
async function removeInterview(session: CareerInterviewSession) {
  if (!window.confirm('删除这次模拟面试和复盘？此操作不可撤销。')) return
  try {
    if (currentSession.value?.id === session.id && !(await interviewFlow.close())) return
    interviews.value = await workbench.deleteInterview(session.id, session.revision)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  }
}
async function openInterview(session: CareerInterviewSession) {
  if (!(await interviewFlow.close())) return
  const latest = (await workbench.listInterviews()).find((item) => item.id === session.id)
  if (!latest) {
    error.value = '这次面试已被删除，请刷新记录。'
    return
  }
  await interviewFlow.open(
    latest,
    profiles.value.find((item) => item.id === session.profileId),
  )
  view.value = 'interview'
}
async function closeInterview() {
  await interviewFlow.close()
  interviews.value = await workbench.listInterviews()
}
async function openHistory(kind: 'history' | 'advice-history') {
  view.value = kind
  try {
    if (kind === 'history') interviews.value = await workbench.listInterviews()
    else adviceRecords.value = await workbench.listAdvice()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  }
}
function beforeLeave(event: BeforeUnloadEvent) {
  if (
    draftDirty.value ||
    pendingAdvice.value.length ||
    interviewFlow.state.dirty ||
    researchAutoBusy.value
  ) {
    event.preventDefault()
    event.returnValue = ''
  }
}

function openResearch() {
  view.value = 'research'
  if (!researchRole.value && selectedProfile.value?.targetRoles.length) {
    researchRole.value = selectedProfile.value.targetRoles[0] ?? ''
    researchPlan.value = defaultResearchPlan(researchRole.value)
  }
}

async function refresh() {
  loading.value = true
  error.value = ''
  try {
    profiles.value = await workbench.listProfiles()
    interviews.value = await workbench.listInterviews()
    adviceRecords.value = await workbench.listAdvice()
    if (selectedId.value) {
      const current = profiles.value.find((profile) => profile.id === selectedId.value)
      if (current) draft.value = jsonClone(current)
      else {
        selectedId.value = ''
        draft.value = null
      }
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    loading.value = false
  }
}

function newProfile(preserveImport = false) {
  if (!preserveImport && !allowDiscardDraft()) return
  if (!preserveImport) resetImportSource()
  clearProfileContext()
  selectedId.value = ''
  draft.value = createEmptyResumeProfile()
  saved.value = false
}

function editProfile(profile: ResumeProfile) {
  if (draft.value?.id !== profile.id && !allowDiscardDraft()) return
  if (draft.value?.id === profile.id && draftDirty.value) return
  resetImportSource()
  clearProfileContext(!draft.value)
  selectedId.value = profile.id
  draft.value = jsonClone(profile)
  saved.value = false
  void restoreResearchRun().catch(() => {
    researchNotice.value = '上次检索进度恢复失败，可重新开始。'
  })
}

function cancelEdit() {
  if (!allowDiscardDraft()) return
  resetImportSource()
  clearProfileContext()
  if (!selectedId.value) {
    draft.value = null
    return
  }
  const current = profiles.value.find((profile) => profile.id === selectedId.value)
  draft.value = current ? jsonClone(current) : null
}

function addExperience(
  section: 'workExperience' | 'internshipExperience' | 'educationExperience' | 'projects',
) {
  if (!draft.value) return
  const item: CareerExperience = {
    id: crypto.randomUUID(),
    title: '',
    organization: '',
    period: '',
    description: '',
  }
  draft.value[section].push(item)
}

function resetImportSource() {
  const oldToken = pendingBossImportToken.value || lastBossToken
  importEpoch++
  pendingBossImportToken.value = ''
  lastBossToken = ''
  bossImportBusy.value = false
  fileBusy.value = false
  bossImportedProfile.value = null
  bossImportMessage.value = ''
  resumeText.value = ''
  resumeFileName.value = ''
  recognitionMessage.value = ''
  importReviewed.value = false
  saved.value = false
  if (oldToken)
    void browser.runtime
      .sendMessage({ type: 'career-import-clear', token: oldToken })
      .catch(() => undefined)
  return importEpoch
}

async function readResumeFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const epoch = resetImportSource()
  fileBusy.value = true
  error.value = ''
  try {
    const text = await extractResumeText(file)
    if (epoch !== importEpoch) return
    resumeText.value = text
    resumeFileName.value = file.name
    if (!draft.value) newProfile(true)
  } catch (cause) {
    if (epoch === importEpoch) error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    if (epoch === importEpoch) fileBusy.value = false
    input.value = ''
  }
}

function receiveBossImport(state: BossImportState) {
  if (state.token !== pendingBossImportToken.value) return
  if (state.status === 'pending') {
    bossImportBusy.value = true
    bossImportMessage.value =
      '正在等待 Boss 在线简历加载。请在打开的标签页完成登录，并保持简历页打开。'
    return
  }
  bossImportBusy.value = false
  pendingBossImportToken.value = ''
  lastBossToken = state.token
  if (
    state.status === 'error' ||
    !state.content ||
    !state.profile ||
    !hasResumeFields(state.profile)
  ) {
    bossImportMessage.value =
      state.error || 'Boss 页面没有返回可识别的简历资料，请确认在线简历已加载后重试。'
    return
  }
  bossImportedProfile.value = state.profile
  resumeText.value = state.content
  resumeFileName.value = 'Boss 个人简历页'
  importReviewed.value = false
  if (!draft.value) newProfile(true)
  bossImportMessage.value = '已读取 Boss 在线简历。请点击“本地识别字段”，检查后保存。'
}

function onBossStorageChanged(changes: Record<string, { newValue?: unknown }>, areaName: string) {
  if (areaName !== 'local' || !pendingBossImportToken.value) return
  const state = changes[BOSS_IMPORT_KEY]?.newValue as BossImportState | undefined
  if (state) receiveBossImport(state)
}

async function syncBossImport(restore = false) {
  const epoch = importEpoch
  if (!restore && !pendingBossImportToken.value) return
  try {
    const state = (await browser.runtime.sendMessage({
      type: 'career-import-status',
    })) as BossImportState | null
    if (epoch !== importEpoch) return
    if (!state) {
      if (pendingBossImportToken.value) {
        bossImportBusy.value = false
        pendingBossImportToken.value = ''
        bossImportMessage.value = '本次导入已结束或过期，请重试。'
      }
      return
    }
    if (restore) pendingBossImportToken.value = state.token
    receiveBossImport(state)
  } catch (cause) {
    bossImportBusy.value = false
    pendingBossImportToken.value = ''
    bossImportMessage.value = `无法连接扩展后台，请重新加载扩展后重试：${cause instanceof Error ? cause.message : String(cause)}`
  }
}

async function startBossImport() {
  const epoch = resetImportSource()
  error.value = ''
  bossImportBusy.value = true
  try {
    const state = (await browser.runtime.sendMessage({ type: 'career-import-start' })) as
      | BossImportState
      | undefined
    if (epoch !== importEpoch) {
      if (state?.token)
        void browser.runtime.sendMessage({ type: 'career-import-clear', token: state.token })
      return
    }
    if (!state?.token) throw new Error('扩展后台未响应，请重新加载扩展后再试。')
    pendingBossImportToken.value = state.token
    receiveBossImport(state)
    await syncBossImport()
  } catch (cause) {
    if (epoch !== importEpoch) return
    bossImportBusy.value = false
    bossImportMessage.value = `无法开始 Boss 导入：${cause instanceof Error ? cause.message : String(cause)}`
  }
}

function mapExperience(items: ParsedResume['workExperience']): CareerExperience[] {
  return (items ?? []).map((item) => ({
    id: crypto.randomUUID(),
    title: item.title ?? '',
    organization: item.organization ?? '',
    period: item.period ?? '',
    description: item.description ?? '',
  }))
}

function recognizeResume() {
  if (!resumeText.value) return
  fieldBusy.value = true
  error.value = ''
  try {
    const extracted = bossImportedProfile.value ?? extractResumeFields(resumeText.value)
    if (!hasResumeFields(extracted))
      throw new Error(
        '未识别到可靠字段。请展开原文检查内容，并在下方手动填写；扫描版 PDF 需要先转成可复制文字的文件。',
      )
    const current = draft.value ?? createEmptyResumeProfile()
    draft.value = {
      ...current,
      name: extracted.name ?? '',
      location: extracted.location ?? '',
      education: extracted.education ?? '',
      workYears: extracted.workYears ?? '',
      targetRoles: extracted.targetRoles ?? [],
      workExperience: mapExperience(extracted.workExperience),
      internshipExperience: mapExperience(extracted.internshipExperience),
      educationExperience: mapExperience(extracted.educationExperience),
      projects: mapExperience(extracted.projects),
      selfIntroduction: extracted.selfIntroduction ?? '',
    }
    saved.value = false
    const missing = [
      !extracted.name && '姓名',
      !extracted.education && '学历',
      !extracted.targetRoles?.length && '目标岗位',
    ].filter(Boolean)
    recognitionMessage.value = `已填入可识别字段。${missing.length ? `未识别到：${missing.join('、')}，请核对并补充。` : '请核对经历和日期后保存。'}`
    importReviewed.value = true
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    fieldBusy.value = false
  }
}

async function saveProfile() {
  if (!draft.value || saving.value) return
  const submitted = jsonClone(draft.value)
  const submittedBossToken = lastBossToken
  saving.value = true
  error.value = ''
  try {
    profiles.value = await workbench.saveProfile(submitted)
    const stored = profiles.value.find((item) => item.id === submitted.id)!
    if (draft.value?.id === submitted.id) {
      selectedId.value = submitted.id
      draft.value = {
        ...jsonClone(draft.value),
        revision: stored.revision,
        updatedAt: stored.updatedAt,
      }
      saved.value = !draftDirty.value
      if (saved.value) importReviewed.value = false
    }
    if (submittedBossToken && lastBossToken === submittedBossToken) {
      void browser.runtime
        .sendMessage({ type: 'career-import-clear', token: submittedBossToken })
        .catch(() => undefined)
      lastBossToken = ''
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    saving.value = false
  }
}

async function removeProfile(profile: ResumeProfile) {
  if (!window.confirm(`删除“${profile.name || '未命名简历'}”？此操作不可撤销。`)) return
  try {
    profiles.value = await workbench.deleteProfile(profile.id, profile.revision)
    if (selectedId.value === profile.id) {
      resetImportSource()
      clearProfileContext()
      selectedId.value = ''
      draft.value = null
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  }
}

onMounted(() => {
  window.addEventListener('beforeunload', beforeLeave)
  browser.storage.onChanged.addListener(onBossStorageChanged)
  void refresh()
  void syncBossImport(true)
  void syncWebResearch(true)
  xhsPoll = window.setInterval(() => void syncWebResearch(), 1500)
  bossImportPoll = window.setInterval(() => void syncBossImport(), 1000)
})
onBeforeUnmount(() => {
  researchAutoController?.abort()
  window.removeEventListener('beforeunload', beforeLeave)
  browser.storage.onChanged.removeListener(onBossStorageChanged)
  void interviewFlow.close()
  importEpoch++
  window.clearInterval(bossImportPoll)
  researchEpoch++
  window.clearInterval(xhsPoll)
  analysisController?.abort()
  researchAdviceController?.abort()
})
</script>

<template>
  <section class="career-workbench space-y-5" aria-labelledby="career-title">
    <header class="workbench-heading">
      <div>
        <h2 id="career-title" class="text-xl font-semibold">{{ viewInfo[0] }}</h2>
        <p class="mt-1 text-sm text-muted">{{ viewInfo[1] }}</p>
      </div>
      <div v-if="view === 'resume'" class="flex flex-wrap gap-2">
        <input
          ref="fileInput"
          type="file"
          accept=".pdf,.docx,.txt,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          class="sr-only"
          @change="readResumeFile"
        />
        <UButton
          label="从 Boss 读取"
          icon="i-lucide-user-round-search"
          color="neutral"
          variant="outline"
          :loading="bossImportBusy"
          :disabled="fileBusy"
          @click="startBossImport"
        />
        <UButton
          label="导入简历文件"
          icon="i-lucide-upload"
          color="neutral"
          variant="outline"
          :loading="fileBusy"
          :disabled="bossImportBusy"
          @click="fileInput?.click()"
        />
        <UButton label="新建简历" icon="i-lucide-plus" @click="newProfile()" />
      </div>
    </header>
    <div class="workbench-context" aria-label="当前求职上下文">
      <div class="context-profile">
        <UIcon name="i-lucide-file-user" class="text-muted size-4 shrink-0" /><span
          class="text-xs text-muted"
          >当前简历</span
        ><USelect
          aria-label="当前简历"
          :model-value="selectedId || undefined"
          :items="
            profiles.map((profile) => ({ label: profile.name || '未命名简历', value: profile.id }))
          "
          :placeholder="draft ? '新建简历草稿' : '选择简历'"
          :disabled="
            loading ||
            saving ||
            analysisBusy ||
            researchAdviceBusy ||
            researchBusy ||
            researchWebBusy ||
            interviewBusy ||
            fileBusy ||
            bossImportBusy
          "
          @update:model-value="selectContext"
        /><span class="text-xs" :class="draftDirty ? 'text-warning' : 'text-muted'">{{
          draftDirty ? '有未保存修改' : selectedProfile ? '已保存版本' : '尚未选择'
        }}</span>
      </div>
      <span class="context-model text-xs text-muted" :title="configuredModelName"
        ><UIcon name="i-lucide-sparkles" />AI：{{ configuredModelName }}</span
      >
    </div>

    <OperationError :message="error" />
    <div v-if="pendingAdvice.length" class="rounded border border-warning p-3">
      <p class="text-sm">{{ pendingAdvice.length }} 条建议尚未保存，请保留页面并重试。</p>
      <div class="flex gap-2 mt-2">
        <UButton
          label="重试保存建议"
          size="sm"
          :loading="adviceRetryBusy"
          :disabled="adviceRetryBusy"
          @click="retryAdviceSave"
        />
        <UButton
          label="导出未保存建议"
          size="sm"
          variant="outline"
          color="neutral"
          @click="exportJson(pendingAdvice, '未保存的求职建议')"
        />
      </div>
    </div>
    <section v-if="view === 'resume'" class="space-y-5">
      <p v-if="bossImportMessage" role="status" class="text-sm text-muted">
        {{ bossImportMessage }}
      </p>

      <section v-if="resumeText" class="space-y-3 border-b border-default pb-5">
        <h3 class="text-sm font-semibold">导入预览：{{ resumeFileName }}</h3>
        <p class="text-sm text-muted">
          文件文字和字段识别均在本地完成，不会发送给
          AI。识别会用本次导入内容替换当前草稿字段，未识别字段留空；请核对后保存。
        </p>
        <details>
          <summary class="cursor-pointer text-sm">查看提取的原文</summary>
          <pre
            class="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded border border-default p-3 text-xs"
            >{{ resumeText }}</pre>
        </details>
        <UButton
          label="本地识别字段"
          icon="i-lucide-scan-text"
          :loading="fieldBusy"
          @click="recognizeResume"
        />
        <p v-if="recognitionMessage" role="status" class="text-sm text-muted">
          {{ recognitionMessage }}
        </p>
      </section>

      <p v-if="loading" role="status" class="py-8 text-sm text-muted">正在读取本地简历档案…</p>

      <div v-else class="resume-layout">
        <aside aria-label="简历档案" class="resume-list space-y-2">
          <p class="pb-1 text-xs font-medium text-muted">本地简历档案</p>
          <p v-if="profiles.length === 0" class="py-3 text-sm text-muted">
            还没有简历档案。新建一份，或稍后从文件和 Boss 个人资料导入。
          </p>
          <div
            v-for="profile in profiles"
            :key="profile.id"
            class="flex items-center gap-1 border-b border-default py-2"
          >
            <button
              class="min-w-0 flex-1 cursor-pointer text-left"
              :aria-current="selectedId === profile.id ? 'page' : undefined"
              @click="editProfile(profile)"
            >
              <span class="block truncate text-sm font-medium">{{
                profile.name || '未命名简历'
              }}</span>
              <span class="block truncate text-xs text-muted">
                {{ profile.targetRoles.join('、') || '尚未填写求职方向' }}
              </span>
            </button>
            <UButton
              icon="i-lucide-trash-2"
              color="error"
              variant="ghost"
              size="xs"
              :aria-label="`删除${profile.name || '未命名简历'}`"
              @click="removeProfile(profile)"
            />
          </div>
        </aside>

        <div v-if="draft" class="resume-editor space-y-5">
          <div class="flex items-center justify-between gap-3 border-b border-default pb-3">
            <h3 class="text-base font-semibold">
              {{ selectedId ? '编辑简历档案' : '新建简历档案' }}
            </h3>
            <span v-if="saved" role="status" class="text-sm text-success">已保存到本地</span>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="姓名"><UInput v-model="draft.name" class="w-full" /></UFormField>
            <UFormField label="所在城市"
              ><UInput v-model="draft.location" class="w-full"
            /></UFormField>
            <UFormField label="最高学历"
              ><UInput v-model="draft.education" class="w-full"
            /></UFormField>
            <UFormField label="工作年限"
              ><UInput v-model="draft.workYears" class="w-full"
            /></UFormField>
            <UFormField
              label="目标岗位"
              orientation="vertical"
              class="min-w-0 sm:col-span-2"
              description="填写职位名称，回车添加；可添加多个岗位。城市请填写在“所在城市”。"
            >
              <UInputTags
                v-model="draft.targetRoles"
                data-testid="target-roles"
                class="w-full"
                :ui="{ base: 'w-full min-h-11' }"
                placeholder="例如：安全工程师、Java 开发工程师"
                :delimiter="/[、,，;；\n]/"
                add-on-paste
                add-on-blur
              />
            </UFormField>
            <UFormField label="自我介绍" orientation="vertical" class="min-w-0 sm:col-span-2">
              <UTextarea
                v-model="draft.selfIntroduction"
                data-testid="self-introduction"
                :rows="6"
                autoresize
                class="w-full"
                :ui="{ base: 'w-full resize-y leading-relaxed' }"
                placeholder="介绍你的专业背景、核心技能和代表性经历，可分段填写。"
              />
            </UFormField>
          </div>

          <div class="space-y-6 border-t border-default pt-5">
            <section v-for="section in experienceSections" :key="section.key" class="space-y-3">
              <div class="flex items-center justify-between gap-3">
                <h4 class="text-sm font-semibold">{{ section.title }}</h4>
                <UButton
                  label="添加经历"
                  icon="i-lucide-plus"
                  size="sm"
                  color="neutral"
                  variant="outline"
                  @click="addExperience(section.key)"
                />
              </div>
              <div
                v-for="(item, index) in section.items"
                :key="item.id"
                class="space-y-3 border-b border-default pb-4"
              >
                <div class="flex items-center justify-between">
                  <span class="text-xs text-muted">{{ section.title }} {{ index + 1 }}</span>
                  <UButton
                    icon="i-lucide-trash-2"
                    color="error"
                    variant="ghost"
                    size="xs"
                    :aria-label="`删除${section.title}${index + 1}`"
                    @click="removeExperience(section.key, item.id)"
                  />
                </div>
                <div class="grid gap-3 sm:grid-cols-2">
                  <UFormField
                    :label="
                      section.key === 'educationExperience'
                        ? '专业'
                        : section.key === 'projects'
                          ? '项目名称/角色'
                          : '岗位/职务'
                    "
                    orientation="vertical"
                  >
                    <UInput
                      v-model="item.title"
                      class="w-full"
                      :placeholder="
                        section.key === 'educationExperience' ? '例如：软件工程' : '填写名称或职务'
                      "
                    />
                  </UFormField>
                  <UFormField
                    :label="section.key === 'educationExperience' ? '学校' : '公司/组织'"
                    orientation="vertical"
                  >
                    <UInput
                      v-model="item.organization"
                      class="w-full"
                      :placeholder="
                        section.key === 'educationExperience' ? '学校名称' : '公司或组织名称'
                      "
                    />
                  </UFormField>
                  <UFormField label="起止时间" orientation="vertical">
                    <UInput
                      v-model="item.period"
                      class="w-full"
                      placeholder="例如：2024.09 - 至今"
                    />
                  </UFormField>
                </div>
                <UTextarea
                  v-model="item.description"
                  :rows="3"
                  class="w-full"
                  placeholder="职责、成果或经历描述"
                />
              </div>
            </section>
          </div>

          <div class="flex flex-wrap items-center gap-3 border-t border-default pt-4">
            <UButton
              :label="importReviewed ? '确认并保存导入结果' : '保存简历'"
              icon="i-lucide-save"
              :loading="saving"
              @click="saveProfile"
            />
            <UButton label="取消编辑" color="neutral" variant="outline" @click="cancelEdit" />
          </div>

          <p class="text-xs text-muted">
            资料仅保存在此扩展的本地存储中。导入或保存不会发送给 AI。
          </p>
        </div>

        <div v-else-if="!loading" class="border-l border-default pl-5 text-sm text-muted">
          选择已有档案，或新建一份简历档案。
        </div>
      </div>
    </section>

    <section v-else-if="view === 'research'" class="research-layout">
      <div class="research-toolbar space-y-2">
        <h3 class="text-base font-semibold">岗位相关经验与简历建议</h3>
        <p class="text-sm text-muted">
          点击“检索并分析经验”会使用当前 AI 配置规划搜索、筛选帖子及识别图片，并将当前简历、可选 JD
          和已选来源用于生成建议。搜索网站只接收岗位与经验关键词。
        </p>
        <div class="flex flex-wrap items-end gap-2">
          <UFormField label="目标岗位" orientation="vertical" class="min-w-60 flex-1">
            <UInput
              :model-value="researchRole"
              data-testid="research-role"
              :disabled="researchBusy || researchWebBusy || researchAdviceBusy || analysisBusy"
              @update:model-value="changeResearchRole"
              class="w-full"
              placeholder="例如：Java 后端工程师"
            />
          </UFormField>
          <UButton
            label="检索并分析经验"
            icon="i-lucide-external-link"
            :loading="researchAutoBusy"
            :disabled="
              researchBusy ||
              researchWebBusy ||
              researchAdviceBusy ||
              analysisBusy ||
              !selectedProfile
            "
            @click="runAutomaticResearch(false)"
          />
          <UButton
            label="打开小红书搜索"
            :disabled="researchBusy || researchAutoBusy || researchAdviceBusy || analysisBusy"
            variant="outline"
            icon="i-lucide-search"
            :loading="researchWebBusy"
            @click="startWebResearch"
          />
        </div>
        <p class="text-xs text-muted">
          “检索并分析经验”先由 AI 规划，再打开网页；“打开小红书搜索”直接打开站内搜索，不调用 AI。
        </p>
        <UFormField label="职位描述 JD（可选，仅用于判断经验适用性）" orientation="vertical">
          <UTextarea
            v-model="researchJd"
            :rows="2"
            class="w-full"
            :disabled="researchAutoBusy || researchAdviceBusy"
            placeholder="粘贴岗位职责和要求，不填也能使用"
          />
        </UFormField>
        <details class="research-plan">
          <summary>
            搜索计划 · {{ researchPlan.direction || researchRole || '填写岗位后生成' }}
            <span class="text-muted">（可调整）</span>
          </summary>
          <p class="text-xs text-muted my-2">
            未手动编辑时，开始后 AI 会细化搜索词。修改任一词后使用你的计划；首轮最多 4 组、30
            条候选、6 篇正文，每篇最多 3 张图片。
          </p>
          <div
            v-for="(query, index) in researchPlan.queries"
            :key="index"
            class="flex items-center gap-2 my-2"
          >
            <span class="text-xs text-muted shrink-0"
              >{{ index + 1 }} · {{ query.scope === 'direct' ? '同岗位' : '不足时补充' }}</span
            >
            <UInput
              v-model="query.text"
              class="flex-1"
              :disabled="researchAutoBusy || researchAdviceBusy"
              :aria-label="'搜索词 ' + (index + 1)"
              @update:model-value="researchPlanEdited = true"
            />
          </div>
          <div class="flex flex-wrap gap-2">
            <UButton
              v-if="researchSources.length"
              label="保留来源并补充检索"
              size="sm"
              variant="outline"
              :disabled="researchBusy || researchWebBusy || researchAdviceBusy || researchAutoBusy"
              @click="runAutomaticResearch(true)"
            />
          </div>
        </details>
        <details class="research-plan" data-testid="research-fallback">
          <summary>备用方式 · 公开索引检索</summary>
          <p class="my-2 text-xs text-muted">
            查询 Bing 已收录的小红书笔记，不打开小红书网页、不调用
            AI。收录可能不完整，无结果不代表站内没有相关帖子。
          </p>
          <UButton
            label="公开索引检索"
            size="sm"
            variant="outline"
            icon="i-lucide-search"
            :loading="researchBusy && !researchAutoBusy"
            :disabled="
              researchBusy ||
              researchAutoBusy ||
              researchWebBusy ||
              researchAdviceBusy ||
              analysisBusy
            "
            @click="searchResearch"
          />
        </details>
      </div>

      <div v-if="researchNotice" class="space-y-2 rounded border border-default p-3">
        <p role="status" class="text-sm">{{ researchNotice }}</p>
        <UButton
          v-if="publicResearchFailed"
          label="改用小红书网页搜索"
          size="sm"
          variant="outline"
          icon="i-lucide-external-link"
          :disabled="
            researchBusy ||
            researchAutoBusy ||
            researchWebBusy ||
            researchAdviceBusy ||
            analysisBusy
          "
          @click="startWebResearch"
        />
        <UButton
          v-if="researchWebBusy || researchAutoBusy"
          label="停止并保留进度"
          size="sm"
          color="neutral"
          variant="outline"
          @click="stopWebResearch"
        />
      </div>
      <div class="research-columns">
        <div class="research-source-column">
          <section class="research-sources space-y-3">
            <h3 class="panel-title">
              <UIcon name="i-lucide-library" />经验来源
              <span class="text-muted text-xs font-normal">{{ researchSources.length }} 条</span>
            </h3>
            <div v-if="!researchSources.length" class="product-empty">
              <UIcon name="i-lucide-search" class="size-7 text-muted" />
              <p>
                {{ researchBusy || researchWebBusy ? '正在检索岗位相关经验…' : '还没有经验来源' }}
              </p>
              <p class="text-xs text-muted">输入目标岗位开始检索，也可粘贴链接和正文。</p>
            </div>
            <p class="text-sm text-muted">
              相关帖子优先参考收藏和点赞；仅比较本次候选，未知数据不等于
              0。可手动选用或排除来源；只有标题或摘要的帖子不用于具体改写。
            </p>
            <article
              v-for="(source, sourceIndex) in researchSources"
              :key="source.url"
              class="border-b border-default pb-3"
            >
              <div class="research-source-heading">
                <span
                  class="research-source-number"
                  :aria-label="`来源 ${source.sourceId ?? sourceIndex + 1}`"
                >
                  {{ String(source.sourceId ?? sourceIndex + 1).padStart(2, '0') }}
                </span>
                <a
                  :href="source.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="font-medium text-primary"
                  >{{ source.title }}</a
                >
              </div>
              <div class="research-source-meta">
                <span>收藏 {{ source.collects == null ? '未知' : source.collects }}</span>
                <span>点赞 {{ source.likes == null ? '未知' : source.likes }}</span>
                <span v-if="source.relevance">{{
                  {
                    direct: '同岗位',
                    adjacent: '邻近方向',
                    unrelated: '不相关',
                    unknown: '待审核',
                  }[source.relevance]
                }}</span>
                <UButton
                  :label="source.selected === false ? '选用此来源' : '已选用 · 排除'"
                  size="xs"
                  :variant="source.selected === false ? 'outline' : 'soft'"
                  :disabled="researchAutoBusy || researchAdviceBusy || researchWebBusy"
                  @click="toggleResearchSource(source)"
                />
              </div>
              <p v-if="source.relevanceReason" class="mt-1 text-xs text-muted">
                {{ source.relevanceReason }}
              </p>
              <p v-if="source.query" class="mt-1 text-xs text-muted">检索词：{{ source.query }}</p>
              <p v-if="source.imageStatus" class="mt-1 text-xs text-muted">
                {{ source.imageStatus }}
              </p>
              <UButton
                v-if="source.images?.length"
                label="识别图片（使用当前 AI）"
                size="xs"
                variant="outline"
                class="mt-2"
                :disabled="
                  researchBusy || researchAutoBusy || researchWebBusy || researchAdviceBusy
                "
                @click="recognizeSourceImages(source)"
              />
              <details v-if="source.imageText" class="mt-2 text-sm">
                <summary class="cursor-pointer">查看图片识别文字</summary>
                <p class="whitespace-pre-wrap mt-2">{{ source.imageText }}</p>
              </details>
              <p class="mt-1 text-xs text-muted">
                {{ sourceKindLabels[source.contentKind || 'search-snippet'] }}
              </p>
              <p v-if="source.author" class="mt-1 text-xs text-muted">{{ source.author }}</p>
              <p class="mt-1 whitespace-pre-wrap text-sm text-muted">{{ source.excerpt }}</p>
              <div v-if="source.commentCoverage" class="mt-3 space-y-2">
                <h5 class="text-sm font-medium">
                  高赞评论 · 已加载评论中前 {{ source.comments?.length || 0 }} 条
                </h5>
                <p class="text-xs text-muted" data-testid="comment-coverage">
                  {{ source.commentCoverage.message }}
                </p>
                <ol v-if="source.comments?.length" class="space-y-2" data-testid="source-comments">
                  <li
                    v-for="comment in source.comments"
                    :key="comment.id"
                    class="rounded border border-default p-2"
                  >
                    <p class="text-xs text-muted">
                      {{ comment.author || '匿名用户' }} · {{ comment.likes }} 赞
                    </p>
                    <p class="mt-1 whitespace-pre-wrap text-sm">{{ comment.text }}</p>
                  </li>
                </ol>
              </div>
              <p v-if="source.readError" class="mt-2 text-sm text-warning">
                {{ source.readError }}
              </p>
              <UButton
                v-if="source.contentKind !== 'pasted'"
                :label="
                  source.contentKind === 'visible-note' ? '重新读取正文和评论' : '读取正文和评论'
                "
                class="mt-2"
                size="sm"
                variant="outline"
                :disabled="researchBusy || researchWebBusy || researchAdviceBusy || analysisBusy"
                @click="readResearchNote(source)"
              />
            </article>
          </section>

          <details class="border-t border-default pt-4">
            <summary class="cursor-pointer text-sm font-medium">
              自动检索受限？粘贴笔记链接和内容
            </summary>
            <div class="mt-3 space-y-3">
              <UInput v-model="pastedSourceTitle" class="w-full" placeholder="笔记标题（可选）" />
              <UInput v-model="pastedSourceUrl" class="w-full" placeholder="小红书笔记链接" />
              <UTextarea
                v-model="pastedSourceText"
                class="w-full"
                :rows="5"
                placeholder="粘贴笔记正文或摘要"
              />
              <UButton
                label="导入链接并整理建议"
                :disabled="researchBusy || researchAdviceBusy || analysisBusy"
                icon="i-lucide-sparkles"
                @click="summarizePastedSource"
              />
            </div>
          </details>
        </div>
        <div class="research-result-column">
          <div class="advice-result space-y-3">
            <h3 class="panel-title"><UIcon name="i-lucide-notebook-pen" />修改建议</h3>
            <div class="space-y-2 border-y border-default py-3">
              <p class="text-sm">
                当前简历：{{
                  selectedProfile?.name ||
                  (selectedProfile ? '未命名简历' : '请先在简历档案中选择一份简历')
                }}
              </p>
              <p class="text-sm text-muted">
                先汇总博主经验、共识与分歧，再结合简历给出整体修改方向及关键段落改写。调整来源后可重新生成。
              </p>
              <UButton
                label="根据检索内容和简历生成修改意见"
                data-testid="generate-research-advice"
                icon="i-lucide-sparkles"
                :loading="researchAdviceBusy"
                :disabled="
                  !selectedProfile ||
                  !researchContentCount ||
                  analysisBusy ||
                  researchBusy ||
                  researchWebBusy ||
                  researchAutoBusy
                "
                @click="createResearchAdvice"
              />
              <p class="text-xs text-muted">
                {{
                  researchContentCount
                    ? `已选用 ${researchContentCount} 条正文或已识别图片证据，将与简历、JD 一起提交给 AI。`
                    : '尚无可用证据。请开始检索并分析，或手动读取、导入帖子内容。'
                }}
              </p>
            </div>
            <div v-if="!researchAdviceStatus && !researchSummary" class="product-empty">
              <UIcon name="i-lucide-text-cursor-input" class="size-7 text-muted" />
              <p>让经验转化为具体修改</p>
              <p class="text-xs text-muted">
                先检索并读取来源，再点击生成修改意见。<br />结果会保存在建议记录中。
              </p>
            </div>
            <div class="flex items-center gap-3">
              <p v-if="researchAdviceStatus" role="status" class="text-sm text-muted">
                {{ researchAdviceStatus }}
              </p>
              <UButton
                v-if="researchAdviceBusy"
                label="停止生成"
                color="neutral"
                variant="outline"
                size="sm"
                @click="stopResearchAdvice"
              />
            </div>
            <div v-if="researchSummary" class="space-y-2">
              <h4 class="text-sm font-semibold">基于检索内容的简历修改意见 · {{ researchRole }}</h4>
              <div
                data-testid="research-advice"
                class="max-w-none rounded border border-default bg-elevated/30 p-4 font-sans text-sm leading-6 whitespace-pre-wrap wrap-anywhere"
              >
                {{ researchSummary }}
              </div>
            </div>
          </div>
          <details v-if="selectedProfile" class="resume-peek">
            <summary>查看当前简历内容</summary>
            <p class="text-xs text-muted mt-2">
              {{ selectedProfile.name }} · {{ selectedProfile.targetRoles.join('、') }}
            </p>
            <p class="whitespace-pre-wrap text-sm mt-2">{{ selectedProfile.selfIntroduction }}</p>
            <div
              v-for="item in [
                ...selectedProfile.workExperience,
                ...selectedProfile.internshipExperience,
                ...selectedProfile.educationExperience,
                ...selectedProfile.projects,
              ]"
              :key="item.id"
              class="mt-3 text-sm"
            >
              <strong>{{ item.title }} · {{ item.organization }}</strong>
              <p class="text-xs text-muted">{{ item.period }}</p>
              <p class="whitespace-pre-wrap">{{ item.description }}</p>
            </div>
          </details>
          <details v-if="selectedProfile" class="border-t border-default pt-4">
            <summary class="cursor-pointer text-sm text-muted">
              可选：仅分析简历（不使用检索内容）
            </summary>
            <div v-if="selectedProfile" class="space-y-2 border-y border-default py-3">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <p class="text-sm">当前简历：{{ selectedProfile.name || '未命名简历' }}</p>
                <UButton
                  label="仅根据简历分析方向和修改点"
                  icon="i-lucide-sparkles"
                  :loading="analysisBusy"
                  :disabled="researchAdviceBusy"
                  @click="analyzeResume"
                />
              </div>
              <div class="flex items-center gap-3">
                <p v-if="analysisStatus" role="status" class="text-sm text-muted">
                  {{ analysisStatus }}
                </p>
                <UButton
                  v-if="analysisBusy"
                  label="停止生成"
                  color="neutral"
                  variant="outline"
                  size="sm"
                  @click="stopAnalysis"
                />
              </div>
              <pre
                v-if="analysis"
                data-testid="resume-analysis"
                class="whitespace-pre-wrap text-sm"
                >{{ analysis }}</pre>
            </div>
          </details>
        </div>
      </div>
    </section>

    <section v-else-if="view === 'interview'" class="interview-layout space-y-5">
      <OperationError :message="interviewFlow.state.error || ''" />
      <p v-if="interviewFlow.state.status" role="status" class="text-sm text-muted">
        {{ interviewFlow.state.status }}
      </p>
      <UButton
        v-if="interviewFlow.state.generating"
        label="停止生成"
        color="neutral"
        variant="outline"
        @click="interviewFlow.stop()"
      />
      <div v-if="!currentSession" class="space-y-4">
        <div>
          <h3 class="text-base font-semibold">文字模拟面试</h3>
          <p class="mt-1 text-sm text-muted">
            开始后会把选中的简历和岗位信息发送给现有 AI 配置的模型。
          </p>
        </div>
        <UFormField label="使用简历档案">
          <USelect
            :model-value="selectedId"
            :items="
              profiles.map((profile) => ({
                label: profile.name || '未命名简历',
                value: profile.id,
              }))
            "
            class="w-full"
            @update:model-value="
              (value: string | undefined) => {
                const profile = profiles.find((item) => item.id === value)
                if (profile) editProfile(profile)
              }
            "
          />
        </UFormField>
        <UFormField label="目标岗位">
          <USelect
            v-if="selectedProfile?.targetRoles.length"
            v-model="interviewRole"
            :items="selectedProfile.targetRoles.map((role) => ({ label: role, value: role }))"
            class="w-full"
          />
          <UInput v-else v-model="interviewRole" class="w-full" placeholder="填写目标岗位" />
        </UFormField>
        <UFormField label="公司（可选）"
          ><UInput v-model="interviewCompany" class="w-full"
        /></UFormField>
        <UFormField label="职位描述（可选）"
          ><UTextarea v-model="interviewDescription" class="w-full" :rows="4"
        /></UFormField>
        <UButton
          label="开始模拟面试"
          icon="i-lucide-message-square-text"
          :loading="interviewBusy"
          @click="startInterview"
        />
      </div>

      <div v-else class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-default pb-3">
          <div>
            <h3 class="text-base font-semibold">{{ currentSession.role }} 面试</h3>
            <p v-if="currentSession.company" class="text-sm text-muted">
              {{ currentSession.company }}
            </p>
          </div>
          <UButton
            label="保存并退出练习"
            color="neutral"
            variant="outline"
            @click="closeInterview"
          />
        </div>
        <div v-if="currentQuestion" class="space-y-3">
          <h4 class="text-sm font-semibold">
            {{ currentSession.answers.length + 1 }}. {{ currentQuestion }}
          </h4>
          <UTextarea
            v-model="interviewAnswer"
            class="w-full"
            :rows="5"
            placeholder="输入你的回答，草稿自动保存在本地"
            :disabled="interviewBusy"
          />
          <UButton
            label="提交回答"
            icon="i-lucide-send"
            :disabled="!interviewAnswer.trim() || interviewBusy"
            :loading="interviewBusy"
            @click="submitInterviewAnswer"
          />
        </div>
        <div v-else-if="!currentSession.answers.length && !currentSession.review" class="space-y-3">
          <p class="text-sm text-muted">面试尚未开始提问，可以重试生成第一题。</p>
          <UButton
            label="重试第一题"
            icon="i-lucide-refresh-cw"
            :loading="interviewBusy"
            @click="askNextQuestion"
          />
        </div>
        <div v-else-if="currentSession.review" class="space-y-2">
          <h4 class="text-sm font-semibold">面试复盘</h4>
          <pre class="whitespace-pre-wrap text-sm">{{ currentSession.review }}</pre>
        </div>
        <div v-else-if="currentSession.answers.length" class="flex flex-wrap gap-2">
          <UButton
            label="下一题"
            icon="i-lucide-arrow-right"
            :loading="interviewBusy"
            @click="askNextQuestion"
          />
          <UButton
            label="生成复盘"
            icon="i-lucide-clipboard-check"
            :loading="interviewBusy"
            color="neutral"
            variant="outline"
            @click="finishInterview"
          />
        </div>
        <details v-if="currentSession.answers.length" class="interview-transcript">
          <summary>历史问答 · {{ currentSession.answers.length }} 题</summary>
          <div
            v-for="(entry, index) in currentSession.answers"
            :key="index"
            class="space-y-2 border-b border-default pb-3"
          >
            <p class="text-sm font-medium">{{ index + 1 }}. {{ entry.question }}</p>
            <p class="whitespace-pre-wrap text-sm text-muted">{{ entry.answer }}</p>
          </div>
        </details>
      </div>
    </section>

    <section v-else-if="view === 'history'" class="space-y-4">
      <h3 class="text-base font-semibold">面试复盘记录</h3>
      <p v-if="!interviews.length" class="text-sm text-muted">
        练习会自动保存，未完成的面试也可以在此继续。
      </p>
      <article
        v-for="session in interviews"
        :key="session.id"
        class="flex flex-wrap items-start justify-between gap-3 border-b border-default py-3"
      >
        <button class="min-w-0 flex-1 cursor-pointer text-left" @click="openInterview(session)">
          <span class="block font-medium"
            >{{ session.role }}{{ session.company ? ` · ${session.company}` : '' }}</span
          >
          <span class="block text-xs text-muted"
            >{{ new Date(session.updatedAt).toLocaleString() }} ·
            {{ session.answers.length }} 道问答 ·
            {{ session.review ? '已完成' : '进行中，可继续' }}</span
          >
          <span class="mt-1 block whitespace-pre-wrap text-sm text-muted">{{
            session.review || '尚未生成复盘'
          }}</span>
        </button>
        <UButton
          icon="i-lucide-trash-2"
          color="error"
          variant="ghost"
          :aria-label="`删除${session.role}面试记录`"
          @click="removeInterview(session)"
        />
      </article>
    </section>
    <section v-else class="space-y-4" aria-label="本地建议记录">
      <h3 class="text-base font-semibold">建议记录</h3>
      <p class="text-sm text-muted">
        保存生成时的简历、目标岗位和来源。旧建议仅对应当时的简历版本，不会自动覆盖当前简历。
      </p>
      <p v-if="!adviceRecords.length" class="text-sm text-muted">
        还没有建议记录。生成分析或修改意见后会保存在这里。
      </p>
      <article
        v-for="record in adviceRecords"
        :key="record.id"
        class="space-y-3 rounded border border-default p-4"
        data-testid="advice-record"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 class="font-medium">
              {{ record.profileSnapshot.name || '未命名简历' }} ·
              {{ record.role || '求职方向分析' }}
            </h4>
            <p class="text-xs text-muted">
              {{ new Date(record.createdAt).toLocaleString() }} ·
              {{ record.kind === 'research' ? '来源修改建议' : '简历分析' }} ·
              {{ record.status === 'partial' ? '部分生成内容' : '生成完成' }} · {{ record.model }}
            </p>
          </div>
          <div class="flex gap-2">
            <UButton
              :label="record.done ? '已处理，标回待处理' : '标记已处理'"
              size="sm"
              color="neutral"
              variant="outline"
              @click="toggleAdvice(record)"
            />
            <UButton
              label="删除记录"
              size="sm"
              color="error"
              variant="ghost"
              @click="removeAdvice(record)"
            />
          </div>
        </div>
        <pre class="whitespace-pre-wrap text-sm">{{ record.text }}</pre>
        <details>
          <summary class="cursor-pointer text-sm">查看分析时的简历快照</summary>
          <pre class="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs">{{
            JSON.stringify(record.profileSnapshot, null, 2)
          }}</pre>
        </details>
        <details v-if="record.sources.length">
          <summary class="cursor-pointer text-sm">
            核对 {{ record.sources.length }} 条来源和读取范围
          </summary>
          <div
            v-for="source in record.sources"
            :key="source.url"
            class="mt-3 space-y-1 border-t border-default pt-2 text-sm"
          >
            <a
              :href="source.url"
              target="_blank"
              rel="noopener noreferrer"
              class="text-primary underline"
              >{{ source.title }}</a
            >
            <p class="text-xs text-muted">
              {{ source.author || '作者未识别' }} ·
              {{ sourceKindLabels[source.contentKind || ''] || '导入内容' }}
            </p>
            <p class="whitespace-pre-wrap">{{ source.excerpt }}</p>
            <p v-if="source.commentCoverage" class="text-xs text-muted">
              {{ source.commentCoverage.message }}
            </p>
            <p v-for="comment in source.comments || []" :key="comment.id" class="text-xs">
              {{ comment.author }} · {{ comment.likesText }} 赞：{{ comment.text }}
            </p>
          </div>
        </details>
      </article>
    </section>
  </section>
</template>
