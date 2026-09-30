/**
 * Dagbokens lagring (diaryMonthStorage.ts) med riktig IndexedDB (fake-indexeddb):
 * - version 1 skrivs byte för byte som förut (createJSONStorage),
 * - månadsformatet (version 2) läses – även när skrivaren är avstängd (tillbakarullning),
 * - månadsskrivaren (avstängd i den här versionen): bytet från version 1, bara ändrade månader,
 *   slumpade följder av alla butikens åtgärder, misslyckade och samtidiga skrivningar,
 * - kontrollen i transaktionen när en annan flik (version 1, månader eller en nyare version) sparar
 *   samtidigt – med en transaktion från en annan anslutning som hålls öppen,
 * - skydden (nyare version, okända nycklar och fält, långsam läsning, trasig månad, felloggen utan
 *   dagbokens innehåll), andra flikar och "Radera all data".
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { clear, createStore, get, keys, promisifyRequest, set } from 'idb-keyval'
import { createJSONStorage } from 'zustand/middleware'
import type { DiaryEntry, ExerciseEntry, ISODate, MealId } from '../types'
import { BUILTIN_FOODS } from '../data/foods/index'
import { ERROR_LOG_KEY, readErrorLog } from '../lib/errorLog'
import { wipeAllData } from '../lib/backup'
import { generateUser, int, mulberry32, pick, type Rng } from './diaryFixture'
import { useDiaryStore, type NewDiaryEntry } from './diaryStore'
import {
  DIARY_INDEX_VERSION,
  DIARY_MONTHS_WRITE_BUILD,
  DIARY_V1_COPY_KEY,
  diaryMonthOf,
  diaryStorage,
  isDiaryMonthWriteOn,
  lastDiaryWrite,
  readDiarySnapshot,
  setDiaryMonthSplitHookForTests,
  setDiaryMonthWriteForTests,
  type DiaryData,
} from './diaryMonthStorage'
import { canRehydrate, hasNewerData, idbStorage, isMemoryOnlyStorage, onLateRead, READ_TIMEOUT_MS, resetStorageStateForTests, STORE_KEYS } from './storage'

const KEY = STORE_KEYS.diary
const MAPS = ['entries', 'water', 'exercise', 'days'] as const
/** Ett index utan märkning (`token`) – läsaren kräver den inte. */
const INDEX = JSON.stringify({ state: { format: 'manader', stateVersion: 1 }, version: 2 })
const EMPTY: DiaryData = { entries: {}, water: {}, exercise: {}, days: {} }

const s = () => useDiaryStore.getState()
/** Dagbokens data i butiken just nu. */
const dataOf = (): DiaryData => {
  const { entries, water, exercise, days } = s()
  return { entries, water, exercise, days }
}
/** Samma sträng som `createJSONStorage` skrev (version 1). */
const v1Text = (d: DiaryData) => JSON.stringify({ state: { entries: d.entries, water: d.water, exercise: d.exercise, days: d.days }, version: 1 })
/** setState väntar på skrivningen (persist-mellanvaran returnerar löftet; typerna säger void). */
const setDiary = (patch: Partial<DiaryData>) => useDiaryStore.setState(patch) as unknown as Promise<void>
/** Alla dagbokens skrivningar är klara: läsningen köas efter dem i samma anslutning. */
const settle = () => readDiarySnapshot().then(() => undefined)

interface Raw {
  main: unknown
  months: Record<string, unknown>
  v1: unknown
}

async function raw(): Promise<Raw> {
  const snap = await readDiarySnapshot()
  return { main: snap.main, months: Object.fromEntries(snap.months.map(([k, v]) => [k.slice(KEY.length + 1), v])), v1: await get(DIARY_V1_COPY_KEY) }
}

/** Den sparade dagboken, tolkad utan lagringens egen kod (ett oberoende facit). */
function decode(r: Raw): DiaryData {
  const text = r.main as string
  if ((JSON.parse(text) as { version: number }).version === 1) return { ...EMPTY, ...(JSON.parse(text) as { state: DiaryData }).state }
  expectIndex(text)
  const out: Record<string, Record<string, unknown>> = { entries: {}, water: {}, exercise: {}, days: {} }
  for (const [month, value] of Object.entries(r.months)) {
    const m = JSON.parse(value as string) as Record<string, Record<string, unknown>>
    expect(Object.keys(m)).toEqual([...MAPS])
    // Inga tomma månader, och varje datum i sin egen månad.
    expect(MAPS.some((k) => Object.keys(m[k]).length > 0)).toBe(true)
    for (const k of MAPS) {
      for (const [date, v] of Object.entries(m[k])) {
        expect(diaryMonthOf(date)).toBe(month)
        out[k][date] = v
      }
    }
  }
  return out as unknown as DiaryData
}

/** Månadsnycklar och huvudnyckeln som skrivits med `put` sedan spionen skapades. */
function spyPuts() {
  const spy = vi.spyOn(IDBObjectStore.prototype, 'put')
  const keysPut = () => spy.mock.calls.map((c) => c[1]).filter((k): k is string => typeof k === 'string' && k.startsWith(KEY))
  return {
    months: () => keysPut().filter((k) => k.startsWith(`${KEY}:`)).map((k) => k.slice(KEY.length + 1)),
    all: keysPut,
    reset: () => spy.mockClear(),
  }
}

/**
 * Nästa `n` transaktioner som skriver dagbokens huvudnyckel avbryts (som ett fullt lagringsutrymme).
 * Månadsskrivaren skriver när huvudnyckeln har lästs i transaktionen – avbrottet kommer alltså när
 * transaktionen körs, i samma ordning som i en riktig webbläsare.
 */
function failNextDiaryWrites(n = 1) {
  const original = IDBObjectStore.prototype.put
  let left = n
  return vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
    const req = original.call(this, value, key)
    if (key === KEY && left > 0) {
      left--
      this.transaction.abort()
    }
    return req
  })
}

/**
 * En annan flik (en egen anslutning) har påbörjat en skrivning: `ops` körs i en skrivtransaktion som
 * hålls öppen tills `release()`. Den här flikens transaktioner köas bakom den (samma objektlager) –
 * som när den andra fliken ännu inte hunnit spara klart och sätta sin stämpel.
 */
