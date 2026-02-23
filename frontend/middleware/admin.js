export default defineNuxtRouteMiddleware(() => {
  // Skip during SSG prerendering — auth is client-only (localStorage)
  if (import.meta.server) return
  const auth = useAuth()
  if (!auth.isLoggedIn) {
    return navigateTo('/login')
  }
  if (!auth.isAdmin) {
    return navigateTo('/')
  }
})
