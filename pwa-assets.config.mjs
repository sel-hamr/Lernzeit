import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// Icon source is a full-bleed navy tile, so pad with navy instead of white.
const bg = { background: '#F3EFE6', fit: 'contain' }
export default defineConfig({
  preset: {
    ...minimal2023Preset,
    transparent: { ...minimal2023Preset.transparent, padding: 0 },
    maskable: { ...minimal2023Preset.maskable, padding: 0, resizeOptions: bg },
    apple: { ...minimal2023Preset.apple, padding: 0, resizeOptions: bg },
  },
  images: ['public/icon-source.svg'],
})
