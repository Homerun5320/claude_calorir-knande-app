/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig, loadEnv, type Plugin, type ResolvedConfig } from 'vite'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { checkCommerceBuild } from './scripts/commerce-guard.ts'
import { NATIVE_PURCHASES_READY } from './src/lib/storePurchases.ts'
import { fillSellerPlaceholders, missingSellerPlaceholders } from './src/features/legal/staticSeller.ts'

const ROOT = fileURLToPath(new URL('.', import.meta.url))

/** Versionen i package.json – visas i Om Lagom och i felrapporter. */
const APP_VERSION = (JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string }).version

/** Kort commit-id (Netlifys COMMIT_REF), annars "lokal". */
const BUILD_ID = (process.env.COMMIT_REF ?? '').slice(0, 7) || 'lokal'

/**
 * Stoppar `vite build` om betalningens inställningar skulle ge en app med gratis testlicenser
 * (skarpt läge utan giltig publik nyckel, eller ett produktionsbygge på Netlify i testläge), en
 * hemlighet i en VITE_-variabel, eller ett skarpt bygge/butiksbygge utan säljarens uppgifter.
 * Se scripts/commerce-guard.ts och docs/BETALNING.md.
 */
function commerceGuard(): Plugin {
  return {
    name: 'lagom-commerce-guard',
    apply: 'build',
    configResolved(config) {
      const { errors, warnings } = checkCommerceBuild(config.env as Record<string, string | undefined>, {
        netlifyContext: process.env.CONTEXT,
        allowTest: process.env.LAGOM_ALLOW_TEST_COMMERCE,
        nativePurchasesReady: NATIVE_PURCHASES_READY,
        allowStoreWithoutIap: process.env.LAGOM_ALLOW_STORE_WITHOUT_IAP,
      })
      for (const w of warnings) config.logger.warn(`Lagom: ${w}`)
      if (errors.length > 0) throw new Error(`Lagom kan inte byggas:\n- ${errors.join('\n- ')}`)
    },
  }
}

/** De fristående sidorna i public/ som har säljarens uppgifter som platshållare ([Företagsnamn] …). */
const STATIC_SELLER_PAGES = ['integritet/index.html', 'villkor/index.html', 'support/index.html', 'radera-konto/index.html']

/**
 * Fyller i säljarens uppgifter (VITE_SELLER_*, VITE_SUPPORT_EMAIL) i de fristående sidorna när
 * bygget skrivs. Uppgifter som saknas står kvar som platshållare – i skarpa byggen och butiksbyggen
 * stoppar redan byggkontrollen (commerceGuard) när de fattas.
 */
function staticSellerPages(): Plugin {
  let config: ResolvedConfig
  return {
    name: 'lagom-static-seller-pages',
    apply: 'build',
    configResolved(resolved) {
      config = resolved
    },
    // writeBundle – före vite-plugin-pwa:s closeBundle, så att service workerns förteckning får
    // de ifyllda sidornas innehåll.
    writeBundle() {
      const env = config.env as Record<string, string | undefined>
      const forSale = env.VITE_COMMERCE_MODE === 'live' || (env.VITE_DISTRIBUTION ?? 'web') !== 'web'
      const outDir = resolve(config.root, config.build.outDir)
      const incomplete: string[] = []
      for (const page of STATIC_SELLER_PAGES) {
        const file = join(outDir, page)
        if (!existsSync(file)) continue
        const html = fillSellerPlaceholders(readFileSync(file, 'utf8'), env)
        writeFileSync(file, html)
        const missing = missingSellerPlaceholders(html)
        if (missing.length > 0) incomplete.push(`${page} (${missing.join(', ')})`)
      }
      if (incomplete.length === 0) return
      // I testläge är platshållarna väntade – en rad räcker. Inför försäljning varnas det tydligt.
      if (forSale) {
        for (const page of incomplete) config.logger.warn(`Lagom: ${page} saknar säljarens uppgifter – sätt VITE_SELLER_* och VITE_SUPPORT_EMAIL.`)
      } else {
        config.logger.info(`Lagom: säljarens uppgifter saknas på ${incomplete.length} fristående sidor (platshållare står kvar tills VITE_SELLER_* och VITE_SUPPORT_EMAIL sätts).`)
      }
    },
  }
}

/**
 * Filer som bara hör hemma på webbplatsen: de fristående sidorna (integritetspolicy, villkor,
 * support och radering) med webbköp, Stripe och Google Play, och service workerns övergångsskript.
 * I butiksappen finns policyn och villkoren som sidor i appen (med rätt plattformstext) – de
 * fristående sidorna ska inte ligga i appens paket (Apples riktlinje 2.3.10).
 */
const WEB_ONLY_FILES = ['integritet', 'villkor', 'support', 'radera-konto', 'sw-overgang.js']

function removeWebOnlyFiles(): Plugin {
  let config: ResolvedConfig
  return {
    name: 'lagom-remove-web-only-files',
    apply: 'build',
    configResolved(resolved) {
      config = resolved
    },
    writeBundle() {
      const outDir = resolve(config.root, config.build.outDir)
      for (const name of WEB_ONLY_FILES) rmSync(join(outDir, name), { recursive: true, force: true })
    },
  }
}

/** CSP:n i netlify.toml – samma regler gäller i butiksapparna, där den läggs som meta-tagg. */
function netlifyCsp(): string {
  const toml = readFileSync(join(ROOT, 'netlify.toml'), 'utf8')
  const csp = /Content-Security-Policy = "([^"]+)"/.exec(toml)?.[1]
  if (!csp) throw new Error('Lagom: hittade ingen Content-Security-Policy i netlify.toml.')
  return csp
}

