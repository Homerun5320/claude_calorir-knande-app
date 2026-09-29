import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { DayMeta, DiaryEntry, ExerciseEntry, FoodEntry, ISODate, MealId, QuickEntry } from '../types'
import { uid } from '../lib/id'
import { idbStorage, PERSIST_VERSIONS, STORE_KEYS } from './storage'

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
  /**
   * Tar bort flera poster med en enda skrivning och returnerar dem (för ångra). Använd den i
   * stället för `removeEntry` i en slinga – varje `set()` skriver om hela dagboken (docs/LAGRING.md).
   */
  removeEntries: (refs: ReadonlyArray<Pick<DiaryEntry, 'date' | 'id'>>) => DiaryEntry[]
  /** Återställ flera borttagna poster med en enda skrivning (ångra). */
  restoreEntries: (list: readonly DiaryEntry[]) => void
  moveEntry: (date: ISODate, id: string, toDate: ISODate, toMeal: MealId) => void
  /** Kopiera en måltid till annan dag/måltid. Returnerar antal kopierade poster. */
  copyMeal: (fromDate: ISODate, fromMeal: MealId, toDate: ISODate, toMeal: MealId) => number
  copyDay: (fromDate: ISODate, toDate: ISODate) => number

  addWater: (date: ISODate, ml: number) => void
  setWater: (date: ISODate, ml: number) => void

  addExercise: (e: NewExerciseEntry) => ExerciseEntry
  updateExercise: (date: ISODate, id: string, patch: Partial<ExerciseEntry>) => void
  /** Tar bort och returnerar träningsposten (för ångra). */
  removeExercise: (date: ISODate, id: string) => ExerciseEntry | undefined
  /** Återställ en borttagen träningspost med samma id och ordning (ångra). */
  restoreExercise: (entry: ExerciseEntry) => void

  setDayMeta: (date: ISODate, patch: Partial<DayMeta>) => void
  /** Samma som `setDayMeta` för flera dagar, med en enda skrivning (t.ex. steg från Hälsa). */
  setDayMetas: (changes: ReadonlyArray<{ date: ISODate; patch: Partial<DayMeta> }>) => void
  clearDiary: () => void
}

const withEntry = (map: Record<ISODate, DiaryEntry[]>, entry: DiaryEntry) => ({
  ...map,
  [entry.date]: [...(map[entry.date] ?? []), entry],
})

/** Ändrar `patch` något i dagens uppgifter? (Ingen ändring – ingen omskrivning av dagboken.) */
function changesDay(cur: DayMeta | undefined, patch: Partial<DayMeta>): boolean {
  if (!cur) return true
  return (Object.keys(patch) as (keyof DayMeta)[]).some((k) => cur[k] !== patch[k])
}

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
      removeEntries: (refs) => {
        const byDate = new Map<ISODate, Set<string>>()
        for (const { date, id } of refs) {
          const ids = byDate.get(date) ?? new Set<string>()
          ids.add(id)
          byDate.set(date, ids)
        }
        const entries = { ...get().entries }
        const removed: DiaryEntry[] = []
        for (const [date, ids] of byDate) {
          const list = entries[date]
          if (!list) continue
          const keep = list.filter((e) => !ids.has(e.id))
          if (keep.length === list.length) continue
          removed.push(...list.filter((e) => ids.has(e.id)))
          if (keep.length) entries[date] = keep
          else delete entries[date]
        }
        if (removed.length) set({ entries })
        return removed
      },
      restoreEntries: (list) => {
        const entries = { ...get().entries }
        let changed = false
        for (const entry of list) {
          const day = entries[entry.date] ?? []
          if (day.some((e) => e.id === entry.id)) continue
          entries[entry.date] = [...day, entry].sort((a, b) => a.createdAt - b.createdAt)
          changed = true
        }
        if (changed) set({ entries })
      },
      moveEntry: (date, id, toDate, toMeal) => {
        // En skrivning: ta bort och lägg till i samma set().
        const list = get().entries[date]
        const found = list?.find((e) => e.id === id)
        if (!list || !found) return
        const next = list.filter((e) => e.id !== id)
        const entries = { ...get().entries }
        if (next.length) entries[date] = next
        else delete entries[date]
        set({ entries: withEntry(entries, { ...found, date: toDate, meal: toMeal }) })
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
        const water = get().water
        const next = Math.max(0, Math.round((water[date] ?? 0) + ml))
        // Ingen ändring – ingen omskrivning av hela dagboken.
        if (water[date] === next) return
        set({ water: { ...water, [date]: next } })
      },
      setWater: (date, ml) => {
        const water = get().water
        const next = Math.max(0, Math.round(ml))
        if (water[date] === next) return
        set({ water: { ...water, [date]: next } })
      },

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
        const next = list.filter((x) => x.id !== id)
        const exercise = { ...get().exercise }
        if (next.length) exercise[date] = next
        else delete exercise[date]
        set({ exercise })
        return found
      },
      restoreExercise: (entry) => {
        if (get().exercise[entry.date]?.some((x) => x.id === entry.id)) return
        const list = [...(get().exercise[entry.date] ?? []), entry].sort((a, b) => a.createdAt - b.createdAt)
        set({ exercise: { ...get().exercise, [entry.date]: list } })
      },

      setDayMeta: (date, patch) => {
        const cur = get().days[date]
        if (!changesDay(cur, patch)) return
        set({ days: { ...get().days, [date]: { ...cur, ...patch } } })
      },
      setDayMetas: (changes) => {
        let days = get().days
        for (const { date, patch } of changes) {
          if (!changesDay(days[date], patch)) continue
          if (days === get().days) days = { ...days }
          days[date] = { ...days[date], ...patch }
        }
        if (days !== get().days) set({ days })
      },
      clearDiary: () => set({ entries: {}, water: {}, exercise: {}, days: {} }),
    }),
    {
      name: STORE_KEYS.diary,
      storage: idbStorage,
      version: PERSIST_VERSIONS[STORE_KEYS.diary],
      // Framtida migreringar läggs här – kasta aldrig fel, skyddet mot nyare data ligger i storage.ts.
      migrate: (persisted) => persisted as DiaryState,
    },
  ),
)
