import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

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
    include: ['src/**/*.test.ts'],
  },
}))
