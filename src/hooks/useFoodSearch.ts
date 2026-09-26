/**
 * Livsmedelssök i React: användarens egna livsmedel, recept och sparade produkter + den
 * inbyggda databasen, rankat med personlig relevans (användning, senast använd, favoriter
 * och vilken måltid livsmedlet brukar ätas till).
 */
import { useEffect, useMemo, useState } from 'react'
import type { Food, FoodCategory, MealId } from '../types'
import { useFoodStore, type FoodUsage } from '../stores/foodStore'
import { createSearchIndex, searchFoods, type SearchIndex, type SearchResult } from '../lib/search'
import { userFoodCatalog } from '../lib/foodRepo'
import { useBuiltinCatalog, useFoodResolver } from './useFood'

/** Fördröjning innan sökningen körs medan användaren skriver. */
export const SEARCH_DEBOUNCE_MS = 120

const EMPTY_RESULTS: SearchResult[] = []
const EMPTY_FOODS: Food[] = []

/** Sökindex per livsmedelslista – delas mellan alla komponenter och byggs bara en gång. */
const indexCache = new WeakMap<readonly Food[], SearchIndex>()
function indexFor(foods: readonly Food[]): SearchIndex {
  let index = indexCache.get(foods)
  if (!index) {
    index = createSearchIndex(foods)
    indexCache.set(foods, index)
  }
  return index
}

const DAY_MS = 86_400_000

/**
 * Personlig boost (poäng) för sökresultat – ca 0–220 poäng:
 * - användning: upp till 80 (logaritmiskt, 1 gång ≈ 25, 7 gånger ≈ 75)
 * - senast använd: upp till 40 (halveras ungefär var tionde dag)
 * - måltid: upp till 40 om livsmedlet oftast äts till vald måltid
 * - favorit: 60
 */
export function createUsageBoost(
  usage: Readonly<Record<string, FoodUsage>>,
  favorites: readonly string[],
  meal?: MealId,
  now: number = Date.now(),
): (food: Food) => number {
  const favs = new Set(favorites)
  return (food) => {
    let b = favs.has(food.id) ? 60 : 0
    const u = usage[food.id]
    if (u && u.count > 0) {
      b += Math.min(80, 25 * Math.log2(1 + u.count))
      const days = Math.max(0, (now - u.lastUsed) / DAY_MS)
      b += 40 * Math.exp(-days / 14)
      if (meal) b += 40 * Math.min(1, (u.meals[meal] ?? 0) / u.count)
    }
    return b
  }
}

export interface UseFoodSearchOptions {
  /** Måltiden användaren lägger till i – livsmedel som brukar ätas då rankas högre. */
  meal?: MealId
  /** Max antal träffar (standard 40). */
  limit?: number
  /** Begränsa till kategorier. Med tom sökning listas kategorins livsmedel. */
  categories?: readonly FoodCategory[]
}

export interface UseFoodSearchResult {
  results: SearchResult[]
  /** true medan den inbyggda databasen laddas (användarens egna livsmedel söks ändå). */
  loading: boolean
  /** true medan en ny sökning väntar på att användaren slutar skriva. */
  pending: boolean
}

/**
 * Sök livsmedel medan användaren skriver (fördröjt ~120 ms). Tom sökning ger [] så att UI kan
 * visa senaste och favoriter i stället – utom när `categories` anges (bläddra i kategori).
 */
export function useFoodSearch(query: string, opts: UseFoodSearchOptions = {}): UseFoodSearchResult {
  const { meal, limit = 40, categories } = opts
  const q = query.trim()

  // Fördröj sökningen medan användaren skriver – men töm direkt.
  const [debounced, setDebounced] = useState(q)
  useEffect(() => {
    if (q === debounced) return
    if (q === '') {
      setDebounced('')
      return
    }
    const t = setTimeout(() => setDebounced(q), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [q, debounced])
  const effective = q === '' ? '' : debounced

  const catalog = useBuiltinCatalog()
  const customFoods = useFoodStore((s) => s.customFoods)
  const recipes = useFoodStore((s) => s.recipes)
  const cachedFoods = useFoodStore((s) => s.cachedFoods)
  const usage = useFoodStore((s) => s.usage)
  const favorites = useFoodStore((s) => s.favorites)

  const userIndex = useMemo(() => indexFor(userFoodCatalog(customFoods, recipes, cachedFoods).list), [customFoods, recipes, cachedFoods])
  const builtinIndex = useMemo(() => (catalog ? indexFor(catalog.foods) : null), [catalog])
  const boost = useMemo(() => createUsageBoost(usage, favorites, meal), [usage, favorites, meal])
  // Stabil nyckel så att en ny array med samma kategorier inte ger en ny sökning.
  const catKey = categories && categories.length > 0 ? [...categories].sort().join(',') : ''

  const results = useMemo(() => {
    if (!effective && !catKey) return EMPTY_RESULTS
    const indexes = builtinIndex ? [userIndex, builtinIndex] : [userIndex]
    const cats = catKey ? (catKey.split(',') as FoodCategory[]) : undefined
    return searchFoods(indexes, effective, { limit, categories: cats, boost })
  }, [effective, catKey, userIndex, builtinIndex, limit, boost])

  const loading = catalog === null && (effective !== '' || catKey !== '')
  const pending = q !== effective
  return useMemo(() => ({ results, loading, pending }), [results, loading, pending])
}

/**
 * Senast använda livsmedel (nyast först). Med `meal` visas först det som ätits till den
 * måltiden, sedan övriga senaste.
 */
export function useRecentFoods(limit = 12, meal?: MealId): Food[] {
  const usage = useFoodStore((s) => s.usage)
  const resolve = useFoodResolver()
  return useMemo(() => {
    const entries = Object.entries(usage).sort((a, b) => b[1].lastUsed - a[1].lastUsed)
    const ordered = meal
      ? [...entries.filter(([, u]) => (u.meals[meal] ?? 0) > 0), ...entries.filter(([, u]) => !((u.meals[meal] ?? 0) > 0))]
      : entries
    const out: Food[] = []
    for (const [id] of ordered) {
      if (out.length >= limit) break
      const food = resolve(id)
      if (food) out.push(food)
    }
    return out.length > 0 ? out : EMPTY_FOODS
  }, [usage, resolve, limit, meal])
}

/** Favoriter i den ordning användaren lade till dem (senaste först). */
export function useFavoriteFoods(): Food[] {
  const favorites = useFoodStore((s) => s.favorites)
  const resolve = useFoodResolver()
  return useMemo(() => {
    const out: Food[] = []
    for (const id of favorites) {
      const food = resolve(id)
      if (food) out.push(food)
    }
    return out.length > 0 ? out : EMPTY_FOODS
  }, [favorites, resolve])
}
