/**
 * Summeringar av dagboksposter.
 */
import type { DiaryEntry, ExerciseEntry, Food, FoodEntry, MealId, Nutrients, UnitKey } from '../types'
import { nutrientsForGrams, sumNutrients } from './nutrients'
import { gramsFor } from './units'

/** Totala näringsvärden för en post. */
export function entryNutrients(e: DiaryEntry): Nutrients {
  return e.kind === 'quick' ? e.nutrients : nutrientsForGrams(e.food.nutrients, e.grams)
}

export function entryKcal(e: DiaryEntry): number {
  return entryNutrients(e).kcal ?? 0
}

export function totals(entries: readonly DiaryEntry[]): Nutrients {
  return sumNutrients(entries.map(entryNutrients))
}

export function entriesByMeal(entries: readonly DiaryEntry[]): Record<MealId, DiaryEntry[]> {
  const out = { frukost: [], lunch: [], fika: [], middag: [], kvallsmat: [], mellanmal: [] } as Record<MealId, DiaryEntry[]>
  for (const e of entries) (out[e.meal] ??= []).push(e)
  return out
}

/** Förbrukade träningskalorier för dagen. */
export function exerciseKcal(list: readonly ExerciseEntry[] | undefined): number {
  return (list ?? []).reduce((s, x) => s + (x.kcal || 0), 0)
}

/** Dagens energibudget: mål + andel av träningen. */
export function dailyBudget(targetKcal: number, exercise: readonly ExerciseEntry[] | undefined, addBackPct: number): number {
  return targetKcal + (exerciseKcal(exercise) * Math.max(0, Math.min(100, addBackPct))) / 100
}

/** Skapa en ny matpost (utan id/createdAt) för ett livsmedel. */
export function makeFoodEntry(
  food: Food,
  amount: number,
  unit: UnitKey,
  date: string,
  meal: MealId,
  time?: string,
): Omit<FoodEntry, 'id' | 'createdAt'> {
  const grams = gramsFor(food, amount, unit)
  return { kind: 'food', food, amount, unit, grams: Number.isFinite(grams) ? grams : 0, date, meal, time }
}
