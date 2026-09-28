#!/usr/bin/env node
/**
 * Appikoner och startskärmar för de inbyggda apparna (Capacitor), från public/icon.svg och
 * store-assets/app-store-icon-1024.png.
 *
 *   npm run native:assets
 *   node scripts/generate-native-assets.mjs [--only=android|ios] [--src=public/icon.svg]
 *
 * Android (android/app/src/main/res/):
 *   mipmap-{mdpi…xxxhdpi}/ic_launcher_foreground.png   förgrunden i den adaptiva ikonen (108 dp:
 *                                                      108–432 px), märket inom säkra zonen på
 *                                                      genomskinlig bakgrund. Bakgrunden är färgen
 *                                                      ic_launcher_background (values/), och den
 *                                                      tonade varianten och notisikonen är vektorer
 *                                                      (drawable/ic_launcher_monochrome.xml,
 *                                                      drawable/ic_stat_lagom.xml).
 *   Startskärmen är samma förgrund på en grön cirkel, på appens bakgrund (values/styles.xml) – den
 *   behöver inga egna bilder. Minsta Android är 8.0 (API 26), så de gamla ikonerna ic_launcher.png
 *   och ic_launcher_round.png behövs inte (de tas bort om de finns).
 *
 * iPhone (ios/App/App/Assets.xcassets/):
 *   AppIcon.appiconset/AppIcon-512@2x.png   1024 × 1024 utan alfakanal – kopia av
 *                                           store-assets/app-store-icon-1024.png (skapa den med
 *                                           node scripts/generate-icons.mjs --only=store).
 *   Splash.imageset/splash-2732x2732.png       startskärmen i ljust läge (#F6F3EC) och
 *   Splash.imageset/splash-2732x2732-dark.png  i mörkt läge (#0B1210), appikonen i mitten.
 *
 * Varje fil kontrolleras efteråt (storlek och färgtyp). Renderingen görs med Playwrights Chromium,
 * precis som i generate-icons.mjs (samma sökning efter Playwright, inga nya paket).
 */
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { checkPng, loadChromium, PNG_RGB, PNG_RGBA, variantSvg } from './generate-icons.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ANDROID_RES = join(ROOT, 'android', 'app', 'src', 'main', 'res')
const IOS_ASSETS = join(ROOT, 'ios', 'App', 'App', 'Assets.xcassets')

/**
 * Märket i den adaptiva ikonen: skala kring mitten så att det hamnar inom säkra zonen (66 dp av
 * 108 dp) och ungefär lika stort som i den fyrkantiga ikonen. Samma skala som i
 * drawable/ic_launcher_monochrome.xml.
 */
export const ADAPTIVE_SCALE = 0.62

/** Androids skärmtätheter och faktorn mot mdpi. */
export const DENSITIES = /** @type {const} */ ([
  ['mdpi', 1],
  ['hdpi', 1.5],
  ['xhdpi', 2],
  ['xxhdpi', 3],
  ['xxxhdpi', 4],
])

/** Appens bakgrund i ljust och mörkt läge (--lg-bg i src/index.css). */
export const SPLASH_BACKGROUNDS = /** @type {const} */ ({ light: '#F6F3EC', dark: '#0B1210' })
/** Startskärmen på iPhone: kvadratisk bild som fyller skärmen (scaleAspectFill i LaunchScreen.storyboard). */
export const SPLASH_SIZE = 2732
/** Ikonens storlek i startskärmsbilden – ca 120 punkter på en modern iPhone. */
export const SPLASH_ICON = 384

/**
 * Förgrunden i den adaptiva ikonen: märket utan bakgrund, skalat kring mitten.
 * @param {string} svg
 */
export function foregroundSvg(svg) {
  const bg = /<rect\b[^>]*\bid="lagom-bg"[^>]*\/>/
  if (!bg.test(svg)) throw new Error('Hittar inte <rect id="lagom-bg" … /> i icon.svg.')
  const mark = '<g id="lagom-mark">'
  if (!svg.includes(mark)) throw new Error('Hittar inte <g id="lagom-mark"> i icon.svg.')
  const t = (256 * (1 - ADAPTIVE_SCALE)).toFixed(2)
  return svg.replace(bg, '').replace(mark, `<g id="lagom-mark" transform="translate(${t} ${t}) scale(${ADAPTIVE_SCALE})">`)
}

/** SVG:n i en viss storlek (width/height byts ut). */
function sized(svg, size) {
  return svg.replace(/<svg\b([^>]*)>/, (_m, attrs) => `<svg${attrs.replace(/\s(width|height)="[^"]*"/g, '')} width="${size}" height="${size}">`)
}

/** Sida med SVG:n i mitten på en färgad (eller genomskinlig) bakgrund. */
export function pageHtml(svg, { size, iconSize = size, background = 'transparent' }) {
  return (
    '<!doctype html><html><head><meta charset="utf-8"><style>' +
    `html,body{margin:0;padding:0;width:${size}px;height:${size}px;background:${background}}` +
    'body{display:flex;align-items:center;justify-content:center}svg{display:block}' +
    `</style></head><body>${sized(svg, iconSize)}</body></html>`
  )
}

