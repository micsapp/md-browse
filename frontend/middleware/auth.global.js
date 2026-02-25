export default defineNuxtRouteMiddleware((to) => {
  if (import.meta.server) return
  // Allow login and public share pages through
  if (to.path === '/login' || to.path.startsWith('/share/')) return
  // Fallback: check actual browser URL (handles SW/cache serving wrong pre-rendered page)
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/share/')) return
  const auth = useAuth()
  if (!auth.isLoggedIn) {
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
  }
})
