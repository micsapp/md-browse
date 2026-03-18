const sharedToken = ref(null)
const sharedUser = ref(null)
const sharedRole = ref(null)
let initialized = false

function decodeTokenExp(token) {
  try {
    return JSON.parse(atob(token.split('.')[1])).exp // seconds
  } catch { return null }
}

function isTokenExpired(token) {
  const exp = decodeTokenExp(token)
  return exp ? Date.now() / 1000 > exp : false
}

function clearSession() {
  sharedToken.value = null
  sharedUser.value = null
  sharedRole.value = null
  if (import.meta.client) {
    localStorage.removeItem('token')
    localStorage.removeItem('username')
    localStorage.removeItem('role')
  }
}

export const useAuth = () => {
  if (import.meta.client && !initialized) {
    const token = localStorage.getItem('token')
    if (token && isTokenExpired(token)) {
      // Token expired — clear stale session silently
      clearSession()
    } else if (token) {
      sharedToken.value = token
      sharedUser.value = localStorage.getItem('username')
      sharedRole.value = localStorage.getItem('role')
    }
    initialized = true
  }

  const isLoggedIn = computed(() => !!sharedToken.value)
  const isAdmin = computed(() => sharedRole.value === 'admin')

  function handleUnauthorized() {
    clearSession()
    navigateTo('/login')
  }

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
    clearSession()
    navigateTo('/login')
  }

  function getAuthHeaders() {
    const t = (import.meta.client ? localStorage.getItem('token') : null) || sharedToken.value
    return t ? { Authorization: `Bearer ${t}` } : {}
  }

  return reactive({
    user: sharedUser,
    token: sharedToken,
    role: sharedRole,
    isLoggedIn,
    isAdmin,
    login,
    register,
    logout,
    getAuthHeaders,
    handleUnauthorized,
  })
}
