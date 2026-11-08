import type { ModelProtocol } from '../composables/useModel/type'

function eventData(frame: string) {
  return frame
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n')
    .trim()
}

function terminalEvent(frame: string, protocol: ModelProtocol) {
  const data = eventData(frame)
  if (data === '[DONE]') return true
  try {
    const value = JSON.parse(data)
    if (protocol === 'anthropic-messages') return value.type === 'message_stop'
    if (protocol === 'openai-responses')
      return ['response.completed', 'response.incomplete', 'response.failed'].includes(value.type)
    return (
      value.choices?.some(
        (choice: { index?: number; finish_reason?: string | null }) =>
          (choice.index ?? 0) === 0 && choice.finish_reason != null,
      ) === true
    )
  } catch {
    return false
  }
}

function eventProgress(frame: string): 'text' | 'reasoning' | undefined {
  try {
    const value = JSON.parse(eventData(frame))
    const delta = value.choices?.find(
      (choice: { index?: number }) => (choice.index ?? 0) === 0,
    )?.delta
    // Some compatible relays emit reasoning fields that the Chat SDK ignores.
    if (
      (typeof delta?.reasoning_content === 'string' && delta.reasoning_content.length) ||
      (typeof delta?.reasoning === 'string' && delta.reasoning.length)
    )
      return 'reasoning'
    if (typeof delta?.content === 'string' && delta.content.length) return 'text'
    if (value.type === 'content_block_delta') {
      if (value.delta?.thinking?.length) return 'reasoning'
      if (value.delta?.text?.length) return 'text'
    }
    if (typeof value.delta === 'string' && value.delta.length) {
      if (
        ['response.reasoning_text.delta', 'response.reasoning_summary_text.delta'].includes(
          value.type,
        )
      )
        return 'reasoning'
      if (value.type === 'response.output_text.delta') return 'text'
    }
  } catch {
    /* Ignore keepalive and unrecognized frames. */
  }
}

/** Prose-only career requests can finish at the protocol marker even if a relay keeps HTTP open. */
export function createCareerTransport(
  protocol: ModelProtocol,
  transport: typeof fetch = fetch,
  onProgress?: (kind: 'body' | 'text' | 'reasoning') => void,
): typeof fetch {
  return async (input, init) => {
    const response = await transport(input, init)
    if (!response.ok || !response.body) return response
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    const encoder = new TextEncoder()
    const sse = response.headers.get('content-type')?.includes('text/event-stream')
    let buffer = ''
    let closed = false
    const cancel = () => {
      void reader.cancel().catch(() => undefined)
    }
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          while (!closed) {
            const { value, done } = await reader.read()
            // Non-streaming relays may slowly deliver a JSON body. SSE progress is
            // measured by actual text/reasoning deltas, not keepalive heartbeats.
            if (!sse && value?.byteLength) onProgress?.('body')
            buffer += decoder.decode(value, { stream: !done })
            if (sse) {
              let boundary: RegExpExecArray | null
              let emitted = false
              while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
                const end = boundary.index + boundary[0].length
                const frame = buffer.slice(0, end)
                buffer = buffer.slice(end)
                const progress = eventProgress(frame)
                if (progress) onProgress?.(progress)
                controller.enqueue(encoder.encode(frame))
                emitted = true
                if (terminalEvent(frame, protocol)) {
                  closed = true
                  controller.close()
                  cancel()
                  return
                }
              }
              if (!done && emitted) return
            } else if (/^[\s\uFEFF]*[\[{]/.test(buffer)) {
              try {
                JSON.parse(buffer)
                controller.enqueue(encoder.encode(buffer))
                closed = true
                controller.close()
                cancel()
                return
              } catch {
                /* Wait for the rest of the JSON value. */
              }
            }
            if (done) {
              if (buffer) controller.enqueue(encoder.encode(buffer))
              closed = true
              controller.close()
              return
            }
          }
        } catch (error) {
          if (!closed) {
            closed = true
            controller.error(error)
            cancel()
          }
        }
      },
      cancel() {
        closed = true
        cancel()
      },
    })
    const headers = new Headers(response.headers)
    headers.delete('content-length')
    headers.delete('content-encoding')
    return new Response(body, { status: response.status, statusText: response.statusText, headers })
  }
}
