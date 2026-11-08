import { browser, defineContentScript } from '#imports'
import { createNoteCommentReader } from '@/utils/xiaohongshuComments'
import { readXiaohongshuPage } from '@/utils/xiaohongshuDom'

export default defineContentScript({
  matches: ['https://www.xiaohongshu.com/*', 'https://xiaohongshu.com/*'],
  runAt: 'document_idle',
  main() {
    const readNote = createNoteCommentReader()
    browser.runtime.onMessage.addListener((message, sender) => {
      if (sender.id !== browser.runtime.id || message?.type !== 'career-xhs-read') return
      if (!sender.url?.startsWith(browser.runtime.getURL(''))) return
      return Promise.resolve(
        message.collectComments
          ? readNote(document, location.href, String(message.taskToken || ''))
          : readXiaohongshuPage(document, location.href),
      )
    })
  },
})
