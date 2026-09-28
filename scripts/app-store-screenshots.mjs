#!/usr/bin/env node
/**
 * Tar skärmdumpar till App Store och Google Play med exempeldata, i ljust och mörkt läge.
 *
 *   npx vite build                                   # först – skriptet bygger inte själv
 *   node scripts/app-store-screenshots.mjs [--dist=dist] [--out=store-assets/screenshots]
 *                                          [--only=apple|play] [--scheme=ljust|morkt]
 *
 * Så går det till:
 * 1. Startar `vite preview` på en ledig port med det färdiga bygget (dist/ eller --dist=…).
 * 2. Öppnar välkomstsidan och trycker på "Utforska med exempeldata" (två veckors exempeldata,
 *    inget konto och ingen provperiod).
 * 3. Fotograferar sidorna i PAGES för varje storlek och färgläge (rutan om exempeldata och
 *    notiser döljs).
 * 4. Stänger webbläsaren och servern (servern avslutas via sin process-id).
 *
 * Storlekar (logiska punkter × skalfaktor 3):
 *   apple  440 × 956  → 1 320 × 2 868 px  (iPhone 6,9 tum – App Store Connect skalar ned till
 *                                          mindre iPhone-storlekar själv)
 *   play   360 × 640  → 1 080 × 1 920 px  (telefon, 9:16)
 *
 * Bilderna skrivs till store-assets/screenshots/{apple,play}/{ljust,morkt}/<nr>-<sida>.png, utan
 * genomskinlighet (ingen alfakanal – App Store Connect avvisar sådana bilder).
 *
 * Medvetet utelämnat: Dryck (alkohol) och Lagom Premium (priser) – priser i skärmdumparna kan bli
 * fel när butikens priser ändras, och alkohol påverkar åldersklassningen. Notiser döljs, och
 * animationer stängs av (reducerad rörelse) så att bilderna blir desamma varje gång.
 *
 * Vilket bygge:
 * - apple: butiksbygget (VITE_DISTRIBUTION=appstore … npx vite build → --dist=dist-native), så att
 *   bilderna visar iPhone-appen (utan webbens tips om hemskärmen och utan webbköp).
 * - play: webbygget (dist/) – Play-appen visar webbversionen. Skriptet öppnar den med
 *   ?plattform=play, precis som Play-appen gör.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadChromium, PNG_RGB, pngInfo } from './generate-icons.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Sidorna som fotograferas, i den ordning de visas i butiken.
 *
 * Exempeldatan är skrivskyddad, så "Lägg till mat" (#/lagg-till) visar bara förklaringen "Det här
 * är exempeldata". I stället visas ett livsmedel ur exempeldatan med Livsmedelsverkets
 * näringsvärden – samma sida som öppnas från sökningen i Lägg till.
 */
export const PAGES = [
  { route: '/', name: '1-idag' },
  { route: '/dagbok', name: '2-dagbok' },
  // Förra veckan: exempeldatan täcker den helt (den här veckan kan vara en enda dag gammal).
  { route: '/insikter?vecka=-1', name: '3-insikter' },
  { route: '/recept', name: '4-recept' },
  { route: '/vikt', name: '5-vikt' },
  { route: '/livsmedel/lagom:havregrynsgrot-mellanmjolk', name: '6-livsmedel' },
]

/** Sidor som aldrig får vara med: alkohol och priser. */
export const EXCLUDED_ROUTES = ['/dryck', '/premium']

export const DEVICES = {
  apple: { width: 440, height: 956, scale: 3 },
  play: { width: 360, height: 640, scale: 3 },
}

export const SCHEMES = { ljust: 'light', morkt: 'dark' }

/**
 * Startadressen per butik. Play-appen öppnar webbversionen med ?plattform=play (se
 * docs/GOOGLE-PLAY.md) – då visar Lagom samma sak som i Play-appen (inga webbpriser eller tips om
 * hemskärmen). App Store-bilderna tas från butiksbygget (--dist=dist-native), som redan vet att
 * det är en app.
 */
export function startUrl(baseUrl, deviceKey) {
  return deviceKey === 'play' ? `${baseUrl}?plattform=play#/valkommen` : `${baseUrl}#/valkommen`
}

function parseArgs(argv) {
  const args = {
    dist: join(ROOT, 'dist'),
    out: join(ROOT, 'store-assets', 'screenshots'),
    only: /** @type {string | null} */ (null),
    scheme: /** @type {string | null} */ (null),
  }
  for (const a of argv) {
    const m = a.match(/^--(dist|out|only|scheme)=(.+)$/)
    if (!m) {
      if (a === '--help' || a === '-h') args.help = true
      else throw new Error(`Okänt argument: ${a}`)
      continue
    }
    const [, key, value] = m
    if (key === 'dist' || key === 'out') args[key] = resolve(process.cwd(), value)
    else if (key === 'only') {
      if (!(value in DEVICES)) throw new Error(`--only ska vara ${Object.keys(DEVICES).join(' eller ')}, inte "${value}".`)
      args.only = value
    } else {
      if (!(value in SCHEMES)) throw new Error(`--scheme ska vara ${Object.keys(SCHEMES).join(' eller ')}, inte "${value}".`)
      args.scheme = value
    }
  }
  return args
}

/** En ledig port på den här datorn. */
function freePort() {
  return new Promise((resolvePort, reject) => {
    const srv = createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const address = srv.address()
      const port = typeof address === 'object' && address ? address.port : 0
      srv.close(() => resolvePort(port))
    })
  })
}

