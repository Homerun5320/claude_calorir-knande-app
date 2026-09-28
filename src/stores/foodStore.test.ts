import { describe, expect, it } from 'vitest'
import type { DiaryEntry, Food, FoodAlias } from '../types'
import { migrateFoodRefs, usageFromEntries, type FoodUsage } from './foodStore'

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
