import { defineProxy } from 'comctx'

import { browser, defineBackground } from '#imports'
import { BackgroundCounter, ProvideBackgroundAdapter } from '@/message/background'
import { registerBossResumeImport } from '@/utils/bossResumeImport'
import { registerCareerRepository } from '@/utils/careerRepository'

export default defineBackground({
  main() {
    registerBossResumeImport(browser)
    registerCareerRepository(browser)
    const [provideBackgroundCounter] = defineProxy(() => new BackgroundCounter(), {
      namespace: '__boss-helper-background__',
    })

    provideBackgroundCounter(new ProvideBackgroundAdapter())
  },
})
