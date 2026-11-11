import { generateText, streamText } from 'ai'
import type { LanguageModel } from 'ai'

import { createCareerTransport } from '../utils/careerAiTransport'
import type { ModelConfData } from './useModel/type'

export interface CareerCompletionOptions {
  images?: string[]
  jobDescription?: string
  signal?: AbortSignal
  onText?: (text: string) => void
  onStatus?: (status: string) => void
}

export async function runCareerCompletion(
  conf: ModelConfData,
  prompt: string,
  createModel: (conf: ModelConfData, transport: typeof fetch) => LanguageModel,
  options: CareerCompletionOptions = {},
  transport: typeof fetch = fetch,
): Promise<string> {
  const controller = new AbortController()
  let active = true
  let text = ''
  const configured = conf.other?.timeout
  const timeout =
    typeof configured === 'number' && Number.isFinite(configured) && configured > 0
      ? Math.min(configured, 2_147_483_647)
      : 60_000
  let rejectAbort: (reason: unknown) => void = () => undefined
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = reject
  })
  const onAbort = () => rejectAbort(controller.signal.reason ?? new Error('已停止生成。'))
  controller.signal.addEventListener('abort', onAbort, { once: true })
  const stop = () => controller.abort(new DOMException('已停止生成。', 'AbortError'))
  options.signal?.addEventListener('abort', stop, { once: true })
  if (options.signal?.aborted) stop()
  let timer: ReturnType<typeof setTimeout> | undefined
  // The configured timeout measures inactivity, not the duration of a healthy stream.
  const progress = () => {
    if (!active || controller.signal.aborted) return
    clearTimeout(timer)
    timer = setTimeout(
      () =>
        controller.abort(
          new Error(
            text
              ? '生成超时：已收到部分内容，但等待新内容或结束标记超时。已保留收到的内容，结果可能不完整。'
              : '等待模型响应超时：长时间未收到新内容，请检查连接或模型超时设置。',
          ),
        ),
      timeout,
    )
  }
  progress()
  const overallTimer = setTimeout(
    () =>
      controller.abort(
        new Error('生成达到总时长上限，已停止等待并保留收到的内容，结果可能不完整。'),
      ),
    Math.max(timeout, Math.min(timeout * 10, 600_000)),
  )
  const update = (value: string) => {
    text = value
    if (active && !controller.signal.aborted) options.onText?.(text)
  }
  async function request() {
    controller.signal.throwIfAborted()
    const streaming = !!options.onText && conf.advanced?.body?.stream !== false
    const effectiveConf = {
      ...conf,
      advanced: { ...conf.advanced, body: { ...conf.advanced?.body, stream: streaming } },
    }
    const model = createModel(
      effectiveConf,
      createCareerTransport(conf.protocol, transport, (kind) => {
        progress()
        if (kind === 'reasoning' && active && !controller.signal.aborted)
          options.onStatus?.('模型正在思考，等待正文…')
      }),
    )
    const input = options.images?.length
      ? {
          messages: [
            {
              role: 'user' as const,
              content: [
                { type: 'text' as const, text: prompt },
                ...options.images.map((image) => ({ type: 'image' as const, image })),
              ],
            },
          ],
        }
      : { prompt }
    const settings = { model, ...input, abortSignal: controller.signal, maxRetries: 0 }
    options.onStatus?.(streaming ? '正在等待模型响应…' : '正在等待完整结果…')
    if (streaming) {
      const result = streamText(settings)
      for await (const part of result.fullStream) {
        controller.signal.throwIfAborted()
        if (!active) break
        if (part.type === 'text-delta') {
          if (part.text) progress()
          options.onStatus?.('正在生成，已收到的内容会实时显示…')
          update(text + part.text)
        } else if (part.type === 'reasoning-delta') {
          if (part.text) progress()
          options.onStatus?.('模型正在思考，等待正文…')
        } else if (part.type === 'error') {
          throw part.error instanceof Error ? part.error : new Error(String(part.error))
        } else if (part.type === 'finish-step' && part.finishReason === 'length') {
          throw new Error('模型输出达到长度上限，已保留收到的内容。请调整模型输出长度后重试。')
        }
      }
    } else {
      const result = await generateText(settings)
      update(result.text)
      if (result.finishReason === 'length')
        throw new Error('模型输出达到长度上限，已保留收到的内容。请调整模型输出长度后重试。')
    }
    if (!text.trim()) throw new Error('模型没有返回可显示的正文，请检查模型、接口协议及中转响应。')
    return text
  }
  try {
    return await Promise.race([aborted, request()])
  } finally {
    active = false
    clearTimeout(timer)
    clearTimeout(overallTimer)
    options.signal?.removeEventListener('abort', stop)
    controller.signal.removeEventListener('abort', onAbort)
    controller.abort()
  }
}
