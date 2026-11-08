import { extractBossResumeFromDom } from './bossResumeDom'

export interface ResumeReaderOptions {
  deadline: number
  now?: () => number
  wait?: () => Promise<void>
  isResumePage?: () => boolean
}

/** Sampling only after DOM exists also handles SPA redirects and delayed rendering. */
export async function readStableBossResume(doc: Document, options: ResumeReaderOptions) {
  const now = options.now ?? Date.now
  const wait = options.wait ?? (() => new Promise<void>((resolve) => setTimeout(resolve, 500)))
  let previous = ''
  let stableSince = 0
  while (now() < options.deadline) {
    if (doc.body && (options.isResumePage?.() ?? true)) {
      const result = extractBossResumeFromDom(doc)
      const fingerprint = JSON.stringify(result.profile) + result.content
      if (result.ready && fingerprint === previous && now() - stableSince >= 1500)
        return { content: result.content, profile: result.profile }
      if (!result.ready || fingerprint !== previous) stableSince = now()
      previous = result.ready ? fingerprint : ''
    } else {
      previous = ''
      stableSince = now()
    }
    await wait()
  }
  const content = doc.body?.innerText || doc.body?.textContent || ''
  throw new Error(
    /扫码登录|手机号登录|短信登录|登录注册/.test(content)
      ? 'Boss 当前需要登录。请登录后重新点击“从 Boss 读取”。'
      : '读取 Boss 简历超时。请确认在线简历已加载完成，再重试；也可以导入 PDF、DOCX 或 TXT。',
  )
}
