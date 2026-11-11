import { normalizeXiaohongshuNoteUrl } from '../composables/publicResearch'
import type { PublicCareerSource } from '../composables/publicResearch'

export const XHS_RESEARCH_KEY = 'careerXiaohongshuResearchV1'
export const XHS_RESEARCH_TIMEOUT = 180_000
export interface XiaohongshuPageResult {
  status: 'ready' | 'login' | 'loading' | 'empty' | 'blocked'
  message: string
  sources: PublicCareerSource[]
}
export interface XiaohongshuResearchTask {
  token: string
  tabId: number
  role: string
  query?: string
  pageStatus?: XiaohongshuPageResult['status']
  createdAt: number
  expiresAt: number
  status: 'pending' | 'ready' | 'error'
  message: string
  sources: PublicCareerSource[]
  noteUrl?: string
  pendingUrls?: string[]
  completed?: number
  total?: number
  overallExpiresAt?: number
}
export function buildXiaohongshuSearchUrl(role: string, query = `${role.trim()} 简历`) {
  const url = new URL('https://www.xiaohongshu.com/search_result')
  url.searchParams.set('keyword', query)
  url.searchParams.set('source', 'web_search_result_notes')
  return url.toString()
}
const noteId = (url: string) => new URL(url).pathname.split('/').filter(Boolean).pop()
const sameNote = (a: string, b: string) => a === b || noteId(a) === noteId(b)
const stopLoading = (sources: PublicCareerSource[]) =>
  sources.map((source) =>
    source.commentCoverage?.status === 'loading'
      ? {
          ...source,
          commentCoverage: {
            ...source.commentCoverage,
            status: 'limited' as const,
            message: `读取已停止，已保留 ${source.commentCoverage.observed} 条已加载评论中的高赞评论，不保证是全帖最高赞。`,
          },
        }
      : source,
  )

type Api = Pick<typeof import('#imports').browser, 'tabs' | 'storage'> &
  Partial<Pick<typeof import('#imports').browser, 'permissions'>>
