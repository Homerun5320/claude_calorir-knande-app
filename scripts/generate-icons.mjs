#!/usr/bin/env node
/**
 * Renderar public/icon.svg till PNG-ikoner för PWA-manifestet och iOS.
 *
 *   npm run icons
 *   node scripts/generate-icons.mjs [--out=public] [--src=public/icon.svg]
 *
 * Skapar:
 *   icon-192.png            192 × 192   rundad ikon med genomskinliga hörn ("any")
 *   icon-512.png            512 × 512   rundad ikon med genomskinliga hörn ("any")
 *   icon-512-maskable.png   512 × 512   fullfylld bakgrund, märket inom säkra zonen ("maskable")
 *   apple-touch-icon.png    180 × 180   fullfylld utan genomskinlighet (iOS rundar själv hörnen)
 *
 * Renderingen görs med Playwrights Chromium, som ger exakt samma resultat som webbläsaren.
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

/** @type {ReadonlyArray<{ file: string, size: number, variant: Variant }>} */
export const TARGETS = [
  { file: 'icon-192.png', size: 192, variant: 'rounded' },
  { file: 'icon-512.png', size: 512, variant: 'rounded' },
  { file: 'icon-512-maskable.png', size: 512, variant: 'maskable' },
  { file: 'apple-touch-icon.png', size: 180, variant: 'fullbleed' },
]

function parseArgs(argv) {
  const args = { out: join(ROOT, 'public'), src: join(ROOT, 'public', 'icon.svg') }
  for (const a of argv) {
    const m = a.match(/^--(out|src)=(.+)$/)
    if (m) args[m[1]] = resolve(process.cwd(), m[2])
    else if (a === '--help' || a === '-h') args.help = true
    else throw new Error(`Okänt argument: ${a}`)
  }
  return args
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

/** Hitta Playwrights chromium – först i projektet, sedan globalt. */
async function loadChromium() {
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
${TARGETS.map((t) => `  rsvg-convert -w ${t.size} -h ${t.size} public/icon.svg -o public/${t.file}`).join('\n')}
  (maskable och apple-touch-icon blir då rundade – justera #lagom-bg/#lagom-mark för hand)
`)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log('Användning: node scripts/generate-icons.mjs [--out=public] [--src=public/icon.svg]')
    return
  }
  const svg = await readFile(args.src, 'utf8')
  const chromium = await loadChromium()
  if (!chromium) {
    printInstructions()
    process.exitCode = 1
    return
  }

  await mkdir(args.out, { recursive: true })
  const browser = await chromium.launch()
  try {
    for (const t of TARGETS) {
      const page = await browser.newPage({ viewport: { width: t.size, height: t.size }, deviceScaleFactor: 1 })
      await page.setContent(pageHtml(variantSvg(svg, t.variant), t.size), { waitUntil: 'load' })
      const png = await page.screenshot({
        type: 'png',
        omitBackground: t.variant === 'rounded',
        clip: { x: 0, y: 0, width: t.size, height: t.size },
      })
      await page.close()
      const target = join(args.out, t.file)
      await writeFile(target, png)
      console.log(`✓ ${t.file.padEnd(24)} ${t.size} × ${t.size}  (${t.variant})`)
    }
  } finally {
    await browser.close()
  }
}

// Kör bara när filen startas direkt (så att funktionerna kan importeras i tester).
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
}
