/**
 * useAddFood – ett ställe för att logga mat i dagboken.
 *
 * Varje tillägg:
 * 1. skapar en post med en ögonblicksbild av livsmedlet (`makeFoodEntry`),
 * 2. uppdaterar användningsstatistiken (senaste mängd, måltid) för smarta förval,
 * 3. sparar onlineprodukter (Open Food Facts) lokalt så att de fungerar offline nästa gång,
 * 4. visar en notis "Tillagt i Frukost" med "Ångra" – som tar bort posterna och återställer
 *    användningsstatistiken och offlinekopian, så att ett ångrat tillägg inte lever kvar i
 *    "Senaste" eller i förslagen.
 *
 * Efter provperioden (utan licens) läggs inget till: `requireAccess` visar en lugn förklaring och
 * funktionerna returnerar null/[] – precis som när inget kunde läggas till.
 *
 * ```ts
 * const { addFood, addQuick } = useAddFood()
 * addFood(food, 2, 'dl', { date, meal: 'frukost' })
 * addQuick('Lunch på jobbet', { kcal: 650 }, { date, meal: 'lunch' })
 * ```
 */
import { useMemo } from 'react'
import type { DiaryEntry, Food, FoodCategory, ISODate, MealId, MealTemplate, Nutrients, UnitKey } from '../../types'
import { useDiaryStore, type NewDiaryEntry } from '../../stores/diaryStore'
import { useFoodStore, type FoodUsage } from '../../stores/foodStore'
import { useProfileStore } from '../../stores/profileStore'
import { makeFoodEntry } from '../../lib/diary'
import { gramsFor } from '../../lib/units'
import { mealName } from '../../lib/meals'
import { getBuiltinCatalog } from '../../lib/foodRepo'
import { uid } from '../../lib/id'
import { toast } from '../../components/ui/toast'
import { countLabel } from './addLogic'
import { requireAccess } from '../premium/requireAccess'

export interface AddTarget {
  date: ISODate
  meal: MealId
  /** 'HH:mm' – valfritt klockslag. */
  time?: string
}

export interface AddOptions {
  /** Ingen notis (t.ex. när anroparen visar en egen). */
  silent?: boolean
  /** Egen notistext. */
  message?: string
}

export interface AddItem {
  food: Food
  amount: number
  unit: UnitKey
}

export interface QuickMeta extends AddTarget {
  category?: FoodCategory
  note?: string
}

export interface UseAddFoodResult {
  /** Lägg till ett livsmedel. Returnerar posten, eller null om mängden inte kan räknas om till gram. */
  addFood: (food: Food, amount: number, unit: UnitKey, target: AddTarget, opts?: AddOptions) => DiaryEntry | null
  /** Lägg till flera livsmedel i samma måltid med en gemensam notis och ångra. */
  addMany: (items: readonly AddItem[], target: AddTarget, opts?: AddOptions) => DiaryEntry[]
  /** Snabbregistrering: bara namn och energi (och ev. makron) – totalt, inte per 100 g. */
  addQuick: (name: string, nutrients: Nutrients, meta: QuickMeta, opts?: AddOptions) => DiaryEntry | null
  /** Lägg till alla livsmedel i en sparad måltid. */
  addTemplate: (template: MealTemplate, target: AddTarget, opts?: AddOptions) => DiaryEntry[]
  /** Spara livsmedel som en måltid att återanvända. */
  saveTemplate: (name: string, items: readonly AddItem[], meal?: MealId) => MealTemplate | null
}

/** Vad ett tillägg ändrade i livsmedelsbutiken – så att "Ångra" kan återställa det. */
export interface FoodEffects {
  /** Användningsstatistiken per livsmedel före och efter tillägget. */
  usage: Map<string, { before: FoodUsage | undefined; after: FoodUsage | undefined; times: number; meal: MealId }>
  /** Onlineprodukter som sparades lokalt för första gången vid tillägget. */
  cached: Set<string>
}

