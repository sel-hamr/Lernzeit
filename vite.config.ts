import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import type { Plugin } from 'vite'

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

export default defineConfig(({ command }) => ({
  define: {
    // Settings → AI connection shows the MCP server's path in its setup snippets.
    // Only the dev server knows it; a build should not carry a local path.
    __MCP_SERVER_PATH__: JSON.stringify(command === 'serve' ? fileURLToPath(new URL('./mcp/src/index.ts', import.meta.url)).replaceAll('\\', '/') : ''),
  },
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
        // The Thorsten voice runtime (about 33 MB) is cached on first use, not at install,
        // so only people who turn the voice on download it. File names are hashed.
        runtimeCaching: [
          {
            urlPattern: /\/assets\/[^/]+\.(?:wasm|data)$/,
            handler: 'CacheFirst',
            options: { cacheName: 'voice-runtime', expiration: { maxEntries: 6 } },
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
    include: ['src/**/*.test.ts', 'bin/**/*.test.ts', 'scripts/**/*.test.ts'],
    // A cached module keeps the files its import.meta.glob found, so a language pack added
    // since (src/languages) would be left out of the tests that check every pack.
    fsModuleCache: false,
  },
}))
