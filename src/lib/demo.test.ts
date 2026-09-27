/**
 * Exempeldatan: alla livsmedel och aktiviteter ska finnas, id:n vara giltiga och unika, och
 * användningsstatistiken fylld – annars är "Senaste" och förslagen per måltid tomma i exemplet.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEMO_FAVORITES, demoFoodIds, seedDemoData } from './demo'
import { loadBuiltinCatalog, resolveFoodSync } from './foodRepo'
import { toISODate } from './dates'
import { wipeAllData } from './backup'
import { getActivity } from '../data/activities'
import { useDiaryStore } from '../stores/diaryStore'
import { useFoodStore } from '../stores/foodStore'
import { useBodyStore } from '../stores/bodyStore'
import { useProfileStore } from '../stores/profileStore'
import { MEAL_IDS, type FoodEntry } from '../types'

beforeAll(async () => {
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'))
  await loadBuiltinCatalog()
})

beforeEach(() => wipeAllData())

const EVENING = new Date(2026, 8, 27, 19, 30) // söndag kväll

describe('exempeldata', () => {
  it('använder bara livsmedel och favoriter som finns i databasen', () => {
    const missing = demoFoodIds().filter((id) => !resolveFoodSync(id))
    expect(missing).toEqual([])
    for (const id of DEMO_FAVORITES) expect(resolveFoodSync(id), id).toBeDefined()
    // En av favoriterna är en svensk klassiker (inbyggt recept).
    expect(resolveFoodSync('recipe:klassiker-kottbullar')?.source).toBe('recipe')
  })

  it('fyller dagboken med giltiga och unika poster', async () => {
    await seedDemoData({ now: EVENING, days: 14 })
    const { entries, exercise } = useDiaryStore.getState()
    const all = Object.entries(entries).flatMap(([date, list]) => list.map((e) => ({ date, e })))
    expect(Object.keys(entries)).toHaveLength(14)
    expect(all.length).toBeGreaterThan(14 * 8)
    const ids = all.map(({ e }) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const { date, e } of all) {
      expect(e.id).toMatch(/^e_[a-z0-9]+$/)
      expect(e.date).toBe(date)
      expect(MEAL_IDS).toContain(e.meal)
      expect(e.kind).toBe('food')
      const food = (e as FoodEntry).food
      expect(resolveFoodSync(food.id)).toBe(food)
      expect((e as FoodEntry).grams).toBeGreaterThan(0)
      // Skapad samma dag som posten, vid måltiden och aldrig i framtiden.
      expect(toISODate(new Date(e.createdAt))).toBe(date)
      expect(e.createdAt).toBeLessThanOrEqual(EVENING.getTime() + 20)
    }
    for (const [date, list] of Object.entries(exercise)) {
      for (const x of list) {
        expect(x.id).toMatch(/^x_/)
        expect(x.date).toBe(date)
        const activity = getActivity(x.activityId)
        expect(activity, x.activityId).toBeDefined()
        expect(x.name).toBe(activity?.name)
        expect(x.met).toBe(activity?.met)
      }
    }
    expect(useProfileStore.getState().settings.onboardingDone).toBe(true)
    const weights = useBodyStore.getState().weights
    expect(new Set(weights.map((w) => w.date)).size).toBe(weights.length)
  })

  it('fyller användningsstatistiken så att Senaste och förslagen per måltid syns', async () => {
    await seedDemoData({ now: EVENING, days: 14 })
    const { entries } = useDiaryStore.getState()
    const { usage, favorites } = useFoodStore.getState()
    expect(favorites).toEqual([...DEMO_FAVORITES])
    const foodEntries = Object.values(entries).flat() as FoodEntry[]
    for (const id of new Set(foodEntries.map((e) => e.food.id))) {
      const logged = foodEntries.filter((e) => e.food.id === id).sort((a, b) => a.createdAt - b.createdAt)
      const last = logged[logged.length - 1]
      const u = usage[id]
      expect(u, id).toBeDefined()
      expect(u.count).toBe(logged.length)
      expect(u.lastUsed).toBe(last.createdAt)
      expect(u.lastAmount).toBe(last.amount)
      expect(u.lastUnit).toBe(last.unit)
      expect(Object.values(u.meals).reduce((s, n) => s + (n ?? 0), 0)).toBe(logged.length)
    }
    // Gröten äts till frukost – och är det senast använda till frukost idag.
    expect(usage['lagom:havregrynsgrot-mellanmjolk'].meals).toEqual({ frukost: expect.any(Number) })
    expect(usage['lagom:kanelbulle-bageri'].meals.fika).toBeGreaterThan(0)
  })

  it('loggar inget i framtiden tidigt på dagen', async () => {
    const morning = new Date(2026, 8, 24, 7, 0) // torsdag morgon
    await seedDemoData({ now: morning, days: 3 })
    const today = useDiaryStore.getState().entries['2026-09-24']
    // Frukost och lunch visas alltid i exemplet, men inget skapas efter "nu".
    expect(today.map((e) => e.meal)).toEqual(expect.arrayContaining(['frukost', 'lunch']))
    expect(today.some((e) => e.meal === 'middag')).toBe(false)
    for (const e of today) expect(e.createdAt).toBeLessThanOrEqual(morning.getTime() + 20)
    // Torsdagens promenad är på eftermiddagen – inte loggad än.
    expect(useDiaryStore.getState().exercise['2026-09-24']).toBeUndefined()
  })
})
