import { expect, mock, test } from 'bun:test'

import { streamText } from 'ai'

mock.module('@/message', () => ({ counter: {} }))
const { createModel } = await import('../src/composables/useModel/providers')
const { runCareerCompletion } = await import('../src/composables/careerCompletion')
const conf = {
  base_url: 'https://fixture.invalid/v1',
  api_key: 'fixture',
  model: 'test-model',
  protocol: 'openai-responses' as const,
  advanced: {},
}
const event = (value: unknown) => 'data: ' + JSON.stringify(value) + '\r\n\r\n'
function source(start: unknown, tail?: unknown) {
  const wire = new TextEncoder().encode(
    [
      start,
      {
        type: 'response.output_item.added',
        output_index: 0,
        item: { type: 'message', id: 'msg_1' },
      },
      {
        type: 'response.output_text.delta',
        item_id: 'msg_1',
        output_index: 0,
        delta: '建议：补充真实项目成果。',
      },
      {
        type: 'response.output_item.done',
        output_index: 0,
        item: { type: 'message', id: 'msg_1' },
      },
      tail ?? { type: 'response.completed', response: {} },
    ]
      .map(event)
      .join(''),
  )
  return new Response(
    new ReadableStream({
      start(controller) {
        for (let i = 0; i < wire.length; i += 7) controller.enqueue(wire.slice(i, i + 7))
        controller.close()
      },
    }),
    { headers: { 'content-type': 'text/event-stream' } },
  )
}
const sparse = {
  response: { id: 'resp_0', object: 'response', status: 'in_progress' },
  sequence_number: 0,
  type: 'response.created',
}

test('screenshot relay response.created without metadata still streams career advice', async () => {
  const updates: string[] = []
  const result = await runCareerCompletion(
    conf,
    'fixture',
    createModel,
    { onText: (text) => updates.push(text) },
    async () => source(sparse),
  )
  expect(result).toBe('建议：补充真实项目成果。')
  expect(updates.at(-1)).toBe(result)
})

test('valid Responses metadata stays intact for all configured AI callers', async () => {
  const start = {
    ...sparse,
    response: { ...sparse.response, created_at: 1234, model: 'actual-model' },
  }
  const result = streamText({
    model: createModel(conf, async () => source(start)),
    prompt: 'fixture',
  })
  expect(await result.text).toBe('建议：补充真实项目成果。')
  expect((await result.response).id).toBe('resp_0')
  expect((await result.response).modelId).toBe('actual-model')
})

test('actual provider failures are never swallowed', async () => {
  await expect(
    runCareerCompletion(conf, 'fixture', createModel, { onText() {} }, async () =>
      source(sparse, {
        type: 'response.failed',
        sequence_number: 4,
        response: { error: { code: 'server_error', message: 'fixture provider failure' } },
      }),
    ),
  ).rejects.toThrow('fixture provider failure')
})

test('sparse in_progress notifications are also tolerated', async () => {
  expect(
    await runCareerCompletion(conf, 'fixture', createModel, { onText() {} }, async () =>
      source({ ...sparse, type: 'response.in_progress' }),
    ),
  ).toBe('建议：补充真实项目成果。')
})

test('invalid text deltas still fail validation', async () => {
  await expect(
    runCareerCompletion(conf, 'fixture', createModel, { onText() {} }, async () =>
      source({ type: 'response.output_text.delta', item_id: 'msg_1', delta: 42 }),
    ),
  ).rejects.toThrow('Type validation failed')
})

test('wrongly typed lifecycle metadata is not hidden', async () => {
  await expect(
    runCareerCompletion(conf, 'fixture', createModel, { onText() {} }, async () =>
      source({ ...sparse, response: { ...sparse.response, created_at: 'invalid' } }),
    ),
  ).rejects.toThrow('Type validation failed')
})
