import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Styrbar IndexedDB: varje anrop lämnar ett löfte som testet självt löser eller avvisar.
type Pending<T> = { resolve: (v: T) => void; reject: (e: unknown) => void }
const reads: Pending<string | undefined>[] = []
const writes: Pending<void>[] = []
const getMock = vi.fn((_key: string): Promise<string | undefined> => new Promise<string | undefined>((resolve, reject) => reads.push({ resolve, reject })))
const setMock = vi.fn((_key: string, _value: unknown) => new Promise<void>((resolve, reject) => writes.push({ resolve, reject })))

vi.mock('idb-keyval', () => ({
  get: (key: string) => getMock(key),
  set: (key: string, value: unknown) => setMock(key, value),
  del: () => Promise.resolve(),
}))

const storage = await import('./storage')
const {
  canRehydrate,
  changedElsewhere,
  guardedRead,
  guardedRemove,
  guardedWrite,
  hasNewerData,
  hasProtectedData,
  hasSlowReads,
  hasUnreadableData,
  isMemoryOnlyStorage,
  onLateRead,
  PERSIST_VERSIONS,
  protectNewerData,
  READ_TIMEOUT_MS,
  releaseNewerData,
  resetStorageStateForTests,
  STORE_KEYS,
  storedVersion,
} = storage
// createJSONStorage returnerar undefined bara om lagringen saknas helt – inte här.
const idbStorage = storage.idbStorage!

const value = (n: number) => ({ state: { n }, version: 1 })

