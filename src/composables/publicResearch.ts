export interface PublicCareerComment {
  id: string
  author: string
  text: string
  likes: number | null
  likesText: string
}

export interface PublicCareerSource {
  title: string
  author: string
  url: string
  excerpt: string
  contentKind?: 'search-snippet' | 'page-description' | 'visible-card' | 'visible-note' | 'pasted'
  comments?: PublicCareerComment[]
  commentCoverage?: {
    observed: number
    unknownLikes: number
    status: 'loading' | 'end' | 'limited' | 'unavailable'
    message: string
  }
  readError?: string
}

export function buildPublicXiaohongshuSearchUrl(role: string): string {
  const query = `site:xiaohongshu.com ${role.trim()} 简历`
  return `https://www.bing.com/search?q=${encodeURIComponent(query)}`
}

export function normalizeXiaohongshuNoteUrl(
  href: string,
  base = 'https://www.xiaohongshu.com',
): string | null {
  try {
    const url = new URL(href, base)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null
    if (['xhslink.com', 'www.xhslink.com'].includes(url.hostname))
      return url.pathname.length > 1 ? url.toString() : null
    if (!['xiaohongshu.com', 'www.xiaohongshu.com'].includes(url.hostname)) return null
    if (!/^\/(?:explore|search_result|discovery\/item)\/[a-z\d_-]{8,64}\/?$/i.test(url.pathname))
      return null
    url.hash = ''
    return url.toString()
  } catch {
    return null
  }
}

export function unwrapPublicSearchResultUrl(href: string): string {
  const result = new URL(href, 'https://www.bing.com')
  if (result.hostname !== 'bing.com' && !result.hostname.endsWith('.bing.com'))
    return result.toString()
  const encoded = result.searchParams.get('u')
  if (!encoded?.startsWith('a1')) return result.toString()
  const base64 = encoded.slice(2).replaceAll('-', '+').replaceAll('_', '/')
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export function parsePublicXiaohongshuResults(document: Document): PublicCareerSource[] {
  const results: PublicCareerSource[] = []
  const seen = new Set<string>()
  // Accept both list and card result layouts, including relative Bing redirects.
  for (const anchor of document.querySelectorAll<HTMLAnchorElement>(
    'li.b_algo h2 a, #b_results h2 a, #b_results h3 a, main h2 a, main h3 a',
  )) {
    let url: string | null
    try {
      url = normalizeXiaohongshuNoteUrl(
        unwrapPublicSearchResultUrl(anchor.getAttribute('href') ?? ''),
      )
    } catch {
      continue
    }
    if (!url) continue
    const key = new URL(url).origin + new URL(url).pathname
    if (seen.has(key)) continue
    seen.add(key)
    const item =
      anchor.closest('li.b_algo, .b_algo, article') ?? anchor.parentElement?.parentElement
    results.push({
      title: anchor.textContent?.trim() || '小红书公开内容',
      author: '',
      url,
      excerpt: item?.querySelector('.b_caption p, p')?.textContent?.trim() || '',
      contentKind: 'search-snippet',
    })
    if (results.length >= 8) break
  }
  return results
}

export async function searchPublicXiaohongshu(role: string): Promise<PublicCareerSource[]> {
  let response: Response
  try {
    response = await fetch(buildPublicXiaohongshuSearchUrl(role), {
      credentials: 'omit',
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new Error(
      '公开搜索连接失败或超时。可以使用“小红书网页检索”，直接读取浏览器中的搜索结果。',
    )
  }
  if (!response.ok)
    throw new Error(`公开搜索暂时不可用（HTTP ${response.status}），可改用“小红书网页检索”。`)
  const document = new DOMParser().parseFromString(await response.text(), 'text/html')
  const results = parsePublicXiaohongshuResults(document)
  if (results.length) return results
  if (
    /验证码|安全验证|verify|captcha|challenge/i.test(document.title) ||
    document.querySelector('#b_captcha, #captcha')
  )
    throw new Error('搜索服务要求验证，未取得检索结果。请使用“小红书网页检索”。')
  if (document.querySelector('#b_results h2 a, li.b_algo h2 a'))
    throw new Error(
      '公开搜索返回了其他网站或非笔记页面，没有可用的小红书帖子。请使用“小红书网页检索”。',
    )
  throw new Error(
    '公开索引未返回可识别的帖子结果，不代表小红书站内没有内容。请使用“小红书网页检索”。',
  )
}

export async function retrievePublicSource(
  source: PublicCareerSource,
): Promise<PublicCareerSource> {
  if (!normalizeXiaohongshuNoteUrl(source.url)) return source
  try {
    const response = await fetch(source.url, {
      credentials: 'omit',
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) return source
    const document = new DOMParser().parseFromString(await response.text(), 'text/html')
    if (/登录|安全验证|页面不存在|访问受限/.test(document.title)) return source
    const description =
      document.querySelector<HTMLMetaElement>('meta[property="og:description"]')?.content ||
      document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content
    if (!description || /登录后|扫码登录|安全验证|标记我的生活/.test(description)) return source
    return {
      ...source,
      title:
        document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content ||
        source.title,
      excerpt: description,
      contentKind: 'page-description',
    }
  } catch {
    return source
  }
}
