import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { DiaryEntry, Food, FoodAlias, ISODate, MealId, MealTemplate, Recipe, UnitKey } from '../types'
import { FOOD_ALIASES, aliasAmount, resolveFoodAlias } from '../data/foods/aliases'
import { idbStorage, PERSIST_VERSIONS, STORE_KEYS } from './storage'

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
    // Poster med ett gammalt (sammanslaget) id räknas på ersättaren.
    const alias = resolveFoodAlias(e.food.id)
    const id = alias?.to ?? e.food.id
    const last = aliasAmount(alias, e.amount, e.unit)
    const cur = usage[id]
    usage[id] = {
      count: (cur?.count ?? 0) + 1,
      lastUsed: e.createdAt,
      lastAmount: last.amount,
      lastUnit: last.unit,
      meals: { ...cur?.meals, [e.meal]: (cur?.meals?.[e.meal] ?? 0) + 1 },
    }
  }
  return usage
}

/** Slå ihop två användningsposter för samma livsmedel: antal och måltider summeras, senaste mängd vinner. */
function mergeUsage(a: FoodUsage, b: FoodUsage): FoodUsage {
  const latest = b.lastUsed > a.lastUsed ? b : a
  const meals: FoodUsage['meals'] = { ...a.meals }
  for (const [meal, n] of Object.entries(b.meals ?? {}) as Array<[MealId, number]>) meals[meal] = (meals[meal] ?? 0) + n
  return { count: a.count + b.count, lastUsed: latest.lastUsed, lastAmount: latest.lastAmount, lastUnit: latest.lastUnit, meals }
}

const isUsage = (u: unknown): u is FoodUsage => typeof u === 'object' && u !== null && !Array.isArray(u)

/** De delar av livsmedelsbutiken som pekar på livsmedel via id (ögonblicksbilder räknas inte). */
export type FoodRefs = Pick<FoodState, 'favorites' | 'usage'>

/**
 * Skriv om gamla livsmedels-id:n (borttagna eller sammanslagna, se `data/foods/aliases`) till
 * ersättarens id i favoriter och användningsstatistik:
 * - statistik för flera gamla id:n (och det nya) slås ihop – antal och måltider summeras, den
 *   senast använda mängden behålls; gram för en rå rad blir rå vikt ('g' → 'g-ra'),
 * - favoriter behåller sin ordning utan dubbletter.
 * Dagboksposter, recept och sparade måltider har ögonblicksbilder av livsmedlen och ändras inte.
 * Idempotent och billig – körs varje gång butiken läses in. Returnerar samma objekt om inget ändras.
 * Tål skadad data: favoriter som inte är strängar och användningsposter som inte är objekt lämnas
 * orörda i stället för att kasta.
 */
export function migrateFoodRefs<T extends FoodRefs>(state: T, aliases: ReadonlyMap<string, FoodAlias> = FOOD_ALIASES): T {
  if (aliases.size === 0) return state
  const favorites = Array.isArray(state.favorites) ? state.favorites : []
  const usage = state.usage && typeof state.usage === 'object' ? state.usage : {}
  const alias = (id: unknown) => (typeof id === 'string' ? resolveFoodAlias(id, aliases) : undefined)
  const favChanged = favorites.some((id) => alias(id))
  const usageChanged = Object.entries(usage).some(([id, u]) => isUsage(u) && alias(id))
  if (!favChanged && !usageChanged) return state

  let nextFavorites = favorites
  if (favChanged) {
    const seen = new Set<string>()
    nextFavorites = []
    for (const id of favorites) {
      const to = alias(id)?.to ?? id
      if (seen.has(to)) continue
      seen.add(to)
      nextFavorites.push(to)
    }
  }

  let nextUsage = usage
  if (usageChanged) {
    nextUsage = {}
    for (const [id, u] of Object.entries(usage)) {
      const cur = nextUsage[id]
      if (!isUsage(u)) {
        // En skadad post lämnas som den är (om inget annat redan står på id:t).
        if (cur === undefined) nextUsage[id] = u
        continue
      }
      const a = alias(id)
      const to = a?.to ?? id
      let moved = u
      if (a && typeof u.lastUnit === 'string' && typeof u.lastAmount === 'number') {
        const last = aliasAmount(a, u.lastAmount, u.lastUnit)
        moved = { ...u, lastAmount: last.amount, lastUnit: last.unit }
      }
      const prev = nextUsage[to]
      nextUsage[to] = prev !== undefined && isUsage(prev) ? mergeUsage(prev, moved) : moved
    }
  }
  return { ...state, favorites: nextFavorites, usage: nextUsage }
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
      recordUsage: (rawId, rawAmount, rawUnit, meal) => {
        // Ett gammalt id (t.ex. från en sparad måltid) räknas på ersättaren.
        const alias = resolveFoodAlias(rawId)
        const foodId = alias?.to ?? rawId
        const { amount, unit } = aliasAmount(alias, rawAmount, rawUnit)
        const cur = get().usage[foodId]
        const next: FoodUsage = {
          count: (cur?.count ?? 0) + 1,
          lastUsed: Date.now(),
          lastAmount: amount,
          lastUnit: unit,
          meals: { ...cur?.meals, [meal]: (cur?.meals?.[meal] ?? 0) + 1 },
        }
        set({ usage: { ...get().usage, [foodId]: next } })
      },
      saveTemplate: (t) => set({ templates: [t, ...get().templates.filter((x) => x.id !== t.id)] }),
      removeTemplate: (id) => set({ templates: get().templates.filter((x) => x.id !== id) }),
      clearFoods: () => set({ customFoods: {}, recipes: {}, cachedFoods: {}, favorites: [], usage: {}, templates: [] }),
    }),
    {
      name: STORE_KEYS.food,
      storage: idbStorage,
      version: PERSIST_VERSIONS[STORE_KEYS.food],
      // Framtida migreringar läggs här – kasta aldrig fel, skyddet mot nyare data ligger i storage.ts.
      migrate: (persisted) => persisted as FoodState,
      // Gamla livsmedels-id:n skrivs om vid varje inläsning (idempotent), så att nya alias i
      // databasen gäller även för redan sparad data utan att versionen behöver höjas. Migreringen
      // får aldrig stoppa inläsningen: kastar den behålls den sparade datan som den är – annars
      // skulle nästa ändring skriva över egna livsmedel, recept och favoriter med tomma standardvärden.
      merge: (persisted, current) => {
        const merged = { ...current, ...(persisted as Partial<FoodState> | undefined) }
        try {
          return migrateFoodRefs(merged)
        } catch (err) {
          if (import.meta.env.DEV) console.warn('Kunde inte skriva om gamla livsmedels-id:n', err)
          return merged
        }
      },
    },
  ),
)
