import { watch } from 'vue'

import { appearanceConf, useConf } from '@/composables/conf'
import { useHelper } from '@/composables/useHelper'

const calculatorIcon =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="4" y="2" width="24" height="28" rx="4" fill="#475569"/><path d="M9 7h14v6H9z" fill="#d1fae5"/><path d="M9 18h3m5 0h6M9 24h3m5 0h6" stroke="white" stroke-width="3"/></svg>',
  )

// Own page effects independently of whether the settings tab is mounted.
export function usePageAppearance() {
  const { todayData } = useHelper().statistics
  const { formData } = useConf()

  watch(
    () => appearanceConf.value.hideHeader,
    (enabled, _, onCleanup) => {
      if (!enabled) return
      const style = document.createElement('style')
      style.dataset.bossHelperAppearance = 'header'
      style.textContent = '#header { display: none !important; }'
      document.head.appendChild(style)
      onCleanup(() => style.remove())
    },
    { immediate: true },
  )

  watch(
    () => appearanceConf.value.changeIcon,
    (enabled, _, onCleanup) => {
      if (!enabled) return
      const originals = [
        ...document.head.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'),
      ].map((link) => ({
        link,
        href: link.getAttribute('href'),
        type: link.getAttribute('type'),
        sizes: link.getAttribute('sizes'),
      }))
      const added = originals.length ? undefined : document.createElement('link')
      if (added) {
        added.rel = 'icon'
        document.head.appendChild(added)
      }
      for (const { link } of originals) {
        link.href = calculatorIcon
        link.type = 'image/svg+xml'
        link.sizes.value = 'any'
      }
      if (added) added.href = calculatorIcon
      onCleanup(() => {
        added?.remove()
        for (const { link, ...attributes } of originals) {
          for (const [name, value] of Object.entries(attributes)) {
            if (value === null) link.removeAttribute(name)
            else link.setAttribute(name, value)
          }
        }
      })
    },
    { immediate: true },
  )

  watch(
    () => appearanceConf.value.dynamicTitle,
    (enabled, _, onCleanup) => {
      if (!enabled) return
      let originalTitle = document.title
      let generatedTitle: string
      const update = () => {
        const text = todayData.value.success + '/' + formData.deliveryLimit.value + ' - 在线计算器'
        generatedTitle = text
        if (document.title !== text) document.title = text
      }
      const stop = watch(
        [() => todayData.value.success, () => formData.deliveryLimit.value],
        update,
        { immediate: true },
      )
      const observer = new MutationObserver(() => {
        if (document.title === generatedTitle) return
        originalTitle = document.title
        update()
      })
      observer.observe(document.head, { childList: true, subtree: true, characterData: true })
      onCleanup(() => {
        observer.disconnect()
        stop()
        document.title = originalTitle
      })
    },
    { immediate: true },
  )
}
