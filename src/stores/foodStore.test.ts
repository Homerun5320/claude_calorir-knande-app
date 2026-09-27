import { describe, expect, it } from 'vitest'
import type { DiaryEntry, Food } from '../types'
import { usageFromEntries } from './foodStore'

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
