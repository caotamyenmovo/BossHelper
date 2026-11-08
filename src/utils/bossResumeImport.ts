import type { Browser } from '#imports'

import type { ParsedResume } from '../composables/careerAi'
import { hasResumeFields } from './resumeFields'

export const BOSS_IMPORT_KEY = 'careerBossImportV2'
export const BOSS_IMPORT_TIMEOUT = 90_000
export const BOSS_RESULT_TTL = 5 * 60_000
export interface BossImportState {
  token: string
  tabId: number
  createdAt: number
  expiresAt: number
  status: 'pending' | 'success' | 'error'
  content?: string
  profile?: ParsedResume
  error?: string
}

type Api = typeof import('#imports').browser

export function createBossResumeImportService(api: Pick<Api, 'storage' | 'tabs'>, now = Date.now) {
  // Serialise writes so a result from an old tab cannot replace a new request.
  let queue = Promise.resolve<unknown>(undefined)
  function serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = queue.then(operation, operation)
    queue = result.catch(() => undefined)
    return result
  }
  async function read(): Promise<BossImportState | null> {
    const stored = (await api.storage.local.get(BOSS_IMPORT_KEY))[BOSS_IMPORT_KEY] as
      | BossImportState
      | undefined
    if (!stored) return null
    if (stored.expiresAt > now()) return stored
    if (stored.status === 'pending')
      return finish(stored, {
        error: '读取 Boss 简历超时。请确认已登录，并在打开的标签页进入“在线简历”，然后重试。',
      })
    await api.storage.local.remove(BOSS_IMPORT_KEY)
    return null
  }
  async function finish(
    state: BossImportState,
    result: { content?: string; profile?: ParsedResume; error?: string },
  ) {
    const completed: BossImportState = {
      ...state,
      ...result,
      status: result.error ? 'error' : 'success',
      expiresAt: now() + BOSS_RESULT_TTL,
    }
    await api.storage.local.set({ [BOSS_IMPORT_KEY]: completed })
    return completed
  }
  return {
    status: () => serial(read),
    start: () =>
      serial(async () => {
        const tab = await api.tabs.create({ url: 'about:blank', active: true })
        if (tab.id === undefined) throw new Error('无法创建 Boss 简历标签页。')
        const state: BossImportState = {
          token: crypto.randomUUID(),
          tabId: tab.id,
          createdAt: now(),
          expiresAt: now() + BOSS_IMPORT_TIMEOUT,
          status: 'pending',
        }
        await api.storage.local.set({ [BOSS_IMPORT_KEY]: state })
        try {
          await api.tabs.update(tab.id, { url: 'https://www.zhipin.com/web/geek/resume' })
          return state
        } catch (cause) {
          return finish(state, {
            error: `无法打开 Boss 页面：${cause instanceof Error ? cause.message : String(cause)}`,
          })
        }
      }),
    taskForTab: (tabId: number) =>
      serial(async () => {
        const state = await read()
        return state?.status === 'pending' && state.tabId === tabId ? state : null
      }),
    complete: (
      tabId: number,
      message: { token: string; content?: string; profile?: ParsedResume; error?: string },
    ) =>
      serial(async () => {
        const state = await read()
        if (state?.status !== 'pending' || state.tabId !== tabId || state.token !== message.token)
          return false
        if (
          !message.error &&
          (!message.content?.trim() || !message.profile || !hasResumeFields(message.profile))
        ) {
          await finish(state, {
            error: 'Boss 页面尚未提供可识别的简历资料。请打开在线简历后重试。',
          })
        } else {
          await finish(state, {
            content: message.content,
            profile: message.profile,
            error: message.error,
          })
        }
        return true
      }),
    clear: (token: string) =>
      serial(async () => {
        const state = await read()
        if (state?.token === token) await api.storage.local.remove(BOSS_IMPORT_KEY)
      }),
    tabClosed: (tabId: number) =>
      serial(async () => {
        const state = await read()
        if (state?.status === 'pending' && state.tabId === tabId)
          await finish(state, { error: 'Boss 简历标签页已关闭，请重新点击“从 Boss 读取”。' })
      }),
  }
}

export function registerBossResumeImport(api: Api) {
  const service = createBossResumeImportService(api)
  api.runtime.onMessage.addListener((message: unknown, sender: Browser.runtime.MessageSender) => {
    if (!message || typeof message !== 'object' || !('type' in message)) return
    const request = message as {
      type: string
      token?: string
      content?: string
      profile?: ParsedResume
      error?: string
    }
    if (sender.id !== api.runtime.id) return
    const isOptions = sender.url?.startsWith(api.runtime.getURL(''))
    if (isOptions) {
      if (request.type === 'career-import-start') return service.start()
      if (request.type === 'career-import-status') return service.status()
      if (request.type === 'career-import-clear' && request.token)
        return service.clear(request.token)
    }
    if (sender.tab?.id === undefined || (sender.frameId ?? 0) !== 0) return
    let hostname: string
    try {
      hostname = new URL(sender.url ?? '').hostname
    } catch {
      return
    }
    if (hostname !== 'zhipin.com' && !hostname.endsWith('.zhipin.com')) return
    if (request.type === 'career-import-task') return service.taskForTab(sender.tab.id)
    if (request.type === 'career-import-result' && request.token)
      return service.complete(sender.tab.id, { ...request, token: request.token })
  })
  api.tabs.onRemoved.addListener((tabId) => {
    void service.tabClosed(tabId).catch(() => undefined)
  })
  return service
}
