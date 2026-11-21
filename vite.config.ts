import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { loadEnv, type Plugin } from 'vite'

/**
 * `lz` serves the build on the dev server's port, so the build's service worker stays registered
 * there and would keep showing that build instead of the dev server. The browser checks /sw.js for
 * an update on every visit; the dev server answers with this one, which drops the build's cached
 * files (not the voice runtime), removes itself and reloads the open tabs.
 */
const REMOVE_SERVICE_WORKER = `
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('workbox-precache')) await caches.delete(key)
    await self.registration.unregister()
    for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url)
  })())
})
`

const removeBuildServiceWorker: Plugin = {
  name: 'lernzeit:remove-build-service-worker',
  configureServer(server) {
    server.middlewares.use('/sw.js', (_request, response) => {
      response.setHeader('Content-Type', 'text/javascript')
      response.setHeader('Cache-Control', 'no-store')
      response.end(REMOVE_SERVICE_WORKER)
    })
  },
}

/**
 * The app calls its cloud on its own origin, under /api, as it does when the Worker serves it. While
 * you work, /api goes on to LERNZEIT_CLOUD_URL (from .env), or to `npm run worker:dev` on port 8787.
 */
function cloudProxy(mode: string) {
  const target = loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), 'LERNZEIT_').LERNZEIT_CLOUD_URL || 'http://127.0.0.1:8787'
  return { '/api': { target, changeOrigin: true } }
}

/**
 * Navigations the service worker leaves to the network instead of answering them with the cached
 * index.html: every path wrangler.jsonc sends to the Worker first (`run_worker_first`). Without
 * them, a browser with the app installed would show the app where Claude opens the password page.
 * Workbox tests each pattern against the path and query.
 */
export const NAVIGATE_FALLBACK_DENYLIST = [
  /^\/api\//,
  /^\/mcp(?:[/?]|$)/,
  /^\/authorize(?:[/?]|$)/,
  /^\/token(?:[/?]|$)/,
  /^\/register(?:[/?]|$)/,
  /^\/\.well-known\//,
]

export default defineConfig(({ mode }) => ({
  server: { proxy: cloudProxy(mode) },
  preview: { proxy: cloudProxy(mode) },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    react(),
    tailwindcss(),
    removeBuildServiceWorker,
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Lernzeit',
        short_name: 'Lernzeit',
        description: 'Flashcards, daily goals, a focus timer and a to-do board for daily learning.',
        lang: 'en',
        theme_color: '#F7F7F4',
        background_color: '#F7F7F4',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: NAVIGATE_FALLBACK_DENYLIST,
        // The Thorsten voice runtime (about 33 MB) is cached on first use, not at install,
        // so only people who turn the voice on download it. File names are hashed.
        runtimeCaching: [
          {
            urlPattern: /\/assets\/[^/]+\.(?:wasm|data)$/,
            handler: 'CacheFirst',
            options: { cacheName: 'voice-runtime', expiration: { maxEntries: 6 } },
          },
          // The login photos are about 3 MB, so they are cached when first seen too.
          {
            urlPattern: /\/login\/[^/]+\.jpg$/,
            handler: 'CacheFirst',
            options: { cacheName: 'login-photos', expiration: { maxEntries: 8 } },
          },
        ],
      },
    }),
  ],
  build: {
    rolldownOptions: {
      output: {
        // Stable vendor chunks cache well across app updates.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/, priority: 3 },
            { name: 'data', test: /node_modules[\\/](dexie|dexie-react-hooks|ts-fsrs)[\\/]/, priority: 2 },
            { name: 'icons', test: /node_modules[\\/]lucide-react[\\/]/, priority: 1 },
          ],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'packages/core/src/**/*.test.ts', 'bin/**/*.test.ts', 'scripts/**/*.test.ts', 'vite.config.test.ts'],
  },
}))