export function createXiaohongshuResearch(api: Api, now = Date.now) {
  let queue = Promise.resolve<unknown>(undefined)
  function serial<T>(fn: () => Promise<T>): Promise<T> {
    const result = queue.then(fn, fn)
    queue = result.catch(() => undefined)
    return result
  }
  async function stored(): Promise<XiaohongshuResearchTask | null> {
    return (
      ((await api.storage.local.get(XHS_RESEARCH_KEY))[
        XHS_RESEARCH_KEY
      ] as XiaohongshuResearchTask) ?? null
    )
  }
  async function save(task: XiaohongshuResearchTask) {
    await api.storage.local.set({ [XHS_RESEARCH_KEY]: task })
    return task
  }
  async function update(task: XiaohongshuResearchTask) {
    if ((await stored())?.token !== task.token) return stored()
    return save(task)
  }
  async function begin(
    role: string,
    sources?: PublicCareerSource[],
    urls?: string[],
    query?: string,
    reuseTabId?: number,
  ) {
    if (!role.trim()) throw new Error('请先填写目标岗位。')
    if (
      api.permissions &&
      !(await api.permissions.contains({ origins: ['https://www.xiaohongshu.com/*'] }))
    )
      throw new Error(
        '缺少小红书网站访问权限。请在扩展管理 → BossHelper → 网站访问权限中允许 https://www.xiaohongshu.com/*，刷新小红书页面后重试；也可粘贴正文作为来源。',
      )
    const tab =
      reuseTabId === undefined
        ? await api.tabs.create({ url: 'about:blank', active: true })
        : await api.tabs.get(reuseTabId)
    if (tab.id === undefined) throw new Error('无法打开小红书页面。')
    const task = await save({
      token: crypto.randomUUID(),
      tabId: tab.id,
      role: role.trim(),
      query,
      createdAt: now(),
      expiresAt: now() + XHS_RESEARCH_TIMEOUT,
      overallExpiresAt: now() + 10 * 60_000,
      status: 'pending',
      sources: sources ?? [],
      noteUrl: urls?.[0],
      pendingUrls: urls?.slice(1),
      completed: 0,
      total: urls?.length,
      message: urls?.length
        ? '正在读取所选帖子正文和高赞评论…'
        : '已打开小红书搜索页；如需登录，请在该页面完成登录。搜索结果出现后，手动点击帖子下方的“读取正文和评论”。',
    })
    try {
      await api.tabs.update(tab.id, { url: task.noteUrl ?? buildXiaohongshuSearchUrl(role, query) })
    } catch (cause) {
      await update({ ...task, status: 'error', message: '无法打开小红书页面，请重试。' })
      throw cause
    }
    return task
  }
  async function finishRead(task: XiaohongshuResearchTask, sources: PublicCareerSource[]) {
    const bodies = sources.filter((source) => source.contentKind === 'visible-note').length
    const failures = sources.filter((source) => source.readError).length
    return update({
      ...task,
      sources,
      completed: (task.completed ?? 0) + 1,
      pendingUrls: [],
      status: 'ready',
      message: `所选帖子读取完成：已取得 ${bodies} 篇正文和评论${failures ? `，${failures} 篇读取受限` : ''}。其他帖子可分别手动读取。`,
    })
  }
  return {
    start: (role: string, query?: string, sources?: PublicCareerSource[], reuseTabId?: number) =>
      serial(() => begin(role, sources, undefined, query, reuseTabId)),
    readNote: (
      role: string,
      source: PublicCareerSource,
      sources: PublicCareerSource[],
      reuseTabId?: number,
    ) =>
      serial(() => {
        const url = normalizeXiaohongshuNoteUrl(source.url)
        if (!url) throw new Error('请选择有效的小红书帖子。')
        return begin(role, sources, [url], undefined, reuseTabId)
      }),
    cancel: (preserve = false) =>
      serial(async () => {
        const task = preserve ? await stored() : null
        if (task)
          return save({
            ...task,
            status: 'ready',
            sources: stopLoading(task.sources),
            pendingUrls: [],
            message: '已停止读取，已保留取得的正文和评论。',
          })
        else await api.storage.local.remove(XHS_RESEARCH_KEY)
      }),
    poll: () =>
      serial(async () => {
        const task = await stored()
        if (!task) return null
        if (task.status !== 'pending') {
          if (now() > task.expiresAt + 15 * 60_000) {
            await api.storage.local.remove(XHS_RESEARCH_KEY)
            return null
          }
          return task
        }
        const failure = async (message: string) => {
          if (!task.noteUrl) return update({ ...task, status: 'error', message })
          const sources = stopLoading(task.sources).map((source) =>
            sameNote(source.url, task.noteUrl!) ? { ...source, readError: message } : source,
          )
          return finishRead(task, sources)
        }
        if (task.overallExpiresAt && now() >= task.overallExpiresAt)
          return update({
            ...task,
            status: 'ready',
            sources: stopLoading(task.sources),
            pendingUrls: [],
            message: '读取达到时长上限，已保留已取得的内容。其他帖子可分别手动读取。',
          })
        if (now() >= task.expiresAt)
          return failure('等待小红书页面超时。请确认页面可正常阅读后重试。')
        if (!task.noteUrl && task.pendingUrls?.length) {
          return update({
            ...task,
            status: 'ready',
            pendingUrls: [],
            message: '已停止旧版自动读取队列。请手动点击每条帖子下方的“读取正文和评论”。',
          })
        }
        let tab
        try {
          tab = await api.tabs.get(task.tabId)
        } catch {
          return update({
            ...task,
            status: 'error',
            message: '小红书读取标签页已关闭，已保留取得的内容。',
          })
        }
        if (tab.status === 'loading') return task
        if (
          api.permissions &&
          !(await api.permissions.contains({ origins: ['https://www.xiaohongshu.com/*'] }))
        )
          return update({
            ...task,
            status: 'error',
            message:
              '小红书网站访问权限未授权或已撤销。请到扩展管理允许小红书网站访问，刷新页面后重试；已取得内容会保留。',
          })
        if (tab.url) {
          const url = new URL(tab.url)
          if (
            !['www.xiaohongshu.com', 'xiaohongshu.com', 'xhslink.com', 'www.xhslink.com'].includes(
              url.hostname,
            )
          )
            return update({
              ...task,
              status: 'error',
              message: '读取标签页已离开小红书，已停止读取。',
            })
          const keyword = url.searchParams.get('keyword')
          if (
            !task.noteUrl &&
            url.pathname === '/search_result' &&
            keyword &&
            keyword !== (task.query ?? `${task.role} 简历`)
          )
            return update({
              ...task,
              status: 'error',
              message: '小红书搜索词已改变，请填写新的目标岗位并重新检索。',
            })
        }
        let page: XiaohongshuPageResult
        let timer: ReturnType<typeof setTimeout> | undefined
        try {
          page = await Promise.race([
            api.tabs.sendMessage(task.tabId, {
              type: 'career-xhs-read',
              collectComments: !!task.noteUrl,
              taskToken: task.token,
            }) as Promise<XiaohongshuPageResult>,
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => reject(new Error('read timeout')), 3000)
            }),
          ])
        } catch (cause) {
          const reason = cause instanceof Error ? cause.message : String(cause)
          return {
            ...task,
            message: reason.includes('read timeout')
              ? '小红书页面读取响应超时。请保持标签页打开；若页面已可阅读，请刷新该页，或停止后重试。'
              : '尚未连接到小红书页面读取程序。请检查扩展的网站访问权限，刷新小红书标签页；更新扩展后需同时刷新工作台和小红书页面。',
          }
        } finally {
          clearTimeout(timer)
        }
        if (page.status === 'ready' && page.sources.length) {
          if (!task.noteUrl) {
            return update({
              ...task,
              status: 'ready',
              sources: page.sources,
              pendingUrls: [],
              message: `检索完成：找到 ${page.sources.length} 条帖子。请手动点击感兴趣帖子下方的“读取正文和评论”。`,
            })
          }
          const requested = new URL(task.noteUrl)
          const note = page.sources.find(
            (source) =>
              source.contentKind === 'visible-note' &&
              (requested.hostname.endsWith('xhslink.com') || sameNote(source.url, task.noteUrl!)),
          )
          if (!note) return { ...task, message: '正在等待所选帖子的正文加载…' }
          const sources = task.sources.map((source) =>
            sameNote(source.url, task.noteUrl!) || sameNote(source.url, note.url)
              ? { ...source, ...note, readError: undefined }
              : source,
          )
          if (note.commentCoverage?.status === 'loading')
            return update({
              ...task,
              sources,
              message: `正在读取所选帖子：${note.commentCoverage.message}`,
            })
          return finishRead(task, sources)
        }
        if (page.status === 'blocked')
          return update({
            ...task,
            status: 'error',
            sources: stopLoading(task.sources),
            message: page.message,
          })
        if (page.status === 'empty')
          return task.noteUrl
            ? failure(page.message)
            : update({ ...task, status: 'ready', sources: [], message: page.message })
        return { ...task, message: page.message, pageStatus: page.status }
      }),
  }
}
