/**
 * Mätning av dagbokens lagring – underlaget till docs/LAGRING.md (checklistepunkten
 * "dagbok-en-nyckel"). Ingen kontroll av appens beteende: filen hoppas över i den vanliga
 * testsviten och laddar inget förrän den körs.
 *
 *   LAGOM_MEASURE_STORAGE=1 npx vitest run src/stores/diaryStorage.bench.test.ts
 *
 * Med LAGOM_MEASURE_OUT=<mapp> sparas även dagböckerna (exakt den sträng som butiken skriver till
 * IndexedDB), säkerhetskopiorna och resultaten som JSON. `scripts/measure-diary-storage.mjs` bygger
 * dem själv på det sättet och mäter sedan i Chromium (riktig IndexedDB och CPU-strypning).
 *
 * Datan är påhittad men byggd som i appen (`diaryFixture.ts`, som även testerna av lagringen
 * använder) och läggs i `useDiaryStore` med dess riktiga lagring (fake-indexeddb i Node). Slumpen
 * är deterministisk, så datan blir densamma varje körning; bara tiderna varierar. Tiderna här är
 * från Node – de som gäller för telefoner kommer från Chromium.
 *
 * Utöver dagens format (version 1, en nyckel) mäts månadsskrivaren (version 2, en nyckel per
 * månad – avstängd i appen, se diaryMonthStorage.ts): bytet från version 1 och en loggning.
 */
import { describe, expect, it } from 'vitest'
import type { Food, ISODate } from '../types'

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}
const RUN = env.LAGOM_MEASURE_STORAGE === '1'
const OUT = env.LAGOM_MEASURE_OUT?.trim() || undefined

/** Sista dagen i den påhittade dagboken (dagen före "idag" i mätningen). */
const END: ISODate = '2026-09-28'
/** Dagen som de nya posterna i mätningen loggas på. */
const TODAY: ISODate = '2026-09-29'
const YEARS = [1, 2, 3] as const
const RUNS = 7

// Node-moduler laddas dynamiskt (appens tsconfig har inte Node-typerna).
interface NodeFs {
  readFile(path: string, encoding: 'utf8'): Promise<string>
  writeFile(path: string, data: string, encoding: 'utf8'): Promise<void>
  mkdir(path: string, opts: { recursive: boolean }): Promise<unknown>
}
interface NodePath {
  join(...parts: string[]): string
}
interface NodeZlib {
  gzipSync(data: string | Uint8Array): { byteLength: number }
}
const nodeModule = <T>(name: string): Promise<T> => import(/* @vite-ignore */ name) as Promise<T>
const cwd = (): string => (globalThis as { process?: { cwd?: () => string } }).process?.cwd?.() ?? '.'

// ---------------------------------------------------------------------------
// Mätverktyg
// ---------------------------------------------------------------------------

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function timeSync(fn: () => unknown, runs = RUNS): number {
  const out: number[] = []
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now()
    fn()
    out.push(performance.now() - t0)
  }
  return round(median(out))
}

async function timeAsync(fn: () => Promise<unknown>, runs = RUNS): Promise<number> {
  const out: number[] = []
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now()
    await fn()
    out.push(performance.now() - t0)
  }
  return round(median(out))
}

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d
const utf8 = (s: string) => new TextEncoder().encode(s).byteLength
/** V8 lagrar en sträng med två byte per tecken så fort ett tecken ligger över U+00FF (t.ex. "–"). */
function twoByte(s: string): boolean {
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) > 0xff) return true
  return false
}
const kb = (bytes: number) => round(bytes / 1024, 0)
const mb = (bytes: number) => round(bytes / 1024 / 1024, 2)

// ---------------------------------------------------------------------------
// Mätningen
// ---------------------------------------------------------------------------

