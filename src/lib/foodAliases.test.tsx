/**
 * Alias i praktiken: gamla (borttagna eller sammanslagna) livsmedels-id:n ska hittas i registret,
 * i hookarna och i de inbyggda recepten, och sparad data (favoriter, Senaste) skrivs om till
 * ersättaren när butiken läses in. Här används en egen testlista, så att testerna inte beror på
 * den riktiga aliaslistan.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { set } from 'idb-keyval'
import type { DiaryEntry, Food, FoodAlias } from '../types'

vi.mock('../data/foods/aliases', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../data/foods/aliases')>()
  const list: FoodAlias[] = [
    { from: 'lagom:gammal-kanelbulle', to: 'lagom:kanelbulle-bageri' },
    { from: 'lagom:gammal-fars-ra', to: 'lagom:blandfars-stekt', unit: 'g-ra' },
    // Finns kvar i dagens databas – ett sådant alias får aldrig skugga livsmedlet.
    { from: 'lagom:mjolk-standard-3', to: 'lagom:mjolk-mellan-1-5' },
  ]
  const map = new Map(list.map((a) => [a.from, a]))
  return {
    ...orig,
    FOOD_ALIAS_LIST: list,
    FOOD_ALIASES: map,
    resolveFoodAlias: (id: string) => orig.resolveFoodAlias(id, map),
    canonicalFoodId: (id: string) => orig.canonicalFoodId(id, map),
  }
})

import { builtinFood, getFoodById, loadBuiltinCatalog, resolveFoodSync, type BuiltinCatalog } from './foodRepo'
import { useFood, useFoodResolver } from '../hooks/useFood'
import { useFavoriteFoods, useRecentFoods } from '../hooks/useFoodSearch'
import { migrateFoodRefs, usageFromEntries, useFoodStore } from '../stores/foodStore'
import { STORE_KEYS } from '../stores/storage'
import { BUILTIN_FOODS } from '../data/foods/index'
import { loadBuiltinRecipes, resolveSeedIngredient } from '../data/recipes'

let catalog: BuiltinCatalog
const bulleId = 'lagom:kanelbulle-bageri'

beforeAll(async () => {
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'))
  catalog = await loadBuiltinCatalog()
})

afterEach(() => {
  useFoodStore.setState({ usage: {}, favorites: [], customFoods: {}, recipes: {}, cachedFoods: {}, templates: [] })
})

describe('uppslag via alias', () => {
  it('ger ersättaren (med ersättarens id) för ett gammalt id', async () => {
    const bulle = catalog.byId.get(bulleId)!
    expect(bulle).toBeDefined()
    expect(catalog.byId.get('lagom:gammal-kanelbulle')).toBe(bulle)
    expect(builtinFood(catalog, 'lagom:gammal-kanelbulle')).toBe(bulle)
    expect(resolveFoodSync('lagom:gammal-kanelbulle')).toBe(bulle)
    await expect(getFoodById('lagom:gammal-kanelbulle')).resolves.toBe(bulle)
    // Ett alias vars gamla id finns kvar i databasen skuggar aldrig livsmedlet.
    expect(resolveFoodSync('lagom:mjolk-standard-3')?.id).toBe('lagom:mjolk-standard-3')
    // Livsmedelslistan för sökningen innehåller inga alias.
    expect(catalog.foods.filter((f) => f.id === bulleId)).toHaveLength(1)
    expect(catalog.foods).toBe(BUILTIN_FOODS)
  })

  it('följer alias i hookarna', async () => {
    const { result } = renderHook(() => useFood('lagom:gammal-kanelbulle'))
    await waitFor(() => expect(result.current.food?.id).toBe(bulleId))
    const resolver = renderHook(() => useFoodResolver())
    expect(resolver.result.current('lagom:gammal-fars-ra')?.id).toBe('lagom:blandfars-stekt')
  })

  it('visar samma livsmedel en gång i Senaste och favoriter även före omskrivningen', () => {
    useFoodStore.setState({
      favorites: ['lagom:gammal-kanelbulle', bulleId],
      usage: {
        'lagom:gammal-kanelbulle': { count: 2, lastUsed: 200, lastAmount: 1, lastUnit: 'portion:st', meals: { fika: 2 } },
        [bulleId]: { count: 1, lastUsed: 100, lastAmount: 1, lastUnit: 'portion:st', meals: { fika: 1 } },
      },
    })
    const favs = renderHook(() => useFavoriteFoods())
    expect(favs.result.current.map((f) => f.id)).toEqual([bulleId])
    const recent = renderHook(() => useRecentFoods())
    expect(recent.result.current.map((f) => f.id)).toEqual([bulleId])
  })
})

describe('inbyggda recept via alias', () => {
  it('använder ersättaren och räknar gram som rå vikt', () => {
    const foods: Food[] = BUILTIN_FOODS.map((f) =>
      f.id === 'lagom:blandfars-stekt' ? { ...f, rawWeight: { factor: 0.72, kind: 'ra' as const } } : f,
    )
    const byId = new Map(foods.map((f) => [f.id, f]))
    // En receptdefinition med ett gammalt id följer aliaset: gram blir rå vikt.
    const resolved = resolveSeedIngredient(byId, 'lagom:gammal-fars-ra', 500, 'g')
    expect(resolved).toMatchObject({ food: { id: 'lagom:blandfars-stekt' }, amount: 500, unit: 'g-ra' })
    // Ett id som finns kvar används direkt, även om det (felaktigt) har ett alias.
    expect(resolveSeedIngredient(byId, 'lagom:mjolk-standard-3', 4, 'dl')?.food.id).toBe('lagom:mjolk-standard-3')
    expect(resolveSeedIngredient(byId, 'lagom:finns-inte', 1, 'g')).toBeUndefined()
    const kottbullar = loadBuiltinRecipes(foods).find((r) => r.id === 'klassiker-kottbullar')
    const fars = kottbullar?.ingredients.find((i) => i.food.id === 'lagom:blandfars-stekt')
    expect(fars).toMatchObject({ amount: 500, unit: 'g-ra', grams: 360 })
  })
})

describe('sparad data med gamla id:n', () => {
  it('skrivs om när butiken läses in', async () => {
    await set(
      STORE_KEYS.food,
      JSON.stringify({
        state: {
          customFoods: {},
          recipes: {},
          cachedFoods: {},
          templates: [],
          favorites: ['lagom:gammal-kanelbulle', 'custom:egen', bulleId],
          usage: {
            'lagom:gammal-fars-ra': { count: 2, lastUsed: 500, lastAmount: 400, lastUnit: 'g', meals: { middag: 2 } },
            'lagom:blandfars-stekt': { count: 1, lastUsed: 100, lastAmount: 150, lastUnit: 'g', meals: { lunch: 1 } },
          },
        },
        version: 1,
      }),
    )
    await useFoodStore.persist.rehydrate()
    const s = useFoodStore.getState()
    expect(s.favorites).toEqual([bulleId, 'custom:egen'])
    expect(s.usage).toEqual({
      'lagom:blandfars-stekt': { count: 3, lastUsed: 500, lastAmount: 400, lastUnit: 'g-ra', meals: { middag: 2, lunch: 1 } },
    })
  })

  it('använder standardlistan med alias', () => {
    const out = migrateFoodRefs({ favorites: ['lagom:gammal-kanelbulle'], usage: {} })
    expect(out.favorites).toEqual([bulleId])
  })

  it('för statistik på ersättaren när ett gammalt id loggas (t.ex. från en sparad måltid)', () => {
    useFoodStore.getState().recordUsage('lagom:gammal-fars-ra', 300, 'g', 'middag')
    expect(useFoodStore.getState().usage).toEqual({
      'lagom:blandfars-stekt': expect.objectContaining({ count: 1, lastAmount: 300, lastUnit: 'g-ra', meals: { middag: 1 } }),
    })
    const entry: DiaryEntry = {
      id: 'e',
      kind: 'food',
      food: { id: 'lagom:gammal-fars-ra', name: 'Blandfärs, rå', source: 'lagom', category: 'rott_kott', nutrients: { kcal: 230 }, portions: [] },
      amount: 250,
      unit: 'g',
      grams: 250,
      date: '2026-09-25',
      meal: 'middag',
      createdAt: 1,
    }
    expect(usageFromEntries({ '2026-09-25': [entry] })).toEqual({
      'lagom:blandfars-stekt': { count: 1, lastUsed: 1, lastAmount: 250, lastUnit: 'g-ra', meals: { middag: 1 } },
    })
  })
})
