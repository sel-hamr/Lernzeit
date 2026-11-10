// Builds the sel-hamr agent logo SVGs. Usage: node design/brand/sel-hamr/build.mjs <outDir>
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const out = process.argv[2] ?? '.'
mkdirSync(out, { recursive: true })

const C = { blue: '#2E5BFF', cream: '#F3EFE6' } // "Electric cream"

// 64-unit grid: a rounded tile with two pill eyes cut out (even-odd),
// so the eyes always show whatever sits behind the logo.
const TILE = 'M23 4H41A19 19 0 0 1 60 23V41A19 19 0 0 1 41 60H23A19 19 0 0 1 4 41V23A19 19 0 0 1 23 4Z'
const EYE = (x) => `M${x + 4} 21A4 4 0 0 1 ${x + 8} 25V36A4 4 0 0 1 ${x} 36V25A4 4 0 0 1 ${x + 4} 21Z`
export const MARK = TILE + EYE(23) + EYE(38)

const svg = (size, vb, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${vb}" role="img" aria-label="sel-hamr"><title>sel-hamr</title>${body}</svg>\n`
const mark = (fill) => `<path fill="${fill}" fill-rule="evenodd" d="${MARK}"/>`

// Logo on its own, transparent background
writeFileSync(join(out, 'sel-hamr-agent.svg'), svg(64, '4 4 56 56', mark(C.blue)))

// App icons: blue face on a cream square
const icon = (bg, rx) =>
  svg(512, '0 0 512 512', `<rect width="512" height="512" rx="${rx}" fill="${bg}"/><g transform="translate(73.14 73.14) scale(5.7143)">${mark(C.blue)}</g>`)
writeFileSync(join(out, 'sel-hamr-agent-icon.svg'), icon(C.cream, 112))
// Full-bleed square: source for PWA / maskable / apple-touch icons (platforms round the corners)
writeFileSync(join(out, 'sel-hamr-agent-icon-square.svg'), icon(C.cream, 0))

// Animated logo for websites: eyes blink and glance around (same motion as the Lernzeit app).
// Works in <img src>, inline, or as a CSS background; stays still for reduced-motion users.
const eye = (x) => `<rect class="eye" x="${x}" y="21" width="8" height="19" rx="4" fill="#000"/>`
const animated =
  `<style>` +
  `@keyframes blink{0%,86%,100%{transform:scaleY(1)}88%{transform:scaleY(.1)}90%{transform:scaleY(1)}93%{transform:scaleY(.1)}95%{transform:scaleY(1)}}` +
  `@keyframes look{0%,18%{transform:translate(0,0)}24%,40%{transform:translate(4px,-2px)}46%,62%{transform:translate(-4px,0)}68%,100%{transform:translate(0,0)}}` +
  `.eye{transform-box:fill-box;transform-origin:center;animation:blink 6s infinite}` +
  `.eyes{animation:look 11s ease-in-out infinite}` +
  `@media (prefers-reduced-motion:reduce){.eye,.eyes{animation:none}}` +
  `</style>` +
  `<mask id="m"><rect x="4" y="4" width="56" height="56" rx="19" fill="#fff"/><g class="eyes">${eye(23)}${eye(38)}</g></mask>` +
  `<rect x="4" y="4" width="56" height="56" rx="19" fill="${C.blue}" mask="url(#m)"/>`
writeFileSync(join(out, 'sel-hamr-agent-animated.svg'), svg(64, '4 4 56 56', animated))

console.log('wrote', out)
