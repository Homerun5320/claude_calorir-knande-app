import { describe, expect, it } from 'vitest'
import type { DiaryEntry, ExerciseEntry, Food, FoodCategory, MealId, Nutrients } from '../types'
import {
  FOCUS_GOALS,
  countedFoodDays,
  daysLeftInWeek,
  fishMeals,
  focusGoal,
  focusProgress,
  focusSince,
  focusWeekDates,
  focusWeekSummary,
  isWeekSummaryDay,
  type FocusWeekData,
} from './focusGoals'

// Vecka 39 2026: måndag 21/9 – söndag 27/9.
const MON = '2026-09-21'
const TUE = '2026-09-22'
const WED = '2026-09-23'
const SUN = '2026-09-27'

let seq = 0
function food(name: string, category: FoodCategory, nutrients: Nutrients = { kcal: 100 }): Food {
  return { id: `test:${name}`, name, source: 'custom', category, nutrients, portions: [] }
}
function entry(f: Food, grams: number, date: string, meal: MealId = 'middag'): DiaryEntry {
  return { id: `e${++seq}`, kind: 'food', food: f, amount: grams, unit: 'g', grams, date, meal, createdAt: 0 }
}
function exercise(date: string, minutes: number, met = 4): ExerciseEntry {
  return { id: `x${++seq}`, date, activityId: 'promenad', name: 'Promenad', minutes, kcal: minutes * 4, met, createdAt: 0 }
}
function week(list: DiaryEntry[], today: string, extra: Partial<FocusWeekData> = {}): FocusWeekData {
  const entriesByDate: Record<string, DiaryEntry[]> = {}
  for (const e of list) (entriesByDate[e.date] ??= []).push(e)
  return { entriesByDate, exerciseByDate: {}, today, ...extra }
}

const LAX = food('Lax', 'fisk', { kcal: 200 })
const BROCCOLI = food('Broccoli', 'gronsaker', { kcal: 35 })
const LINSER = food('Linser, kokta', 'baljvaxter', { kcal: 110 })
const GROT = food('Havregrynsgröt', 'spannmal', { kcal: 70, wholegrain: 12 })
const BROD = food('Vitt bröd', 'brod', { kcal: 250, salt: 1.2 })
const VIN = food('Rött vin', 'alkohol', { kcal: 80, alcohol: 10 })

describe('veckan', () => {
  it('räknar måndag till och med idag och dagar kvar', () => {
    expect(focusWeekDates(WED)).toEqual([MON, TUE, WED])
    expect(daysLeftInWeek(WED)).toBe(4)
    expect(daysLeftInWeek(SUN)).toBe(0)
    expect(isWeekSummaryDay(SUN)).toBe(true)
    expect(isWeekSummaryDay(WED)).toBe(false)
    expect(focusSince(WED)).toBe(MON)
  })

  it('räknar idag i snitt och andelar först när dagen är klar', () => {
    const w = week([entry(BROCCOLI, 100, MON), entry(BROCCOLI, 50, WED)], WED)
    expect(countedFoodDays(w)).toEqual([MON])
    expect(countedFoodDays({ ...w, todayComplete: true })).toEqual([MON, WED])
    // Bara idag loggad: då räknas idag ändå, så att kortet har något att säga.
    expect(countedFoodDays(week([entry(BROCCOLI, 50, WED)], WED))).toEqual([WED])
  })
})

