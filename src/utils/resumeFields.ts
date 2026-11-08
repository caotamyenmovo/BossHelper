import type { ParsedResume } from '../composables/careerAi'

type Experience = NonNullable<ParsedResume['workExperience']>[number]
export type ExperienceKind =
  | 'workExperience'
  | 'internshipExperience'
  | 'educationExperience'
  | 'projects'

export const RESUME_SECTIONS = {
  workExperience: [
    '工作经历',
    '工作经验',
    '工作与实习经历',
    '职业经历',
    '工作履历',
    '工作及实习经历',
    '工作/实习经历',
    'Work Experience',
  ],
  internshipExperience: [
    '实习经历',
    '实习经验',
    '实习实践',
    '实习履历',
    'Internship Experience',
    'Internships',
    'Internship',
  ],
  educationExperience: ['教育经历', '教育背景', '教育信息', '学习经历', 'Education'],
  projects: ['项目经历', '项目经验', '科研经历', '科研项目', 'Project Experience', 'Projects'],
  selfIntroduction: [
    '个人优势',
    '自我介绍',
    '自我评价',
    '个人简介',
    '个人总结',
    'Profile',
    'Summary',
  ],
  targetRoles: [
    '求职意向',
    '求职期望',
    '期望职位',
    '目标岗位',
    '意向职位',
    '应聘职位',
    'Career Objective',
  ],
  basics: ['个人信息', '基本信息', '联系方式'],
  other: [
    '专业技能',
    '技能特长',
    '掌握技能',
    '荣誉奖项',
    '获奖经历',
    '资格证书',
    '证书',
    '校园经历',
    '社团/组织经历',
    '志愿经历',
    '兴趣爱好',
    '培训经历',
    '附件简历',
    '自定义添加',
    'Skills',
    'Certifications',
  ],
} as const

const FIELD_LABELS = {
  name: ['姓名', '名字', 'Name'],
  location: ['所在城市', '期望城市', '意向城市', '现居住地', '现居地', '居住地', '所在地', '城市'],
  education: ['最高学历', '学历'],
  workYears: ['工作经历年限', '工作年限', '工作经验', '工作经验年限'],
  targetRoles: ['求职意向', '求职期望', '期望职位', '目标岗位', '应聘职位', '意向职位'],
} as const
// Exact city names avoid removing valid titles such as “城市规划师”.
const COMMON_JOB_CITIES = new Set(
  '北京 天津 上海 重庆 成都 深圳 广州 杭州 南京 苏州 武汉 西安 长沙 郑州 合肥 济南 青岛 宁波 厦门 福州 泉州 无锡 常州 南通 东莞 佛山 珠海 中山 惠州 海口 三亚 昆明 贵阳 南宁 桂林 南昌 赣州 太原 石家庄 沈阳 大连 长春 哈尔滨 呼和浩特 银川 兰州 西宁 乌鲁木齐 拉萨 香港 澳门 台北'.split(
    ' ',
  ),
)
const NON_ROLE_LABEL =
  /^(?:期望城市|意向城市|所在城市|工作城市|城市|行业|期望薪资|薪资|求职状态|到岗时间)(?:[：:]|$)/

const OTHER_FIELDS = [
  '电话',
  '手机',
  '手机号',
  '邮箱',
  '邮件',
  '性别',
  '年龄',
  '出生年月',
  '出生日期',
  '籍贯',
  '期望薪资',
  '薪资',
  '求职状态',
  '到岗时间',
  '婚姻状况',
  '政治面貌',
]
const ALL_FIELDS = [...Object.values(FIELD_LABELS).flat(), ...OTHER_FIELDS].sort(
  (a, b) => b.length - a.length,
)
const DATE = String.raw`(?:19|20)\d{2}(?:\s*[./-]\s*\d{1,2}|\s*年(?:\s*\d{1,2}\s*月)?)?`
const PERIOD = new RegExp(
  `${DATE}\\s*(?:[-—–~～至到]|--)+\\s*(?:${DATE}|至今|现在|今|Present|Current)`,
  'i',
)
const DEGREE = /博士研究生|硕士研究生|博士|硕士|本科|大专|专科|高中|中专|MBA/gi
const ORGANIZATION =
  /[^|｜\t；;，,]+?(?:大学|学院|学校|公司|研究院|研究所|实验室|事务所|工作室|集团)(?:有限责任公司|有限公司)?/u
