import type { Toast } from '@nuxt/ui/runtime/composables/useToast.js'

type ToastSink = (toast: Toast) => void

let toastSink: ToastSink | undefined

export function registerToastSink(sink: ToastSink) {
  toastSink = sink
}

export function notifyToast(toast: Toast) {
  toastSink?.(toast)
}
