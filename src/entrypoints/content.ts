import { defineProxy } from 'comctx'

import { defineContentScript, injectScript } from '#imports'

import './boss/inject.css'
import type { BackgroundCounter } from '@/message/background'
import { InjectBackgroundAdapter } from '@/message/background'
import { ContentCounter } from '@/message/contentScript'
import { ProvideContentScriptAdapter } from '@/message/contentScriptShare'
import type { BossImportState } from '@/utils/bossResumeImport'
import { readStableBossResume } from '@/utils/bossResumeReader'

export default defineContentScript({
  matches: ['*://zhipin.com/*', '*://*.zhipin.com/*'],
  runAt: 'document_start',
  world: 'ISOLATED',
  async main() {
    const task = (await browser.runtime
      .sendMessage({ type: 'career-import-task' })
      .catch(() => null)) as BossImportState | null
    if (task?.status === 'pending') {
      try {
        const result = await readStableBossResume(document, {
          deadline: task.expiresAt,
          isResumePage: () => /\/web\/geek\/(?:resume|my-resume)/.test(location.pathname),
        })
        await browser.runtime.sendMessage({
          type: 'career-import-result',
          token: task.token,
          ...result,
        })
      } catch (cause) {
        await browser.runtime
          .sendMessage({
            type: 'career-import-result',
            token: task.token,
            error: cause instanceof Error ? cause.message : String(cause),
          })
          .catch(() => undefined)
      }
      return
    }

    const [, injectBackgroundCounter] = defineProxy(() => ({}) as BackgroundCounter, {
      namespace: '__boss-helper-background__',
    })

    const [provideContentCounter] = defineProxy(
      () => new ContentCounter(injectBackgroundCounter(new InjectBackgroundAdapter())),
      {
        namespace: '__boss-helper-content__',
        heartbeatTimeout: 3000,
      },
    )

    await injectScript('/boss.js', {
      keepInDom: true,
      modifyScript(script) {
        provideContentCounter(new ProvideContentScriptAdapter(script))
      },
    })
  },
})