const NO_NAME =
  /^(首页|推荐|职位|公司|消息|我的|简历|个人简历|在线简历|求职简历|编辑|添加|保存|取消|男|女|本科|硕士|博士|至今|在校生|应届生|个人优势|资格证书|专业技能|求职状态|附件简历|预览简历)$/

export function cleanResumeLine(value: string) {
  return value
    .replace(/[\u0000\u200b-\u200d\ufeff]/g, '')
    .replace(/[\t \u00a0\u3000]+/g, ' ')
    .trim()
}

export function resumeSection(line: string): keyof typeof RESUME_SECTIONS | undefined {
  const title = cleanResumeLine(line)
    .replace(/^\s*(?:[一二三四五六七八九十\d]+[、.．)）]|[■◆●#•])\s*/, '')
    .replace(/[（(]\s*\d+\s*[)）]$/, '')
    .replace(/[\s：:]+$/, '')
  return (Object.keys(RESUME_SECTIONS) as Array<keyof typeof RESUME_SECTIONS>).find((key) =>
    RESUME_SECTIONS[key].some(
      (label) => label.replace(/\s/g, '').toLowerCase() === title.replace(/\s/g, '').toLowerCase(),
    ),
  )
}

function readField(lines: string[], labels: readonly string[]) {
  const labelPattern = labels.join('|')
  const matcher = new RegExp(
    `(?:^|[\\s|｜;；,，])(?:${labelPattern})\\s*(?:[：:]\\s*|(?=\\s)\\s+)(.*)$`,
    'i',
  )
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const match = line.match(matcher)
    if (match?.[1]) {
      return match[1]
        .split(new RegExp(`(?:${ALL_FIELDS.join('|')})\\s*[：:]`, 'i'))[0]!
        .replace(/[\s|｜;；,，]+$/, '')
        .trim()
    }
    if (
      labels.some(
        (label) =>
          line
            .replace(/[：:]$/, '')
            .trim()
            .toLowerCase() === label.toLowerCase(),
      )
    ) {
      const next = lines[i + 1] ?? ''
      if (
        next &&
        !resumeSection(next) &&
        !new RegExp(`^(?:${ALL_FIELDS.join('|')})[：:]`).test(next)
      )
        return next
    }
  }
  return ''
}

export function validResumeName(value: string) {
  const name = cleanResumeLine(value).replace(/(?<=[\u4e00-\u9fff]) +(?=[\u4e00-\u9fff])/g, '')
  if (NO_NAME.test(name) || resumeSection(name) || ALL_FIELDS.includes(name)) return ''
  return /^[\u4e00-\u9fff·]{2,6}$/.test(name) || /^[A-Za-z][A-Za-z .'’-]{1,40}$/.test(name)
    ? name
    : ''
}

const SCHOOL_BADGES =
  /省部共建|部省共建|双一流(?:建设高校)?|985(?:工程)?|211(?:工程)?|重点高校|重点大学|国家重点|全日制|非全日制/g

export function isResumePlaceholder(value: string) {
  return /^(?:无[。！!\s]*|暂无[。！!\s]*|未填写[。！!\s]*|待完善[。！!\s]*|[-—–]+)+$/.test(
    value.trim(),
  )
}

export function isResumeUiHint(value: string) {
  return /^(?:您的|你的).*(?:内容缺失|简历竞争力|完善|待补充)|^(?:尝试添加|点击添加|点击编辑|请完善|请补充|请填写|添加.*经历)|^.*(?:简历完整度|简历完善度)/.test(
    value.trim(),
  )
}

function headerValue(value: string, kind: ExperienceKind) {
  let text = stripPeriod(value)
  if (kind === 'educationExperience') text = text.replace(SCHOOL_BADGES, '').replace(DEGREE, '')
  return text.replace(/^[\s|｜/·,，:：-]+|[\s|｜/·,，:：-]+$/g, '').trim()
}

function stripPeriod(line: string) {
  return line
    .replace(PERIOD, '')
    .replace(/【[^】]*】/g, '')
    .replace(/[（(](?:[^)）]*(?:本科|硕士|博士|专科|在读)[^)）]*)[)）]/g, '')
    .trim()
}

