import type { Toast } from '@nuxt/ui/runtime/composables/useToast.js'

type ToastInput = Partial<Toast>
type ToastSink = (toast: ToastInput) => void

let toastSink: ToastSink | undefined

export function registerToastSink(sink: ToastSink) {
  toastSink = sink
}

export function notifyToast(toast: ToastInput) {
  toastSink?.(toast)
}
