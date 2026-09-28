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
  hasNewerData,
  isMemoryOnlyStorage,
  onLateRead,
  PERSIST_VERSIONS,
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