function headerParts(line: string) {
  return stripPeriod(line)
    .replace(/^\d{1,2}[.、)]\s*/, '')
    .split(/[|｜\t]|\s{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function organizationIn(line: string) {
  const value = stripPeriod(line).replace(/^(?:学校|毕业院校|公司|企业|所在公司)\s*[：:]\s*/, '')
  const match = value.match(ORGANIZATION)
  return match?.[0]?.trim() ?? ''
}

export function parseResumeExperiences(
  lines: string[],
  kind: ExperienceKind,
  singleRecord = false,
): Experience[] {
  const blocks: string[][] = []
  let block: string[] = []
  let hasPeriod = false
  const finish = () => {
    if (block.length) blocks.push(block)
    block = []
    hasPeriod = false
  }
  for (let index = 0; index < lines.length; index++) {
    const line = cleanResumeLine(lines[index]!)
    if (
      !line ||
      resumeSection(line) ||
      isResumeUiHint(line) ||
      isResumePlaceholder(line) ||
      /^(添加|编辑|删除|保存|取消|展开|收起|暂无.*|请填写.*)$/.test(line)
    )
      continue
    const period = line.match(PERIOD)?.[0]
    const nextLine = cleanResumeLine(lines[index + 1] ?? '')
    const titleBeforeDate =
      !period && PERIOD.test(nextLine) && !stripPeriod(nextLine) && line.length < 80
    const org = organizationIn(line)
    const isBullet = /^(?:[-•●·]|\d{1,2}[.、)])\s*/.test(line)
    const isHeader =
      !isBullet &&
      line.length < 150 &&
      !/^(?:负责|参与|协助|主要|工作内容|项目描述|项目职责|项目成果|内容|业绩|描述|GPA|荣誉|获奖)/i.test(
        line,
      )
    // Dates in achievement bullets are not new experiences. A standalone date
    // following a school/company belongs to that same record.
    if (
      !singleRecord &&
      block.length &&
      isHeader &&
      (((period || titleBeforeDate) && hasPeriod) ||
        (org && block.some((item) => organizationIn(item)) && kind !== 'projects'))
    )
      finish()
    block.push(line)
    if (period) hasPeriod = true
  }
  finish()
  return blocks
    .map((rows): Experience => {
      const period = rows.map((row) => row.match(PERIOD)?.[0]).find(Boolean) ?? ''
      const headerRows: string[] = []
      for (const row of rows) {
        if (
          headerRows.length &&
          /^(?:[-•●·]|\d{1,2}[.、)]|负责|参与|协助|主要|工作内容|项目描述|项目职责|项目成果|内容[：:]|业绩[：:]|描述[：:]|GPA|荣誉|获奖)/i.test(
            row,
          )
        )
          break
        if (headerRows.length >= 8) break
        headerRows.push(row)
      }
      let organization =
        kind === 'projects'
          ? readField(headerRows, ['所属公司', '所在公司', '公司'])
          : readField(
              headerRows,
              kind === 'educationExperience' ? ['学校', '毕业院校'] : ['公司', '企业', '所在公司'],
            ) ||
            headerRows.map(organizationIn).find(Boolean) ||
            ''
      let title = readField(
        headerRows,
        kind === 'educationExperience'
          ? ['专业', '所学专业']
          : kind === 'projects'
            ? ['项目名称', '项目']
            : ['职位', '岗位', '职务'],
      )
      // Shorthand company names need no legal suffix when separated from a role.
      if (!organization && kind !== 'projects') {
        const delimited = headerRows.map(headerParts).find((parts) => parts.length >= 2)
        if (delimited) organization = delimited[0] ?? ''
      }
      if (!title) {
        const parts = headerRows
          .flatMap(headerParts)
          .map((part) => {
            const value = organization ? part.replace(organization, '') : part
            return headerValue(value, kind)
          })
          .filter(
            (part) =>
              part &&
              !isResumeUiHint(part) &&
              !isResumePlaceholder(part) &&
              !/^(?:在读|统招|至今|现在|应届|实习|在职|离职|学校|公司)$/.test(part),
          )
        title = parts[0] ?? ''
      }
      return { title, organization, period, description: rows.join('\n') }
    })
    .filter((entry) => Boolean(entry.organization || entry.title))
}

