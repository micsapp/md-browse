const sharedTheme = ref('light')
let themeInitialized = false

export const useTheme = () => {
  function applyTheme(t) {
    if (!import.meta.client) return
    const next = t === 'dark' ? 'dark' : 'light'
    document.documentElement.setAttribute('data-theme', next)
    document.documentElement.style.colorScheme = next
    document.documentElement.style.backgroundColor = next === 'dark' ? '#101722' : '#f6f8fb'
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', next === 'dark' ? '#101722' : '#f6f8fb')
  }

  function resolvePreferredTheme() {
    if (!import.meta.client) return 'light'
    try {
      const saved = localStorage.getItem('theme')
      if (saved === 'dark' || saved === 'light') return saved
    } catch {}
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }

  if (import.meta.client && !themeInitialized) {
    sharedTheme.value = resolvePreferredTheme()
    applyTheme(sharedTheme.value)
    themeInitialized = true

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onSystemChange = () => {
      try {
        const saved = localStorage.getItem('theme')
        if (saved === 'dark' || saved === 'light') return
      } catch {}
      sharedTheme.value = media.matches ? 'dark' : 'light'
      applyTheme(sharedTheme.value)
    }
    if (media.addEventListener) media.addEventListener('change', onSystemChange)

    window.addEventListener('storage', (e) => {
      if (e.key === 'theme' || e.key === null) {
        sharedTheme.value = resolvePreferredTheme()
        applyTheme(sharedTheme.value)
      }
    })
  }

  function setTheme(next) {
    const valid = next === 'dark' ? 'dark' : 'light'
    sharedTheme.value = valid
    applyTheme(valid)
    if (import.meta.client) {
      try { localStorage.setItem('theme', valid) } catch {}
    }
  }

  function toggle() {
    setTheme(sharedTheme.value === 'dark' ? 'light' : 'dark')
  }

  return reactive({
    theme: sharedTheme,
    setTheme,
    toggle,
    isDark: computed(() => sharedTheme.value === 'dark')
  })
}
