import assert from 'node:assert/strict'
import { test } from 'node:test'

import { nextTick } from 'vue'

import {
  normalizeStoredJson,
  sessionJsonStorage,
  useJsonStorage,
} from '../src/composables/useJsonStorage.ts'

void test('custom JSON storage works when the page replaces the Storage global', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'Storage')
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'Storage', { configurable: true, value: {} })

  try {
    const values = new Map<string, unknown>([['layout', { sizing: { job: 320 } }]])
    const storage = {
      getItem: async (key: string) => values.get(key) ?? null,
      async setItem(key: string, value: unknown) {
        values.set(key, structuredClone(value))
      },
      async removeItem(key: string) {
        values.delete(key)
      },
    }
    const layout = useJsonStorage(
      'layout',
      { visibility: {}, sizing: {}, order: [] as string[] },
      storage,
      { mergeDefaults: true },
    )

    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.deepEqual(layout.value, { visibility: {}, sizing: { job: 320 }, order: [] })
    assert.deepEqual(normalizeStoredJson('{"order":["company"]}'), { order: ['company'] })

    layout.value.order.push('company')
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.deepEqual(values.get('layout'), layout.value)

    const sessionValues = new Map<string, string>()
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        sessionStorage: {
          getItem: (key: string) => sessionValues.get(key) ?? null,
          setItem: (key: string, value: string) => sessionValues.set(key, value),
          removeItem: (key: string) => sessionValues.delete(key),
        },
      },
    })
    const presets = useJsonStorage('presets', {}, sessionJsonStorage)
    await new Promise((resolve) => setTimeout(resolve, 0))
    presets.value.account = 'default'
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.deepEqual(JSON.parse(sessionValues.get('presets')!), { account: 'default' })
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'Storage', descriptor)
    else Reflect.deleteProperty(globalThis, 'Storage')
    if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})
