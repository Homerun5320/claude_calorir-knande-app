/**
 * Persistens för Zustand-butiker i IndexedDB (via idb-keyval).
 * All data stannar lokalt på enheten – inget konto, ingen server.
 *
 * Lagringen är tålig men aldrig tyst:
 * - Saknas IndexedDB eller går den inte att öppna (privat läge, blockerad lagring) sparas data i
 *   minnet för sessionen, så att appen aldrig fastnar i laddningsläget.
 * - En långsam läsning (stor dagbok på en äldre telefon) stänger INTE av lagringen. Appen visas
 *   efter en stund, men nyckeln skrivs aldrig över i IndexedDB förrän den sparade datan har
 *   lästs in – när läsningen till slut blir klar läses butiken in på nytt (`onLateRead`).
 * - En långsam skrivning får fortsätta i bakgrunden. Bara en skrivning som faktiskt misslyckas
 *   räknas som ett fel, och det försvinner så fort en senare skrivning lyckas.
 * - Allt detta syns för användaren via `isMemoryOnlyStorage()` / `subscribeStorageStatus()`.
 */
import { del, get, set } from 'idb-keyval'
import { createJSONStorage, type StateStorage } from 'zustand/middleware'

/** Hur länge en läsning får ta innan appen visas utan den (läsningen fortsätter i bakgrunden). */
export const READ_TIMEOUT_MS = 8000
/** Hur länge persist-mellanvaran väntar på en skrivning (skrivningen fortsätter i bakgrunden). */
const WRITE_WAIT_MS = 8000

const memory = new Map<string, string>()
/** IndexedDB saknas eller gick inte att öppna/läsa – allt sparas bara i minnet. */
let idbBroken = false
/** Nycklar vars sparade data ännu inte har lästs in – får inte skrivas över i IndexedDB. */
const unread = new Set<string>()
/** Nycklar vars läsning tog längre tid än `READ_TIMEOUT_MS`. */
const slowReads = new Set<string>()
/** Nycklar där senaste skrivningen misslyckades (t.ex. fullt lagringsutrymme). */
const failedWrites = new Set<string>()

const statusListeners = new Set<() => void>()
const lateReadListeners = new Set<(name: string) => void>()

function notify() {
  statusListeners.forEach((l) => l())
}

const TIMEOUT = Symbol('timeout')

/** Vänta högst `ms` på ett löfte. Löftet självt fortsätter även efter tidsgränsen. */
function within<T>(p: Promise<T>, ms: number): Promise<T | typeof TIMEOUT> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => resolve(TIMEOUT), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      },
    )
  })
}

function markBroken(e: unknown) {
  if (idbBroken) return
  if (import.meta.env.DEV) console.warn('Lagom: IndexedDB otillgänglig – sparar i minnet för den här sessionen.', e)
  idbBroken = true
  notify()
}

const idbAvailable = () => !idbBroken && typeof indexedDB !== 'undefined'

const idbStateStorage: StateStorage = {
  getItem: async (name) => {
    if (!idbAvailable()) return memory.get(name) ?? null
    // Markeras synkront, innan något hinner skriva – se `setItem`.
    unread.add(name)
    const read = get<string>(name)
    try {
      const v = await within(read, READ_TIMEOUT_MS)
      if (v === TIMEOUT) {
        slowReads.add(name)
        notify()
        read.then(
          () => {
            // Datan finns kvar och går att läsa – låt butiken läsa in den på nytt. `unread`
            // tas bort först när den nya läsningen lyckas, så inget skrivs över under tiden.
            slowReads.delete(name)
            notify()
            lateReadListeners.forEach((l) => l(name))
          },
          (e) => markBroken(e),
        )
        return memory.get(name) ?? null
      }
      unread.delete(name)
      if (slowReads.delete(name)) notify()
      return v ?? memory.get(name) ?? null
    } catch (e) {
      markBroken(e)
      return memory.get(name) ?? null
    }
  },
  setItem: async (name, value) => {
    memory.set(name, value)
    // Skriv aldrig över sparad data som ännu inte har lästs in (då skulle historiken försvinna).
    if (!idbAvailable() || unread.has(name)) return
    const write = set(name, value).then(
      () => {
        if (failedWrites.delete(name)) notify()
      },
      (e: unknown) => {
        if (import.meta.env.DEV) console.warn(`Lagom: kunde inte spara ${name}.`, e)
        if (!failedWrites.has(name)) {
          failedWrites.add(name)
          notify()
        }
      },
    )
    await within(write, WRITE_WAIT_MS)
  },
  removeItem: async (name) => {
    memory.delete(name)
    if (!idbAvailable()) return
    try {
      await within(del(name), WRITE_WAIT_MS)
    } catch (e) {
      markBroken(e)
    }
  },
}

export const idbStorage = createJSONStorage(() => idbStateStorage)

/**
 * true om ändringar just nu inte sparas på enheten: IndexedDB saknas eller är blockerad, en
 * skrivning har misslyckats eller sparad data har ännu inte kunnat läsas in.
 */
export function isMemoryOnlyStorage(): boolean {
  return !idbAvailable() || failedWrites.size > 0 || slowReads.size > 0
}

/** Prenumerera på ändringar av `isMemoryOnlyStorage()`. Returnerar avprenumeration. */
export function subscribeStorageStatus(listener: () => void): () => void {
  statusListeners.add(listener)
  return () => statusListeners.delete(listener)
}

/** Anropas när en läsning som tog för lång tid till slut blev klar (butiken bör läsas in igen). */
export function onLateRead(listener: (name: string) => void): () => void {
  lateReadListeners.add(listener)
  return () => lateReadListeners.delete(listener)
}

/** Endast för tester: återställ modulens tillstånd. */
export function resetStorageStateForTests(): void {
  memory.clear()
  unread.clear()
  slowReads.clear()
  failedWrites.clear()
  idbBroken = false
  notify()
}

/** Nycklar för alla persisterade butiker (används av export/import och radering). */
export const STORE_KEYS = {
  profile: 'lagom-profile',
  diary: 'lagom-diary',
  food: 'lagom-food',
  body: 'lagom-body',
  fasting: 'lagom-fasting',
  license: 'lagom-license',
} as const
