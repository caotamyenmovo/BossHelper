import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import puppeteer from 'puppeteer'

const requests = []
const navigations = []
let blocked = false
const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', '*')
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }
  let raw = ''
  for await (const chunk of req) raw += chunk
  const body = JSON.parse(raw)
  const prompt = JSON.stringify(body.messages)
  requests.push(prompt)
  let answer
  if (prompt.includes('生成查询计划'))
    answer = JSON.stringify({
      direction: 'AI Agent 智能体开发',
      queries: [1, 2, 3, 4].map((i) => ({ text: '智能体开发 简历经验 ' + i })),
    })
  else if (prompt.includes('判断以下帖子'))
    answer = JSON.stringify({
      items: [
        { id: 1, relevance: 'unrelated', reason: '自动写简历工具推广' },
        { id: 2, relevance: 'direct', reason: '岗位项目写法' },
      ],
    })
  else
    answer =
      '博主经验汇总\n描述本人职责 [来源2]\n\n整体修改方向\n说明智能体项目验证过程。\n建议改写：补充已有事实。'
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(
    JSON.stringify({
      id: 'fixture',
      model: 'fixture',
      created: 1,
      choices: [
        { index: 0, message: { role: 'assistant', content: answer }, finish_reason: 'stop' },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }),
  )
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port
const temp = await mkdtemp(join(tmpdir(), 'boss-research-v2-'))
const browser = await puppeteer.launch({
  executablePath:
    process.env.BOSS_TEST_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  pipe: true,
  enableExtensions: [resolve('.output/chrome-mv3')],
  userDataDir: join(temp, 'profile'),
})
try {
  const cdp = await browser.target().createCDPSession()
  await cdp.send('Target.setAutoAttach', {
    autoAttach: true,
    waitForDebuggerOnStart: true,
    flatten: true,
  })
  cdp.on('Target.attachedToTarget', async ({ sessionId, targetInfo }) => {
    const session = cdp.connection().session(sessionId)
    if (!session) return
    if (targetInfo.type === 'page') {
      await session.send('Fetch.enable', {
        patterns: [{ urlPattern: 'https://www.xiaohongshu.com/*', requestStage: 'Request' }],
      })
      session.on('Fetch.requestPaused', async ({ requestId, request }) => {
        navigations.push(request.url)
        const isSearch = new URL(request.url).pathname === '/search_result'
        const html = blocked
          ? '<title>安全限制</title><body>当前网络存在风险</body>'
          : isSearch
            ? '<body><section class="note-item"><a class="title" href="/explore/fixture001">用 Agent 自动写简历工具</a><span class="like-wrapper"><span class="count">9万</span></span></section><section class="note-item"><a class="title" href="/explore/fixture002">智能体开发简历项目经验</a><span class="like-wrapper"><span class="count">100</span></span><span class="collect-wrapper"><span class="count">200</span></span></section></body>'
            : '<body><div id="noteContainer"><div id="detail-title">智能体开发简历项目经验</div><div id="detail-desc">简历应明确本人职责、智能体工具调用设计和验证方式。</div><span class="like-wrapper"><span class="count">100</span></span><span class="collect-wrapper"><span class="count">200</span></span></div></body>'
        await session.send('Fetch.fulfillRequest', {
          requestId,
          responseCode: 200,
          responseHeaders: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }],
          body: Buffer.from(html).toString('base64'),
        })
      })
    }
    await session.send('Runtime.runIfWaitingForDebugger')
  })
  const target = await browser.waitForTarget(
    (t) => t.type() === 'service_worker' && t.url().startsWith('chrome-extension://'),
  )
  const worker = await target.worker()
  await worker.evaluate(async (port) => {
    await chrome.storage.sync.set({
      'conf-model': [
        {
          key: 'fixture',
          name: '本地测试模型',
          data: {
            base_url: 'http://127.0.0.1:' + port + '/v1',
            api_key: 'test-only',
            model: 'fixture',
            protocol: 'openai-compatible',
            advanced: { body: { stream: false } },
            other: { timeout: 10000 },
          },
        },
      ],
    })
    await chrome.storage.local.set({
      'boss-protocol': '2026/10/21',
      'career-workbench:profiles': [
        {
          id: 'research-fixture',
          name: '测试简历',
          location: '',
          education: '',
          workYears: '',
          targetRoles: ['agent'],
          workExperience: [],
          internshipExperience: [],
          educationExperience: [],
          projects: [],
          selfIntroduction: '实现了智能体工具调用',
          updatedAt: 1,
        },
      ],
    })
  }, port)
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('dialog', (dialog) => dialog.accept())
  await page.setViewport({ width: 1440, height: 1000 })
  const url = 'chrome-extension://' + new URL(target.url()).hostname + '/options.html'
  const click = async (label) => {
    await page.waitForFunction(
      (label) =>
        [...document.querySelectorAll('button')].some(
          (b) => b.textContent?.trim() === label && !b.disabled && b.getClientRects().length,
        ),
      { timeout: 30000, polling: 100 },
      label,
    )
    await page.evaluate(
      (label) =>
        [...document.querySelectorAll('button')]
          .find((b) => b.textContent?.trim() === label && !b.disabled && b.getClientRects().length)
          ?.click(),
      label,
    )
  }
  const waitText = async (text, timeout = 40000) => {
    try {
      await page.waitForFunction(
        (text) => document.body.innerText.includes(text),
        { timeout, polling: 100 },
        text,
      )
    } catch (error) {
      console.log(
        'Waiting for',
        text,
        'UI',
        await page.evaluate(() => document.body.innerText),
        'requests',
        requests,
        'navigations',
        navigations,
        'errors',
        errors,
      )
      console.log(
        'state',
        await worker.evaluate(() =>
          chrome.storage.local.get(['careerResearchRunV2', 'careerXiaohongshuResearchV1']),
        ),
      )
      throw error
    }
  }
  async function open() {
    console.log('Opening workbench')
    await page.bringToFront()
    await page.goto(url)
    console.log('Page loaded')
    await page.waitForSelector('.resume-list button')
    await page.click('.resume-list button')
    await click('简历建议')
  }
  await open()
  await page.type('textarea[placeholder*="岗位职责"]', '负责智能体工程落地')
  await click('检索并分析经验')
  await waitText('建议改写：补充已有事实。', 70000)
  await waitText('已完成')
  assert.equal(navigations.filter((url) => new URL(url).pathname === '/search_result').length, 4)
  assert(navigations.some((url) => url.includes('/explore/fixture002')))
  assert(!navigations.some((url) => url.includes('/explore/fixture001')))
  const lastPrompt = requests.at(-1)
  assert(lastPrompt.includes('负责智能体工程落地'))
  assert(lastPrompt.includes('"sourceId":2') || lastPrompt.includes('\\"sourceId\\":2'))
  assert(!lastPrompt.includes('用 Agent 自动写简历工具'))
  const state = await worker.evaluate(() =>
    chrome.storage.local.get(['careerResearchRunV2', 'career-workbench:advice']),
  )
  assert.equal(state.careerResearchRunV2.sources.length, 2)
  assert.equal(state.careerResearchRunV2.sources[0].selected, false)
  console.log('Automatic analysis passed')
  await page.bringToFront()
  await page.screenshot({
    path: '.scratch/research-experience-v2/browser-desktop.png',
    fullPage: true,
  })
  const calls = requests.length
  console.log('Testing restore')
  await open()
  await waitText('已恢复上次候选和读取进度')
  console.log('Restore passed')
  assert.equal(requests.length, calls)
  assert.equal(
    await page.$eval('textarea[placeholder*="岗位职责"]', (el) => el.value),
    '负责智能体工程落地',
  )
  await click('已选用 · 排除')
  assert(await page.$eval('[data-testid="generate-research-advice"]', (el) => el.disabled))
  blocked = true
  await page.click('.research-plan summary')
  await click('保留来源并补充检索')
  await waitText('流程已暂停')
  console.log('Block passed')
  await page.bringToFront()
  assert.equal(await page.$$eval('.research-source-number', (els) => els.length), 2)
  await page.setViewport({ width: 780, height: 1000 })
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  await page.screenshot({
    path: '.scratch/research-experience-v2/browser-narrow.png',
    fullPage: true,
  })
  assert.deepEqual(errors, [])
  console.log(
    'PASS: four queries, exclusion of unrelated popular note, automatic body reading, JD and stable citations, persistence without AI restart, manual exclusion, blocked-site preservation, narrow layout.',
  )
} finally {
  console.log('Cleaning up')
  server.closeAllConnections()
  await browser.close()
  await new Promise((resolve) => server.close(resolve))
  await rm(temp, { recursive: true, force: true })
}
