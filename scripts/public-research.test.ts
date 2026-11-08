import { expect, test } from 'bun:test'

import {
  buildPublicXiaohongshuSearchUrl,
  unwrapPublicSearchResultUrl,
} from '../src/composables/publicResearch'

test('builds public Xiaohongshu search using only the target role', () => {
  const url = new URL(buildPublicXiaohongshuSearchUrl('产品经理'))
  expect(url.hostname).toBe('www.bing.com')
  expect(url.searchParams.get('q')).toContain('产品经理')
  expect(url.searchParams.get('q')).toContain('site:xiaohongshu.com')
})

test('unwraps a public search redirect before validating the source domain', () => {
  const destination = 'https://www.xiaohongshu.com/explore/example'
  const encoded = btoa(destination).replaceAll('+', '-').replaceAll('/', '_')
  const wrapped = `https://www.bing.com/ck/a?u=a1${encodeURIComponent(encoded)}`
  expect(unwrapPublicSearchResultUrl(wrapped)).toBe(destination)
})

import { JSDOM } from 'jsdom'

import {
  normalizeXiaohongshuNoteUrl,
  parsePublicXiaohongshuResults,
} from '../src/composables/publicResearch'
import { readXiaohongshuPage } from '../src/utils/xiaohongshuDom'
import {
  buildXiaohongshuSearchUrl,
  createXiaohongshuResearch,
  XHS_RESEARCH_KEY,
} from '../src/utils/xiaohongshuResearch'

const noteUrl = 'https://www.xiaohongshu.com/explore/1234567890abcdef12345678?xsec_token=abc'
const searchUrl = buildXiaohongshuSearchUrl('安全工程师')
const doc = (html: string) => new JSDOM(html, { url: searchUrl }).window.document

test('only accepts actual note URLs on exact trusted domains and preserves access query', () => {
  expect(normalizeXiaohongshuNoteUrl(noteUrl)).toBe(noteUrl)
  expect(
    normalizeXiaohongshuNoteUrl('/search_result/1234567890abcdef12345678?xsec_token=abc'),
  ).toContain('xsec_token=abc')
  for (const url of [
    'https://evilxiaohongshu.com/explore/1234567890abcdef12345678',
    'https://www.xiaohongshu.com/user/profile/12345678',
    'https://www.xiaohongshu.com',
    'javascript:alert(1)',
  ])
    expect(normalizeXiaohongshuNoteUrl(url)).toBeNull()
})

test('parses relative redirects and alternative search cards without inventing authors', () => {
  const wrapped = '/ck/a?u=a1' + btoa(noteUrl)
  const results = parsePublicXiaohongshuResults(
    doc(
      `<main><article><h3><a href="${wrapped}">安全工程师简历</a></h3><p>项目描述经验</p><cite>xiaohongshu.com</cite></article><article><h3><a href="${noteUrl}">duplicate</a></h3></article></main>`,
    ),
  )
  expect(results).toHaveLength(1)
  expect(results[0]).toMatchObject({
    title: '安全工程师简历',
    author: '',
    excerpt: '项目描述经验',
    contentKind: 'search-snippet',
  })
})

test('rejects unrelated search engine results instead of relabelling them Xiaohongshu', () => {
  expect(
    parsePublicXiaohongshuResults(
      doc('<li class="b_algo"><h2><a href="https://example.com/resume">简历</a></h2></li>'),
    ),
  ).toEqual([])
})

function cards() {
  return `<section class="note-item"><a class="cover" href="${noteUrl}"></a><a class="title" href="${noteUrl}">安全工程师简历经验</a><div class="author"><span class="name">测试作者</span></div></section>`
}

test('reads visible search cards once and labels their limited evidence', () => {
  const result = readXiaohongshuPage(
    doc(
      cards() +
        `<section class="note-item" hidden><a class="title" href="/explore/aaaaaaaaaaaaaaaaaaaaaaaa">隐藏结果</a></section>`,
    ),
    searchUrl,
  )
  expect(result.status).toBe('ready')
  expect(result.sources).toHaveLength(1)
  expect(result.sources[0]).toMatchObject({
    title: '安全工程师简历经验',
    author: '测试作者',
    contentKind: 'visible-card',
    url: noteUrl,
  })
})