describe('lagring i IndexedDB', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    reads.length = 0
    writes.length = 0
    getMock.mockClear()
    setMock.mockClear()
    resetStorageStateForTests()
  })
  afterEach(() => vi.useRealTimers())

  it('läser och skriver normalt', async () => {
    const p = idbStorage.getItem('k')
    reads[0].resolve(JSON.stringify(value(1)))
    expect(await p).toEqual(value(1))
    const w = idbStorage.setItem('k', value(2))
    expect(setMock).toHaveBeenCalledTimes(1)
    writes[0].resolve()
    await w
    expect(isMemoryOnlyStorage()).toBe(false)
  })

  it('en långsam läsning stänger inte av lagringen och skriver aldrig över osparad historik', async () => {
    const late = vi.fn()
    const off = onLateRead(late)
    const p = idbStorage.getItem('dagbok')
    await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS + 10)
    // Appen visas utan datan …
    expect(await p).toBeNull()
    expect(isMemoryOnlyStorage()).toBe(true)
    // … men en ändring under tiden får inte skriva över den sparade dagboken.
    await idbStorage.setItem('dagbok', value(0))
    expect(setMock).not.toHaveBeenCalled()

    // Läsningen blir till slut klar: butiken ombeds läsa in igen.
    reads[0].resolve(JSON.stringify(value(42)))
    await vi.advanceTimersByTimeAsync(0)
    expect(late).toHaveBeenCalledWith('dagbok')
    expect(isMemoryOnlyStorage()).toBe(false)

    // Den nya inläsningen lyckas – därefter sparas ändringar som vanligt.
    const again = idbStorage.getItem('dagbok')
    reads[1].resolve(JSON.stringify(value(42)))
    expect(await again).toEqual(value(42))
    const w = idbStorage.setItem('dagbok', value(43))
    expect(setMock).toHaveBeenCalledTimes(1)
    writes[0].resolve()
    await w
    off()
  })

  it('en långsam läsning är skyddad data – en säkerhetskopia då saknar den sparade datan', async () => {
    expect(hasSlowReads()).toBe(false)
    expect(hasProtectedData()).toBe(false)
    const p = idbStorage.getItem('dagbok')
    await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS + 10)
    expect(await p).toBeNull()
    // Appen visas med tomma standardvärden, men den sparade datan finns kvar och är inte inläst.
    expect(hasSlowReads()).toBe(true)
    expect(hasProtectedData()).toBe(true)
    // Det är varken en nyare version eller data som inte går att tolka – andra texter gäller.
    expect(hasNewerData()).toBe(false)
    expect(hasUnreadableData()).toBe(false)

    // Läsningen blir klar: skyddet släpps så att påminnelsen om säkerhetskopia fungerar som vanligt.
    reads[0].resolve(JSON.stringify(value(42)))
    await vi.advanceTimersByTimeAsync(0)
    expect(hasSlowReads()).toBe(false)
    expect(hasProtectedData()).toBe(false)
  })

  it('en långsam läsning som visar sig vara från en nyare version förblir skyddad', async () => {
    const off = onLateRead((name) => void idbStorage.getItem(name))
    const p = idbStorage.getItem(STORE_KEYS.diary)
    await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS + 10)
    await p
    expect(hasProtectedData()).toBe(true)
    // Den sena läsningen ger en ny inläsning, och den hittar data från en nyare version.
    reads[0].resolve(JSON.stringify(value(1)))
    await vi.advanceTimersByTimeAsync(0)
    expect(reads).toHaveLength(2)
    reads[1].resolve(JSON.stringify({ state: { n: 1 }, version: PERSIST_VERSIONS[STORE_KEYS.diary] + 1 }))
    await vi.advanceTimersByTimeAsync(0)
    expect(hasSlowReads()).toBe(false)
    expect(hasNewerData()).toBe(true)
    expect(hasProtectedData()).toBe(true)
    off()
  })

  it('en långsam läsning som till slut misslyckas är inte längre "långsam" – lagringen är då i minnesläge', async () => {
    const p = idbStorage.getItem('dagbok')
    await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS + 10)
    await p
    expect(hasSlowReads()).toBe(true)
    reads[0].reject(new DOMException('Blockerad', 'SecurityError'))
    await vi.advanceTimersByTimeAsync(0)
    expect(hasSlowReads()).toBe(false)
    expect(isMemoryOnlyStorage()).toBe(true)
  })

  it('en långsam skrivning räknas inte som fel, men en misslyckad syns tills nästa lyckas', async () => {
    const r = idbStorage.getItem('k')
    reads[0].resolve(undefined)
    await r
    const slow = idbStorage.setItem('k', value(1))
    await vi.advanceTimersByTimeAsync(10_000)
    await slow
    expect(isMemoryOnlyStorage()).toBe(false)
    writes[0].reject(new DOMException('Fullt', 'QuotaExceededError'))
    await vi.advanceTimersByTimeAsync(0)
    expect(isMemoryOnlyStorage()).toBe(true)
    // Nästa skrivning försöker igen i IndexedDB och lyckas.
    const ok = idbStorage.setItem('k', value(2))
    expect(setMock).toHaveBeenCalledTimes(2)
    writes[1].resolve()
    await ok
    expect(isMemoryOnlyStorage()).toBe(false)
  })

  it('faller tillbaka på minnet om IndexedDB inte går att läsa', async () => {
    const p = idbStorage.getItem('k')
    reads[0].reject(new DOMException('Blockerad', 'SecurityError'))
    expect(await p).toBeNull()
    expect(isMemoryOnlyStorage()).toBe(true)
    await idbStorage.setItem('k', value(5))
    expect(setMock).not.toHaveBeenCalled()
    expect(await idbStorage.getItem('k')).toEqual(value(5))
  })

  it('en synkront kastande IndexedDB (spärrad lagring) ger minnesläge direkt', async () => {
    // idb-keyval öppnar databasen synkront – spärrar webbläsaren lagringen kastar indexedDB.open direkt.
    const actual = await vi.importActual<typeof import('idb-keyval')>('idb-keyval')
    vi.stubGlobal('indexedDB', {
      open: () => {
        throw new DOMException('Lagring spärrad', 'SecurityError')
      },
    })
    try {
      getMock.mockImplementationOnce((key) => actual.get<string>(key))
      let answered = false
      const p = Promise.resolve(idbStorage.getItem('k')).then((v) => {
        answered = true
        return v
      })
      // Inga timers flyttas fram: svaret kommer direkt, inte efter tidsgränsen.
      await vi.advanceTimersByTimeAsync(0)
      expect(answered).toBe(true)
      expect(await p).toBeNull()
      expect(isMemoryOnlyStorage()).toBe(true)
      // Därefter bara minnet – IndexedDB anropas inte igen.
      await idbStorage.setItem('k', value(3))
      expect(setMock).not.toHaveBeenCalled()
      expect(await idbStorage.getItem('k')).toEqual(value(3))
      expect(getMock).toHaveBeenCalledTimes(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('svarar inom 100 ms även med riktiga timers när IndexedDB kastar synkront', async () => {
    vi.useRealTimers()
    getMock.mockImplementationOnce(() => {
      throw new DOMException('Lagring spärrad', 'SecurityError')
    })
    const start = performance.now()
    expect(await idbStorage.getItem('k')).toBeNull()
    expect(performance.now() - start).toBeLessThan(100)
    expect(isMemoryOnlyStorage()).toBe(true)
  })

  it('en kastande indexedDB-getter räknas som saknad IndexedDB', async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB')
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      get() {
        throw new DOMException('Webbplatsdata avstängd', 'SecurityError')
      },
    })
    try {
      expect(isMemoryOnlyStorage()).toBe(true)
      expect(await idbStorage.getItem('k')).toBeNull()
      expect(getMock).not.toHaveBeenCalled()
      await idbStorage.setItem('k', value(1))
      expect(setMock).not.toHaveBeenCalled()
    } finally {
      if (original) Object.defineProperty(globalThis, 'indexedDB', original)
    }
    expect(isMemoryOnlyStorage()).toBe(false)
  })
})

