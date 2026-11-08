import { counter, ExtStorage } from '@/message'

import { normalizeStoredJson, useJsonStorage } from './useJsonStorage'
import type { JsonStorageAdapter } from './useJsonStorage'

const extensionStorage: JsonStorageAdapter = {
  async getItem(key) {
    return normalizeStoredJson(await ExtStorage.getItem(key))
  },
  setItem: (key, value) => counter.storageSet(key, value),
  removeItem: (key) => counter.storageRm(key),
}

const serverStorage: JsonStorageAdapter = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
}

export function useExtensionStorage<T>(
  key: string,
  initialValue: T,
  options: {
    mergeDefaults?: boolean
    writeDefaults?: boolean
    onError?: (error: unknown) => void
  } = {},
) {
  return useJsonStorage(
    key,
    initialValue,
    import.meta.env.SSR ? serverStorage : extensionStorage,
    options,
  )
}