export function hasResumeFields(profile: ParsedResume) {
  return Boolean(
    profile.name ||
    profile.location ||
    profile.education ||
    profile.workYears ||
    profile.targetRoles?.length ||
    profile.workExperience?.length ||
    profile.internshipExperience?.length ||
    profile.educationExperience?.length ||
    profile.projects?.length ||
    profile.selfIntroduction,
  )
}

export function extractResumeFields(text: string): ParsedResume {
  const lines = text.split(/\r?\n/).map(cleanResumeLine).filter(Boolean)
  const sections: Record<string, string[]> = {}
  const experienceGroups: Partial<Record<ExperienceKind, string[][]>> = {}
  const initial: string[] = []
  let currentGroup: string[] | undefined
  let current: string | undefined
  for (const line of lines) {
    const section = resumeSection(line)
    if (section) {
      current = section
      currentGroup = undefined
      if (
        ['workExperience', 'internshipExperience', 'educationExperience', 'projects'].includes(
          section,
        )
      ) {
        currentGroup = []
        ;(experienceGroups[section as ExperienceKind] ??= []).push(currentGroup)
      }
      continue
    }
    currentGroup?.push(line)
    if (current) (sections[current] ??= []).push(line)
    else initial.push(line)
  }
  const basics = [...initial, ...(sections.basics ?? [])]
  const named = readField(lines, FIELD_LABELS.name)
  const name = validResumeName(named) || basics.slice(0, 6).map(validResumeName).find(Boolean) || ''
  const educationText = (sections.educationExperience ?? []).join(' ')
  const degrees = [
    '博士研究生',
    '博士',
    '硕士研究生',
    '硕士',
    '本科',
    '大专',
    '专科',
    '高中',
    '中专',
  ]
  const education =
    readField(basics, FIELD_LABELS.education) ||
    degrees.find((degree) => educationText.includes(degree)) ||
    ''
  const experiences = (kind: ExperienceKind) =>
    (experienceGroups[kind] ?? []).flatMap((group) => parseResumeExperiences(group, kind))
  const work = experiences('workExperience')
  const isInternship = (item: Experience) => /实习|intern(?:ship)?/i.test(item.title)
  const roleLines = sections.targetRoles ?? []
  const explicitRoles =
    readField(roleLines, ['期望职位', '目标岗位', '应聘职位', '意向职位']) ||
    (!roleLines.length ? readField(lines, FIELD_LABELS.targetRoles) : '')
  let skipNextRoleLine = false
  const roles =
    explicitRoles ||
    roleLines
      .filter((line) => {
        if (NON_ROLE_LABEL.test(line)) {
          skipNextRoleLine = !/[：:]\s*\S/.test(line)
          return false
        }
        if (skipNextRoleLine) {
          skipNextRoleLine = false
          return false
        }
        return true
      })
      .join('、')
  const targetRoles = [
    ...new Set(
      roles
        .split(/[、,，;；|｜]/)
        .map((role) => role.trim())
        .filter(
          (role) =>
            role &&
            !COMMON_JOB_CITIES.has(role.replace(/市$/, '')) &&
            !isResumePlaceholder(role) &&
            !isResumeUiHint(role) &&
            !/^(?:全职|兼职|实习)(?:职位|岗位|工作)?$/.test(role) &&
            !/[（(]行业[)）]|^(?:期望城市|所在城市|城市|行业|期望薪资|薪资|求职状态|到岗时间)[：:]/.test(
              role,
            ) &&
            !/^\d+(?:-\d+)?[Kk万千]|^(?:面议|薪资面议|行业不限|不限行业)$/.test(role),
        ),
    ),
  ]
  return {
    name,
    location: readField(lines, FIELD_LABELS.location),
    education,
    workYears:
      readField(basics, FIELD_LABELS.workYears) ||
      basics.join(' ').match(/\d+(?:\.\d+)?\s*年(?:以上)?(?:工作经验|经验)/)?.[0] ||
      '',
    targetRoles,
    workExperience: work.filter((item) => !isInternship(item)),
    internshipExperience: [...experiences('internshipExperience'), ...work.filter(isInternship)],
    educationExperience: experiences('educationExperience'),
    projects: experiences('projects'),
    selfIntroduction: (sections.selfIntroduction ?? [])
      .filter((line) => !isResumePlaceholder(line) && !isResumeUiHint(line))
      .join('\n'),
  }
}
