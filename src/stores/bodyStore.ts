import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ISODate, MeasurementEntry, WeightEntry } from '../types'
import { uid } from '../lib/id'
import { idbStorage, PERSIST_VERSIONS, STORE_KEYS } from './storage'

interface BodyState {
  /** Sorterad stigande på datum. Högst en vikt per dag (senaste ersätter). */
  weights: WeightEntry[]
  measurements: MeasurementEntry[]
  /** Lägg till eller ersätt dagens vikt. */
  logWeight: (date: ISODate, kg: number, note?: string) => WeightEntry
  /**
   * Som `logWeight` för flera dagar, med en enda skrivning – varje `set()` skriver om hela butiken,
   * så anropa aldrig `logWeight` i en slinga (t.ex. vikter från Apple Hälsa/Health Connect). Samma
   * regler som `logWeight`: en vikt per dag (den senare i listan ersätter), sorterad på datum, nytt
   * id per ersatt vikt, och ingen annan kontroll – anroparen avgör vad som är rimligt. Skillnaden: en
   * vikt som redan är exakt densamma (datum, kg, anteckning) lämnas orörd, och ändras inget alls
   * skrivs ingenting. Returnerar den lagrade vikten för varje angiven dag, i den ordning de gavs.
   */
  logWeights: (entries: ReadonlyArray<{ date: ISODate; kg: number; note?: string }>) => WeightEntry[]
  removeWeight: (id: string) => void
  addMeasurement: (m: Omit<MeasurementEntry, 'id' | 'createdAt'>) => MeasurementEntry
  removeMeasurement: (id: string) => void
  clearBody: () => void
}

const byDate = <T extends { date: ISODate }>(a: T, b: T) => a.date.localeCompare(b.date)

export const useBodyStore = create<BodyState>()(
  persist(
    (set, get) => ({
      weights: [],
      measurements: [],
      logWeight: (date, kg, note) => {
        const entry: WeightEntry = { id: uid('w_'), date, kg, note, createdAt: Date.now() }
        set({ weights: [...get().weights.filter((w) => w.date !== date), entry].sort(byDate) })
        return entry
      },
      logWeights: (entries) => {
        if (entries.length === 0) return []
        const now = Date.now()
        const current = get().weights
        const stored = new Map(current.map((w) => [w.date, w]))
        // Vikten som gäller för varje angiven dag när alla är inlagda (den senare ersätter den förra).
        const latest = new Map<ISODate, WeightEntry>()
        const added = new Set<WeightEntry>()
        for (const { date, kg, note } of entries) {
          const prev = latest.get(date) ?? stored.get(date)
          if (prev && prev.kg === kg && prev.note === note) {
            latest.set(date, prev)
            continue
          }
          const entry: WeightEntry = { id: uid('w_'), date, kg, note, createdAt: now }
          if (prev) added.delete(prev)
          added.add(entry)
          latest.set(date, entry)
        }
        if (added.size > 0) {
          const replaced = new Set([...added].map((w) => w.date))
          set({ weights: [...current.filter((w) => !replaced.has(w.date)), ...added].sort(byDate) })
        }
        return entries.flatMap((e) => latest.get(e.date) ?? [])
      },
      removeWeight: (id) => set({ weights: get().weights.filter((w) => w.id !== id) }),
      addMeasurement: (m) => {
        const entry: MeasurementEntry = { ...m, id: uid('m_'), createdAt: Date.now() }
        set({ measurements: [...get().measurements.filter((x) => x.date !== m.date), entry].sort(byDate) })
        return entry
      },
      removeMeasurement: (id) => set({ measurements: get().measurements.filter((m) => m.id !== id) }),
      clearBody: () => set({ weights: [], measurements: [] }),
    }),
    {
      name: STORE_KEYS.body,
      storage: idbStorage,
      version: PERSIST_VERSIONS[STORE_KEYS.body],
      // Framtida migreringar läggs här – kasta aldrig fel, skyddet mot nyare data ligger i storage.ts.
      migrate: (persisted) => persisted as BodyState,
    },
  ),
)

/** Senaste loggade vikten, eller undefined. */
export function latestWeight(weights: WeightEntry[]): WeightEntry | undefined {
  return weights.length ? weights[weights.length - 1] : undefined
}
