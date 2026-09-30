/**
 * Gemensam grund för Lagoms e2e-resor: den byggda appen i riktig Chromium (riktig IndexedDB,
 * riktig service worker i webbygget, riktiga omladdningar) – inga mockar av appens kod.
 *
 * - `loadChromium()` från scripts/generate-icons.mjs (Playwright i projektet eller den globala
 *   installationen, t.ex. /opt/node22/lib/node_modules/playwright). Playwright är inget beroende i
 *   projektet och installeras aldrig härifrån.
 * - En liten statisk server (node:http) för `dist/` som svarar med index.html för okända sökvägar
 *   (appen använder en hash-router, #/…) och skickar samma CSP och Permissions-Policy som
 *   netlify.toml – så att ett CSP-fel syns som ett konsolfel. `upgrade-insecure-requests` tas bort,
 *   eftersom servern kör http på 127.0.0.1.
 * - Ny kontext per resa (tom IndexedDB och localStorage), mobil vy 390×844, sv-SE och
 *   Europe/Stockholm. Alla externa värdar stoppas (`context.route`) – Open Food Facts och annat nås
 *   inte härifrån – och resor som behöver en produkt svarar själva med `answerExternal`.
 * - Konsolfel, sidfel, misslyckade anrop mot den egna servern, nya poster i appens fellogg
 *   (`lagom-error-log`) och vågrät scroll vid 390 px samlas per resa. Ett oväntat konsolfel är ett
 *   fynd och gör att resan misslyckas.
 * - `runJourneys` kör resorna, skriver PASS/FAIL per resa och en sammanfattning, sparar en
 *   skärmdump av varje misslyckande i /tmp/lagom-e2e/<resa>.png och sätter slutkoden 1 vid fel.
 *
 * Filen slutar inte på .test.* – den körs aldrig av vitest eller CI.
 */
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadChromium } from '../generate-icons.mjs'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
/** Skärmdumpar av misslyckade resor. */
export const SHOT_DIR = '/tmp/lagom-e2e'
/** Mobil vy (iPhone 12–15). */
export const VIEWPORT = { width: 390, height: 844 }
/** Databasen och objektlagret som idb-keyval (och dagbokens lagring) använder. */
export const IDB_NAME = 'keyval-store'
export const IDB_STORE = 'keyval'

export { loadChromium }

// ---------------------------------------------------------------------------
// Argument
// ---------------------------------------------------------------------------

/**
 * `--dist=<mapp>` (standard dist), `--only=<resa>[,<resa>]`, `--headed`, `--port=<nr>` (standard
 * ledig port), `--no-csp` (skicka inte netlify.toml:s CSP), `--slow=<ms>` (slowMo), `--shell`
 * (Playwrights chromium-headless-shell i stället för hela Chromium), `--list`.
 */
export function parseArgs(argv) {
  const args = { dist: resolve(ROOT, 'dist'), only: null, headed: false, port: 0, csp: true, slow: 0, list: false, help: false, shell: false }
  for (const a of argv) {
    if (a === '--help' || a === '-h') args.help = true
    else if (a === '--headed') args.headed = true
    else if (a === '--shell') args.shell = true
    else if (a === '--no-csp') args.csp = false
    else if (a === '--list') args.list = true
    else if (a.startsWith('--dist=')) args.dist = resolve(a.slice(7))
    else if (a.startsWith('--only=')) args.only = a.slice(7).split(',').map((s) => s.trim()).filter(Boolean)
    else if (a.startsWith('--port=')) args.port = Math.max(0, Math.round(Number(a.slice(7))) || 0)
    else if (a.startsWith('--slow=')) args.slow = Math.max(0, Math.round(Number(a.slice(7))) || 0)
    else throw new Error(`Okänt argument: ${a} (se --help)`)
  }
  return args
}

// ---------------------------------------------------------------------------
// Statisk server
// ---------------------------------------------------------------------------

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.wasm': 'application/wasm',
}

/**
 * Sökvägen till en tom sida på samma ursprung – för att fylla IndexedDB innan appen startar. Under
 * /.well-known/, som service workerns `navigateFallbackDenylist` släpper igenom till servern (annars
 * skulle en service worker som redan styr sidan svara med appen).
 */
export const BLANK_PATH = '/.well-known/lagom-e2e-tom.html'

