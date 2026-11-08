<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import { createCareerAssistant, hasResearchContent } from '@/composables/careerAi'
import type { ParsedResume } from '@/composables/careerAi'
import { runCareerCompletion } from '@/composables/careerCompletion'
import type { CareerCompletionOptions } from '@/composables/careerCompletion'
import { useConf } from '@/composables/conf'
import { searchPublicXiaohongshu } from '@/composables/publicResearch'
import type { PublicCareerSource } from '@/composables/publicResearch'
import { extractResumeText } from '@/composables/resumeImport'
import { createCareerWorkbench, createEmptyResumeProfile } from '@/composables/useCareerWorkbench'
import type { ResumeProfile } from '@/composables/useCareerWorkbench'
import type { CareerExperience } from '@/composables/useCareerWorkbench'
import type { CareerInterviewSession } from '@/composables/useCareerWorkbench'
import { useModel } from '@/composables/useModel'
import { createModel } from '@/composables/useModel/providers'
import { counter } from '@/message'
import { BOSS_IMPORT_KEY } from '@/utils/bossResumeImport'
import type { BossImportState } from '@/utils/bossResumeImport'
import { jsonClone } from '@/utils/deepmerge'
import { extractResumeFields, hasResumeFields } from '@/utils/resumeFields'
import { createXiaohongshuResearch } from '@/utils/xiaohongshuResearch'

