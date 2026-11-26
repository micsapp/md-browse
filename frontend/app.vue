<template>
  <VitePwaManifest />

  <!-- Global SVG Icon Sprite -->
  <svg class="ui-symbols" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <symbol id="ui-doc" viewBox="0 0 24 24"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z"/><path d="M14 3v6h6M8 13h8M8 17h5"/></symbol>
    <symbol id="ui-folder" viewBox="0 0 24 24"><path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z"/></symbol>
    <symbol id="ui-grid" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></symbol>
    <symbol id="ui-list" viewBox="0 0 24 24"><path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01"/></symbol>
    <symbol id="ui-table" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10"/></symbol>
    <symbol id="ui-category" viewBox="0 0 24 24"><path d="M12 3 3 8l9 5 9-5-9-5ZM3 13l9 5 9-5M3 17.5l9 5 9-5"/></symbol>
    <symbol id="ui-tag" viewBox="0 0 24 24"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z"/><circle cx="7" cy="7" r="1.5"/></symbol>
    <symbol id="ui-search" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/></symbol>
    <symbol id="ui-upload" viewBox="0 0 24 24"><path d="M12 16V4m-5 5 5-5 5 5M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2"/></symbol>
    <symbol id="ui-download" viewBox="0 0 24 24"><path d="M12 4v12m-5-5 5 5 5-5M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2"/></symbol>
    <symbol id="ui-share" viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4m0-11-6.8 4"/></symbol>
    <symbol id="ui-key" viewBox="0 0 24 24"><circle cx="8" cy="15" r="4"/><path d="m10.85 12.15 9.15-9.15m-3 3 2.5 2.5m-5.5.5 2.5 2.5"/></symbol>
    <symbol id="ui-settings" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="9" cy="18" r="2"/></symbol>
    <symbol id="ui-user" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></symbol>
    <symbol id="ui-logout" viewBox="0 0 24 24"><path d="M9 4H4v16h5m5-13 5 5-5 5m-6-5h11"/></symbol>
    <symbol id="ui-menu" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></symbol>
    <symbol id="ui-close" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></symbol>
    <symbol id="ui-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol>
    <symbol id="ui-arrow" viewBox="0 0 24 24"><path d="M4 12h16m-6-6 6 6-6 6"/></symbol>
    <symbol id="ui-arrow-left" viewBox="0 0 24 24"><path d="M20 12H4m6-6-6 6 6 6"/></symbol>
    <symbol id="ui-moon" viewBox="0 0 24 24"><path d="M20.8 13.2A9 9 0 0 1 10.8 3a9 9 0 1 0 10 10.2Z"/></symbol>
    <symbol id="ui-sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></symbol>
    <symbol id="ui-edit" viewBox="0 0 24 24"><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"/></symbol>
    <symbol id="ui-history" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5m4-1v5l3 2"/></symbol>
    <symbol id="ui-trash" viewBox="0 0 24 24"><path d="M4 7h16m-10 4v6m4-6v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/></symbol>
    <symbol id="ui-image" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m21 15-5-5L5 20"/></symbol>
    <symbol id="ui-check" viewBox="0 0 24 24"><path d="m5 12 5 5L20 7"/></symbol>
    <symbol id="ui-copy" viewBox="0 0 24 24"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></symbol>
    <symbol id="ui-external" viewBox="0 0 24 24"><path d="M14 3h7v7m0-7L10 14M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/></symbol>
    <symbol id="ui-lock" viewBox="0 0 24 24"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></symbol>
    <symbol id="ui-link" viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></symbol>
    <symbol id="ui-toc" viewBox="0 0 24 24"><path d="M4 6h16M4 12h10M4 18h14"/></symbol>
    <symbol id="ui-maximize" viewBox="0 0 24 24"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></symbol>
    <symbol id="ui-minimize" viewBox="0 0 24 24"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></symbol>
  </svg>

  <!-- ── Login Page Layout (full-bleed auth shell) ─────────────────────── -->
  <div v-if="isLoginPage" class="auth-layout">
    <NuxtPage />
  </div>

  <!-- ── Public Share Page Layout ──────────────────────────────────────── -->
  <div v-else-if="isSharePage" class="share-layout">
    <header class="guest-header">
      <NuxtLink to="/" class="brand">
        <span class="brand-mark">
          <svg class="ui-icon" aria-hidden="true"><use href="#ui-doc"/></svg>
        </span>
        <span class="brand-text">
          {{ config.appName }}
          <small>Knowledge workspace</small>
        </span>
      </NuxtLink>
      <div class="guest-header-actions">
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
        <NuxtLink v-if="auth.user" to="/" class="btn btn-sm btn-soft">Open Workspace</NuxtLink>
        <NuxtLink v-else to="/login" class="btn btn-sm btn-primary">Sign In</NuxtLink>
      </div>
    </header>
    <main class="share-main" id="main-content">
      <NuxtPage />
    </main>
    <footer class="about about--centered">
      Copyright &copy; {{ currentYear }} <a href="https://micstec.com" target="_blank" rel="noopener">Micstec</a>
    </footer>
  </div>

  <!-- ── Authenticated Workspace Shell (Sidebar + Main) ────────────────── -->
  <div v-else class="workspace-shell" :class="{ 'menu-open': menuOpen }">
    <a class="skip-link" href="#main-content">Skip to content</a>

    <!-- Mobile Sticky Header -->
    <header class="mobile-header">
      <NuxtLink to="/" class="mobile-brand" @click="resetToAllDocs">
        <span class="brand-mark">
          <svg class="ui-icon" aria-hidden="true"><use href="#ui-doc"/></svg>
        </span>
        <span>{{ config.appName }}</span>
      </NuxtLink>
      <div class="mobile-header-actions">
        <button
          v-if="auth.user"
          type="button"
          class="icon-btn"
          title="Upload document"
          aria-label="Upload document"
          @click="uploadModal.open()"
        >
          <svg class="ui-icon" aria-hidden="true"><use href="#ui-upload"/></svg>
        </button>
        <button
          type="button"
          class="theme-toggle theme-toggle--icon"
          data-theme-toggle
          :aria-label="theme.isDark ? 'Switch to light theme' : 'Switch to dark theme'"
          :title="theme.isDark ? 'Switch to light theme' : 'Switch to dark theme'"
          @click="theme.toggle()"
        >
          <svg v-if="!theme.isDark" class="ui-icon" aria-hidden="true"><use href="#ui-moon"/></svg>
          <svg v-else class="ui-icon" aria-hidden="true"><use href="#ui-sun"/></svg>
        </button>
        <button
          type="button"
          class="menu-toggle"
          data-menu-toggle
          aria-controls="app-navigation"
          :aria-expanded="menuOpen ? 'true' : 'false'"
          aria-label="Open navigation"
          @click="menuOpen = !menuOpen"
        >
          <svg class="ui-icon" aria-hidden="true"><use href="#ui-menu"/></svg>
        </button>
      </div>
    </header>

    <button
      v-if="menuOpen"
      type="button"
      class="sidebar-backdrop"
      data-menu-close
      aria-label="Close navigation"
      @click="menuOpen = false"
    ></button>

    <div class="body-wrapper">
      <!-- Left Sticky Sidebar -->
      <nav id="app-navigation" class="main sidebar" aria-label="Main navigation">
        <div class="sidebar-top">
          <NuxtLink to="/" class="brand" @click="resetToAllDocs">
            <span class="brand-mark">
              <svg class="ui-icon" aria-hidden="true"><use href="#ui-doc"/></svg>
            </span>
            <span class="brand-text">
              {{ config.appName }}
              <small>Knowledge workspace</small>
            </span>
          </NuxtLink>
          <button
            type="button"
            class="sidebar-close"
            data-menu-dismiss
            aria-label="Close navigation"
            @click="menuOpen = false"
          >
            <svg class="ui-icon" aria-hidden="true"><use href="#ui-close"/></svg>
          </button>
        </div>

        <!-- Quick Search in Sidebar -->
        <div class="sidebar-search">
          <form @submit.prevent="doSearch">
            <svg class="ui-icon ui-icon--sm sidebar-search-icon" aria-hidden="true"><use href="#ui-search"/></svg>
            <input
              v-model="searchQuery"
              type="search"
              placeholder="Search docs…"
              aria-label="Search documents"
            />
          </form>
        </div>

        <div class="sidebar-nav">
          <!-- Explore Group -->
          <div class="nav-group">
            <p class="nav-group-label">Explore</p>
            <NuxtLink
              to="/"
              class="nav-link"
              :class="{ active: route.path === '/' && panel.selectedFolderId.value === undefined }"
              @click="resetToAllDocs"
            >
              <svg class="ui-icon" aria-hidden="true"><use href="#ui-grid"/></svg>
              <span>All Documents</span>
            </NuxtLink>
            <button
              type="button"
              class="nav-link"
              :class="{ active: panel.isOpen.value || (route.path === '/' && panel.selectedFolderId.value !== undefined) }"
              @click="toggleFolders(); menuOpen = false"
            >
              <svg class="ui-icon" aria-hidden="true"><use href="#ui-folder"/></svg>
              <span>Folders</span>
              <span v-if="panel.selectedFolderId.value !== undefined" class="nav-badge">Active</span>
            </button>
            <NuxtLink
              to="/categories"
              class="nav-link"
              :class="{ active: route.path.startsWith('/categories') }"
              @click="menuOpen = false"
            >
              <svg class="ui-icon" aria-hidden="true"><use href="#ui-category"/></svg>
              <span>Categories</span>
            </NuxtLink>
            <NuxtLink
              to="/tags"
              class="nav-link"
              :class="{ active: route.path.startsWith('/tags') }"
              @click="menuOpen = false"
            >
              <svg class="ui-icon" aria-hidden="true"><use href="#ui-tag"/></svg>
              <span>Tags</span>
            </NuxtLink>
            <NuxtLink
              to="/search"
              class="nav-link"
              :class="{ active: route.path.startsWith('/search') }"
              @click="menuOpen = false"
            >
              <svg class="ui-icon" aria-hidden="true"><use href="#ui-search"/></svg>
              <span>Search</span>
            </NuxtLink>
          </div>

          <!-- Manage Group -->
          <div v-if="auth.user" class="nav-group">
            <p class="nav-group-label">Workspace</p>
            <NuxtLink
              to="/shares"
              class="nav-link"
              :class="{ active: route.path.startsWith('/shares') }"
              @click="menuOpen = false"
            >
              <svg class="ui-icon" aria-hidden="true"><use href="#ui-share"/></svg>
              <span>Shared Links</span>
            </NuxtLink>
            <NuxtLink
              to="/tokens"
              class="nav-link"
              :class="{ active: route.path.startsWith('/tokens') }"
              @click="menuOpen = false"
            >
              <svg class="ui-icon" aria-hidden="true"><use href="#ui-key"/></svg>
              <span>API Tokens</span>
            </NuxtLink>
            <NuxtLink
              v-if="auth.isAdmin"
              to="/admin"
              class="nav-link"
              :class="{ active: route.path.startsWith('/admin') }"
              @click="menuOpen = false"
            >
              <svg class="ui-icon" aria-hidden="true"><use href="#ui-settings"/></svg>
              <span>Admin Panel</span>
            </NuxtLink>
          </div>

          <!-- Primary CTA Button -->
          <button
            v-if="auth.user"
            type="button"
            class="nav-link sidebar-cta-button"
            @click="uploadModal.open(); menuOpen = false"
          >
            <svg class="ui-icon" aria-hidden="true"><use href="#ui-plus"/></svg>
            <span>Upload Document</span>
          </button>

          <!-- Sidebar Footer -->
          <div class="sidebar-footer">
            <button
              type="button"
              class="theme-toggle sidebar-theme-toggle"
              data-theme-toggle
              :aria-label="theme.isDark ? 'Switch to light theme' : 'Switch to dark theme'"
              :title="theme.isDark ? 'Switch to light theme' : 'Switch to dark theme'"
              @click="theme.toggle()"
            >
              <svg v-if="!theme.isDark" class="ui-icon" aria-hidden="true"><use href="#ui-moon"/></svg>
              <svg v-else class="ui-icon" aria-hidden="true"><use href="#ui-sun"/></svg>
              <span data-theme-label>{{ theme.isDark ? 'Light mode' : 'Dark mode' }}</span>
            </button>

            <template v-if="auth.user">
              <div class="nav-account">
                <span class="account-avatar">
                  <svg class="ui-icon" aria-hidden="true"><use href="#ui-user"/></svg>
                </span>
                <span class="account-copy">
                  <strong>{{ auth.user }}</strong>
                  <small>{{ auth.role || 'viewer' }}</small>
                </span>
                <button
                  type="button"
                  class="signout-icon-btn"
                  title="Sign out"
                  aria-label="Sign out"
                  @click="auth.logout(); menuOpen = false"
                >
                  <svg class="ui-icon ui-icon--sm" aria-hidden="true"><use href="#ui-logout"/></svg>
                </button>
              </div>
            </template>
            <template v-else>
              <NuxtLink to="/login" class="nav-link" @click="menuOpen = false">
                <svg class="ui-icon" aria-hidden="true"><use href="#ui-user"/></svg>
                <span>Sign In</span>
              </NuxtLink>
            </template>

            <div class="sidebar-version">
              v{{ config.appVersion }} · {{ config.buildTime }}
            </div>
          </div>
        </div>
      </nav>

      <!-- Main Workspace Content -->
      <div class="app-content" id="main-content" tabindex="-1">
        <!-- PWA install banner -->
        <div v-if="pwaInstallable" class="pwa-install-banner">
          <span>Install <strong>{{ config.appName }}</strong> for quick offline access</span>
          <div class="pwa-install-actions">
            <button class="btn btn-sm btn-primary" @click="pwaInstall">Install</button>
            <button class="btn btn-sm" @click="pwaDismiss">Not now</button>
          </div>
        </div>

        <NuxtPage />

        <footer class="about">
          Copyright &copy; {{ currentYear }} <a href="https://micstec.com" target="_blank" rel="noopener">Micstec</a>
        </footer>
      </div>
    </div>
  </div>

  <FolderPanel />
  <DocViewerModal />
  <UploadModal />
