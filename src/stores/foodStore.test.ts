import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DiaryEntry, Food, FoodAlias } from '../types'
import { migrateFoodRefs, usageFromEntries, useFoodStore, type FoodUsage } from './foodStore'

const food = (id: string): Food => ({ id, name: id, source: 'lagom', category: 'ovrigt', nutrients: { kcal: 100 }, portions: [] })

describe('usageFromEntries', () => {
  it('bygger "Senaste" från dagboksposter med antal, senaste mängd och måltider', () => {
    const grot = food('lagom:grot')
    const kaffe = food('lagom:kaffe')
    const entries: Record<string, DiaryEntry[]> = {
      '2026-09-25': [
        { id: 'a', kind: 'food', food: grot, amount: 1, unit: 'portion:p', grams: 250, date: '2026-09-25', meal: 'frukost', createdAt: 100 },
        { id: 'b', kind: 'food', food: kaffe, amount: 2, unit: 'dl', grams: 200, date: '2026-09-25', meal: 'fika', createdAt: 200 },
      ],
      '2026-09-26': [
        { id: 'c', kind: 'food', food: grot, amount: 1.5, unit: 'portion:p', grams: 375, date: '2026-09-26', meal: 'frukost', createdAt: 300 },
        { id: 'd', kind: 'quick', name: 'Glass', nutrients: { kcal: 200 }, date: '2026-09-26', meal: 'fika', createdAt: 400 },
      ],
    }
    const usage = usageFromEntries(entries)
    expect(Object.keys(usage).sort()).toEqual(['lagom:grot', 'lagom:kaffe'])
    expect(usage['lagom:grot']).toEqual({ count: 2, lastUsed: 300, lastAmount: 1.5, lastUnit: 'portion:p', meals: { frukost: 2 } })
    expect(usage['lagom:kaffe']).toMatchObject({ count: 1, lastUsed: 200, meals: { fika: 1 } })
  })
})

