import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import JSZip from 'jszip'
import puppeteer from 'puppeteer'

const temporary = await mkdtemp(join(tmpdir(), 'boss-import-test-'))
const extensionPath = resolve('.output/chrome-mv3')
const browser = await puppeteer.launch({
  executablePath:
    process.env.BOSS_TEST_CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  pipe: true,
  enableExtensions: [extensionPath],
  userDataDir: join(temporary, 'profile'),
})
try {
  // Intercept navigation to a synthetic Boss page in a clean test browser.
  // No login data or private Boss endpoint is accessed.
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
        patterns: [{ urlPattern: 'https://www.zhipin.com/*', requestStage: 'Request' }],
      })
      session.on('Fetch.requestPaused', async ({ requestId }) => {
        const html = `<!doctype html><html><body><nav>首页 推荐 职位</nav><main class="resume-container"><h3>教育经历</h3></main>
          <script>setTimeout(() => { document.querySelector('main').innerHTML = '<div class="resume-userinfo"><h2 class="name">张三</h2><p>所在城市：上海</p></div><h3>工作经历</h3><div class="work-item"><div>甲科技有限公司 | 后端工程师 | 2024.07 - 至今</div><div>负责接口开发</div></div><h3>实习经历</h3><div class="internship-item"><div>乙科技有限公司 | 开发实习生 | 2023.07 - 2023.10</div><div>参与服务开发</div></div><h3>教育经历</h3><div class="education-item"><div>您的在校经历内容缺失，这可能会影响到您的简历竞争力。</div><div>桂林电子科技大学 省部共建 2024-2027</div><div>网络空间安全</div><div>硕士</div></div><div class="education-item"><div>江西理工大学 省部共建 2020-2024</div><div>软件工程</div><div>本科</div></div><h3>求职期望</h3><div>北京、成都、上海、深圳</div><div>安全工程师</div><h3>个人优势</h3><div>熟悉 TypeScript。</div>'; history.replaceState({}, '', '/web/geek/resume'); }, 700)</script></body></html>`
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
  const worker = await workerTarget.worker()
  // WHATWG treats extension URLs as opaque origins in Node.
  const origin = `chrome-extension://${new URL(workerTarget.url()).hostname}`
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setViewport({ width: 1440, height: 1100 })
  await page.goto(`${origin}/options.html`)
  async function clickText(label) {
    await page.waitForFunction(
      (text) =>
        [...document.querySelectorAll('button')].some(
          (button) =>
            button.textContent?.trim() === text &&
            !button.disabled &&
            button.getClientRects().length > 0,
        ),
      { polling: 100 },
      label,
    )
    await page.evaluate(
      (text) =>
        [...document.querySelectorAll('button')]
          .find(
            (button) =>
              button.textContent?.trim() === text &&
              !button.disabled &&
              button.getClientRects().length > 0,
          )
          ?.click(),
      label,
    )
  }
  await clickText('求职工作台')
  await clickText('从 Boss 读取')
  try {
    await page.waitForFunction(() => document.body.innerText.includes('已读取 Boss 在线简历'), {
      timeout: 20000,
      polling: 100,
    })
  } catch (error) {
    console.log('UI errors:', errors)
    console.log(
      'Storage:',
      await worker.evaluate(() => chrome.storage.local.get('careerBossImportV2')),
    )
    for (const tab of await browser.pages())
      console.log(
        'Page:',
        tab.url(),
        await tab.evaluate(() => document.body?.innerText?.slice(0, 2500)),
      )
    throw error
  }
  await page.reload()
  await clickText('求职工作台')
  await page.waitForFunction(() => document.body.innerText.includes('已读取 Boss 在线简历'), {
    polling: 100,
  })
  await clickText('本地识别字段')
  const values = () =>
    page.$$eval('.career-workbench input', (inputs) => inputs.map((input) => input.value))
  assert((await values()).includes('张三'), 'Boss name should be filled')
  assert((await values()).includes('桂林电子科技大学'), 'Boss school should be filled')
  assert(
    (await values()).includes('网络空间安全'),
    'School major must not be a prompt or school badge',
  )
  assert(!(await values()).includes('省部共建'), 'School badges must not be fields')
  const experienceSections = await page.$$eval('.career-workbench section', (sections) =>
    sections
      .filter((section) => section.querySelector('h4')?.closest('section') === section)
      .map((section) => ({
        title: section.querySelector('h4')?.textContent,
        fields: [...section.querySelectorAll('input')].map((input) => input.value),
      })),
  )
  assert(
    experienceSections
      .find((section) => section.title === '工作/实习经历')
      ?.fields.includes('开发实习生'),
    'Internship should appear in the combined editor',
  )
  assert(
    experienceSections
      .find((section) => section.title === '工作/实习经历')
      ?.fields.includes('后端工程师'),
    'Work should appear in the combined editor',
  )
  assert.equal(experienceSections.filter((section) => section.title === '工作/实习经历').length, 1)
  assert(!experienceSections.some((section) => section.title === '实习经历'))
  await page.bringToFront()
  const roleTags = () =>
    page.$eval('[data-testid="target-roles"]', (input) =>
      [...input.parentElement.querySelectorAll('[data-slot="itemText"]')].map(
        (tag) => tag.textContent,
      ),
    )
  assert.deepEqual(await roleTags(), ['安全工程师'], 'Cities must not be imported as roles')
  await page.type('[data-testid="target-roles"]', 'Java Developer')
  await page.keyboard.press('Enter')
  await page.type('[data-testid="target-roles"]', 'Security Analyst')
  await page.click('[data-testid="self-introduction"]')
  assert.deepEqual(
    await roleTags(),
    ['安全工程师', 'Java Developer', 'Security Analyst'],
    'Enter and blur should commit complete roles',
  )
  const widths = await page.evaluate(() => {
    const roles = document
      .querySelector('[data-testid="target-roles"]')
      .parentElement.getBoundingClientRect()
    const intro = document
      .querySelector('[data-testid="self-introduction"]')
      .getBoundingClientRect()
    const section = [...document.querySelectorAll('.career-workbench section')]
      .find((item) => item.querySelector('h4')?.closest('section') === item)
      .getBoundingClientRect()
    return { roles: roles.width, intro: intro.width, available: section.width }
  })
  assert(widths.roles > widths.available * 0.9, JSON.stringify(widths))
  assert(widths.intro > widths.available * 0.9, JSON.stringify(widths))
  await page.screenshot({
    path: resolve('.scratch/resume-import-repair/fields-preview.png'),
    fullPage: true,
  })
  await page.evaluate(() => {
    const input = [...document.querySelectorAll('.career-workbench input')].find(
      (item) => item.value === '开发实习生',
    )
    input.value = '开发实习生（已编辑）'
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await clickText('确认并保存导入结果')
  await page.waitForFunction(() => document.body.innerText.includes('已保存到本地'), {
    polling: 100,
  })
  const savedBoss = await worker.evaluate(
    async () =>
      (await chrome.storage.local.get('career-workbench:profiles'))['career-workbench:profiles'][0],
  )
  assert.equal(savedBoss.workExperience[0].title, '后端工程师')
  assert.equal(savedBoss.internshipExperience[0].title, '开发实习生（已编辑）')
  assert(Array.isArray(savedBoss.workExperience))
  assert(Array.isArray(savedBoss.internshipExperience))
  assert.deepEqual(savedBoss.targetRoles, ['安全工程师', 'Java Developer', 'Security Analyst'])
  await page.click('[aria-label="删除工作/实习经历2"]')
  assert(
    !(await values()).includes('开发实习生（已编辑）'),
    'Combined editor must remove the selected internship',
  )
  assert((await values()).includes('后端工程师'), 'Deleting internship must retain work')
  // Read another file after a Boss import: previous Boss profile must not be reused.
  const textFile = join(temporary, 'resume.txt')
  await writeFile(
    textFile,
    '姓名：李四\n所在城市：杭州\n教育背景\n浙江大学 | 软件工程 | 硕士 | 2024.09 - 至今',
    'utf8',
  )
  const input = await page.$('input[type=file][accept*="pdf"]')
  assert(input, 'Resume file input should exist')
  await input.uploadFile(textFile)
  await page.waitForFunction(() => document.body.innerText.includes('导入预览：resume.txt'), {
    polling: 100,
  })
  await clickText('本地识别字段')
  assert((await values()).includes('李四'), 'New file name should replace Boss name')
  assert((await values()).includes('浙江大学'), 'New file school should replace Boss school')
  assert(
    !(await values()).includes('桂林电子科技大学'),
    'Previous Boss experience should not be retained',
  )
  assert(
    !(await values()).includes('开发实习生'),
    'A file without internships must not retain the previous source internship',
  )
  assert(
    !(await values()).includes('后端工程师'),
    'A file without jobs must not retain the previous source job',
  )
  await clickText('确认并保存导入结果')
  await page.waitForFunction(
    () =>
      document.body.innerText.includes('已保存到本地') ||
      document.body.innerText.includes('操作失败'),
    { polling: 100 },
  )
  assert(
    await page.evaluate(() => document.body.innerText.includes('已保存到本地')),
    await page.evaluate(() => document.querySelector('.career-workbench')?.innerText),
  )
  const profiles = await worker.evaluate(() =>
    chrome.storage.local.get('career-workbench:profiles'),
  )
  assert(
    JSON.stringify(profiles).includes('李四'),
    'Imported profile should be persisted after confirmation',
  )

  // A real PDF file exercises the worker URL and font/text extraction in extension CSP.
  const stream = 'BT /F1 16 Tf 50 750 Td (Name: Alice Smith) Tj ET'
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdf))
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`
  }
  const xref = Buffer.byteLength(pdf)
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n `)
    .join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  const pdfFile = join(temporary, 'resume.pdf')
  await writeFile(pdfFile, pdf)
  await input.uploadFile(pdfFile)
  await page.waitForFunction(() => document.body.innerText.includes('导入预览：resume.pdf'), {
    polling: 100,
  })
  await clickText('本地识别字段')
  assert((await values()).includes('Alice Smith'), 'PDF name should be extracted locally')

  const archive = new JSZip()
  archive.file(
    'word/document.xml',
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>姓名：王五</w:t></w:r></w:p></w:body></w:document>',
  )
  const docxFile = join(temporary, 'resume.docx')
  await writeFile(docxFile, await archive.generateAsync({ type: 'nodebuffer' }))
  await input.uploadFile(docxFile)
  await page.waitForFunction(() => document.body.innerText.includes('导入预览：resume.docx'), {
    polling: 100,
  })
  await clickText('本地识别字段')
  assert((await values()).includes('王五'), 'DOCX name should be extracted locally')
  assert.equal(errors.length, 0, errors.join('\n'))
  console.log(
    'PASS: extension merges work/internship editors, filters city roles, handles full-width role tags and introduction, edits/deletes internships, saves plain arrays, and imports Boss/TXT/PDF/DOCX without stale fields.',
  )
} finally {
  await browser.close()
  await rm(temporary, { recursive: true, force: true, maxRetries: 4, retryDelay: 300 })
}
