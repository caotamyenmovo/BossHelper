import { expect, test } from 'bun:test'

import JSZip from 'jszip'

import { extractResumeText } from '../src/composables/resumeImport'
import { extractResumeFields } from '../src/utils/resumeFields'

test('reads plain text resumes locally', async () => {
  const file = new File(['工程师\n负责订单系统'], 'resume.txt', { type: 'text/plain' })
  expect(await extractResumeText(file)).toBe('工程师\n负责订单系统')
})

test('extracts text from DOCX files locally', async () => {
  const archive = new JSZip()
  archive.file(
    'word/document.xml',
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>DOCX resume text</w:t></w:r></w:p></w:body></w:document>',
  )
  const file = new File([await archive.generateAsync({ type: 'arraybuffer' })], 'resume.docx')
  expect(await extractResumeText(file)).toContain('DOCX resume text')
})

test('reports unsupported resume extensions', async () => {
  const file = new File(['binary'], 'resume.doc', { type: 'application/msword' })
  await expect(extractResumeText(file)).rejects.toThrow('暂不支持 .doc')
})

test('reports empty files before attempting format parsing', async () => {
  const file = new File([], 'empty.txt', { type: 'text/plain' })
  await expect(extractResumeText(file)).rejects.toThrow('文件为空')
})

test('extracts common resume fields locally without an AI request', () => {
  const result = extractResumeFields(
    `姓名：李明
所在城市：上海
最高学历：本科
工作年限：5年
求职意向：前端开发、全栈工程师

自我评价
熟悉 Vue 和 TypeScript，负责过多个项目。`,
  )

  expect(result).toMatchObject({
    name: '李明',
    location: '上海',
    education: '本科',
    workYears: '5年',
    targetRoles: ['前端开发', '全栈工程师'],
    selfIntroduction: '熟悉 Vue 和 TypeScript，负责过多个项目。',
  })
})

test('recognizes resumes whose name and education are unlabelled', () => {
  const result = extractResumeFields(`周延鑫
电话：17870169219
教育背景
江西理工大学｜软件工程【本科】2020/09 - 2024/07
桂林电子科技大学｜网络空间安全【硕士研究生】2024/09 - 至今
项目经历`)

  expect(result.name).toBe('周延鑫')
  expect(result.education).toBe('硕士研究生')
  expect(result.educationExperience).toHaveLength(2)
  expect(result.educationExperience?.[0]).toMatchObject({
    organization: '江西理工大学',
    title: '软件工程',
  })
})

test('separates inline labels and never consumes the next field', () => {
  const result = extractResumeFields(
    '姓名：李明  性别：男  所在城市：上海\n学历：本科 工作年限：5年\n求职意向：前端工程师、全栈工程师',
  )
  expect(result).toMatchObject({
    name: '李明',
    location: '上海',
    education: '本科',
    workYears: '5年',
    targetRoles: ['前端工程师', '全栈工程师'],
  })
})

test('handles labels and values on separate lines and spaced Chinese names', () => {
  expect(extractResumeFields('姓名\n张 三\n所在城市\n杭州\n最高学历\n硕士')).toMatchObject({
    name: '张三',
    location: '杭州',
    education: '硕士',
  })
})

test('does not treat navigation or headings as a name', () => {
  const result = extractResumeFields('首页\n在线简历\n资格证书\n专业技能\n教育经历')
  expect(result.name).toBe('')
  expect(result.educationExperience).toEqual([])
})

test('keeps multiple education records and stops before skills/certificates', () => {
  const result = extractResumeFields(`张三
教育背景
2020.09 - 2024.06 南京大学 计算机科学 本科
GPA：3.7
2024.09 - 至今 浙江大学 软件工程 硕士研究生
荣誉奖项
奖学金
专业技能
TypeScript`)
  expect(result.education).toBe('硕士研究生')
  expect(result.educationExperience).toHaveLength(2)
  expect(result.educationExperience?.[0]).toMatchObject({
    organization: '南京大学',
    title: '计算机科学',
    period: '2020.09 - 2024.06',
  })
  expect(result.educationExperience?.[1]).toMatchObject({
    organization: '浙江大学',
    title: '软件工程',
    period: '2024.09 - 至今',
  })
  expect(result.educationExperience?.[1]?.description).not.toContain('TypeScript')
})

test('supports ASCII pipes and does not split numbered responsibility bullets', () => {
  const result = extractResumeFields(`工作经历
甲科技有限公司 | 前端工程师 | 2021/03 - 2023/08
1. 负责组件开发
2. 将响应时间缩短
乙科技有限公司 | 高级前端工程师 | 2023/09 - 至今
负责架构设计`)
  expect(result.workExperience).toHaveLength(2)
  expect(result.workExperience?.[0]).toMatchObject({
    organization: '甲科技有限公司',
    title: '前端工程师',
    period: '2021/03 - 2023/08',
  })
  expect(result.workExperience?.[0]?.description).toContain('2. 将响应时间缩短')
})

test('supports multiline experience headers and section aliases', () => {
  const result = extractResumeFields(`实习经历
甲科技有限公司
前端开发实习生
2023年6月 — 2023年9月
负责页面开发
教育信息
南京大学
2020.09 - 2024.06
计算机科学
本科
个人优势
熟悉 Web 开发。
资格证书
英语六级`)
  expect(result.internshipExperience?.[0]).toMatchObject({
    organization: '甲科技有限公司',
    title: '前端开发实习生',
    period: '2023年6月 — 2023年9月',
  })
  expect(result.educationExperience?.[0]).toMatchObject({
    organization: '南京大学',
    title: '计算机科学',
  })
  expect(result.selfIntroduction).toBe('熟悉 Web 开发。')
})

