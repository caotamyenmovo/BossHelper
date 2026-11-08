import { expect, test } from 'bun:test'

import { JSDOM } from 'jsdom'

import {
  createNoteCommentReader,
  parseCommentLikes,
  readCommentSnapshot,
  topLikedComments,
} from '../src/utils/xiaohongshuComments'

const url = 'https://www.xiaohongshu.com/explore/1234567890abcdef12345678'
const comment = (id: string, likes: string, body = `评论${id}`, extra = '') =>
  `<div class="comment-item" data-comment-id="${id}"><div class="author"><span class="name">作者${id}</span></div><div class="content">${body}</div><div class="like"><span class="count">${likes}</span></div>${extra}</div>`
const doc = (comments: string) =>
  new JSDOM(
    `<div id="noteContainer"><h1 id="detail-title">简历经验</h1><div id="detail-desc">正文</div><div class="interact-container">99999赞</div><div class="comments-container">${comments}</div></div>`,
    { url },
  ).window.document

test('parses displayed comment likes including compact units and does not invent unreadable counts', () => {
  for (const [value, count] of [
    ['1.2万', 12000],
    ['3.4w', 34000],
    ['1.5千', 1500],
    ['2K', 2000],
    ['1,234', 1234],
    ['赞', 0],
    ['点赞123', 123],
    ['20+', 20],
    ['--', null],
    ['', null],
  ] as const)
    expect(parseCommentLikes(value)).toBe(count)
})

test('sorts actual comment counts, not DOM order or post likes; deduplicates hidden/nested replies', () => {
  const d = doc(
    comment('1', '3', '父评论', comment('reply', '2万', '高赞回复')) +
      comment('2', '1.2万') +
      comment('3', '900') +
      comment('4', '50') +
      comment('5', '赞') +
      comment('6', '200') +
      comment('2', '1.2万') +
      `<div hidden>${comment('hidden', '9万')}</div>` +
      comment('unknown', '--'),
  )
  const comments = readCommentSnapshot(d)
  expect(comments.find((c) => c.id === '1')?.text).toBe('父评论')
  expect(comments.find((c) => c.id === '1')?.likes).toBe(3)
  expect(comments).toHaveLength(8)
  expect(topLikedComments(comments).map((c) => c.id)).toEqual(['reply', '2', '3', '6', '4'])
})

test('supports nested inner wrappers without merging or duplicating parent and reply', () => {
  const d = doc(
    '<div class="comment-item"><div class="comment-inner-container"><div class="author"><span class="name">甲</span></div><div class="content">父评论</div><div class="like-wrapper"><span class="count">11</span></div></div><div class="reply-container"><div class="comment-item"><div class="comment-inner-container"><div class="author"><span class="name">乙</span></div><div class="content">子回复</div><div class="like-wrapper"><span class="count">22</span></div></div></div></div></div>',
  )
  expect(readCommentSnapshot(d).map((c) => [c.author, c.text, c.likes])).toEqual([
    ['甲', '父评论', 11],
    ['乙', '子回复', 22],
  ])
})

test('collects lazily loaded comments across polls and returns highest five with coverage', () => {
  let time = 0
  const reader = createNoteCommentReader(() => time)
  const d = doc(comment('1', '2'))
  expect(reader(d, url, 'task').sources[0]!.commentCoverage?.status).toBe('loading')
  d.querySelector('.comments-container')!.innerHTML =
    comment('2', '200') +
    comment('3', '20') +
    comment('4', '400') +
    comment('5', '500') +
    comment('6', '600') +
    '<div class="end-container">没有更多评论</div>'
  time = 1500
  const source = reader(d, url, 'task').sources[0]!
  expect(source.author).toBe('')
  expect(source.comments?.map((c) => c.id)).toEqual(['6', '5', '4', '2', '3'])
  expect(source.commentCoverage).toMatchObject({ status: 'end', observed: 6 })
})

test('bounded partial/empty reads keep truthful coverage, and new tasks do not reuse old comments', () => {
  let time = 0
  const reader = createNoteCommentReader(() => time)
  const d = doc(comment('1', '7') + comment('2', '--'))
  reader(d, url, 'task')
  time = 21000
  const source = reader(d, url, 'task').sources[0]!
  expect(source.commentCoverage).toMatchObject({ status: 'limited', observed: 2, unknownLikes: 1 })
  expect(source.comments).toHaveLength(1)
  const empty = doc('')
  reader(empty, url, 'new-task')
  time += 21000
  expect(reader(empty, url, 'new-task').sources[0]!.commentCoverage?.status).toBe('unavailable')
  expect(
    reader(doc('<div class="no-comments">暂无评论</div>'), url, 'empty-task').sources[0]!
      .commentCoverage?.status,
  ).toBe('end')
})

test('expands a visible reply loader without clicking like buttons and waits for asynchronous replies', () => {
  let time = 0
  const reader = createNoteCommentReader(() => time)
  const d = doc(
    comment('1', '2') +
      '<button class="show-more">展开2条回复</button><button class="like-button">点赞</button><div class="end-container">没有更多评论</div>',
  )
  let expanded = 0,
    likes = 0
  d.querySelector('.show-more')!.addEventListener('click', () => expanded++)
  d.querySelector('.like-button')!.addEventListener('click', () => likes++)
  expect(reader(d, url, 'task').sources[0]!.commentCoverage?.status).toBe('loading')
  expect(reader(d, url, 'task').sources[0]!.commentCoverage?.status).toBe('loading')
  d.querySelector('.comments-container')!.insertAdjacentHTML('beforeend', comment('reply', '500'))
  time = 1600
  expect(reader(d, url, 'task').sources[0]!.comments?.[0]?.id).toBe('reply')
  expect(expanded).toBe(1)
  expect(likes).toBe(0)
})
