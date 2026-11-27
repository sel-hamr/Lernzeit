// Renders the Lernzeit mark in the Lime style to the app's PNG assets.
// Usage (from the repo root): node mobile/scripts/make-icons.cjs mobile/assets
const path = require('path')
const out = path.resolve(process.argv[2] ?? path.join(__dirname, '..', 'assets'))
const sharp = require(path.join(out, '..', '..', 'node_modules', 'sharp'))

const LIME = '#D4F24A'
const INK = '#16181A'
// The brand mark on a 64-unit grid: the rounded square and its two bars.
const BOX = 'M23 4H41A19 19 0 0 1 60 23V41A19 19 0 0 1 41 60H23A19 19 0 0 1 4 41V23A19 19 0 0 1 23 4Z'
const BARS = 'M27 21A4 4 0 0 1 31 25V36A4 4 0 0 1 23 36V25A4 4 0 0 1 27 21ZM42 21A4 4 0 0 1 46 25V36A4 4 0 0 1 38 36V25A4 4 0 0 1 42 21Z'

/** The mark centred on a square canvas: `scale` is the mark's width as a share of the canvas. */
function svg({ size = 1024, bg, box, bars, scale }) {
  const w = size * scale
  const k = w / 56 // the mark spans 4..60
  const off = (size - w) / 2 - 4 * k
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
${bg ? `<rect width="${size}" height="${size}" fill="${bg}"/>` : ''}
<g transform="translate(${off} ${off}) scale(${k})">
<path fill="${box}" d="${BOX}"/>
${bars ? `<path fill="${bars}" d="${BARS}"/>` : ''}
</g></svg>`
}

/** The monochrome launcher layer: the box with the bars cut out (Android tints it). */
function mono({ size = 1024, scale }) {
  const w = size * scale
  const k = w / 56
  const off = (size - w) / 2 - 4 * k
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<g transform="translate(${off} ${off}) scale(${k})"><path fill="#FFFFFF" fill-rule="evenodd" d="${BOX}${BARS}"/></g></svg>`
}

const files = {
  // Store / legacy icon: full-bleed lime, the black mark with lime bars.
  'icon.png': svg({ bg: LIME, box: INK, bars: LIME, scale: 0.58 }),
  // Adaptive foreground: inside the 66 % safe circle; the lime background comes from app.config.
  'adaptive-icon.png': svg({ box: INK, bars: LIME, scale: 0.48 }),
  'adaptive-icon-monochrome.png': mono({ scale: 0.48 }),
  // Splash marks: black on the light canvas, lime on the dark one.
  'splash-icon.png': svg({ box: INK, bars: LIME, scale: 0.9 }),
  'splash-icon-dark.png': svg({ box: LIME, bars: INK, scale: 0.9 }),
}

;(async () => {
  for (const [name, source] of Object.entries(files)) {
    await sharp(Buffer.from(source)).png({ compressionLevel: 9 }).toFile(path.join(out, name))
    console.log('wrote', name)
  }
})()
