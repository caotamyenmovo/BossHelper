import { expect, test } from 'bun:test'

import { createOpenAI } from '@ai-sdk/openai'

import { runCareerCompletion } from '../src/composables/careerCompletion'
import type { ModelConfData, ModelProtocol } from '../src/composables/useModel/type'
import { createCareerTransport } from '../src/utils/careerAiTransport'

const config: ModelConfData = {
  base_url: 'https://relay.invalid/v1',
  api_key: 'test-only',
  model: 'test-model',
  protocol: 'openai-compatible',
  advanced: {},
  other: { timeout: 1000 },
}
const factory = (conf: ModelConfData, transport: typeof fetch) =>
  createOpenAI({
    apiKey: conf.api_key,
    baseURL: conf.base_url,
    fetch: (input, init) =>
      transport(input, {
        ...init,
        body: JSON.stringify({ ...JSON.parse(init?.body as string), ...conf.advanced.body }),
      }),
  }).chat(conf.model)
const encode = (value: string) => new TextEncoder().encode(value)
const delta = (text: string) =>
  `data: ${JSON.stringify({ id: 'test', created: 1, model: 'test-model', choices: [{ index: 0, delta: { content: text }, finish_reason: null }] })}\n\n`
const finish = 'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n'

function openResponse(text: string, contentType = 'text/event-stream') {
  let cancelled = false
  let streamController!: ReadableStreamDefaultController<Uint8Array>
  const response = new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller
        controller.enqueue(encode(text))
      },
      cancel() {
        cancelled = true
      },
    }),
    { headers: { 'content-type': contentType } },
  )
  return {
    response,
    cancelled: () => cancelled,
    push: (text: string) => streamController.enqueue(encode(text)),
  }
}

test('shows text before completion and finishes when the relay leaves HTTP open', async () => {
  const source = openResponse(delta('建议：'))
  let requests = 0
  let requestedBody: any
  const updates: string[] = []
  let firstText!: () => void
  const received = new Promise<void>((resolve) => {
    firstText = resolve
  })
  const pending = runCareerCompletion(
    config,
    'fixture prompt',
    factory,
    {
      onText: (text) => {
        updates.push(text)
        firstText()
      },
    },
    async (_input, init) => {
      requests++
      requestedBody = JSON.parse(init?.body as string)
      return source.response
    },
  )
  await received
  expect(updates).toEqual(['建议：'])
  source.push(delta('补充项目成果。') + finish)
  expect(await pending).toBe('建议：补充项目成果。')
  expect(source.cancelled()).toBe(true)
  expect(requestedBody.stream).toBe(true)
  expect(requests).toBe(1)
})

test('split UTF-8 and CRLF event boundaries retain exact output', async () => {
  const wire = encode(delta('中文建议🙂').replaceAll('\n', '\r\n') + 'data: [DONE]\r\n\r\n')
  const response = new Response(
    new ReadableStream({
      start(controller) {
        for (let i = 0; i < wire.length; i += 3) controller.enqueue(wire.slice(i, i + 3))
      },
    }),
    { headers: { 'content-type': 'text/event-stream' } },
  )
  const result = await runCareerCompletion(
    config,
    'fixture',
    factory,
    { onText: () => undefined },
    async () => response,
  )
  expect(result).toBe('中文建议🙂')
})

test('respects explicit non-stream mode and complete JSON without waiting for EOF', async () => {
  const response = {
    id: 'test',
    created: 1,
    model: 'test-model',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: '保留 "实际成果"，不要补造。' },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  }
  const source = openResponse(JSON.stringify(response), 'application/json')
  let streaming: unknown
  const text = await runCareerCompletion(
    { ...config, advanced: { body: { stream: false } } },
    'fixture',
    factory,
    { onText: () => undefined },
    async (_input, init) => {
      streaming = JSON.parse(init?.body as string).stream
      return source.response
    },
  )
  expect(streaming).toBe(false)
  expect(text).toBe('保留 "实际成果"，不要补造。')
  expect(source.cancelled()).toBe(true)
})