test('splits dated project records while retaining description dates', () => {
  const result = extractResumeFields(`项目经验
订单管理平台 | 2022.01 - 2022.12
1. 负责前端；2022.03 - 2022.05 完成迁移
数据可视化平台 | 2023.01 - 至今
负责图表模块`)
  expect(result.projects).toHaveLength(2)
  expect(result.projects?.[0]?.title).toBe('订单管理平台')
  expect(result.projects?.[1]?.title).toBe('数据可视化平台')
})

test('decodes UTF-16 text files', async () => {
  const file = new File([Buffer.from('\ufeff姓名：李明\n教育经历', 'utf16le')], 'resume.txt')
  expect(await extractResumeText(file)).toBe('姓名：李明\n教育经历')
})

test('recognizes basic-info headings and multiple target roles on separate lines', () => {
  const result = extractResumeFields(
    '个人信息\n李明\n所在城市：上海\n求职意向\n前端工程师\n全栈工程师\n期望薪资：面议\n教育经历\n南京大学 | 软件工程 | 本科 | 2020.09 - 2024.06',
  )
  expect(result.name).toBe('李明')
  expect(result.targetRoles).toEqual(['前端工程师', '全栈工程师'])
})

test('starts a new project when its name is followed by a standalone date range', () => {
  const result = extractResumeFields(
    '项目经历\n订单管理平台\n2022.01 - 2022.12\n负责前端开发\n数据可视化平台\n2023.01 - 至今\n负责图表模块',
  )
  expect(result.projects).toHaveLength(2)
  expect(result.projects?.[0]).toMatchObject({ title: '订单管理平台', period: '2022.01 - 2022.12' })
  expect(result.projects?.[1]).toMatchObject({ title: '数据可视化平台', period: '2023.01 - 至今' })
})

test('keeps internships in their own field rather than work or education', () => {
  const result = extractResumeFields(`姓名：张三
工作经历
甲科技有限公司 | 后端工程师 | 2024.07 - 至今
负责订单服务
实习经历
乙科技有限公司 | 后端实习生 | 2023.07 - 2023.10
参与接口开发
教育经历
南京大学 | 软件工程 | 本科 | 2020.09 - 2024.06`)
  expect(result.workExperience).toHaveLength(1)
  expect(result.internshipExperience).toHaveLength(1)
  expect(result.internshipExperience?.[0]).toMatchObject({
    organization: '乙科技有限公司',
    title: '后端实习生',
  })
  expect(result.educationExperience).toHaveLength(1)
})

test('does not put Boss completeness prompts and school badges into the major', () => {
  const result = extractResumeFields(`教育经历
您的在校经历内容缺失，这可能会影响到您的简历竞争力。尝试添加社团活动，获奖内容以及在校职务等信息
桂林电子科技大学 省部共建 2024-2027
网络空间安全
硕士
江西理工大学 省部共建 2020-2024
软件工程
本科`)
  expect(result.educationExperience).toHaveLength(2)
  expect(result.educationExperience?.[0]).toMatchObject({
    organization: '桂林电子科技大学',
    title: '网络空间安全',
    period: '2024-2027',
  })
  expect(result.educationExperience?.[1]).toMatchObject({
    organization: '江西理工大学',
    title: '软件工程',
    period: '2020-2024',
  })
  expect(result.educationExperience?.[0]?.description).not.toContain('竞争力')
})

test('ignores job type, industry and salary rather than treating them as target roles', () => {
  const result = extractResumeFields(
    '求职期望\n全职职位\n互联网（行业）\n期望职位：Java开发\n期望城市：杭州\n期望薪资：15-20K\n个人优势\n无无',
  )
  expect(result.targetRoles).toEqual(['Java开发'])
  expect(result.location).toBe('杭州')
  expect(result.selfIntroduction).toBe('')
})

test('date-first school headers stay in the same record and badges are not majors', () => {
  const result = extractResumeFields(
    '教育经历\n2024.09 - 2027.06\n桂林电子科技大学\n省部共建\n网络空间安全\n硕士\n2020.09 - 2024.06\n江西理工大学\n软件工程\n本科',
  )
  expect(result.educationExperience).toHaveLength(2)
  expect(result.educationExperience?.[0]?.title).toBe('网络空间安全')
  expect(result.educationExperience?.[1]?.period).toBe('2020.09 - 2024.06')
})

test('target roles exclude the city list shown in the screenshot', () => {
  expect(extractResumeFields('求职期望\n北京、成都、上海、深圳').targetRoles).toEqual([])
  expect(
    extractResumeFields(
      '求职期望\n北京\n安全工程师\n成都\n城市规划师\n上海市\nJava 开发工程师\n深圳',
    ).targetRoles,
  ).toEqual(['安全工程师', '城市规划师', 'Java 开发工程师'])
})

test('drops the complete labelled city list, including uncommon cities', () => {
  expect(
    extractResumeFields('求职期望\n安全工程师\n期望城市：景德镇、丽水\n期望薪资：15-20K')
      .targetRoles,
  ).toEqual(['安全工程师'])
  expect(extractResumeFields('求职期望\n意向城市\n景德镇、丽水\n安全工程师').targetRoles).toEqual([
    '安全工程师',
  ])
})