</template>

<script setup>
const config = useRuntimeConfig().public
const searchQuery = ref('')
const router = useRouter()
const route = useRoute()
const auth = useAuth()
const theme = useTheme()
const menuOpen = ref(false)
const panel = useFolderPanel()
const uploadModal = useUploadModal()

const currentYear = new Date().getFullYear()
const isSharePage = computed(() => route.path.startsWith('/share/'))
const isLoginPage = computed(() => route.path.replace(/\/+$/, '') === '/login')

// Sync searchQuery when visiting /search
watch(() => route.query.q, (q) => {
  if (typeof q === 'string') searchQuery.value = q
}, { immediate: true })

// Close mobile menu on route change or Escape key
watch(() => route.fullPath, () => {
  menuOpen.value = false
})

if (import.meta.client) {
  onMounted(() => {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && menuOpen.value) {
        menuOpen.value = false
      }
    })
  })
}

// PWA install prompt
const { $pwa } = useNuxtApp()
const pwaInstallable = computed(() => $pwa?.showInstallPrompt?.value && !$pwa?.isPWAInstalled?.value)

async function pwaInstall() {
  if ($pwa?.install) await $pwa.install()
}
function pwaDismiss() {
  if ($pwa?.cancelInstall) $pwa.cancelInstall()
}

