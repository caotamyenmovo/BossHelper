import { expect, test } from 'bun:test'

import { createOpenAI } from '@ai-sdk/openai'
import { JSDOM } from 'jsdom'

import { createCareerAssistant, hasResearchContent } from '../src/composables/careerAi'
import { runCareerCompletion } from '../src/composables/careerCompletion'
import type { PublicCareerSource } from '../src/composables/publicResearch'
import { createEmptyResumeProfile } from '../src/composables/useCareerWorkbench'
import {
  defaultResearchPlan,
  planResearch,
  mergeResearchSources,
  rankResearchSources,
  classifyResearchSources,
  readResearchImages,
  validateResearchCitations,
  waitForResearchTask,
} from '../src/utils/careerResearchFlow'
import { readXiaohongshuPage } from '../src/utils/xiaohongshuDom'
const signal = () => new AbortController().signal
test('comment popularity is never used as post popularity', () => {
  const doc = new JSDOM(
    '<div id="noteContainer"><div id="detail-desc">正文</div><div class="comment-item"><div class="like-wrapper"><span class="count">9999</span></div></div></div>',
  ).window.document
  expect(
    readXiaohongshuPage(doc, 'https://www.xiaohongshu.com/explore/fixture001').sources[0]?.likes,
  ).toBeNull()
})
test('existing configured AI transport preserves image input', async () => {
  let submitted: any
  const result = await runCareerCompletion(
    {
      base_url: 'https://relay.invalid/v1',
      api_key: 'fixture',
      model: 'fixture',
      protocol: 'openai-compatible',
      advanced: {},
      other: { timeout: 2000 },
    },
    '识别图片',
    (conf, transport) =>
      createOpenAI({ baseURL: conf.base_url, apiKey: conf.api_key, fetch: transport }).chat(
        conf.model,
      ),
    { images: ['data:image/png;base64,AQID'] },
    (async (_, init) => {
      submitted = JSON.parse(String(init?.body))
      return new Response(
        JSON.stringify({
          id: 'x',
          created: 1,
          model: 'fixture',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: '图片文字' },
              finish_reason: 'stop',
            },
          ],
        }),
        { headers: { 'content-type': 'application/json' } },
      )
    }) as typeof fetch,
  )
  expect(result).toBe('图片文字')
  expect(submitted.messages[0].content).toEqual([
    { type: 'text', text: '识别图片' },
    { type: 'image_url', image_url: { url: 'data:image/png;base64,AQID' } },
  ])
})
const source = (id: number, extra: Partial<PublicCareerSource> = {}): PublicCareerSource => ({
  sourceId: id,
  title: '智能体开发简历',
  url: 'https://www.xiaohongshu.com/explore/fixture00' + id,
  author: '',
  excerpt: '项目经历的具体写法',
  contentKind: 'visible-note',
  ...extra,
})

