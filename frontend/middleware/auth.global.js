export default defineNuxtRouteMiddleware((to) => {
  // Skip during SSG prerendering — auth is client-only (localStorage)
  if (import.meta.server) return
  // Allow the login page and public share pages through
  if (to.path === '/login' || to.path.startsWith('/share/')) return
  const auth = useAuth()
  if (!auth.isLoggedIn) {
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
  }
})