function doSearch() {
  if (searchQuery.value.trim()) {
    router.push({ path: '/search', query: { q: searchQuery.value.trim() } })
    menuOpen.value = false
  }
}

function toggleFolders() {
  panel.toggle()
}

function resetToAllDocs() {
  panel.pickFolder(undefined)
  menuOpen.value = false
}
</script>

<style>
.ui-symbols {
  position: absolute;
  width: 0;
  height: 0;
  overflow: hidden;
}

.skip-link {
  position: fixed;
  left: 16px;
  top: -80px;
  z-index: 200;
  padding: 10px 16px;
  border-radius: 8px;
  background: var(--ink);
  color: var(--surface) !important;
  font-weight: 600;
}
.skip-link:focus {
  top: 12px;
}

/* ── Workspace Layout Grid ─────────────────────────────────────────────── */
.workspace-shell .body-wrapper {
  display: grid;
  grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
  align-items: start;
  min-height: 100vh;
  min-height: 100dvh;
}

.app-content {
  min-width: 0;
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  padding: 26px clamp(20px, 3vw, 52px) 0;
}
.app-content:focus {
  outline: none;
}

.mobile-header,
.sidebar-backdrop,
.sidebar-close {
  display: none;
}

/* ── Left Sticky Sidebar ───────────────────────────────────────────────── */
nav.main.sidebar {
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  border-right: 1px solid var(--line);
  background: var(--surface);
  color: var(--muted);
  user-select: none;
}

