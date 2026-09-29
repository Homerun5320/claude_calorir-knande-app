#!/usr/bin/env node
/**
 * Mäter dagbokens lagring i Chromium – underlaget till docs/LAGRING.md.
 *
 *   node scripts/measure-diary-storage.mjs [--data=<mapp>] [--years=1,2,3] [--rates=1,4,6] [--runs=5] [--json=<fil>] [--fresh]
 *
 * 1. Dagböckerna (1, 2 och 3 års daglig användning) byggs av src/stores/diaryStorage.bench.test.ts
 *    med appens riktiga typer och butik. Saknas de i `--data` (standard: <tmp>/lagom-lagring), eller
 *    med `--fresh`, körs testet först:
 *      LAGOM_MEASURE_STORAGE=1 LAGOM_MEASURE_OUT=<mapp> npx vitest run src/stores/diaryStorage.bench.test.ts
 * 2. Butikens riktiga kod (src/stores/diaryStore.ts och storage.ts med zustand och idb-keyval)
 *    byggs med Vite till en liten sida som serveras från 127.0.0.1 (en säker kontext). Chromium
 *    startas med en beständig profil, så att IndexedDB ligger på disk – Playwrights vanliga
 *    kontext är ett inkognitoläge där IndexedDB bara finns i minnet.
 * 3. För varje dagbok och CPU-strypning (CDP `Emulation.setCPUThrottlingRate`; 4 motsvarar
 *    DevTools "mellanklassmobil" och 6 "enklare mobil") mäts medianen av `--runs` körningar:
 *    - JSON.parse/JSON.stringify av hela dagboken,
 *    - IndexedDB direkt (idb-keyval set/get av hela strängen),
 *    - start: `useDiaryStore.persist.rehydrate()` (läsa + tolka + lägga in i butiken),
 *    - en loggning genom butiken: `setState` → persist → JSON.stringify → IndexedDB. "Blockerar" är
 *      tiden tills huvudtråden är fri igen (en MessageChannel-uppgift hinner köra), "klart" när
 *      IndexedDB har bekräftat skrivningen,
 *    - ett tryck på vattenknappen (`addWater`),
 *    - samma skrivning om bara den aktuella månaden sparades (förslaget i LAGRING.md),
 *    - speglingen i apparna (JSON.stringify av säkerhetskopian, plus Capacitors Android-brygga som
 *      skickar anropet som JSON) och säkerhetskopian (JSON.stringify med indrag 1).
 *    Utan strypning mäts även minnet (JS-heap efter skräpsamling) och `navigator.storage.estimate()`.
 *
 * Strypningen gäller sidans huvudtråd. Själva diskskrivningen i IndexedDB sker i webbläsarens egen
 * process och stryps inte – "klart" är därför en undre gräns för en telefon. Resultaten skrivs som
 * tabeller (och med `--json` som JSON). Skriptet ändrar inget i repot.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { cpus, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadChromium } from './generate-icons.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TEST_FILE = 'src/stores/diaryStorage.bench.test.ts'
const DATA_FILE = /^\/data\/((?:diary|month|backup)-\d+y|samples)\.json$/

export function parseArgs(argv) {
  const args = { data: join(tmpdir(), 'lagom-lagring'), years: [1, 2, 3], rates: [1, 4, 6], runs: 5, json: null, fresh: false, help: false }
  const list = (v) => v.split(',').map((x) => Number(x.trim())).filter((n) => Number.isFinite(n) && n > 0)
  for (const a of argv) {
    if (a === '--help' || a === '-h') args.help = true
    else if (a === '--fresh') args.fresh = true
    else if (a.startsWith('--data=')) args.data = resolve(a.slice(7))
    else if (a.startsWith('--years=')) args.years = list(a.slice(8))
    else if (a.startsWith('--rates=')) args.rates = list(a.slice(8))
    else if (a.startsWith('--runs=')) args.runs = Math.max(1, Math.round(Number(a.slice(7))) || 5)
    else if (a.startsWith('--json=')) args.json = resolve(a.slice(7))
    else throw new Error(`Okänt argument: ${a} (se --help)`)
  }
  return args
}

/** Bygg dagböckerna med testfilen om de saknas. */
function ensureData(dir, years, fresh) {
  const needed = ['samples.json', ...years.flatMap((y) => [`diary-${y}y.json`, `month-${y}y.json`, `backup-${y}y.json`])]
  if (!fresh && needed.every((f) => existsSync(join(dir, f)))) return
  mkdirSync(dir, { recursive: true })
  console.log(`Bygger dagböckerna i ${dir} …`)
  const res = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vitest', 'run', TEST_FILE, '--silent=false'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, LAGOM_MEASURE_STORAGE: '1', LAGOM_MEASURE_OUT: dir },
  })
  if (res.status !== 0) throw new Error('Kunde inte bygga dagböckerna (se testets utskrift ovan).')
  const missing = needed.filter((f) => !existsSync(join(dir, f)))
  if (missing.length) throw new Error(`Saknas efter bygget: ${missing.join(', ')}`)
}

