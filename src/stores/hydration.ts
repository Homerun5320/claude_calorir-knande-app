import { useEffect, useState } from 'react'
import { useBodyStore } from './bodyStore'
import { useDiaryStore } from './diaryStore'
import { useFastingStore } from './fastingStore'
import { useFoodStore } from './foodStore'
import { useProfileStore } from './profileStore'
import { onLateRead, READ_TIMEOUT_MS, STORE_KEYS } from './storage'

const STORES = [useProfileStore, useDiaryStore, useFoodStore, useBodyStore, useFastingStore]

const BY_KEY: Record<string, (typeof STORES)[number]> = {
  [STORE_KEYS.profile]: useProfileStore,
  [STORE_KEYS.diary]: useDiaryStore,
  [STORE_KEYS.food]: useFoodStore,
  [STORE_KEYS.body]: useBodyStore,
  [STORE_KEYS.fasting]: useFastingStore,
}

// En läsning som tog för lång tid (t.ex. en stor dagbok på en äldre telefon) blev till slut klar:
// läs in butiken på nytt så att historiken kommer tillbaka i stället för att se ut att vara borta.
onLateRead((name) => {
  void BY_KEY[name]?.persist.rehydrate()
})

const allHydrated = () => STORES.every((s) => s.persist.hasHydrated())

/**
 * Längsta väntan på inläsning innan appen visas ändå (skydd mot hängande lagring). Lite längre
 * än lagringens egen tidsgräns för läsningar, så att en långsam men fungerande läsning hinner klart.
 */
const MAX_WAIT_MS = READ_TIMEOUT_MS + 1500

/** true när alla butiker har lästs in från IndexedDB (eller efter en säkerhetsgräns). */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(allHydrated)
  useEffect(() => {
    if (hydrated) return
    const unsubs = STORES.map((s) => s.persist.onFinishHydration(() => setHydrated(allHydrated())))
    setHydrated(allHydrated())
    const timer = window.setTimeout(() => setHydrated(true), MAX_WAIT_MS)
    return () => {
      unsubs.forEach((u) => u())
      window.clearTimeout(timer)
    }
  }, [hydrated])
  return hydrated
}