async function foreignWrite(ops: (os: IDBObjectStore) => void = () => {}): Promise<() => Promise<void>> {
  const other = createStore('keyval-store', 'keyval')
  let released = false
  let started: () => void = () => {}
  const ready = new Promise<void>((resolve) => (started = resolve))
  const done = other('readwrite', (os) => {
    ops(os)
    const spin = () => {
      const req = os.get('lås')
      req.onsuccess = () => {
        if (!released) spin()
      }
    }
    spin()
    started()
    return promisifyRequest(os.transaction)
  })
  await ready
  return async () => {
    released = true
    await done
  }
}

/** Håll en skrivtransaktion öppen på objektlagret – läsningar köas bakom den tills `release()`. */
const blockStore = () => foreignWrite()

/** En annan flik sparar (klart) med sin egen anslutning. */
const otherTabWrites = async (ops: (os: IDBObjectStore) => void) => (await foreignWrite(ops))()

/** Alla månadsnycklar (som skrivarens intervall). */
const allMonths = () => IDBKeyRange.bound(`${KEY}:`, `${KEY}:￿`)

/** En månad som skrivaren sparar den (samma form), ur en hel dagbok. */
function monthText(d: DiaryData, month: string): string {
  const only = (m: Record<string, unknown>) => Object.fromEntries(Object.entries(m).filter(([date]) => diaryMonthOf(date) === month))
  return JSON.stringify({ entries: only(d.entries), water: only(d.water), exercise: only(d.exercise), days: only(d.days) })
}

/** En kopia av dagboken (som en annan flik har den). */
const cloneDiary = (d: DiaryData): DiaryData => JSON.parse(JSON.stringify(d)) as DiaryData

/** Månadsindexet: rätt form, och en egen märkning (`token`) för varje skrivning. */
function expectIndex(main: unknown) {
  expect(main).toBeTypeOf('string')
  expect(JSON.parse(main as string)).toEqual({ state: { format: 'manader', stateVersion: 1, token: expect.any(String) }, version: 2 })
  // Slutet är det som äldre versioner läser (skyddet mot data från en nyare version).
  expect((main as string).endsWith(',"version":2}')).toBe(true)
}

/** En tom dagbok i månadsformatet: bara indexet, inga månader och ingen kopia. */
function expectEmptyIndex(r: Raw) {
  expectIndex(r.main)
  expect(r.months).toEqual({})
  expect(r.v1).toBeUndefined()
}

/** En ny session: lagringens tillstånd återställs och dagboken läses in från IndexedDB. */
async function newSession(opts: { monthWrite: boolean }) {
  await settle()
  resetStorageStateForTests()
  setDiaryMonthWriteForTests(opts.monthWrite)
  await useDiaryStore.persist.rehydrate()
}

const errorMessages = () => readErrorLog().map((e) => e.message)

let user: DiaryData
let pool: DiaryEntry[]

beforeAll(() => {
  // 60 dagar fram till 2026-09-28: slutet av juli, augusti och september.
  const u = generateUser({ days: 60, seed: 2026, end: '2026-09-28', curated: BUILTIN_FOODS })
  user = u.diary
  pool = Object.values(u.diary.entries).flat()
})

beforeEach(async () => {
  await settle()
  resetStorageStateForTests()
  // Tom butik och tom databas utan att något ligger kvar från förra testet.
  await clear()
  await setDiary({ ...EMPTY })
  await settle()
  await clear()
  resetStorageStateForTests()
  await useDiaryStore.persist.rehydrate()
  localStorage.removeItem(ERROR_LOG_KEY)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  setDiaryMonthSplitHookForTests(null)
})

describe('version 1 (skrivaren avstängd, som i den här versionen)', () => {
  it('är avstängd i bygget', () => {
    expect(DIARY_MONTHS_WRITE_BUILD).toBe(false)
    expect(isDiaryMonthWriteOn()).toBe(false)
    expect(DIARY_INDEX_VERSION).toBe(2)
  })

  it('skriver byte för byte samma sträng som createJSONStorage', async () => {
    await setDiary(user)
    let captured: string | undefined
    const json = createJSONStorage<unknown>(() => ({
      getItem: () => null,
      setItem: (_name: string, value: string) => {
        captured = value
      },
      removeItem: () => {},
    }))!
    // Som förut: hela tillståndet (funktionerna försvinner i JSON) …
    json.setItem(KEY, { state: s(), version: 1 })
    const stored = await get<string>(KEY)
    expect(stored).toBe(captured)
    // … och med butikens partialize.
    json.setItem(KEY, { state: useDiaryStore.persist.getOptions().partialize!(s()), version: 1 })
    expect(stored).toBe(captured)
    expect(stored!.length).toBeGreaterThan(200_000)
    expect(lastDiaryWrite()?.mode).toBe('v1')
    expect(await keys()).not.toContain(`${KEY}:2026-09`)
  })

  it('rör inte den gamla kopian – utom när dagboken töms', async () => {
    await set(DIARY_V1_COPY_KEY, 'gammal kopia')
    await setDiary(user)
    s().addWater('2026-09-28', 250)
    await settle()
    expect(await get(DIARY_V1_COPY_KEY)).toBe('gammal kopia')
    s().clearDiary()
    await settle()
    expect(await get(DIARY_V1_COPY_KEY)).toBeUndefined()
    expect(await get(KEY)).toBe(v1Text(EMPTY))
  })

  it('läser en dagbok i månadsformatet och skriver tillbaka version 1 i en transaktion', async () => {
    // En senare version (skrivaren på) har sparat månader.
    setDiaryMonthWriteForTests(true)
    await setDiary(user)
    const v2 = await raw()
    expectIndex(v2.main)
    expect(Object.keys(v2.months)).toEqual(['2026-07', '2026-08', '2026-09'])
    const expected = dataOf()

    // Den här versionen (skrivaren av) läser den …
    await newSession({ monthWrite: false })
    const read = await diaryStorage.getItem(KEY)
    expect(read).toEqual({ state: expected, version: 1 })
    await useDiaryStore.persist.rehydrate()
    expect(dataOf()).toEqual(expected)
    expect(isMemoryOnlyStorage()).toBe(false)

    // … och en avbruten skrivning ändrar ingenting: strängen och borttagningen av månaderna
    // ligger i samma transaktion.
    const del = IDBObjectStore.prototype.delete
    vi.spyOn(IDBObjectStore.prototype, 'delete').mockImplementation(function (this: IDBObjectStore, key: IDBValidKey | IDBKeyRange) {
      const req = del.call(this, key)
      if (key instanceof IDBKeyRange) this.transaction.abort()
      return req
    })
    s().addWater('2026-09-10', 250)
    await settle()
    expect(await raw()).toEqual(v2)
    expect(isMemoryOnlyStorage()).toBe(true)
    vi.restoreAllMocks()

    // Nästa skrivning: version 1 och inga månader kvar.
    s().addWater('2026-09-11', 250)
    await settle()
    const r = await raw()
    expect(r.months).toEqual({})
    expect(r.main).toBe(v1Text(dataOf()))
    expect(decode(r).water['2026-09-10']).toBe((expected.water['2026-09-10'] ?? 0) + 250)
    expect(isMemoryOnlyStorage()).toBe(false)
  })

  it('läser version 1 och struntar i kvarglömda månader, som tas bort vid nästa skrivning', async () => {
    await set(KEY, v1Text({ ...EMPTY, water: { '2026-09-01': 500 } }))
    await set(`${KEY}:2026-08`, JSON.stringify({ ...EMPTY, water: { '2026-08-01': 999 } }))
    await useDiaryStore.persist.rehydrate()
    expect(s().water).toEqual({ '2026-09-01': 500 })
    s().addWater('2026-09-02', 250)
    await settle()
    expect((await raw()).months).toEqual({})
  })

  it('removeItem tar bort huvudnyckeln, månaderna och kopian i en transaktion', async () => {
    setDiaryMonthWriteForTests(true)
    await set(KEY, v1Text(user))
    await useDiaryStore.persist.rehydrate()
    s().addWater('2026-09-01', 250)
    await settle()
    expect(await get(DIARY_V1_COPY_KEY)).toBeTypeOf('string')
    await diaryStorage.removeItem(KEY)
    expect(await raw()).toEqual({ main: undefined, months: {}, v1: undefined })
  })
})

