import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import puppeteer from 'puppeteer'

const prompts = []
const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', '*')
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }
  let raw = ''
  for await (const part of req) raw += part
  const body = JSON.parse(raw)
  const prompt = JSON.stringify(body.messages)
  prompts.push(prompt)
  const text = prompt.includes('请复盘') ? '逐题反馈：职责清楚。行动清单：补充项目结果。' : prompt.includes('每轮只提出') ? '请介绍你负责的一个项目？' : '简历方向：前端开发。建议补充职责和成果。'
  if (!body.stream) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ id: 'fixture', model: 'fixture-model', created: 1, choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }))
    return
  }
  res.writeHead(200, { 'Content-Type': 'text/event-stream' })
  res.end('data: ' + JSON.stringify({ choices: [{ index: 0, delta: { content: text }, finish_reason: null }] }) + '\n\ndata: ' + JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }) + '\n\n')
})
await new Promise((done) => server.listen(0, '127.0.0.1', done))
const temporary = await mkdtemp(join(tmpdir(), 'boss-workbench-flow-'))
let browser
try {
  browser = await puppeteer.launch({ executablePath: process.env.BOSS_TEST_CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true, pipe: true, enableExtensions: [resolve('.output/chrome-mv3')], userDataDir: join(temporary, 'profile') })
  const target = await browser.waitForTarget((item) => item.type() === 'service_worker' && item.url().startsWith('chrome-extension://'))
  const worker = await target.worker()
  await worker.evaluate(async (port) => {
    const profile = { id: 'profile-a', name: '保存版本', location: '', education: '', workYears: '', targetRoles: [], workExperience: [], internshipExperience: [], educationExperience: [], projects: [], selfIntroduction: '最初的简历', updatedAt: 1 }
    await chrome.storage.local.set({ 'career-workbench:profiles': [profile] })
    await chrome.storage.sync.set({ 'conf-model': [{ key: 'fixture', name: '测试现有模型', data: { base_url: 'http://127.0.0.1:' + port + '/v1', api_key: 'test-only', model: 'fixture-model', protocol: 'openai-compatible', advanced: {}, other: { timeout: 10000 } } }] })
  }, server.address().port)
  const url = 'chrome-extension://' + new URL(target.url()).hostname + '/options.html'
  const page = await browser.newPage()
  await page.setViewport({ width: 1400, height: 1000 })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('dialog', (dialog) => dialog.accept())
  async function click(label) {
    await page.waitForFunction((text) => [...document.querySelectorAll('button')].some((item) => item.textContent.trim() === text && !item.disabled && item.getClientRects().length), { polling: 50 }, label)
    await page.evaluate((text) => [...document.querySelectorAll('button')].find((item) => item.textContent.trim() === text && !item.disabled && item.getClientRects().length).click(), label)
  }
  async function text(value) {
    try { await page.waitForFunction((item) => document.body.innerText.includes(item), { polling: 50, timeout: 10000 }, value) }
    catch (cause) { console.log('UI:', await page.evaluate(() => document.body.innerText), 'Errors:', errors); throw cause }
  }
  await page.goto(url)
  await click('求职工作台')
  await text('保存版本')
  await page.click('[aria-label="简历档案"] button')
  await page.$eval('[data-testid="self-introduction"]', (item) => { item.value = '未保存的可见修改'; item.dispatchEvent(new Event('input', { bubbles: true })) })
  await text('有未保存修改')
  await page.evaluate(() => {
    const original = chrome.runtime.sendMessage.bind(chrome.runtime)
    chrome.runtime.sendMessage = async (...args) => {
      const result = await original(...args)
      if (args[0]?.command?.kind === 'profile' && !window.delayedProfileSave) {
        window.delayedProfileSave = true
        await new Promise((done) => { window.releaseProfileSave = done })
      }
      return result
    }
  })
  await click('保存简历')
  await page.waitForFunction(() => !!window.releaseProfileSave)
  await page.$eval('[data-testid="self-introduction"]', (item) => { item.value = '保存期间继续输入的修改'; item.dispatchEvent(new Event('input', { bubbles: true })) })
  await page.evaluate(() => window.releaseProfileSave())
  await text('有未保存修改')
  assert.equal(await page.$eval('[data-testid="self-introduction"]', (item) => item.value), '保存期间继续输入的修改')
  await click('模拟面试')
  await page.type('input[placeholder="填写目标岗位"]', '前端开发')
  await click('开始模拟面试')
  await text('请介绍你负责的一个项目？')
  assert(prompts[0].includes('保存期间继续输入的修改'), 'Interview uses the visible draft snapshot')
  await page.type('textarea[placeholder*="草稿自动"]', '我的回答草稿')
  await text('回答草稿已保存')
  await page.reload()
  await click('求职工作台')
  await click('面试复盘')
  await text('进行中，可继续')
  await page.evaluate(() => [...document.querySelectorAll('.career-workbench button')].find((item) => item.textContent.includes('前端开发') && item.textContent.includes('道问答')).click())
  await text('请介绍你负责的一个项目？')
  assert.equal(await page.$eval('textarea[placeholder*="草稿自动"]', (item) => item.value), '我的回答草稿')
  await click('提交回答')
  await text('回答已保存')
  await click('生成复盘')
  await text('复盘已保存')
  assert(prompts[1].includes('我的回答草稿'))
  assert(prompts[1].includes('保存期间继续输入的修改'))
  await click('保存并退出练习')
  await click('简历档案')
  await page.click('[aria-label="简历档案"] button')
  await click('简历建议')
  await page.evaluate(() => [...document.querySelectorAll('summary')].find((item) => item.textContent.includes('仅分析简历')).click())
  await click('仅根据简历分析方向和修改点')
  await text('简历方向：前端开发')
  await page.waitForFunction(() => ![...document.querySelectorAll('button')].some((item) => item.textContent.trim() === '停止生成'), { polling: 50 })
  await page.reload()
  await click('求职工作台')
  await click('建议记录')
  await text('简历方向：前端开发')
  await click('标记已处理')
  await text('已处理，标回待处理')
  await click('删除记录')
  await text('还没有建议记录')
  const second = await browser.newPage()
  await second.goto(url)
  const command = (id) => ({ type: 'career-repository-write', command: { kind: 'profile', value: { id, name: id, targetRoles: [], workExperience: [], internshipExperience: [], educationExperience: [], projects: [], updatedAt: 1 } } })
  const results = await Promise.all([page.evaluate((message) => chrome.runtime.sendMessage(message), command('concurrent-a')), second.evaluate((message) => chrome.runtime.sendMessage(message), command('concurrent-b'))])
  assert(results.every((item) => item.records && !item.error), JSON.stringify(results))
  const stored = await worker.evaluate(async () => (await chrome.storage.local.get('career-workbench:profiles'))['career-workbench:profiles'])
  assert(stored.some((item) => item.id === 'concurrent-a') && stored.some((item) => item.id === 'concurrent-b'))
  assert.deepEqual(errors, [])
  console.log('PASS: visible resume snapshot, interview draft/question reload, answer submission/review, advice history/delete, and two-page background writes in production extension.')
} finally {
  await browser?.close()
  server.closeAllConnections()
  await new Promise((done) => server.close(done))
  await rm(temporary, { recursive: true, force: true })
}