export function newFoodEffects(): FoodEffects {
  return { usage: new Map(), cached: new Set() }
}

/**
 * Återställ användningsstatistik och offlinekopior efter ett ångrat tillägg.
 *
 * Har inget annat hänt med livsmedlet sedan dess återställs statistiken exakt (senaste mängd,
 * antal, måltider). Har det loggats igen efteråt räknas bara det ångrade tillägget bort, så att
 * det senare tillägget finns kvar. En nysparad onlineprodukt tas bort om den inte längre används.
 */
export function revertFoodEffects(fx: FoodEffects): void {
  if (fx.usage.size === 0 && fx.cached.size === 0) return
  useFoodStore.setState((s) => {
    const usage = { ...s.usage }
    for (const [id, u] of fx.usage) {
      const cur = usage[id]
      if (cur === u.after) {
        if (u.before) usage[id] = u.before
        else delete usage[id]
      } else if (cur) {
        const count = cur.count - u.times
        if (count <= 0) {
          delete usage[id]
          continue
        }
        const meals = { ...cur.meals }
        const inMeal = (meals[u.meal] ?? 0) - u.times
        if (inMeal > 0) meals[u.meal] = inMeal
        else delete meals[u.meal]
        usage[id] = { ...cur, count, meals }
      }
    }
    let cachedFoods = s.cachedFoods
    for (const id of fx.cached) {
      // Behåll kopian om livsmedlet fortfarande används – t.ex. har sparats som favorit under tiden.
      if (usage[id] || s.favorites.includes(id) || !(id in cachedFoods)) continue
      if (cachedFoods === s.cachedFoods) cachedFoods = { ...cachedFoods }
      delete cachedFoods[id]
    }
    return { usage, cachedFoods }
  })
}

/** Ta bort poster igen och återställ det de ändrade (för "Ångra"). Gör något bara första gången. */
function undoer(entries: readonly DiaryEntry[], fx: FoodEffects): () => void {
  let done = false
  return () => {
    if (done) return
    done = true
    const { removeEntry } = useDiaryStore.getState()
    for (const e of entries) removeEntry(e.date, e.id)
    revertFoodEffects(fx)
  }
}

/**
 * Spara livsmedel som inte finns i den inbyggda databasen eller bland användarens egna – främst
 * produkter från Open Food Facts – så att dagboken, sökningen och streckkoden fungerar offline.
 */
export function cacheIfOnline(food: Food): void {
  const store = useFoodStore.getState()
  if (food.source === 'custom' || food.source === 'recipe' || food.source === 'lagom') return
  if (food.id.startsWith('custom:') || food.id.startsWith('recipe:') || food.id.startsWith('lagom:')) return
  if (food.source === 'livsmedelsverket' && getBuiltinCatalog()?.byId.has(food.id)) return
  store.cacheFood(food)
}

/** Kort sammanfattning av ett livsmedel för en sparad måltid (utan onödigt stora fält). */
function templateFood(food: Food): Food {
  if (!food.extra?.ingredientsText) return food
  const { ingredientsText: _i, ...extra } = food.extra
  return { ...food, extra }
}

