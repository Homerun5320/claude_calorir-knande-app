import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { DiaryEntry, Food, ISODate, MealId, MealTemplate, Recipe, UnitKey } from '../types'
import { idbStorage, STORE_KEYS } from './storage'

export interface FoodUsage {
  count: number
  lastUsed: number
  lastAmount: number
  lastUnit: UnitKey
  /** Hur ofta livsmedlet loggats per måltid – används för smarta förslag. */
  meals: Partial<Record<MealId, number>>
}

/**
 * Bygg användningsstatistik ("Senaste", förslag per måltid) från dagboksposter – samma fält som
 * `recordUsage` fyller i när man loggar. Används när dagboken fylls på i efterhand (exempeldata).
 */
export function usageFromEntries(entries: Record<ISODate, readonly DiaryEntry[]>): Record<string, FoodUsage> {
  const usage: Record<string, FoodUsage> = {}
  const foodEntries = Object.values(entries)
    .flat()
    .filter((e) => e.kind === 'food')
    .sort((a, b) => a.createdAt - b.createdAt)
  for (const e of foodEntries) {
    const cur = usage[e.food.id]
    usage[e.food.id] = {
      count: (cur?.count ?? 0) + 1,
      lastUsed: e.createdAt,
      lastAmount: e.amount,
      lastUnit: e.unit,
      meals: { ...(cur?.meals ?? {}), [e.meal]: (cur?.meals?.[e.meal] ?? 0) + 1 },
    }
  }
  return usage
}

interface FoodState {
  /** Egna livsmedel (id 'custom:*'). */
  customFoods: Record<string, Food>
  /** Egna recept (id 'recipe:*'). */
  recipes: Record<string, Recipe>
  /** Livsmedel hämtade online (Open Food Facts/Livsmedelsverket) – sparas för offlineåtkomst. */
  cachedFoods: Record<string, Food>
  favorites: string[]
  usage: Record<string, FoodUsage>
  templates: MealTemplate[]

  addCustomFood: (f: Food) => void
  updateCustomFood: (id: string, patch: Partial<Food>) => void
  removeCustomFood: (id: string) => void
  saveRecipe: (r: Recipe) => void
  removeRecipe: (id: string) => void
  cacheFood: (f: Food) => void
  toggleFavorite: (id: string) => void
  recordUsage: (foodId: string, amount: number, unit: UnitKey, meal: MealId) => void
  saveTemplate: (t: MealTemplate) => void
  removeTemplate: (id: string) => void
  clearFoods: () => void
}

export const useFoodStore = create<FoodState>()(
  persist(
    (set, get) => ({
      customFoods: {},
      recipes: {},
      cachedFoods: {},
      favorites: [],
      usage: {},
      templates: [],

      addCustomFood: (f) => set({ customFoods: { ...get().customFoods, [f.id]: { ...f, createdAt: f.createdAt ?? Date.now(), updatedAt: Date.now() } } }),
      updateCustomFood: (id, patch) => {
        const cur = get().customFoods[id]
        if (!cur) return
        set({ customFoods: { ...get().customFoods, [id]: { ...cur, ...patch, id, updatedAt: Date.now() } } })
      },
      removeCustomFood: (id) => {
        const next = { ...get().customFoods }
        delete next[id]
        set({ customFoods: next, favorites: get().favorites.filter((f) => f !== id) })
      },
      saveRecipe: (r) => set({ recipes: { ...get().recipes, [r.id]: { ...r, updatedAt: Date.now() } } }),
      removeRecipe: (id) => {
        const next = { ...get().recipes }
        delete next[id]
        set({ recipes: next, favorites: get().favorites.filter((f) => f !== id) })
      },
      cacheFood: (f) => set({ cachedFoods: { ...get().cachedFoods, [f.id]: f } }),
      toggleFavorite: (id) => {
        const favs = get().favorites
        set({ favorites: favs.includes(id) ? favs.filter((f) => f !== id) : [id, ...favs] })
      },
      recordUsage: (foodId, amount, unit, meal) => {
        const cur = get().usage[foodId]
        const next: FoodUsage = {
          count: (cur?.count ?? 0) + 1,
          lastUsed: Date.now(),
          lastAmount: amount,
          lastUnit: unit,
          meals: { ...(cur?.meals ?? {}), [meal]: (cur?.meals?.[meal] ?? 0) + 1 },
        }
        set({ usage: { ...get().usage, [foodId]: next } })
      },
      saveTemplate: (t) => set({ templates: [t, ...get().templates.filter((x) => x.id !== t.id)] }),
      removeTemplate: (id) => set({ templates: get().templates.filter((x) => x.id !== id) }),
      clearFoods: () => set({ customFoods: {}, recipes: {}, cachedFoods: {}, favorites: [], usage: {}, templates: [] }),
    }),
    { name: STORE_KEYS.food, storage: idbStorage, version: 1 },
  ),
)
