import { defineProxy } from 'comctx'

import { browser, defineBackground } from '#imports'
import { BackgroundCounter, ProvideBackgroundAdapter } from '@/message/background'
import { registerBossResumeImport } from '@/utils/bossResumeImport'

export default defineBackground({
  main() {
    registerBossResumeImport(browser)
    const [provideBackgroundCounter] = defineProxy(() => new BackgroundCounter(), {
      namespace: '__boss-helper-background__',
    })

    provideBackgroundCounter(new ProvideBackgroundAdapter())
  },
})