describe('månadsskrivaren (avstängd i den här versionen)', () => {
  it('bytet från version 1: alla månader, index och den gamla strängen i en transaktion', async () => {
    await setDiary(user)
    const old = await get<string>(KEY)
    await newSession({ monthWrite: true })
    expect(isDiaryMonthWriteOn()).toBe(true)
    const puts = spyPuts()
    s().setDayMeta('2026-09-28', { mood: 4 })
    await settle()
    expect(lastDiaryWrite()?.mode).toBe('full')
    const r = await raw()
    expectIndex(r.main)
    expect(r.v1).toBe(old)
    expect(Object.keys(r.months)).toEqual(['2026-07', '2026-08', '2026-09'])
    expect(decode(r)).toEqual(dataOf())
    expect(puts.months().sort()).toEqual(['2026-07', '2026-08', '2026-09'])

    // En ny läsning ger samma dagbok.
    const expected = dataOf()
    await newSession({ monthWrite: true })
    expect((await diaryStorage.getItem(KEY))?.state).toEqual(expected)
    await useDiaryStore.persist.rehydrate()
    expect(dataOf()).toEqual(expected)

    // Därefter bara den ändrade månaden och indexet.
    puts.reset()
    s().addWater('2026-08-15', 250)
    await settle()
    expect(puts.all()).toEqual([`${KEY}:2026-08`, KEY])
    expect(lastDiaryWrite()).toMatchObject({ mode: 'months', written: 1, deleted: 0 })
    expect(decode(await raw())).toEqual(dataOf())
    // Kopian ligger kvar.
    expect(await get(DIARY_V1_COPY_KEY)).toBe(old)
  })

  it('stämmer inte uppdelningen sparas version 1 resten av sessionen, och felet loggas', async () => {
    await setDiary(user)
    await newSession({ monthWrite: true })
    // Ett fel i uppdelningen: augustis poster försvinner.
    setDiaryMonthSplitHookForTests((month, text) => (month === '2026-08' ? JSON.stringify({ ...JSON.parse(text), entries: {} }) : text))
    s().addWater('2026-09-01', 250)
    await settle()
    expect(lastDiaryWrite()?.mode).toBe('v1')
    expect(isDiaryMonthWriteOn()).toBe(false)
    const r = await raw()
    expect(r.main).toBe(v1Text(dataOf()))
    expect(r.months).toEqual({})
    expect(r.v1).toBeUndefined()
    expect(errorMessages().some((m) => m.includes('dagbokens lagring') && m.includes('Månadsuppdelningen'))).toBe(true)
    // Resten av sessionen: version 1.
    setDiaryMonthSplitHookForTests(null)
    s().addWater('2026-09-02', 250)
    await settle()
    expect(lastDiaryWrite()?.mode).toBe('v1')
    expect(isMemoryOnlyStorage()).toBe(false)
  })

  it('månader utan index läses in ändå (loggas en gång) och får ett index vid nästa skrivning', async () => {
    await set(`${KEY}:2026-09`, JSON.stringify({ ...EMPTY, water: { '2026-09-01': 500 } }))
    await set(`${KEY}:ovrigt`, JSON.stringify({ ...EMPTY, days: { okänt: { note: 'x' } } }))
    await newSession({ monthWrite: true })
    expect(dataOf()).toEqual({ ...EMPTY, water: { '2026-09-01': 500 }, days: { okänt: { note: 'x' } } })
    await useDiaryStore.persist.rehydrate()
    expect(errorMessages().filter((m) => m.includes('index saknas'))).toHaveLength(1)
    s().addWater('2026-09-02', 250)
    await settle()
    expect(lastDiaryWrite()?.mode).toBe('full')
    const r = await raw()
    expectIndex(r.main)
    expect(Object.keys(r.months)).toEqual(['2026-09', 'ovrigt'])
    expect(decode(r)).toEqual(dataOf())
  })

  it('en annan flik har sparat: hela dagboken skrivs, inte en blandning av två flikar', async () => {
    setDiaryMonthWriteForTests(true)
    await setDiary(user)
    s().addWater('2026-09-01', 250)
    await settle()
    expect(lastDiaryWrite()?.mode).toBe('months')
    // En annan flik tog bort juli och sparade (stämpeln ändras).
    await set(`${KEY}:2026-07`, JSON.stringify({ ...EMPTY, water: { '2026-07-31': 1 } }))
    await set(`${KEY}:2026-06`, JSON.stringify({ ...EMPTY, water: { '2026-06-01': 1 } }))
    localStorage.setItem(`lagom-sparad:${KEY}`, 'annan-flik')
    s().addWater('2026-09-02', 250)
    await settle()
    expect(lastDiaryWrite()?.mode).toBe('full')
    const r = await raw()
    expect(Object.keys(r.months)).toEqual(['2026-07', '2026-08', '2026-09'])
    expect(decode(r)).toEqual(dataOf())
  })

  it('en tom dagbok: inga månader, ingen kopia, ett tomt index', async () => {
    await setDiary(user)
    await newSession({ monthWrite: true })
    s().addWater('2026-09-01', 250)
    await settle()
    expect(await get(DIARY_V1_COPY_KEY)).toBeTypeOf('string')
    s().clearDiary()
    await settle()
    expect(lastDiaryWrite()?.mode).toBe('empty')
    expectEmptyIndex(await raw())
    // Och sedan vidare med bara ändrade månader.
    s().addWater('2026-10-01', 250)
    await settle()
    expect(lastDiaryWrite()).toMatchObject({ mode: 'months', written: 1 })
    expect(decode(await raw())).toEqual(dataOf())
  })

  describe('misslyckade skrivningar', () => {
    beforeEach(async () => {
      setDiaryMonthWriteForTests(true)
      await setDiary(user)
    })

    it('en avbruten transaktion lämnar IndexedDB orörd, syns, och nästa skrivning tar med ändringen', async () => {
      const before = await raw()
      failNextDiaryWrites(1)
      s().addWater('2026-08-05', 500)
      await settle()
      expect(await raw()).toEqual(before)
      expect(isMemoryOnlyStorage()).toBe(true)
      expect(canRehydrate(KEY)).toBe(false)

      // Läget på disken är okänt efter felet: nästa skrivning skriver alla månader (som lyckas –
      // månaderna skrivs som vanligt efter det).
      s().setDayMeta('2026-07-31', { steps: 1234 })
      await settle()
      expect(lastDiaryWrite()).toMatchObject({ mode: 'full', written: 3 })
      expect(decode(await raw())).toEqual(dataOf())
      expect(isMemoryOnlyStorage()).toBe(false)
      expect(isDiaryMonthWriteOn()).toBe(true)
      s().addWater('2026-08-06', 250)
      await settle()
      expect(lastDiaryWrite()).toMatchObject({ mode: 'months', written: 1 })
      expect(decode(await raw())).toEqual(dataOf())
    })

    it('skrivning N misslyckas och N+1 (startad innan N var klar) lyckas: allt sparas', async () => {
      failNextDiaryWrites(1)
      s().addWater('2026-08-06', 250)
      s().addWater('2026-07-31', 250)
      await settle()
      // N+1 såg i sin transaktion att N:s index inte kom på plats och skrev alla månader.
      expect(lastDiaryWrite()).toMatchObject({ mode: 'full', written: 3 })
      expect(decode(await raw())).toEqual(dataOf())
      expect(isMemoryOnlyStorage()).toBe(false)
      expect(isDiaryMonthWriteOn()).toBe(true)
    })

    it('N+1 misslyckas redan när den skapas medan N fortfarande pågår och lyckas: nästa skrivning skriver alla månader', async () => {
      // Felet för N+1 rapporteras före N:s lyckade skrivning (fel ordning jämfört med IndexedDB).
      const real = IDBDatabase.prototype.transaction
      let calls = 0
      const release = await blockStore()
      vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (this: IDBDatabase, ...args: Parameters<IDBDatabase['transaction']>) {
        calls++
        if (calls === 2) throw new DOMException('Avbruten', 'AbortError')
        return real.apply(this, args)
      })
      // Samma månad i båda: N:s lyckade skrivning får inte "räkna" N+1:s ändring som sparad.
      s().addWater('2026-08-06', 250)
      s().addWater('2026-08-07', 250)
      await vi.waitFor(() => expect(isMemoryOnlyStorage()).toBe(true))
      vi.restoreAllMocks()
      await release()
      await settle()
      s().addWater('2026-09-20', 250)
      await settle()
      expect(lastDiaryWrite()?.mode).toBe('full')
      expect(decode(await raw())).toEqual(dataOf())
      expect(isMemoryOnlyStorage()).toBe(false)
    })

    it('tillägg och ångra i samma ögonblick: den tidigare skrivningens månad skrivs om', async () => {
      // N sparar juni med posten; N+1 (startad innan N är klar) måste ta bort månaden igen – annars
      // ligger posten kvar på disken fast den är borttagen i minnet.
      const added = s().addEntry({ kind: 'quick', date: '2026-06-15', meal: 'lunch', name: 'Test', nutrients: { kcal: 100 } })
      s().removeEntry(added.date, added.id)
      await settle()
      expect(decode(await raw())).toEqual(dataOf())
      expect((await raw()).months['2026-06']).toBeUndefined()
    })

    it('ett misslyckat byte från version 1 (t.ex. fullt lagringsutrymme): version 1 resten av sessionen, nytt försök nästa gång', async () => {
      await setDiary({ ...EMPTY })
      await settle()
      await clear()
      await set(KEY, v1Text(user))
      await newSession({ monthWrite: true })
      failNextDiaryWrites(1)
      s().addWater('2026-09-01', 250)
      await settle()
      expect(await raw()).toEqual({ main: v1Text(user), months: {}, v1: undefined })
      expect(isMemoryOnlyStorage()).toBe(true)
      expect(isDiaryMonthWriteOn()).toBe(false)
      expect(errorMessages().some((m) => m.includes('dagbokens lagring') && m.includes('gamla formatet resten av sessionen'))).toBe(true)
      // Nästa skrivning: version 1 (som redan fungerade), inte hela bytet igen.
      s().addWater('2026-09-02', 250)
      await settle()
      expect(lastDiaryWrite()?.mode).toBe('v1')
      expect(await raw()).toEqual({ main: v1Text(dataOf()), months: {}, v1: undefined })
      expect(isMemoryOnlyStorage()).toBe(false)
      // En ny session försöker igen – med kopian.
      const old = v1Text(dataOf())
      await newSession({ monthWrite: true })
      s().addWater('2026-09-03', 250)
      await settle()
      expect(lastDiaryWrite()?.mode).toBe('full')
      const r = await raw()
      expect(r.v1).toBe(old)
      expect(decode(r)).toEqual(dataOf())
      expect(isMemoryOnlyStorage()).toBe(false)
    })

    it('en misslyckad skrivning av alla månader efter bytet: version 1 resten av sessionen', async () => {
      // En annan flik har sparat (stämpeln): alla månader skrivs – och misslyckas.
      localStorage.setItem(`lagom-sparad:${KEY}`, 'annan-flik')
      failNextDiaryWrites(1)
      s().addWater('2026-09-01', 250)
      await settle()
      expect(isDiaryMonthWriteOn()).toBe(false)
      s().addWater('2026-09-02', 250)
      await settle()
      expect(lastDiaryWrite()?.mode).toBe('v1')
      const r = await raw()
      expect(r.months).toEqual({})
      expect(r.main).toBe(v1Text(dataOf()))
      expect(isMemoryOnlyStorage()).toBe(false)
    })
  })
})

