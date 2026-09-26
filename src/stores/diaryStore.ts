import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { DayMeta, DiaryEntry, ExerciseEntry, FoodEntry, ISODate, MealId, QuickEntry } from '../types'
import { uid } from '../lib/id'
import { idbStorage, STORE_KEYS } from './storage'

type NewFoodEntry = Omit<FoodEntry, 'id' | 'createdAt'>
type NewQuickEntry = Omit<QuickEntry, 'id' | 'createdAt'>
export type NewDiaryEntry = NewFoodEntry | NewQuickEntry
export type NewExerciseEntry = Omit<ExerciseEntry, 'id' | 'createdAt'>

interface DiaryState {
  /** Dagbok per datum. */
  entries: Record<ISODate, DiaryEntry[]>
  /** Vatten i ml per datum. */
  water: Record<ISODate, number>
  exercise: Record<ISODate, ExerciseEntry[]>
  days: Record<ISODate, DayMeta>

  addEntry: (e: NewDiaryEntry) => DiaryEntry
  addEntries: (list: NewDiaryEntry[]) => DiaryEntry[]
  updateEntry: (date: ISODate, id: string, patch: Partial<DiaryEntry>) => void
  /** Tar bort och returnerar posten (för ångra). */
  removeEntry: (date: ISODate, id: string) => DiaryEntry | undefined
  /** Återställ en borttagen post (ångra). */
  restoreEntry: (entry: DiaryEntry) => void
  moveEntry: (date: ISODate, id: string, toDate: ISODate, toMeal: MealId) => void
  /** Kopiera en måltid till annan dag/måltid. Returnerar antal kopierade poster. */
  copyMeal: (fromDate: ISODate, fromMeal: MealId, toDate: ISODate, toMeal: MealId) => number
  copyDay: (fromDate: ISODate, toDate: ISODate) => number

  addWater: (date: ISODate, ml: number) => void
  setWater: (date: ISODate, ml: number) => void

  addExercise: (e: NewExerciseEntry) => ExerciseEntry
  updateExercise: (date: ISODate, id: string, patch: Partial<ExerciseEntry>) => void
  removeExercise: (date: ISODate, id: string) => ExerciseEntry | undefined

  setDayMeta: (date: ISODate, patch: Partial<DayMeta>) => void
  clearDiary: () => void
}

const withEntry = (map: Record<ISODate, DiaryEntry[]>, entry: DiaryEntry) => ({
  ...map,
  [entry.date]: [...(map[entry.date] ?? []), entry],
})

function materialize(e: NewDiaryEntry): DiaryEntry {
  return { ...e, id: uid('e_'), createdAt: Date.now() } as DiaryEntry
}

export const useDiaryStore = create<DiaryState>()(
  persist(
    (set, get) => ({
      entries: {},
      water: {},
      exercise: {},
      days: {},

      addEntry: (e) => {
        const entry = materialize(e)
        set({ entries: withEntry(get().entries, entry) })
        return entry
      },
      addEntries: (list) => {
        let entries = get().entries
        const out = list.map(materialize)
        for (const entry of out) entries = withEntry(entries, entry)
        set({ entries })
        return out
      },
      updateEntry: (date, id, patch) => {
        const list = get().entries[date]
        if (!list) return
        set({
          entries: {
            ...get().entries,
            [date]: list.map((e) => (e.id === id ? ({ ...e, ...patch } as DiaryEntry) : e)),
          },
        })
      },
      removeEntry: (date, id) => {
        const list = get().entries[date]
        const found = list?.find((e) => e.id === id)
        if (!list || !found) return undefined
        const next = list.filter((e) => e.id !== id)
        const entries = { ...get().entries }
        if (next.length) entries[date] = next
        else delete entries[date]
        set({ entries })
        return found
      },
      restoreEntry: (entry) => {
        if (get().entries[entry.date]?.some((e) => e.id === entry.id)) return
        const list = [...(get().entries[entry.date] ?? []), entry].sort((a, b) => a.createdAt - b.createdAt)
        set({ entries: { ...get().entries, [entry.date]: list } })
      },
      moveEntry: (date, id, toDate, toMeal) => {
        const removed = get().removeEntry(date, id)
        if (!removed) return
        set({ entries: withEntry(get().entries, { ...removed, date: toDate, meal: toMeal }) })
      },
      copyMeal: (fromDate, fromMeal, toDate, toMeal) => {
        const src = (get().entries[fromDate] ?? []).filter((e) => e.meal === fromMeal)
        if (!src.length) return 0
        get().addEntries(
          src.map(({ id: _id, createdAt: _c, ...rest }) => ({ ...rest, date: toDate, meal: toMeal }) as NewDiaryEntry),
        )
        return src.length
      },
      copyDay: (fromDate, toDate) => {
        const src = get().entries[fromDate] ?? []
        if (!src.length) return 0
        get().addEntries(src.map(({ id: _id, createdAt: _c, ...rest }) => ({ ...rest, date: toDate }) as NewDiaryEntry))
        return src.length
      },

      addWater: (date, ml) => {
        const cur = get().water[date] ?? 0
        set({ water: { ...get().water, [date]: Math.max(0, Math.round(cur + ml)) } })
      },
      setWater: (date, ml) => set({ water: { ...get().water, [date]: Math.max(0, Math.round(ml)) } }),

      addExercise: (e) => {
        const entry: ExerciseEntry = { ...e, id: uid('x_'), createdAt: Date.now() }
        set({ exercise: { ...get().exercise, [e.date]: [...(get().exercise[e.date] ?? []), entry] } })
        return entry
      },
      updateExercise: (date, id, patch) => {
        const list = get().exercise[date]
        if (!list) return
        set({ exercise: { ...get().exercise, [date]: list.map((x) => (x.id === id ? { ...x, ...patch } : x)) } })
      },
      removeExercise: (date, id) => {
        const list = get().exercise[date]
        const found = list?.find((x) => x.id === id)
        if (!list || !found) return undefined
        set({ exercise: { ...get().exercise, [date]: list.filter((x) => x.id !== id) } })
        return found
      },

      setDayMeta: (date, patch) => set({ days: { ...get().days, [date]: { ...get().days[date], ...patch } } }),
      clearDiary: () => set({ entries: {}, water: {}, exercise: {}, days: {} }),
    }),
    { name: STORE_KEYS.diary, storage: idbStorage, version: 1 },
  ),
)