/**
 * CSP för butiksbygget (meta-tagg, eftersom appen inte får några headers från Netlify): samma
 * direktiv som netlify.toml, utan frame-ancestors (fungerar inte i en meta-tagg) och Stripe
 * (inga webbköp i butiksapparna), plus serverfunktionernas ursprung (VITE_API_BASE) i connect-src.
 */
function nativeCsp(csp: string, apiBase: string | undefined): string {
  let apiOrigin = ''
  try {
    if (apiBase?.trim()) apiOrigin = new URL(apiBase.trim()).origin
  } catch {
    // Ogiltig adress – byggkontrollen stoppar redan butiksbyggen utan https-adress.
  }
  return csp
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part && !part.startsWith('frame-ancestors'))
    .map((part) => {
      const [name, ...sources] = part.split(/\s+/)
      if (name === 'connect-src' && apiOrigin && !sources.includes(apiOrigin)) return [name, ...sources, apiOrigin].join(' ')
      if (name === 'form-action') return [name, ...sources.filter((s) => !s.includes('stripe.com'))].join(' ')
      return part
    })
    .join('; ')
}

function nativeCspMeta(apiBase: string | undefined): Plugin {
  return {
    name: 'lagom-native-csp',
    apply: 'build',
    transformIndexHtml(html) {
      const content = nativeCsp(netlifyCsp(), apiBase).replaceAll('"', '&quot;')
      const meta = `<meta http-equiv="Content-Security-Policy" content="${content}" />`
      const withMeta = html.replace(/(<meta charset="[^"]*"\s*\/?>)/i, `$1\n    ${meta}`)
      if (withMeta === html) throw new Error('Lagom: hittade ingen <meta charset> i index.html för CSP-taggen.')
      return withMeta
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  /** Butiksbygge (App Store eller Google Play): ingen service worker, CSP som meta-tagg, eget utdatakatalog. */
  const IS_STORE = (env.VITE_DISTRIBUTION || 'web') !== 'web'

  return {
    base: './',
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    // Version och bygge för Om Lagom och felrapporter. Inte i testerna – där gäller reservvärdena
    // ('0.0.0-dev' och 'lokal'), se src/globals.d.ts.
    define:
      mode === 'test'
        ? {}
        : {
            __APP_VERSION__: JSON.stringify(APP_VERSION),
            __BUILD_ID__: JSON.stringify(BUILD_ID),
            // Distributionen som konstant (se src/config/platform.ts) – ogiltiga värden stoppas av byggkontrollen.
            __LAGOM_DISTRIBUTION__: JSON.stringify(env.VITE_DISTRIBUTION || 'web'),
          },
    plugins: [
      commerceGuard(),
      react(),
      tailwindcss(),
      staticSellerPages(),
      ...(IS_STORE ? [nativeCspMeta(env.VITE_API_BASE), removeWebOnlyFiles()] : []),
      VitePWA({
        // Service workern registreras av UpdatePrompt (AppShell), som frågar innan en ny version tas i bruk.
        registerType: 'prompt',
        injectRegister: false,
        // Butiksapparna uppdateras via App Store och Google Play – ingen service worker där.
        disable: IS_STORE,
        includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
        manifest: {
          id: './',
          name: 'Lagom – kaloriräknaren',
          short_name: 'Lagom',
          description: 'Svensk kalori- och näringsdagbok med Livsmedelsverkets värden.',
          lang: 'sv-SE',
          start_url: './',
          scope: './',
          display: 'standalone',
          background_color: '#F6F3EC',
          theme_color: '#1F5A43',
          categories: ['health', 'food', 'lifestyle'],
          icons: [
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
          shortcuts: [
            { name: 'Lägg till mat', url: './#/lagg-till', icons: [{ src: 'icon-96.png', sizes: '96x96', type: 'image/png' }] },
            { name: 'Skanna streckkod', url: './#/skanna', icons: [{ src: 'icon-96.png', sizes: '96x96', type: 'image/png' }] },
            { name: 'Dryck', url: './#/dryck', icons: [{ src: 'icon-96.png', sizes: '96x96', type: 'image/png' }] },
          ],
        },
        workbox: {
          // Övergången från autoUpdate (före 1.0) till uppdateringsfrågan – se public/sw-overgang.js.
          importScripts: ['sw-overgang.js'],
          globPatterns: ['**/*.{js,css,html,svg,png,woff2,json,txt}'],
          // Typsnittens teckenuppsättningar för andra skriftsystem behövs inte offline.
          globIgnores: ['**/*-{cyrillic,cyrillic-ext,greek,greek-ext,vietnamese}-*.woff2'],
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
          navigateFallback: 'index.html',
          // De fristående sidorna (integritetspolicy, villkor, support, radering, licenser) och
          // serverns adresser ska aldrig ersättas av appen.
          navigateFallbackDenylist: [
            /^\/integritet/,
            /^\/villkor/,
            /^\/support/,
            /^\/radera-konto/,
            /^\/licenses/,
            /^\/\.well-known\//,
            /^\/api\//,
          ],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/images\.openfoodfacts\.org\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'off-images',
                expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 60 },
              },
            },
          ],
        },
      }),
    ],
    build: {
      // Butiksbygget hamnar i en egen katalog (Capacitors webDir), så att det aldrig förväxlas med webbygget.
      outDir: IS_STORE ? 'dist-native' : 'dist',
      // Licenserna för alla paket som byggs in – Om Lagom länkar till ./licenses.txt.
      license: { fileName: 'licenses.txt' },
      // Livsmedelsdatabasen och streckkodsläsaren är avsiktligt stora, lazy-laddade chunkar (under 500 kB).
      chunkSizeWarningLimit: 600,
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      css: false,
    },
  }
})