.sidebar-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px 20px 16px;
}

.brand,
.brand:link,
.brand:visited {
  display: inline-flex;
  align-items: center;
  gap: 11px;
  color: var(--ink) !important;
  text-decoration: none;
}

.brand-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 39px;
  flex: 0 0 auto;
  border-radius: 11px;
  background: var(--accent-solid);
  color: #ffffff;
  box-shadow: 0 4px 10px rgba(54, 94, 201, 0.22);
}

.brand-mark .ui-icon {
  width: 21px;
  height: 21px;
}

.brand-text {
  font-size: 18.5px;
  font-weight: 750;
  letter-spacing: -0.035em;
  line-height: 1.15;
  color: var(--ink);
}

.brand-text small {
  display: block;
  margin-top: 2px;
  color: var(--muted);
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0.01em;
}

/* ── Sidebar Search ────────────────────────────────────────────────────── */
.sidebar-search {
  padding: 0 16px 12px;
}

.sidebar-search form {
  position: relative;
  display: flex;
  align-items: center;
}

.sidebar-search-icon {
  position: absolute;
  left: 11px;
  color: var(--subtle);
  pointer-events: none;
}

.sidebar-search input {
  width: 100%;
  height: 36px;
  padding: 6px 10px 6px 33px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--canvas);
  color: var(--ink);
  font-size: 12.5px;
  transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
}

