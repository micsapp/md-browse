<template>
  <div class="auth-page-wrap">
    <!-- Top Guest Nav -->
    <nav class="auth-top-nav" aria-label="Authentication navigation">
      <NuxtLink to="/" class="brand">
        <span class="brand-mark">
          <svg class="ui-icon" aria-hidden="true"><use href="#ui-doc"/></svg>
        </span>
        <span class="brand-text">{{ config.appName }}</span>
      </NuxtLink>
      <div class="auth-top-actions">
        <button
          type="button"
          class="theme-toggle"
          data-theme-toggle
          :aria-label="theme.isDark ? 'Switch to light theme' : 'Switch to dark theme'"
          :title="theme.isDark ? 'Switch to light theme' : 'Switch to dark theme'"
          @click="theme.toggle()"
        >
          <svg v-if="!theme.isDark" class="ui-icon" aria-hidden="true"><use href="#ui-moon"/></svg>
          <svg v-else class="ui-icon" aria-hidden="true"><use href="#ui-sun"/></svg>
          <span data-theme-label>{{ theme.isDark ? 'Light mode' : 'Dark mode' }}</span>
        </button>
      </div>
    </nav>

    <!-- BookBrowser-style Auth Shell -->
    <div class="auth-shell">
      <div class="auth-showcase">
        <div>
          <div class="auth-brand-mark">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z"/>
              <path class="auth-brand-wave" d="M14 3v6h6M8 13h8M8 17h5"/>
            </svg>
          </div>
          <p class="auth-eyebrow">MARKDOWN KNOWLEDGE WORKSPACE</p>
          <h2>Write, organize, and share technical docs effortlessly.</h2>
          <p class="auth-showcase-copy">
            A structured home for architecture notes, runbooks, and team documentation — accessible from the web and the CLI.
          </p>
        </div>

        <div class="auth-feature-list">
          <span><i>✓</i> Hierarchical folders, categories, and tag indexing</span>
          <span><i>✓</i> Full-text search, version history, and instant rollback</span>
          <span><i>✓</i> Custom share links, Mermaid diagrams, and CLI sync</span>
        </div>
      </div>

      <div class="auth-panel">
        <div class="auth-panel-header">
          <p class="auth-eyebrow">{{ isRegister ? 'GET STARTED' : 'WELCOME BACK' }}</p>
          <h1>{{ isRegister ? 'Create your account' : 'Sign in to workspace' }}</h1>
          <p>{{ isRegister ? 'Register a new account to browse and collaborate on documents.' : 'Enter your credentials to access your markdown library.' }}</p>
        </div>

        <!-- Tab switcher -->
        <div class="auth-tabs" role="tablist">
          <button
            type="button"
            :class="{ active: !isRegister }"
            @click="isRegister = false; error = ''"
          >
            Sign In
          </button>
          <button
            type="button"
            :class="{ active: isRegister }"
            @click="isRegister = true; error = ''"
          >
            Register
          </button>
        </div>

        <form class="auth-form" @submit.prevent="submit">
          <label>
            <span>Username</span>
            <div class="auth-input-wrap">
              <svg viewBox="0 0 24 24" aria-hidden="true"><use href="#ui-user"/></svg>
              <input
                v-model="form.username"
                type="text"
                placeholder="Enter your username"
                autocomplete="username"
                autofocus
                required
              />
            </div>
          </label>

          <label>
            <span>Password</span>
            <div class="auth-input-wrap">
              <svg viewBox="0 0 24 24" aria-hidden="true"><use href="#ui-lock"/></svg>
              <input
                v-model="form.password"
                :type="showPassword ? 'text' : 'password'"
                placeholder="Enter your password"
                autocomplete="current-password"
                required
              />
              <button
                type="button"
                class="password-toggle"
                tabindex="-1"
                @click="showPassword = !showPassword"
              >
                {{ showPassword ? 'Hide' : 'Show' }}
              </button>
            </div>
          </label>

          <div v-if="error" class="auth-error" role="alert">
            {{ error }}
          </div>

          <button type="submit" class="auth-submit" :disabled="loading">
            <span v-if="loading" class="spinner"></span>
            <span>{{ isRegister ? 'Create Account' : 'Sign In' }}</span>
          </button>
        </form>

        <p class="auth-note">
          {{ isRegister ? 'Already have an account?' : "Don't have an account yet?" }}
          <a href="#" @click.prevent="isRegister = !isRegister; error = ''">
            {{ isRegister ? 'Sign in instead' : 'Create an account' }}
          </a>
        </p>
      </div>
    </div>

    <footer class="about about--centered">
      Copyright &copy; {{ new Date().getFullYear() }} <a href="https://micstec.com" target="_blank" rel="noopener">Micstec</a>
    </footer>
  </div>
