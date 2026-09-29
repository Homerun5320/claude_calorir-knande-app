/**
 * Dagbokens butik: flera poster tas bort och återställs med en enda skrivning, och ändringar som
 * inte ändrar något skriver inte om dagboken (varje set() skriver om hela dagboken, se
 * docs/LAGRING.md).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DiaryEntry, QuickEntry } from '../types'
import { useDiaryStore, type NewDiaryEntry } from './diaryStore'

const DAY = '2026-09-28'
const NEXT = '2026-09-29'

const quick = (name: string, patch: Partial<QuickEntry> = {}): NewDiaryEntry => ({
  kind: 'quick',
  date: DAY,
  meal: 'frukost',
  name,
  nutrients: { kcal: 100 },
  ...patch,
})

/** Antal gånger butiken har ändrats (= antal omskrivningar av dagboken). */
let writes = 0
let unsubscribe: () => void = () => {}

beforeEach(() => {
  useDiaryStore.getState().clearDiary()
  writes = 0
  unsubscribe = useDiaryStore.subscribe(() => {
    writes++
  })
})

afterEach(() => unsubscribe())

/** Lägg till poster med olika createdAt (i ordning). */
function seed(list: NewDiaryEntry[]): DiaryEntry[] {
  const out = useDiaryStore.getState().addEntries(list)
  const entries: Record<string, DiaryEntry[]> = {}
  out.forEach((e, i) => {
    const withTime = { ...e, createdAt: 1_000 + i }
    ;(entries[e.date] ??= []).push(withTime)
  })
  useDiaryStore.setState({ entries })
  writes = 0
  return out.map((e, i) => ({ ...e, createdAt: 1_000 + i }))
}

describe('removeEntries och restoreEntries', () => {
  it('tar bort poster från flera dagar med en skrivning och returnerar dem', () => {
    const [a, b, c, d] = seed([quick('A'), quick('B'), quick('C', { date: NEXT }), quick('D', { date: NEXT })])
    const removed = useDiaryStore.getState().removeEntries([
      { date: DAY, id: a.id },
      { date: NEXT, id: c.id },
      { date: NEXT, id: d.id },
    ])
    expect(writes).toBe(1)
    expect(removed.map((e) => e.id).sort()).toEqual([a.id, c.id, d.id].sort())
    const { entries } = useDiaryStore.getState()
    expect(entries[DAY]?.map((e) => e.id)).toEqual([b.id])
    // En tom dag tas bort helt, som med removeEntry.
    expect(NEXT in entries).toBe(false)
  })

  it('okända id:n, fel datum och dubbletter skriver inte om dagboken i onödan', () => {
    const [a] = seed([quick('A')])
    expect(useDiaryStore.getState().removeEntries([])).toEqual([])
    expect(useDiaryStore.getState().removeEntries([{ date: DAY, id: 'finns-inte' }])).toEqual([])
    expect(useDiaryStore.getState().removeEntries([{ date: NEXT, id: a.id }])).toEqual([])
    expect(writes).toBe(0)
    expect(useDiaryStore.getState().removeEntries([a, a])).toHaveLength(1)
    expect(writes).toBe(1)
  })

  it('ångra: återställer i createdAt-ordning med en skrivning, och bara en gång per post', () => {
    const [a, b, c] = seed([quick('A'), quick('B'), quick('C', { date: NEXT })])
    const removed = useDiaryStore.getState().removeEntries([a, b, c])
    writes = 0
    useDiaryStore.getState().restoreEntries([...removed].reverse())
    expect(writes).toBe(1)
    const { entries } = useDiaryStore.getState()
    expect(entries[DAY]?.map((e) => e.id)).toEqual([a.id, b.id])
    expect(entries[NEXT]?.map((e) => e.id)).toEqual([c.id])
    // Redan återställda – ingen ny skrivning och inga dubbletter.
    useDiaryStore.getState().restoreEntries([...removed, removed[0]])
    expect(writes).toBe(1)
    expect(useDiaryStore.getState().entries[DAY]).toHaveLength(2)
  })

  it('moveEntry flyttar med en skrivning', () => {
    const [a, b] = seed([quick('A'), quick('B')])
    useDiaryStore.getState().moveEntry(DAY, a.id, NEXT, 'middag')
    expect(writes).toBe(1)
    const { entries } = useDiaryStore.getState()
    expect(entries[DAY]?.map((e) => e.id)).toEqual([b.id])
    expect(entries[NEXT]?.[0]).toMatchObject({ id: a.id, date: NEXT, meal: 'middag' })
    // Inom samma dag hamnar posten sist, som förut.
    useDiaryStore.getState().moveEntry(NEXT, a.id, DAY, 'lunch')
    expect(useDiaryStore.getState().entries[DAY]?.map((e) => e.id)).toEqual([b.id, a.id])
    expect(NEXT in useDiaryStore.getState().entries).toBe(false)
    // Okänd post: ingenting händer.
    writes = 0
    useDiaryStore.getState().moveEntry(DAY, 'finns-inte', NEXT, 'lunch')
    expect(writes).toBe(0)
  })
})

describe('ingen omskrivning när ingenting ändras', () => {
  it('vatten: samma mängd skrivs inte om, 0 kan sättas första gången', () => {
    const s = () => useDiaryStore.getState()
    s().addWater(DAY, 250)
    s().setWater(DAY, 250)
    s().addWater(DAY, 0)
    expect(writes).toBe(1)
    // Kan inte bli mindre än 0.
    s().addWater(DAY, -500)
    s().addWater(DAY, -250)
    expect(s().water[DAY]).toBe(0)
    expect(writes).toBe(2)
    s().setWater(NEXT, 0)
    expect(s().water[NEXT]).toBe(0)
    expect(writes).toBe(3)
    s().setWater(NEXT, 0.2)
    expect(writes).toBe(3)
  })

  it('setDayMeta: samma värden skrivs inte om, ändrade och borttagna gör det', () => {
    const s = () => useDiaryStore.getState()
    s().setDayMeta(DAY, { mood: 4, steps: 8000 })
    expect(writes).toBe(1)
    s().setDayMeta(DAY, { mood: 4 })
    s().setDayMeta(DAY, { mood: 4, steps: 8000 })
    s().setDayMeta(DAY, {})
    expect(writes).toBe(1)
    s().setDayMeta(DAY, { mood: 5 })
    expect(writes).toBe(2)
    s().setDayMeta(DAY, { steps: undefined })
    expect(writes).toBe(3)
    expect(s().days[DAY]).toEqual({ mood: 5, steps: undefined })
    // En ny dag skrivs alltid.
    s().setDayMeta(NEXT, { complete: true })
    expect(s().days[NEXT]).toEqual({ complete: true })
    expect(writes).toBe(4)
  })

  it('setDayMetas: flera dagar med en skrivning, bara det som ändras', () => {
    const s = () => useDiaryStore.getState()
    s().setDayMeta(DAY, { steps: 5000, mood: 3 })
    writes = 0
    s().setDayMetas([
      { date: DAY, patch: { steps: 5000 } },
      { date: NEXT, patch: { steps: 7000 } },
      { date: '2026-09-27', patch: { steps: 3000 } },
    ])
    expect(writes).toBe(1)
    expect(s().days).toEqual({
      [DAY]: { steps: 5000, mood: 3 },
      [NEXT]: { steps: 7000 },
      '2026-09-27': { steps: 3000 },
    })
    const before = s().days
    s().setDayMetas([{ date: DAY, patch: { steps: 5000 } }])
    s().setDayMetas([])
    expect(writes).toBe(1)
    expect(s().days).toBe(before)
  })
})
