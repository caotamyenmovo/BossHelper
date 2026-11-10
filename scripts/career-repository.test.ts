import { expect, test } from 'bun:test'

import { createEmptyResumeProfile } from '../src/composables/useCareerWorkbench'
import { registerCareerRepository } from '../src/utils/careerRepository'

function runtimeHarness() {
  let listener: Function
  const values: Record<string, unknown> = {}
  const api = {
    runtime: {
      id: 'fixture',
      getURL: (path: string) => 'chrome-extension://fixture/' + path.replace(/^\//, ''),
      onMessage: {
        addListener: (handler: Function) => {
          listener = handler
        },
      },
    },
    storage: {
      local: {
        get: async (key: string) => ({ [key]: structuredClone(values[key]) }),
        set: async (data: Record<string, unknown>) => {
          Object.assign(values, structuredClone(data))
        },
      },
    },
  }
  registerCareerRepository(api as never)
  return {
    values,
    // Chrome runtimes without Promise listener support require literal true + sendResponse.
    send(
      command: unknown,
      sender = { id: 'fixture', url: api.runtime.getURL('options.html') },
    ): Promise<any> {
      return new Promise((resolve) => {
        const keepAlive = listener({ type: 'career-repository-write', command }, sender, resolve)
        if (keepAlive !== true) resolve(undefined)
      })
    },
  }
}

test('advice saving returns an acknowledgement on callback-based Chrome messaging', async () => {
  const runtime = runtimeHarness()
  const record = {
    id: 'advice-fixture',
    kind: 'analysis',
    profileSnapshot: createEmptyResumeProfile(),
    role: '前端',
    model: 'fixture',
    sources: [],
    text: '建议内容',
    status: 'complete',
    done: false,
    createdAt: 1,
    updatedAt: 1,
  }
  const reply = await runtime.send({ kind: 'advice', value: record })
  expect(reply?.records?.[0]?.text).toBe('建议内容')
  expect(reply?.records?.[0]?.revision).toBe(1)
  expect((runtime.values['career-workbench:advice'] as any[])[0].text).toBe('建议内容')
})

test('concurrent writes and revision conflicts return explicit replies', async () => {
  const runtime = runtimeHarness()
  const a = createEmptyResumeProfile()
  const b = createEmptyResumeProfile()
  const replies = await Promise.all([
    runtime.send({ kind: 'profile', value: a }),
    runtime.send({ kind: 'profile', value: b }),
  ])
  expect(replies[1]?.records).toHaveLength(2)
  const saved = replies[0]?.records?.[0]
  expect(saved).toBeDefined()
  if (!saved) return
  await runtime.send({ kind: 'profile', value: { ...saved, name: 'new' } })
  expect((await runtime.send({ kind: 'profile', value: saved }))?.error).toContain('另一页面')
})

test('untrusted senders cannot save and invalid commands receive an error', async () => {
  const runtime = runtimeHarness()
  expect(await runtime.send({}, { id: 'other', url: 'https://example.com' })).toBeUndefined()
  expect((await runtime.send({ kind: 'unknown' }))?.error).toContain('无法识别')
})