// ---------------------------------------------------------------------------
// Slumpade följder av alla butikens åtgärder
// ---------------------------------------------------------------------------

const MONTHS = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10']
const MEALS: MealId[] = ['frukost', 'lunch', 'fika', 'middag', 'kvallsmat']

function randomDate(r: Rng): ISODate {
  if (r() < 0.03) return 'okänt-datum'
  return `${pick(r, MONTHS)}-${String(int(r, 1, 28)).padStart(2, '0')}`
}

/** Månader där något ändrats per referens mellan två lägen (samma regel som skrivaren). */
function refChangedMonths(prev: DiaryData, next: DiaryData, into: Set<string>) {
  for (const k of MAPS) {
    const a = next[k] as Record<string, unknown>
    const b = prev[k] as Record<string, unknown>
    if (a === b) continue
    for (const d of new Set([...Object.keys(a), ...Object.keys(b)])) if (a[d] !== b[d]) into.add(diaryMonthOf(d))
  }
}

/** Månader vars innehåll skiljer sig (JSON per datum). */
function valueChangedMonths(prev: DiaryData, next: DiaryData): Set<string> {
  const out = new Set<string>()
  for (const k of MAPS) {
    const a = next[k] as Record<string, unknown>
    const b = prev[k] as Record<string, unknown>
    for (const d of new Set([...Object.keys(a), ...Object.keys(b)])) if (JSON.stringify(a[d]) !== JSON.stringify(b[d])) out.add(diaryMonthOf(d))
  }
  return out
}

