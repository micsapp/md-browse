<template>
  <div class="login-page">
    <div class="login-card">

      <!-- Logo / brand -->
      <div class="login-brand">
        <div class="login-logo">📄</div>
        <h1 class="login-app-name">MD Browse</h1>
        <p class="login-tagline">Your markdown knowledge base</p>
      </div>

      <!-- Tab switcher -->
      <div class="login-tabs">
        <button :class="{ active: !isRegister }" @click="isRegister = false; error = ''">Sign In</button>
        <button :class="{ active: isRegister }" @click="isRegister = true; error = ''">Register</button>
      </div>

      <!-- Form -->
      <form @submit.prevent="submit" class="login-form">
        <div class="field">
          <label>Username</label>
          <div class="input-wrap">
            <span class="input-icon">👤</span>
            <input
              v-model="form.username"
              placeholder="Enter username"
              autocomplete="username"
              autofocus
              required
            />
          </div>
        </div>

        <div class="field">
          <label>Password</label>
          <div class="input-wrap">
            <span class="input-icon">🔑</span>
            <input
              v-model="form.password"
              :type="showPassword ? 'text' : 'password'"
              placeholder="Enter password"
              autocomplete="current-password"
              required
            />
            <button type="button" class="toggle-pw" @click="showPassword = !showPassword" tabindex="-1">
              {{ showPassword ? '🙈' : '👁' }}
            </button>
          </div>
        </div>

        <!-- Error -->
        <div v-if="error" class="login-error">
          <span>⚠</span> {{ error }}
        </div>

        <button type="submit" class="login-btn" :disabled="loading">
          <span v-if="loading" class="spinner"></span>
          <span v-else>{{ isRegister ? 'Create Account' : 'Sign In' }}</span>
        </button>
      </form>

      <p class="login-footer">
        {{ isRegister ? 'Already have an account?' : "Don't have an account?" }}
        <a href="#" @click.prevent="isRegister = !isRegister; error = ''">
          {{ isRegister ? 'Sign in' : 'Register' }}
        </a>
      </p>
    </div>
  </div>
</template>

<script setup>
definePageMeta({ layout: false })

const auth = useAuth()
const router = useRouter()
const route = useRoute()

// If already logged in, redirect away
if (import.meta.client && auth.isLoggedIn) {
  router.replace(route.query.redirect || '/')
}

const isRegister = ref(false)
const form = ref({ username: '', password: '' })
const error = ref('')
const loading = ref(false)
const showPassword = ref(false)

watch(isRegister, () => {
  form.value = { username: '', password: '' }
  showPassword.value = false
})

async function submit() {
  error.value = ''
  loading.value = true
  try {
    if (isRegister.value) {
      await auth.register(form.value.username, form.value.password)
    } else {
      await auth.login(form.value.username, form.value.password)
    }
    router.push(route.query.redirect || '/')
  } catch (e) {
    error.value = e.data?.error || e.message || 'An error occurred. Please try again.'
  } finally {
    loading.value = false
  }
}
</script>

<style>
/* Full-page layout override — no header/nav */
body:has(.login-page) .header { display: none; }
body:has(.login-page) .main { padding: 0; max-width: 100%; }
</style>

<style scoped>
.login-page {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1a2a4a 0%, #2c3e50 50%, #1a3a2a 100%);
  padding: 1.5rem;
}

.login-card {
  background: var(--surface);
  border-radius: 16px;
  box-shadow: 0 24px 80px rgba(0,0,0,0.4);
  width: 100%;
  max-width: 420px;
  padding: 2.5rem 2rem;
  border: 1px solid var(--border);
}

/* ── Brand ──────────────────────────────────────────────────────────────── */
.login-brand {
  text-align: center;
  margin-bottom: 2rem;
}
.login-logo {
  font-size: 3rem;
  margin-bottom: 0.5rem;
  line-height: 1;
}
.login-app-name {
  font-size: 1.6rem;
  font-weight: 800;
  color: var(--text);
  margin: 0 0 0.3rem;
  letter-spacing: -0.02em;
}
.login-tagline {
  font-size: 0.88rem;
  color: var(--text3);
  margin: 0;
}

/* ── Tabs ────────────────────────────────────────────────────────────────── */
.login-tabs {
  display: flex;
  background: var(--surface2);
  border-radius: 8px;
  padding: 3px;
  margin-bottom: 1.75rem;
  gap: 3px;
}
.login-tabs button {
  flex: 1;
  padding: 0.55rem;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 500;
  background: transparent;
  color: var(--text3);
  transition: all 0.18s;
}
.login-tabs button.active {
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 1px 4px var(--shadow2);
}
.login-tabs button:hover:not(.active) { color: var(--text2); }

/* ── Form ────────────────────────────────────────────────────────────────── */
.login-form { display: flex; flex-direction: column; gap: 1rem; }

.field label {
  display: block;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text2);
  margin-bottom: 0.4rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}
.input-icon {
  position: absolute;
  left: 0.75rem;
  font-size: 0.95rem;
  pointer-events: none;
  opacity: 0.6;
}
.input-wrap input {
  width: 100%;
  padding: 0.72rem 0.75rem 0.72rem 2.4rem;
  border: 1.5px solid var(--border2);
  border-radius: 8px;
  font-size: 0.95rem;
  background: var(--surface2);
  color: var(--text);
  transition: border-color 0.18s, box-shadow 0.18s;
  box-sizing: border-box;
}
.input-wrap input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(52,152,219,0.15);
}
.toggle-pw {
  position: absolute;
  right: 0.6rem;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1rem;
  padding: 0.2rem;
  color: var(--text3);
  border-radius: 4px;
}
.toggle-pw:hover { color: var(--text); background: var(--hover-bg); }

/* ── Error ───────────────────────────────────────────────────────────────── */
.login-error {
  background: rgba(231,76,60,0.1);
  border: 1px solid rgba(231,76,60,0.35);
  border-radius: 7px;
  padding: 0.6rem 0.85rem;
  font-size: 0.86rem;
  color: var(--danger);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

/* ── Submit button ───────────────────────────────────────────────────────── */
.login-btn {
  width: 100%;
  padding: 0.82rem;
  background: var(--accent);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  margin-top: 0.25rem;
  transition: background 0.18s, transform 0.1s;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
}
.login-btn:hover:not(:disabled) { background: var(--accent-hover); }
.login-btn:active:not(:disabled) { transform: scale(0.98); }
.login-btn:disabled { opacity: 0.65; cursor: not-allowed; }

.spinner {
  width: 18px; height: 18px;
  border: 2px solid rgba(255,255,255,0.35);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  display: inline-block;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ── Footer ──────────────────────────────────────────────────────────────── */
.login-footer {
  text-align: center;
  margin: 1.5rem 0 0;
  font-size: 0.88rem;
  color: var(--text3);
}
.login-footer a { color: var(--accent); text-decoration: none; font-weight: 500; }
.login-footer a:hover { text-decoration: underline; }

/* ── Mobile ──────────────────────────────────────────────────────────────── */
@media (max-width: 480px) {
  .login-card { padding: 2rem 1.25rem; }
  .login-app-name { font-size: 1.4rem; }
}
</style>
