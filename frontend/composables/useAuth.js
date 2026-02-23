// Module-level shared state — all useAuth() calls reference the same refs
const sharedToken = ref(null)
const sharedUser = ref(null)
const sharedRole = ref(null)
let initialized = false

export const useAuth = () => {
  // Initialize from localStorage once on the client
  if (import.meta.client && !initialized) {
    sharedToken.value = localStorage.getItem('token')
    sharedUser.value = localStorage.getItem('username')
    sharedRole.value = localStorage.getItem('role')
    initialized = true
  }

  const isLoggedIn = computed(() => !!sharedToken.value)
  const isAdmin = computed(() => sharedRole.value === 'admin')

  async function login(username, password) {
    const config = useRuntimeConfig()
    const res = await $fetch(`${config.public.apiBase}/auth/login`, {
      method: 'POST',
      body: { username, password }
    })
    sharedToken.value = res.token
    sharedUser.value = res.username
    sharedRole.value = res.role || null
    if (import.meta.client) {
      localStorage.setItem('token', res.token)
      localStorage.setItem('username', res.username)
      if (res.role) localStorage.setItem('role', res.role)
      else localStorage.removeItem('role')
    }
    return res
  }

  async function register(username, password) {
    const config = useRuntimeConfig()
    const res = await $fetch(`${config.public.apiBase}/auth/register`, {
      method: 'POST',
      body: { username, password }
    })
    sharedToken.value = res.token
    sharedUser.value = res.username
    sharedRole.value = res.role || null
    if (import.meta.client) {
      localStorage.setItem('token', res.token)
      localStorage.setItem('username', res.username)
      if (res.role) localStorage.setItem('role', res.role)
      else localStorage.removeItem('role')
    }
    return res
  }

  function logout() {
    sharedToken.value = null
    sharedUser.value = null
    sharedRole.value = null
    if (import.meta.client) {
      localStorage.removeItem('token')
      localStorage.removeItem('username')
      localStorage.removeItem('role')
    }
    navigateTo('/login')
  }

  function getAuthHeaders() {
    const t = (import.meta.client ? localStorage.getItem('token') : null) || sharedToken.value
    return t ? { Authorization: `Bearer ${t}` } : {}
  }

  // reactive() auto-unwraps nested refs in templates:
  // auth.user → string value, not the ref object
  return reactive({
    user: sharedUser,
    token: sharedToken,
    role: sharedRole,
    isLoggedIn,
    isAdmin,
    login,
    register,
    logout,
    getAuthHeaders
  })
}
