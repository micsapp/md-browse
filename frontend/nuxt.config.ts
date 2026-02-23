export default defineNuxtConfig({
  devtools: { enabled: true },
  modules: ['@vite-pwa/nuxt'],
  app: {
    head: {
      viewport: 'width=device-width, initial-scale=1',
      meta: [
        { name: 'theme-color', content: '#2c3e50' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' }
      ],
      link: [
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' }
      ]
    }
  },
  runtimeConfig: {
    public: {
      // In production this goes through nginx (same-origin, no CORS issues).
      // For local Dev set NUXT_PUBLIC_API_BASE=http://localhost:3001/api
      apiBase: process.env.NUXT_PUBLIC_API_BASE || '/api'
    }
  },
  css: ['~/assets/hljs-theme.css'],
  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'MD Browse',
      short_name: 'MD Browse',
      description: 'Markdown document browser',
      theme_color: '#2c3e50',
      background_color: '#f5f5f5',
      display: 'standalone',
      orientation: 'portrait-primary',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
      ]
    },
    workbox: {
      navigateFallback: '/',
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
