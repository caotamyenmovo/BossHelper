import { readonly, ref } from 'vue'

type ThemePreference = 'light' | 'dark' | 'system'
const storageKey = 'boss-helper:options-theme'
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')

function parsePreference(value: unknown): ThemePreference {
  return value === 'dark' || value === 'system' ? value : 'light'
}

function readPreference(): ThemePreference {
  try {
    return parsePreference(localStorage.getItem(storageKey))
  } catch {
    return 'light'
  }
}

const preference = ref<ThemePreference>(readPreference())
export const themePreference = readonly(preference)

function applyTheme() {
  const dark = preference.value === 'dark' || (preference.value === 'system' && systemTheme.matches)
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.classList.toggle('light', !dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
}

export function setThemePreference(value: unknown) {
  preference.value = parsePreference(value)
  applyTheme()
  try {
    localStorage.setItem(storageKey, preference.value)
  } catch {
    // Keep theme switching available when browser storage is unavailable.
  }
}

applyTheme()
systemTheme.addEventListener('change', applyTheme)
window.addEventListener('storage', (event) => {
  if (event.storageArea !== localStorage || (event.key !== storageKey && event.key !== null)) return
  preference.value = readPreference()
  applyTheme()
})
