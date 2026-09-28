#!/usr/bin/env node
/**
 * Renderar public/icon.svg till PNG-ikoner för PWA-manifestet, iOS och appbutikerna.
 *
 *   npm run icons
 *   node scripts/generate-icons.mjs [--out=public] [--store-out=store-assets] [--only=web|store|<fil>] [--src=public/icon.svg]
 *
 * Skapar i public/ (webbappen):
 *   icon-96.png                96 × 96    rundad ikon för genvägarna i manifestet (shortcuts)
 *   icon-192.png              192 × 192   rundad ikon med genomskinliga hörn ("any")
 *   icon-512.png              512 × 512   rundad ikon med genomskinliga hörn ("any")
 *   icon-512-maskable.png     512 × 512   fullfylld bakgrund, märket inom säkra zonen ("maskable")
 *   apple-touch-icon.png      180 × 180   fullfylld utan genomskinlighet (iOS rundar själv hörnen)
 *
 * Skapar i store-assets/ (laddas upp i butikerna – ligger inte i public/, så att de inte hamnar i
 * webbappens cache):
 *   app-store-icon-1024.png   1024 × 1024 fullfylld, UTAN alfakanal (PNG-färgtyp 2, RGB) – App Store
 *                             Connect avvisar ikoner med genomskinlighet eller alfakanal.
 *   google-play-icon-512.png  512 × 512   helt fyrkantig (Google Play rundar själv hörnen), 32-bitars
 *                             PNG (färgtyp 6, RGBA) och högst 1 024 KB, enligt Play Consoles krav.
 *
 * Varje fil kontrolleras efteråt (storlek, färgtyp och filstorlek) – stämmer något inte avbryts
 * skriptet med ett fel i stället för att skriva en fil som butiken skulle avvisa.
 *
 * `--only=store` skapar bara butiksikonerna (rör inte public/), `--only=web` bara webbikonerna och
 * `--only=icon-96.png` bara den filen.
 *
 * Renderingen görs med Playwrights Chromium, som ger exakt samma resultat som webbläsaren.
 * Skärmdumpar av ogenomskinliga sidor blir 24-bitars (RGB); Play-ikonen exporteras därför via en
 * canvas i sidan (canvas.toDataURL ger alltid RGBA).
 * Skriptet letar efter `playwright`, `@playwright/test` eller `playwright-core` i projektet och
 * därefter i den globala npm-katalogen. Finns inget skrivs instruktioner ut (och koden blir 1).
 *
 * Varianterna härleds från icon.svg via två id:n:
 *   #lagom-bg   – bakgrundsrektangeln; hörnradien (rx) tas bort för fullfyllda varianter.
 *   #lagom-mark – märket; skalas kring mitten för maskable-ikonen.
 */
import { execSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Maskable-ikoner beskärs till en cirkel med 80 % diameter – märket skalas in med marginal. */
export const MASKABLE_SCALE = 0.86

/** @typedef {'rounded' | 'fullbleed' | 'maskable'} Variant */

/** PNG-färgtyper: 2 = RGB (24 bitar, ingen alfakanal), 6 = RGBA (32 bitar). */
export const PNG_RGB = 2
export const PNG_RGBA = 6

/**
 * @typedef {object} Target
 * @property {string} file
 * @property {number} size
 * @property {Variant} variant
 * @property {'web' | 'store'} [dir]  web = public/ (standard), store = store-assets/
 * @property {'screenshot' | 'canvas'} [encode]  hur PNG:en skapas (standard skärmdump)
 * @property {2 | 6} [colorType]  krävd PNG-färgtyp
 * @property {number} [maxBytes]  största tillåtna filstorlek
 */

/** @type {ReadonlyArray<Target>} */
export const TARGETS = [
  { file: 'icon-96.png', size: 96, variant: 'rounded' },
  { file: 'icon-192.png', size: 192, variant: 'rounded' },
  { file: 'icon-512.png', size: 512, variant: 'rounded' },
  { file: 'icon-512-maskable.png', size: 512, variant: 'maskable' },
  { file: 'apple-touch-icon.png', size: 180, variant: 'fullbleed' },
  { file: 'app-store-icon-1024.png', size: 1024, variant: 'fullbleed', dir: 'store', colorType: PNG_RGB },
  {
    file: 'google-play-icon-512.png',
    size: 512,
    variant: 'fullbleed',
    dir: 'store',
    encode: 'canvas',
    colorType: PNG_RGBA,
    maxBytes: 1024 * 1024,
  },
]

function parseArgs(argv) {
  const args = {
    out: join(ROOT, 'public'),
    storeOut: join(ROOT, 'store-assets'),
    src: join(ROOT, 'public', 'icon.svg'),
    only: /** @type {string | null} */ (null),
  }
  for (const a of argv) {
    const m = a.match(/^--(out|src|store-out)=(.+)$/)
    const only = a.match(/^--only=(.+)$/)
    if (m) args[m[1] === 'store-out' ? 'storeOut' : m[1]] = resolve(process.cwd(), m[2])
    else if (only) {
      if (only[1] !== 'web' && only[1] !== 'store' && !TARGETS.some((t) => t.file === only[1])) {
        throw new Error(`--only ska vara web, store eller ett filnamn (${TARGETS.map((t) => t.file).join(', ')}), inte "${only[1]}".`)
      }
      args.only = only[1]
    } else if (a === '--help' || a === '-h') args.help = true
    else throw new Error(`Okänt argument: ${a}`)
  }
  return args
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/**
 * Läs PNG-huvudet (IHDR): bredd, höjd, bitdjup och färgtyp.
 * @param {Uint8Array} png
 * @returns {{ width: number, height: number, bitDepth: number, colorType: number }}
 */
export function pngInfo(png) {
  const buf = Buffer.from(png.buffer, png.byteOffset, png.byteLength)
  if (buf.length < 33 || !buf.subarray(0, 8).equals(PNG_SIGNATURE) || buf.toString('latin1', 12, 16) !== 'IHDR') {
    throw new Error('Filen är ingen giltig PNG.')
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bitDepth: buf[24], colorType: buf[25] }
}

const COLOR_TYPE_NAMES = { 0: 'gråskala', 2: 'RGB utan alfakanal', 3: 'palett', 4: 'gråskala med alfa', 6: 'RGBA med alfakanal' }

/**
 * Kontrollera att en renderad ikon uppfyller målets krav. Kastar ett fel på svenska annars.
 * @param {Uint8Array} png
 * @param {Target} target
 */
export function checkPng(png, target) {
  const info = pngInfo(png)
  if (info.width !== target.size || info.height !== target.size) {
    throw new Error(`${target.file}: blev ${info.width} × ${info.height} px, ska vara ${target.size} × ${target.size} px.`)
  }
  if (target.colorType !== undefined && info.colorType !== target.colorType) {
    const got = COLOR_TYPE_NAMES[info.colorType] ?? `okänd typ ${info.colorType}`
    const want = COLOR_TYPE_NAMES[target.colorType]
    throw new Error(`${target.file}: PNG-färgtyp ${info.colorType} (${got}), ska vara ${target.colorType} (${want}).`)
  }
  if (target.maxBytes !== undefined && png.byteLength > target.maxBytes) {
    throw new Error(`${target.file}: ${Math.ceil(png.byteLength / 1024)} KB, får vara högst ${Math.floor(target.maxBytes / 1024)} KB.`)
  }
  return info
}

/**
 * Gör om icon.svg till en variant.
 * @param {string} svg
 * @param {Variant} variant
 * @returns {string}
 */
export function variantSvg(svg, variant) {
  if (variant === 'rounded') return svg
  const bg = /(<rect\b[^>]*\bid="lagom-bg"[^>]*?)\s+rx="[^"]*"/
  if (!bg.test(svg)) throw new Error('Hittar inte <rect id="lagom-bg" rx="…"> i icon.svg.')
  let out = svg.replace(bg, '$1')
  if (variant === 'maskable') {
    const mark = '<g id="lagom-mark">'
    if (!out.includes(mark)) throw new Error('Hittar inte <g id="lagom-mark"> i icon.svg.')
    const s = MASKABLE_SCALE
    const t = (256 * (1 - s)).toFixed(2)
    out = out.replace(mark, `<g id="lagom-mark" transform="translate(${t} ${t}) scale(${s})">`)
  }
  return out
}

/** Sidan som skärmdumpas: SVG:n exakt i ikonens storlek, genomskinlig bakgrund. */
function pageHtml(svg, size) {
  const sized = svg.replace(/<svg\b([^>]*)>/, (_m, attrs) => {
    const clean = attrs.replace(/\s(width|height)="[^"]*"/g, '')
    return `<svg${clean} width="${size}" height="${size}">`
  })
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:transparent}svg{display:block}</style></head><body>${sized}</body></html>`
}

const CANDIDATES = ['playwright', '@playwright/test', 'playwright-core']

/**
 * Hitta Playwrights chromium – först i projektet, sedan globalt. Används även av
 * generate-store-graphics.mjs och app-store-screenshots.mjs. Returnerar null om inget finns.
 */
export async function loadChromium() {
  const pick = (m) => m?.chromium ?? m?.default?.chromium ?? null
  for (const name of CANDIDATES) {
    try {
      const found = pick(await import(name))
      if (found) return found
    } catch {
      /* prova nästa */
    }
  }
  let globalRoot = ''
  try {
    globalRoot = execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
  const require = createRequire(join(globalRoot, 'noop.js'))
  for (const name of CANDIDATES) {
    try {
      const found = pick(await import(pathToFileURL(require.resolve(name)).href))
      if (found) return found
    } catch {
      /* prova nästa */
    }
  }
  return null
}

function printInstructions() {
  console.error(`
Kunde inte hitta Playwright för att rendera ikonerna.

Installera Playwright och Chromium och kör igen:
  npm i -D playwright && npx playwright install chromium
  npm run icons

Alternativ utan Playwright (librsvg):
${TARGETS.filter((t) => t.dir !== 'store')
  .map((t) => `  rsvg-convert -w ${t.size} -h ${t.size} public/icon.svg -o public/${t.file}`)
  .join('\n')}
  (maskable och apple-touch-icon blir då rundade – justera #lagom-bg/#lagom-mark för hand)
`)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log('Användning: node scripts/generate-icons.mjs [--out=public] [--store-out=store-assets] [--only=web|store|<fil>] [--src=public/icon.svg]')
    return
  }
  const svg = await readFile(args.src, 'utf8')
  const chromium = await loadChromium()
  if (!chromium) {
    printInstructions()
    process.exitCode = 1
    return
  }

  const targets = TARGETS.filter((t) => args.only === null || (t.dir ?? 'web') === args.only || t.file === args.only)
  const browser = await chromium.launch()
  try {
    for (const t of targets) {
      const outDir = t.dir === 'store' ? args.storeOut : args.out
      await mkdir(outDir, { recursive: true })
      const page = await browser.newPage({ viewport: { width: t.size, height: t.size }, deviceScaleFactor: 1 })
      const variant = variantSvg(svg, t.variant)
      let png
      if (t.encode === 'canvas') {
        png = await renderViaCanvas(page, variant, t.size)
      } else {
        await page.setContent(pageHtml(variant, t.size), { waitUntil: 'load' })
        png = await page.screenshot({
          type: 'png',
          omitBackground: t.variant === 'rounded',
          clip: { x: 0, y: 0, width: t.size, height: t.size },
        })
      }
      await page.close()
      const info = checkPng(png, t)
      const target = join(outDir, t.file)
      await writeFile(target, png)
      const kb = Math.ceil(png.byteLength / 1024)
      console.log(`✓ ${t.file.padEnd(26)} ${t.size} × ${t.size}  (${t.variant}, färgtyp ${info.colorType}, ${kb} KB)`)
    }
  } finally {
    await browser.close()
  }
}

/**
 * Rita SVG:n på en canvas i sidan och exportera med canvas.toDataURL – ger alltid en 32-bitars
 * PNG (RGBA), som Google Play kräver för ikonen.
 */
async function renderViaCanvas(page, svg, size) {
  const sized = svg.replace(/<svg\b([^>]*)>/, (_m, attrs) => {
    const clean = attrs.replace(/\s(width|height)="[^"]*"/g, '')
    return `<svg${clean} width="${size}" height="${size}">`
  })
  const src = `data:image/svg+xml;base64,${Buffer.from(sized, 'utf8').toString('base64')}`
  await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>')
  const dataUrl = await page.evaluate(
    async ({ src, size }) => {
      const img = new Image()
      img.src = src
      await img.decode()
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas saknas')
      ctx.drawImage(img, 0, 0, size, size)
      return canvas.toDataURL('image/png')
    },
    { src, size },
  )
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64')
}

// Kör bara när filen startas direkt (så att funktionerna kan importeras i tester).
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
}
