import type { ParsedResume } from '../composables/careerAi'
import {
  extractResumeFields,
  isResumeUiHint,
  isResumePlaceholder,
  parseResumeExperiences,
  resumeSection,
  validResumeName,
} from './resumeFields'

const EXCLUDED =
  'nav, aside, footer, script, style, noscript, button, input, textarea, select, [role="navigation"], [role="menu"], [role="dialog"], .resume-menu, .resume-nav, .resume-catalog, .resume-sider, .resume-sidebar, .resume-operation, .resume-actions, .edit-btn, .op, .operate, .resume-item-ops'
const ROOTS =
  '#resume, #resume-content, .resume-container, .resume-content, .resume-box, .resume-detail, .resume-preview, .geek-resume'
const NAME_SELECTORS =
  '.resume-userinfo .name, .resume-user-info .name, .resume-base-info .name, .resume-name, .name-text, [data-field="name"]'
const BLOCKS = /^(ADDRESS|ARTICLE|DD|DIV|DL|DT|H[1-6]|HEADER|LI|MAIN|P|SECTION|TABLE|TR|UL|OL)$/

function visible(element: Element) {
  for (let node: Element | null = element; node; node = node.parentElement) {
    if (node.hasAttribute('hidden') || node.getAttribute('aria-hidden') === 'true') return false
    const style = node.ownerDocument.defaultView?.getComputedStyle(node)
    if (style?.display === 'none' || style?.visibility === 'hidden') return false
  }
  return true
}

/** Read the rendered tree in place: detached innerText collapses section boundaries. */
export function bossVisibleText(root: Element): string {
  function visit(node: Node): string {
    if (node.nodeType === 3) return (node.textContent ?? '').replace(/[\s\u00a0]+/g, ' ')
    if (node.nodeType !== 1) return ''
    const element = node as Element
    if (element.matches(EXCLUDED) || !visible(element)) return ''
    if (element.tagName === 'BR') return '\n'
    const text = [...element.childNodes].map(visit).join('')
    if (BLOCKS.test(element.tagName)) return `\n${text}\n`
    if (element.tagName === 'TD' || element.tagName === 'TH') return `${text} | `
    return ` ${text} `
  }
  return visit(root)
    .split(/\n/)
    .map((line) => line.replace(/[ \t\u00a0]+/g, ' ').trim())
    .filter(
      (line) =>
        line &&
        !isResumeUiHint(line) &&
        !isResumePlaceholder(line) &&
        !/^(编辑|添加|删除|完善|展开|收起|保存|取消|暂无.*|请填写.*|添加.*经历)$/.test(line),
    )
    .join('\n')
}

function rootScore(root: Element) {
  const text = bossVisibleText(root)
  const sections = new Set(text.split('\n').map(resumeSection).filter(Boolean))
  return sections.size * 10 + (root.querySelector(NAME_SELECTORS) ? 5 : 0)
}

export function extractBossResumeFromDom(doc: Document): {
  content: string
  profile: ParsedResume
  ready: boolean
} {
  const empty = { content: '', profile: {}, ready: false }
  if (!doc.body) return empty
  let candidates = [...doc.querySelectorAll(ROOTS)].filter(
    (element) => visible(element) && !element.closest(EXCLUDED),
  )
  if (!candidates.length)
    candidates = [...doc.querySelectorAll('main, [role="main"]')].filter(visible)
  if (!candidates.length) {
    // A heading's containing section gives a safer fallback than parsing site navigation.
    const heading = [...doc.querySelectorAll('h1,h2,h3,h4')].find(
      (element) =>
        resumeSection(element.textContent ?? '') && visible(element) && !element.closest(EXCLUDED),
    )
    if (heading)
      candidates = [heading.closest('main') ?? heading.parentElement?.parentElement ?? doc.body]
  }
  if (!candidates.length) return empty
  const root = candidates.sort(
    (a, b) =>
      rootScore(b) - rootScore(a) || (a.textContent?.length ?? 0) - (b.textContent?.length ?? 0),
  )[0]!
  const content = bossVisibleText(root)
  const profile = extractResumeFields(content)
  const name = [...root.querySelectorAll(NAME_SELECTORS)]
    .filter(visible)
    .map((element) => validResumeName(element.textContent ?? ''))
    .find(Boolean)
  if (name) profile.name = name
  const read = (selectors: string) =>
    [...root.querySelectorAll(selectors)]
      .filter(visible)
      .map((element) => bossVisibleText(element).trim())
      .filter(Boolean)
  profile.location ||=
    read(
      '.resume-userinfo .city, .resume-user-info .city, .resume-base-info .city, [data-field="location"]',
    )[0] ?? ''
  profile.workYears ||=
    read(
      '.resume-userinfo .work-year, .resume-userinfo .work-years, .resume-user-info .work-year, [data-field="workYears"]',
    )[0] ?? ''
  const roles = read(
    '.resume-expect .position, .expect-item .position, .expect-item .job-name, .expect-job .job-name, [data-field="targetRole"]',
  )
  if (roles.length)
    profile.targetRoles = extractResumeFields(`求职期望\n${roles.join('\n')}`).targetRoles
  // DOM records preserve boundaries even when their dates precede or follow titles.
  const recordSelectors = {
    educationExperience:
      '.education-item, .education-list > li, [data-section="education"] > article',
    workExperience: '.work-item, .work-list > li, [data-section="work"] > article',
    internshipExperience:
      '.internship-item, .internship-list > li, [data-section="internship"] > article',
    projects: '.project-item, .project-list > li, [data-section="projects"] > article',
  } as const
  for (const kind of Object.keys(recordSelectors) as Array<keyof typeof recordSelectors>) {
    const entries = read(recordSelectors[kind]).flatMap((text) =>
      parseResumeExperiences(text.split('\n'), kind, true),
    )
    // Selectors may cover only part of a section; never discard other parsed records.
    const merged = [...(profile[kind] ?? [])]
    for (const entry of entries) {
      const existing = merged.findIndex(
        (item) =>
          (entry.organization &&
            item.organization === entry.organization &&
            item.period === entry.period) ||
          (item.title === entry.title && item.period === entry.period),
      )
      if (existing >= 0) merged[existing] = entry
      else merged.push(entry)
    }
    profile[kind] = merged
  }
  const internshipRows =
    profile.workExperience?.filter((item) => /实习|intern(?:ship)?/i.test(item.title)) ?? []
  profile.workExperience = profile.workExperience?.filter((item) => !internshipRows.includes(item))
  for (const item of internshipRows) {
    if (
      !profile.internshipExperience?.some(
        (existing) =>
          existing.title === item.title &&
          existing.organization === item.organization &&
          existing.period === item.period,
      )
    ) {
      ;(profile.internshipExperience ??= []).push(item)
    }
  }
  // A skeleton/menu mentioning sections and degrees is not a loaded resume.
  const hasExperience = [
    profile.workExperience,
    profile.internshipExperience,
    profile.educationExperience,
    profile.projects,
  ].some((entries) => entries?.some((entry) => entry.organization || (entry.title && entry.period)))
  const ready = Boolean(
    hasExperience ||
    (profile.name &&
      (profile.selfIntroduction ||
        profile.targetRoles?.length ||
        profile.location ||
        profile.workYears)),
  )
  return { content, profile, ready }
}
