#!/usr/bin/env node
/**
 * Mäter dagbokens lagring i Chromium – underlaget till docs/LAGRING.md.
 *
 *   node scripts/measure-diary-storage.mjs [--data=<mapp>] [--years=1,2,3] [--rates=1,4,6] [--runs=5] [--json=<fil>] [--fresh] [--before=<git-ref>]
 *
 * 1. Dagböckerna (1, 2 och 3 års daglig användning) byggs av src/stores/diaryStorage.bench.test.ts
 *    med appens riktiga typer och butik. Saknas de i `--data` (standard: <tmp>/lagom-lagring), eller
 *    med `--fresh`, körs testet först:
 *      LAGOM_MEASURE_STORAGE=1 LAGOM_MEASURE_OUT=<mapp> npx vitest run src/stores/diaryStorage.bench.test.ts
 * 2. Butikens riktiga kod (src/stores/diaryStore.ts, diaryMonthStorage.ts och storage.ts med zustand
 *    och idb-keyval) byggs med Vite till en liten sida som serveras från 127.0.0.1 (en säker
 *    kontext). Chromium startas med en beständig profil, så att IndexedDB ligger på disk –
 *    Playwrights vanliga kontext är ett inkognitoläge där IndexedDB bara finns i minnet.
 * 3. För varje dagbok och CPU-strypning (CDP `Emulation.setCPUThrottlingRate`; 4 motsvarar
 *    DevTools "mellanklassmobil" och 6 "enklare mobil") mäts medianen av `--runs` körningar:
 *    - JSON.parse/JSON.stringify av hela dagboken,
 *    - IndexedDB direkt (idb-keyval set/get av hela strängen),
 *    - start: `useDiaryStore.persist.rehydrate()` (läsa + tolka + lägga in i butiken),
 *    - en loggning genom butiken: `setState` → persist → JSON.stringify → IndexedDB. "Blockerar" är
 *      tiden tills huvudtråden är fri igen (en MessageChannel-uppgift hinner köra), "klart" när
 *      IndexedDB har bekräftat skrivningen,
 *    - ett tryck på vattenknappen (`addWater`),
 *    - samma skrivning om bara den aktuella månaden sparades (en sträng, utan butiken),
 *    - speglingen i apparna (JSON.stringify av säkerhetskopian, plus Capacitors Android-brygga som
 *      skickar anropet som JSON) och säkerhetskopian (JSON.stringify med indrag 1).
 *    Allt detta med dagbokens lagring som appen byggs i dag (månadsskrivaren av, version 1).
 * 4. Månadsskrivaren (version 2 i diaryMonthStorage.ts, påslagen med `setDiaryMonthWriteForTests`
 *    bara på mätsidan): bytet från version 1 (alla månader, kontrollen i minnet och kopian
 *    `lagom-diary-v1`, varje körning från den gamla strängen), start med månaderna i IndexedDB,
 *    en loggning och ett tryck på vattenknappen. "Längsta uppgift" är den längsta uppgiften på
 *    huvudtråden under bytet (PerformanceObserver `longtask`, bara uppgifter över 50 ms).
 * 5. Med `--before=<git-ref>` byggs även dagbokens butik och lagring från den versionen (`git show`,
 *    t.ex. före dagbokens egen lagring) och mäts på en egen sida med samma start, loggning och
 *    vattenknapp – för att jämföra version 1 före och efter en ändring på samma maskin. Sidorna
 *    mäts i samma läge (direkt efter att sidan öppnats) och i växlande ordning.
 * 6. Utan strypning, i en egen tom profil per dagbok (så att diskstorleken blir ren), mäts även
 *    minnet (JS-heap efter skräpsamling), `navigator.storage.estimate()` och IndexedDB-mappen –
 *    före och efter bytet till månader.
 *
 * Strypningen gäller sidans huvudtråd. Själva diskskrivningen i IndexedDB sker i webbläsarens egen
 * process och stryps inte – "klart" är därför en undre gräns för en telefon. Resultaten skrivs som
 * tabeller (och med `--json` som JSON). Skriptet ändrar inget i repot.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { cpus, tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadChromium } from './generate-icons.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TEST_FILE = 'src/stores/diaryStorage.bench.test.ts'
const DATA_FILE = /^\/data\/((?:diary|month|backup)-\d+y|samples)\.json$/
/** Filerna som byggs från `--before` (resten av importerna tas från arbetskopian). */
const BEFORE_FILES = ['src/stores/diaryStore.ts', 'src/stores/storage.ts', 'src/stores/diaryMonthStorage.ts']