test('reports login and security blocks distinctly from missing search results', () => {
  expect(
    readXiaohongshuPage(doc('<div class="login-container">扫码登录</div>' + cards()), searchUrl)
      .status,
  ).toBe('login')
  expect(
    readXiaohongshuPage(
      doc('<title>安全限制</title>当前网络存在风险'),
      'https://www.xiaohongshu.com/website-login/error',
    ).status,
  ).toBe('blocked')
  expect(readXiaohongshuPage(doc('没有相关结果'), searchUrl).status).toBe('empty')
  expect(readXiaohongshuPage(doc('<div>加载中</div>'), searchUrl).status).toBe('loading')
})

test('does not import unrelated homepage recommendations', () => {
  expect(readXiaohongshuPage(doc(cards()), 'https://www.xiaohongshu.com/explore').sources).toEqual(
    [],
  )
})

test('reads displayed note text as note evidence rather than card evidence', () => {
  const result = readXiaohongshuPage(
    doc(
      '<div id="noteContainer"><h1 id="detail-title">简历经验</h1><div id="detail-desc">描述项目职责和实际成果。</div></div>',
    ),
    noteUrl,
  )
  expect(result.sources[0]).toMatchObject({
    contentKind: 'visible-note',
    excerpt: '描述项目职责和实际成果。',
  })
})

function fakeApi() {
  const data: Record<string, any> = {}
  let nextId = 0
  let closed = false
  let currentUrl = searchUrl
  let result = { status: 'login', message: '请登录', sources: [] } as any
  const api = {
    storage: {
      local: {
        get: async (key: string) => ({ [key]: structuredClone(data[key]) }),
        set: async (value: Record<string, any>) => {
          Object.assign(data, structuredClone(value))
        },
        remove: async (key: string) => {
          delete data[key]
        },
      },
    },
    tabs: {
      create: async ({ url }: { url: string }) => {
        currentUrl = url
        return { id: ++nextId }
      },
      update: async (_id: number, { url }: { url: string }) => {
        currentUrl = url
        return { id: nextId }
      },
      get: async () => {
        if (closed) throw new Error('closed')
        return { url: currentUrl, status: 'complete' }
      },
      sendMessage: async () => result,
    },
  }
  return {
    api: api as unknown as Parameters<typeof createXiaohongshuResearch>[0],
    data,
    setResult: (value: any) => {
      result = value
    },
    close: () => {
      closed = true
    },
    setUrl: (value: string) => {
      currentUrl = value
    },
  }
}

test('web search survives recreation and automatically opens notes after login', async () => {
  const fake = fakeApi()
  const service = createXiaohongshuResearch(fake.api)
  const started = await service.start('安全工程师')
  expect(started.status).toBe('pending')
  expect((await service.poll())?.message).toBe('请登录')
  const recreated = createXiaohongshuResearch(fake.api)
  fake.setResult(readXiaohongshuPage(doc(cards()), searchUrl))
  const result = await recreated.poll()
  expect(result?.status).toBe('pending')
  expect(result?.noteUrl).toBe(noteUrl)
  expect(result?.role).toBe('安全工程师')
  expect(fake.data[XHS_RESEARCH_KEY].sources).toHaveLength(1)
  fake.setResult(
    readXiaohongshuPage(
      doc('<div id="noteContainer"><div id="detail-desc">正文</div></div>'),
      noteUrl,
    ),
  )
  expect((await recreated.poll())?.status).toBe('ready')
})

test('web search closes and times out with actionable states', async () => {
  const fake = fakeApi()
  let time = 0
  const service = createXiaohongshuResearch(fake.api, () => time)
  await service.start('Java')
  time = 180001
  expect((await service.poll())?.message).toContain('超时')
  await service.start('Java')
  fake.close()
  expect((await service.poll())?.message).toContain('已关闭')
  await service.cancel()
  expect(await service.poll()).toBeNull()
})

test('rejects changed search keywords and website blocks', async () => {
  const fake = fakeApi()
  const service = createXiaohongshuResearch(fake.api)
  await service.start('安全工程师')
  fake.setUrl(buildXiaohongshuSearchUrl('产品经理'))
  expect((await service.poll())?.status).toBe('error')
  await service.start('安全工程师')
  fake.setResult({ status: 'blocked', sources: [], message: '安全限制' })
  expect((await service.poll())?.message).toBe('安全限制')
})

