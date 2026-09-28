#!/usr/bin/env node
/**
 * Skapar butiksgrafik för Google Play med Playwrights Chromium (samma sätt som generate-icons.mjs).
 *
 *   node scripts/generate-store-graphics.mjs [--out=store-assets]
 *
 * Skapar:
 *   feature-graphic-1024x500.jpg  Play Consoles "Feature graphic" (Funktionsgrafik): 1 024 × 500 px,
 *                                 JPEG utan genomskinlighet. Visas överst på butikssidan.
 *
 * Innehåll: appikonen, "Lagom – kaloriräknaren" och "Svensk mat, näring och kostråd" i
 * designsystemets färger och typsnitt (Fraunces och Inter från node_modules/@fontsource-variable).
 * Inga priser, inga rankingord och inga myndighetslogotyper – Google Play tillåter inte sådant i
 * grafiken, och Lagom är inte kopplad till Livsmedelsverket.
 *
 * Det viktiga ligger en bit in från kanterna, eftersom Play ibland beskär eller lägger en
 * uppspelningsknapp över mitten när en video finns.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadChromium, variantSvg } from './generate-icons.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export const FEATURE_GRAPHIC = { file: 'feature-graphic-1024x500.jpg', width: 1024, height: 500 }
export const FEATURE_TITLE = 'Lagom – kaloriräknaren'
export const FEATURE_SUBTITLE = 'Svensk mat, näring och kostråd'

/** Designsystemets färger (src/index.css och public/icon.svg). */
const COLORS = {
  granTop: '#266c52',
  granBottom: '#174736',
  cream: '#f6f3ec',
  sol: '#f5cf6b',
  solDeep: '#e6a91a',
}

function parseArgs(argv) {
  const args = { out: join(ROOT, 'store-assets') }
  for (const a of argv) {
    const m = a.match(/^--out=(.+)$/)
    if (m) args.out = resolve(process.cwd(), m[1])
    else if (a === '--help' || a === '-h') args.help = true
    else throw new Error(`Okänt argument: ${a}`)
  }
  return args
}

/** Läs en typsnittsfil som data-URL (sidan laddas från about:blank och kan inte hämta filer). */
async function fontDataUrl(pkg, file) {
  const path = join(ROOT, 'node_modules', '@fontsource-variable', pkg, 'files', file)
  try {
    const data = await readFile(path)
    return `data:font/woff2;base64,${data.toString('base64')}`
  } catch {
    throw new Error(`Hittar inte typsnittet ${path}. Kör "npm ci" först.`)
  }
}

/**
 * Hitta bredd och höjd i en JPEG (SOF-markören), för att kontrollera resultatet.
 * @param {Uint8Array} jpeg
 * @returns {{ width: number, height: number }}
 */
export function jpegSize(jpeg) {
  const buf = Buffer.from(jpeg.buffer, jpeg.byteOffset, jpeg.byteLength)
  if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error('Filen är ingen JPEG.')
  let i = 2
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) {
      i++
      continue
    }
    const marker = buf[i + 1]
    const length = buf.readUInt16BE(i + 2)
    // SOF0–SOF15 utom DHT (C4), JPG (C8) och DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) }
    }
    i += 2 + length
  }
  throw new Error('Hittar ingen storlek i JPEG-filen.')
}

/** Sidan som fotograferas: 1 024 × 500 px. */
export function featureGraphicHtml({ iconSvg, fraunces, inter }) {
  const icon = iconSvg.replace(/<svg\b([^>]*)>/, (_m, attrs) => `<svg${attrs.replace(/\s(width|height)="[^"]*"/g, '')} width="176" height="176" aria-hidden="true">`)
  return `<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8">
<style>
  @font-face { font-family: 'Fraunces'; src: url(${fraunces}) format('woff2'); font-weight: 100 900; }
  @font-face { font-family: 'Inter'; src: url(${inter}) format('woff2'); font-weight: 100 900; }
  html, body { margin: 0; padding: 0; }
  body {
    width: ${FEATURE_GRAPHIC.width}px;
    height: ${FEATURE_GRAPHIC.height}px;
    overflow: hidden;
    position: relative;
    background:
      radial-gradient(circle at 23% 50%, rgb(245 207 107 / 0.28), rgb(245 207 107 / 0.06) 32%, transparent 55%),
      linear-gradient(160deg, ${COLORS.granTop}, ${COLORS.granBottom});
    color: ${COLORS.cream};
    font-family: 'Inter', sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .content {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    gap: 52px;
    padding: 0 88px;
  }
  .icon {
    flex: none;
    width: 176px;
    height: 176px;
    border-radius: 40px;
    box-shadow: 0 18px 40px rgb(0 0 0 / 0.28), 0 0 0 1px rgb(246 243 236 / 0.08);
  }
  .icon svg { display: block; }
  h1 {
    margin: 0;
    font-family: 'Fraunces', serif;
    font-weight: 600;
    font-size: 58px;
    line-height: 1.05;
    letter-spacing: -0.01em;
    font-variation-settings: 'opsz' 96;
  }
  p {
    margin: 18px 0 0;
    font-size: 28px;
    font-weight: 500;
    color: ${COLORS.sol};
  }
  /* Horisonten och spegelbilden från ikonen, som en lugn linje längst ned. */
  .horizon { position: absolute; left: 88px; right: 88px; bottom: 58px; height: 4px; border-radius: 2px; background: rgb(246 243 236 / 0.14); }
  .reflection { position: absolute; right: 88px; bottom: 40px; width: 120px; height: 4px; border-radius: 2px; background: rgb(245 207 107 / 0.35); }
</style>
</head>
<body>
  <div class="content">
    <div class="icon">${icon}</div>
    <div>
      <h1>${FEATURE_TITLE}</h1>
      <p>${FEATURE_SUBTITLE}</p>
    </div>
  </div>
  <div class="horizon"></div>
  <div class="reflection"></div>
</body>
</html>`
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log('Användning: node scripts/generate-store-graphics.mjs [--out=store-assets]')
    return
  }
  const chromium = await loadChromium()
  if (!chromium) {
    console.error('Kunde inte hitta Playwright. Installera med "npm i -D playwright && npx playwright install chromium" och kör igen.')
    process.exitCode = 1
    return
  }
  const iconSvg = variantSvg(await readFile(join(ROOT, 'public', 'icon.svg'), 'utf8'), 'rounded')
  const html = featureGraphicHtml({
    iconSvg,
    fraunces: await fontDataUrl('fraunces', 'fraunces-latin-wght-normal.woff2'),
    inter: await fontDataUrl('inter', 'inter-latin-wght-normal.woff2'),
  })

  await mkdir(args.out, { recursive: true })
  const browser = await chromium.launch()
  try {
    const { width, height, file } = FEATURE_GRAPHIC
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
    await page.setContent(html, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)
    const jpeg = await page.screenshot({ type: 'jpeg', quality: 92, clip: { x: 0, y: 0, width, height } })
    await page.close()
    const size = jpegSize(jpeg)
    if (size.width !== width || size.height !== height) {
      throw new Error(`${file}: blev ${size.width} × ${size.height} px, ska vara ${width} × ${height} px.`)
    }
    await writeFile(join(args.out, file), jpeg)
    console.log(`✓ ${file}  ${width} × ${height}  (JPEG, ${Math.ceil(jpeg.byteLength / 1024)} KB)`)
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
