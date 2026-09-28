import { useEffect, useState } from 'react'
import { useBodyStore } from './bodyStore'
import { useCloudStore } from './cloudStore'
import { useDiaryStore } from './diaryStore'
import { useFastingStore } from './fastingStore'
import { useFoodStore } from './foodStore'
import { useProfileStore } from './profileStore'
import { useLicenseStore } from './licenseStore'
import { usePlanStore } from './planStore'
import { canRehydrate, onLateRead, onRemoteWrite, READ_TIMEOUT_MS, STORE_KEYS } from './storage'

/**
 * Butikerna som ska vara inlästa innan appen visas. Lagom Moln (`useCloudStore`) ingår, men inte
 * i `BY_KEY`/`STORE_KEYS` – den sköter själv inläsningen från andra flikar och ska aldrig med i
 * säkerhetskopior eller "Radera all data".
 */
const STORES = [useProfileStore, useDiaryStore, useFoodStore, useBodyStore, useFastingStore, useLicenseStore, usePlanStore, useCloudStore]

type PersistedStore = Pick<(typeof STORES)[number], 'persist'>

const BY_KEY: Record<string, PersistedStore> = {
  [STORE_KEYS.profile]: useProfileStore,
  [STORE_KEYS.diary]: useDiaryStore,
  [STORE_KEYS.food]: useFoodStore,
  [STORE_KEYS.body]: useBodyStore,
  [STORE_KEYS.fasting]: useFastingStore,
  [STORE_KEYS.license]: useLicenseStore,
  [STORE_KEYS.plan]: usePlanStore,
}

// En läsning som tog för lång tid (t.ex. en stor dagbok på en äldre telefon) blev till slut klar:
// läs in butiken på nytt så att historiken kommer tillbaka i stället för att se ut att vara borta.
onLateRead((name) => {
  void BY_KEY[name]?.persist.rehydrate()
})

// En annan flik har sparat en butik: läs in den på nytt, så att den här fliken inte skriver över
// den nyare datan med sin gamla. `canRehydrate` är false för butiker som läses just nu, har data
// från en nyare version eller inte har ändrats sedan fliken läste dem.
onRemoteWrite((name) => {
  if (canRehydrate(name)) void BY_KEY[name]?.persist.rehydrate()
})

// Fliken blir synlig igen (t.ex. efter att Lagom varit öppen i en annan flik): läs in de butiker
// som har ändrats under tiden.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    for (const [name, store] of Object.entries(BY_KEY)) {
      if (canRehydrate(name)) void store.persist.rehydrate()
    }
  })
}

const allHydrated = () => STORES.every((s) => s.persist.hasHydrated())

/**
 * Längsta väntan på inläsning innan appen visas ändå (skydd mot hängande lagring). Lite längre
 * än lagringens egen tidsgräns för läsningar, så att en långsam men fungerande läsning hinner klart.
 */
const MAX_WAIT_MS = READ_TIMEOUT_MS + 1500

/**
 * När väntan tar slut (sätts av den första `useHydrated`). Senare anrop väntar bara den tid som är
 * kvar – och inte alls om tiden redan har gått – så att varje ny sida inte väntar på nytt.
 */
let waitDeadline: number | null = null

const waitedOut = () => waitDeadline !== null && Date.now() >= waitDeadline

/** true när alla butiker har lästs in från IndexedDB (eller efter en säkerhetsgräns). */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(() => allHydrated() || waitedOut())
  useEffect(() => {
    if (hydrated) return
    waitDeadline ??= Date.now() + MAX_WAIT_MS
    const check = () => setHydrated(allHydrated() || waitedOut())
    const unsubs = STORES.map((s) => s.persist.onFinishHydration(check))
    check()
    const timer = window.setTimeout(() => setHydrated(true), Math.max(0, waitDeadline - Date.now()))
    return () => {
      unsubs.forEach((u) => u())
      window.clearTimeout(timer)
    }
  }, [hydrated])
  return hydrated
}
