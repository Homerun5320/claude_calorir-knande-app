/**
 * Viktkurvans butik: en vikt per dag, sorterad på datum, och `logWeights` – flera dagar med en enda
 * skrivning (varje set() skriver om hela butiken, t.ex. vid import från Apple Hälsa/Health Connect).
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { waitFor } from '@testing-library/react'
import { addDays } from '../lib/dates'
import { useBodyStore } from './bodyStore'

const s = () => useBodyStore.getState()

/** Antal gånger butiken har ändrats (= antal omskrivningar av hela butiken). */
let writes = 0
let unsubscribe: () => void = () => {}

beforeAll(async () => {
  await waitFor(() => expect(useBodyStore.persist.hasHydrated()).toBe(true))
})

beforeEach(() => {
  s().clearBody()
  writes = 0
  unsubscribe = useBodyStore.subscribe(() => {
    writes++
  })
})

afterEach(() => unsubscribe())

/** Det som syns för användaren – utan id och tidsstämpel, som är nya vid varje loggning. */
const shown = () => s().weights.map((w) => [w.date, w.kg, w.note])

describe('logWeight', () => {
  it('en vikt per dag – den senaste ersätter – och sorterad på datum', () => {
    s().logWeight('2026-09-29', 70.4)
    s().logWeight('2026-09-27', 71)
    s().logWeight('2026-09-29', 70.2, 'Morgon')
    expect(shown()).toEqual([
      ['2026-09-27', 71, undefined],
      ['2026-09-29', 70.2, 'Morgon'],
    ])
    expect(writes).toBe(3)
  })
})

describe('logWeights', () => {
  const batch = [
    { date: '2026-09-29', kg: 70.4, note: 'Från Apple Hälsa' },
    { date: '2026-09-25', kg: 71.2, note: 'Från Apple Hälsa' },
    { date: '2026-09-27', kg: 70.9, note: 'Från Apple Hälsa' },
    { date: '2026-09-26', kg: 71.1 },
  ]

  it('ger samma resultat som en logWeight per vikt', () => {
    s().logWeight('2026-09-27', 75, 'Egen')
    s().logWeight('2026-09-20', 72)
    const before = s().weights
    const returned = s().logWeights(batch)
    const afterBatch = shown()

    useBodyStore.setState({ weights: before })
    for (const { date, kg, note } of batch) s().logWeight(date, kg, note)

    expect(afterBatch).toEqual(shown())
    expect(afterBatch).toEqual([
      ['2026-09-20', 72, undefined],
      ['2026-09-25', 71.2, 'Från Apple Hälsa'],
      ['2026-09-26', 71.1, undefined],
      ['2026-09-27', 70.9, 'Från Apple Hälsa'],
      ['2026-09-29', 70.4, 'Från Apple Hälsa'],
    ])
    expect(returned).toHaveLength(batch.length)
  })

  it('skriver en gång för flera vikter – inte en gång per vikt', () => {
    s().logWeights(batch)
    expect(writes).toBe(1)
    expect(s().weights).toHaveLength(4)

    // Så många som en första import från Hälsa kan ge (90 dagar).
    const many = Array.from({ length: 90 }, (_, i) => ({ date: addDays('2026-01-01', i), kg: 70 + i / 10 }))
    writes = 0
    s().logWeights(many)
    expect(writes).toBe(1)
    expect(s().weights).toHaveLength(94)
    const dates = s().weights.map((w) => w.date)
    expect(dates).toEqual([...dates].sort())

    // En logWeight per vikt hade gett en skrivning var.
    writes = 0
    for (const { date, kg } of batch) s().logWeight(date, kg)
    expect(writes).toBe(batch.length)
  })

  it('returnerar den lagrade vikten (med id) för varje dag, i den ordning de gavs', () => {
    const returned = s().logWeights(batch)
    expect(returned.map((w) => w.date)).toEqual(batch.map((b) => b.date))
    for (const w of returned) expect(s().weights.find((x) => x.id === w.id)).toBe(w)
    expect(new Set(returned.map((w) => w.id)).size).toBe(batch.length)
    expect(returned[0].id).toMatch(/^w_/)
    expect(returned[3]).toMatchObject({ date: '2026-09-26', kg: 71.1, note: undefined })
  })

  it('ersätter en befintlig vikt samma dag med ett nytt id och lämnar övriga dagar', () => {
    const old = s().logWeight('2026-09-27', 75)
    const keep = s().logWeight('2026-09-20', 72)
    writes = 0
    const [entry] = s().logWeights([{ date: '2026-09-27', kg: 74.5 }])
    expect(entry.id).not.toBe(old.id)
    expect(s().weights).toEqual([keep, entry])
    expect(writes).toBe(1)
  })

  it('om en dag förekommer flera gånger gäller den sista, och den returneras för båda', () => {
    const returned = s().logWeights([
      { date: '2026-09-27', kg: 71 },
      { date: '2026-09-28', kg: 70 },
      { date: '2026-09-27', kg: 72, note: 'Senare' },
    ])
    expect(shown()).toEqual([
      ['2026-09-27', 72, 'Senare'],
      ['2026-09-28', 70, undefined],
    ])
    expect(returned.map((w) => w.kg)).toEqual([72, 70, 72])
    expect(returned[0]).toBe(returned[2])
    expect(writes).toBe(1)
  })

  it('skriver ingenting när inget ändras: tom lista, eller vikter som redan är exakt desamma', () => {
    expect(s().logWeights([])).toEqual([])
    expect(writes).toBe(0)

    const a = s().logWeight('2026-09-27', 70.5, 'Från Apple Hälsa')
    const b = s().logWeight('2026-09-28', 70.1)
    writes = 0
    const before = s().weights
    const returned = s().logWeights([
      { date: '2026-09-27', kg: 70.5, note: 'Från Apple Hälsa' },
      { date: '2026-09-28', kg: 70.1 },
    ])
    expect(writes).toBe(0)
    expect(s().weights).toBe(before)
    // De befintliga vikterna (med sina id) kommer tillbaka.
    expect(returned).toEqual([a, b])

    // En annan anteckning eller ett annat värde är en ändring.
    s().logWeights([{ date: '2026-09-28', kg: 70.1, note: 'Ny anteckning' }])
    expect(writes).toBe(1)
  })

  it('en oförändrad vikt bland ändrade behåller sitt id', () => {
    const same = s().logWeight('2026-09-27', 70.5)
    writes = 0
    const [kept, changed] = s().logWeights([
      { date: '2026-09-27', kg: 70.5 },
      { date: '2026-09-28', kg: 70.3 },
    ])
    expect(kept).toBe(same)
    expect(changed.id).not.toBe(same.id)
    expect(shown()).toEqual([
      ['2026-09-27', 70.5, undefined],
      ['2026-09-28', 70.3, undefined],
    ])
    expect(writes).toBe(1)
  })

  it('kontrollerar inget själv – precis som logWeight (anroparen avgör vad som är rimligt)', () => {
    s().logWeights([
      { date: '2026-09-27', kg: 5 },
      { date: '2026-09-28', kg: 500 },
    ])
    const batchResult = shown()
    s().clearBody()
    s().logWeight('2026-09-27', 5)
    s().logWeight('2026-09-28', 500)
    expect(shown()).toEqual(batchResult)
  })

  it('ändrar inte mätningarna', () => {
    const m = s().addMeasurement({ date: '2026-09-27', waistCm: 80 })
    s().logWeights(batch)
    expect(s().measurements).toEqual([m])
  })
})
