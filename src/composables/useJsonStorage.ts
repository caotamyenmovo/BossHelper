import { getCurrentScope, onScopeDispose, ref, watch } from 'vue'
import type { Ref } from 'vue'

export interface JsonStorageAdapter {
  getItem(key: string): unknown | null | Promise<unknown | null>
  setItem(key: string, value: unknown): unknown | Promise<unknown>
  removeItem(key: string): unknown | Promise<unknown>
}

export function normalizeStoredJson(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

interface JsonStorageOptions {
  mergeDefaults?: boolean
  writeDefaults?: boolean
  onError?: (error: unknown) => void
}

function reportStorageError(error: unknown, onError?: (error: unknown) => void) {
  if (onError) onError(error)
  else console.error(error)
}

export function useJsonStorage<T>(
  key: string,
  initialValue: T,
  storage: JsonStorageAdapter,
  options: JsonStorageOptions = {},
) {
  const data = ref(cloneJson(initialValue)) as Ref<T>
  const defaults = cloneJson(initialValue)
  const mergeDefaults = options.mergeDefaults ?? false
  const writeDefaults = options.writeDefaults ?? true
  let ready = false
  let changedBeforeReady = false

  const stop = watch(
    data,
    (value) => {
      if (!ready) {
        changedBeforeReady = true
        return
      }
      if (value == null) {
        void Promise.resolve(storage.removeItem(key)).catch((error) =>
          reportStorageError(error, options.onError),
        )
      } else {
        void Promise.resolve(storage.setItem(key, cloneJson(value))).catch((error) =>
          reportStorageError(error, options.onError),
        )
      }
    },
    { deep: true },
  )

  if (getCurrentScope()) onScopeDispose(stop)

  void (async () => {
    try {
      const stored = await storage.getItem(key)
      let value: T

      if (stored == null) {
        value = cloneJson(data.value)
        if (writeDefaults) await storage.setItem(key, cloneJson(value))
      } else if (mergeDefaults && isRecord(defaults) && isRecord(stored)) {
        value = { ...defaults, ...stored } as T
      } else {
        value = stored as T
      }

      if (changedBeforeReady && stored != null) {
        value =
          mergeDefaults && isRecord(value) && isRecord(data.value)
            ? ({ ...value, ...cloneJson(data.value) } as T)
            : cloneJson(data.value)
        await storage.setItem(key, cloneJson(value))
      }

      data.value = value
    } catch (error) {
      reportStorageError(error, options.onError)
    } finally {
      ready = true
    }
  })()

  return data
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export const sessionJsonStorage: JsonStorageAdapter = {
  getItem(key) {
    if (typeof window === 'undefined' || !window.sessionStorage) return null
    const value = window.sessionStorage.getItem(key)
    return value == null ? null : JSON.parse(value)
  },
  setItem(key, value) {
    if (typeof window === 'undefined' || !window.sessionStorage) return
    window.sessionStorage.setItem(key, JSON.stringify(value))
  },
  removeItem(key) {
    if (typeof window === 'undefined' || !window.sessionStorage) return
    window.sessionStorage.removeItem(key)
  },
}