/** Starta `vite preview` direkt med node (inte via npx), så att vi har serverns egen process-id. */
function startPreview(dist, port) {
  const viteBin = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')
  if (!existsSync(viteBin)) throw new Error('Hittar inte Vite i node_modules. Kör "npm ci" först.')
  const child = spawn(process.execPath, [viteBin, 'preview', '--outDir', dist, '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let log = ''
  child.stdout.on('data', (d) => (log += d))
  child.stderr.on('data', (d) => (log += d))
  return { child, log: () => log }
}

/** Vänta tills servern svarar (högst 30 s). */
async function waitForServer(url, server) {
  const until = Date.now() + 30_000
  while (Date.now() < until) {
    if (server.child.exitCode !== null) throw new Error(`vite preview avslutades direkt:\n${server.log()}`)
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {
      /* inte uppe än */
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`vite preview svarade inte inom 30 sekunder:\n${server.log()}`)
}

function stopServer(server) {
  if (server.child.exitCode === null && server.child.pid !== undefined) {
    try {
      process.kill(server.child.pid, 'SIGTERM')
    } catch {
      /* redan avslutad */
    }
  }
}

/**
 * Dölj notiser, markören och rutan "Du tittar på exempeldata" (DemoBanner), så att bilderna visar
 * appen som den ser ut i vardagen.
 */
const CLEAN_CSS = `
  [data-toast-viewport] { display: none !important; }
  [role="note"][aria-label="Exempeldata"] { display: none !important; }
  * { caret-color: transparent !important; }
`

async function capture(browser, baseUrl, deviceKey, schemeKey, outDir) {
  const device = DEVICES[deviceKey]
  const context = await browser.newContext({
    viewport: { width: device.width, height: device.height },
    deviceScaleFactor: device.scale,
    isMobile: true,
    hasTouch: true,
    colorScheme: SCHEMES[schemeKey],
    reducedMotion: 'reduce',
    locale: 'sv-SE',
    timezoneId: 'Europe/Stockholm',
  })
  const page = await context.newPage()
  try {
    await page.goto(startUrl(baseUrl, deviceKey), { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Utforska med exempeldata' }).click()
    await page.waitForFunction(() => location.hash === '#/' || location.hash === '', undefined, { timeout: 20_000 })
    await page.addStyleTag({ content: CLEAN_CSS })

    const dir = join(outDir, deviceKey, schemeKey)
    await mkdir(dir, { recursive: true })
    for (const { route, name } of PAGES) {
      await page.evaluate((hash) => {
        location.hash = hash
      }, `#${route}`)
      await page.waitForLoadState('networkidle')
      // Lata sidor och diagram: vänta tills laddningssnurran är borta och ge layouten en stund.
      await page.waitForFunction(() => !document.querySelector('main [aria-busy="true"]'), undefined, { timeout: 15_000 }).catch(() => {})
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.waitForTimeout(600)
      const png = await page.screenshot({ type: 'png', fullPage: false })
      const info = checkScreenshot(png, device, `${name}.png`)
      await writeFile(join(dir, `${name}.png`), png)
      console.log(`✓ ${deviceKey}/${schemeKey}/${name}.png  ${info.width} × ${info.height}`)
    }
  } finally {
    await context.close()
  }
}

/**
 * Kontrollera storleken (logisk storlek × skalfaktor) och att bilden saknar alfakanal
 * (PNG-färgtyp 2, RGB). Kastar ett fel på svenska annars.
 * @param {Uint8Array} png
 * @param {{ width: number, height: number, scale: number }} device
 * @param {string} file
 */
export function checkScreenshot(png, device, file) {
  const info = pngInfo(png)
  const w = device.width * device.scale
  const h = device.height * device.scale
  if (info.width !== w || info.height !== h) throw new Error(`${file}: blev ${info.width} × ${info.height} px, ska vara ${w} × ${h} px.`)
  if (info.colorType !== PNG_RGB) throw new Error(`${file}: PNG-färgtyp ${info.colorType} – butikerna vill ha RGB utan alfakanal (färgtyp 2).`)
  return info
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log('Användning: node scripts/app-store-screenshots.mjs [--dist=dist] [--out=store-assets/screenshots] [--only=apple|play] [--scheme=ljust|morkt]')
    return
  }
  if (!existsSync(join(args.dist, 'index.html'))) {
    throw new Error(`Hittar inget bygge i ${args.dist}. Kör "npx vite build" först (skriptet bygger inte själv).`)
  }
  for (const p of PAGES) {
    if (EXCLUDED_ROUTES.includes(p.route)) throw new Error(`${p.route} får inte vara med i butiksbilderna.`)
  }
  const chromium = await loadChromium()
  if (!chromium) {
    console.error('Kunde inte hitta Playwright. Installera med "npm i -D playwright && npx playwright install chromium" och kör igen.')
    process.exitCode = 1
    return
  }

  const port = await freePort()
  const baseUrl = `http://127.0.0.1:${port}/`
  const server = startPreview(args.dist, port)
  let browser
  try {
    await waitForServer(baseUrl, server)
    browser = await chromium.launch()
    const devices = args.only ? [args.only] : Object.keys(DEVICES)
    const schemes = args.scheme ? [args.scheme] : Object.keys(SCHEMES)
    for (const d of devices) {
      for (const s of schemes) await capture(browser, baseUrl, d, s, args.out)
    }
  } finally {
    await browser?.close()
    stopServer(server)
  }
}

// Kör bara när filen startas direkt (så att konstanterna kan importeras i tester).
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
}