/** CSP och övriga rubriker för "/*" ur netlify.toml (utan upgrade-insecure-requests). */
export function netlifyHeaders() {
  const out = {}
  try {
    const toml = readFileSync(join(ROOT, 'netlify.toml'), 'utf8')
    const block = /\[\[headers\]\]\s*\n\s*for\s*=\s*"\/\*"\s*\n\s*\[headers\.values\]\s*\n([\s\S]*?)(?=\n\s*\[\[|\n\s*#|$)/.exec(toml)
    if (!block) return out
    for (const line of block[1].split('\n')) {
      const m = /^\s*([A-Za-z-]+)\s*=\s*"(.*)"\s*$/.exec(line)
      if (m) out[m[1]] = m[2]
    }
    if (out['Content-Security-Policy']) {
      out['Content-Security-Policy'] = out['Content-Security-Policy']
        .split(';')
        .map((d) => d.trim())
        .filter((d) => d && d !== 'upgrade-insecure-requests')
        .join('; ')
    }
    // Rubriker som bara hör till en riktig webbplats (ramar) spelar ingen roll här men skadar inte.
  } catch {
    /* ingen netlify.toml – inga extra rubriker */
  }
  return out
}

/**
 * Starta en statisk server för `dir` på 127.0.0.1 (en säker kontext – service workern och
 * IndexedDB fungerar som på https). Okända sökvägar utan filändelse får index.html.
 */
export async function startServer(dir, { port = 0, csp = true } = {}) {
  if (!existsSync(join(dir, 'index.html'))) {
    throw new Error(`Hittar inte ${join(dir, 'index.html')} – bygg appen först (npx vite build --outDir ${dir}).`)
  }
  const root = resolve(dir)
  const extra = csp ? netlifyHeaders() : {}
  const server = createServer((req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (url.pathname === BLANK_PATH) {
        res.writeHead(200, { 'content-type': TYPES['.html'], 'cache-control': 'no-store' })
        res.end('<!doctype html><html lang="sv"><head><meta charset="utf-8"><title>e2e</title></head><body></body></html>')
        return
      }
      let rel = decodeURIComponent(url.pathname)
      if (rel.endsWith('/')) rel += 'index.html'
      let file = normalize(join(root, rel))
      if (file !== root && !file.startsWith(root + sep)) {
        res.writeHead(403).end()
        return
      }
      let isFile = existsSync(file) && statSync(file).isFile()
      if (!isFile && extname(rel) === '') {
        // Appens egna sökvägar: index.html (som Netlify med hash-routern).
        file = join(root, 'index.html')
        isFile = true
      }
      if (!isFile) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('404')
        return
      }
      const type = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream'
      const headers = { 'content-type': type, ...extra }
      headers['cache-control'] = rel.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate'
      const body = readFileSync(file)
      res.writeHead(200, headers)
      res.end(req.method === 'HEAD' ? undefined : body)
    } catch (e) {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }).end(String(e))
    }
  })
  await new Promise((ok, fail) => {
    server.once('error', fail)
    server.listen(port, '127.0.0.1', ok)
  })
  const address = server.address()
  const base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : port}`
  return {
    base,
    close: () =>
      new Promise((ok) => {
        server.closeAllConnections?.()
        server.close(() => ok())
      }),
  }
}

// ---------------------------------------------------------------------------
// Webbläsare och kontexter
// ---------------------------------------------------------------------------

/**
 * Hela Chromium (nytt huvudlöst läge) som standard. Playwrights "chromium-headless-shell" kraschar
 * fliken när Lägg till frågar `SpeechRecognition.available()` (röstsökningen) – det gör inte den
 * riktiga webbläsaren. `--shell` väljer ändå skalet.
 *
 * Utan locale (LANG/LC_ALL tomma, t.ex. i en container) kan Chromium på Linux inte skriva filnamn
 * med å/ä/ö och döper nedladdningar till "download" – webbläsaren får då C.UTF-8.
 */
export async function launchBrowser({ headed = false, slow = 0, shell = false } = {}) {
  const chromium = await loadChromium()
  if (!chromium) {
    throw new Error('Hittar inte Playwright. Den globala installationen (npm root -g) används – t.ex. /opt/node22/lib/node_modules/playwright med Chromium i /opt/pw-browsers.')
  }
  const noLocale = !process.env.LC_ALL && !process.env.LC_CTYPE && !process.env.LANG
  return chromium.launch({
    headless: !headed,
    slowMo: slow || undefined,
    ...(shell ? {} : { channel: 'chromium' }),
    ...(noLocale ? { env: { ...process.env, LANG: 'C.UTF-8' } } : {}),
  })
}

/**
 * En ny kontext: tom IndexedDB, localStorage och service worker. Mobil vy, svenska och svensk tid.
 * Alla anrop till andra värdar än servern stoppas; `state.external` samlar dem. En resa kan svara
 * på vissa externa anrop själv med `answerExternal`.
 */
export async function newAppContext(browser, state, base, opts = {}) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    screen: VIEWPORT,
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: false,
    locale: 'sv-SE',
    timezoneId: 'Europe/Stockholm',
    acceptDownloads: true,
    serviceWorkers: opts.serviceWorkers ?? 'allow',
    ...opts.contextOptions,
  })
  const origin = new URL(base).origin
  const handlers = []
  state.externalHandlers = handlers
  // context.route ser även service workerns anrop (Chromium).
  await context.route(
    (url) => url.origin !== origin && (url.protocol === 'http:' || url.protocol === 'https:'),
    async (route) => {
      const url = route.request().url()
      for (const h of handlers) {
        if (h.match(url)) {
          await route.fulfill(await h.respond(url, route.request()))
          return
        }
      }
      state.external.push(url)
      await route.abort('internetdisconnected')
    },
  )
  context.on('page', (p) => watchPage(p, state))
  return context
}

/** Svara på externa anrop som matchar `match` (t.ex. Open Food Facts) i stället för att stoppa dem. */
export function answerExternal(state, match, respond) {
  state.externalHandlers.push({ match: typeof match === 'function' ? match : (u) => match.test(u), respond })
}

/** Samla konsolfel, sidfel och misslyckade anrop för en sida (anropas för varje ny sida i kontexten). */
export function watchPage(page, state) {
  if (state.watched.has(page)) return
  state.watched.add(page)
  const label = () => {
    try {
      return new URL(page.url()).hash || '/'
    } catch {
      return '?'
    }
  }
  page.on('console', (msg) => {
    const type = msg.type()
    if (type !== 'error' && type !== 'warning') return
    const text = msg.text()
    const entry = { type, text: text.slice(0, 500), at: label() }
    if (type === 'error') state.consoleErrors.push(entry)
    else state.consoleWarnings.push(entry)
  })
  // Vågrät scroll kontrolleras efter varje sidbyte (även hashbyten inne i appen), när sidan har ritats.
  page.on('framenavigated', (frame) => {
    if (frame !== page.mainFrame()) return
    setTimeout(() => {
      if (!page.isClosed()) void checkOverflow(page, state, 'efter sidbyte')
    }, 800)
  })
  page.on('pageerror', (err) => {
    state.pageErrors.push({ text: `${err.name}: ${err.message}`.slice(0, 500), at: label() })
  })
  // Webbläsarens egna dialoger (alert/confirm/"Lämna sidan?") är ett fynd – appen använder sina
  // egna. "Lämna sidan?" besvaras med Lämna, så att omladdningen eller sidbytet ändå blir av;
  // övriga stängs.
  page.on('dialog', (dialog) => {
    const type = dialog.type()
    state.browserDialogs.push({ type, text: dialog.message().slice(0, 200), at: label() })
    void (type === 'beforeunload' ? dialog.accept() : dialog.dismiss()).catch(() => {})
  })
  page.on('requestfailed', (req) => {
    const url = req.url()
    if (!url.startsWith(state.base)) return
    const reason = req.failure()?.errorText ?? ''
    // Avbrutna anrop vid omladdning och offline-läget är väntade.
    if (/ERR_ABORTED|ERR_INTERNET_DISCONNECTED/.test(reason)) return
    state.failedRequests.push({ url: url.slice(state.base.length), reason })
  })
  page.on('response', (res) => {
    const url = res.url()
    if (!url.startsWith(state.base) || res.status() < 400) return
    state.failedRequests.push({ url: url.slice(state.base.length), reason: `HTTP ${res.status()}` })
  })
}

// ---------------------------------------------------------------------------
// Kontroller
// ---------------------------------------------------------------------------

export class JourneyFailure extends Error {}

/** Avbryt resan om villkoret inte stämmer. */
export function check(cond, message) {
  if (!cond) throw new JourneyFailure(message)
}

/** Vänta tills `fn` ger ett sant värde (eller tiden tar slut) och returnera det. */
export async function waitFor(fn, { timeout = 5000, interval = 100, message = 'villkoret uppfylldes aldrig' } = {}) {
  const until = Date.now() + timeout
  let last
  for (;;) {
    try {
      last = await fn()
      if (last) return last
    } catch (e) {
      last = e
    }
    if (Date.now() > until) throw new JourneyFailure(`${message}${last instanceof Error ? ` (${last.message.split('\n')[0]})` : ''}`)
    await new Promise((r) => setTimeout(r, interval))
  }
}

/**
 * Kontrollera att sidan inte kan scrollas i sidled vid 390 px (sparas som fynd, avbryter inte).
 * Bara en bredd som står kvar efter `confirmMs` räknas – en animation (t.ex. när dagboken byter dag
 * med en glidning) kan under några bildrutor sticka ut en pixel eller två.
 */
export async function checkOverflow(page, state, where, { confirmMs = 600 } = {}) {
  const measure = () => page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, hash: location.hash }))
  try {
    let w = await measure()
    if (w.scroll > VIEWPORT.width && confirmMs > 0) {
      await new Promise((r) => setTimeout(r, confirmMs))
      const again = await measure()
      w = again.hash === w.hash ? again : { scroll: 0, hash: again.hash }
    }
    if (w.scroll > VIEWPORT.width) {
      const offenders = await page.evaluate((limit) => {
        const out = []
        for (const el of document.querySelectorAll('body *')) {
          const r = el.getBoundingClientRect()
          if (r.right > limit + 1 && r.width > 0 && getComputedStyle(el).position !== 'fixed') {
            out.push(`${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}.${String(el.className).split(' ').slice(0, 3).join('.')} (höger ${Math.round(r.right)})`)
            if (out.length >= 5) break
          }
        }
        return out
      }, VIEWPORT.width)
      if (!state.overflow.some((o) => o.hash === w.hash)) state.overflow.push({ where: `${where} ${w.hash}`, hash: w.hash, scrollWidth: w.scroll, offenders })
    }
  } catch {
    /* sidan byts just nu – nästa kontroll tar det */
  }
}

/**
 * Tabba igenom sidan från början och kontrollera att fokus inte fastnar (samma element tre tryck i
 * rad, eller en slinga som aldrig når `mustReach`, t.ex. huvudmenyn). Element som får fokus utan
 * synlig fokusmarkering (varken outline eller box-shadow) sparas som anteckning – det är en
 * tumregel, inget fel i sig. Returnerar listan över fokuserade element.
 */
export async function checkFocusFlow(page, state, where, { mustReach = null, max = 150 } = {}) {
  // Börja överst: ett tillfälligt element först i <body> får fokus, så att nästa tabb går till
  // sidans första fokuserbara element (en blur skulle lämna startpunkten där fokus var).
  await page.evaluate(() => {
    const start = document.createElement('span')
    start.tabIndex = -1
    start.dataset.e2eStart = ''
    document.body.prepend(start)
    start.focus()
    window.scrollTo(0, 0)
  })
  const order = []
  const invisible = new Set()
  let prev = null
  let same = 0
  let reached = mustReach === null
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab')
    const d = await page.evaluate(() => {
      const a = document.activeElement
      if (!a || a === document.body || a === document.documentElement) return null
      const label = (a.getAttribute('aria-label') || a.getAttribute('title') || a.textContent || a.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 50)
      // Markeringen kan ligga på elementet eller på ramen runt det (focus-within, t.ex. TextField).
      const hasMark = (el) => {
        const cs = getComputedStyle(el)
        return (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== 'none')
      }
      const marked = hasMark(a) || (a.parentElement !== null && (hasMark(a.parentElement) || (a.parentElement.parentElement !== null && hasMark(a.parentElement.parentElement))))
      return { key: `${a.tagName.toLowerCase()}:${label}`, nav: a.closest('nav')?.getAttribute('aria-label') ?? null, marked }
    })
    if (d === null) {
      // Förbi sista elementet (fokus i webbläsarens egen ram) – ett varv klart.
      if (order.length > 0) break
      continue
    }
    if (d.key === prev) {
      same++
      if (same >= 2) {
        state.focusTraps = state.focusTraps ?? []
        state.focusTraps.push(`${where}: fokus fastnar på ${d.key}`)
        break
      }
    } else same = 0
    prev = d.key
    if (!d.marked) invisible.add(d.key)
    if (mustReach !== null && d.nav === mustReach) reached = true
    // Samma element igen efter ett helt varv utan att ha nått målet: en fälla.
    if (order.includes(d.key) && order.length > 3 && order[0] === d.key) break
    order.push(d.key)
  }
  await page.evaluate(() => document.querySelector('[data-e2e-start]')?.remove()).catch(() => {})
  if (!reached) {
    state.focusTraps = state.focusTraps ?? []
    state.focusTraps.push(`${where}: tabb når aldrig ${mustReach} (${order.length} element: ${order.slice(-4).join(' → ')})`)
  }
  note(state, `${where}: ${order.length} element nås med tabb${reached && mustReach !== null ? ` (även ${mustReach})` : ''}`)
  if (invisible.size > 0) note(state, `${where}: fokus utan synlig markering (tumregel): ${[...invisible].slice(0, 6).join(', ')}`)
  return order
}

// ---------------------------------------------------------------------------
// Appen
// ---------------------------------------------------------------------------

/** Öppna appen på en hash-sökväg och vänta tills den har läst in butikerna (laddningsläget borta). */
export async function openApp(page, state, hash = '#/') {
  await page.goto(`${state.base}/${hash}`, { waitUntil: 'domcontentloaded' })
  await waitForApp(page)
}

/** Vänta tills appen visar en sida (en h1 i main eller välkomstflödet) och inget laddar. */
export async function waitForApp(page, timeout = 15000) {
  await page.waitForFunction(
    () => {
      const h1 = document.querySelector('h1')
      if (!h1) return false
      return !document.querySelector('main [aria-busy="true"]') || document.querySelector('form[aria-label="Kom igång med Lagom"]') !== null
    },
    null,
    { timeout },
  )
}

/**
 * Byt sida och vänta tills den NYA sidan visas. Routern visar den gamla sidan tills den nya sidans
 * koddel är hämtad, så en h1 räcker inte som tecken: den gamla sidans h1 märks först och
 * `action` (t.ex. ett klick i huvudmenyn) räknas som klar när en omärkt h1 finns och inget laddar.
 */
export async function navigateAndWait(page, action, timeout = 15000) {
  await page.evaluate(() => {
    for (const h of document.querySelectorAll('h1')) h.setAttribute('data-e2e-gammal', '')
  })
  await action()
  await page.waitForFunction(
    () => {
      const h = document.querySelector('main h1') ?? document.querySelector('h1')
      return h !== null && !h.hasAttribute('data-e2e-gammal') && !document.querySelector('main [aria-busy="true"]')
    },
    null,
    { timeout },
  )
}

/** Vänta tills sökvägen i hashen är `path` (utan sökparametrar). */
export async function waitForHash(page, path, timeout = 10000) {
  await page.waitForFunction(
    (p) => {
      const h = location.hash.replace(/^#/, '') || '/'
      return h.split('?')[0] === p
    },
    path,
    { timeout },
  )
}

export function currentPath(page) {
  const h = new URL(page.url()).hash.replace(/^#/, '') || '/'
  return h.split('?')[0]
}

/**
 * Skapa en profil genom det riktiga välkomstflödet, som en användare: Kom igång → mål → om dig →
 * vardagsaktivitet → (takt) → kost → sammanfattning → Börja använda Lagom. Landar på Idag – eller
 * på `landing` (t.ex. '/dela' när en delad länk öppnades före profilen). Står sidan redan i
 * välkomstflödet börjar det där.
 */
export async function onboard(page, state, opts = {}) {
  const o = { name: 'Testa', goal: 'Behålla min vikt', sex: 'Kvinna', birthYear: '1988', height: '168', weight: '66,5', activity: 'Lätt aktiv', landing: '/', ...opts }
  if (!/valkommen/.test(page.url())) await openApp(page, state, '#/valkommen')
  const step = async (heading) => {
    await page.getByRole('heading', { level: 1, name: heading }).waitFor()
    await checkOverflow(page, state, `välkomstflödet: ${heading}`)
  }
  await page.getByRole('button', { name: 'Kom igång' }).click()
  await step('Vad vill du med Lagom?')
  await chooseCard(page, o.goal)
  await page.getByRole('button', { name: 'Fortsätt' }).click()
  await step('Lite om dig')
  await page.getByLabel('Vad vill du att vi kallar dig?').fill(o.name)
  await page.getByRole('radio', { name: o.sex, exact: true }).click()
  await page.getByLabel('Födelseår').fill(o.birthYear)
  await page.getByLabel('Längd').fill(o.height)
  await page.getByLabel('Vikt idag').fill(o.weight)
  await page.getByRole('button', { name: 'Fortsätt' }).click()
  await step('Hur ser en vanlig dag ut?')
  await chooseCard(page, o.activity)
  await page.getByRole('button', { name: 'Fortsätt' }).click()
  // Takt (bara vid gå ner/upp) – standardtakten duger, målvikten fylls i om den efterfrågas.
  if (opts.targetWeight) {
    await step(/^I vilken takt/)
    await page.getByLabel('Målvikt').fill(opts.targetWeight)
    await page.getByRole('button', { name: 'Fortsätt' }).click()
  }
  // Kost: standardvalen.
  await step('Hur äter du?')
  await page.getByRole('button', { name: 'Fortsätt' }).click()
  // Sammanfattningen ("Välkommen, <namn>!").
  await step(/^Välkommen/)
  await navigateAndWait(page, () => page.getByRole('button', { name: 'Börja använda Lagom' }).click())
  await waitForHash(page, o.landing)
  await waitForApp(page)
}

/**
 * Tryck på ett valkort (ChoiceCard: en <label> runt en visuellt dold radioknapp) som en användare
 * gör, och kontrollera att radioknappen blev vald.
 */
export async function chooseCard(page, title) {
  const radio = page.getByRole('radio', { name: new RegExp(`^${title}`) })
  await page.locator('label').filter({ has: radio }).click()
  check(await radio.isChecked(), `valet "${title}" blev inte markerat`)
}

// ---------------------------------------------------------------------------
// IndexedDB och localStorage (läses från sidan, samma ursprung)
// ---------------------------------------------------------------------------

/** Alla nycklar och värden i keyval-store/keyval (värdena som de ligger – oftast JSON-strängar). */
export async function readIdb(page) {
  return page.evaluate(
    ({ db, store }) =>
      new Promise((ok, fail) => {
        const req = indexedDB.open(db)
        req.onerror = () => fail(req.error)
        req.onupgradeneeded = () => req.result.createObjectStore(store)
        req.onsuccess = () => {
          const d = req.result
          if (!d.objectStoreNames.contains(store)) {
            d.close()
            ok({})
            return
          }
          const tx = d.transaction(store, 'readonly')
          const os = tx.objectStore(store)
          const keys = os.getAllKeys()
          const values = os.getAll()
          tx.oncomplete = () => {
            const out = {}
            keys.result.forEach((k, i) => (out[String(k)] = values.result[i]))
            d.close()
            ok(out)
          }
          tx.onerror = () => fail(tx.error)
        }
      }),
    { db: IDB_NAME, store: IDB_STORE },
  )
}

/** Skriv nycklar i keyval-store/keyval (skapar databasen som idb-keyval gör). `null` tar bort nyckeln. */
export async function writeIdb(page, entries) {
  await page.evaluate(
    ({ db, store, entries }) =>
      new Promise((ok, fail) => {
        const req = indexedDB.open(db)
        req.onerror = () => fail(req.error)
        req.onupgradeneeded = () => req.result.createObjectStore(store)
        req.onsuccess = () => {
          const d = req.result
          const tx = d.transaction(store, 'readwrite')
          const os = tx.objectStore(store)
          for (const [k, v] of Object.entries(entries)) {
            if (v === null) os.delete(k)
            else os.put(v, k)
          }
          tx.oncomplete = () => {
            d.close()
            ok()
          }
          tx.onerror = () => fail(tx.error)
        }
      }),
    { db: IDB_NAME, store: IDB_STORE, entries },
  )
}

/** Fyll IndexedDB (och localStorage) innan appen har startat – från en tom sida på samma ursprung. */
export async function seedBeforeLoad(page, state, idb, local = {}) {
  await page.goto(`${state.base}${BLANK_PATH}`)
  await writeIdb(page, idb)
  if (Object.keys(local).length > 0) {
    await page.evaluate((l) => {
      for (const [k, v] of Object.entries(l)) localStorage.setItem(k, v)
    }, local)
  }
}

export async function readLocalStorage(page) {
  return page.evaluate(() => {
    const out = {}
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k !== null) out[k] = localStorage.getItem(k)
    }
    return out
  })
}

/** Dagboken ur IndexedDB (version 1 eller månader, ihopsatt) – null om ingen finns eller den inte går att tolka. */
export function diaryFromIdb(all) {
  const main = all['lagom-diary']
  if (typeof main !== 'string') return null
  let parsed
  try {
    parsed = JSON.parse(main)
  } catch {
    return null
  }
  if (parsed?.state?.format === 'manader') {
    const out = { entries: {}, water: {}, exercise: {}, days: {} }
    for (const [k, v] of Object.entries(all)) {
      if (!k.startsWith('lagom-diary:')) continue
      const m = JSON.parse(v)
      for (const map of Object.keys(out)) Object.assign(out[map], m[map] ?? {})
    }
    return out
  }
  return parsed?.state ?? null
}

/** Alla poster i dagboken (platt lista). */
export function allEntries(diary) {
  return diary ? Object.values(diary.entries ?? {}).flat() : []
}

/** Dagens datum i Europe/Stockholm som 'YYYY-MM-DD' (samma som appens todayISO i den tidszonen). */
export function todayStockholm(date = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

/** Appens egen fellogg (`lagom-error-log` i localStorage). */
export async function readErrorLog(page) {
  try {
    return await page.evaluate(() => {
      try {
        const raw = localStorage.getItem('lagom-error-log')
        return raw ? JSON.parse(raw) : []
      } catch {
        return []
      }
    })
  } catch {
    return []
  }
}

/** Skicka visibilitychange som när fliken göms eller visas (Chromium byter inte själv i huvudlöst läge). */
export async function setVisibility(page, visible) {
  await page.evaluate((v) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (v ? 'visible' : 'hidden') })
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => !v })
    document.dispatchEvent(new Event('visibilitychange'))
  }, visible)
}

// ---------------------------------------------------------------------------
// Körning
// ---------------------------------------------------------------------------

function newState(name, base) {
  return {
    name,
    base,
    consoleErrors: [],
    consoleWarnings: [],
    pageErrors: [],
    /** Webbläsarens egna dialoger (alert, confirm, prompt, beforeunload). */
    browserDialogs: [],
    failedRequests: [],
    external: [],
    overflow: [],
    errorLog: [],
    notes: [],
    /** Konsolfel som resan väntar sig (reguljära uttryck). */
    allowConsole: [],
    /** Poster i appens fellogg som resan väntar sig (reguljära uttryck) – övriga skrivs ut som fynd. */
    allowErrorLog: [],
    watched: new WeakSet(),
    externalHandlers: [],
    pages: [],
  }
}

/**
 * Tidtagning av en resas steg: `lap('steg')` antecknar steg som tog längre än `slowMs` sedan förra
 * varvet – så att en seg start (t.ex. offline) syns även när resan lyckas.
 */
export function stopwatch(state, slowMs = 3000) {
  let last = Date.now()
  return (label) => {
    const now = Date.now()
    if (now - last > slowMs) note(state, `långsamt steg: ${label} tog ${((now - last) / 1000).toFixed(1)} s`)
    last = now
  }
}

/** Anteckning som skrivs ut under resan (t.ex. vad som mättes). */
export function note(state, text) {
  state.notes.push(text)
}

/**
 * Kör resorna. Varje resa är `{ name, title, run: async ({ browser, state, base, newContext, newPage }) => … }`.
 * `newPage()` ger en sida i resans egen, nya kontext (samma kontext vid flera anrop, om inte
 * `{ fresh: true }`). Returnerar true när alla lyckades (och sätter process.exitCode = 1 annars).
 */
export async function runJourneys(journeys, args) {
  if (args.list) {
    for (const j of journeys) console.log(`${j.name.padEnd(18)} ${j.title}`)
    return true
  }
  const selected = args.only ? journeys.filter((j) => args.only.includes(j.name)) : journeys
  if (args.only) {
    const unknown = args.only.filter((n) => !journeys.some((j) => j.name === n))
    if (unknown.length > 0) throw new Error(`Okänd resa: ${unknown.join(', ')} (finns: ${journeys.map((j) => j.name).join(', ')})`)
  }
  mkdirSync(SHOT_DIR, { recursive: true })
  const server = await startServer(args.dist, { port: args.port, csp: args.csp })
  const browser = await launchBrowser({ headed: args.headed, slow: args.slow, shell: args.shell })
  console.log(`Lagom e2e – ${args.dist} på ${server.base} (Chromium ${browser.version()})\n`)
  const results = []
  try {
    for (const j of selected) {
      const state = newState(j.name, server.base)
      const contexts = []
      let mainContext = null
      const newContext = async (opts = {}) => {
        const c = await newAppContext(browser, state, server.base, opts)
        contexts.push(c)
        return c
      }
      const newPage = async (opts = {}) => {
        if (opts.fresh || !mainContext) {
          const c = await newContext(opts)
          if (!mainContext) mainContext = c
          const p = await c.newPage()
          watchPage(p, state)
          state.pages.push(p)
          return p
        }
        const p = await mainContext.newPage()
        watchPage(p, state)
        state.pages.push(p)
        return p
      }
      const started = Date.now()
      let error = null
      process.stdout.write(`▶ ${j.name} – ${j.title}\n`)
      try {
        await j.run({ browser, state, base: server.base, newContext, newPage })
      } catch (e) {
        error = e
      }
      // Appens egen fellogg, felsidan och vågrät scroll på de sidor som fortfarande är öppna.
      const errorPages = []
      for (const p of state.pages) {
        if (p.isClosed()) continue
        const errorTitle = p.locator('#route-error-title')
        const title = (await errorTitle.count().catch(() => 0)) > 0 ? await errorTitle.first().textContent().catch(() => '?') : null
        if (title) errorPages.push(`${currentPath(p)}: ${title}`)
        await checkOverflow(p, state, 'slut')
        const log = await readErrorLog(p)
        for (const entry of log) {
          const text = JSON.stringify(entry).slice(0, 400)
          if (!state.errorLog.includes(text)) state.errorLog.push(text)
        }
      }
      const allowed = (t) => state.allowConsole.some((re) => re.test(t))
      const unexpectedConsole = state.consoleErrors.filter((c) => !allowed(c.text))
      const problems = []
      if (error) problems.push(error instanceof JourneyFailure ? error.message : `${error.name ?? 'Fel'}: ${String(error.message ?? error).split('\n').slice(0, 6).join('\n    ')}`)
      if (unexpectedConsole.length > 0) problems.push(`oväntade konsolfel: ${unexpectedConsole.map((c) => `[${c.at}] ${c.text}`).join(' | ')}`)
      if (errorPages.length > 0) problems.push(`appens felsida visas: ${errorPages.join(' | ')}`)
      if (state.pageErrors.length > 0) problems.push(`sidfel: ${state.pageErrors.map((c) => `[${c.at}] ${c.text}`).join(' | ')}`)
      if (state.browserDialogs.length > 0) problems.push(`webbläsarens egen dialog: ${state.browserDialogs.map((d) => `[${d.at}] ${d.type}${d.text ? ` "${d.text}"` : ''}`).join(' | ')}`)
      if (state.focusTraps?.length > 0) problems.push(`fokusfälla: ${state.focusTraps.join(' | ')}`)
      if (state.overflow.length > 0) problems.push(`vågrät scroll vid 390 px: ${state.overflow.map((o) => `${o.where} (${o.scrollWidth} px: ${o.offenders.join(', ')})`).join(' | ')}`)
      const pass = problems.length === 0
      if (!pass) {
        const shotPage = [...state.pages].reverse().find((p) => !p.isClosed())
        if (shotPage) {
          try {
            await shotPage.screenshot({ path: join(SHOT_DIR, `${j.name}.png`), fullPage: true })
          } catch {
            /* sidan stängd */
          }
        }
      }
      for (const c of contexts) await c.close().catch(() => {})
      const ms = Date.now() - started
      results.push({ name: j.name, pass, problems, ms, state })
      console.log(`${pass ? '  PASS' : '  FAIL'} ${j.name} (${(ms / 1000).toFixed(1)} s)`)
      for (const p of problems) console.log(`    ✗ ${p}`)
      for (const n of state.notes) console.log(`    · ${n}`)
      const expectedLog = state.errorLog.filter((t) => state.allowErrorLog.some((re) => re.test(t)))
      const unexpectedLog = state.errorLog.filter((t) => !expectedLog.includes(t))
      if (expectedLog.length > 0) console.log(`    · appens fellogg: ${expectedLog.length} väntade poster`)
      if (unexpectedLog.length > 0) console.log(`    · appens fellogg (oväntat – granska): ${unexpectedLog.join(' | ')}`)
      if (state.failedRequests.length > 0) console.log(`    · misslyckade anrop: ${state.failedRequests.map((f) => `${f.url} (${f.reason})`).join(', ')}`)
      if (state.external.length > 0) console.log(`    · stoppade externa anrop: ${[...new Set(state.external)].slice(0, 5).join(', ')}`)
      if (state.consoleWarnings.length > 0) console.log(`    · konsolvarningar: ${state.consoleWarnings.slice(0, 3).map((c) => c.text.slice(0, 160)).join(' | ')}`)
      if (!pass) console.log(`    skärmdump: ${join(SHOT_DIR, `${j.name}.png`)}`)
    }
  } finally {
    await browser.close().catch(() => {})
    await server.close()
  }
  const failed = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} resor lyckades${failed.length ? ` – misslyckades: ${failed.map((r) => r.name).join(', ')}` : ''}`)
  if (failed.length > 0) process.exitCode = 1
  return failed.length === 0
}
