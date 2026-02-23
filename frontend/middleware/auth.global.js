export default defineNuxtRouteMiddleware((to) => {
  // Skip during SSG prerendering — auth is client-only (localStorage)
  if (import.meta.server) return
  // Allow the login page itself through
  if (to.path === '/login') return
  const auth = useAuth()
  if (!auth.isLoggedIn) {
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
  }
})