export function useAddFood(): UseAddFoodResult {
  const meals = useProfileStore((s) => s.settings.meals)

  return useMemo<UseAddFoodResult>(() => {
    const nameOf = (meal: MealId) => mealName(meals, meal)

    const notify = (entries: DiaryEntry[], fx: FoodEffects, fallback: string, opts: AddOptions = {}) => {
      if (opts.silent || entries.length === 0) return
      toast(opts.message ?? fallback, {
        tone: 'success',
        action: { label: 'Ångra', onClick: undoer(entries, fx) },
      })
    }

    /** Uppdatera statistik och offlinekopia – och notera ändringarna i `fx` för "Ångra". */
    const record = (food: Food, amount: number, unit: UnitKey, meal: MealId, fx: FoodEffects) => {
      const store = useFoodStore.getState()
      const prev = fx.usage.get(food.id)
      const before = prev ? prev.before : store.usage[food.id]
      const wasCached = food.id in store.cachedFoods
      store.recordUsage(food.id, amount, unit, meal)
      cacheIfOnline(food)
      const after = useFoodStore.getState()
      fx.usage.set(food.id, { before, after: after.usage[food.id], times: (prev?.times ?? 0) + 1, meal })
      if (!wasCached && food.id in after.cachedFoods) fx.cached.add(food.id)
    }

    const toEntry = (item: AddItem, target: AddTarget): NewDiaryEntry | null => {
      const grams = gramsFor(item.food, item.amount, item.unit)
      if (!Number.isFinite(grams) || grams <= 0) return null
      return makeFoodEntry(item.food, item.amount, item.unit, target.date, target.meal, target.time)
    }

    const addMany: UseAddFoodResult['addMany'] = (items, target, opts) => {
      if (items.length > 0 && !requireAccess('mat')) return []
      const valid: AddItem[] = []
      const drafts: NewDiaryEntry[] = []
      for (const item of items) {
        const draft = toEntry(item, target)
        if (draft) {
          valid.push(item)
          drafts.push(draft)
        }
      }
      if (drafts.length === 0) {
        if (items.length > 0) toast('Mängden kunde inte räknas om till gram – välj en annan enhet.', { tone: 'error' })
        return []
      }
      const entries = useDiaryStore.getState().addEntries(drafts)
      const fx = newFoodEffects()
      for (const item of valid) record(item.food, item.amount, item.unit, target.meal, fx)
      const n = entries.length
      notify(entries, fx, `${countLabel(n)} ${n === 1 ? 'tillagt' : 'tillagda'} i ${nameOf(target.meal)}`, opts)
      return entries
    }

    return {
      addFood: (food, amount, unit, target, opts) => {
        if (!requireAccess('mat')) return null
        const draft = toEntry({ food, amount, unit }, target)
        if (!draft) {
          toast('Mängden kunde inte räknas om till gram – välj en annan enhet.', { tone: 'error' })
          return null
        }
        const entry = useDiaryStore.getState().addEntry(draft)
        const fx = newFoodEffects()
        record(food, amount, unit, target.meal, fx)
        notify([entry], fx, `Tillagt i ${nameOf(target.meal)}`, opts)
        return entry
      },

      addMany,

      addQuick: (name, nutrients, meta, opts) => {
        const clean: Nutrients = {}
        for (const [k, v] of Object.entries(nutrients)) {
          if (typeof v === 'number' && Number.isFinite(v) && v >= 0) clean[k as keyof Nutrients] = v
        }
        if (clean.kcal === undefined) return null
        if (!requireAccess('snabb')) return null
        const entry = useDiaryStore.getState().addEntry({
          kind: 'quick',
          name: name.trim() || 'Snabbregistrering',
          nutrients: clean,
          category: meta.category,
          note: meta.note?.trim() || undefined,
          date: meta.date,
          meal: meta.meal,
          time: meta.time,
        })
        notify([entry], newFoodEffects(), `Tillagt i ${nameOf(meta.meal)}`, opts)
        return entry
      },

      addTemplate: (template, target, opts) =>
        addMany(template.items, target, {
          ...opts,
          message: opts?.message ?? `${template.name} tillagd i ${nameOf(target.meal)}`,
        }),

      saveTemplate: (name, items, meal) => {
        const list = items
          .map((i) => ({ food: templateFood(i.food), amount: i.amount, unit: i.unit, grams: gramsFor(i.food, i.amount, i.unit) }))
          .filter((i) => Number.isFinite(i.grams) && i.grams > 0)
        if (list.length === 0) return null
        const template: MealTemplate = {
          id: uid('tpl_'),
          name: name.trim() || 'Min måltid',
          meal,
          items: list,
          createdAt: Date.now(),
        }
        useFoodStore.getState().saveTemplate(template)
        return template
      },
    }
  }, [meals])
}