test('hard timeout settles even when the transport ignores AbortSignal', async () => {
  const pending = runCareerCompletion(
    { ...config, other: { timeout: 30 } },
    'fixture',
    factory,
    {},
    () => new Promise<Response>(() => undefined),
  )
  await expect(pending).rejects.toThrow('等待模型响应超时')
})

test('cancellation preserves partial output and does not accept late text', async () => {
  const source = openResponse(delta('已收到的建议'))
  const controller = new AbortController()
  const updates: string[] = []
  let firstText!: () => void
  const received = new Promise<void>((resolve) => {
    firstText = resolve
  })
  const pending = runCareerCompletion(
    config,
    'fixture',
    factory,
    {
      signal: controller.signal,
      onText: (text) => {
        updates.push(text)
        firstText()
      },
    },
    async () => source.response,
  )
  await received
  controller.abort()
  await expect(pending).rejects.toThrow('已停止生成')
  expect(source.cancelled()).toBe(true)
  await new Promise((resolve) => setTimeout(resolve, 10))
  expect(updates).toEqual(['已收到的建议'])
})

test('timeout after partial output retains text and explains incomplete response', async () => {
  const source = openResponse(delta('部分建议'))
  let output = ''
  const pending = runCareerCompletion(
    { ...config, other: { timeout: 50 } },
    'fixture',
    factory,
    {
      onText: (text) => {
        output = text
      },
    },
    async () => source.response,
  )
  await expect(pending).rejects.toThrow('已收到部分内容')
  expect(output).toBe('部分建议')
  expect(source.cancelled()).toBe(true)
})

test('does not silently retry paid model calls after server failure', async () => {
  let requests = 0
  const pending = runCareerCompletion(config, 'fixture', factory, {}, async () => {
    requests++
    return new Response('{"error":{"message":"relay failed","type":"server_error"}}', {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  })
  await expect(pending).rejects.toThrow()
  expect(requests).toBe(1)
})

test('empty model text ends with a clear error', async () => {
  const source = openResponse(finish)
  await expect(
    runCareerCompletion(
      config,
      'fixture',
      factory,
      { onText: () => undefined },
      async () => source.response,
    ),
  ).rejects.toThrow('没有返回可显示的正文')
})

test('recognizes Responses and Anthropic terminal events without relying on socket close', async () => {
  for (const [protocol, terminal] of [
    ['openai-responses', 'response.completed'],
    ['anthropic-messages', 'message_stop'],
  ] as const) {
    const source = openResponse(`event: ${terminal}\ndata: {"type":"${terminal}"}\n\n`)
    const transport = createCareerTransport(protocol as ModelProtocol, async () => source.response)
    const response = await transport('https://relay.invalid')
    expect(await response.text()).toContain(terminal)
    expect(source.cancelled()).toBe(true)
  }
})

test('healthy text and reasoning streams may run longer than the inactivity timeout', async () => {
  const source = openResponse(delta('建议：'))
  const pending = runCareerCompletion(
    { ...config, other: { timeout: 200 } },
    'fixture',
    factory,
    { onText: () => undefined },
    async () => source.response,
  )
  // Each delay is below the inactivity limit; their sum exceeds it.
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 75))
    source.push(
      i < 2
        ? `data: ${JSON.stringify({ choices: [{ index: 0, delta: { reasoning_content: '思考' }, finish_reason: null }] })}\n\n`
        : delta('补充依据。'),
    )
  }
  source.push(finish)
  expect(await pending).toBe('建议：补充依据。补充依据。')
})

test('an endlessly active response still has an overall deadline', async () => {
  const source = openResponse(delta('建议'))
  const pending = runCareerCompletion(
    { ...config, other: { timeout: 60 } },
    'fixture',
    factory,
    { onText: () => undefined },
    async () => source.response,
  )
  const timer = setInterval(() => {
    if (!source.cancelled()) source.push(delta('。'))
  }, 15)
  try {
    await expect(pending).rejects.toThrow('总时长上限')
    expect(source.cancelled()).toBe(true)
  } finally {
    clearInterval(timer)
  }
})