/** Butikens riktiga kod som en ES-modul för sidan (Vite, produktionsläge, utan projektets config). */
async function bundleStore(dir) {
  const entry = join(dir, 'bench-entry.js')
  const abs = (p) => JSON.stringify(join(ROOT, p).replaceAll('\\', '/'))
  writeFileSync(
    entry,
    [
      `import { useDiaryStore } from ${abs('src/stores/diaryStore.ts')}`,
      `import { isMemoryOnlyStorage } from ${abs('src/stores/storage.ts')}`,
      `import { clear, del, get, set } from ${abs('node_modules/idb-keyval/dist/index.js')}`,
      'window.lagom = { useDiaryStore, isMemoryOnlyStorage, clear, del, get, set }',
      '',
    ].join('\n'),
  )
  const { build } = await import('vite')
  const out = await build({
    configFile: false,
    root: ROOT,
    logLevel: 'error',
    publicDir: false,
    mode: 'production',
    define: { 'process.env.NODE_ENV': '"production"' },
    build: { write: false, minify: true, lib: { entry, formats: ['es'], fileName: 'bench' } },
  })
  const outputs = (Array.isArray(out) ? out : [out]).flatMap((o) => o.output ?? [])
  const chunk = outputs.find((c) => c.type === 'chunk' && c.isEntry)
  if (!chunk) throw new Error('Vite gav ingen modul för mätsidan.')
  return chunk.code
}

function startServer(dataDir, bundle) {
  const html = '<!doctype html><html lang="sv"><meta charset="utf-8"><title>Lagom – lagringsmätning</title><script type="module" src="/bench.js"></script></html>'
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const send = (status, type, body) => {
      res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' })
      res.end(body)
    }
    if (url.pathname === '/') return send(200, 'text/html; charset=utf-8', html)
    if (url.pathname === '/bench.js') return send(200, 'text/javascript; charset=utf-8', bundle)
    if (DATA_FILE.test(url.pathname)) {
      const file = join(dataDir, url.pathname.slice('/data/'.length))
      if (existsSync(file)) return send(200, 'application/json; charset=utf-8', readFileSync(file))
    }
    send(404, 'text/plain; charset=utf-8', 'Finns inte')
  })
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)))
}

function dirSize(path) {
  if (!existsSync(path)) return 0
  const st = statSync(path)
  if (!st.isDirectory()) return st.size
  return readdirSync(path).reduce((s, f) => s + dirSize(join(path, f)), 0)
}

// ---------------------------------------------------------------------------
// Koden som körs i sidan (Playwright serialiserar funktionerna)
// ---------------------------------------------------------------------------

async function loadData(page, years) {
  await page.evaluate(async (y) => {
    const text = async (name) => (await fetch(`/data/${name}`)).text()
    window.__diary = await text(`diary-${y}y.json`)
    window.__month = await text(`month-${y}y.json`)
    window.__backup = await text(`backup-${y}y.json`)
    window.__samples = JSON.parse(await text('samples.json'))
  }, years)
}