describe('migrateFoodRefs', () => {
  const aliases = new Map<string, FoodAlias>([
    ['lagom:kycklingfile-ra', { from: 'lagom:kycklingfile-ra', to: 'lagom:kycklingfile-stekt', unit: 'g-ra' }],
    ['lagom:kycklingfile-grillad', { from: 'lagom:kycklingfile-grillad', to: 'lagom:kycklingfile-stekt' }],
    ['lagom:havredryck-oatly', { from: 'lagom:havredryck-oatly', to: 'lagom:havredryck' }],
  ])
  const u = (count: number, lastUsed: number, lastAmount: number, lastUnit: FoodUsage['lastUnit'], meals: FoodUsage['meals']): FoodUsage => ({
    count,
    lastUsed,
    lastAmount,
    lastUnit,
    meals,
  })

  it('skriver om favoriter till ersättarna utan dubbletter och behåller ordningen', () => {
    const out = migrateFoodRefs(
      { favorites: ['lagom:havredryck-oatly', 'custom:egen', 'lagom:kycklingfile-ra', 'lagom:kycklingfile-stekt', 'lagom:havredryck'], usage: {} },
      aliases,
    )
    expect(out.favorites).toEqual(['lagom:havredryck', 'custom:egen', 'lagom:kycklingfile-stekt'])
  })

  it('slår ihop användningen: antal och måltider summeras, senaste mängden vinner och gram blir rå vikt', () => {
    const out = migrateFoodRefs(
      {
        favorites: [],
        usage: {
          'lagom:kycklingfile-ra': u(3, 300, 150, 'g', { middag: 2, lunch: 1 }),
          'lagom:kycklingfile-grillad': u(1, 100, 1, 'portion:file', { middag: 1 }),
          'lagom:kycklingfile-stekt': u(2, 200, 120, 'g', { lunch: 2 }),
          'lagom:annat': u(1, 50, 1, 'portion:st', { fika: 1 }),
        },
      },
      aliases,
    )
    expect(Object.keys(out.usage).sort()).toEqual(['lagom:annat', 'lagom:kycklingfile-stekt'])
    // Senast använd var den råa raden (lastUsed 300): 150 g rått → 150 g rå vikt.
    expect(out.usage['lagom:kycklingfile-stekt']).toEqual(u(6, 300, 150, 'g-ra', { middag: 3, lunch: 3 }))
    expect(out.usage['lagom:annat']).toEqual(u(1, 50, 1, 'portion:st', { fika: 1 }))
  })

  it('gör om kg till gram rå vikt', () => {
    const out = migrateFoodRefs({ favorites: [], usage: { 'lagom:kycklingfile-ra': u(1, 1, 0.5, 'kg', {}) } as Record<string, FoodUsage> }, aliases)
    expect(out.usage['lagom:kycklingfile-stekt']).toMatchObject({ lastAmount: 500, lastUnit: 'g-ra' })
  })

  it('är idempotent och lämnar orörd data som den är', () => {
    const state = { favorites: ['lagom:havredryck'], usage: { 'lagom:havredryck': u(1, 1, 2, 'dl', { frukost: 1 }) }, templates: [] }
    expect(migrateFoodRefs(state, aliases)).toBe(state)
    const once = migrateFoodRefs({ ...state, favorites: ['lagom:havredryck-oatly'] }, aliases)
    expect(migrateFoodRefs(once, aliases)).toBe(once)
    // Andra fält (t.ex. sparade måltider med ögonblicksbilder) följer med oförändrade.
    expect(once.templates).toBe(state.templates)
  })

  it('slår ihop även när ersättarens egen post kommer efter aliasets', () => {
    const out = migrateFoodRefs(
      {
        favorites: [],
        usage: {
          'lagom:havredryck-oatly': u(1, 100, 2, 'dl', { frukost: 1 }),
          'lagom:havredryck': u(2, 200, 3, 'dl', { fika: 2 }),
        },
      },
      aliases,
    )
    expect(out.usage).toEqual({ 'lagom:havredryck': u(3, 200, 3, 'dl', { frukost: 1, fika: 2 }) })
  })

  it('kastar inte på skadad sparad data utan lämnar den som den är', () => {
    const broken = {
      favorites: [42, null, 'lagom:havredryck-oatly'] as unknown as string[],
      usage: {
        'lagom:kycklingfile-ra': null,
        'lagom:kycklingfile-grillad': { count: 1, lastUsed: 1 },
        'lagom:havredryck-oatly': { count: 1, lastUsed: 5, lastAmount: 2, lastUnit: 'dl' },
      } as unknown as Record<string, FoodUsage>,
    }
    const out = migrateFoodRefs(broken, aliases)
    expect(out.favorites).toEqual([42, null, 'lagom:havredryck'])
    expect(out.usage['lagom:kycklingfile-ra']).toBeNull()
    // Utan mängd och enhet flyttas posten men mängden lämnas orörd; saknade måltider tål sammanslagning.
    expect(out.usage['lagom:kycklingfile-stekt']).toEqual({ count: 1, lastUsed: 1 })
    expect(out.usage['lagom:havredryck']).toMatchObject({ count: 1, lastAmount: 2, lastUnit: 'dl' })
  })
})

/**
 * Varje `set()` i en persisterad butik skriver om hela butiken – antalet meddelanden till
 * prenumeranter är därför antalet skrivningar. En hel korg får inte skriva en gång per rad, och en
 * åtgärd som inte ändrar något ska inte skriva alls.
 */
