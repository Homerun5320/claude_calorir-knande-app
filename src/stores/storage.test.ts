import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Styrbar IndexedDB: varje anrop lämnar ett löfte som testet självt löser eller avvisar.
type Pending<T> = { resolve: (v: T) => void; reject: (e: unknown) => void }
const reads: Pending<string | undefined>[] = []
const writes: Pending<void>[] = []
const getMock = vi.fn(() => new Promise<string | undefined>((resolve, reject) => reads.push({ resolve, reject })))
const setMock = vi.fn(() => new Promise<void>((resolve, reject) => writes.push({ resolve, reject })))

vi.mock('idb-keyval', () => ({
  get: () => getMock(),
  set: () => setMock(),
  del: () => Promise.resolve(),
}))

const storage = await import('./storage')
const { isMemoryOnlyStorage, onLateRead, READ_TIMEOUT_MS, resetStorageStateForTests } = storage
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
})
