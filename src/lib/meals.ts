import type { MealConfig, MealId } from '../types'

/** Ungefärliga klockslag per måltid – används för smarta förval. */
export const MEAL_HOURS: Record<MealId, [number, number]> = {
  frukost: [5, 10.5],
  lunch: [10.5, 14],
  fika: [14, 16.5],
  middag: [16.5, 20],
  kvallsmat: [20, 24],
  mellanmal: [0, 24],
}

export const MEAL_EMOJI: Record<MealId, string> = {
  frukost: '🥣',
  lunch: '🥗',
  fika: '☕',
  middag: '🍽️',
  kvallsmat: '🌙',
  mellanmal: '🍎',
}

/** Förvald måltid utifrån klockslaget, bland aktiverade måltider. */
export function mealForTime(meals: MealConfig[], now: Date = new Date()): MealId {
  const h = now.getHours() + now.getMinutes() / 60
  const enabled = meals.filter((m) => m.enabled)
  const match = enabled.find((m) => m.id !== 'mellanmal' && h >= MEAL_HOURS[m.id][0] && h < MEAL_HOURS[m.id][1])
  if (match) return match.id
  if (enabled.some((m) => m.id === 'mellanmal')) return 'mellanmal'
  return enabled[0]?.id ?? 'frukost'
}

export function mealName(meals: MealConfig[], id: MealId): string {
  return meals.find((m) => m.id === id)?.name ?? id
}