describe('slumpade följder av alla åtgärder (skrivaren på)', () => {
  it('sparar alltid samma dagbok som i minnet och skriver bara ändrade månader', async () => {
    setDiaryMonthWriteForTests(true)
    await setDiary(user)
    const r = mulberry32(20260929)
    const removed: DiaryEntry[] = []
    const removedExercise: ExerciseEntry[] = []
    const entryAt = (): DiaryEntry | undefined => {
      const all = Object.values(s().entries).flat()
      return all.length ? pick(r, all) : undefined
    }
    const exerciseAt = (): ExerciseEntry | undefined => {
      const all = Object.values(s().exercise).flat()
      return all.length ? pick(r, all) : undefined
    }
    const newEntry = (): NewDiaryEntry => {
      const { id: _id, createdAt: _c, ...rest } = pick(r, pool)
      return { ...rest, date: randomDate(r), meal: pick(r, MEALS) } as NewDiaryEntry
    }
    const actions: Array<[string, number, () => void]> = [
      ['addEntry', 6, () => void s().addEntry(newEntry())],
      ['addEntries', 3, () => void s().addEntries(Array.from({ length: int(r, 1, 4) }, newEntry))],
      ['updateEntry', 3, () => { const e = entryAt(); if (e) s().updateEntry(e.date, e.id, { note: `Ändrad ${int(r, 1, 99)}` }) }],
      ['removeEntry', 3, () => { const e = entryAt(); const x = e && s().removeEntry(e.date, e.id); if (x) removed.push(x) }],
      ['removeEntries', 2, () => { const list = Array.from({ length: int(r, 1, 4) }, entryAt).filter((e): e is DiaryEntry => !!e); removed.push(...s().removeEntries(list)) }],
      ['restoreEntry', 2, () => { const e = removed.pop(); if (e) s().restoreEntry(e) }],
      ['restoreEntries', 2, () => s().restoreEntries(removed.splice(0, int(r, 1, 3)))],
      ['moveEntry', 3, () => { const e = entryAt(); if (e) s().moveEntry(e.date, e.id, randomDate(r), pick(r, MEALS)) }],
      ['copyMeal', 2, () => { const e = entryAt(); if (e) s().copyMeal(e.date, e.meal, randomDate(r), pick(r, MEALS)) }],
      ['copyDay', 1, () => { const e = entryAt(); if (e) s().copyDay(e.date, randomDate(r)) }],
      ['addWater', 3, () => s().addWater(randomDate(r), pick(r, [250, 500, -250]))],
      ['setWater', 2, () => s().setWater(randomDate(r), 250 * int(r, 0, 8))],
      ['addExercise', 2, () => void s().addExercise({ date: randomDate(r), activityId: 'promenad-rask', name: 'Promenad, rask', minutes: 5 * int(r, 2, 12), kcal: int(r, 50, 400), met: 4.8 })],
      ['updateExercise', 1, () => { const x = exerciseAt(); if (x) s().updateExercise(x.date, x.id, { minutes: int(r, 10, 90) }) }],
      ['removeExercise', 1, () => { const x = exerciseAt(); const y = x && s().removeExercise(x.date, x.id); if (y) removedExercise.push(y) }],
      ['restoreExercise', 1, () => { const x = removedExercise.pop(); if (x) s().restoreExercise(x) }],
      ['setDayMeta', 2, () => s().setDayMeta(randomDate(r), { steps: int(r, 1000, 15000) })],
      ['setDayMetas', 2, () => s().setDayMetas(Array.from({ length: int(r, 1, 5) }, () => ({ date: randomDate(r), patch: { steps: int(r, 1000, 15000), mood: int(r, 1, 5) } })))],
      ['clearDiary', 0.3, () => s().clearDiary()],
    ]
    const total = actions.reduce((sum, [, w]) => sum + w, 0)
    const randomAction = () => {
      let x = r() * total
      for (const a of actions) {
        x -= a[1]
        if (x <= 0) return a
      }
      return actions[0]
    }

    // En första skrivning efter bytet: därefter bara ändrade månader (eller en tom dagbok).
    s().addWater('2026-09-28', 250)
    await settle()
    expect(lastDiaryWrite()?.mode).toBe('months')
    const puts = spyPuts()
    const used = new Set<string>()
    for (let batch = 0; batch < 40; batch++) {
      const before = dataOf()
      const touched = new Set<string>()
      let prev = before
      let cleared = false
      puts.reset()
      // Åtgärderna i en omgång körs direkt efter varandra: skrivningarna överlappar.
      for (let i = int(r, 1, 6); i > 0; i--) {
        const [name, , run] = randomAction()
        used.add(name)
        if (name === 'clearDiary') cleared = true
        run()
        const next = dataOf()
        refChangedMonths(prev, next, touched)
        prev = next
      }
      await settle()
      expect(isMemoryOnlyStorage()).toBe(false)
      const stored = await raw()
      expect(decode(stored)).toEqual(dataOf())
      // Bara månader som faktiskt ändrats skrivs – och alla som ändrats i sak.
      const written = new Set(puts.months())
      for (const m of written) expect(touched.has(m)).toBe(true)
      for (const m of valueChangedMonths(before, dataOf())) {
        if (m in stored.months) expect(written.has(m)).toBe(true)
      }
      // Hela dagboken skrivs bara efter en tömning i samma omgång: en skrivning som startar medan
      // tömningen pågår skriver allt (misslyckas tömningen får inga gamla månader komma tillbaka).
      expect(cleared ? ['months', 'empty', 'full'] : ['months', 'empty']).toContain(lastDiaryWrite()?.mode)

      // En ny läsning (som en ny start) ger samma dagbok.
      if (batch % 4 === 3) {
        const expected = dataOf()
        await useDiaryStore.persist.rehydrate()
        expect(dataOf()).toEqual(expected)
      }
    }
    expect([...used].sort()).toEqual(actions.map(([name]) => name).sort())
  }, 20_000)
})

