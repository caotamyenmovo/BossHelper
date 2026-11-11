import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import puppeteer from 'puppeteer'

const temporary = await mkdtemp(join(tmpdir(), 'boss-ui-layout-'))
const shots = resolve('.scratch/ui-unification/screenshots')
await mkdir(shots, { recursive: true })
const browser = await puppeteer.launch({
  executablePath:
    process.env.BOSS_TEST_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  pipe: true,
  enableExtensions: [resolve('.output/chrome-mv3')],
  userDataDir: join(temporary, 'profile'),
})
try {
  const target = await browser.waitForTarget(
    (t) => t.type() === 'service_worker' && t.url().startsWith('chrome-extension://'),
  )
  const worker = await target.worker()
  await worker.evaluate(async () => {
    await chrome.storage.local.set({
      careerXiaohongshuResearchV1: {
        token: 'layout-fixture',
        tabId: -1,
        role: 'AI Agent 开发',
        status: 'ready',
        createdAt: Date.now(),
        expiresAt: Date.now() + 600000,
        message: '检索完成：找到 12 条帖子。',
        sources: Array.from({ length: 12 }, (_, i) => ({
          title: 'AI Agent 开发简历：如何写清项目技术难点与个人贡献 ' + (i + 1),
          url: 'https://www.xiaohongshu.com/explore/fixture-' + i,
          author: '经验分享者 ' + (i + 1),
          contentKind: 'visible-card',
          excerpt: '先说明项目解决的问题，再介绍实现方式、验证过程和实际结果。',
        })),
      },
      'boss-protocol': '2026/10/21',
      'career-workbench:profiles': [
        {
          id: 'ui-fixture',
          name: '林晓',
          location: '上海',
          education: '本科',
          workYears: '3 年',
          targetRoles: ['前端开发工程师'],
          selfIntroduction: '负责企业协作产品的前端开发，熟悉 Vue、TypeScript 与性能优化。',
          workExperience: [],
          internshipExperience: [],
          educationExperience: [],
          projects: [],
          updatedAt: 1,
        },
      ],
    })
  })
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('dialog', (d) => d.accept())
  const url = 'chrome-extension://' + new URL(target.url()).hostname + '/options.html'
  await page.setViewport({ width: 1440, height: 1000 })
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }])
  await page.goto(url)
  await page.waitForSelector('.resume-list button')
  assert(
    await page.$eval('html', (e) => e.classList.contains('light')),
    'Default should be light even with a dark system',
  )
  assert.equal(await page.$eval('#career-title', (e) => e.textContent), '简历档案')
  await page.click('.resume-list button')
  await page.$eval('[data-testid="self-introduction"]', (e) => {
    e.value = '切换设置后应保留的简历草稿'
    e.dispatchEvent(new Event('input', { bubbles: true }))
  })
  async function click(label) {
    await page.waitForFunction(
      (text) =>
        [...document.querySelectorAll('button')].some(
          (b) => b.textContent.trim() === text && b.getClientRects().length && !b.disabled,
        ),
      {},
      label,
    )
    await page.evaluate(
      (text) =>
        [...document.querySelectorAll('button')]
          .find((b) => b.textContent.trim() === text && b.getClientRects().length && !b.disabled)
          .click(),
      label,
    )
  }
  await click('设置')
  await click('基础设置')
  await page.waitForSelector('.options-footer', { visible: true })
  await click('重载')
  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '重载')
        ?.disabled,
  )
  await click('简历档案')
  assert.equal(
    await page.$eval('[data-testid="self-introduction"]', (e) => e.value),
    '切换设置后应保留的简历草稿',
  )
  await page.screenshot({ path: join(shots, 'resume-light.png'), fullPage: true })
  await click('简历建议')
  await page.waitForSelector('.research-columns')
  await page.waitForFunction(
    () => document.querySelectorAll('.research-source-number').length === 12,
  )
  assert.deepEqual(
    await page.$$eval('.research-source-number', (nodes) => nodes.map((n) => n.textContent.trim())),
    Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')),
  )
  assert.equal(
    await page.$eval(
      '.research-columns',
      (e) => getComputedStyle(e).gridTemplateColumns.split(' ').length,
    ),
    2,
  )
  await page.screenshot({ path: join(shots, 'advice-light.png'), fullPage: true })
  await page.select('[aria-label="页面主题"]', 'dark')
  await page.waitForFunction(() => document.documentElement.classList.contains('dark'))
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 300)))
  console.log(
    'Dark colors:',
    await page.evaluate(() => ({
      nav: getComputedStyle(document.querySelector('.product-nav button')).color,
      input: getComputedStyle(document.querySelector('[data-testid="research-role"]'))
        .backgroundColor,
      ink: getComputedStyle(document.querySelector('.product-theme')).getPropertyValue(
        '--product-ink',
      ),
    })),
  )
  await page.screenshot({ path: join(shots, 'advice-dark.png'), fullPage: true })
  await page.evaluate(() => window.scrollTo(0, 900))
  await page.waitForFunction(
    () =>
      Math.abs(document.querySelector('.research-result-column').getBoundingClientRect().top - 20) <
      2,
  )
  assert(
    await page.$eval(
      '.research-result-column',
      (el) => el.getBoundingClientRect().bottom <= innerHeight - 18,
    ),
    'Sticky advice must fit the viewport',
  )
  await page.screenshot({ path: join(shots, 'advice-following-dark.png') })
  // Stress the rendered result region without making an AI request.
  await page.evaluate(() => {
    const text = document.createElement('p')
    text.dataset.fixture = 'long-advice'
    text.style.whiteSpace = 'pre-wrap'
    text.textContent = Array.from(
      { length: 70 },
      (_, i) => i + 1 + '. 描述项目场景、关键实现及验证结果。',
    ).join(String.fromCharCode(10))
    document.querySelector('.advice-result').append(text)
    const pane = document.querySelector('.research-result-column')
    pane.scrollTop = pane.scrollHeight
  })
  assert(
    await page.$eval(
      '.research-result-column',
      (el) => el.scrollTop > 0 && el.scrollHeight > el.clientHeight,
    ),
    'Long advice must scroll internally',
  )
  await page.$eval('.research-result-column > details:last-child', (el) => {
    el.open = true
  })
  await page.$eval('.research-result-column', (el) => {
    el.scrollTop = el.scrollHeight
  })
  assert(
    await page.$eval(
      '.research-result-column > details:last-child',
      (el) => el.getBoundingClientRect().bottom <= innerHeight,
    ),
    'Bottom controls must remain reachable',
  )
  await page.setViewport({ width: 600, height: 900 })
  assert.equal(
    await page.$eval('.research-result-column', (el) => getComputedStyle(el).position),
    'static',
  )
  assert.equal(
    await page.$eval('.research-result-column', (el) => getComputedStyle(el).maxHeight),
    'none',
  )
  await page.evaluate(() => {
    document.querySelector('[data-fixture=long-advice]').remove()
    window.scrollTo(0, 0)
  })
  await page.select('[aria-label="页面主题"]', 'system')
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }])
  await page.waitForFunction(() => document.documentElement.classList.contains('light'))
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }])
  await page.waitForFunction(() => document.documentElement.classList.contains('dark'))
  await page.select('[aria-label="页面主题"]', 'light')
  await page.screenshot({ path: join(shots, 'advice-narrow.png'), fullPage: true })
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'Narrow layout should not overflow horizontally',
  )
  await click('模拟面试')
  await page.screenshot({ path: join(shots, 'interview-narrow.png'), fullPage: true })
  await click('AI 模型配置')
  await page.screenshot({ path: join(shots, 'settings-narrow.png'), fullPage: true })
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'Settings should not overflow horizontally',
  )
  await page.select('[aria-label="页面主题"]', 'dark')
  await page.reload()
  await page.waitForSelector('.resume-list button')
  assert.equal(await page.$eval('[aria-label="页面主题"]', (e) => e.value), 'dark')
  assert(
    await page.$eval('html', (e) => e.classList.contains('dark')),
    'Explicit dark preference should survive reload',
  )
  await page.select('[aria-label="页面主题"]', 'light')
  assert.deepEqual(errors, [])
  console.log(
    'PASS: production default resume, retained resume draft, source/result columns, default light under dark system, explicit theme persistence, system theme changes, narrow navigation and settings. Screenshots:',
    shots,
  )
} finally {
  await browser.close()
  await rm(temporary, { recursive: true, force: true })
}
