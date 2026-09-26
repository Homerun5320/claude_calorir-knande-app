import { useEffect, useState } from 'react'
import { useBodyStore } from './bodyStore'
import { useDiaryStore } from './diaryStore'
import { useFastingStore } from './fastingStore'
import { useFoodStore } from './foodStore'
import { useProfileStore } from './profileStore'

const STORES = [useProfileStore, useDiaryStore, useFoodStore, useBodyStore, useFastingStore]

const allHydrated = () => STORES.every((s) => s.persist.hasHydrated())

/** true när alla butiker har lästs in från IndexedDB. */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(allHydrated)
  useEffect(() => {
    if (hydrated) return
    const unsubs = STORES.map((s) => s.persist.onFinishHydration(() => setHydrated(allHydrated())))
    setHydrated(allHydrated())
    return () => unsubs.forEach((u) => u())
  }, [hydrated])
  return hydrated
}
