import { expect, test } from 'bun:test'

import { JSDOM } from 'jsdom'

import { extractBossResumeFromDom } from '../src/utils/bossResumeDom'
import {
  createBossResumeImportService,
  BOSS_IMPORT_KEY,
  BOSS_IMPORT_TIMEOUT,
  BOSS_RESULT_TTL,
} from '../src/utils/bossResumeImport'
import { readStableBossResume } from '../src/utils/bossResumeReader'
import { pdfTextToLines } from '../src/utils/pdfResumeText'

const resume = `<div class="resume-container">
  <div class="resume-userinfo"><h2 class="name">张三</h2><div>所在城市：上海</div></div>
  <div class="resume-menu"><div>教育经历</div><div>资格证书</div><div>专业技能</div></div>
  <div class="resume-item"><h3>个人优势<button>编辑</button></h3><div>熟悉 TypeScript 和 Vue。</div></div>
  <div class="resume-item"><h3>教育经历<button>添加</button></h3>
    <div class="education-item"><div>南京大学</div><div>2020.09 - 2024.06</div><div><span>计算机科学</span><span>本科</span></div></div>
    <div class="education-item"><div>浙江大学</div><div>2024.09 - 至今</div><div><span>软件工程</span><span>硕士</span></div></div>
  </div><div class="resume-item"><h3>专业技能</h3><div>JavaScript</div></div>
</div>`
function documentOf(html: string) {
  return new JSDOM(html).window.document
}

test('Boss parser excludes menus, hidden editors and preserves section/record boundaries', () => {
  const doc = documentOf(
    `<nav><h2>首页</h2></nav><div hidden><div class="resume-container"><h2 class="resume-name">错误姓名</h2></div></div>${resume}`,
  )
  const result = extractBossResumeFromDom(doc)
  expect(result.ready).toBe(true)
  expect(result.profile).toMatchObject({
    name: '张三',
    location: '上海',
    education: '硕士',
    selfIntroduction: '熟悉 TypeScript 和 Vue。',
  })
  expect(result.profile.educationExperience).toHaveLength(2)
  expect(result.profile.educationExperience?.[0]).toMatchObject({
    title: '计算机科学',
    organization: '南京大学',
    period: '2020.09 - 2024.06',
  })
  expect(result.content).not.toContain('首页')
  expect(result.content).not.toContain('错误姓名')
  expect(result.profile.educationExperience?.[1]?.description).not.toContain('JavaScript')
})

test('an unloaded document and section skeleton are not successful imports', () => {
  const doc = documentOf('')
  doc.body.remove()
  expect(extractBossResumeFromDom(doc).ready).toBe(false)
  const skeleton = documentOf(
    '<div class="resume-container"><h3>教育经历</h3><h3>工作经历</h3><div>添加工作经历</div><h3>个人优势</h3></div>',
  )
  expect(extractBossResumeFromDom(skeleton).ready).toBe(false)
})

test('waits for a body, a redirected resume route and stable loaded contents', async () => {
  const doc = documentOf('')
  doc.body.remove()
  let time = 0
  let correctRoute = false
  const result = await readStableBossResume(doc, {
    deadline: 10_000,
    now: () => time,
    isResumePage: () => correctRoute,
    wait: async () => {
      time += 500
      if (time === 500) {
        const body = doc.createElement('body')
        doc.documentElement.append(body)
      }
      if (time === 1000)
        doc.body.innerHTML = '<div class="resume-container"><h3>教育经历</h3></div>'
      if (time === 1500) {
        correctRoute = true
        doc.body.innerHTML = resume
      }
      if (time === 2000)
        doc
          .querySelector('.resume-userinfo')!
          .insertAdjacentHTML('beforeend', '<div>工作年限：应届生</div>')
    },
  })
  expect(time).toBeGreaterThanOrEqual(3500)
  expect(result.profile.name).toBe('张三')
  expect(result.profile.workYears).toBe('应届生')
})

test('reports login and timeout instead of returning empty fields', async () => {
  let time = 0
  await expect(
    readStableBossResume(documentOf('<div>扫码登录</div>'), {
      deadline: 1000,
      now: () => time,
      wait: async () => {
        time += 500
      },
    }),
  ).rejects.toThrow('需要登录')
})

function serviceFixture() {
  let time = 1000
  let tabId = 0
  const values: Record<string, unknown> = {}
  let beforeNavigate: (() => void) | undefined
  const api = {
    storage: {
      local: {
        get: async (key: string) => ({ [key]: values[key] }),
        set: async (items: Record<string, unknown>) => {
          Object.assign(values, structuredClone(items))
        },
        remove: async (key: string) => {
          delete values[key]
        },
      },
    },
    tabs: {
      create: async () => ({ id: ++tabId }),
      update: async () => {
        beforeNavigate?.()
        return {}
      },
    },
  }
  const service = createBossResumeImportService(api as never, () => time)
  return {
    service,
    values,
    api,
    advance: (ms: number) => {
      time += ms
    },
    beforeNavigate: (fn: () => void) => {
      beforeNavigate = fn
    },
  }
}

