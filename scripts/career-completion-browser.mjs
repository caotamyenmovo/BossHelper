import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import puppeteer from 'puppeteer'

let scenario = 'success'
const requests = []
const sockets = new Set()
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
  requests.push({
    stream: body.stream,
    scenario,
    path: req.url,
    prompt: JSON.stringify(body.messages),
  })
  const message =
    scenario === 'success'
      ? '目标岗位：安全工程师\n\n匹配结论\n简历包含安全巡检经历，但职责和成果还不够具体。\n\n优先修改建议（最多 5 条）\n建议 1｜项目经历\n简历原文：参与安全巡检项目\n问题：没有说明本人负责范围和结果。\n来源依据：来源 1《项目经历写法》，正文强调职责与可核查成果。\n建议改写：建议：补充项目职责和实际成果。\n待补充：无\n\n求职方向与下一步\n补充检查范围和可核验结果。'
      : '已收到的部分建议。'
  if (scenario === 'responses' || scenario === 'invalid-responses') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    const events =
      scenario === 'responses'
        ? [
            {
              type: 'response.created',
              response: { id: 'resp_0', object: 'response', status: 'in_progress' },
              sequence_number: 0,
            },
            { type: 'response.in_progress', response: { id: 'resp_0' } },
            {
              type: 'response.output_item.added',
              output_index: 0,
              item: { type: 'message', id: 'msg_1' },
            },
            {
              type: 'response.output_text.delta',
              item_id: 'msg_1',
              delta: 'Responses 兼容修复：补充真实项目成果。',
            },
            {
              type: 'response.output_item.done',
              output_index: 0,
              item: { type: 'message', id: 'msg_1' },
            },
            { type: 'response.completed', response: {} },
          ]
        : [{ type: 'response.output_text.delta', item_id: 'msg_1', delta: 42 }]
    for (const event of events) res.write('data: ' + JSON.stringify(event) + '\n\n')
    if (scenario === 'invalid-responses') res.end()
    return
  }
  if (!body.stream) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.write(
      JSON.stringify({
        id: 'fixture',
        model: 'fixture-model',
        created: 1,
        choices: [
          { index: 0, message: { role: 'assistant', content: message }, finish_reason: 'stop' },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    )
    // Deliberately leave the completed JSON response open, like a misbehaving relay.
    return
  }
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
  res.write(
    `data: ${JSON.stringify({ id: 'fixture', model: 'fixture-model', created: 1, choices: [{ index: 0, delta: { content: message }, finish_reason: null }] })}\n\n`,
  )
  if (scenario === 'slow') {
    let count = 0
    const timer = setInterval(() => {
      count++
      if (count < 5)
        res.write(
          `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: '持续输出。' }, finish_reason: null }] })}\n\n`,
        )
      else {
        clearInterval(timer)
        res.write('data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n')
      }
    }, 600)
    res.on('close', () => clearInterval(timer))
  }
  if (scenario === 'success') {
    const timer = setTimeout(
      () => res.write('data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n'),
      450,
    )
    res.on('close', () => clearTimeout(timer))
  }
})
server.on('connection', (socket) => {
  sockets.add(socket)
  socket.on('close', () => sockets.delete(socket))
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port
const temporary = await mkdtemp(join(tmpdir(), 'boss-ai-response-test-'))
let browser
try {
  browser = await puppeteer.launch({
    executablePath:
      process.env.BOSS_TEST_CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    pipe: true,
    enableExtensions: [resolve('.output/chrome-mv3')],
    userDataDir: join(temporary, 'profile'),
  })
  const target = await browser.waitForTarget(
    (t) => t.type() === 'service_worker' && t.url().startsWith('chrome-extension://'),
  )
  const worker = await target.worker()
  await worker.evaluate(async (port) => {
    await chrome.storage.local.set({
      'conf-model': [
        {
          key: 'fixture',
          name: '本地测试中转',
          data: {
            base_url: `http://127.0.0.1:${port}/v1`,
            api_key: 'test-only',
            model: 'fixture-model',
            protocol: 'openai-compatible',
            advanced: {},
            other: { timeout: 1800 },
          },
        },
      ],
      careerXiaohongshuResearchV1: {
        token: 'fixture-search',
        tabId: 999,
        role: '安全工程师',
        status: 'ready',
        createdAt: Date.now(),
        expiresAt: Date.now() + 180000,
        message: '已读取 1 条小红书页面来源。',
        sources: [
          {
            title: '项目经历写法',
            url: 'https://www.xiaohongshu.com/explore/1234567890abcdef12345678',
            author: '测试作者',
            excerpt: '项目经历写法',
            contentKind: 'visible-card',
          },
        ],
      },
      'career-workbench:profiles': [
        {
          id: 'fixture-profile',
          name: '测试简历',
          location: '上海',
          education: '本科',
          workYears: '',
          targetRoles: ['简历中保存的旧岗位'],
          workExperience: [],
          internshipExperience: [],
          educationExperience: [],
          projects: [],
          selfIntroduction: '测试用虚拟简历',
          updatedAt: 1,
        },
      ],
    })
    const fixtureModel = await chrome.storage.local.get('conf-model')
    await chrome.storage.sync.set(fixtureModel)
    await chrome.storage.local.remove('conf-model')
  }, port)
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 1100 })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`chrome-extension://${new URL(target.url()).hostname}/options.html`)
  async function click(label) {
    await page.waitForFunction(
      (text) =>
        [...document.querySelectorAll('button')].some(
          (b) => b.textContent?.trim() === text && !b.disabled && b.getClientRects().length,
        ),
      { polling: 100 },
      label,
    )
    await page.evaluate(
      (text) =>
        [...document.querySelectorAll('button')]
          .find((b) => b.textContent?.trim() === text && !b.disabled && b.getClientRects().length)
          ?.click(),
      label,
    )
  }
  async function waitText(text) {
    try {
      await page.waitForFunction(
        (value) => document.body.innerText.includes(value),
        { polling: 100, timeout: 10000 },
        text,
      )
    } catch (error) {
      console.log('Waiting for:', text, 'UI:', await page.evaluate(() => document.body.innerText))
      console.log('Requests:', requests, 'Page errors:', errors)
      throw error
    }
  }
  async function openAdvice() {
    await page.waitForSelector('button[aria-label="求职工作台"]')
    await page.click('button[aria-label="求职工作台"]')
    await page.waitForSelector('[aria-label="简历档案"] button')
    await page.evaluate(() =>
      [...document.querySelectorAll('[aria-label="简历档案"] button')]
        .find((b) => b.textContent.includes('测试简历'))
        ?.click(),
    )
    await click('简历建议')
  }
  async function waitIdle() {
    await page.waitForFunction(
      () =>
        ![...document.querySelectorAll('button')].some((b) => b.textContent?.trim() === '停止生成'),
      { polling: 100, timeout: 10000 },
    )
  }
  await openAdvice()
  await waitText('搜索卡片标题（未读取正文）')
  assert(
    await page.$eval('[data-testid="generate-research-advice"]', (el) => el.disabled),
    'Title-only sources cannot trigger grounded advice',
  )
  assert.equal(requests.length, 0, 'Search/import must not implicitly send the resume to AI')
  await worker.evaluate(async () => {
    const key = 'careerXiaohongshuResearchV1'
    const task = (await chrome.storage.local.get(key))[key]
    task.sources[0].contentKind = 'visible-note'
    task.sources[0].excerpt = '正文依据：说明负责范围和可核实成果，不要堆砌工具名称。'
    task.sources[0].comments = [
      {
        id: 'c1',
        author: '高赞评论作者',
        text: '高赞评论：补充检查范围',
        likes: 12000,
        likesText: '1.2万',
      },
    ]
    task.sources[0].commentCoverage = {
      observed: 8,
      unknownLikes: 0,
      status: 'end',
      message: '已读取8条评论',
    }
    await chrome.storage.local.set({ [key]: task })
  })
  await page.reload()
  await openAdvice()
  await click('根据检索内容和简历生成修改意见')
  await waitText('建议：补充项目职责和实际成果。')
  assert(
    await page.evaluate(() =>
      [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === '停止生成'),
    ),
    'Partial text should render before the relay finish event',
  )
  await waitIdle()
  await waitText('已完成')
  assert.equal(requests.length, 1)
  assert.equal(requests[0].stream, true)
  assert(requests[0].prompt.includes('正文依据：说明负责范围和可核实成果'))
  assert(requests[0].prompt.includes('测试用虚拟简历'))
  assert(requests[0].prompt.includes('高赞评论：补充检查范围'))
  assert(requests[0].prompt.includes('12000'))
  assert(requests[0].prompt.includes('不能声称是全帖最高赞'))
  assert(requests[0].prompt.includes('安全工程师'))
  assert(requests[0].prompt.includes('安全工程师'))
  assert(!requests[0].prompt.includes('简历中保存的旧岗位'))
  await page.screenshot({
    path: resolve('.scratch/research-advice-formatted-preview.png'),
    fullPage: true,
  })
  assert(
    requests[0].prompt.includes('https://www.xiaohongshu.com/explore/1234567890abcdef12345678'),
  )
  assert(requests[0].prompt.includes('建议改写：给出可直接替换的文字'))
  assert(requests[0].prompt.includes('必须严格使用用户填写的目标岗位“安全工程师”'))

  scenario = 'cancel'
  await click('根据检索内容和简历生成修改意见')
  await waitText('已收到的部分建议。')
  await click('停止生成')
  await waitIdle()
  await waitText('已停止生成，已保留收到的内容。')
  assert.equal(
    await page.$eval('[data-testid="research-advice"]', (el) => el.textContent),
    '已收到的部分建议。',
  )

  scenario = 'timeout'
  await click('根据检索内容和简历生成修改意见')
  await waitText('生成超时：已收到部分内容')
  await waitIdle()
  assert.equal(
    await page.$eval('[data-testid="research-advice"]', (el) => el.textContent),
    '已收到的部分建议。',
  )
  assert.equal(requests.length, 3, 'Timeout must not silently retry')

  scenario = 'success'
  await page.evaluate(() =>
    [...document.querySelectorAll('summary')]
      .find((el) => el.textContent.includes('粘贴笔记'))
      ?.click(),
  )
  await page.type(
    'input[placeholder="小红书笔记链接"]',
    'https://www.xiaohongshu.com/explore/1234567890abcdef12345678',
  )
  await page.type(
    'textarea[placeholder="粘贴笔记正文或摘要"]',
    '虚拟帖子：说明项目职责和可核实的成果。',
  )
  await click('导入链接并整理建议')
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="research-advice"]')
        ?.textContent.includes('建议：补充项目职责'),
    { polling: 100, timeout: 10000 },
  )
  await waitIdle()
  assert.equal(requests.length, 4)
  assert(requests[3].prompt.includes('虚拟帖子：说明项目职责和可核实的成果。'))

  await worker.evaluate(async () => {
    const stored = await chrome.storage.sync.get('conf-model')
    stored['conf-model'][0].data.advanced = { body: { stream: false } }
    await chrome.storage.sync.set(stored)
    await chrome.storage.local.set({
      careerXiaohongshuResearchV1: {
        token: 'fixture-ready',
        tabId: 999,
        role: '安全工程师',
        status: 'ready',
        createdAt: Date.now(),
        expiresAt: Date.now() + 180000,
        message: '已取得正文',
        sources: [
          {
            title: '简历经验',
            url: 'https://www.xiaohongshu.com/explore/1234567890abcdef12345678',
            author: '',
            excerpt: '说明本人职责和可核实成果',
            contentKind: 'visible-note',
          },
        ],
      },
    })
  })
  await page.reload()
  await openAdvice()
  await click('根据检索内容和简历生成修改意见')
  await waitText('建议：补充项目职责和实际成果。')
  await waitIdle()
  assert.equal(requests.length, 5)
  assert.equal(requests[4].stream, false)
  scenario = 'slow'
  await worker.evaluate(async () => {
    const stored = await chrome.storage.sync.get('conf-model')
    stored['conf-model'][0].data.advanced = {}
    await chrome.storage.sync.set(stored)
  })
  await page.reload()
  await openAdvice()
  await click('根据检索内容和简历生成修改意见')
  await waitText('持续输出。')
  await waitIdle()
  await waitText('已完成')
  assert.equal(requests.length, 6)
  assert.equal(requests[5].stream, true)
  assert(!(await page.evaluate(() => document.body.innerText.includes('生成超时'))))
  await page.screenshot({
    path: resolve('.scratch/research-grounded-advice/browser-preview.png'),
    fullPage: true,
  })
  await worker.evaluate(async () => {
    const stored = await chrome.storage.sync.get('conf-model')
    stored['conf-model'][0].data.protocol = 'openai-responses'
    await chrome.storage.sync.set(stored)
  })
  scenario = 'responses'
  await page.reload()
  await openAdvice()
  await click('根据检索内容和简历生成修改意见')
  await waitText('Responses 兼容修复：补充真实项目成果。')
  await waitIdle()
  assert.equal(requests.at(-1).path, '/v1/responses')
  assert.equal(await page.$('.operation-error'), null)
  scenario = 'invalid-responses'
  await click('根据检索内容和简历生成修改意见')
  await waitText('AI 接口返回的数据格式不兼容')
  await waitIdle()
  assert(await page.$eval('.operation-error', (el) => el.getBoundingClientRect().height < 180))
  assert.equal(await page.$eval('.operation-error details', (el) => el.open), false)
  await page.click('.operation-error summary')
  assert(
    await page.$eval('.operation-error pre', (el) =>
      el.textContent.includes('Type validation failed'),
    ),
  )
  assert(await page.$eval('.operation-error pre', (el) => el.getBoundingClientRect().height <= 222))
  await page.screenshot({
    path: resolve('.scratch/delivery-polish/error-details.png'),
    fullPage: true,
  })
  assert.equal(errors.length, 0, errors.join('\n'))
  console.log(
    'PASS: title-only sources block AI; grounded advice sends actual source content, URL, role and resume; pasted evidence, partial rendering, finish without HTTP EOF, cancellation, idle timeout, long active streams and non-stream JSON pass without duplicate requests.',
  )
} finally {
  await browser?.close()
  for (const socket of sockets) socket.destroy()
  await new Promise((resolve) => server.close(resolve))
  await rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
}