describe('versionsskydd', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    reads.length = 0
    writes.length = 0
    getMock.mockClear()
    setMock.mockClear()
    resetStorageStateForTests()
  })
  afterEach(() => vi.useRealTimers())

  it('har version 1 för alla sex butikerna', () => {
    expect(Object.values(STORE_KEYS)).toEqual(
      expect.arrayContaining(['lagom-profile', 'lagom-diary', 'lagom-food', 'lagom-body', 'lagom-fasting', 'lagom-license']),
    )
    for (const key of Object.values(STORE_KEYS)) expect(PERSIST_VERSIONS[key]).toBe(1)
  })

  it('läser versionen i ett sparat värde', () => {
    expect(storedVersion(JSON.stringify({ state: { a: 1 }, version: 1 }))).toBe(1)
    expect(storedVersion(JSON.stringify({ state: { lång: 'x'.repeat(500) }, version: 12 }))).toBe(12)
    // Versionen först i objektet (inte så zustand skriver, men giltigt) – tolkas i sin helhet.
    expect(storedVersion(JSON.stringify({ version: 3, state: { a: 1 } }))).toBe(3)
    // En "version" inne i datan räknas inte.
    expect(storedVersion(JSON.stringify({ state: { x: { version: 9 } } }))).toBeUndefined()
    expect(storedVersion('inte json')).toBeUndefined()
    expect(storedVersion(JSON.stringify({ state: {}, version: 'två' }))).toBeUndefined()
  })

  it('data från en nyare version läses inte in och skrivs aldrig över efter set()', async () => {
    type S = { n: number; setN: (n: number) => void }
    const useTest = create<S>()(
      persist((set) => ({ n: 0, setN: (n) => set({ n }) }), {
        name: STORE_KEYS.diary,
        storage: idbStorage,
        version: PERSIST_VERSIONS[STORE_KEYS.diary],
        migrate: (persisted) => persisted as S,
      }),
    )
    await vi.advanceTimersByTimeAsync(0)
    expect(getMock).toHaveBeenCalledWith(STORE_KEYS.diary)
    reads[0].resolve(JSON.stringify({ state: { n: 99, nyttFält: true }, version: 2 }))
    await vi.advanceTimersByTimeAsync(0)
    expect(useTest.persist.hasHydrated()).toBe(true)
    // Butiken startar tom …
    expect(useTest.getState().n).toBe(0)
    expect(hasNewerData()).toBe(true)
    expect(isMemoryOnlyStorage()).toBe(true)
    // … och en ändring sparas bara i minnet – den nyare datan skrivs aldrig över.
    useTest.getState().setN(5)
    await vi.advanceTimersByTimeAsync(0)
    expect(setMock).not.toHaveBeenCalled()

    // En ny inläsning (t.ex. från en annan flik) ger samma skydd.
    const again = idbStorage.getItem(STORE_KEYS.diary)
    await vi.advanceTimersByTimeAsync(0)
    reads[1].resolve(JSON.stringify({ state: { n: 99 }, version: 2 }))
    expect(await again).toEqual({ state: { n: 5 }, version: 1 })
    await idbStorage.setItem(STORE_KEYS.diary, value(6))
    expect(setMock).not.toHaveBeenCalled()
    // Den nyare datan raderas inte heller härifrån.
    await idbStorage.removeItem(STORE_KEYS.diary)
    expect(hasNewerData()).toBe(true)
  })

  /** En annan flik sparar: den skriver en ny stämpel i localStorage. */
  const otherTabSaves = (name: string) => localStorage.setItem(`lagom-sparad:${name}`, `annan-${Math.random()}`)

  it('canRehydrate: bara nycklar som är inlästa, har ändrats någon annanstans och inte kommer från en nyare version', async () => {
    const p = idbStorage.getItem(STORE_KEYS.food)
    // Läsningen pågår.
    expect(canRehydrate(STORE_KEYS.food)).toBe(false)
    reads[0].resolve(JSON.stringify(value(1)))
    await p
    // Inget har ändrats sedan läsningen – ingen onödig inläsning av hela butiken.
    expect(canRehydrate(STORE_KEYS.food)).toBe(false)
    otherTabSaves(STORE_KEYS.food)
    expect(canRehydrate(STORE_KEYS.food)).toBe(true)
    const q = idbStorage.getItem(STORE_KEYS.profile)
    reads[1].resolve(JSON.stringify({ state: {}, version: 2 }))
    await q
    otherTabSaves(STORE_KEYS.profile)
    expect(canRehydrate(STORE_KEYS.profile)).toBe(false)
  })

  it('canRehydrate: egna sparningar räknas inte som ändringar, andra flikars gör det', async () => {
    const p = idbStorage.getItem(STORE_KEYS.body)
    reads[0].resolve(JSON.stringify(value(1)))
    await p
    const w = idbStorage.setItem(STORE_KEYS.body, value(2))
    writes[0].resolve()
    await w
    expect(canRehydrate(STORE_KEYS.body)).toBe(false)
    otherTabSaves(STORE_KEYS.body)
    expect(canRehydrate(STORE_KEYS.body)).toBe(true)
    // Efter en ny inläsning är fliken i kapp igen.
    const again = idbStorage.getItem(STORE_KEYS.body)
    reads[1].resolve(JSON.stringify(value(3)))
    await again
    expect(canRehydrate(STORE_KEYS.body)).toBe(false)
  })

  it('canRehydrate: går localStorage inte att läsa läses butiken in som förut', async () => {
    const p = idbStorage.getItem(STORE_KEYS.fasting)
    reads[0].resolve(JSON.stringify(value(1)))
    await p
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Blockerad', 'SecurityError')
    })
    try {
      expect(canRehydrate(STORE_KEYS.fasting)).toBe(true)
    } finally {
      spy.mockRestore()
    }
  })

  it('canRehydrate: inte efter en misslyckad sparning – ändringarna finns bara i minnet', async () => {
    const p = idbStorage.getItem(STORE_KEYS.diary)
    reads[0].resolve(JSON.stringify(value(1)))
    await p
    const failed = idbStorage.setItem(STORE_KEYS.diary, value(2))
    writes[0].reject(new DOMException('Fullt', 'QuotaExceededError'))
    await failed
    await vi.advanceTimersByTimeAsync(0)
    // En ny inläsning skulle ersätta ändringen med den äldre datan i IndexedDB – även om en annan
    // flik har sparat under tiden.
    otherTabSaves(STORE_KEYS.diary)
    expect(canRehydrate(STORE_KEYS.diary)).toBe(false)
    const ok = idbStorage.setItem(STORE_KEYS.diary, value(3))
    writes[1].resolve()
    await ok
    otherTabSaves(STORE_KEYS.diary)
    expect(canRehydrate(STORE_KEYS.diary)).toBe(true)
  })

  it('samma eller äldre version läses in som vanligt', async () => {
    const p = idbStorage.getItem(STORE_KEYS.body)
    reads[0].resolve(JSON.stringify({ state: { n: 1 }, version: 0 }))
    expect(await p).toEqual({ state: { n: 1 }, version: 0 })
    expect(hasNewerData()).toBe(false)
    const w = idbStorage.setItem(STORE_KEYS.body, value(2))
    expect(setMock).toHaveBeenCalledTimes(1)
    writes[0].resolve()
    await w
    // Okända nycklar (utan känd version) skyddas inte.
    const q = idbStorage.getItem('annan-nyckel')
    reads[1].resolve(JSON.stringify({ state: {}, version: 7 }))
    expect(await q).toEqual({ state: {}, version: 7 })
    expect(hasNewerData()).toBe(false)
  })

  it('"Radera all data" släpper skyddet – utom för nycklar som ska behållas', async () => {
    const d = idbStorage.getItem(STORE_KEYS.diary)
    const l = idbStorage.getItem(STORE_KEYS.license)
    reads[0].resolve(JSON.stringify({ state: {}, version: 2 }))
    reads[1].resolve(JSON.stringify({ state: {}, version: 2 }))
    await d
    await l
    expect(hasNewerData()).toBe(true)
    releaseNewerData([STORE_KEYS.license])
    // Licensen (med provstarten) är fortfarande skyddad …
    expect(hasNewerData()).toBe(true)
    await idbStorage.setItem(STORE_KEYS.license, value(0))
    expect(setMock).not.toHaveBeenCalled()
    // … men dagboken får skrivas över (raderas).
    const w = idbStorage.setItem(STORE_KEYS.diary, value(0))
    expect(setMock).toHaveBeenCalledWith(STORE_KEYS.diary, JSON.stringify(value(0)))
    writes[0].resolve()
    await w
    releaseNewerData()
    expect(hasNewerData()).toBe(false)
  })
})