async function measureInPage(page, runs) {
  return page.evaluate(async (runs) => {
    const L = window.lagom
    const store = L.useDiaryStore
    const { today, entries: samples } = window.__samples
    const med = (a) => {
      const s = [...a].sort((x, y) => x - y)
      const m = Math.floor(s.length / 2)
      return Math.round((s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) * 10) / 10
    }
    const times = (fn, n = runs) => {
      const out = []
      for (let i = 0; i < n; i++) {
        const t0 = performance.now()
        fn()
        out.push(performance.now() - t0)
      }
      return med(out)
    }
    const timesAsync = async (fn, n = runs) => {
      const out = []
      for (let i = 0; i < n; i++) {
        const t0 = performance.now()
        await fn()
        out.push(performance.now() - t0)
      }
      return med(out)
    }
    /** Väntar tills huvudtråden är fri (alla mikrouppgifter, t.ex. IndexedDB-anropet, har körts). */
    const tick = () =>
      new Promise((r) => {
        const ch = new MessageChannel()
        ch.port1.onmessage = () => r()
        ch.port2.postMessage(0)
      })

    const text = window.__diary
    const res = {}
    const obj = JSON.parse(text)
    res.parse = times(() => JSON.parse(text))
    res.stringify = times(() => JSON.stringify(obj))

    res.idbPut = await timesAsync(() => L.set('bench-raw', text))
    res.idbGet = await timesAsync(() => L.get('bench-raw'))
    await L.del('bench-raw')

    // Start: dagboken ligger i IndexedDB och läses in genom butiken.
    await L.set('lagom-diary', text)
    res.hydrate = await timesAsync(() => store.persist.rehydrate())

    // En loggning genom butiken (setState returnerar skrivningens löfte från persist).
    const sync = []
    const blocked = []
    const done = []
    for (let i = 0; i < runs; i++) {
      const cur = store.getState().entries
      const t0 = performance.now()
      const p = store.setState({ entries: { ...cur, [today]: [...(cur[today] ?? []), samples[i % samples.length]] } })
      sync.push(performance.now() - t0)
      await tick()
      blocked.push(performance.now() - t0)
      await p
      done.push(performance.now() - t0)
    }
    res.writeSync = med(sync)
    res.writeBlocked = med(blocked)
    res.writeBlockedMax = Math.round(Math.max(...blocked) * 10) / 10
    res.writeDone = med(done)
    res.memoryOnly = L.isMemoryOnlyStorage()

    // Ett tryck på vattenknappen.
    const water = []
    for (let i = 0; i < runs; i++) {
      const t0 = performance.now()
      store.getState().addWater(today, 250)
      await tick()
      water.push(performance.now() - t0)
      await L.get('bench-none') // vänta tills skrivningen är klar (samma objektlager, i ordning)
    }
    res.waterBlocked = med(water)

    // Samma skrivning om bara den aktuella månaden sparades.
    const monthObj = JSON.parse(window.__month)
    const mSync = []
    const mDone = []
    for (let i = 0; i < runs; i++) {
      const t0 = performance.now()
      const s = JSON.stringify(monthObj)
      mSync.push(performance.now() - t0)
      await L.set('bench-month', s)
      mDone.push(performance.now() - t0)
    }
    res.monthSync = med(mSync)
    res.monthDone = med(mDone)
    await L.del('bench-month')

    // Speglingen (lagom-spegling.json) och säkerhetskopian.
    const backupText = window.__backup
    const backupObj = JSON.parse(backupText)
    res.mirror = times(() => JSON.stringify(backupObj))
    res.bridge = times(() =>
      JSON.stringify({ callbackId: '12345678', pluginId: 'Filesystem', methodName: 'writeFile', options: { path: 'lagom-spegling.tmp', data: backupText, directory: 'DATA', encoding: 'utf8', recursive: true } }),
    )
    res.export = times(() => JSON.stringify(backupObj, null, 1))
    res.backupParse = times(() => JSON.parse(backupText))

    // Städa: ta bort mätposterna och vattnet igen.
    const { [today]: _e, ...entries } = store.getState().entries
    const { [today]: _w, ...waterByDay } = store.getState().water
    await store.setState({ entries, water: waterByDay })
    return res
  }, runs)
}

// ---------------------------------------------------------------------------
// Utskrift
// ---------------------------------------------------------------------------

const ms = (n) => (n >= 100 ? String(Math.round(n)) : n.toFixed(1)).replace('.', ',')
const mbText = (bytes) => (bytes / 1024 / 1024).toFixed(1).replace('.', ',')

function printTables(results, node, rates) {
  console.log('\n## Storlek (från testet)\n')
  console.log('| Dagbok | Poster | JSON (UTF-8) | gzip | Månad | Spegling | Export (indrag 1) |')
  console.log('|---|---:|---:|---:|---:|---:|---:|')
  for (const n of node) {
    console.log(`| ${n.years} år | ${n.entries} | ${mbText(n.diary.utf8)} MB | ${mbText(n.diary.gzip)} MB | ${Math.round(n.month.utf8 / 1024)} kB | ${mbText(n.backup.compactUtf8)} MB | ${mbText(n.backup.exportUtf8)} MB |`)
  }
  for (const rate of rates) {
    console.log(`\n## Chromium, CPU-strypning ${rate}× (median, ms)\n`)
    console.log('| Dagbok | parse | stringify | IDB put | IDB get | Start (rehydrate) | Loggning: blockerar | (längsta) | Loggning: klart | Vatten: blockerar | Månad: stringify | Månad: klart | Spegling | + Android-brygga | Export |')
    console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|')
    for (const r of results.filter((x) => x.rate === rate)) {
      const m = r.m
      console.log(
        `| ${r.years} år | ${ms(m.parse)} | ${ms(m.stringify)} | ${ms(m.idbPut)} | ${ms(m.idbGet)} | ${ms(m.hydrate)} | ${ms(m.writeBlocked)} | ${ms(m.writeBlockedMax)} | ${ms(m.writeDone)} | ${ms(m.waterBlocked)} | ${ms(m.monthSync)} | ${ms(m.monthDone)} | ${ms(m.mirror)} | ${ms(m.bridge)} | ${ms(m.export)} |`,
      )
    }
  }
}

// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log('Användning: node scripts/measure-diary-storage.mjs [--data=<mapp>] [--years=1,2,3] [--rates=1,4,6] [--runs=5] [--json=<fil>] [--fresh]')
    return
  }
  ensureData(args.data, args.years, args.fresh)
  const node = JSON.parse(readFileSync(join(args.data, 'node-results.json'), 'utf8')).filter((n) => args.years.includes(n.years))

  const chromium = await loadChromium()
  if (!chromium) {
    console.error('Kunde inte hitta Playwright. Installera med "npm i -g playwright && npx playwright install chromium" och kör igen.')
    process.exitCode = 1
    return
  }
  const bundle = await bundleStore(args.data)
  const server = await startServer(args.data, bundle)
  const port = server.address().port
  const base = `http://127.0.0.1:${port}/`
  const profile = join(args.data, 'chromium-profil')
  rmSync(profile, { recursive: true, force: true })
  const context = await chromium.launchPersistentContext(profile, { headless: true })
  const results = []
  const memory = []
  try {
    const page = context.pages()[0] ?? (await context.newPage())
    page.setDefaultTimeout(600_000)
    const cdp = await context.newCDPSession(page)
    const userAgent = await page.evaluate(() => navigator.userAgent).catch(() => '')
    console.log(`Chromium: ${userAgent}\nCPU: ${cpus()[0]?.model ?? 'okänd'} (${cpus().length} kärnor), Node ${process.version}`)

    const open = async () => {
      await page.goto(base)
      await page.waitForFunction(() => typeof window.lagom === 'object')
      await page.evaluate(async () => {
        await window.lagom.clear()
      })
    }
    const heap = async () => {
      await cdp.send('HeapProfiler.collectGarbage')
      await cdp.send('HeapProfiler.collectGarbage')
      return (await cdp.send('Runtime.getHeapUsage')).usedSize
    }

    for (const years of args.years) {
      // Minne och lagringsutrymme (utan strypning): tom butik → inläst dagbok → efter en skrivning.
      await open()
      await page.reload()
      await page.waitForFunction(() => typeof window.lagom === 'object')
      const empty = await heap()
      await page.evaluate(async (y) => {
        const text = await (await fetch(`/data/diary-${y}y.json`)).text()
        await window.lagom.set('lagom-diary', text)
      }, years)
      await page.evaluate(() => window.lagom.useDiaryStore.persist.rehydrate())
      const loaded = await heap()
      const estimate = await page.evaluate(async () => {
        const e = await navigator.storage.estimate()
        return { usage: e.usage ?? 0, indexedDB: e.usageDetails?.indexedDB ?? null }
      })
      await page.evaluate(async () => {
        const s = window.lagom.useDiaryStore
        await s.setState({ water: { ...s.getState().water, '2026-09-29': 250 } })
      })
      const written = await heap()
      const onDisk = dirSize(join(profile, 'Default', 'IndexedDB'))
      memory.push({ years, stateBytes: loaded - empty, afterWriteBytes: written - loaded, estimate, onDisk })
      console.log(
        `${years} år: JS-heap +${mbText(loaded - empty)} MB efter inläsning, +${mbText(written - loaded)} MB till efter en skrivning; ` +
          `storage.estimate ${mbText(estimate.usage)} MB, IndexedDB-mappen ${mbText(onDisk)} MB`,
      )

      await open()
      await loadData(page, years)
      for (const rate of args.rates) {
        await cdp.send('Emulation.setCPUThrottlingRate', { rate })
        const t0 = Date.now()
        const m = await measureInPage(page, args.runs)
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
        if (m.memoryOnly) console.warn(`Varning: ${years} år ${rate}× – lagringen gick över till minnesläge, tiderna gäller inte IndexedDB.`)
        results.push({ years, rate, m })
        console.log(`${years} år, ${rate}×: klart på ${Math.round((Date.now() - t0) / 1000)} s`)
      }
    }
  } finally {
    await context.close()
    server.close()
  }

  printTables(results, node, args.rates)
  if (args.json) {
    writeFileSync(args.json, JSON.stringify({ measuredAt: new Date().toISOString(), cpu: cpus()[0]?.model ?? null, node, memory, results }, null, 2))
    console.log(`\nResultaten sparades i ${args.json}`)
  }
}

// Kör bara när filen startas direkt (så att funktionerna kan importeras i tester).
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
}
