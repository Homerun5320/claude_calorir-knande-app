import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ISODate, MeasurementEntry, WeightEntry } from '../types'
import { uid } from '../lib/id'
import { idbStorage, STORE_KEYS } from './storage'

interface BodyState {
  /** Sorterad stigande på datum. Högst en vikt per dag (senaste ersätter). */
  weights: WeightEntry[]
  measurements: MeasurementEntry[]
  /** Lägg till eller ersätt dagens vikt. */
  logWeight: (date: ISODate, kg: number, note?: string) => WeightEntry
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
      removeWeight: (id) => set({ weights: get().weights.filter((w) => w.id !== id) }),
      addMeasurement: (m) => {
        const entry: MeasurementEntry = { ...m, id: uid('m_'), createdAt: Date.now() }
        set({ measurements: [...get().measurements.filter((x) => x.date !== m.date), entry].sort(byDate) })
        return entry
      },
      removeMeasurement: (id) => set({ measurements: get().measurements.filter((m) => m.id !== id) }),
      clearBody: () => set({ weights: [], measurements: [] }),
    }),
    { name: STORE_KEYS.body, storage: idbStorage, version: 1 },
  ),
)

/** Senaste loggade vikten, eller undefined. */
export function latestWeight(weights: WeightEntry[]): WeightEntry | undefined {
  return weights.length ? weights[weights.length - 1] : undefined
}