describe('minnets kopia (docs/LAGRING.md §9 punkt 5)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    reads.length = 0
    writes.length = 0
    getMock.mockClear()
    setMock.mockClear()
    resetStorageStateForTests()
  })
  afterEach(() => vi.useRealTimers())

  /** Läs nyckeln (inget sparat) så att den får skrivas. */
  async function readEmpty(name: string, i = 0) {
    const p = idbStorage.getItem(name)
    reads[i].resolve(undefined)
    await p
  }

  /** IndexedDB slutar fungera: nästa läsning misslyckas och ger minnesläge. */
  async function breakIdb(name: string, i: number) {
    const p = idbStorage.getItem(name)
    reads[i].reject(new DOMException('Borta', 'UnknownError'))
    return p
  }

  it('släpps efter en lyckad skrivning – då behåller butiken sitt tillstånd i stället', async () => {
    await readEmpty('k')
    const w = idbStorage.setItem('k', value(1))
    writes[0].resolve()
    await w
    // Ingen kopia kvar: läsningen ger null, och zustand behåller då butikens nuvarande tillstånd.
    expect(await breakIdb('k', 1)).toBeNull()
    expect(isMemoryOnlyStorage()).toBe(true)
    // Därefter sparas ändringarna i minnet som förut.
    await idbStorage.setItem('k', value(2))
    expect(await idbStorage.getItem('k')).toEqual(value(2))
  })

  it('behålls när en nyare skrivning har startat innan den förra blev klar', async () => {
    await readEmpty('k')
    const first = idbStorage.setItem('k', value(1))
    const second = idbStorage.setItem('k', value(2))
    writes[0].resolve()
    await first
    expect(await breakIdb('k', 1)).toEqual(value(2))
    writes[1].resolve()
    await second
  })

  it('behålls när skrivningen misslyckas', async () => {
    await readEmpty('k')
    const w = idbStorage.setItem('k', value(1))
    writes[0].reject(new DOMException('Fullt', 'QuotaExceededError'))
    await w
    await vi.advanceTimersByTimeAsync(0)
    expect(await breakIdb('k', 1)).toEqual(value(1))
  })

  it('en butik behåller sitt tillstånd när IndexedDB slutar fungera efter en lyckad skrivning', async () => {
    type S = { n: number; setN: (n: number) => void }
    const useTest = create<S>()(
      persist((set) => ({ n: 0, setN: (n) => set({ n }) }), { name: 'minnestest', storage: idbStorage, version: 1 }),
    )
    await vi.advanceTimersByTimeAsync(0)
    reads[0].resolve(JSON.stringify(value(3)))
    await vi.advanceTimersByTimeAsync(0)
    expect(useTest.getState().n).toBe(3)
    useTest.getState().setN(4)
    writes[0].resolve()
    await vi.advanceTimersByTimeAsync(0)
    const again = useTest.persist.rehydrate()
    reads[1].reject(new DOMException('Borta', 'UnknownError'))
    await again
    expect(useTest.getState().n).toBe(4)
  })
})