describe.skipIf(!RUN)('dagbokens lagring (mätning till docs/LAGRING.md)', () => {
  it('mäter storlek, tolkning och skrivning för 1, 2 och 3 års dagbok', async () => {
    const fs = await nodeModule<NodeFs>('node:fs/promises')
    const path = await nodeModule<NodePath>('node:path')
    const zlib = await nodeModule<NodeZlib>('node:zlib')
    const { BUILTIN_FOODS } = await import('../data/foods/index')
    const { enrichCuratedFoods } = await import('../lib/foodRepo')
    const { generateUser, sampleEntries } = await import('./diaryFixture')
    const { useDiaryStore } = await import('./diaryStore')
    const { useFoodStore } = await import('./foodStore')
    const { useBodyStore } = await import('./bodyStore')
    const storage = await import('./storage')
    const months = await import('./diaryMonthStorage')
    const { createBackup, parseBackup } = await import('../lib/backup')
    const { demoFoodIds } = await import('../lib/demo')
    const idb = await import('idb-keyval')

    const lmvText = await fs.readFile(path.join(cwd(), 'public', 'data', 'livsmedelsverket.json'), 'utf8')
    const lmvFoods = (JSON.parse(lmvText) as { foods: Food[] }).foods
    const curated = enrichCuratedFoods(BUILTIN_FOODS, lmvFoods)
    // Kalibrering: hur stor är en ögonblicksbild i genomsnitt – hela databasen och exempeldatans
    // vardagsmat – jämfört med det påhittade förrådet nedan?
    const avgChars = (foods: readonly Food[]) => Math.round(foods.reduce((s, f) => s + JSON.stringify(f).length, 0) / Math.max(1, foods.length))
    const curatedById = new Map(curated.map((f) => [f.id, f]))
    const demoFoods = demoFoodIds().flatMap((id) => curatedById.get(id) ?? [])
    const calibration = { allCurated: avgChars(curated), demoFoods: avgChars(demoFoods), demoFoodCount: demoFoods.length, lmv: avgChars(lmvFoods) }

    /** En användare som loggat varje dag i `days` dagar fram till END. */
    const generate = (days: number, seed: number) => generateUser({ days, seed, end: END, curated, lmv: lmvFoods })

    const diaryKey = storage.STORE_KEYS.diary
    const version = storage.PERSIST_VERSIONS[diaryKey]
    const persistedOf = () => JSON.stringify({ state: useDiaryStore.getState(), version })
    const setStateAsync = (patch: Partial<ReturnType<typeof useDiaryStore.getState>>) =>
      // persist-mellanvaran returnerar skrivningens löfte (typerna säger void).
      useDiaryStore.setState(patch) as unknown as Promise<void>

    const newEntries = sampleEntries(curated, TODAY)
    const results: Record<string, unknown>[] = []
    if (OUT) await fs.mkdir(OUT, { recursive: true })

    for (const years of YEARS) {
      const days = Math.round(years * 365.25)
      const data = generate(days, 20260929 + years)

      // Tom butik med riktig lagring (fake-indexeddb): läs in (inget sparat) och skriv sedan allt.
      storage.resetStorageStateForTests()
      await idb.clear()
      await useDiaryStore.persist.rehydrate()
      await useFoodStore.persist.rehydrate()
      await useBodyStore.persist.rehydrate()
      await setStateAsync(data.diary)
      useFoodStore.setState(data.food)
      useBodyStore.setState(data.body)

      const text = persistedOf()
      // Samma sträng som butiken själv skrev till IndexedDB.
      expect(await idb.get(diaryKey)).toBe(text)
      expect(storage.isMemoryOnlyStorage()).toBe(false)

      const entryLists = Object.values(data.diary.entries)
      const entryCount = entryLists.reduce((s, l) => s + l.length, 0)
      const foodEntries = entryLists.flat().filter((e) => e.kind === 'food')

      // Vad består dagboken av? Ögonblicksbilderna av livsmedlen jämfört med resten.
      let snapshotChars = 0
      const fieldChars: Record<string, number> = {}
      const unique = new Map<string, string>()
      for (const e of foodEntries) {
        const json = JSON.stringify(e.food)
        snapshotChars += json.length
        unique.set(json, e.food.id)
        for (const [k, v] of Object.entries(e.food)) {
          if (v !== undefined) fieldChars[k] = (fieldChars[k] ?? 0) + JSON.stringify(v).length + k.length + 4
        }
      }
      const uniqueChars = [...unique.keys()].reduce((s, j) => s + j.length, 0)
      const bySource: Record<string, { n: number; chars: number }> = {}
      for (const e of foodEntries) {
        const b = (bySource[e.food.source] ??= { n: 0, chars: 0 })
        b.n++
        b.chars += JSON.stringify(e.food).length
      }
      const avgBySource = Object.fromEntries(Object.entries(bySource).map(([k, v]) => [k, { entries: v.n, avgChars: Math.round(v.chars / v.n) }]))
      // Om varje post bara pekade på en ögonblicksbild ({"ref":"<id>#<n>"}) som sparas en gång.
      const refChars = foodEntries.reduce((s, e) => s + `{"ref":"${e.food.id}#1"}`.length, 0)
      const dedupedChars = text.length - snapshotChars + refChars + uniqueChars

      const month = END.slice(0, 7)
      const inMonth = <T>(rec: Record<ISODate, T>) => Object.fromEntries(Object.entries(rec).filter(([d]) => d.startsWith(month)))
      const monthObj = { entries: inMonth(data.diary.entries), water: inMonth(data.diary.water), exercise: inMonth(data.diary.exercise), days: inMonth(data.diary.days) }
      const monthText = JSON.stringify({ state: monthObj, version })

      // Tider i Node (V8 på byggdatorn – se Chromium-mätningen för telefoner).
      const obj = JSON.parse(text) as unknown
      const stringifyMs = timeSync(() => JSON.stringify(obj))
      const parseMs = timeSync(() => JSON.parse(text))
      const monthStringifyMs = timeSync(() => JSON.stringify({ state: monthObj, version }))

      // Start: läs in dagboken från IndexedDB (tolka hela strängen). Efteråt består butiken av
      // tolkade objekt, precis som i appen efter en start.
      const hydrateMs = await timeAsync(async () => {
        await useDiaryStore.persist.rehydrate()
      }, 5)

      // En loggning genom butiken: set() → JSON.stringify av hela dagboken → IndexedDB.
      const syncMs: number[] = []
      const totalMs: number[] = []
      for (let i = 0; i < RUNS; i++) {
        const entry = newEntries[i]
        const cur = useDiaryStore.getState().entries
        const t0 = performance.now()
        const p = setStateAsync({ entries: { ...cur, [TODAY]: [...(cur[TODAY] ?? []), entry] } })
        syncMs.push(performance.now() - t0)
        await p
        totalMs.push(performance.now() - t0)
      }
      expect(storage.isMemoryOnlyStorage()).toBe(false)
      await useDiaryStore.persist.rehydrate()
      expect(useDiaryStore.getState().entries[TODAY]).toHaveLength(RUNS)
      // Ta bort mätposterna igen (utan att mäta skrivningen).
      const { [TODAY]: _added, ...withoutToday } = useDiaryStore.getState().entries
      await setStateAsync({ entries: withoutToday })

      // Månadsskrivaren (version 2 – avstängd i appen): bytet från version 1 (alla månader, en
      // kontroll i minnet och den gamla strängen som kopia) och sedan samma loggningar som ovan.
      months.setDiaryMonthWriteForTests(true)
      const m0 = performance.now()
      const migration = setStateAsync({})
      const migrationSyncMs = round(performance.now() - m0)
      await migration
      const migrationTotalMs = round(performance.now() - m0)
      const migrationInfo = months.lastDiaryWrite()
      expect(migrationInfo?.mode).toBe('full')
      expect(await idb.get(months.DIARY_V1_COPY_KEY)).toBe(text)
      const monthSyncMs: number[] = []
      const monthTotalMs: number[] = []
      const monthChars: number[] = []
      for (let i = 0; i < RUNS; i++) {
        const cur = useDiaryStore.getState().entries
        const t0 = performance.now()
        const p = setStateAsync({ entries: { ...cur, [TODAY]: [...(cur[TODAY] ?? []), newEntries[i]] } })
        monthSyncMs.push(performance.now() - t0)
        await p
        monthTotalMs.push(performance.now() - t0)
        monthChars.push(months.lastDiaryWrite()?.chars ?? 0)
      }
      expect(months.lastDiaryWrite()?.mode).toBe('months')
      expect(storage.isMemoryOnlyStorage()).toBe(false)
      const monthHydrateMs = await timeAsync(async () => {
        await useDiaryStore.persist.rehydrate()
      }, 5)
      expect(useDiaryStore.getState().entries[TODAY]).toHaveLength(RUNS)
      // Tillbaka till version 1 (som appen skriver) utan mätposterna.
      months.setDiaryMonthWriteForTests(false)
      const { [TODAY]: _addedAgain, ...withoutTodayAgain } = useDiaryStore.getState().entries
      await setStateAsync({ entries: withoutTodayAgain })
      expect(await idb.get(diaryKey)).toBe(text)
      const monthWriter = {
        migrationSyncMs,
        migrationTotalMs,
        migrationChars: migrationInfo?.chars ?? 0,
        migrationMonths: migrationInfo?.written ?? 0,
        writeSyncMs: round(median(monthSyncMs)),
        writeTotalMs: round(median(monthTotalMs)),
        writeChars: Math.round(median(monthChars)),
        hydrateMs: monthHydrateMs,
      }

      // Säkerhetskopian och speglingen (samma innehåll: createBackup).
      const backup = createBackup()
      const backupCompact = JSON.stringify(backup)
      const backupExport = JSON.stringify(backup, null, 1)
      // Android: Capacitor skickar anropet som JSON (win.androidBridge.postMessage(JSON.stringify(data))).
      const envelope = () => JSON.stringify({ callbackId: '12345678', pluginId: 'Filesystem', methodName: 'writeFile', options: { path: 'lagom-spegling.tmp', data: backupCompact, directory: 'DATA', encoding: 'utf8', recursive: true } })
      const envelopeText = envelope()
      const mirrorMs = timeSync(() => JSON.stringify(createBackup()), 5)
      const exportMs = timeSync(() => JSON.stringify(createBackup(), null, 1), 5)
      const envelopeMs = timeSync(envelope, 5)
      const parseBackupMs = timeSync(() => parseBackup(backupCompact), 3)
      const foodText = JSON.stringify({ state: useFoodStore.getState(), version: storage.PERSIST_VERSIONS[storage.STORE_KEYS.food] })

      const result = {
        years,
        days,
        entries: entryCount,
        foodEntries: foodEntries.length,
        uniqueSnapshots: unique.size,
        avgSnapshotChars: Math.round(snapshotChars / foodEntries.length),
        avgBySource,
        calibration,
        diary: { chars: text.length, utf8: utf8(text), twoByte: twoByte(text), gzip: zlib.gzipSync(text).byteLength, perDay: Math.round(utf8(text) / days), perEntry: Math.round(utf8(text) / entryCount) },
        snapshots: { chars: snapshotChars, share: round(snapshotChars / text.length, 3), fields: Object.fromEntries(Object.entries(fieldChars).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, round(v / text.length, 3)])) },
        deduped: { chars: dedupedChars, share: round(dedupedChars / text.length, 3) },
        month: { month, chars: monthText.length, utf8: utf8(monthText), stringifyMs: monthStringifyMs },
        foodStore: { chars: foodText.length, utf8: utf8(foodText) },
        backup: { compactUtf8: utf8(backupCompact), exportUtf8: utf8(backupExport), envelopeChars: envelopeText.length, gzip: zlib.gzipSync(backupCompact).byteLength },
        node: {
          stringifyMs,
          parseMs,
          writeSyncMs: round(median(syncMs)),
          writeTotalMs: round(median(totalMs)),
          hydrateMs,
          mirrorMs,
          exportMs,
          envelopeMs,
          parseBackupMs,
        },
        monthWriter,
      }
      results.push(result)

      console.log(
        `\n${years} år (${days} dagar, ${entryCount} poster, ${unique.size} olika ögonblicksbilder)\n` +
          `  dagboken: ${mb(result.diary.utf8)} MB (${result.diary.perDay} B/dag, ${result.diary.perEntry} B/post, gzip ${mb(result.diary.gzip)} MB, tvåbytessträng: ${result.diary.twoByte ? 'ja' : 'nej'})\n` +
          `  ögonblicksbilder: ${Math.round(result.snapshots.share * 100)} % av dagboken, i snitt ${result.avgSnapshotChars} tecken (hela databasen ${calibration.allCurated}, exempeldatans vardagsmat ${calibration.demoFoods}); utan dubbletter ${mb(dedupedChars)} MB\n` +
          `  fält: ${Object.entries(result.snapshots.fields).slice(0, 8).map(([k, v]) => `${k} ${Math.round(v * 100)} %`).join(', ')}\n` +
          `  månad ${month}: ${kb(result.month.utf8)} kB · livsmedelsbutiken: ${kb(result.foodStore.utf8)} kB\n` +
          `  säkerhetskopia: ${mb(result.backup.compactUtf8)} MB kompakt (spegling), ${mb(result.backup.exportUtf8)} MB export, gzip ${mb(result.backup.gzip)} MB\n` +
          `  Node: stringify ${stringifyMs} ms, parse ${parseMs} ms, skrivning ${result.node.writeSyncMs} ms synkront / ${result.node.writeTotalMs} ms klart, inläsning ${hydrateMs} ms\n` +
          `        spegling ${mirrorMs} ms (+ Android-bryggan ${envelopeMs} ms), export ${exportMs} ms, parseBackup ${parseBackupMs} ms\n` +
          `  månadsskrivaren (Node): bytet ${monthWriter.migrationSyncMs} ms synkront / ${monthWriter.migrationTotalMs} ms klart (${monthWriter.migrationMonths} månader, ${mb(monthWriter.migrationChars)} M tecken), ` +
          `loggning ${monthWriter.writeSyncMs} ms synkront / ${monthWriter.writeTotalMs} ms klart (${kb(monthWriter.writeChars)} k tecken), inläsning ${monthWriter.hydrateMs} ms`,
      )

      if (OUT) {
        await fs.writeFile(path.join(OUT, `diary-${years}y.json`), text, 'utf8')
        await fs.writeFile(path.join(OUT, `month-${years}y.json`), monthText, 'utf8')
        await fs.writeFile(path.join(OUT, `backup-${years}y.json`), backupCompact, 'utf8')
      }
    }

    if (OUT) {
      await fs.writeFile(path.join(OUT, 'samples.json'), JSON.stringify({ today: TODAY, entries: newEntries }), 'utf8')
      await fs.writeFile(path.join(OUT, 'node-results.json'), JSON.stringify(results, null, 2), 'utf8')
    }
    storage.resetStorageStateForTests()
    await idb.clear()
  }, 600_000)
})
