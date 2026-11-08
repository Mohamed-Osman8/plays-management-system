import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

async function findApiTarget() {
  const configuredPort = Number.parseInt(process.env.PLAYA_API_PORT || '5001', 10)
  const firstPort = Number.isInteger(configuredPort) && configuredPort >= 1 && configuredPort <= 65535
    ? configuredPort
    : 5001

  for (let offset = 0; offset < 12; offset += 1) {
    const port = firstPort + offset
    if (port > 65535) break
    const target = `http://localhost:${port}`
    try {
      const response = await fetch(`${target}/api/health`, { signal: AbortSignal.timeout(500) })
      if (!response.ok) continue
      const health = await response.json()
      if (health.service === 'playstation-game-zone-server') return target
    } catch {
      continue
    }
  }

  return `http://localhost:${firstPort}`
}

// https://vite.dev/config/
export default defineConfig(async ({ command }) => ({
  server: {
    host: '0.0.0.0',
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': {
        target: command === 'serve' ? await findApiTarget() : 'http://localhost:5001',
        changeOrigin: true,
        configure(proxy) {
          proxy.on('proxyReq', (proxyRequest) => proxyRequest.removeHeader('origin'))
        },
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      injectRegister: null,
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'pwa-icon.svg', 'pwa-icon-192.png', 'pwa-icon-512.png'],
      manifest: {
        id: '/',
        name: 'PlayStation Game Zone',
        short_name: 'Game Zone',
        description: 'PlayStation gaming and management platform.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0b0f17',
        theme_color: '#0b0f17',
        icons: [
          {
            src: '/pwa-icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
            method: 'GET',
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-font-stylesheets',
              expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
}))
