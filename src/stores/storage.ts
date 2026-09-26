/**
 * Persistens för Zustand-butiker i IndexedDB (via idb-keyval).
 * All data stannar lokalt på enheten – inget konto, ingen server.
 *
 * Lagringen är tålig: om IndexedDB saknas, är blockerad (privat läge, inbäddad förhandsvisning)
 * eller inte svarar faller den tillbaka på ett minneslager för sessionen, så att appen aldrig
 * fastnar i laddningsläget.
 */
import { del, get, set } from 'idb-keyval'
import { createJSONStorage, type StateStorage } from 'zustand/middleware'

const memory = new Map<string, string>()
let idbBroken = false

/** Avbryt en IndexedDB-operation som hänger (t.ex. blockerad öppning). */
function withTimeout<T>(p: Promise<T>, ms = 2500): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('IndexedDB svarar inte')), ms)
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
  if (!idbBroken && import.meta.env.DEV) console.warn('Lagom: IndexedDB otillgänglig – sparar i minnet för den här sessionen.', e)
  idbBroken = true
}

const idbStateStorage: StateStorage = {
  getItem: async (name) => {
    if (idbBroken || typeof indexedDB === 'undefined') return memory.get(name) ?? null
    try {
      const v = await withTimeout(get<string>(name))
      return v ?? memory.get(name) ?? null
    } catch (e) {
      markBroken(e)
      return memory.get(name) ?? null
    }
  },
  setItem: async (name, value) => {
    memory.set(name, value)
    if (idbBroken || typeof indexedDB === 'undefined') return
    try {
      await withTimeout(set(name, value))
    } catch (e) {
      markBroken(e)
    }
  },
  removeItem: async (name) => {
    memory.delete(name)
    if (idbBroken || typeof indexedDB === 'undefined') return
    try {
      await withTimeout(del(name))
    } catch (e) {
      markBroken(e)
    }
  },
}

export const idbStorage = createJSONStorage(() => idbStateStorage)

/** true om data just nu bara sparas i minnet (IndexedDB otillgänglig). */
export function isMemoryOnlyStorage(): boolean {
  return idbBroken || typeof indexedDB === 'undefined'
}

/** Nycklar för alla persisterade butiker (används av export/import och radering). */
export const STORE_KEYS = {
  profile: 'lagom-profile',
  diary: 'lagom-diary',
  food: 'lagom-food',
  body: 'lagom-body',
  fasting: 'lagom-fasting',
} as const
