/**
 * Små fabriker för tester i Insikter.
 */
import type { DiaryEntry, ExerciseEntry, Food, FoodCategory, MealId, Nutrients, WeightEntry } from '../../types'

let seq = 0

export function makeFood(name: string, per100: Nutrients, category: FoodCategory = 'ovrigt', extra: Partial<Food> = {}): Food {
  return { id: `lagom:${name.toLowerCase().replace(/\s+/g, '-')}`, name, source: 'lagom', category, nutrients: per100, portions: [], ...extra }
}

export function foodEntry(date: string, meal: MealId, food: Food, grams: number, time?: string): DiaryEntry {
  seq++
  return { kind: 'food', id: `e${seq}`, date, meal, createdAt: seq, food, amount: grams, unit: 'g', grams, time }
}

export function quickEntry(date: string, meal: MealId, name: string, nutrients: Nutrients, time?: string): DiaryEntry {
  seq++
  return { kind: 'quick', id: `q${seq}`, date, meal, createdAt: seq, name, nutrients, time }
}

export function exerciseEntry(date: string, kcal: number, minutes = 30): ExerciseEntry {
  seq++
  return { id: `x${seq}`, date, activityId: 'promenad', name: 'Promenad', minutes, kcal, createdAt: seq }
}

export function weightEntry(date: string, kg: number): WeightEntry {
  seq++
  return { id: `w${seq}`, date, kg, createdAt: seq }
}

/** Gruppera poster per datum som i dagboksbutiken. */
export function byDate<T extends { date: string }>(list: readonly T[]): Record<string, T[]> {
  const out: Record<string, T[]> = {}
  for (const x of list) (out[x.date] ??= []).push(x)
  return out
}
