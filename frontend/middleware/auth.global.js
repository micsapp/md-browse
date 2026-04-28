export default defineNuxtRouteMiddleware((to) => {
  if (import.meta.server) return
  // Allow login (with or without trailing slash) and public share pages through
  const cleanPath = to.path.replace(/\/+$/, '') || '/'
  if (cleanPath === '/login' || to.path.startsWith('/share/')) return
  // Fallback: check actual browser URL (handles SW/cache serving wrong pre-rendered page)
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/share/')) return
  const auth = useAuth()
  if (!auth.isLoggedIn) {
    // Only set redirect if the target is a real page (not login itself)
    const redirect = cleanPath !== '/login' ? to.fullPath : undefined
    return navigateTo({ path: '/login', query: redirect ? { redirect } : {} })
  }
})
