/**
 * Fritextloggning i React: tolkar söktexten ("två ägg och en smörgås med ost") till livsmedel med
 * mängder när den innehåller mer än ett led. Söker bland samma livsmedel som huvudsökningen –
 * Lagoms kurerade livsmedel, klassikerna och användarens egna – med personlig relevans.
 *
 * Livsmedelsverkets fullständiga databas ('lmv:') används inte här: fritexten ska ge vardagliga
 * rader, och de mer specifika posterna finns kvar i sökträffarna under kortet.
 */
import { useDeferredValue, useMemo } from 'react'
import type { Food, MealId } from '../../types'
import { useFoodStore } from '../../stores/foodStore'
import { useBuiltinCatalog } from '../../hooks/useFood'
import { createUsageBoost, isLmvFood } from '../../hooks/useFoodSearch'
import { userFoodCatalog } from '../../lib/foodRepo'
import { createSearchIndex, searchFoods, type SearchIndex } from '../../lib/search'
import { resolveFreeText, splitFreeText, type ParsedItem } from '../../lib/freeText'
import { STAPLE_FOODS } from '../../data/foods/staples'
import { isUsableUnit } from '../../components/domain/PortionPicker'

/** Ord som inte behöver matcha – Lagoms rader anges tillagade ("kycklingfilé rå"). */
const OPTIONAL_WORDS: ReadonlySet<string> = new Set(['rå', 'rått', 'råa', 'ra', 'ratt', 'raa', 'okokt', 'okokta'])

const EMPTY: ParsedItem[] = []

/** Sökindex per lista (utan Livsmedelsverkets okopplade poster) – byggs en gång per lista. */
const indexCache = new WeakMap<readonly Food[], SearchIndex>()
function mainIndex(foods: readonly Food[]): SearchIndex {
  let index = indexCache.get(foods)
  if (!index) {
    index = createSearchIndex(foods.some(isLmvFood) ? foods.filter((f) => !isLmvFood(f)) : foods)
    indexCache.set(foods, index)
  }
  return index
}

/** true när texten har mer än ett led ("ägg och bröd") – då visas fritextkortet. */
export function isFreeText(query: string): boolean {
  return splitFreeText(query).length > 1
}

/**
 * Tolkade rader för söktexten, eller en tom lista när texten bara har ett led, när hela texten är
 * ett livsmedel ("Kaffe med mjölk") eller medan databasen laddas.
 */
export function useFreeTextItems(query: string, meal: MealId): ParsedItem[] {
  const deferred = useDeferredValue(query)
  const multi = isFreeText(deferred)
  const catalog = useBuiltinCatalog(multi)
  const customFoods = useFoodStore((s) => s.customFoods)
  const recipes = useFoodStore((s) => s.recipes)
  const cachedFoods = useFoodStore((s) => s.cachedFoods)
  const usage = useFoodStore((s) => s.usage)
  const favorites = useFoodStore((s) => s.favorites)

  const userList = useMemo(() => userFoodCatalog(customFoods, recipes, cachedFoods).list, [customFoods, recipes, cachedFoods])

  return useMemo(() => {
    if (!multi || !catalog) return EMPTY
    const indexes = [mainIndex(userList), mainIndex(catalog.foods)]
    if (catalog.recipeFoods.length > 0) indexes.push(mainIndex(catalog.recipeFoods))
    const boost = createUsageBoost(usage, favorites, meal)
    const items = resolveFreeText(deferred, {
      search: (q) => searchFoods(indexes, q, { limit: 8, boost, optionalWords: OPTIONAL_WORDS, staples: STAPLE_FOODS }).map((r) => r.food),
      usageBoost: (id) => boost({ id } as Food),
      lastUsed: (food) => {
        const u = usage[food.id]
        return u && isUsableUnit(food, u.lastUnit) && u.lastAmount > 0 ? { amount: u.lastAmount, unit: u.lastUnit } : undefined
      },
    })
    return items.length > 1 ? items : EMPTY
  }, [multi, catalog, userList, usage, favorites, meal, deferred])
}