describe('skrivningar till livsmedelsbutiken', () => {
  const off = (n: number, kcal = 100): Food => ({ id: `off:${n}`, name: `Produkt ${n}`, source: 'openfoodfacts', category: 'ovrigt', nutrients: { kcal }, portions: [] })
  let writes = 0
  let unsubscribe = () => {}

  beforeEach(() => {
    useFoodStore.setState({ customFoods: {}, cachedFoods: {}, usage: {}, favorites: [], recipes: {}, templates: [] })
    writes = 0
    unsubscribe = useFoodStore.subscribe(() => writes++)
  })
  afterEach(() => {
    unsubscribe()
    useFoodStore.setState({ customFoods: {}, cachedFoods: {}, usage: {}, favorites: [], recipes: {}, templates: [] })
  })

  describe('cacheFood', () => {
    it('skriver inget när samma livsmedel redan är sparat – varken samma objekt eller en identisk kopia', () => {
      const a = off(1)
      useFoodStore.getState().cacheFood(a)
      expect(writes).toBe(1)
      const saved = useFoodStore.getState().cachedFoods

      useFoodStore.getState().cacheFood(a)
      // En färsk sökträff är ett nytt objekt med samma innehåll.
      useFoodStore.getState().cacheFood({ ...a, nutrients: { ...a.nutrients } })
      expect(writes).toBe(1)
      expect(useFoodStore.getState().cachedFoods).toBe(saved)
    })

    it('skriver när värdena ändrats eller livsmedlet är nytt', () => {
      useFoodStore.getState().cacheFood(off(1, 100))
      useFoodStore.getState().cacheFood(off(1, 120))
      expect(writes).toBe(2)
      expect(useFoodStore.getState().cachedFoods['off:1']?.nutrients.kcal).toBe(120)
      useFoodStore.getState().cacheFood(off(2))
      expect(writes).toBe(3)
    })
  })

  describe('cacheFoods', () => {
    it('sparar flera med en enda skrivning och hoppar över dem som redan finns oförändrade', () => {
      useFoodStore.getState().cacheFoods([off(1), off(2), off(3)])
      expect(writes).toBe(1)
      expect(Object.keys(useFoodStore.getState().cachedFoods).sort()).toEqual(['off:1', 'off:2', 'off:3'])

      useFoodStore.getState().cacheFoods([off(1), off(2)])
      useFoodStore.getState().cacheFoods([])
      expect(writes).toBe(1)

      useFoodStore.getState().cacheFoods([off(1), off(4)])
      expect(writes).toBe(2)
      expect(Object.keys(useFoodStore.getState().cachedFoods)).toHaveLength(4)
    })
  })

  describe('recordUsages', () => {
    const lunch = (foodId: string, amount = 1) => ({ foodId, amount, unit: 'portion:st' as const, meal: 'lunch' as const })

    it('räknar flera loggningar och sparar onlinelivsmedlen med EN skrivning', () => {
      useFoodStore.getState().recordUsages([lunch('lagom:a'), lunch('lagom:a', 2), lunch('off:1'), lunch('off:2')], [off(1), off(2)])
      expect(writes).toBe(1)
      const s = useFoodStore.getState()
      expect(s.usage['lagom:a']).toMatchObject({ count: 2, lastAmount: 2, meals: { lunch: 2 } })
      expect(s.usage['off:1']).toMatchObject({ count: 1 })
      expect(Object.keys(s.cachedFoods).sort()).toEqual(['off:1', 'off:2'])
    })

    it('en loggning av ett redan sparat livsmedel skriver bara statistiken, en gång', () => {
      useFoodStore.getState().cacheFood(off(1))
      writes = 0
      const cached = useFoodStore.getState().cachedFoods
      useFoodStore.getState().recordUsages([lunch('off:1')], [off(1)])
      expect(writes).toBe(1)
      expect(useFoodStore.getState().cachedFoods).toBe(cached)
    })

    it('följer alias för gamla id:n, som recordUsage', () => {
      useFoodStore.getState().recordUsages([{ foodId: 'lagom:kycklingfile-ra', amount: 150, unit: 'g', meal: 'middag' }])
      expect(writes).toBe(1)
      expect(Object.keys(useFoodStore.getState().usage)).not.toContain('lagom:kycklingfile-ra')
    })

    it('inga loggningar och inget att spara skriver ingenting', () => {
      useFoodStore.getState().recordUsages([])
      useFoodStore.getState().recordUsages([], [])
      expect(writes).toBe(0)
    })

    it('recordUsage är en loggning med en skrivning', () => {
      useFoodStore.getState().recordUsage('lagom:a', 1, 'portion:st', 'lunch')
      expect(writes).toBe(1)
      expect(useFoodStore.getState().usage['lagom:a']).toMatchObject({ count: 1, meals: { lunch: 1 } })
    })
  })

  describe('addCustomFoods', () => {
    it('lägger till flera egna livsmedel med en enda skrivning och sätter tidsstämplar', () => {
      const custom = (n: number): Food => ({ ...off(n), id: `custom:${n}`, source: 'custom' })
      useFoodStore.getState().addCustomFoods([custom(1), custom(2), custom(3)])
      expect(writes).toBe(1)
      const list = Object.values(useFoodStore.getState().customFoods)
      expect(list).toHaveLength(3)
      expect(list.every((f) => typeof f.createdAt === 'number' && typeof f.updatedAt === 'number')).toBe(true)
    })

    it('en tom lista skriver ingenting, och addCustomFood fungerar som förut', () => {
      useFoodStore.getState().addCustomFoods([])
      expect(writes).toBe(0)
      useFoodStore.getState().addCustomFood({ ...off(9), id: 'custom:9', source: 'custom', createdAt: 5 })
      expect(writes).toBe(1)
      expect(useFoodStore.getState().customFoods['custom:9']).toMatchObject({ createdAt: 5 })
    })
  })
})