// ---------------------------------------------------------------------------
// Skydden
// ---------------------------------------------------------------------------

describe('skydden', () => {
  it('index från en nyare version (3) läses inte in, skrivs aldrig över – men "Radera all data" tar bort det', async () => {
    const newer = JSON.stringify({ state: { format: 'manader', stateVersion: 1 }, version: 3 })
    const month = JSON.stringify({ ...EMPTY, water: { '2026-09-01': 500 } })
    await set(KEY, newer)
    await set(`${KEY}:2026-09`, month)
    await set(DIARY_V1_COPY_KEY, 'kopia')
    await useDiaryStore.persist.rehydrate()
    expect(hasNewerData()).toBe(true)
    expect(isMemoryOnlyStorage()).toBe(true)
    expect(s().water).toEqual({})
    const before = await raw()
    s().addWater('2026-09-02', 250)
    await settle()
    expect(await raw()).toEqual(before)
    // Minnet håller butikens eget objekt (ingen kopia).
    expect((await diaryStorage.getItem(KEY))?.state.water).toBe(s().water)
    await diaryStorage.removeItem(KEY)
    expect(await raw()).toEqual(before)

    wipeAllData()
    await settle()
    expect(await raw()).toEqual({ main: v1Text(EMPTY), months: {}, v1: undefined })
    expect(hasNewerData()).toBe(false)
  })

  it('stateVersion 2 i indexet räknas som data från en nyare version', async () => {
    await set(KEY, JSON.stringify({ state: { format: 'manader', stateVersion: 2 }, version: 2 }))
    await useDiaryStore.persist.rehydrate()
    expect(hasNewerData()).toBe(true)
    s().addWater('2026-09-02', 250)
    await settle()
    expect((await raw()).months).toEqual({})
  })

  it('en äldre version (vanlig lagring) ser indexet som data från en nyare version', async () => {
    await set(KEY, INDEX)
    expect(await idbStorage!.getItem(KEY)).toBeNull()
    expect(hasNewerData()).toBe(true)
  })

  it('en trasig månad: minnesläge, felet loggas och ingenting skrivs över eller tas bort', async () => {
    await set(KEY, INDEX)
    await set(`${KEY}:2026-08`, JSON.stringify({ ...EMPTY, water: { '2026-08-01': 500 } }))
    await set(`${KEY}:2026-09`, '{"entries":{"2026-09-01":[{"id":')
    const before = await raw()
    await useDiaryStore.persist.rehydrate()
    expect(useDiaryStore.persist.hasHydrated()).toBe(true)
    expect(isMemoryOnlyStorage()).toBe(true)
    expect(hasNewerData()).toBe(false)
    expect(canRehydrate(KEY)).toBe(false)
    expect(errorMessages().some((m) => m.includes('dagbokens lagring'))).toBe(true)
    for (const monthWrite of [false, true]) {
      setDiaryMonthWriteForTests(monthWrite)
      s().addWater('2026-09-02', 250)
      await settle()
      expect(await raw()).toEqual(before)
    }
    await diaryStorage.removeItem(KEY)
    expect(await raw()).toEqual(before)
  })

  it('en trasig huvudnyckel skrivs inte heller över', async () => {
    await set(KEY, '{"state":{"entries":')
    await useDiaryStore.persist.rehydrate()
    expect(isMemoryOnlyStorage()).toBe(true)
    s().addWater('2026-09-02', 250)
    await settle()
    expect(await get(KEY)).toBe('{"state":{"entries":')
  })

  it('en långsam läsning: inget skrivs förrän läsningen till slut är klar', async () => {
    setDiaryMonthWriteForTests(true)
    await setDiary(user)
    const stored = dataOf()
    await newSession({ monthWrite: true })
    const late = vi.fn()
    const off = onLateRead(late)
    const release = await blockStore()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const hydration = useDiaryStore.persist.rehydrate()
    await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS + 10)
    await hydration
    expect(isMemoryOnlyStorage()).toBe(true)
    expect(canRehydrate(KEY)).toBe(false)
    const puts = spyPuts()
    s().addWater('2026-09-03', 250)
    await release()
    vi.useRealTimers()
    await vi.waitFor(() => expect(late).toHaveBeenCalledWith(KEY))
    expect(puts.all()).toEqual([])
    expect(isMemoryOnlyStorage()).toBe(false)
    // Butiken läses in igen (hydration.ts gör det vid onLateRead) – och skriver sedan som vanligt.
    await useDiaryStore.persist.rehydrate()
    expect(dataOf()).toEqual(stored)
    s().addWater('2026-09-04', 250)
    await settle()
    expect(puts.months()).toEqual(['2026-09'])
    expect(decode(await raw())).toEqual(dataOf())
    off()
  })
})