test('reading a selected note preserves other sources and persists its body across reloads', async () => {
  const fake = fakeApi()
  const service = createXiaohongshuResearch(fake.api)
  const card = readXiaohongshuPage(doc(cards()), searchUrl).sources[0]
  const other = {
    ...card,
    url: 'https://www.xiaohongshu.com/explore/aaaaaaaaaaaaaaaaaaaaaaaa',
    title: '另一篇帖子',
  }
  await service.readNote('安全工程师', card, [card, other])
  expect((await service.poll())?.status).toBe('pending')
  fake.setResult(
    readXiaohongshuPage(
      doc('<div id="noteContainer"><div id="detail-desc">说明项目职责和实际成果。</div></div>'),
      noteUrl,
    ),
  )
  const result = await createXiaohongshuResearch(fake.api).poll()
  expect(result?.status).toBe('ready')
  expect(result?.sources).toHaveLength(2)
  expect(result?.sources.find((source) => source.url === noteUrl)?.contentKind).toBe('visible-note')
  expect(result?.sources.find((source) => source.url === other.url)?.title).toBe('另一篇帖子')
})

test('does not attach the wrong note body to the selected source and retains cards on failure', async () => {
  const fake = fakeApi()
  let time = 0
  const service = createXiaohongshuResearch(fake.api, () => time)
  const card = readXiaohongshuPage(doc(cards()), searchUrl).sources[0]
  await service.readNote('安全工程师', card, [card])
  fake.setResult({
    status: 'ready',
    message: '',
    sources: [
      {
        ...card,
        url: 'https://www.xiaohongshu.com/explore/aaaaaaaaaaaaaaaaaaaaaaaa',
        contentKind: 'visible-note',
        excerpt: '错误的另一篇正文',
      },
    ],
  })
  expect((await service.poll())?.status).toBe('pending')
  time = 180001
  const failed = await service.poll()
  expect(failed?.status).toBe('ready')
  expect(failed?.sources[0].readError).toContain('超时')
  expect(failed?.sources[0].contentKind).toBe('visible-card')
})

test('automatically advances through the persisted queue and keeps a failed note alongside successes', async () => {
  const fake = fakeApi()
  const service = createXiaohongshuResearch(fake.api)
  const first = readXiaohongshuPage(doc(cards()), searchUrl).sources[0]
  const second = { ...first, url: 'https://www.xiaohongshu.com/explore/aaaaaaaaaaaaaaaaaaaaaaaa' }
  const started = await service.readSources('安全工程师', [first, second])
  expect(started.total).toBe(2)
  const note = {
    ...first,
    contentKind: 'visible-note',
    excerpt: '正文',
    comments: [{ id: 'c1', author: '评论人', text: '高赞建议', likes: 100, likesText: '100' }],
    commentCoverage: { status: 'loading', observed: 1, unknownLikes: 0, message: '加载评论' },
  }
  fake.setResult({ status: 'ready', sources: [note] })
  expect((await service.poll())?.completed).toBe(0)
  note.commentCoverage.status = 'end'
  expect((await service.poll())?.noteUrl).toBe(second.url)
  const restored = createXiaohongshuResearch(fake.api)
  fake.setResult({ status: 'empty', message: '帖子已删除', sources: [] })
  const finished = await restored.poll()
  expect(finished?.status).toBe('ready')
  expect(finished?.completed).toBe(2)
  expect(finished?.sources[0].comments?.[0].text).toBe('高赞建议')
  expect(finished?.sources[1].readError).toBe('帖子已删除')
})

test('stopping an automatic queue preserves evidence and cannot advance later', async () => {
  const fake = fakeApi()
  const service = createXiaohongshuResearch(fake.api)
  const first = readXiaohongshuPage(doc(cards()), searchUrl).sources[0]
  await service.readSources('安全工程师', [first])
  const note = {
    ...first,
    contentKind: 'visible-note',
    excerpt: '部分正文',
    commentCoverage: { status: 'loading', observed: 0, unknownLikes: 0, message: '加载评论' },
  }
  fake.setResult({ status: 'ready', sources: [note] })
  await service.poll()
  await service.cancel(true)
  const stopped = await createXiaohongshuResearch(fake.api).poll()
  expect(stopped?.status).toBe('ready')
  expect(stopped?.sources[0].excerpt).toBe('部分正文')
  expect(stopped?.pendingUrls).toEqual([])
})