function parseArgs(argv) {
  const args = { only: /** @type {'android' | 'ios' | null} */ (null), src: join(ROOT, 'public', 'icon.svg'), help: false }
  for (const a of argv) {
    const only = a.match(/^--only=(.+)$/)
    const src = a.match(/^--src=(.+)$/)
    if (only) {
      if (only[1] !== 'android' && only[1] !== 'ios') throw new Error(`--only ska vara android eller ios, inte "${only[1]}".`)
      args.only = only[1]
    } else if (src) args.src = resolve(process.cwd(), src[1])
    else if (a === '--help' || a === '-h') args.help = true
    else throw new Error(`Okänt argument: ${a}`)
  }
  return args
}

async function render(browser, html, size, transparent) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
  try {
    await page.setContent(html, { waitUntil: 'load' })
    return await page.screenshot({ type: 'png', omitBackground: transparent, clip: { x: 0, y: 0, width: size, height: size } })
  } finally {
    await page.close()
  }
}

async function android(browser, svg) {
  if (!existsSync(ANDROID_RES)) throw new Error('android/ saknas – kör först: npx cap add android')
  const foreground = foregroundSvg(svg)
  for (const [density, factor] of DENSITIES) {
    const dir = join(ANDROID_RES, `mipmap-${density}`)
    await mkdir(dir, { recursive: true })
    const size = Math.round(108 * factor)
    const png = await render(browser, pageHtml(foreground, { size }), size, true)
    const info = checkPng(png, { file: `mipmap-${density}/ic_launcher_foreground.png`, size, variant: 'maskable', colorType: PNG_RGBA })
    await writeFile(join(dir, 'ic_launcher_foreground.png'), png)
    // De gamla ikonerna används inte från Android 8.0 (minSdk 26) – den adaptiva ikonen gäller.
    await rm(join(dir, 'ic_launcher.png'), { force: true })
    await rm(join(dir, 'ic_launcher_round.png'), { force: true })
    console.log(`✓ android mipmap-${density}/ic_launcher_foreground.png  ${size} × ${size} (färgtyp ${info.colorType})`)
  }
}

async function ios(browser, svg) {
  if (!existsSync(IOS_ASSETS)) throw new Error('ios/ saknas – kör först: npx cap add ios')

  // Appikonen: samma fil som laddas upp i App Store Connect (RGB utan alfakanal).
  const storeIcon = join(ROOT, 'store-assets', 'app-store-icon-1024.png')
  if (!existsSync(storeIcon)) throw new Error('store-assets/app-store-icon-1024.png saknas – kör: node scripts/generate-icons.mjs --only=store')
  checkPng(await readFile(storeIcon), { file: 'app-store-icon-1024.png', size: 1024, variant: 'fullbleed', colorType: PNG_RGB })
  const iconDir = join(IOS_ASSETS, 'AppIcon.appiconset')
  await copyFile(storeIcon, join(iconDir, 'AppIcon-512@2x.png'))
  console.log('✓ ios AppIcon.appiconset/AppIcon-512@2x.png  1024 × 1024 (från store-assets)')

  // Startskärmen: den rundade ikonen mitt på appens bakgrund, ljus och mörk.
  const splashDir = join(IOS_ASSETS, 'Splash.imageset')
  await mkdir(splashDir, { recursive: true })
  for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png', 'splash-2732x2732-dark.png']) {
    await rm(join(splashDir, name), { force: true })
  }
  const icon = variantSvg(svg, 'rounded')
  for (const [mode, background] of Object.entries(SPLASH_BACKGROUNDS)) {
    const file = mode === 'dark' ? 'splash-2732x2732-dark.png' : 'splash-2732x2732.png'
    const png = await render(browser, pageHtml(icon, { size: SPLASH_SIZE, iconSize: SPLASH_ICON, background }), SPLASH_SIZE, false)
    const info = checkPng(png, { file, size: SPLASH_SIZE, variant: 'fullbleed', colorType: PNG_RGB })
    await writeFile(join(splashDir, file), png)
    console.log(`✓ ios Splash.imageset/${file}  ${info.width} × ${info.height} (${mode === 'dark' ? 'mörkt' : 'ljust'} läge, ${Math.ceil(png.byteLength / 1024)} KB)`)
  }
  const contents = {
    images: [
      { idiom: 'universal', filename: 'splash-2732x2732.png' },
      { idiom: 'universal', filename: 'splash-2732x2732-dark.png', appearances: [{ appearance: 'luminosity', value: 'dark' }] },
    ],
    info: { author: 'xcode', version: 1 },
  }
  await writeFile(join(splashDir, 'Contents.json'), `${JSON.stringify(contents, null, 2)}\n`)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log('Användning: node scripts/generate-native-assets.mjs [--only=android|ios] [--src=public/icon.svg]')
    return
  }
  const svg = await readFile(args.src, 'utf8')
  const chromium = await loadChromium()
  if (!chromium) {
    console.error('Kunde inte hitta Playwright. Installera och kör igen:\n  npm i -g playwright && npx playwright install chromium\n  npm run native:assets')
    process.exitCode = 1
    return
  }
  const browser = await chromium.launch()
  try {
    if (args.only !== 'ios') await android(browser, svg)
    if (args.only !== 'android') await ios(browser, svg)
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
