import type { PublicCareerComment, PublicCareerSource } from '../composables/publicResearch'
import { readXiaohongshuPage } from './xiaohongshuDom'

const commentSelector = '.comment-item, .comment-inner, .comment-inner-container, [data-comment-id]'
const detailSelector = '#noteContainer, .note-detail-container, .note-detail-mask .note-container'
function visible(element: Element) {
  for (let node: Element | null = element; node; node = node.parentElement) {
    if (node.matches('[hidden], [aria-hidden="true"]')) return false
    const style = node.ownerDocument.defaultView?.getComputedStyle(node)
    if (style?.display === 'none' || style?.visibility === 'hidden') return false
  }
  return true
}
function text(element: Element | null) {
  return element && visible(element)
    ? ((element as HTMLElement).innerText || element.textContent || '').trim()
    : ''
}

export function parseCommentLikes(raw: string): number | null {
  const value = raw.trim().replace(/[,，\s]/g, '')
  if (/^(赞|点赞|喜欢)$/.test(value)) return 0
  const match = value.match(/^(?:点赞|赞)?(\d+(?:\.\d+)?)(万|千|[wk])?\+?(?:赞|次赞|人赞|点赞)?$/i)
  if (!match) return null
  const unit = match[2]?.toLowerCase()
  return Math.round(
    Number(match[1]) *
      (unit === '万' || unit === 'w' ? 10000 : unit === '千' || unit === 'k' ? 1000 : 1),
  )
}

export function readCommentSnapshot(doc: Document): PublicCareerComment[] {
  const scope = [...doc.querySelectorAll(detailSelector)].find(visible)
  if (!scope) return []
  const result = new Map<string, PublicCareerComment>()
  for (const element of scope.querySelectorAll(commentSelector)) {
    if (!visible(element)) continue
    // Nested wrappers/replies must not donate their body/likes to their parent.
    const own = (selector: string) =>
      [...element.querySelectorAll(selector)].find(
        (node) => node.closest(commentSelector) === element,
      ) ?? null
    const body = text(own('.content, .comment-content, [data-comment-content]'))
    if (!body) continue
    const author = text(own('.author .name, .author .username, .user-name, [data-comment-author]'))
    const likesNode = own(
      '[data-like-count], .like .count, .like-wrapper .count, .like-container .count, .like-count, .likes, [aria-label*="点赞"], .like',
    )
    const likesText =
      likesNode?.getAttribute('data-like-count') ||
      text(likesNode) ||
      likesNode?.getAttribute('aria-label') ||
      ''
    const id = element.getAttribute('data-comment-id') || element.id || `${author}\n${body}`
    result.set(id, {
      id,
      author,
      text: body.slice(0, 2000),
      likes: parseCommentLikes(likesText),
      likesText,
    })
  }
  return [...result.values()]
}

export function topLikedComments(comments: PublicCareerComment[]): PublicCareerComment[] {
  return [...comments]
    .filter((comment) => comment.likes !== null)
    .sort((a, b) => b.likes! - a.likes! || a.id.localeCompare(b.id))
    .slice(0, 5)
}

/** Poll-driven, bounded collection: no background scrolling remains after cancellation. */
export function createNoteCommentReader(now = Date.now) {
  let state:
    | {
        key: string
        started: number
        lastChange: number
        lastExpand: number
        rounds: number
        comments: Map<string, PublicCareerComment>
        clicked: WeakSet<Element>
      }
    | undefined
  return (doc: Document, url: string, token: string) => {
    const page = readXiaohongshuPage(doc, url)
    if (page.status !== 'ready' || page.sources[0]?.contentKind !== 'visible-note') return page
    const key = `${token}:${new URL(url).pathname}`
    if (state?.key !== key)
      state = {
        key,
        started: now(),
        lastChange: now(),
        lastExpand: -Infinity,
        rounds: 0,
        comments: new Map(),
        clicked: new WeakSet(),
      }
    for (const comment of readCommentSnapshot(doc)) {
      const previous = state.comments.get(comment.id)
      if (!previous || previous.likes !== comment.likes || previous.text !== comment.text)
        state.lastChange = now()
      state.comments.set(comment.id, comment)
    }
    const detail = [...doc.querySelectorAll(detailSelector)].find(visible)!
    const commentArea = detail.querySelector(
      '.comments-container, .comments-el, .comment-list, [data-comments]',
    )
    const end = [
      ...detail.querySelectorAll(
        '.end-container, .no-more, .no-comments, .empty-comments, [data-comments-end]',
      ),
    ].some(
      (node) =>
        visible(node) &&
        !node.closest(commentSelector) &&
        /没有更多|全部评论|到底了|暂无评论|还没有评论|暂时没有|THE END|no more/i.test(text(node)),
    )
    const expand = [
      ...detail.querySelectorAll('.show-more, .more-replies, .reply-more, button, [role="button"]'),
    ].find(
      (node) =>
        visible(node) &&
        !state!.clicked.has(node) &&
        /^(展开|查看更多|加载更多).*(回复|评论)/.test(text(node)),
    )
    let status: NonNullable<PublicCareerSource['commentCoverage']>['status'] = 'loading'
    if (end && !expand && now() - state.lastExpand >= 1500) status = 'end'
    else if (
      now() - state.started >= 20000 ||
      state.rounds >= 15 ||
      (now() - state.started >= 6000 && now() - state.lastChange >= 6000)
    )
      status = state.comments.size ? 'limited' : 'unavailable'
    if (status === 'loading') {
      if (expand) {
        state.clicked.add(expand)
        state.lastExpand = now()
        ;(expand as HTMLElement).click()
      }
      // Scroll only the note's comment panel/containing scroller, without liking or posting.
      let scroller: Element | null = commentArea ?? detail
      while (scroller && scroller !== doc.body && scroller.scrollHeight <= scroller.clientHeight)
        scroller = scroller.parentElement
      if (scroller) {
        scroller.scrollTop = scroller.scrollHeight
        const EventConstructor = doc.defaultView?.Event ?? Event
        scroller.dispatchEvent(new EventConstructor('scroll', { bubbles: true }))
      }
      state.rounds++
    }
    const comments = [...state.comments.values()]
    const unknownLikes = comments.filter((comment) => comment.likes === null).length
    const selected = topLikedComments(comments)
    const message =
      status === 'loading'
        ? `正在加载评论，已读取 ${comments.length} 条…`
        : comments.length
          ? `已读取 ${comments.length} 条评论，按页面显示点赞数选取前 ${selected.length} 条${unknownLikes ? `；${unknownLikes} 条点赞数不可读，未参与排名` : ''}。${status === 'end' ? '页面已显示加载结束。' : '仅覆盖本次已加载评论，不保证是全帖最高赞。'}`
          : status === 'end'
            ? '页面显示暂无评论。'
            : '未读取到评论，可能未加载或页面受限。'
    page.sources[0].comments = selected
    page.sources[0].commentCoverage = { observed: comments.length, unknownLikes, status, message }
    return page
  }
}
