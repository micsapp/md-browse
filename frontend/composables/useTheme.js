const sharedTheme = ref('light')
let themeInitialized = false

export const useTheme = () => {
  if (import.meta.client && !themeInitialized) {
    const saved = localStorage.getItem('theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    sharedTheme.value = saved || (prefersDark ? 'dark' : 'light')
    applyTheme(sharedTheme.value)
    themeInitialized = true
  }

  function applyTheme(t) {
    if (import.meta.client) {
      document.documentElement.setAttribute('data-theme', t)
    }
  }

  function toggle() {
    sharedTheme.value = sharedTheme.value === 'dark' ? 'light' : 'dark'
    applyTheme(sharedTheme.value)
    if (import.meta.client) localStorage.setItem('theme', sharedTheme.value)
  }

  return reactive({ theme: sharedTheme, toggle, isDark: computed(() => sharedTheme.value === 'dark') })
}
