import { normalizeXiaohongshuNoteUrl } from '../composables/publicResearch'
import type { PublicCareerSource } from '../composables/publicResearch'
import type { XiaohongshuPageResult } from './xiaohongshuResearch'

function visible(element: Element) {
  if (element.closest('[hidden], [aria-hidden="true"], script, style, template')) return false
  for (let parent: Element | null = element; parent; parent = parent.parentElement) {
    const style = parent.ownerDocument.defaultView?.getComputedStyle(parent)
    if (style?.display === 'none' || style?.visibility === 'hidden') return false
  }
  return true
}
function text(element: Element | null) {
  return element && visible(element)
    ? (element as HTMLElement).innerText?.trim() || element.textContent?.trim() || ''
    : ''
}
function count(element: Element | null): number | null {
  const raw = text(element).replace(/[,，\s]/g, '')
  const match = raw.match(/^(\d+(?:\.\d+)?)(万|千|[wk])?\+?$/i)
  if (!match) return null
  const unit = match[2]?.toLowerCase()
  return Math.round(
    Number(match[1]) *
      (unit === '万' || unit === 'w' ? 10000 : unit === '千' || unit === 'k' ? 1000 : 1),
  )
}
function popularity(scope: Element) {
  const own = (selector: string) =>
    [...scope.querySelectorAll(selector)].find(
      (node) =>
        visible(node) &&
        !node.closest(
          '.comments-container, .comments-el, .comment-list, .comment-item, .comment-inner, [data-comment-id]',
        ),
    ) ?? null
  return {
    likes: count(own('.like-wrapper .count, .like-container .count, [data-note-likes]')),
    collects: count(
      own('.collect-wrapper .count, .collect-container .count, [data-note-collects]'),
    ),
  }
}
export function isNoteImageUrl(value: string) {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      (url.hostname === 'xhscdn.com' || url.hostname.endsWith('.xhscdn.com'))
    )
  } catch {
    return false
  }
}
export function readXiaohongshuPage(doc: Document, pageUrl: string): XiaohongshuPageResult {
  const empty = (
    status: XiaohongshuPageResult['status'],
    message: string,
  ): XiaohongshuPageResult => ({ status, message, sources: [] })
  if (!doc.body) return empty('loading', '正在等待小红书页面加载…')
  if (
    new URL(pageUrl).pathname === '/website-login/error' ||
    /安全限制|安全验证/.test(doc.title) ||
    /当前网络存在风险/.test(text(doc.body))
  )
    return empty(
      'blocked',
      '小红书页面显示安全限制或网络风险，尚未取得帖子。请先在小红书标签页处理页面提示，能够正常搜索后再重试。',
    )
  const login = [
    ...doc.querySelectorAll('.login-container, .login-modal, .login-mask, [role="dialog"]'),
  ].find((element) => visible(element) && /登录|验证码|扫码/.test(text(element)))
  if (login)
    return empty(
      'login',
      '小红书要求登录或验证，请在刚打开的小红书页面完成操作；完成后会继续读取。',
    )
  const detail = [
    ...doc.querySelectorAll(
      '#noteContainer, .note-detail-mask .note-container, .note-detail-container',
    ),
  ].find(visible)
  const currentNoteUrl = normalizeXiaohongshuNoteUrl(pageUrl)
  if (detail && currentNoteUrl) {
    const title = text(detail.querySelector('#detail-title, .title'))
    const body = text(detail.querySelector('#detail-desc, .desc, .note-text'))
    const images = [
      ...new Set(
        [
          ...detail.querySelectorAll<HTMLImageElement>(
            '.swiper-slide img, .note-slider img, [data-note-image]',
          ),
        ]
          .map((img) => img.currentSrc || img.src)
          .filter(isNoteImageUrl),
      ),
    ]
    if (body || images.length)
      return {
        status: 'ready',
        message: '',
        sources: [
          {
            title: title || '小红书笔记',
            author: text(
              [...detail.querySelectorAll('.author-container .username, .author .name')].find(
                (node) =>
                  !node.closest(
                    '.comments-container, .comments-el, .comment-list, .comment-item, .comment-inner, .comment-inner-container, [data-comment-id]',
                  ),
              ) ?? null,
            ),
            url: currentNoteUrl,
            excerpt: body.slice(0, 12000),
            contentKind: 'visible-note',
            ...popularity(detail),
            images: images.slice(0, 12),
            imageStatus: images.length
              ? `发现 ${images.length} 张图片，尚未识别；首轮最多识别 3 张。`
              : undefined,
          },
        ],
      }
  }
  // Only read cards in search results, never the unrelated home recommendation feed.
  if (new URL(pageUrl).pathname !== '/search_result')
    return empty('loading', '请在小红书标签页打开搜索结果或笔记正文，正在等待…')
  const sources: PublicCareerSource[] = []
  const seen = new Set<string>()
  for (const anchor of doc.querySelectorAll<HTMLAnchorElement>(
    'a[href*="/explore/"], a[href*="/search_result/"]',
  )) {
    if (!visible(anchor)) continue
    const url = normalizeXiaohongshuNoteUrl(anchor.getAttribute('href') ?? '', pageUrl)
    if (!url) continue
    const id = new URL(url).pathname.split('/').pop()!
    if (seen.has(id)) continue
    const card =
      anchor.closest('.note-item, .note-card, [data-note-id], article') ?? anchor.parentElement
    if (!card) continue
    const title = text(card.querySelector('.title, .note-title, [data-note-title]')) || text(anchor)
    if (!title || title.length > 300) continue
    seen.add(id)
    sources.push({
      title,
      author: text(card.querySelector('.author .name, .author-wrapper .name, .username')),
      url,
      excerpt: title,
      contentKind: 'visible-card',
      ...popularity(card),
    })
    if (sources.length >= 12) break
  }
  if (sources.length) return { status: 'ready', message: '', sources }
  const bodyText = text(doc.body)
  if (/没有找到|暂无搜索结果|没有相关|未找到相关/.test(bodyText))
    return empty('empty', '小红书页面没有相关结果，请缩短岗位名称或换一个关键词后重试。')
  if (/登录后查看|登录后搜索|请先登录|安全验证|完成验证/.test(bodyText))
    return empty('login', '请在小红书页面完成登录或验证，完成后会继续读取。')
  return empty(
    'loading',
    '正在等待小红书搜索结果显示；请确认页面正常加载，必要时向下滚动加载帖子。',
  )
}