describe('gemensamma skydd för egna lagringar', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetStorageStateForTests()
  })
  afterEach(() => vi.useRealTimers())

  it('data som inte går att tolka: minnesläge, skrivs aldrig över – tills "Radera all data"', async () => {
    const write = vi.fn(() => Promise.resolve())
    const remove = vi.fn(() => Promise.resolve())
    expect(await guardedRead('trasig', () => Promise.resolve({ status: 'unreadable' as const }))).toBeNull()
    expect(isMemoryOnlyStorage()).toBe(true)
    expect(hasNewerData()).toBe(false)
    expect(canRehydrate('trasig')).toBe(false)
    await guardedWrite('trasig', { n: 1 }, write)
    await guardedRemove('trasig', remove)
    expect(write).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
    // Minnet håller objektet (en referens, ingen kopia).
    const latest = { n: 2 }
    await guardedWrite('trasig', latest, write)
    expect(await guardedRead('trasig', () => Promise.resolve({ status: 'unreadable' as const }))).toBe(latest)
    // "Radera all data" släpper skyddet.
    releaseNewerData()
    expect(isMemoryOnlyStorage()).toBe(false)
    await guardedWrite('trasig', { n: 0 }, write)
    expect(write).toHaveBeenCalledTimes(1)
  })

  it('hasUnreadableData och hasProtectedData: skyddad data som saknas i en säkerhetskopia', async () => {
    expect(hasProtectedData()).toBe(false)
    await guardedRead('trasig', () => Promise.resolve({ status: 'unreadable' as const }))
    expect(hasUnreadableData()).toBe(true)
    expect(hasNewerData()).toBe(false)
    expect(hasProtectedData()).toBe(true)
    releaseNewerData()
    expect(hasProtectedData()).toBe(false)
    await guardedRead('ny', () => Promise.resolve({ status: 'newer' as const }))
    expect(hasUnreadableData()).toBe(false)
    expect(hasProtectedData()).toBe(true)
  })

  it('protectNewerData: en skrivning som hittar nyare data skyddar nyckeln – utom efter "Radera all data"', async () => {
    await guardedRead('k', () => Promise.resolve({ status: 'ok' as const, value: 1 }))
    const found = vi.fn(() => {
      expect(protectNewerData('k')).toBe(true)
      return Promise.reject(new Error('nyare'))
    })
    await guardedWrite('k', 2, found)
    expect(hasNewerData()).toBe(true)
    expect(canRehydrate('k')).toBe(false)
    // Syns som nyare data, inte som en misslyckad skrivning – och inget mer skrivs.
    const write = vi.fn(() => Promise.resolve())
    await guardedWrite('k', 3, write)
    expect(write).not.toHaveBeenCalled()
    // "Radera all data": skyddet släpps och skrivningen får skriva över …
    releaseNewerData()
    expect(isMemoryOnlyStorage()).toBe(false)
    expect(protectNewerData('k')).toBe(false)
    expect(hasNewerData()).toBe(false)
    await guardedWrite('k', 0, write)
    expect(write).toHaveBeenCalledTimes(1)
    // … tills nyckeln har lästs in igen.
    await guardedRead('k', () => Promise.resolve({ status: 'ok' as const, value: 0 }))
    expect(protectNewerData('k')).toBe(true)
    expect(hasNewerData()).toBe(true)
  })

  it('en läsning som går att tolka igen tar bort minnesläget', async () => {
    await guardedRead('k', () => Promise.resolve({ status: 'unreadable' as const }))
    expect(isMemoryOnlyStorage()).toBe(true)
    expect(await guardedRead('k', () => Promise.resolve({ status: 'ok' as const, value: 'v' }))).toBe('v')
    expect(isMemoryOnlyStorage()).toBe(false)
  })

  it('onAccept anropas bara när läsningen används – inte när den kom för sent', async () => {
    const accepted = vi.fn()
    let finish: () => void = () => {}
    const slow = guardedRead<string>('k', () => new Promise((resolve) => (finish = () => resolve({ status: 'ok', value: 'sen', onAccept: accepted }))))
    await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS + 10)
    expect(await slow).toBeNull()
    finish()
    await vi.advanceTimersByTimeAsync(0)
    expect(accepted).not.toHaveBeenCalled()
    expect(await guardedRead('k', () => Promise.resolve({ status: 'ok' as const, value: 'ny', onAccept: accepted }))).toBe('ny')
    expect(accepted).toHaveBeenCalledTimes(1)
  })

  it('changedElsewhere: bara när en annan flik har sparat (eller stämpeln är okänd)', async () => {
    const write = () => Promise.resolve()
    await guardedRead('k', () => Promise.resolve({ status: 'ok' as const, value: undefined }))
    expect(changedElsewhere('k')).toBe(false)
    await guardedWrite('k', 1, write)
    expect(changedElsewhere('k')).toBe(false)
    localStorage.setItem('lagom-sparad:k', 'annan-flik')
    expect(changedElsewhere('k')).toBe(true)
    // Aldrig läst eller skriven här: okänt – räknas som ändrat.
    expect(changedElsewhere('okand')).toBe(true)
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Blockerad', 'SecurityError')
    })
    try {
      // Går localStorage inte att läsa går det inte att avgöra.
      expect(changedElsewhere('k')).toBe(false)
    } finally {
      spy.mockRestore()
    }
  })
})

