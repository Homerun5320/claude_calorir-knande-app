/**
 * Persistens för Zustand-butiker i IndexedDB (via idb-keyval).
 * All data stannar lokalt på enheten – inget konto, ingen server.
 */
import { del, get, set } from 'idb-keyval'
import { createJSONStorage, type StateStorage } from 'zustand/middleware'

const idbStateStorage: StateStorage = {
  getItem: async (name) => (await get<string>(name)) ?? null,
  setItem: async (name, value) => {
    await set(name, value)
  },
  removeItem: async (name) => {
    await del(name)
  },
}

export const idbStorage = createJSONStorage(() => idbStateStorage)

/** Nycklar för alla persisterade butiker (används av export/import och radering). */
export const STORE_KEYS = {
  profile: 'lagom-profile',
  diary: 'lagom-diary',
  food: 'lagom-food',
  body: 'lagom-body',
  fasting: 'lagom-fasting',
} as const