test('query planning disambiguates agent and falls back on malformed or private queries', async () => {
  const fallback = defaultResearchPlan('agent')
  expect(fallback.direction).toContain('智能体开发')
  expect(fallback.queries).toHaveLength(4)
  expect(fallback.queries[3]?.scope).toBe('adjacent')
  expect(await planResearch('agent', async () => 'bad JSON', signal())).toEqual(fallback)
  expect(
    await planResearch(
      'agent',
      async () =>
        JSON.stringify({
          direction: 'agent',
          queries: [{ text: '姓名 13812345678', scope: 'direct' }],
        }),
      signal(),
    ),
  ).toEqual(fallback)
})
test('deduplicates note routes, caps candidates and preserves body, exclusions and stable ids', () => {
  const old = source(7, { selected: false, excludedByUser: true })
  const card = {
    ...old,
    url: old.url.replace('/explore/', '/search_result/') + '?xsec_token=new',
    contentKind: 'visible-card' as const,
    excerpt: 'title',
    selected: true,
  }
  const merged = mergeResearchSources(
    [old],
    [card, ...Array.from({ length: 40 }, (_, i) => source(i + 8))],
  )
  expect(merged).toHaveLength(30)
  expect(merged[0]).toMatchObject({
    sourceId: 7,
    selected: false,
    excerpt: old.excerpt,
    contentKind: 'visible-note',
  })
})
test('unrelated popular results are excluded, real popularity ranks relevant candidates', async () => {
  const sources = [
    source(1, { likes: 999999 }),
    source(2, { collects: 200 }),
    source(3, { likes: null, collects: null }),
  ]
  const classified = await classifyResearchSources(
    'agent',
    sources,
    async () =>
      JSON.stringify({
        items: [
          { id: 1, relevance: 'unrelated', reason: '自动写简历工具' },
          { id: 2, relevance: 'direct', reason: '项目写法' },
          { id: 3, relevance: 'adjacent', reason: '大模型应用经验' },
        ],
      }),
    signal(),
  )
  expect(rankResearchSources(classified).map((s) => s.sourceId)).toEqual([2, 3])
  expect(classified[2]?.collects).toBeNull()
  const failed = await classifyResearchSources(
    'agent',
    sources,
    async () => {
      throw new Error('offline')
    },
    signal(),
  )
  expect(rankResearchSources(failed)).toHaveLength(0)
})
test('discovery snippets cannot support edits; selected image evidence can', () => {
  expect(hasResearchContent(source(1, { contentKind: 'search-snippet' }))).toBe(false)
  expect(hasResearchContent(source(1, { selected: false }))).toBe(false)
  expect(hasResearchContent(source(1, { excerpt: '', imageText: '图片中的改写经验' }))).toBe(true)
})
test('DOM reads actual post popularity and image-only notes without confusing comment likes', () => {
  const doc = new JSDOM(
    '<div id="noteContainer"><div id="detail-title">简历对比</div><div class="like-wrapper"><span class="count">1.2万</span></div><div class="collect-wrapper"><span class="count">600</span></div><div class="swiper-slide"><img src="https://sns-webpic-qc.xhscdn.com/a.jpg"></div></div>',
  ).window.document
  const result = readXiaohongshuPage(doc, source(1).url)
  expect(result.sources[0]).toMatchObject({
    likes: 12000,
    collects: 600,
    excerpt: '',
    contentKind: 'visible-note',
  })
  expect(result.sources[0]?.images).toHaveLength(1)
})
test('image pipeline is bounded, sends bytes through existing completion and reports unsupported models', async () => {
  let calls = 0
  const item = source(1, {
    images: Array.from({ length: 5 }, (_, i) => 'https://sns-webpic-qc.xhscdn.com/' + i + '.png'),
  })
  const transport = (async () => {
    calls++
    return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } })
  }) as typeof fetch
  const read = await readResearchImages(
    item,
    async (_, options) => {
      expect(options?.images).toHaveLength(3)
      expect(options?.images?.[0]).toStartWith('data:image/png;base64,')
      return '明确项目职责'
    },
    signal(),
    transport,
  )
  expect(calls).toBe(3)
  expect(read.imageText).toBe('明确项目职责')
  expect(read.imageStatus).toContain('3/5')
  const failed = await readResearchImages(
    item,
    async () => {
      throw new Error('unsupported')
    },
    signal(),
    transport,
  )
  expect(failed.imageStatus).toContain('不支持图片')
  expect(failed.excerpt).toBe(item.excerpt)
  expect(failed.imageText).toBeUndefined()
})
test('invalid image hosts do not trigger fetch', async () => {
  let requests = 0
  const result = await readResearchImages(
    source(1, { images: ['https://evil.example/secret'] }),
    async () => 'never',
    signal(),
    (async () => {
      requests++
      throw new Error()
    }) as typeof fetch,
  )
  expect(requests).toBe(0)
  expect(result.imageText).toBeUndefined()
})
test('prompt retains stable references after filtering, includes JD, and leads with blogger experience', async () => {
  let prompt = ''
  const assistant = createCareerAssistant(async (value) => {
    prompt = value
    return '[来源7]'
  })
  await assistant.summarizeResearch(
    'agent',
    [source(2, { selected: false }), source(7)],
    createEmptyResumeProfile(),
    { jobDescription: '负责智能体工程落地' },
  )
  expect(prompt).toContain('"sourceId":7')
  expect(prompt).not.toContain('"sourceId":2')
  expect(prompt).toContain('负责智能体工程落地')
  expect(prompt.indexOf('博主经验汇总')).toBeLessThan(prompt.indexOf('整体修改方向'))
  expect(() => validateResearchCitations('[来源7]', [source(7)])).not.toThrow()
  expect(() => validateResearchCitations('[来源1]', [source(7)])).toThrow('不存在')
  expect(() => validateResearchCitations('没有引用', [source(7)])).toThrow('缺少')
})
test('login pauses immediately and cancellation rejects a late poll result', async () => {
  const task = {
    token: 'x',
    tabId: 1,
    role: 'agent',
    createdAt: 1,
    expiresAt: 2,
    status: 'pending' as const,
    pageStatus: 'login' as const,
    message: '要求登录',
    sources: [source(1)],
  }
  await expect(
    waitForResearchTask(
      async () => task,
      signal(),
      () => {},
    ),
  ).rejects.toThrow('暂停')
  const controller = new AbortController()
  await expect(
    waitForResearchTask(
      async () => {
        controller.abort()
        return { ...task, status: 'ready' as const }
      },
      controller.signal,
      () => {
        throw new Error('late write')
      },
    ),
  ).rejects.toThrow()
})
