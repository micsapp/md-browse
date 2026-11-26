const pkg = require('./package.json')
const buildTime = new Date().toISOString().replace('T', ' ').slice(0, 16)
const buildHash = Date.now().toString(36)
const appVersion = `${pkg.version}-${buildHash}`
const appName = process.env.NUXT_PUBLIC_APP_NAME || 'MD Browse'

export default defineNuxtConfig({
  ssr: false,
  devtools: { enabled: true },
  nitro: {
    prerender: {
      routes: ['/', '/200.html', '/404.html', '/login', '/upload', '/shares', '/tokens', '/admin', '/search', '/categories', '/tags']
    }
  },
  modules: ['@vite-pwa/nuxt'],
  app: {
    head: {
      viewport: 'width=device-width, initial-scale=1',
      meta: [
        { name: 'theme-color', content: '#f6f8fb' },
        { name: 'color-scheme', content: 'light dark' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' }
      ],
      link: [
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' }
      ],
      script: [
        {
          innerHTML: `(function(){try{var s=localStorage.getItem('theme');var d=s==='dark'||(s!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var t=d?'dark':'light';var r=document.documentElement;r.setAttribute('data-theme',t);r.style.colorScheme=t;r.style.backgroundColor=d?'#101722':'#f6f8fb';}catch(_){}})();if('serviceWorker' in navigator){navigator.serviceWorker.getRegistrations().then(function(r){r.forEach(function(reg){if(reg.active&&reg.active.scriptURL.includes('/sw.js')){reg.unregister()}})})}`
        }
      ]
    }
  },
  runtimeConfig: {
    public: {
      // In production this goes through nginx (same-origin, no CORS issues).
      // For local Dev set NUXT_PUBLIC_API_BASE=http://localhost:3001/api
      apiBase: process.env.NUXT_PUBLIC_API_BASE || '/api',
      appName,
      appVersion,
      buildTime
    }
  },
  css: ['~/assets/hljs-theme.css', '~/assets/workspace.css'],
  pwa: {
    registerType: 'autoUpdate',
    filename: `sw-${buildHash}.js`,
    manifest: {
      name: appName,
      short_name: appName,
      description: 'Markdown document browser and knowledge workspace',
      theme_color: '#365ec9',
      background_color: '#f6f8fb',
      display: 'standalone',
      orientation: 'portrait-primary',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
      ]
    },
    workbox: {
      navigateFallback: '/200.html',
      navigateFallbackDenylist: [/^\/api\//, /^\/share\//],
      globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
      runtimeCaching: [
        {
          // Cache API responses for offline read
          urlPattern: /^\/api\/v1\/(documents|folders)/,
          handler: 'NetworkFirst',
          options: { cacheName: 'api-cache', expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 } }
        }
      ]
    },
    client: { installPrompt: true },
    devOptions: { enabled: false }
  }
})
