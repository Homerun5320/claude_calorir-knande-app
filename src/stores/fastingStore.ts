import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { uid } from '../lib/id'
import { idbStorage, STORE_KEYS } from './storage'

export interface FastRecord {
  id: string
  /** Epoch ms */
  start: number
  end: number
  targetHours: number
  protocol: string
}

interface FastingState {
  active: { start: number; targetHours: number; protocol: string } | null
  history: FastRecord[]
  startFast: (targetHours: number, protocol: string, start?: number) => void
  endFast: () => FastRecord | undefined
  cancelFast: () => void
  removeFast: (id: string) => void
  clearFasting: () => void
}

export const useFastingStore = create<FastingState>()(
  persist(
    (set, get) => ({
      active: null,
      history: [],
      startFast: (targetHours, protocol, start = Date.now()) => set({ active: { start, targetHours, protocol } }),
      endFast: () => {
        const a = get().active
        if (!a) return undefined
        const rec: FastRecord = { id: uid('f_'), start: a.start, end: Date.now(), targetHours: a.targetHours, protocol: a.protocol }
        set({ active: null, history: [rec, ...get().history] })
        return rec
      },
      cancelFast: () => set({ active: null }),
      removeFast: (id) => set({ history: get().history.filter((h) => h.id !== id) }),
      clearFasting: () => set({ active: null, history: [] }),
    }),
    { name: STORE_KEYS.fasting, storage: idbStorage, version: 1 },
  ),
)