</template>

<script setup>
definePageMeta({ layout: false })

const config = useRuntimeConfig().public
const auth = useAuth()
const theme = useTheme()
const router = useRouter()
const route = useRoute()

function safeRedirect() {
  const r = route.query.redirect
  if (!r || String(r).startsWith('/login')) return '/'
  return r
}

if (import.meta.client && auth.isLoggedIn) {
  router.replace(safeRedirect())
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
    router.push(safeRedirect())
  } catch (e) {
    error.value = e.data?.error?.message || e.data?.error || e.message || 'Authentication failed. Please try again.'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.auth-page-wrap {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(circle at 8% 12%, rgba(54, 94, 201, 0.14), transparent 28rem),
    radial-gradient(circle at 92% 88%, rgba(79, 70, 165, 0.12), transparent 30rem),
    var(--canvas);
}

.auth-top-nav {
  width: 100%;
  max-width: 1120px;
  margin: 0 auto;
  padding: 20px 24px 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.auth-shell {
  display: grid;
  grid-template-columns: minmax(0, 0.95fr) minmax(380px, 1.05fr);
  width: calc(100% - 40px);
  max-width: 1040px;
  min-height: 600px;
  margin: auto;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 26px;
  background: var(--surface);
  box-shadow: var(--shadow-lg);
}

.auth-showcase {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 36px;
  overflow: hidden;
  padding: 52px 48px;
  color: #f8fbff;
  background:
    linear-gradient(155deg, rgba(12, 26, 54, 0.2), rgba(26, 42, 95, 0.88)),
    linear-gradient(135deg, #071b35 0%, #173b70 54%, #365ec9 100%);
}

.auth-showcase::before,
.auth-showcase::after {
  position: absolute;
  content: "";
  border: 1px solid rgba(255, 255, 255, 0.13);
  border-radius: 50%;
  pointer-events: none;
}

.auth-showcase::before {
  width: 320px;
  height: 320px;
  top: -140px;
  right: -150px;
  box-shadow: 0 0 0 50px rgba(255, 255, 255, 0.025);
}

.auth-showcase::after {
  width: 220px;
  height: 220px;
  bottom: -140px;
  left: -100px;
}

.auth-brand-mark {
  position: relative;
  z-index: 1;
  display: grid;
  width: 62px;
  height: 62px;
  place-items: center;
  margin-bottom: 28px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.1);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.16), 0 16px 36px rgba(4, 15, 34, 0.22);
  backdrop-filter: blur(10px);
}

.auth-brand-mark svg {
  width: 34px;
  height: 34px;
  fill: none;
  stroke: #fff;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.9;
}

.auth-brand-mark .auth-brand-wave {
  stroke: #73d7ff;
}

.auth-eyebrow {
  margin: 0 0 10px;
  color: var(--accent);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.13em;
  text-transform: uppercase;
}

.auth-showcase .auth-eyebrow {
  color: #8cdcff;
}

.auth-showcase h2 {
  position: relative;
  z-index: 1;
  margin: 0;
  font-size: clamp(28px, 3vw, 40px);
  font-weight: 740;
  letter-spacing: -0.04em;
  line-height: 1.12;
}

.auth-showcase-copy {
  position: relative;
  z-index: 1;
  margin: 18px 0 0;
  color: rgba(236, 244, 255, 0.78);
  font-size: 15px;
  line-height: 1.65;
}

.auth-feature-list {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 12px;
  color: rgba(244, 248, 255, 0.9);
  font-size: 13.5px;
}

.auth-feature-list span {
  display: flex;
  align-items: center;
  gap: 10px;
}

.auth-feature-list i {
  display: grid;
  width: 22px;
  height: 22px;
  place-items: center;
  border-radius: 50%;
  background: rgba(115, 215, 255, 0.18);
  color: #86deff;
  font-size: 12px;
  font-style: normal;
  flex-shrink: 0;
}

.auth-panel {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 48px 54px;
  background: var(--surface);
}

.auth-panel-header {
  margin-bottom: 22px;
}

.auth-panel-header h1 {
  margin: 0;
  color: var(--ink);
  font-size: clamp(26px, 2.6vw, 34px);
  font-weight: 750;
  letter-spacing: -0.035em;
  line-height: 1.15;
}

.auth-panel-header > p:last-child {
  margin: 8px 0 0;
  color: var(--muted);
  font-size: 14px;
}

.auth-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 4px;
  border-radius: 11px;
  background: var(--raised);
  margin-bottom: 22px;
}

