import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import puppeteer from 'puppeteer'

import { verifyAppearance } from './appearance-browser-checks.mjs'

const temporary = await mkdtemp(join(tmpdir(), 'boss-delivery-layout-'))
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
  await worker.evaluate(() => chrome.storage.sync.set({ 'boss-protocol': '2026/10/21' }))
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  await page.setViewport({ width: 1440, height: 1050 })
  await page.setRequestInterception(true)
  page.on('request', (req) => {
    if (req.url().startsWith('chrome-extension://')) return req.continue()
    if (req.isNavigationRequest())
      return req.respond({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: '<!doctype html><html><body><div id="wrap"><main class="job-recommend-main"><div class="job-recommend-search" style="height:60px">模拟 Boss 原生筛选</div></main></div><script>window._PAGE={uid:1,encryptUserId:"fixture",token:"fixture-only"};const v={$route:{path:"/web/geek/job-recommend"},$router:{afterHooks:[]},searchJobAction(){},clickJobCardAction(){}};for(const [key,value] of Object.entries({pageVo:{page:1,pageSize:15},hasMore:false,jobDetail:null,jobList:[{encryptJobId:"fixture-a",jobName:"前端开发工程师",salaryDesc:"18-25K",brandName:"示例科技",brandScaleName:"100-499人",brandIndustry:"互联网",cityName:"上海",jobExperience:"3-5年",jobDegree:"本科",bossName:"陈女士",bossTitle:"招聘经理",skills:["Vue","TypeScript"]},{encryptJobId:"fixture-b",jobName:"Web 开发工程师",salaryDesc:"15-22K",brandName:"示例产品",bossName:"刘先生",bossTitle:"技术负责人",skills:["React"]}]})){let saved=value;Object.defineProperty(v,key,{get(){return saved},set(value){saved=value},configurable:true})};document.querySelector("#wrap").__vue__=v;document.querySelector("main").__vue__=v;window.WebSocket=class extends EventTarget{constructor(){super();this.readyState=0;this.url="fixture";this.protocol=""}send(){}close(){this.readyState=3}};</script></body></html>',
      })
    return req.respond({
      status: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      contentType: 'application/json',
      body: req.url().includes('/get/wt')
        ? '{"code":0,"zpData":{"wt2":"fixture"}}'
        : '{"version":"0","notification":[]}',
    })
  })
  await page.goto('https://www.zhipin.com/web/geek/job-recommend')
  try {
    await page.waitForFunction(
      () => document.querySelector('boss-helper-job')?.shadowRoot?.querySelector('.job-card'),
      { timeout: 15000 },
    )
  } catch (error) {
    console.log(
      'Page errors:',
      errors,
      'DOM:',
      await page.evaluate(
        () =>
          document.body.innerHTML +
          document.querySelector('boss-helper-job')?.shadowRoot?.innerHTML,
      ),
    )
    throw error
  }
  await page.evaluate(() => {
    const app = document.querySelector('boss-helper-job')._vueApp
    window.fixtureHelper = Object.getOwnPropertySymbols(app._context.provides)
      .map((key) => app._context.provides[key])
      .find((value) => value?.jobList && value?.workflow)
    const helper = window.fixtureHelper
    const first = helper.jobList.value[0]
    first.skills = [
      'Vue',
      'TypeScript',
      '组件库',
      '性能优化',
      '前端工程化',
      '跨团队协作',
      '较长技能标签用于检查窄屏自动换行',
      'Vue',
    ]
    first.jobLabels = ['3-5年', '本科', 'Vue']
    for (let i = 2; i < 15; i++)
      helper.jobList.value.push({
        ...first,
        key: 'fixture-grid-' + i,
        jobName: ['产品研发工程师', '全栈开发工程师', '前端开发工程师'][i % 3],
        brand: { ...first.brand, name: '示例企业 ' + i },
      })
    helper.jobResultMaps.set('boss::fixture-b', {
      id: 'fixture-failure',
      status: 'error',
      reason: '示例失败原因',
    })
    window.fixtureStarts = []
    helper.start = async (mode) => {
      window.fixtureStarts.push(mode)
      helper.workflow.lastMode.value = mode
      helper.workflow.status.value = 'running'
    }
    helper.stop = () => {
      helper.workflow.status.value = 'stop'
    }
  })
  async function click(label, prefix = false) {
    await page.waitForFunction(
      (text, prefix) =>
        [...document.querySelector('boss-helper-job').shadowRoot.querySelectorAll('button')].some(
          (b) =>
            (prefix ? b.textContent.trim().startsWith(text) : b.textContent.trim() === text) &&
            !b.disabled &&
            b.getClientRects().length,
        ),
      {},
      label,
      prefix,
    )
    const button = await page.evaluateHandle(
      (text, prefix) =>
        [...document.querySelector('boss-helper-job').shadowRoot.querySelectorAll('button')].find(
          (b) =>
            (prefix ? b.textContent.trim().startsWith(text) : b.textContent.trim() === text) &&
            !b.disabled &&
            b.getClientRects().length,
        ),
      label,
      prefix,
    )
    await button.asElement().click()
    await button.dispose()
  }
  const filterHidden = () =>
    page.evaluate(
      () => document.querySelector('#boss-helper-external-wrapper')?.style.display === 'none',
    )
  await page.waitForFunction(
    () => document.querySelector('#boss-helper-external-wrapper')?.style.display === 'none',
  )
  await page.waitForFunction(
    () =>
      !document.querySelector('boss-helper-job').shadowRoot.querySelector('[data-slot="toast"]'),
  )
  await page.screenshot({ path: join(shots, 'delivery-light.png'), fullPage: true })
  await click('状态过滤')
  await page.waitForFunction(
    () =>
      document
        .querySelector('boss-helper-job')
        .shadowRoot.querySelector('[role=menu][data-state=open]')?.dataset.side,
  )
  assert.equal(
    await page.evaluate(
      () =>
        document
          .querySelector('boss-helper-job')
          .shadowRoot.querySelector('[role=menu][data-state=open]').dataset.side,
    ),
    'bottom',
    'Status menu must open below its trigger with the normal categories',
  )
  await page.screenshot({ path: join(shots, 'status-menu-normal.png'), fullPage: true })
  await page.keyboard.press('Escape')
  await page.waitForFunction(
    () => !document.querySelector('boss-helper-job').shadowRoot.querySelector('[role=menu]'),
  )
  // Exercise the real menu with enough task categories to require scrolling.
  await page.evaluate(() => {
    window.fixturePipeline = window.fixtureHelper.workflow.pipeline.value
    window.fixtureHelper.workflow.pipeline.value = Array.from({ length: 24 }, (_, i) => ({
      id: 'menu-fixture-' + i,
      label: '筛选条件 ' + i,
    }))
  })
  for (const [width, height, view] of [
    [1440, 1050, '卡片'],
    [700, 950, '表格'],
    [390, 844, '卡片'],
  ]) {
    await page.setViewport({ width, height })
    await click(view)
    await click('状态过滤')
    await page.waitForFunction(() => {
      const root = document.querySelector('boss-helper-job').shadowRoot
      return [
        ...root.querySelectorAll('[role=menu]'),
        ...document.querySelectorAll('[role=menu]'),
      ].some((el) => el.getClientRects().length && el.dataset.state === 'open')
    })
    const geometry = await page.evaluate(() => {
      const root = document.querySelector('boss-helper-job').shadowRoot
      const trigger = [...root.querySelectorAll('button')].find(
        (b) => b.textContent.trim() === '状态过滤' && b.getClientRects().length,
      )
      const menu = [
        ...root.querySelectorAll('[role=menu]'),
        ...document.querySelectorAll('[role=menu]'),
      ].find((el) => el.getClientRects().length && el.dataset.state === 'open')
      const viewport = menu.querySelector('[data-slot=viewport]')
      viewport.scrollTop = viewport.scrollHeight
      return {
        side: menu.dataset.side,
        top: menu.getBoundingClientRect().top,
        triggerBottom: trigger.getBoundingClientRect().bottom,
        bottom: menu.getBoundingClientRect().bottom,
        height: innerHeight,
        scrollable: viewport.scrollHeight > viewport.clientHeight,
        scrolled: viewport.scrollTop > 0,
      }
    })
    assert.equal(geometry.side, 'bottom', 'Status menu must open below its trigger')
    assert(geometry.top >= geometry.triggerBottom - 1, 'Menu must not cover the toolbar above')
    assert(geometry.bottom <= geometry.height - 7, 'Menu must fit the viewport')
    assert(geometry.scrollable && geometry.scrolled, 'Long menus must scroll internally')
    const lastItem = await page.evaluateHandle(() => {
      const items = document
        .querySelector('boss-helper-job')
        .shadowRoot.querySelectorAll('[role=menu][data-state=open] [role=menuitemcheckbox]')
      return items[items.length - 1]
    })
    await lastItem.asElement().click()
    await lastItem.dispose()
    await page.waitForFunction(() => {
      const root = document.querySelector('boss-helper-job').shadowRoot
      const menu = [
        ...root.querySelectorAll('[role=menu]'),
        ...document.querySelectorAll('[role=menu]'),
      ].find((el) => el.dataset.state === 'open')
      const items = menu?.querySelectorAll('[role=menuitemcheckbox]')
      return items?.[items.length - 1]?.getAttribute('aria-checked') === 'false'
    })
    await page.screenshot({ path: join(shots, `status-menu-${width}.png`), fullPage: true })
    await page.evaluate(() => {
      const menu = document
        .querySelector('boss-helper-job')
        .shadowRoot.querySelector('[role=menu][data-state=open]')
      const items = menu.querySelectorAll('[role=menuitemcheckbox]')
      items[items.length - 1].click()
    })
    await page.keyboard.press('Escape')
    await page.waitForFunction(
      () => !document.querySelector('boss-helper-job').shadowRoot.querySelector('[role=menu]'),
    )
  }
  await page.evaluate(() => {
    window.fixtureHelper.workflow.pipeline.value = window.fixturePipeline
  })
  await page.setViewport({ width: 1440, height: 1050 })
  async function assertGrid() {
    const geometry = await page.evaluate(() => {
      const root = document.querySelector('boss-helper-job').shadowRoot
      const grid = root.querySelector('.card-grid')
      const shell = root.querySelector('.delivery-surface')
      return {
        display: getComputedStyle(grid).display,
        overflow: grid.scrollWidth - grid.clientWidth,
        shellOverflow: shell.scrollWidth - shell.clientWidth,
        cards: grid.querySelectorAll('.job-card').length,
      }
    })
    assert.equal(geometry.display, 'flex')
    assert.equal(geometry.cards, 15)
    assert(geometry.overflow > 100, 'Cards must form a horizontally scrollable strip')
    assert(geometry.shellOverflow <= 1, 'Panel must not overflow horizontally')
  }
  await assertGrid()
  const firstCard = await page.evaluateHandle(() =>
    document.querySelector('boss-helper-job').shadowRoot.querySelector('.job-card'),
  )
  const resting = await firstCard.asElement().boundingBox()
  await page.mouse.move(resting.x + 80, resting.y + 90)
  await page.waitForFunction(() => {
    const card = document.querySelector('boss-helper-job').shadowRoot.querySelector('.job-card')
    const matrix = new DOMMatrix(getComputedStyle(card).transform)
    return matrix.m42 < -10 && Math.abs(matrix.b) > 0.01
  })
  const lifted = await firstCard.asElement().boundingBox()
  assert(lifted.y < resting.y - 5, 'Original-style hover should lift and tilt the card')
  await page.screenshot({ path: join(shots, 'delivery-hover.png'), fullPage: true })
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
  await page.waitForFunction(
    () =>
      getComputedStyle(
        document.querySelector('boss-helper-job').shadowRoot.querySelector('.job-card'),
      ).transform === 'none',
  )
  assert.equal(await firstCard.evaluate((el) => getComputedStyle(el).transitionDuration), '0s')
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }])
  await page.mouse.move(0, 0)
  await firstCard.dispose()
  const strip = await page.evaluateHandle(() =>
    document.querySelector('boss-helper-job').shadowRoot.querySelector('.card-grid'),
  )
  const box = await strip.asElement().boundingBox()
  await page.mouse.move(box.x + 200, box.y + 12)
  await page.mouse.down()
  await page.mouse.move(box.x + 60, box.y + 12, { steps: 10 })
  await page.mouse.up()
  assert(await strip.evaluate((el) => el.scrollLeft > 80), 'Mouse dragging must move the cards')
  await strip.evaluate((el) => {
    el.scrollLeft = 0
  })
  await click('下一组')
  await page.waitForFunction(
    () =>
      document.querySelector('boss-helper-job').shadowRoot.querySelector('.card-grid').scrollLeft >
      200,
  )
  await strip.evaluate((el) => {
    el.scrollLeft = 0
    el.focus()
  })
  await page.keyboard.press('ArrowRight')
  await page.waitForFunction(
    () =>
      document.querySelector('boss-helper-job').shadowRoot.querySelector('.card-grid').scrollLeft >
      200,
  )
  await strip.evaluate((el) => {
    el.scrollLeft = 0
  })
  await strip.dispose()
  await click('+2 个标签')
  await click('收起标签')
  await click('表格')
  await page.waitForFunction(() =>
    document.querySelector('boss-helper-job').shadowRoot.querySelector('table'),
  )
  await click('卡片')
  await assertGrid()
  await click('本页失败', true)
  await page.waitForFunction(
    () =>
      document.querySelector('boss-helper-job').shadowRoot.querySelectorAll('.job-card').length ===
      1,
  )
  assert(
    await page.evaluate(() =>
      document
        .querySelector('boss-helper-job')
        .shadowRoot.querySelector('.job-card')
        .textContent.includes('Web 开发工程师'),
    ),
  )
  await click('全部岗位')
  await click('筛选')
  try {
    await page.waitForFunction(
      () => document.querySelector('#boss-helper-external-wrapper')?.style.display === 'flex',
      { timeout: 5000 },
    )
  } catch (e) {
    console.log(
      'Filter diagnostics:',
      await page.evaluate(() => ({
        wrapper: document.querySelector('#boss-helper-external-wrapper')?.outerHTML,
        text: document.querySelector('boss-helper-job').shadowRoot.innerHTML.slice(-16000),
      })),
    )
    throw e
  }
  await click('岗位列表')
  await page.waitForFunction(
    () => document.querySelector('#boss-helper-external-wrapper')?.style.display === 'none',
  )
  assert(await filterHidden())
  await click('开始投递')
  await click('暂停')
  await click('继续投递')
  assert.deepEqual(await page.evaluate(() => window.fixtureStarts), ['auto', 'auto'])
  await click('暂停')
  await page.evaluate(() => document.documentElement.setAttribute('dark', ''))
  await page.screenshot({ path: join(shots, 'delivery-dark.png'), fullPage: true })
  await page.setViewport({ width: 700, height: 950 })
  await assertGrid()
  await page.screenshot({ path: join(shots, 'delivery-narrow.png'), fullPage: true })
  await page.setViewport({ width: 390, height: 844 })
  await assertGrid()
  if (process.env.BOSS_TEST_APPEARANCE) await verifyAppearance(page, click, worker)
  assert.deepEqual(errors, [])
  console.log(
    'PASS: production Boss panel mounting, failure filtering, native filter show/hide, start/pause/resume bindings, light/dark/narrow screenshots. Start handler stubbed; no real delivery or AI request.',
  )
} finally {
  await browser.close()
  await rm(temporary, { recursive: true, force: true })
}