.sidebar-search input::placeholder {
  color: var(--subtle);
}

.sidebar-search input:focus {
  outline: none;
  border-color: var(--accent-solid);
  background: var(--surface);
  box-shadow: 0 0 0 3px var(--focus-ring);
}

/* ── Sidebar Links & Groups ────────────────────────────────────────────── */
.sidebar-nav {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 18px;
  min-height: 0;
  padding: 6px 16px 16px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.nav-group {
  display: grid;
  gap: 3px;
}

.nav-group-label {
  margin: 0 0 5px;
  padding: 0 11px;
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--subtle);
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  min-height: 39px;
  border: 0;
  border-radius: 9px;
  padding: 8px 11px;
  background: transparent;
  color: var(--ink-secondary);
  font-size: 13px;
  font-weight: 560;
  text-decoration: none;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.nav-link:hover {
  background: var(--raised);
  color: var(--ink);
}

.nav-link.active {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 650;
}

.nav-badge {
  margin-left: auto;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 10px;
  font-weight: 700;
}

.sidebar-cta-button {
  justify-content: center;
  min-height: 41px;
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 650;
}

.sidebar-cta-button:hover {
  background: var(--accent-soft-hover);
  color: var(--accent);
}

/* ── Sidebar Footer & Theme Toggle ─────────────────────────────────────── */
.sidebar-footer {
  margin-top: auto;
  padding-top: 14px;
  border-top: 1px solid var(--line);
  display: grid;
  gap: 10px;
}

.theme-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  min-height: 36px;
  padding: 7px 12px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--surface);
  color: var(--ink-secondary);
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}

.theme-toggle:hover {
  background: var(--raised);
  color: var(--ink);
}

.sidebar-theme-toggle {
  width: 100%;
}

.nav-account {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--raised);
}

