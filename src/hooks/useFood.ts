/**
 * Hookar för att läsa livsmedel i React. All uppslagning går via `lib/foodRepo`.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { Food } from '../types'
import { useFoodStore } from '../stores/foodStore'
import {
  findRecipe,
  getBuiltinCatalog,
  getRememberedFood,
  loadBuiltinCatalog,
  lookupBarcode,
  recipeFood,
  subscribeBuiltinCatalog,
  userFoodCatalog,
  type BuiltinCatalog,
} from '../lib/foodRepo'
import { OFF_MESSAGES, isAbortError } from '../lib/openFoodFacts'

/**
 * Den inbyggda katalogen (Lagom + Livsmedelsverket). Startar inläsningen vid behov och
 * uppdateras när Livsmedelsverkets data har slagits ihop. null medan den laddas.
 */
export function useBuiltinCatalog(enabled = true): BuiltinCatalog | null {
  const cat = useSyncExternalStore(subscribeBuiltinCatalog, getBuiltinCatalog, getBuiltinCatalog)
  useEffect(() => {
    if (enabled) void loadBuiltinCatalog()
  }, [enabled])
  return cat
}

/**
 * Alla inbyggda livsmedel (Lagoms databas + Livsmedelsverket), eller null medan de laddas.
 * Listan byts ut en gång när Livsmedelsverkets data har lästs in. Vid fel blir den tom.
 */
export function useBuiltinFoods(): Food[] | null {
  return useBuiltinCatalog()?.foods ?? null
}

export interface UseFoodResult {
  food: Food | undefined
  /** true medan livsmedlet söks (databasen laddas eller produkten hämtas online). */
  loading: boolean
  /** Felmeddelande på svenska om en onlineprodukt inte kunde hämtas. */
  error?: string
}

interface OnlineState {
  id: string
  food?: Food
  error?: string
}

/**
 * Ett livsmedel på id: användarens egna, recept, sparade, inbyggda (även de svenska klassikerna,
 * 'recipe:klassiker-*') eller – för `off:`-id:n som inte finns lokalt – hämtat från Open Food Facts.
 */
export function useFood(id: string | null | undefined): UseFoodResult {
  const key = id ?? ''
  const custom = useFoodStore((s) => (key ? s.customFoods[key] : undefined))
  const recipe = useFoodStore((s) => (key ? findRecipe(s.recipes, key) : undefined))
  const cached = useFoodStore((s) => (key ? s.cachedFoods[key] : undefined))
  const fromRecipe = useMemo(() => (recipe ? recipeFood(recipe) : undefined), [recipe])
  const local = custom ?? fromRecipe ?? cached ?? (key ? getRememberedFood(key) : undefined)

  const needBuiltin = key !== '' && !local
  const catalog = useBuiltinCatalog(needBuiltin)
  const builtin = needBuiltin && catalog ? catalog.byId.get(key) : undefined
  const builtinSettled = catalog?.complete === true
  const needOnline = needBuiltin && builtinSettled && !builtin && key.startsWith('off:')

  const [online, setOnline] = useState<OnlineState | null>(null)
  useEffect(() => {
    if (!needOnline) return
    const ctrl = new AbortController()
    lookupBarcode(key.slice('off:'.length), ctrl.signal).then(
      (food) => setOnline({ id: key, food: food ?? undefined, error: food ? undefined : OFF_MESSAGES.not_found }),
      (err: unknown) => {
        if (!isAbortError(err)) setOnline({ id: key, error: err instanceof Error ? err.message : OFF_MESSAGES.network })
      },
    )
    return () => ctrl.abort()
  }, [needOnline, key])

  const onlineForKey = online?.id === key ? online : null
  const food = local ?? builtin ?? onlineForKey?.food
  const loading = key !== '' && !food && (!builtinSettled || (needOnline && !onlineForKey))
  const error = food ? undefined : onlineForKey?.error ?? (builtinSettled && !food && catalog?.error ? catalog.error : undefined)
  return useMemo(() => ({ food, loading, error }), [food, loading, error])
}

/**
 * En funktion som slår upp livsmedel på id bland användarens och de inbyggda livsmedlen
 * (inklusive klassikerna). Byts ut när butiken eller katalogen ändras (lämplig som beroende i useMemo).
 */
export function useFoodResolver(): (id: string) => Food | undefined {
  const customFoods = useFoodStore((s) => s.customFoods)
  const recipes = useFoodStore((s) => s.recipes)
  const cachedFoods = useFoodStore((s) => s.cachedFoods)
  const catalog = useBuiltinCatalog()
  return useMemo(() => {
    const user = userFoodCatalog(customFoods, recipes, cachedFoods).byId
    return (id: string) => user.get(id) ?? catalog?.byId.get(id) ?? getRememberedFood(id)
  }, [customFoods, recipes, cachedFoods, catalog])
}
