import { useMemo } from 'react'
import { useDiaryStore } from '../stores/diaryStore'
import { entriesByMeal, exerciseKcal, totals } from '../lib/diary'
import type { DiaryEntry, ExerciseEntry, ISODate, Nutrients, MealId, DayMeta } from '../types'

const EMPTY_ENTRIES: DiaryEntry[] = []
const EMPTY_EXERCISE: ExerciseEntry[] = []
const EMPTY_META: DayMeta = {}

export interface DayData {
  entries: DiaryEntry[]
  byMeal: Record<MealId, DiaryEntry[]>
  totals: Nutrients
  mealTotals: Record<MealId, Nutrients>
  exercise: ExerciseEntry[]
  exerciseKcal: number
  waterMl: number
  meta: DayMeta
}

/** All data för en dag, memoiserad. */
export function useDay(date: ISODate): DayData {
  const entries = useDiaryStore((s) => s.entries[date] ?? EMPTY_ENTRIES)
  const exercise = useDiaryStore((s) => s.exercise[date] ?? EMPTY_EXERCISE)
  const waterMl = useDiaryStore((s) => s.water[date] ?? 0)
  const meta = useDiaryStore((s) => s.days[date] ?? EMPTY_META)
  return useMemo(() => {
    const byMeal = entriesByMeal(entries)
    const mealTotals = Object.fromEntries(Object.entries(byMeal).map(([m, list]) => [m, totals(list)])) as Record<MealId, Nutrients>
    return {
      entries,
      byMeal,
      totals: totals(entries),
      mealTotals,
      exercise,
      exerciseKcal: exerciseKcal(exercise),
      waterMl,
      meta,
    }
  }, [entries, exercise, waterMl, meta])
}
