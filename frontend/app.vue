<template>
  <div class="app" @click="menuOpen = false">
    <header class="header">
      <NuxtLink to="/" class="logo">MD Browse</NuxtLink>
      <!-- Mobile hamburger -->
      <button class="hamburger" @click.stop="menuOpen = !menuOpen" aria-label="Menu">
        <span></span><span></span><span></span>
      </button>
      <nav class="nav" :class="{ open: menuOpen }" @click.stop>
        <NuxtLink to="/" @click="menuOpen = false">Documents</NuxtLink>
        <button class="nav-btn folders-btn" @click="toggleFolders(); menuOpen = false">📁 Folders</button>
        <NuxtLink to="/categories" @click="menuOpen = false">Categories</NuxtLink>
        <NuxtLink to="/tags" @click="menuOpen = false">Tags</NuxtLink>
        <div class="search-box">
          <input v-model="searchQuery" placeholder="Search..." @keyup.enter="doSearch" />
          <button @click="doSearch">🔍</button>
        </div>
        <template v-if="auth.user">
          <NuxtLink to="/upload" @click="menuOpen = false">Upload</NuxtLink>
          <NuxtLink v-if="auth.isAdmin" to="/admin" @click="menuOpen = false">Admin</NuxtLink>
          <span class="user">{{ auth.user }}</span>
          <button @click="auth.logout(); menuOpen = false">Logout</button>
        </template>
        <template v-else>
          <NuxtLink to="/login" @click="menuOpen = false">Login</NuxtLink>
        </template>
        <button class="theme-toggle" @click.stop="theme.toggle()" :title="theme.isDark ? 'Light mode' : 'Dark mode'">
          {{ theme.isDark ? '☀️' : '🌙' }}
        </button>
        <span class="version-tag">v{{ config.appVersion }} · {{ config.buildTime }}</span>
      </nav>
    </header>
    <main class="main">
      <NuxtPage />
    </main>
  </div>
</template>

<script setup>
const config = useRuntimeConfig().public
const searchQuery = ref('')
const router = useRouter()
const auth = useAuth()
const theme = useTheme()
const menuOpen = ref(false)

function doSearch() {
  if (searchQuery.value.trim()) {
    router.push({ path: '/search', query: { q: searchQuery.value } })
    menuOpen.value = false
  }
}

function toggleFolders() {
  if (import.meta.client && window.__toggleFolders) window.__toggleFolders()
}
</script>

<style>
/* ── CSS variables (light / dark theme) ──────────────────────────────── */
:root {
  --bg: #f5f5f5;
  --surface: #ffffff;
  --surface2: #f8f9fa;
  --border: #e9ecef;
  --border2: #ddd;
  --text: #2c3e50;
  --text2: #555;
  --text3: #999;
  --accent: #3498db;
  --accent-hover: #2980b9;
  --danger: #e74c3c;
  --shadow: rgba(0,0,0,0.08);
  --shadow2: rgba(0,0,0,0.15);
  --header-bg: #2c3e50;
  --hover-bg: #f5f5f5;
  --active-bg: #e8f4fd;
  --active-color: #2980b9;
}
[data-theme="dark"] {
  --bg: #0d1117;
  --surface: #161b22;
  --surface2: #21262d;
  --border: #30363d;
  --border2: #3a404a;
  --text: #e6edf3;
  --text2: #8b949e;
  --text3: #6e7681;
  --accent: #58a6ff;
  --accent-hover: #388bfd;
  --danger: #f85149;
  --shadow: rgba(0,0,0,0.4);
  --shadow2: rgba(0,0,0,0.6);
  --header-bg: #010409;
  --hover-bg: #1c2128;
  --active-bg: #1f3a5f;
  --active-color: #58a6ff;
}

* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--text); transition: background 0.2s, color 0.2s; }
.app { min-height: 100vh; }

.header {
  background: var(--header-bg);
  color: white;
  padding: 0.75rem 1.5rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  position: sticky;
  top: 0;
  z-index: 100;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.logo { font-size: 1.4rem; font-weight: bold; color: white; text-decoration: none; }

.hamburger {
  display: none;
  flex-direction: column;
  gap: 5px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
}
.hamburger span { display: block; width: 24px; height: 2px; background: white; border-radius: 2px; }

.nav { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; }
.nav a { color: white; text-decoration: none; opacity: 0.85; font-size: 0.95rem; }
.nav a:hover, .nav a.router-link-active { opacity: 1; text-decoration: underline; }
.search-box { display: flex; gap: 0.4rem; }
.search-box input { padding: 0.4rem 0.6rem; border-radius: 4px; border: none; width: 160px; font-size: 0.9rem; background: rgba(255,255,255,0.1); color: white; }
.search-box input::placeholder { color: rgba(255,255,255,0.5); }
.search-box button { padding: 0.4rem 0.7rem; background: var(--accent); color: white; border: none; border-radius: 4px; cursor: pointer; }
.nav button { padding: 0.4rem 0.8rem; background: rgba(255,255,255,0.12); color: white; border: 1px solid rgba(255,255,255,0.25); border-radius: 4px; cursor: pointer; font-size: 0.9rem; }
.nav button:hover { background: rgba(255,255,255,0.22); }
.theme-toggle { padding: 0.3rem 0.5rem !important; font-size: 1.05rem !important; }
.folders-btn { font-size: 0.92rem !important; }
.user { color: #74b9ff; font-size: 0.9rem; }
.version-tag { font-size: 0.7rem; color: rgba(255,255,255,0.35); letter-spacing: 0.03em; }

.main { padding: 1.5rem; max-width: 1200px; margin: 0 auto; }

@media (max-width: 768px) {
  .header { padding: 0.75rem 1rem; position: relative; }
  .hamburger { display: flex; }
  .nav {
    display: none;
    width: 100%;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.6rem;
    padding: 0.75rem 0 0.25rem;
    border-top: 1px solid rgba(255,255,255,0.15);
  }
  .nav.open { display: flex; }
  .search-box { width: 100%; }
  .search-box input { flex: 1; width: auto; }
  .main { padding: 1rem; }
}
</style>