export function parseArgs(argv) {
  const args = { data: join(tmpdir(), 'lagom-lagring'), years: [1, 2, 3], rates: [1, 4, 6], runs: 5, json: null, fresh: false, before: null, help: false }
  const list = (v) => v.split(',').map((x) => Number(x.trim())).filter((n) => Number.isFinite(n) && n > 0)
  for (const a of argv) {
    if (a === '--help' || a === '-h') args.help = true
    else if (a === '--fresh') args.fresh = true
    else if (a.startsWith('--data=')) args.data = resolve(a.slice(7))
    else if (a.startsWith('--years=')) args.years = list(a.slice(8))
    else if (a.startsWith('--rates=')) args.rates = list(a.slice(8))
    else if (a.startsWith('--runs=')) args.runs = Math.max(1, Math.round(Number(a.slice(7))) || 5)
    else if (a.startsWith('--json=')) args.json = resolve(a.slice(7))
    else if (a.startsWith('--before=')) args.before = a.slice(9).trim() || null
    else throw new Error(`Okänt argument: ${a} (se --help)`)
  }
  return args
}

/** Bygg dagböckerna med testfilen om de saknas. */
function ensureData(dir, years, fresh) {
  const needed = ['samples.json', 'node-results.json', ...years.flatMap((y) => [`diary-${y}y.json`, `month-${y}y.json`, `backup-${y}y.json`])]
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

const abs = (p) => JSON.stringify(p.replaceAll('\\', '/'))

/** En ES-modul för sidan (Vite, produktionsläge, utan projektets config). */
async function bundle(dir, name, lines, plugins = []) {
  const entry = join(dir, `${name}-entry.js`)
  writeFileSync(entry, [...lines, ''].join('\n'))
  const { build } = await import('vite')
  const out = await build({
    configFile: false,
    root: ROOT,
    logLevel: 'error',
    publicDir: false,
    mode: 'production',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins,
    build: { write: false, minify: true, lib: { entry, formats: ['es'], fileName: name } },
  })
  const outputs = (Array.isArray(out) ? out : [out]).flatMap((o) => o.output ?? [])
  const chunk = outputs.find((c) => c.type === 'chunk' && c.isEntry)
  if (!chunk) throw new Error('Vite gav ingen modul för mätsidan.')
  return chunk.code
}

/** Butikens riktiga kod, med månadsskrivarens reglage för mätningen. */
function bundleStore(dir) {
  const src = (p) => abs(join(ROOT, p))
  return bundle(dir, 'bench', [
    `import { useDiaryStore } from ${src('src/stores/diaryStore.ts')}`,
    `import { isMemoryOnlyStorage } from ${src('src/stores/storage.ts')}`,
    `import { lastDiaryWrite, readDiarySnapshot, setDiaryMonthWriteForTests } from ${src('src/stores/diaryMonthStorage.ts')}`,
    `import { clear, del, get, set } from ${src('node_modules/idb-keyval/dist/index.js')}`,
    'window.lagom = { useDiaryStore, isMemoryOnlyStorage, clear, del, get, set, setDiaryMonthWrite: setDiaryMonthWriteForTests, lastDiaryWrite, readDiarySnapshot }',
  ])
}

/**
 * Dagbokens butik och lagring från `ref` (git). Filerna läggs i `<data>/fore/` och allt de
 * importerar som inte finns där (typer, zustand, idb-keyval …) tas från arbetskopian.
 */
async function bundleBefore(dir, ref) {
  const fore = join(dir, 'fore')
  rmSync(fore, { recursive: true, force: true })
  for (const file of BEFORE_FILES) {
    const res = spawnSync('git', ['show', `${ref}:${file}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
    if (res.status !== 0) {
      if (file === 'src/stores/diaryMonthStorage.ts') continue // fanns inte före dagbokens egen lagring
      throw new Error(`Kunde inte läsa ${file} i ${ref}: ${res.stderr.trim()}`)
    }
    const target = join(fore, relative('src', file))
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, res.stdout)
  }
  const isFile = (p) => existsSync(p) && statSync(p).isFile()
  const plugin = {
    name: 'lagom-matning-fore',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer || !importer.startsWith(fore + '/')) return null
      if (source.startsWith('.')) {
        const local = resolve(dirname(importer), source)
        if (['', '.ts', '.tsx', '.js'].some((ext) => isFile(local + ext))) return null
      }
      // Som om filen låg på sin plats i arbetskopian.
      const mirrored = join(ROOT, 'src', relative(fore, importer))
      return this.resolve(source, mirrored, { ...options, skipSelf: true })
    },
  }
  return bundle(
    dir,
    'fore',
    [
      `import { useDiaryStore } from ${abs(join(fore, 'stores', 'diaryStore.ts'))}`,
      `import { isMemoryOnlyStorage } from ${abs(join(fore, 'stores', 'storage.ts'))}`,
      `import { clear, del, get, set } from ${abs(join(ROOT, 'node_modules/idb-keyval/dist/index.js'))}`,
      'window.lagom = { useDiaryStore, isMemoryOnlyStorage, clear, del, get, set }',
    ],
    [plugin],
  )
}

/** `/` kör dagens kod (bench.js), `/fore` koden från `--before` (fore.js). */
function startServer(dataDir, bundles) {
  const page = (script) =>
    `<!doctype html><html lang="sv"><meta charset="utf-8"><title>Lagom – lagringsmätning</title><script type="module" src="/${script}.js"></script></html>`
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const send = (status, type, body) => {
      res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' })
      res.end(body)
    }
    if (url.pathname === '/') return send(200, 'text/html; charset=utf-8', page('bench'))
    if (url.pathname === '/fore' && bundles.fore) return send(200, 'text/html; charset=utf-8', page('fore'))
    const script = /^\/(bench|fore)\.js$/.exec(url.pathname)?.[1]
    if (script && bundles[script]) return send(200, 'text/javascript; charset=utf-8', bundles[script])
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

/** Hjälpfunktioner i varje sida (`window.__bench`), före sidans egen kod. */
function pageHelpers() {
  const round = (n) => Math.round(n * 10) / 10
  const med = (a) => {
    const s = [...a].sort((x, y) => x - y)
    const m = Math.floor(s.length / 2)
    return round(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2)
  }
  const times = (fn, n) => {
    const out = []
    for (let i = 0; i < n; i++) {
      const t0 = performance.now()
      fn()
      out.push(performance.now() - t0)
    }
    return med(out)
  }
  const timesAsync = async (fn, n) => {
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
  /** En skrivning: `start()` ger skrivningens löfte. Synkront, blockerar (huvudtråden fri igen) och klart. */
  const write = async (start) => {
    const t0 = performance.now()
    const p = start()
    const sync = performance.now() - t0
    await tick()
    const blocked = performance.now() - t0
    await p
    return { sync, blocked, done: performance.now() - t0 }
  }
  /** Börja samla långa uppgifter (≥ 50 ms). Ger en funktion som slutar och svarar med den längsta (null = ingen). */
  const longTasks = () => {
    const seen = []
    let obs = null
    try {
      obs = new PerformanceObserver((list) => seen.push(...list.getEntries()))
      obs.observe({ type: 'longtask' })
    } catch {
      obs = null
    }
    return () => {
      if (!obs) return null
      seen.push(...obs.takeRecords())
      obs.disconnect()
      return seen.length ? round(Math.max(...seen.map((e) => e.duration))) : null
    }
  }
  window.__bench = { round, med, times, timesAsync, tick, write, longTasks }
}

async function loadData(page, years) {
  await page.evaluate(async (y) => {
    const text = async (name) => (await fetch(`/data/${name}`)).text()
    window.__diary = await text(`diary-${y}y.json`)
    window.__month = await text(`month-${y}y.json`)
    window.__backup = await text(`backup-${y}y.json`)
    window.__samples = JSON.parse(await text('samples.json'))
  }, years)
}

/** Dagens format (version 1). Med `full: false` bara start, loggning och vattenknapp (för `--before`). */
async function measureInPage(page, runs, full = true) {
  return page.evaluate(
    async ({ runs, full }) => {
      const L = window.lagom
      const B = window.__bench
      const store = L.useDiaryStore
      const { today, entries: samples } = window.__samples

      const text = window.__diary
      const res = {}

      // Butiken först, direkt efter att sidan öppnats – samma läge för dagens kod och `--before`.
      // Start: dagboken ligger i IndexedDB och läses in genom butiken.
      await L.set('lagom-diary', text)
      res.hydrate = await B.timesAsync(() => store.persist.rehydrate(), runs)

      // En loggning genom butiken (setState returnerar skrivningens löfte från persist).
      const sync = []
      const blocked = []
      const done = []
      for (let i = 0; i < runs; i++) {
        const cur = store.getState().entries
        const w = await B.write(() => store.setState({ entries: { ...cur, [today]: [...(cur[today] ?? []), samples[i % samples.length]] } }))
        sync.push(w.sync)
        blocked.push(w.blocked)
        done.push(w.done)
      }
      res.writeSync = B.med(sync)
      res.writeBlocked = B.med(blocked)
      res.writeBlockedMax = B.round(Math.max(...blocked))
      res.writeDone = B.med(done)
      res.writeMode = L.lastDiaryWrite?.()?.mode ?? null
      res.memoryOnly = L.isMemoryOnlyStorage()

      // Ett tryck på vattenknappen.
      const water = []
      for (let i = 0; i < runs; i++) {
        const t0 = performance.now()
        store.getState().addWater(today, 250)
        await B.tick()
        water.push(performance.now() - t0)
        await L.get('bench-none') // vänta tills skrivningen är klar (samma objektlager, i ordning)
      }
      res.waterBlocked = B.med(water)

      if (full) {
        const obj = JSON.parse(text)
        res.parse = B.times(() => JSON.parse(text), runs)
        res.stringify = B.times(() => JSON.stringify(obj), runs)
        res.idbPut = await B.timesAsync(() => L.set('bench-raw', text), runs)
        res.idbGet = await B.timesAsync(() => L.get('bench-raw'), runs)
        await L.del('bench-raw')

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
        res.monthSync = B.med(mSync)
        res.monthDone = B.med(mDone)
        await L.del('bench-month')

        // Speglingen (lagom-spegling.json) och säkerhetskopian.
        const backupText = window.__backup
        const backupObj = JSON.parse(backupText)
        res.mirror = B.times(() => JSON.stringify(backupObj), runs)
        res.bridge = B.times(
          () =>
            JSON.stringify({ callbackId: '12345678', pluginId: 'Filesystem', methodName: 'writeFile', options: { path: 'lagom-spegling.tmp', data: backupText, directory: 'DATA', encoding: 'utf8', recursive: true } }),
          runs,
        )
        res.export = B.times(() => JSON.stringify(backupObj, null, 1), runs)
        res.backupParse = B.times(() => JSON.parse(backupText), runs)
      }

      // Städa: ta bort mätposterna och vattnet igen.
      const { [today]: _e, ...entries } = store.getState().entries
      const { [today]: _w, ...waterByDay } = store.getState().water
      await store.setState({ entries, water: waterByDay })
      return res
    },
    { runs, full },
  )
}

/** Månadsskrivaren (version 2): bytet från version 1, start, loggning och vattenknapp. */
async function measureMonthsInPage(page, runs) {
  return page.evaluate(async (runs) => {
    const L = window.lagom
    const B = window.__bench
    const store = L.useDiaryStore
    const { today, entries: samples } = window.__samples
    const text = window.__diary
    const count = (entries) => Object.values(entries).reduce((s, l) => s + l.length, 0)
    const check = (ok, what) => {
      if (!ok) throw new Error(`Månadsmätningen: ${what}`)
    }
    const res = {}

    // Start med version 1 i samma läge som starten med månaderna nedan.
    L.setDiaryMonthWrite(false)
    await L.set('lagom-diary', text)
    res.hydrateV1 = await B.timesAsync(() => store.persist.rehydrate(), runs)

    // 1. Bytet från version 1 (en gång per användare) – varje körning börjar med den gamla strängen.
    const mig = { sync: [], blocked: [], done: [], longest: [] }
    for (let i = 0; i < runs; i++) {
      L.setDiaryMonthWrite(false)
      await L.clear()
      await L.set('lagom-diary', text)
      await store.persist.rehydrate()
      L.setDiaryMonthWrite(true)
      // Bytet börjar i en egen uppgift – inläsningen ovan räknas inte in i den längsta uppgiften.
      await B.tick()
      const stop = B.longTasks()
      const w = await B.write(() => store.setState({}))
      await B.tick()
      mig.longest.push(stop() ?? 0)
      mig.sync.push(w.sync)
      mig.blocked.push(w.blocked)
      mig.done.push(w.done)
      check(L.lastDiaryWrite()?.mode === 'full', 'bytet skrev inte alla månader')
    }
    const info = L.lastDiaryWrite()
    res.migrationSync = B.med(mig.sync)
    res.migrationBlocked = B.med(mig.blocked)
    res.migrationLongest = B.med(mig.longest) || null
    res.migrationDone = B.med(mig.done)
    res.migrationMonths = info.written
    res.migrationChars = info.chars
    check((await L.get('lagom-diary-v1')) === text, 'kopian lagom-diary-v1 är inte den gamla strängen')
    const snapshot = await L.readDiarySnapshot()
    res.monthKeys = snapshot.months.length
    check(snapshot.months.length === info.written, 'fel antal månadsnycklar')

    // 2. Start med månaderna i IndexedDB (jämför med `hydrate` för version 1).
    const expected = count(store.getState().entries)
    res.hydrateV2 = await B.timesAsync(() => store.persist.rehydrate(), runs)
    check(count(store.getState().entries) === expected, 'fel antal poster efter inläsningen av månaderna')

    // 3. En loggning: bara den ändrade månaden och indexet skrivs.
    const log = { sync: [], blocked: [], done: [], chars: [] }
    for (let i = 0; i < runs; i++) {
      const cur = store.getState().entries
      const w = await B.write(() => store.setState({ entries: { ...cur, [today]: [...(cur[today] ?? []), samples[i % samples.length]] } }))
      log.sync.push(w.sync)
      log.blocked.push(w.blocked)
      log.done.push(w.done)
      const last = L.lastDiaryWrite()
      check(last?.mode === 'months', `loggningen skrev ${last?.mode} i stället för bara månaden`)
      log.chars.push(last.chars)
    }
    res.writeSync = B.med(log.sync)
    res.writeBlocked = B.med(log.blocked)
    res.writeBlockedMax = B.round(Math.max(...log.blocked))
    res.writeDone = B.med(log.done)
    res.writeChars = B.med(log.chars)

    // 4. Ett tryck på vattenknappen.
    const water = []
    for (let i = 0; i < runs; i++) {
      const t0 = performance.now()
      store.getState().addWater(today, 250)
      await B.tick()
      water.push(performance.now() - t0)
      await L.get('bench-none') // vänta tills skrivningen är klar (samma objektlager, i ordning)
      check(L.lastDiaryWrite()?.mode === 'months', 'vattnet skrev mer än månaden')
    }
    res.waterBlocked = B.med(water)
    res.memoryOnly = L.isMemoryOnlyStorage()

    // Kontroll: det som ligger i IndexedDB är samma dagbok som i minnet.
    const before = count(store.getState().entries)
    await store.persist.rehydrate()
    check(count(store.getState().entries) === before, 'fel antal poster efter loggningarna')

    // Städa: tillbaka till version 1 (som appen skriver) utan mätposterna och vattnet.
    L.setDiaryMonthWrite(false)
    const { [today]: _e, ...entries } = store.getState().entries
    const { [today]: _w, ...waterByDay } = store.getState().water
    await store.setState({ entries, water: waterByDay })
    await L.del('lagom-diary-v1')
    check(L.lastDiaryWrite()?.mode === 'v1', 'städningen skrev inte version 1')
    check((await L.readDiarySnapshot()).months.length === 0, 'månadsnycklar kvar efter version 1')
    // Samma sträng som före bytet? (Nycklarnas ordning följer månaderna efter en läsning av version 2.)
    res.v1RoundTrip = (await L.get('lagom-diary')) === text
    return res
  }, runs)
}

// ---------------------------------------------------------------------------
// Utskrift
// ---------------------------------------------------------------------------

const ms = (n) => (n >= 100 ? String(Math.round(n)) : n.toFixed(1)).replace('.', ',')
const mbText = (bytes) => (bytes / 1024 / 1024).toFixed(1).replace('.', ',')
const kChars = (n) => `${Math.round(n / 1000)} k`

function printTables(results, node, rates) {
  console.log('\n## Storlek (från testet)\n')
  console.log('| Dagbok | Poster | JSON (UTF-8) | gzip | Månad | Spegling | Export (indrag 1) |')
  console.log('|---|---:|---:|---:|---:|---:|---:|')
  for (const n of node) {
    console.log(`| ${n.years} år | ${n.entries} | ${mbText(n.diary.utf8)} MB | ${mbText(n.diary.gzip)} MB | ${Math.round(n.month.utf8 / 1024)} kB | ${mbText(n.backup.compactUtf8)} MB | ${mbText(n.backup.exportUtf8)} MB |`)
  }
  for (const rate of rates) {
    console.log(`\n## Chromium, CPU-strypning ${rate}× (median, ms) – version 1 (månadsskrivaren av)\n`)
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

/** En tabell med en rad per mätning och en kolumn per dagbok och strypning (som i LAGRING.md). */
function printMatrix(title, results, years, rates, rows) {
  console.log(`\n## ${title}\n`)
  const cols = years.flatMap((y) => rates.map((r, i) => (i === 0 ? `${y} år ${r}×` : `${r}×`)))
  console.log(`| Mätning | ${cols.join(' | ')} |`)
  console.log(`|---|${cols.map(() => '---:').join('|')}|`)
  for (const [label, get] of rows) {
    const cells = years.flatMap((y) =>
      rates.map((r) => {
        const x = results.find((e) => e.years === y && e.rate === r)
        const v = x ? get(x) : undefined
        if (v === undefined || v === null || Number.isNaN(v)) return '–'
        return typeof v === 'number' ? ms(v) : String(v)
      }),
    )
    console.log(`| ${label} | ${cells.join(' | ')} |`)
  }
}

function printMonthTables(results, years, rates, runs, before) {
  printMatrix('Månadsskrivaren (version 2) i Chromium (median, ms)', results, years, rates, [
    ['Bytet från version 1: synkront', (r) => r.months?.migrationSync],
    ['Bytet: blockerar', (r) => r.months?.migrationBlocked],
    ['Bytet: längsta uppgift', (r) => (r.months ? (r.months.migrationLongest ?? '< 50') : undefined)],
    ['Bytet: klart', (r) => r.months?.migrationDone],
    ['Bytet: månader / tecken', (r) => (r.months ? `${r.months.migrationMonths} / ${kChars(r.months.migrationChars)}` : undefined)],
    ['Start, version 1', (r) => r.months?.hydrateV1],
    ['Start, version 2 (månader)', (r) => r.months?.hydrateV2],
    ['Loggning: synkront', (r) => r.months?.writeSync],
    ['Loggning: blockerar', (r) => r.months?.writeBlocked],
    [`Loggning: längsta av ${runs}`, (r) => r.months?.writeBlockedMax],
    ['Loggning: klart', (r) => r.months?.writeDone],
    ['Loggning: tecken', (r) => (r.months ? kChars(r.months.writeChars) : undefined)],
    ['Vattenknappen: blockerar', (r) => r.months?.waterBlocked],
  ])
  if (!before) return
  printMatrix(`Version 1: dagbokens lagring nu jämfört med ${before} (median, ms)`, results, years, rates, [
    [`Start – ${before}`, (r) => r.before?.hydrate],
    ['Start – nu', (r) => r.m.hydrate],
    [`Loggning: blockerar – ${before}`, (r) => r.before?.writeBlocked],
    ['Loggning: blockerar – nu', (r) => r.m.writeBlocked],
    [`Loggning: klart – ${before}`, (r) => r.before?.writeDone],
    ['Loggning: klart – nu', (r) => r.m.writeDone],
    [`Vattenknappen – ${before}`, (r) => r.before?.waterBlocked],
    ['Vattenknappen – nu', (r) => r.m.waterBlocked],
  ])
}

// ---------------------------------------------------------------------------
// Chromium-sessionen
// ---------------------------------------------------------------------------

/** Sida, CDP och hjälpfunktioner för en Chromium-kontext. */
async function session(context, base) {
  const page = context.pages()[0] ?? (await context.newPage())
  page.setDefaultTimeout(600_000)
  const cdp = await context.newCDPSession(page)
  const ready = () => page.waitForFunction(() => typeof window.lagom === 'object' && window.lagom.useDiaryStore.persist.hasHydrated())
  return {
    page,
    cdp,
    ready,
    /** Öppna sidan (`''` = dagens kod, `'fore'` = `--before`), vänta på butikens första inläsning och töm IndexedDB. */
    open: async (path = '') => {
      await page.goto(base + path)
      await ready()
      await page.evaluate(() => window.lagom.clear())
    },
    throttle: (rate) => cdp.send('Emulation.setCPUThrottlingRate', { rate }),
    heap: async () => {
      await cdp.send('HeapProfiler.collectGarbage')
      await cdp.send('HeapProfiler.collectGarbage')
      return (await cdp.send('Runtime.getHeapUsage')).usedSize
    },
    estimate: () =>
      page.evaluate(async () => {
        const e = await navigator.storage.estimate()
        return { usage: e.usage ?? 0, indexedDB: e.usageDetails?.indexedDB ?? null }
      }),
  }
}

/** Tom butik → inläst dagbok → efter en skrivning (→ bytet till månader). `profile` är kontextens profilmapp. */
async function measureMemoryInPage({ page, ready, open, heap, estimate }, profile, years, path, months) {
  await open(path)
  await page.reload()
  await ready()
  const empty = await heap()
  await page.evaluate(async (y) => {
    const text = await (await fetch(`/data/diary-${y}y.json`)).text()
    await window.lagom.set('lagom-diary', text)
  }, years)
  await page.evaluate(() => window.lagom.useDiaryStore.persist.rehydrate())
  const loaded = await heap()
  const est = await estimate()
  await page.evaluate(async () => {
    const s = window.lagom.useDiaryStore
    await s.setState({ water: { ...s.getState().water, '2026-09-29': 250 } })
  })
  const written = await heap()
  const idbDir = join(profile, 'Default', 'IndexedDB')
  const onDisk = dirSize(idbDir)
  const out = { years, code: path || 'nu', stateBytes: loaded - empty, afterWriteBytes: written - loaded, estimate: est, onDisk }
  if (months) {
    // Bytet till månader: månaderna och kopian `lagom-diary-v1` ligger bredvid varandra.
    await page.evaluate(async () => {
      window.lagom.setDiaryMonthWrite(true)
      await window.lagom.useDiaryStore.setState({})
    })
    const afterMigration = await heap()
    out.months = { afterMigrationBytes: afterMigration - loaded, estimate: await estimate(), onDisk: dirSize(idbDir) }
  }
  console.log(
    `${years} år (${out.code}): JS-heap +${mbText(out.stateBytes)} MB efter inläsning, +${mbText(out.afterWriteBytes)} MB till efter en skrivning; ` +
      `storage.estimate ${mbText(est.usage)} MB, IndexedDB-mappen ${mbText(onDisk)} MB` +
      (out.months ? `; efter bytet till månader: storage.estimate ${mbText(out.months.estimate.usage)} MB, IndexedDB-mappen ${mbText(out.months.onDisk)} MB` : ''),
  )
  return out
}

// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log('Användning: node scripts/measure-diary-storage.mjs [--data=<mapp>] [--years=1,2,3] [--rates=1,4,6] [--runs=5] [--json=<fil>] [--fresh] [--before=<git-ref>]')
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
  const bundles = { bench: await bundleStore(args.data) }
  if (args.before) bundles.fore = await bundleBefore(args.data, args.before)
  const server = await startServer(args.data, bundles)
  const port = server.address().port
  const base = `http://127.0.0.1:${port}/`
  const profile = join(args.data, 'chromium-profil')
  rmSync(profile, { recursive: true, force: true })
  const context = await chromium.launchPersistentContext(profile, { headless: true })
  await context.addInitScript(pageHelpers)
  const results = []
  const memory = []
  let userAgent = ''

  /** Minne och lagringsutrymme i en egen, tom profil (utan strypning), så att diskstorleken blir ren. */
  const measureMemory = async (years, path, months) => {
    const dir = join(args.data, 'chromium-profil-minne')
    rmSync(dir, { recursive: true, force: true })
    const ctx = await chromium.launchPersistentContext(dir, { headless: true })
    try {
      await ctx.addInitScript(pageHelpers)
      const s = await session(ctx, base)
      memory.push(await measureMemoryInPage(s, dir, years, path, months))
    } finally {
      await ctx.close()
    }
  }

  try {
    const { page, open, throttle } = await session(context, base)
    userAgent = await page.evaluate(() => navigator.userAgent).catch(() => '')
    console.log(`Chromium: ${userAgent}\nCPU: ${cpus()[0]?.model ?? 'okänd'} (${cpus().length} kärnor), Node ${process.version}`)

    for (const years of args.years) {
      await measureMemory(years, '', true)
      if (args.before) await measureMemory(years, 'fore', false)

      for (const [i, rate] of args.rates.entries()) {
        const t0 = Date.now()
        let m = null
        let months = null
        let before = null
        const current = async () => {
          await open()
          await loadData(page, years)
          await throttle(rate)
          m = await measureInPage(page, args.runs)
          months = await measureMonthsInPage(page, args.runs)
          await throttle(1)
        }
        const older = async () => {
          await open('fore')
          await loadData(page, years)
          await throttle(rate)
          before = await measureInPage(page, args.runs, false)
          await throttle(1)
        }
        // Med `--before` byter ordningen varannan gång, så att ingen av dem alltid mäts först.
        if (args.before && i % 2 === 1) await older()
        await current()
        if (args.before && i % 2 === 0) await older()
        for (const [what, r] of [['version 1', m], ['månader', months], [args.before, before]]) {
          if (r?.memoryOnly) console.warn(`Varning: ${years} år ${rate}× (${what}) – lagringen gick över till minnesläge, tiderna gäller inte IndexedDB.`)
        }
        if (!months.v1RoundTrip) console.warn(`Obs: ${years} år ${rate}× – version 1 efter månaderna är inte exakt samma sträng som före (nycklarnas ordning).`)
        results.push({ years, rate, m, months, before })
        console.log(`${years} år, ${rate}×: klart på ${Math.round((Date.now() - t0) / 1000)} s`)
      }
    }
  } finally {
    await context.close()
    server.close()
  }

  printTables(results, node, args.rates)
  printMonthTables(results, args.years, args.rates, args.runs, args.before)
  if (args.json) {
    writeFileSync(
      args.json,
      JSON.stringify({ measuredAt: new Date().toISOString(), cpu: cpus()[0]?.model ?? null, chromium: userAgent, runs: args.runs, before: args.before, node, memory, results }, null, 2),
    )
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
