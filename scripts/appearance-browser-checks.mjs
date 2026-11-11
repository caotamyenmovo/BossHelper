import assert from 'node:assert/strict'

// Exercises the actual extension in the delivery fixture, with no live account or requests.
export async function verifyAppearance(page, click, worker) {
  await page.setViewport({ width: 1440, height: 1050 })
  await page.evaluate(() => document.documentElement.removeAttribute('dark'))
  await page.evaluate(() => {
    document.title = 'Boss 职位列表 · 测试'
  })
  await click('外观')
  async function checkbox(label, checked) {
    const element = await page.evaluateHandle(
      (text) =>
        [...document.querySelector('boss-helper-job').shadowRoot.querySelectorAll('label')].find(
          (el) => el.textContent.trim() === text,
        ),
      label,
    )
    assert(element.asElement(), `Missing checkbox: ${label}`)
    const state = await element.evaluate((el) =>
      el.getRootNode().getElementById(el.htmlFor)?.getAttribute('aria-checked'),
    )
    if (state !== String(checked)) await element.asElement().click()
    await element.dispose()
    await page.waitForFunction(
      (text, expected) => {
        const root = document.querySelector('boss-helper-job').shadowRoot
        const label = [...root.querySelectorAll('label')].find(
          (el) => el.textContent.trim() === text,
        )
        return root.getElementById(label.htmlFor)?.getAttribute('aria-checked') === String(expected)
      },
      {},
      label,
      checked,
    )
  }
  async function number(label, value) {
    const input = await page.evaluateHandle(
      (text) =>
        document
          .querySelector('boss-helper-job')
          .shadowRoot.querySelector('input[aria-label="' + text + '"]'),
      label,
    )
    assert(input.asElement(), 'Missing numeric input: ' + label)
    await input.asElement().click()
    await page.keyboard.down('Control')
    await page.keyboard.press('A')
    await page.keyboard.up('Control')
    await page.keyboard.type(String(value))
    await page.keyboard.press('Tab')
    await input.dispose()
  }
  await checkbox('显示投递进度标题', true)
  await page.waitForFunction(() => document.title.includes('在线计算器'))
  await checkbox('显示投递进度标题', false)
  assert.equal(
    await page.title(),
    'Boss 职位列表 · 测试',
    'Disabling the dynamic title must restore the page title',
  )
  await checkbox('显示投递进度标题', true)
  await page.evaluate(() => {
    document.title = 'Boss 新页面'
  })
  await page.waitForFunction(() => document.title.includes('在线计算器'))
  await checkbox('显示投递进度标题', false)
  assert.equal(
    await page.title(),
    'Boss 新页面',
    'Restore the latest site title after SPA navigation',
  )

  await page.evaluate(() => {
    document.head.querySelectorAll('link[rel~="icon"]').forEach((el) => el.remove())
    const link = document.createElement('link')
    link.rel = 'icon'
    link.href = '/original-icon.png'
    link.type = 'image/png'
    link.sizes = '32x32'
    document.head.appendChild(link)
    const header = document.createElement('header')
    header.id = 'header'
    header.style.display = 'flex'
    header.textContent = 'Boss 导航'
    document.body.prepend(header)
  })
  await checkbox('使用计算器图标', true)
  await page.waitForFunction(() =>
    document.querySelector('link[rel=icon]').href.startsWith('data:image/svg+xml'),
  )
  await checkbox('使用计算器图标', false)
  assert.deepEqual(
    await page.evaluate(() => {
      const link = document.querySelector('link[rel=icon]')
      return [link.getAttribute('href'), link.type, link.sizes.value]
    }),
    ['/original-icon.png', 'image/png', '32x32'],
  )
  await checkbox('隐藏 Boss 顶部导航', true)
  await page.waitForFunction(
    () => getComputedStyle(document.getElementById('header')).display === 'none',
  )
  await checkbox('隐藏 Boss 顶部导航', false)
  assert.equal(
    await page.evaluate(() => getComputedStyle(document.getElementById('header')).display),
    'flex',
  )

  await checkbox('增加底部间距', true)
  await page.waitForFunction(
    () =>
      getComputedStyle(
        document.querySelector('boss-helper-job').shadowRoot.querySelector('.delivery-shell'),
      ).marginBottom === '300px',
  )
  await checkbox('增加底部间距', false)
  assert.notEqual(
    await page.evaluate(
      () =>
        getComputedStyle(
          document.querySelector('boss-helper-job').shadowRoot.querySelector('.delivery-shell'),
        ).marginBottom,
    ),
    '300px',
  )
  await number('面板宽度', 1000)
  await page.waitForFunction(
    () =>
      document
        .querySelector('boss-helper-job')
        .shadowRoot.querySelector('.delivery-shell')
        .getBoundingClientRect().width === 1000,
  )
  await checkbox('启用内容偏移', true)
  await number('内容偏移', 10)
  await page.waitForFunction(
    () =>
      document.querySelector('boss-helper-job').shadowRoot.querySelector('.delivery-shell').style
        .marginLeft === '10%',
  )
  await checkbox('侧栏显示在左侧', true)
  await page.waitForFunction(
    () =>
      document.querySelector('boss-helper-job').shadowRoot.querySelector('.delivery-shell').style
        .marginRight === '10%',
  )
  await checkbox('启用内容偏移', false)
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelector('boss-helper-job').shadowRoot.querySelector('.delivery-shell').style
          .marginRight,
    ),
    '',
  )

  await checkbox('默认打开 AI 记录', true)
  await page.waitForFunction(() =>
    document
      .querySelector('boss-helper-job')
      .shadowRoot.querySelector('.boss-chat-box[data-state=open]'),
  )
  await number('侧栏宽度', 480)
  await page.waitForFunction(
    () =>
      document
        .querySelector('boss-helper-job')
        .shadowRoot.querySelector('.boss-chat-box')
        ?.getBoundingClientRect().width === 480,
  )
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelector('boss-helper-job').shadowRoot.querySelector('.boss-chat-box').dataset
          .side,
    ),
    'left',
  )
  await checkbox('默认打开 AI 记录', false)
  await page.waitForFunction(
    () => !document.querySelector('boss-helper-job').shadowRoot.querySelector('.boss-chat-box'),
  )
  await number('侧栏宽度', 520)
  await checkbox('默认打开 AI 记录', true)
  await page.waitForFunction(
    () =>
      document
        .querySelector('boss-helper-job')
        .shadowRoot.querySelector('.boss-chat-box')
        ?.getBoundingClientRect().width === 520,
  )
  await checkbox('默认打开 AI 记录', false)
  await checkbox('模糊岗位卡片', true)
  await page.waitForFunction(
    () => !document.querySelector('boss-helper-job').shadowRoot.querySelector('.boss-chat-box'),
  )
  await click('岗位列表')
  await page.evaluate(() =>
    document.querySelector('boss-helper-job').shadowRoot.activeElement?.blur(),
  )
  await page.waitForFunction(() => {
    const overlay = document
      .querySelector('boss-helper-job')
      .shadowRoot.querySelector('.card-grid-overlay')
    return (
      overlay &&
      getComputedStyle(overlay).display !== 'none' &&
      getComputedStyle(overlay).pointerEvents === 'none'
    )
  })
  const strip = await page.evaluateHandle(() =>
    document.querySelector('boss-helper-job').shadowRoot.querySelector('.card-strip-viewport'),
  )
  await strip.asElement().scrollIntoView()
  const bounds = await strip.asElement().boundingBox()
  await page.mouse.move(bounds.x + 90, bounds.y + 70)
  await page.waitForFunction(
    () =>
      document
        .querySelector('boss-helper-job')
        .shadowRoot.querySelector('.card-strip-viewport')
        .style.getPropertyValue('--r') === '120px',
  )
  await page.evaluate(() =>
    document.querySelector('boss-helper-job').shadowRoot.querySelector('.card-grid').focus(),
  )
  assert.equal(
    await page.evaluate(
      () =>
        getComputedStyle(
          document.querySelector('boss-helper-job').shadowRoot.querySelector('.card-grid-overlay'),
        ).display,
    ),
    'none',
  )
  await strip.dispose()
  await click('表格')
  assert.equal(
    await page.evaluate(() =>
      document.querySelector('boss-helper-job').shadowRoot.querySelector('.card-grid-overlay'),
    ),
    null,
  )
  await click('外观')
  await number('表格高度', 55)
  await click('岗位列表')
  await page.waitForFunction(
    () =>
      document
        .querySelector('boss-helper-job')
        .shadowRoot.querySelector('[style*="--job-table-width"]')?.style.height === '550px',
  )
  await click('卡片')
  await click('外观')
  await page.screenshot({
    path: '.scratch/ui-unification/screenshots/appearance-desktop.png',
    fullPage: true,
  })
  await checkbox('默认打开 AI 记录', true)
  await checkbox('隐藏 Boss 顶部导航', true)
  await worker.evaluate(async () => {
    for (let i = 0; i < 100; i++) {
      let value = (await chrome.storage.sync.get('appearance-conf'))['appearance-conf']
      if (typeof value === 'string') value = JSON.parse(value)
      if (value?.defaultShowChatBox && value?.hideHeader && value?.contentWidth === 1000) return
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    throw new Error('Appearance settings were not saved')
  })
  await page.reload()
  await page.waitForFunction(() =>
    document
      .querySelector('boss-helper-job')
      ?.shadowRoot?.querySelector('.boss-chat-box[data-state=open]'),
  )
  await page.waitForFunction(
    () =>
      document
        .querySelector('boss-helper-job')
        .shadowRoot.querySelector('.delivery-shell')
        .getBoundingClientRect().width === 1000,
  )
  assert(
    await page.evaluate(
      () => !!document.querySelector('style[data-boss-helper-appearance=header]'),
    ),
    'Saved effects must apply without opening Appearance',
  )
  await page.setViewport({ width: 390, height: 844 })
  await page.waitForFunction(
    () =>
      document
        .querySelector('boss-helper-job')
        .shadowRoot.querySelector('.boss-chat-box')
        .getBoundingClientRect().width <= 374,
  )
  await page.evaluate(() => {
    const root = document.querySelector('boss-helper-job').shadowRoot
    root.querySelector('button[title="关闭"]').click()
  })
  await page.waitForFunction(
    () => !document.querySelector('boss-helper-job').shadowRoot.querySelector('.boss-chat-box'),
  )
  await click('外观')
  await page.waitForFunction(
    () =>
      document
        .querySelector('boss-helper-job')
        .shadowRoot.querySelector('.appearance-settings')
        ?.getClientRects().length,
  )
  await page.screenshot({
    path: '.scratch/ui-unification/screenshots/appearance-narrow.png',
    fullPage: true,
  })
  assert(
    await page.evaluate(() => {
      const el = document
        .querySelector('boss-helper-job')
        .shadowRoot.querySelector('.appearance-settings')
      return el.scrollWidth <= el.clientWidth + 1
    }),
    'Appearance settings must fit narrow windows',
  )
  await click('恢复默认外观')
  await page.waitForFunction(
    () => !document.querySelector('style[data-boss-helper-appearance=header]'),
  )
  await click('岗位列表')
  assert.equal(
    await page.evaluate(() =>
      document.querySelector('boss-helper-job').shadowRoot.querySelector('.card-grid-overlay'),
    ),
    null,
  )
  await page.setViewport({ width: 1440, height: 1050 })
  for (const offset of [10, 25]) {
    await worker.evaluate(
      (value) => chrome.storage.sync.set({ 'appearance-conf': { contentOffset: value } }),
      offset,
    )
    await page.reload()
    await page.waitForFunction(() =>
      document.querySelector('boss-helper-job')?.shadowRoot?.querySelector('.delivery-shell'),
    )
    await click('外观')
    await page.waitForFunction(
      (expected) => {
        const root = document.querySelector('boss-helper-job').shadowRoot
        const label = [...root.querySelectorAll('label')].find(
          (el) => el.textContent.trim() === '启用内容偏移',
        )
        return (
          label &&
          root.getElementById(label.htmlFor)?.getAttribute('aria-checked') === String(expected)
        )
      },
      {},
      offset !== 25,
    )
    const margin = await page.evaluate(
      () =>
        document.querySelector('boss-helper-job').shadowRoot.querySelector('.delivery-shell').style
          .marginLeft,
    )
    assert.equal(
      margin,
      offset === 25 ? '' : '10%',
      'Legacy offset settings must retain their meaning',
    )
  }
  await click('恢复默认外观')
  console.log(
    'PASS: all appearance toggles, numeric settings, restoration, saved reload, blur, table height and narrow layout.',
  )
}