describe('signal mellan flikar', () => {
  /** Fejkad BroadcastChannel: meddelanden går till alla ANDRA instanser med samma namn. */
  class FakeChannel {
    static all: FakeChannel[] = []
    onmessage: ((e: MessageEvent) => void) | null = null
    closed = false
    readonly name: string
    constructor(name: string) {
      this.name = name
      FakeChannel.all.push(this)
    }
    postMessage(data: unknown) {
      for (const other of FakeChannel.all) {
        if (other !== this && other.name === this.name && !other.closed) other.onmessage?.(new MessageEvent('message', { data }))
      }
    }
    close() {
      this.closed = true
    }
  }

  async function loadWithChannel() {
    FakeChannel.all = []
    vi.stubGlobal('BroadcastChannel', FakeChannel)
    vi.resetModules()
    const mod = await import('./storage')
    // Modulen öppnar sin egen kanal när den laddas; en till instans spelar "den andra fliken".
    expect(FakeChannel.all).toHaveLength(1)
    return { mod, otherTab: new FakeChannel('lagom-store') }
  }

  beforeEach(() => {
    reads.length = 0
    writes.length = 0
    getMock.mockClear()
    setMock.mockClear()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('meddelar andra flikar efter en lyckad sparning – bara nyckelns namn, aldrig data', async () => {
    const { mod, otherTab } = await loadWithChannel()
    const received: unknown[] = []
    otherTab.onmessage = (e) => received.push(e.data)
    const store = mod.idbStorage!
    const r = store.getItem('lagom-diary')
    reads[0].resolve(undefined)
    await r
    const w = store.setItem('lagom-diary', value(1))
    expect(received).toEqual([])
    writes[0].resolve()
    await w
    expect(received).toEqual([{ name: 'lagom-diary' }])

    // En misslyckad sparning meddelas inte.
    const failed = store.setItem('lagom-diary', value(2))
    writes[1].reject(new DOMException('Fullt', 'QuotaExceededError'))
    await failed
    await Promise.resolve()
    expect(received).toHaveLength(1)
  })

  it('onRemoteWrite anropas när en annan flik har sparat', async () => {
    const { mod, otherTab } = await loadWithChannel()
    const listener = vi.fn()
    const off = mod.onRemoteWrite(listener)
    otherTab.postMessage({ name: 'lagom-food' })
    expect(listener).toHaveBeenCalledWith('lagom-food')
    // Skräp i kanalen ignoreras.
    otherTab.postMessage(null)
    otherTab.postMessage({ name: 42 })
    otherTab.postMessage({ name: '' })
    otherTab.postMessage('lagom-food')
    expect(listener).toHaveBeenCalledTimes(1)
    off()
    otherTab.postMessage({ name: 'lagom-food' })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('fungerar utan BroadcastChannel', async () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    vi.resetModules()
    const mod = await import('./storage')
    const store = mod.idbStorage!
    const r = store.getItem('k')
    reads[0].resolve(undefined)
    await r
    const w = store.setItem('k', value(1))
    writes[0].resolve()
    await expect(w).resolves.toBeUndefined()
    expect(mod.onRemoteWrite(() => {})).toBeTypeOf('function')
  })
})
