/**
 * Hookar för veckoplaneringen: receptuppslag (egna och inbyggda klassiker), inläsningsstatus,
 * veckans rader och loggning av en planerad rad i dagboken.
 */
import { useCallback, useMemo, useSyncExternalStore } from 'react'
import type { DiaryEntry, Food, ISODate, Recipe } from '../../types'
import { useFoodStore } from '../../stores/foodStore'
import { useDiaryStore } from '../../stores/diaryStore'
import { useProfileStore } from '../../stores/profileStore'
import { usePlanStore } from '../../stores/planStore'
import { builtinFood, findRecipe, recipeFood } from '../../lib/foodRepo'
import { useBuiltinCatalog } from '../../hooks/useFood'
import { isBuiltinRecipeId } from '../../data/recipes'
import { relativeDayLabel } from '../../lib/dates'
import { mealName } from '../../lib/meals'
import { recipeKey, weekDates, type PlanItem, type RecipeResolver } from '../../lib/planning'
import { toast } from '../../components/ui/toast'
import { useAddFood } from '../add/useAddFood'
import { useBuiltinRecipes } from '../recipes/useRecipes'

const NO_ITEMS: PlanItem[] = []

export interface RecipeLookup {
  resolve: RecipeResolver
  /**
   * Ett inbyggt livsmedel på id (följer alias). Inköpslistan räknar med det om gamla id:n i äldre
   * recept och sparade måltider till ersättaren.
   */
  food: (id: string) => Food | undefined
  /** true medan de inbyggda klassikerna (och livsmedelsdatabasen) laddas. */
  builtinLoading: boolean
  own: Recipe[]
  builtin: Recipe[]
}

const NO_RECIPES: Recipe[] = []

/** Slå upp recept på id: egna ur butiken, klassiker ('klassiker-…') ur den inbyggda katalogen. */
export function useRecipeLookup(): RecipeLookup {
  const ownMap = useFoodStore((s) => s.recipes)
  const { recipes: builtinList } = useBuiltinRecipes()
  const catalog = useBuiltinCatalog()
  return useMemo(() => {
    const builtin = builtinList ?? NO_RECIPES
    const byId = new Map(builtin.map((r) => [r.id, r]))
    const resolve: RecipeResolver = (id) => {
      const key = recipeKey(id)
      return isBuiltinRecipeId(key) ? byId.get(key) : findRecipe(ownMap, key)
    }
    const food = (id: string) => builtinFood(catalog, id)
    const own = Object.values(ownMap)
    return { resolve, food, builtinLoading: builtinList === null, own: own.length > 0 ? own : NO_RECIPES, builtin }
  }, [ownMap, builtinList, catalog])
}

/** true när planeringen har lästs in från enheten. */
export function usePlanHydrated(): boolean {
  return useSyncExternalStore(
    (onChange) => usePlanStore.persist.onFinishHydration(onChange),
    () => usePlanStore.persist.hasHydrated(),
    () => true,
  )
}

/** Veckans planerade rader per datum (stabil referens tills planen ändras). */
export function useWeekItems(weekStart: ISODate): Array<{ date: ISODate; items: PlanItem[] }> {
  const items = usePlanStore((s) => s.items)
  return useMemo(() => weekDates(weekStart).map((date) => ({ date, items: items[date] ?? NO_ITEMS })), [items, weekStart])
}

/** true om någon av radens dagboksposter finns kvar (ångras loggningen blir raden ologgad). */
export function isPlanItemLogged(item: Pick<PlanItem, 'loggedEntryIds'>, dayEntries: readonly Pick<DiaryEntry, 'id'>[] | undefined): boolean {
  const ids = item.loggedEntryIds
  if (!ids || ids.length === 0 || !dayEntries) return false
  return dayEntries.some((e) => ids.includes(e.id))
}

/** Dagbokens poster per datum – för att se vilka planerade rader som redan är loggade. */
export function useDiaryEntries(): Record<ISODate, DiaryEntry[]> {
  return useDiaryStore((s) => s.entries)
}

/**
 * Logga en planerad rad i dagboken för radens datum och måltid – via samma funktioner som när man
 * lägger till mat (`useAddFood`), så att spärren efter provperioden och i exemplet (`requireAccess`),
 * notisen med "Ångra" och statistiken för Senaste fungerar som vanligt. Returnerar true om något
 * loggades.
 */
export function useLogPlanItem(lookup: Pick<RecipeLookup, 'resolve' | 'builtinLoading'>, today: ISODate): (item: PlanItem) => boolean {
  const { resolve, builtinLoading } = lookup
  const { addFood, addMany } = useAddFood()
  const meals = useProfileStore((s) => s.settings.meals)
  return useCallback(
    (item) => {
      const target = { date: item.date, meal: item.meal }
      const meal = mealName(meals, item.meal)
      const message = item.date === today ? `Loggat i ${meal}` : `Loggat i ${meal} · ${relativeDayLabel(item.date, today).toLocaleLowerCase('sv-SE')}`
      let entries: DiaryEntry[] = []
      if (item.kind === 'food') {
        const entry = addFood(item.food, item.amount, item.unit, target, { message })
        if (entry) entries = [entry]
      } else if (item.kind === 'meal') {
        entries = addMany(
          item.items.map((i) => ({ food: i.food, amount: i.amount, unit: i.unit })),
          target,
          { message },
        )
      } else {
        const recipe = resolve(item.recipeId)
        if (!recipe && builtinLoading && isBuiltinRecipeId(item.recipeId)) {
          toast('Recepten laddas fortfarande – försök igen om en liten stund.')
          return false
        }
        if (!recipe) {
          toast(`Receptet ${item.name} finns inte längre – lägg till maten i dagboken som vanligt.`, { tone: 'error' })
          return false
        }
        const food = recipeFood(recipe)
        if (!food.portions.some((p) => p.id === 'portion')) {
          toast('Receptet saknar vikt och kan inte loggas i portioner – öppna receptet och kontrollera ingredienserna.', { tone: 'error' })
          return false
        }
        const entry = addFood(food, item.eat, 'portion:portion', target, { message })
        if (entry) entries = [entry]
      }
      if (entries.length === 0) return false
      usePlanStore.getState().markLogged(
        item.date,
        item.id,
        entries.map((e) => e.id),
      )
      return true
    },
    [addFood, addMany, builtinLoading, meals, resolve, today],
  )
}
