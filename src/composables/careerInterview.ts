import { reactive } from 'vue'
import type { CareerAssistant } from './careerAi'
import type { CareerCompletionOptions } from './careerCompletion'
import type { CareerInterviewSession, ResumeProfile, createCareerWorkbench } from './useCareerWorkbench'
import { jsonClone } from '../utils/deepmerge'

type Repository = Pick<ReturnType<typeof createCareerWorkbench>, 'saveInterview'>
export interface InterviewInput { profile: ResumeProfile; role: string; company: string; jobDescription: string }

// The active view owns AI requests; durable sessions own questions and answer drafts.
export function createCareerInterview(repository: Repository, assistant: CareerAssistant) {
  const state = reactive<{ session: CareerInterviewSession | null; busy: boolean; generating: boolean; dirty: boolean; error: string; status: string }>({ session: null, busy: false, generating: false, dirty: false, error: '', status: '' })
  let epoch = 0
  let controller: AbortController | undefined
  let writes = Promise.resolve()
  let draftWrites = Promise.resolve()
  let pendingDraft: { session: CareerInterviewSession; owner: number } | undefined
  let savingDraft = false
  const revisions = new Map<string, number | undefined>()

  function invalidate() {
    epoch++
    controller?.abort()
    controller = undefined
    state.busy = false
    state.generating = false
    state.status = ''
  }
  function persist(session: CareerInterviewSession) {
    const snapshot = jsonClone(session)
    const pending = writes.then(async () => {
      if (revisions.has(snapshot.id)) snapshot.revision = revisions.get(snapshot.id)
      const records = await repository.saveInterview(snapshot)
      const saved = records.find((item) => item.id === snapshot.id)!
      revisions.set(saved.id, saved.revision)
      if (state.session?.id === saved.id) state.session.revision = saved.revision
      return saved
    })
    writes = pending.then(() => undefined, () => undefined)
    return pending
  }
  function saveDraft(session: CareerInterviewSession, owner: number) {
    pendingDraft = { session: jsonClone(session), owner }
    if (savingDraft) return
    savingDraft = true
    draftWrites = (async () => {
      while (pendingDraft) {
        const item = pendingDraft
        pendingDraft = undefined
        try {
          await persist(item.session)
          if (item.owner === epoch && !pendingDraft && state.session?.draftAnswer === item.session.draftAnswer) {
            state.dirty = false; state.status = '回答草稿已保存'; state.error = ''
          }
        } catch (cause) {
          if (item.owner === epoch) { state.error = `回答尚未保存，请保留页面并重试：${cause instanceof Error ? cause.message : String(cause)}`; state.status = '回答草稿未保存' }
        }
      }
    })().finally(() => { savingDraft = false })
  }
  async function open(session: CareerInterviewSession, legacyProfile?: ResumeProfile) {
    invalidate()
    state.error = ''
    state.dirty = false
    revisions.set(session.id, session.revision)
    state.session = jsonClone({ ...session, currentQuestion: session.currentQuestion ?? '', draftAnswer: session.draftAnswer ?? '', profileSnapshot: session.profileSnapshot ?? legacyProfile })
  }
  async function generate(review = false) {
    const session = state.session
    if (!session || state.busy) return
    if (!session.profileSnapshot && !review) {
      state.error = '这份旧面试记录缺少简历快照，原简历也已删除。仍可查看记录和生成复盘；请新建练习以继续提问。'
      return
    }
    const owner = epoch
    const input = jsonClone(session)
    const abort = new AbortController()
    controller = abort
    state.busy = true
    state.generating = true
    state.error = ''
    state.status = review ? '正在生成复盘…' : '正在生成问题…'
    const options: CareerCompletionOptions = { signal: abort.signal, onStatus: (text) => { if (owner === epoch) state.status = text } }
    try {
      const result = review
        ? await assistant.reviewInterview(input.role, input.answers, options, { profile: input.profileSnapshot, company: input.company, jobDescription: input.jobDescription })
        : await assistant.nextInterviewQuestion(input.profileSnapshot!, input.role, input.company, input.jobDescription, input.answers, options)
      if (owner !== epoch || abort.signal.aborted) return
      if (!result.trim()) throw new Error('模型未返回有效内容，请重试。')
      const next = { ...jsonClone(state.session!), ...(review ? { review: result, currentQuestion: '' } : { currentQuestion: result }) }
      state.session = next
      state.dirty = true
      const saved = await persist(next)
      if (owner === epoch) { state.session = saved; state.dirty = false; state.status = review ? '复盘已保存' : '题目已保存，可开始回答' }
    } catch (cause) {
      if (owner === epoch && !abort.signal.aborted) state.error = cause instanceof Error ? cause.message : String(cause)
    } finally {
      if (owner === epoch) { state.busy = false; state.generating = false; controller = undefined }
    }
  }
  return {
    state,
    open,
    async start(input: InterviewInput) {
      invalidate()
      const owner = epoch
      state.error = ''
      state.session = null
      state.dirty = false
      state.busy = true
      try {
        const session: CareerInterviewSession = { id: crypto.randomUUID(), profileId: input.profile.id, profileSnapshot: jsonClone(input.profile), role: input.role, company: input.company, jobDescription: input.jobDescription, answers: [], review: '', currentQuestion: '', draftAnswer: '', createdAt: Date.now(), updatedAt: Date.now() }
        const saved = await persist(session)
        if (owner !== epoch) return
        state.session = saved
        state.busy = false
        await generate()
      } catch (cause) {
        if (owner === epoch) { state.error = cause instanceof Error ? cause.message : String(cause); state.busy = false }
      }
    },
    setAnswer(text: string) {
      if (!state.session || state.busy) return
      state.session.draftAnswer = text
      state.dirty = true
      state.status = '正在保存回答草稿…'
      saveDraft(state.session, epoch)
    },
    async submit() {
      if (!state.session?.currentQuestion || !state.session.draftAnswer?.trim() || state.busy) return
      const owner = epoch
      state.busy = true
      state.error = ''
      const next = jsonClone(state.session)
      next.answers.push({ question: next.currentQuestion!, answer: next.draftAnswer!.trim() })
      next.currentQuestion = ''
      next.draftAnswer = ''
      try {
        await draftWrites
        const saved = await persist(next)
        if (owner === epoch) { state.session = saved; state.dirty = false; state.status = '回答已保存' }
      } catch (cause) {
        if (owner === epoch) state.error = `提交失败，回答已保留，请重试：${cause instanceof Error ? cause.message : String(cause)}`
      } finally { if (owner === epoch) state.busy = false }
    },
    next: () => generate(),
    finish: () => state.session?.answers.length ? generate(true) : Promise.resolve(),
    stop() { if (state.generating) { invalidate(); state.status = '已停止生成，可以重试。' } },
    async close() {
      if (state.busy && !state.generating) { state.error = '正在保存，请稍后退出。'; return false }
      invalidate()
      state.busy = true
      await draftWrites
      await writes
      if (state.session && state.dirty) {
        try { await persist(state.session) }
        catch (cause) { state.busy = false; state.error = `尚未保存，已保留当前练习，请重试：${cause instanceof Error ? cause.message : String(cause)}`; return false }
      }
      state.session = null; state.busy = false; state.dirty = false; state.error = ''; return true
    },
    async flush() { await draftWrites; await writes },
  }
}