describe('FOCUS_GOALS', () => {
  it('har unika id:n, svenska rubriker och beskrivningar', () => {
    const ids = FOCUS_GOALS.map((g) => g.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual(['fisk', 'mer-gronsaker', 'fullkorn', 'baljvaxter', 'mindre-salt', 'alkoholfria-dagar', 'rorelse'])
    for (const g of FOCUS_GOALS) {
      expect(g.title.length).toBeGreaterThan(3)
      expect(g.description).toMatch(/\.$/)
    }
    expect(focusGoal('fisk')?.title).toBe('Fisk två gånger')
    expect(focusGoal('okänt')).toBeUndefined()
    expect(focusGoal(undefined)).toBeUndefined()
  })

  it('innehåller inga streaks eller skuldord', () => {
    const texts = FOCUS_GOALS.flatMap((g) => [g.title, g.description])
    for (const t of texts) expect(t).not.toMatch(/streak|i rad|misslyck|borde|dåligt|för mycket/i)
  })
})

describe('focusProgress', () => {
  it('fisk två gånger: räknar fiskmåltider', () => {
    const one = week([entry(LAX, 120, MON), entry(LAX, 20, TUE, 'lunch')], WED)
    expect(fishMeals(one)).toBe(1)
    const p1 = focusProgress('fisk', one)
    expect(p1).toMatchObject({ done: 1, target: 2, reached: false })
    expect(p1?.text).toBe('1 av 2 fiskmåltider – en bit på väg, det finns dagar kvar')

    const two = week([entry(LAX, 120, MON), entry(LAX, 150, WED, 'lunch')], WED)
    expect(focusProgress('fisk', two)?.text).toBe('2 av 2 fiskmåltider – snyggt!')
    expect(focusProgress('fisk', two)).toMatchObject({ reached: true, ratio: 1 })
  })

  it('räknar två fiskrätter i samma måltid som en fiskmåltid', () => {
    const w = week([entry(LAX, 30, MON), entry(food('Räkor', 'skaldjur'), 30, MON)], WED)
    expect(fishMeals(w)).toBe(1)
  })

  it('mer grönt: snitt per loggad dag mot 500 g', () => {
    const w = week([entry(BROCCOLI, 300, MON), entry(BROCCOLI, 200, TUE), entry(BROCCOLI, 50, WED)], WED)
    const p = focusProgress('mer-gronsaker', w)
    // Idag är inte klar – snittet bygger på måndag och tisdag.
    expect(p).toMatchObject({ done: 250, target: 500 })
    expect(p?.text).toBe('I snitt 250 av 500 g om dagen – en bit på väg, det finns dagar kvar')
  })

  it('fullkorn varje dag: dagar med minst 30 g fullkorn', () => {
    // 300 g gröt = 36 g fullkorn, 200 g = 24 g.
    const w = week([entry(GROT, 300, MON), entry(GROT, 200, TUE), entry(GROT, 300, WED)], WED)
    expect(focusProgress('fullkorn', w)).toMatchObject({ done: 2, target: 7 })
    expect(focusProgress('fullkorn', w)?.text).toMatch(/^2 av 7 dagar med fullkorn – /)
  })

  it('baljväxter tre gånger: dagar med baljväxter', () => {
    const w = week([entry(LINSER, 100, MON), entry(LINSER, 100, TUE), entry(LINSER, 100, WED)], WED)
    expect(focusProgress('baljvaxter', w)?.text).toBe('3 av 3 gånger med baljväxter – snyggt!')
  })

  it('mindre salt: andel bedömda dagar under 6 g, dagar utan saltvärden räknas inte', () => {
    const utanSalt = food('Soppa', 'fardigratt', { kcal: 100 })
    const w = week([entry(BROD, 200, MON), entry(BROD, 600, TUE), entry(utanSalt, 400, WED)], SUN)
    const p = focusProgress('mindre-salt', w)
    expect(p).toMatchObject({ done: 1, target: 2 })
    expect(p?.text).toBe('1 av 2 dagar under 6 g salt – en bit på väg, varje steg räknas')
    expect(p?.note).toMatch(/1 dag saknar saltvärden/)
  })

  it('alkoholfria dagar: loggade dagar utan alkohol', () => {
    const w = week([entry(BROCCOLI, 100, MON), entry(VIN, 150, TUE), entry(BROCCOLI, 100, WED)], WED, { todayComplete: true })
    expect(focusProgress('alkoholfria-dagar', w)?.text).toBe('2 av 3 loggade dagar utan alkohol – en bit på väg, det finns dagar kvar')
  })

  it('rörelse 150 minuter: måttlig intensitet, hög räknas dubbelt', () => {
    const w: FocusWeekData = { ...week([], WED), exerciseByDate: { [MON]: [exercise(MON, 30)], [TUE]: [exercise(TUE, 30, 8)] } }
    expect(focusProgress('rorelse', w)).toMatchObject({ done: 90, target: 150 })
    expect(focusProgress('rorelse', w)?.text).toBe('90 av 150 minuter – en bit på väg, det finns dagar kvar')
  })

  it('är vänlig när inget är loggat och okänd för okända id:n', () => {
    const empty = week([], WED)
    expect(focusProgress('mer-gronsaker', empty)?.text).toBe('Inget loggat ännu den här veckan – det finns dagar kvar')
    expect(focusProgress('fisk', empty)?.text).toBe('0 av 2 fiskmåltider – det finns dagar kvar')
    expect(focusProgress('finns-inte', empty)).toBeUndefined()
  })

  it('har ett besked utan siffror för medvetet läge', () => {
    const w = week([entry(LAX, 120, MON), entry(LAX, 150, WED, 'lunch')], WED)
    expect(focusProgress('fisk', w)?.mindfulText).toBe('I mål den här veckan – snyggt!')
    const half = week([entry(LAX, 120, MON)], WED)
    expect(focusProgress('fisk', half)?.mindfulText).toBe('En bit på väg – det finns dagar kvar')
    for (const g of FOCUS_GOALS) expect(focusProgress(g.id, half)?.mindfulText).not.toMatch(/\d/)
  })
})

describe('focusWeekSummary', () => {
  it('summerar veckan på söndagen – uppmuntrande oavsett utfall', () => {
    const done = week([entry(LAX, 120, MON), entry(LAX, 150, TUE)], SUN)
    expect(focusWeekSummary('fisk', done)).toBe('Fisk två gånger: 2 av 2 fiskmåltider – snyggt jobbat den här veckan!')
    const some = week([entry(LAX, 120, MON)], SUN)
    expect(focusWeekSummary('fisk', some)).toBe('Fisk två gånger: 1 av 2 fiskmåltider – en bra bit på väg. Fortsätt i samma takt nästa vecka.')
    expect(focusWeekSummary('fisk', some, true)).toBe('Fisk två gånger: en bra bit på väg. Fortsätt i samma takt nästa vecka.')
    expect(focusWeekSummary('okänt', some)).toBeUndefined()
  })
})