.auth-tabs button {
  padding: 9px 12px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  font-size: 13.5px;
  font-weight: 650;
  cursor: pointer;
  transition: all 0.15s;
}

.auth-tabs button.active {
  background: var(--surface);
  color: var(--ink);
  box-shadow: var(--shadow-sm);
}

.auth-form {
  display: grid;
  gap: 16px;
}

.auth-form label {
  display: grid;
  gap: 7px;
  color: var(--ink);
  font-size: 13px;
  font-weight: 650;
}

.auth-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 48px;
  border: 1px solid var(--line-strong);
  border-radius: 12px;
  background: var(--canvas);
  transition: border-color 0.16s, box-shadow 0.16s, background 0.16s;
}

.auth-input-wrap:focus-within {
  border-color: var(--accent-solid);
  background: var(--surface);
  box-shadow: 0 0 0 4px var(--focus-ring);
}

.auth-input-wrap > svg {
  position: absolute;
  left: 14px;
  width: 19px;
  height: 19px;
  fill: none;
  stroke: var(--muted);
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
  pointer-events: none;
}

.auth-input-wrap input {
  width: 100%;
  height: 46px;
  border: 0;
  outline: 0;
  background: transparent;
  padding: 10px 64px 10px 44px;
  color: var(--ink);
  font-size: 14.5px;
}

.auth-input-wrap input::placeholder {
  color: var(--subtle);
}

.password-toggle {
  position: absolute;
  right: 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
  padding: 6px 10px;
}

.password-toggle:hover {
  background: var(--raised);
  color: var(--ink);
}

.auth-error {
  padding: 10px 14px;
  border-radius: 10px;
  background: var(--danger-soft);
  border: 1px solid var(--danger-border);
  color: var(--danger);
  font-size: 13px;
  font-weight: 550;
}

.auth-submit {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  min-height: 48px;
  margin-top: 4px;
  border: 0;
  border-radius: 12px;
  background: linear-gradient(135deg, #2457c5, #3e54c7);
  box-shadow: 0 10px 22px rgba(42, 82, 177, 0.22);
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s, filter 0.15s;
}

.auth-submit:hover:not(:disabled) {
  filter: brightness(1.06);
  transform: translateY(-1px);
  box-shadow: 0 13px 26px rgba(42, 82, 177, 0.3);
}

.auth-submit:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.spinner {
  width: 17px;
  height: 17px;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.auth-note {
  margin: 22px 0 0;
  text-align: center;
  color: var(--muted);
  font-size: 13.5px;
}

.auth-note a {
  color: var(--accent);
  font-weight: 650;
  margin-left: 4px;
}

.auth-note a:hover {
  text-decoration: underline;
}

@media (max-width: 880px) {
  .auth-shell {
    grid-template-columns: 1fr;
    max-width: 500px;
    margin: 16px auto;
  }
  .auth-showcase {
    padding: 32px 28px;
  }
  .auth-feature-list {
    display: none;
  }
  .auth-panel {
    padding: 32px 26px;
  }
}
</style>