const workbench = createCareerWorkbench(counter)
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
const view = ref<'resume' | 'research' | 'interview' | 'history'>('resume')
const analysis = ref('')
const analysisBusy = ref(false)
const analysisStatus = ref('')
let analysisController: AbortController | undefined
const researchAdviceBusy = ref(false)
const researchAdviceStatus = ref('')
let researchAdviceController: AbortController | undefined
const researchRole = ref('')
const researchSources = ref<PublicCareerSource[]>([])
const researchSummary = ref('')
const researchContentCount = computed(() => researchSources.value.filter(hasResearchContent).length)
const researchBusy = ref(false)
const researchWebBusy = ref(false)
const researchNotice = ref('')
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
const currentSession = ref<CareerInterviewSession | null>(null)
const currentQuestion = ref('')
const interviewAnswer = ref('')
const interviewBusy = ref(false)
const interviews = ref<CareerInterviewSession[]>([])
const selectedProfile = computed(
  () => profiles.value.find((profile) => profile.id === selectedId.value) ?? draft.value,
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

async function analyzeResume() {
  if (!selectedProfile.value || analysisBusy.value || researchAdviceBusy.value) return
  const controller = new AbortController()
  analysisController = controller
  analysisBusy.value = true
  analysis.value = ''
  analysisStatus.value = '正在连接模型…'
  error.value = ''
  try {
    analysis.value = await assistant.analyzeResume(selectedProfile.value, {
      signal: controller.signal,
      onText: (text) => {
        analysis.value = text
      },
      onStatus: (status) => {
        analysisStatus.value = status
      },
    })
    analysisStatus.value = '已完成'
  } catch (cause) {
    if (controller.signal.aborted) analysisStatus.value = '已停止生成，已保留收到的内容。'
    else {
      analysisStatus.value = '生成未完成，已保留收到的内容。'
      error.value = cause instanceof Error ? cause.message : String(cause)
    }
  } finally {
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

async function searchResearch() {
  const role = prepareResearch()
  if (!role) return
  const epoch = researchEpoch
  researchBusy.value = true
  try {
    await xhsResearch.cancel()
    const results = await searchPublicXiaohongshu(role)
    if (epoch !== researchEpoch) return
    researchSources.value = results.slice(0, 8)
    researchSourceRole.value = role
    researchNotice.value = `检索完成：找到 ${researchSources.value.length} 条帖子。请手动点击感兴趣帖子下方的“读取正文和评论”。`
  } catch (cause) {
    if (epoch === researchEpoch) {
      researchWebBusy.value = false
      researchNotice.value = cause instanceof Error ? cause.message : String(cause)
    }
  } finally {
    if (epoch === researchEpoch) researchBusy.value = false
  }
}

async function startWebResearch() {
  const role = prepareResearch()
  if (!role) return
  researchWebBusy.value = true
  try {
    const task = await xhsResearch.start(role)
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

async function syncWebResearch(restore = false) {
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
      researchSources.value = task.sources
    }
  } catch (cause) {
    researchNotice.value = `读取小红书页面失败：${cause instanceof Error ? cause.message : String(cause)}`
    researchWebBusy.value = false
  } finally {
    xhsPolling = false
  }
}

async function stopWebResearch() {
  researchEpoch++
  researchWebBusy.value = false
  const task = await xhsResearch.cancel(true)
  if (task) researchSources.value = task.sources
  researchNotice.value = '已停止读取，已保留取得的正文和评论。'
}

function changeResearchRole(value: string) {
  researchRole.value = value
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
  researchAdviceController = controller
  researchAdviceBusy.value = true
  researchSummary.value = ''
  researchAdviceStatus.value = '正在连接模型…'
  error.value = ''
  try {
    researchSummary.value = await assistant.summarizeResearch(
      role,
      researchSources.value,
      selectedProfile.value ?? undefined,
      {
        signal: controller.signal,
        onText: (text) => {
          researchSummary.value = text
        },
        onStatus: (status) => {
          researchAdviceStatus.value = status
        },
      },
    )
    researchAdviceStatus.value = '已完成'
  } catch (cause) {
    if (controller.signal.aborted) researchAdviceStatus.value = '已停止生成，已保留收到的内容。'
    else {
      researchAdviceStatus.value = '生成未完成，已保留收到的内容。'
      error.value = cause instanceof Error ? cause.message : String(cause)
    }
  } finally {
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
    researchSources.value = [source]
    await createResearchAdvice()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  }
}

async function startInterview() {
  const profile = selectedProfile.value
  const role = interviewRole.value.trim()
  if (!profile || !role) {
    error.value = '请先选择或填写一份简历档案和目标岗位。'
    return
  }
  interviewBusy.value = true
  error.value = ''
  try {
    const savedProfiles = await workbench.saveProfile(profile)
    profiles.value = savedProfiles
    const savedProfile = savedProfiles.find((item) => item.id === profile.id)!
    currentSession.value = {
      id: crypto.randomUUID(),
      profileId: savedProfile.id,
      role,
      company: interviewCompany.value.trim(),
      jobDescription: interviewDescription.value.trim(),
      answers: [],
      review: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    await workbench.saveInterview(currentSession.value)
    interviews.value = await workbench.listInterviews()
    currentQuestion.value = await assistant.nextInterviewQuestion(
      savedProfile,
      role,
      interviewCompany.value.trim(),
      interviewDescription.value.trim(),
      [],
    )
    await workbench.saveInterview(currentSession.value)
    interviews.value = await workbench.listInterviews()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    interviewBusy.value = false
  }
}

async function submitInterviewAnswer() {
  if (!currentSession.value || !currentQuestion.value || !interviewAnswer.value.trim()) return
  currentSession.value.answers.push({
    question: currentQuestion.value,
    answer: interviewAnswer.value.trim(),
  })
  interviewAnswer.value = ''
  currentQuestion.value = ''
  await workbench.saveInterview(currentSession.value)
  interviews.value = await workbench.listInterviews()
}

async function askNextQuestion() {
  if (!currentSession.value) return
  const profile = profiles.value.find((item) => item.id === currentSession.value?.profileId)
  if (!profile) return
  interviewBusy.value = true
  error.value = ''
  try {
    currentQuestion.value = await assistant.nextInterviewQuestion(
      profile,
      currentSession.value.role,
      currentSession.value.company,
      currentSession.value.jobDescription,
      currentSession.value.answers,
    )
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    interviewBusy.value = false
  }
}

async function finishInterview() {
  if (!currentSession.value || !currentSession.value.answers.length) return
  interviewBusy.value = true
  error.value = ''
  try {
    currentSession.value.review = await assistant.reviewInterview(
      currentSession.value.role,
      currentSession.value.answers,
    )
    await workbench.saveInterview(currentSession.value)
    interviews.value = await workbench.listInterviews()
    currentQuestion.value = ''
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    interviewBusy.value = false
  }
}

async function removeInterview(session: CareerInterviewSession) {
  if (!window.confirm('删除这次模拟面试和复盘？此操作不可撤销。')) return
  interviews.value = await workbench.deleteInterview(session.id)
  if (currentSession.value?.id === session.id) currentSession.value = null
}

function openInterview(session: CareerInterviewSession) {
  currentSession.value = jsonClone(session)
  currentQuestion.value = ''
  view.value = 'interview'
}

function closeInterview() {
  currentSession.value = null
  currentQuestion.value = ''
}

function openResearch() {
  view.value = 'research'
  if (!researchRole.value && selectedProfile.value?.targetRoles.length) {
    researchRole.value = selectedProfile.value.targetRoles[0]
  }
}

async function refresh() {
  loading.value = true
  error.value = ''
  try {
    profiles.value = await workbench.listProfiles()
    interviews.value = await workbench.listInterviews()
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

function newProfile() {
  selectedId.value = ''
  draft.value = createEmptyResumeProfile()
  saved.value = false
}

function editProfile(profile: ResumeProfile) {
  selectedId.value = profile.id
  draft.value = jsonClone(profile)
  saved.value = false
}

function cancelEdit() {
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
    if (!draft.value) newProfile()
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
  if (!draft.value) newProfile()
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
  if (!draft.value) return
  saving.value = true
  error.value = ''
  try {
    profiles.value = await workbench.saveProfile(draft.value)
    selectedId.value = draft.value.id
    draft.value = jsonClone(profiles.value.find((item) => item.id === draft.value?.id)!)
    saved.value = true
    importReviewed.value = false
    if (lastBossToken) {
      void browser.runtime
        .sendMessage({ type: 'career-import-clear', token: lastBossToken })
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
    profiles.value = await workbench.deleteProfile(profile.id)
    if (selectedId.value === profile.id) {
      selectedId.value = ''
      draft.value = null
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  }
}

onMounted(() => {
  browser.storage.onChanged.addListener(onBossStorageChanged)
  void refresh()
  void syncBossImport(true)
  void syncWebResearch(true)
  xhsPoll = window.setInterval(() => void syncWebResearch(), 1500)
  bossImportPoll = window.setInterval(() => void syncBossImport(), 1000)
})
onBeforeUnmount(() => {
  browser.storage.onChanged.removeListener(onBossStorageChanged)
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
    <header class="flex flex-wrap items-start justify-between gap-4 border-b border-default pb-4">
      <div>
        <h2 id="career-title" class="text-xl font-semibold">求职工作台</h2>
        <p class="mt-1 text-sm text-muted">管理简历档案，并在此准备求职材料和面试。</p>
        <p class="mt-1 text-xs text-muted">AI 模型：{{ configuredModelName }}</p>
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
        <UButton label="新建简历" icon="i-lucide-plus" @click="newProfile" />
      </div>
    </header>

    <nav aria-label="求职工作台功能" class="flex flex-wrap gap-1 border-b border-default pb-3">
      <UButton
        label="简历档案"
        :variant="view === 'resume' ? 'soft' : 'ghost'"
        @click="view = 'resume'"
      />
      <UButton
        label="简历建议"
        :variant="view === 'research' ? 'soft' : 'ghost'"
        @click="openResearch"
      />
      <UButton
        label="模拟面试"
        :variant="view === 'interview' ? 'soft' : 'ghost'"
        @click="view = 'interview'"
      />
      <UButton
        label="面试复盘"
        :variant="view === 'history' ? 'soft' : 'ghost'"
        @click="view = 'history'"
      />
    </nav>

    <UAlert v-if="error" color="error" title="操作失败" :description="error" />
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

      <div v-else class="grid items-start gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside aria-label="简历档案" class="space-y-2">
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

        <div v-if="draft" class="space-y-5">
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

    <section v-else-if="view === 'research'" class="max-w-3xl space-y-5">
      <div class="space-y-2">
        <h3 class="text-base font-semibold">岗位相关经验与简历建议</h3>
        <p class="text-sm text-muted">
          可打开小红书网页搜索并读取页面中的帖子，也可尝试公开索引。检索词仅包含岗位方向与“简历”；点击生成建议时，才会将当前简历和来源内容发送给配置的
          AI。
        </p>
        <div class="space-y-2 border-y border-default py-3">
          <p class="text-sm">
            当前简历：{{
              selectedProfile?.name ||
              (selectedProfile ? '未命名简历' : '请先在简历档案中选择一份简历')
            }}
          </p>
          <p class="text-sm text-muted">
            检索只显示帖子卡片。点击单条帖子下方的“读取正文和评论”后，才会打开该帖子并读取正文和已加载评论中的前
            5 条高赞评论。
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
              researchWebBusy
            "
            @click="createResearchAdvice"
          />
          <p class="text-xs text-muted">
            {{
              researchContentCount
                ? `已取得 ${researchContentCount} 条正文或摘要，将与当前简历一起提交给 AI。`
                : '尚无可用于分析的内容。请先检索，再手动读取帖子正文和评论，或在下方粘贴内容。'
            }}
          </p>
        </div>
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
            label="小红书网页检索"
            icon="i-lucide-external-link"
            :loading="researchWebBusy"
            :disabled="researchBusy || researchAdviceBusy || analysisBusy"
            @click="startWebResearch"
          />
          <UButton
            label="检索公开内容"
            :disabled="researchWebBusy || researchAdviceBusy || analysisBusy"
            variant="outline"
            icon="i-lucide-search"
            :loading="researchBusy"
            @click="searchResearch"
          />
        </div>
      </div>

      <div v-if="researchNotice" class="space-y-2 rounded border border-default p-3">
        <p role="status" class="text-sm">{{ researchNotice }}</p>
        <UButton
          v-if="researchWebBusy"
          label="停止等待"
          size="sm"
          color="neutral"
          variant="outline"
          @click="stopWebResearch"
        />
      </div>
      <div v-if="researchAdviceStatus || researchSummary" class="space-y-3">
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
      <section v-if="researchSources.length" class="space-y-3 border-t border-default pt-4">
        <h4 class="text-sm font-semibold">检索来源 · {{ researchRole }}</h4>
        <p class="text-sm text-muted">
          点击单条帖子下方的按钮读取正文和评论。评论按页面显示点赞数排序，取已加载内容中前 5
          条；仅有标题的帖子不参与 AI 分析。
        </p>
        <article
          v-for="source in researchSources"
          :key="source.url"
          class="border-b border-default pb-3"
        >
          <a
            :href="source.url"
            target="_blank"
            rel="noopener noreferrer"
            class="font-medium text-primary"
            >{{ source.title }}</a
          >
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
          <p v-if="source.readError" class="mt-2 text-sm text-warning">{{ source.readError }}</p>
          <UButton
            v-if="source.contentKind !== 'pasted'"
            :label="source.contentKind === 'visible-note' ? '重新读取正文和评论' : '读取正文和评论'"
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
          <pre v-if="analysis" data-testid="resume-analysis" class="whitespace-pre-wrap text-sm">{{
            analysis
          }}</pre>
        </div>
      </details>
    </section>

    <section v-else-if="view === 'interview'" class="max-w-3xl space-y-5">
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
              (value) => {
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
          <UButton label="结束本次练习" color="neutral" variant="outline" @click="closeInterview" />
        </div>
        <div
          v-for="(entry, index) in currentSession.answers"
          :key="index"
          class="space-y-2 border-b border-default pb-3"
        >
          <p class="text-sm font-medium">{{ index + 1 }}. {{ entry.question }}</p>
          <p class="whitespace-pre-wrap text-sm text-muted">{{ entry.answer }}</p>
        </div>
        <div v-if="currentQuestion" class="space-y-3">
          <h4 class="text-sm font-semibold">
            {{ currentSession.answers.length + 1 }}. {{ currentQuestion }}
          </h4>
          <UTextarea
            v-model="interviewAnswer"
            class="w-full"
            :rows="5"
            placeholder="输入你的回答"
          />
          <UButton
            label="提交回答"
            icon="i-lucide-send"
            :disabled="!interviewAnswer.trim()"
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
      </div>
    </section>

    <section v-else class="space-y-4">
      <h3 class="text-base font-semibold">面试复盘记录</h3>
      <p v-if="!interviews.length" class="text-sm text-muted">
        完成一次模拟面试后，复盘会保存在此处。
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
            {{ session.answers.length }} 道问答</span
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
  </section>
</template>