test('binds before navigation, survives lost query params and retains full text after reopen', async () => {
  const fixture = serviceFixture()
  fixture.beforeNavigate(() => expect(fixture.values[BOSS_IMPORT_KEY]).toBeTruthy())
  const task = await fixture.service.start()
  expect((await fixture.service.taskForTab(task.tabId))?.token).toBe(task.token)
  expect(await fixture.service.taskForTab(task.tabId + 1)).toBeNull()
  expect(
    await fixture.service.complete(task.tabId + 1, {
      token: task.token,
      content: 'other user',
      profile: { name: '李四' },
    }),
  ).toBe(false)
  const { content, profile } = extractBossResumeFromDom(documentOf(resume))
  expect(await fixture.service.complete(task.tabId, { token: task.token, content, profile })).toBe(
    true,
  )
  const reopened = createBossResumeImportService(fixture.api as never, () => 2000)
  expect(await reopened.status()).toMatchObject({ status: 'success', content, profile })
})

test('late results and stale cleanup do not overwrite a newer import', async () => {
  const { service } = serviceFixture()
  const first = await service.start()
  const second = await service.start()
  await service.clear(first.token)
  expect(await service.complete(first.tabId, { token: first.token, error: 'late' })).toBe(false)
  expect((await service.status())?.token).toBe(second.token)
  await service.tabClosed(first.tabId)
  expect((await service.status())?.status).toBe('pending')
  await service.tabClosed(second.tabId)
  expect((await service.status())?.error).toContain('已关闭')
})

test('timeouts survive background restart and expired results are removed on access', async () => {
  const fixture = serviceFixture()
  const task = await fixture.service.start()
  fixture.advance(BOSS_IMPORT_TIMEOUT + 1)
  expect((await fixture.service.status())?.status).toBe('error')
  expect(
    await fixture.service.complete(task.tabId, {
      token: task.token,
      profile: { name: '张三' },
      content: 'late',
    }),
  ).toBe(false)
  fixture.advance(BOSS_RESULT_TTL + 1)
  expect(await fixture.service.status()).toBeNull()
})

test('PDF fragments with baseline jitter form words without spaces between glyphs', () => {
  const item = (str: string, x: number, y: number, width = 10) => ({
    str,
    width,
    height: 10,
    transform: [1, 0, 0, 1, x, y],
  })
  expect(
    pdfTextToLines([
      item('张', 10, 100.1),
      item('三', 20, 99.6),
      item('教育', 10, 80, 20),
      item('背景', 30, 80.4, 20),
    ]),
  ).toBe('张三\n教育背景')
})

test('Boss school prompts/badges and separate internships match the reported screenshot', () => {
  const doc = documentOf(`<main class="resume-container">
    <h2 class="resume-name">张三</h2>
    <h3>求职期望</h3><div>全职职位</div><div>互联网（行业）</div><div class="expect-item"><span class="position">后端开发</span></div>
    <h3>个人优势</h3><div>无无</div>
    <h3>工作经历</h3><div class="work-item"><div>甲科技有限公司 | 后端工程师</div><div>2024.07 - 至今</div><p>负责接口开发</p></div>
    <h3>实习经历</h3><div class="internship-item"><div>乙科技有限公司 | 开发实习生</div><div>2023.07 - 2023.10</div><p>参与服务开发</p></div>
    <h3>教育经历</h3>
    <div class="education-item"><p>您的在校经历内容缺失，这可能会影响到您的简历竞争力。尝试添加社团活动，获奖内容以及在校职务等信息</p><div>桂林电子科技大学 <span>省部共建</span> <span>2024-2027</span></div><div>网络空间安全</div><div>硕士</div></div>
    <div><div>江西理工大学 省部共建 2020-2024</div><div>软件工程</div><div>本科</div></div>
  </main>`)
  const { profile } = extractBossResumeFromDom(doc)
  expect(profile.workExperience).toHaveLength(1)
  expect(profile.internshipExperience).toHaveLength(1)
  expect(profile.internshipExperience?.[0]?.title).toBe('开发实习生')
  expect(profile.educationExperience).toHaveLength(2)
  expect(profile.educationExperience?.map((entry) => entry.title)).toEqual([
    '网络空间安全',
    '软件工程',
  ])
  expect(profile.targetRoles).toEqual(['后端开发'])
  expect(profile.selfIntroduction).toBe('')
})