describe('andra flikar', () => {
  it('stämpeln ändras efter en skrivning, andra flikar meddelas och canRehydrate fungerar som förut', async () => {
    for (const monthWrite of [false, true]) {
      await newSession({ monthWrite })
      const messages: unknown[] = []
      const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('lagom-store')
      if (channel) channel.onmessage = (e: MessageEvent) => messages.push(e.data)
      const stamp = () => localStorage.getItem(`lagom-sparad:${KEY}`)
      const before = stamp()
      s().addWater('2026-09-01', 250)
      await settle()
      expect(stamp()).not.toBe(before)
      if (channel) {
        await vi.waitFor(() => expect(messages).toContainEqual({ name: KEY }))
        channel.close()
      }
      // Egna skrivningar räknas inte, en annan fliks gör det.
      expect(canRehydrate(KEY)).toBe(false)
      localStorage.setItem(`lagom-sparad:${KEY}`, 'annan-flik')
      expect(canRehydrate(KEY)).toBe(true)
      await useDiaryStore.persist.rehydrate()
      expect(canRehydrate(KEY)).toBe(false)
    }
  })
})

describe('"Radera all data"', () => {
  it('skrivaren på: inga månader, ingen kopia och ett tomt index', async () => {
    await setDiary(user)
    await newSession({ monthWrite: true })
    s().addWater('2026-09-01', 250)
    await settle()
    expect(Object.keys((await raw()).months)).toHaveLength(3)
    wipeAllData()
    await settle()
    expectEmptyIndex(await raw())
    expect(dataOf()).toEqual(EMPTY)
  })

  it('skrivaren av: en tom sträng i version 1 och inga månader', async () => {
    setDiaryMonthWriteForTests(true)
    await setDiary(user)
    await set(DIARY_V1_COPY_KEY, 'kopia')
    await newSession({ monthWrite: false })
    wipeAllData()
    await settle()
    expect(await raw()).toEqual({ main: v1Text(EMPTY), months: {}, v1: undefined })
  })
})

// ---------------------------------------------------------------------------
// Flera flikar och versioner samtidigt (skrivaren på) – kontrollen i transaktionen
// ---------------------------------------------------------------------------

describe('en annan flik sparar samtidigt (skrivaren på)', () => {
  beforeEach(async () => {
    setDiaryMonthWriteForTests(true)
    await setDiary(user)
    s().addWater('2026-09-01', 250)
    await settle()
    // Därefter skriver fliken bara ändrade månader.
    expect(lastDiaryWrite()?.mode).toBe('months')
  })

  it('en flik med version 1 hinner före en skrivning av bara ändrade månader: hela dagboken skrivs, ingen månad försvinner', async () => {
    // Flik A (skrivaren av, eller en flik vars kontroll inte stämde) har påbörjat sin skrivning –
    // version 1 och bort med månaderna – men inte hunnit sätta sin stämpel.
    const a = cloneDiary(dataOf())
    a.water['2026-07-31'] = 1
    const aText = v1Text(a)
    const release = await foreignWrite((os) => {
      os.put(aText, KEY)
      os.delete(allMonths())
    })
    s().addWater('2026-09-13', 250)
    await release()
    await settle()
    const r = await raw()
    expect(Object.keys(r.months)).toEqual(['2026-07', '2026-08', '2026-09'])
    expect(decode(r)).toEqual(dataOf())
    expect(lastDiaryWrite()?.mode).toBe('full')
    // A:s sträng (version 1) blir kopian.
    expect(r.v1).toBe(aText)
    // En ny start ger hela dagboken.
    const expected = dataOf()
    await newSession({ monthWrite: true })
    expect(dataOf()).toEqual(expected)
  })

  it('två flikar med skrivaren på: en flytt i den andra fliken blandas aldrig med den här flikens månader', async () => {
    // Flik X flyttar en post från augusti till september och skriver båda månaderna och sitt index.
    const e = s().entries['2026-08-10'][0]
    const x = cloneDiary(dataOf())
    x.entries['2026-08-10'] = x.entries['2026-08-10'].filter((y) => y.id !== e.id)
    x.entries['2026-09-10'] = [...x.entries['2026-09-10'], { ...e, date: '2026-09-10' }]
    const release = await foreignWrite((os) => {
      os.put(monthText(x, '2026-08'), `${KEY}:2026-08`)
      os.put(monthText(x, '2026-09'), `${KEY}:2026-09`)
      os.put(JSON.stringify({ state: { format: 'manader', stateVersion: 1, token: 'flik-x' }, version: 2 }), KEY)
    })
    // Den här fliken ändrar augusti (där posten ligger kvar) innan X:s stämpel syns.
    s().addWater('2026-08-12', 250)
    await release()
    await settle()
    const stored = decode(await raw())
    const ids = Object.values(stored.entries)
      .flat()
      .map((y) => y.id)
    expect(new Set(ids).size).toBe(ids.length)
    // Den senaste skrivningen vinner, hela dagboken – ingen post dubbelt och ingen borta.
    expect(stored).toEqual(dataOf())
    expect(lastDiaryWrite()?.mode).toBe('full')
  })

  it('en flik med version 1 sparar och den här läser in den: nästa skrivning skriver alla månader', async () => {
    const a = cloneDiary(dataOf())
    a.water['2026-07-31'] = 1
    await otherTabWrites((os) => {
      os.put(v1Text(a), KEY)
      os.delete(allMonths())
    })
    localStorage.setItem(`lagom-sparad:${KEY}`, 'flik-a')
    expect(canRehydrate(KEY)).toBe(true)
    // Samma session – inte en ny start, som skulle dölja felet.
    await useDiaryStore.persist.rehydrate()
    expect(dataOf()).toEqual(a)
    s().addWater('2026-09-02', 250)
    await settle()
    expect(lastDiaryWrite()?.mode).toBe('full')
    const r = await raw()
    expect(Object.keys(r.months)).toEqual(['2026-07', '2026-08', '2026-09'])
    expect(decode(r)).toEqual(dataOf())
    expect(r.v1).toBe(v1Text(a))
  })

  for (const [label, newer] of [
    ['ett index med version 3', JSON.stringify({ state: { format: 'manader', stateVersion: 1 }, version: 3 })],
    ['version 1 med en högre butiksversion', JSON.stringify({ state: { entries: {}, water: { '2026-09-01': 1 }, exercise: {}, days: {} }, version: 9 })],
  ] as const) {
    it(`en nyare version sparar under tiden (${label}): skrivs aldrig över och skyddas – "Radera all data" tar bort den`, async () => {
      const release = await foreignWrite((os) => os.put(newer, KEY))
      s().addWater('2026-09-13', 250)
      await release()
      await settle()
      const r = await raw()
      expect(r.main).toBe(newer)
      expect(Object.keys(r.months)).toEqual(['2026-07', '2026-08', '2026-09'])
      expect(hasNewerData()).toBe(true)
      expect(isMemoryOnlyStorage()).toBe(true)
      expect(canRehydrate(KEY)).toBe(false)
      // Inget mer skrivs – inte heller alla månader efter en ny stämpel.
      localStorage.setItem(`lagom-sparad:${KEY}`, 'nyare-flik')
      s().addWater('2026-09-14', 250)
      await settle()
      expect(await raw()).toEqual(r)

      wipeAllData()
      await settle()
      const w = await raw()
      expectIndex(w.main)
      expect(w.months).toEqual({})
      expect(w.v1).toBeUndefined()
      expect(hasNewerData()).toBe(false)
      expect(isMemoryOnlyStorage()).toBe(false)
    })
  }
})

