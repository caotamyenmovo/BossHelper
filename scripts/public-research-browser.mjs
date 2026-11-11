import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import puppeteer from 'puppeteer'

const temporary = await mkdtemp(join(tmpdir(), 'boss-research-test-'))
const browser = await puppeteer.launch({
  executablePath:
    process.env.BOSS_TEST_CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  pipe: true,
  enableExtensions: [resolve('.output/chrome-mv3')],
  userDataDir: join(temporary, 'profile'),
})
let scenario = 'login'
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
        patterns: [
          { urlPattern: 'https://www.xiaohongshu.com/*', requestStage: 'Request' },
          { urlPattern: 'https://www.bing.com/*', requestStage: 'Request' },
        ],
      })
      session.on('Fetch.requestPaused', async ({ requestId, request }) => {
        const html = request.url.includes('bing.com')
          ? '<html><body><ol id="b_results"><li class="b_algo"><h2><a href="https://example.com/resume">Other website result</a></h2></li></ol></body></html>'
          : scenario === 'blocked'
            ? '<html><head><title>安全限制</title></head><body>当前网络存在风险，请切换可靠网络后重试</body></html>'
            : '<html><body><div class="login-container">扫码登录</div></body></html>'
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
  const workerTarget = await browser.waitForTarget(
    (target) =>
      target.type() === 'service_worker' && target.url().startsWith('chrome-extension://'),
  )
  const origin = `chrome-extension://${new URL(workerTarget.url()).hostname}`
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setViewport({ width: 1440, height: 1100 })
  await page.goto(`${origin}/options.html`)
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
  async function waitText(value) {
    try {
      await page.waitForFunction(
        (text) => document.body.innerText.includes(text),
        { polling: 100, timeout: 15000 },
        value,
      )
    } catch (error) {
      console.log('Waiting for:', value, 'UI:', await page.evaluate(() => document.body.innerText))
      console.log(
        'Task:',
        await page.evaluate(() => chrome.storage.local.get('careerXiaohongshuResearchV1')),
      )
      console.log('Page errors:', errors)
      for (const tab of await browser.pages())
        if (tab.url().includes('xiaohongshu.com'))
          console.log('XHS:', tab.url(), await tab.evaluate(() => document.body.innerText))
      throw error
    }
  }
  await page.waitForSelector('button[aria-label="求职工作台"]')
  await page.click('button[aria-label="求职工作台"]')
  await click('简历建议')
  await page.type('[data-testid="research-role"]', '安全工程师')
  assert(
    await page.$$eval('.research-toolbar button', (buttons) =>
      buttons.some((b) => b.textContent?.trim() === '打开小红书搜索' && b.getClientRects().length),
    ),
  )
  assert.equal(await page.$eval('[data-testid="research-fallback"]', (el) => el.open), false)
  await page.click('[data-testid="research-fallback"] summary')
  await click('公开索引检索')
  await waitText('公开搜索返回了其他网站或非笔记页面')
  await click('改用小红书网页搜索')
  const xhsTarget = await browser.waitForTarget(
    (target) =>
      target.type() === 'page' &&
      target.url().startsWith('https://www.xiaohongshu.com/search_result'),
  )
  const xhs = await xhsTarget.page()
  await page.bringToFront()
  await waitText('小红书要求登录或验证')
  await xhs.evaluate(() => {
    document.body.innerHTML =
      '<section class="note-item"><a class="cover" href="/search_result/1234567890abcdef12345678?xsec_token=fixture"></a><a class="title" href="/search_result/1234567890abcdef12345678?xsec_token=fixture">安全工程师简历：项目经历写法</a><div class="author"><span class="name">测试作者</span></div></section>'
  })
  await waitText('安全工程师简历：项目经历写法')
  assert(
    !(await browser.pages()).some((tab) =>
      tab.url().includes('/search_result/1234567890abcdef12345678'),
    ),
    'Search results must not automatically open the first note',
  )
  await click('读取正文和评论')
  assert(
    await page.$eval('.career-workbench', (el) =>
      el.innerText.includes('搜索卡片标题（未读取正文）'),
    ),
  )
  const link = await page.$eval('a[href*="xsec_token=fixture"]', (el) => el.href)
  assert(link.startsWith('https://www.xiaohongshu.com/search_result/'))
  assert(await page.$eval('[data-testid="generate-research-advice"]', (el) => el.disabled))
  const noteTarget = await browser.waitForTarget(
    (target) =>
      target.type() === 'page' && target.url().includes('/search_result/1234567890abcdef12345678'),
  )
  assert.notEqual(noteTarget, xhsTarget, 'The selected note opens only after the manual read click')
  const note = await noteTarget.page()
  await note.waitForSelector('.login-container')
  await note.evaluate(() => {
    document.body.innerHTML =
      '<div id="noteContainer"><h1 id="detail-title">安全工程师简历：项目经历写法</h1><div id="detail-desc">正文依据：说明本人职责、检查范围和实际成果。</div><div class="comments-container">' +
      ['3', '1.2万', '800', '900', '1.5千', '200', '50']
        .map(
          (likes, index) =>
            `<div class="comment-item" data-comment-id="c${index}"><div class="author"><span class="name">评论作者${index}</span></div><div class="content">建议内容${index}</div><div class="like"><span class="count">${likes}</span></div></div>`,
        )
        .join('') +
      '<div class="end-container">没有更多评论</div></div></div>'
  })
  await page.bringToFront()
  await waitText('所选帖子读取完成：已取得 1 篇正文和评论')
  await waitText('正文依据：说明本人职责、检查范围和实际成果。')
  assert.deepEqual(
    await page.$$eval('[data-testid="source-comments"] li', (items) =>
      items.map((item) => item.querySelector('p:last-child').textContent),
    ),
    ['建议内容1', '建议内容4', '建议内容3', '建议内容2', '建议内容5'],
  )
  await page.reload()
  await page.waitForSelector('button[aria-label="求职工作台"]')
  await page.click('button[aria-label="求职工作台"]')
  await click('简历建议')
  await waitText('安全工程师简历：项目经历写法')
  assert.equal(await page.$eval('[data-testid="research-role"]', (el) => el.value), '安全工程师')
  await waitText('正文依据：说明本人职责、检查范围和实际成果。')
  assert(
    !(await page.$eval('.career-workbench article', (el) => el.textContent.includes('评论作者0'))),
    'A comment author must not be reported as the note author',
  )
  await page.screenshot({
    path: resolve('.scratch/automatic-note-comments/browser-preview.png'),
    fullPage: true,
  })
  // Starting another query must clear old evidence. The actual website can block access.
  await page.$eval('[data-testid="research-role"]', (el) => {
    el.value = '产品经理'
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
  assert(!(await page.$('a[href*="xsec_token=fixture"]')))
  scenario = 'blocked'
  await click('打开小红书搜索')
  await page.bringToFront()
  await waitText('小红书页面显示安全限制或网络风险')
  assert.equal(errors.length, 0, errors.join('\n'))
  console.log(
    'PASS: public no-note diagnostics, webpage search/login continuation, title-only blocking, manual body and top-five comment reading, saved evidence recovery, stale-source clearing and website block reporting in the production extension.',
  )
} finally {
  await browser.close()
  await rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
}
