import { useEffect, useState } from 'react'
import { useBodyStore } from './bodyStore'
import { useDiaryStore } from './diaryStore'
import { useFastingStore } from './fastingStore'
import { useFoodStore } from './foodStore'
import { useProfileStore } from './profileStore'

const STORES = [useProfileStore, useDiaryStore, useFoodStore, useBodyStore, useFastingStore]

const allHydrated = () => STORES.every((s) => s.persist.hasHydrated())

/** Längsta väntan på inläsning innan appen visas ändå (skydd mot hängande lagring). */
const MAX_WAIT_MS = 4000

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