describe('läsaren skyddar det den inte känner till', () => {
  const month = JSON.stringify({ ...EMPTY, water: { '2026-09-01': 500 } })
  const cases: Array<[string, Record<string, string>]> = [
    ['en okänd nyckel i månadsintervallet', { [KEY]: INDEX, [`${KEY}:2026-09`]: month, [`${KEY}:livsmedel`]: '{"abc":{"name":"Kycklingbröst"}}' }],
    ['ett okänt fält i en månad', { [KEY]: INDEX, [`${KEY}:2026-09`]: JSON.stringify({ ...EMPTY, water: { '2026-09-01': 500 }, extra: 1 }) }],
    ['ett okänt fält i dagboken (version 1)', { [KEY]: JSON.stringify({ state: { ...EMPTY, water: { '2026-09-01': 500 }, livsmedel: {} }, version: 1 }) }],
    ['version 1 med butiksversion 2', { [KEY]: JSON.stringify({ state: { ...EMPTY, water: { '2026-09-01': 500 } }, version: 2 }) }],
    ['månader utan index och med en okänd nyckel', { [`${KEY}:2026-09`]: month, [`${KEY}:x`]: month }],
  ]
  for (const [label, stored] of cases) {
    it(`${label}: data från en nyare version – läses inte in, skrivs inte över och tas inte bort`, async () => {
      for (const [k, v] of Object.entries(stored)) await set(k, v)
      const before = await raw()
      await useDiaryStore.persist.rehydrate()
      expect(hasNewerData()).toBe(true)
      expect(s().water).toEqual({})
      for (const monthWrite of [false, true]) {
        setDiaryMonthWriteForTests(monthWrite)
        s().addWater('2026-09-02', 250)
        await settle()
        expect(await raw()).toEqual(before)
      }
      await diaryStorage.removeItem(KEY)
      expect(await raw()).toEqual(before)
    })
  }

  it('extra fält i indexet (t.ex. märkningen från en senare version) läses som vanligt', async () => {
    await set(KEY, JSON.stringify({ state: { format: 'manader', stateVersion: 1, token: 'x', annat: [1] }, version: 2, extra: true }))
    await set(`${KEY}:2026-09`, month)
    await useDiaryStore.persist.rehydrate()
    expect(isMemoryOnlyStorage()).toBe(false)
    expect(s().water).toEqual({ '2026-09-01': 500 })
  })

  it('ett index med för låg version går inte att tolka (skrivs inte över)', async () => {
    await set(KEY, JSON.stringify({ state: { format: 'manader', stateVersion: 1 }, version: 1 }))
    await set(`${KEY}:2026-09`, month)
    const before = await raw()
    await useDiaryStore.persist.rehydrate()
    expect(isMemoryOnlyStorage()).toBe(true)
    expect(hasNewerData()).toBe(false)
    s().addWater('2026-09-02', 250)
    await settle()
    expect(await raw()).toEqual(before)
  })

  it('felloggen citerar aldrig den trasiga dagboken', async () => {
    const broken = '{"state":{"entries":{"2026-09-01":[{"id":"e_1","name":\u0001Kladdkaka med grädde","note":"Hos mormor"}]}},"version":1}'
    for (const main of [broken, broken.replace('"entries"', '"format":"manader","entries"').replace(',"version":1}', ',"version":2}')]) {
      localStorage.removeItem(ERROR_LOG_KEY)
      resetStorageStateForTests()
      await set(KEY, main)
      await useDiaryStore.persist.rehydrate()
      expect(isMemoryOnlyStorage()).toBe(true)
      expect(errorMessages().some((m) => m.includes('dagbokens lagring'))).toBe(true)
      expect(JSON.stringify(readErrorLog())).not.toMatch(/Kladdkaka|mormor/)
    }
  })
})