.account-avatar {
  display: grid;
  place-items: center;
  width: 33px;
  height: 33px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--accent-soft);
  color: var(--accent);
}

.account-copy {
  min-width: 0;
  flex: 1;
}

.account-copy strong {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ink);
  font-size: 12.5px;
  font-weight: 650;
  line-height: 1.25;
}

.account-copy small {
  display: block;
  margin-top: 1px;
  color: var(--muted);
  font-size: 10.5px;
  text-transform: capitalize;
}

.signout-icon-btn {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.signout-icon-btn:hover {
  background: var(--hover);
  color: var(--danger);
}

.sidebar-version {
  text-align: center;
  font-size: 10px;
  color: var(--subtle);
  letter-spacing: 0.02em;
}

/* ── Footer ────────────────────────────────────────────────────────────── */
footer.about {
  margin-top: auto;
  padding: 28px 0 22px;
  color: var(--muted);
  font-size: 11.5px;
}

footer.about a {
  color: var(--ink-secondary);
  font-weight: 600;
}

footer.about a:hover {
  color: var(--accent);
}

footer.about--centered {
  text-align: center;
  padding: 24px 16px;
}

/* ── Public Share Layout ───────────────────────────────────────────────── */
.share-layout {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
}

.guest-header {
  position: sticky;
  top: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px clamp(18px, 4vw, 52px);
  border-bottom: 1px solid var(--line);
  background: var(--surface-translucent);
  backdrop-filter: blur(12px);
}

.guest-header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.share-main {
  flex: 1;
  width: 100%;
  max-width: 1040px;
  margin: 0 auto;
  padding: 28px clamp(16px, 3vw, 40px);
}

/* ── PWA Banner ────────────────────────────────────────────────────────── */
.pwa-install-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 18px;
  padding: 10px 16px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--accent-soft);
  color: var(--ink);
  font-size: 13px;
  flex-wrap: wrap;
}

.pwa-install-actions {
  display: flex;
  gap: 8px;
}

/* ── Responsive Mobile & Tablet (< 900px) ──────────────────────────────── */
@media (max-width: 900px) {
  .workspace-shell .body-wrapper {
    display: block;
    min-height: calc(100dvh - 64px);
  }

  .app-content {
    min-height: calc(100dvh - 64px);
    padding: 20px 18px 0;
  }

  .mobile-header {
    position: sticky;
    top: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 64px;
    padding: 10px 18px;
    border-bottom: 1px solid var(--line);
    background: var(--surface-translucent);
    backdrop-filter: blur(12px);
  }

  .mobile-brand {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    color: var(--ink) !important;
    font-size: 17.5px;
    font-weight: 750;
    letter-spacing: -0.035em;
    text-decoration: none;
  }

  .mobile-brand .brand-mark {
    width: 33px;
    height: 34px;
    border-radius: 9px;
  }

  .mobile-header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .theme-toggle--icon,
  .icon-btn,
  .menu-toggle {
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    padding: 0;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: var(--surface);
    color: var(--ink-secondary);
    cursor: pointer;
  }

  .theme-toggle--icon:hover,
  .icon-btn:hover,
  .menu-toggle:hover {
    background: var(--raised);
    color: var(--ink);
  }

  nav.main.sidebar {
    position: fixed;
    z-index: 80;
    left: 0;
    top: 0;
    width: 272px;
    max-width: calc(100vw - 48px);
    transform: translateX(-100%);
    transition: transform 0.22s ease;
  }

  .workspace-shell.menu-open nav.main.sidebar {
    transform: translateX(0);
    box-shadow: var(--shadow-lg);
  }

  .sidebar-close {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: 8px;
    background: var(--raised);
    color: var(--muted);
    cursor: pointer;
  }

  .sidebar-backdrop {
    position: fixed;
    z-index: 70;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
    border: 0;
    background: rgba(12, 20, 36, 0.5);
    backdrop-filter: blur(2px);
    cursor: pointer;
  }
}

@media (max-width: 600px) {
  .guest-header .brand-text small,
  .guest-header [data-theme-label] {
    display: none;
  }
}
</style>
