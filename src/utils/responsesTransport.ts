/** Some Responses relays omit metadata on lifecycle notifications. These events
 * contain no output; omit only that narrow case rather than inventing server
 * timestamps/model IDs or relaxing validation of text, tool calls and failures. */
function sparseLifecycle(frame: string): boolean {
  try {
    const data = frame
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n')
    const value = JSON.parse(data)
    if (!['response.created', 'response.in_progress'].includes(value?.type)) return false
    const response = value.response
    if (!response || typeof response.id !== 'string' || response.error != null) return false
    if (response.created_at != null && typeof response.created_at !== 'number') return false
    if (response.model != null && typeof response.model !== 'string') return false
    return response.created_at == null || response.model == null
  } catch {
    return false
  }
}

export function createResponsesCompatibleFetch(transport: typeof fetch): typeof fetch {
  return async (input, init) => {
    const response = await transport(input, init)
    if (
      !response.ok ||
      !response.body ||
      !response.headers.get('content-type')?.includes('text/event-stream')
    )
      return response
    let pending = ''
    const body = response.body
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(
        new TransformStream<string, string>({
          transform(chunk, controller) {
            pending += chunk
            let boundary: RegExpExecArray | null
            while ((boundary = /\r?\n\r?\n/.exec(pending))) {
              const end = boundary.index + boundary[0].length
              const frame = pending.slice(0, end)
              pending = pending.slice(end)
              if (!sparseLifecycle(frame)) controller.enqueue(frame)
            }
          },
          flush(controller) {
            if (pending && !sparseLifecycle(pending)) controller.enqueue(pending)
          },
        }),
      )
      .pipeThrough(new TextEncoderStream())
    const headers = new Headers(response.headers)
    headers.delete('content-length')
    headers.delete('content-encoding')
    return new Response(body, { status: response.status, statusText: response.statusText, headers })
  }
}
