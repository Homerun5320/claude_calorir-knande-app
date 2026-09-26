import { describe, expect, it } from 'vitest'
import type { DiaryEntry, ExerciseEntry, Food, FoodCategory, FoodEntry, Nutrients, QuickEntry } from '../types'
import {
  CATEGORY_KOSTRAD,
  KOSTRAD_TARGETS,
  RAW_TO_COOKED_MEAT,
  evaluateKostrad,
  foodKostrad,
  kostradScore,
  type KostradId,
  type KostradInput,
  type KostradResult,
} from './kostrad'

// ---------------------------------------------------------------------------
// Fixturer
// ---------------------------------------------------------------------------

let seq = 0
function food(name: string, category: FoodCategory, nutrients: Nutrients = { kcal: 100 }, extra: Partial<Food> = {}): Food {
  return { id: `test:${name}`, name, source: 'custom', category, nutrients, portions: [], ...extra }
}
function entry(f: Food, grams: number, date: string): FoodEntry {
  return { id: `e${++seq}`, kind: 'food', food: f, amount: grams, unit: 'g', grams, date, meal: 'lunch', createdAt: 0 }
}
function quick(nutrients: Nutrients, date: string): QuickEntry {
  return { id: `q${++seq}`, kind: 'quick', name: 'Snabbpost', nutrients, date, meal: 'middag', createdAt: 0 }
}
function exercise(date: string, minutes: number, met?: number): ExerciseEntry {
  return { id: `x${++seq}`, date, activityId: 'promenad', name: 'Promenad', minutes, kcal: minutes * 4, met, createdAt: 0 }
}

const broccoli = food('Broccoli', 'gronsaker', { kcal: 35 })
const apple = food('Äpple', 'frukt', { kcal: 52 })
const juice = food('Apelsinjuice', 'juice', { kcal: 45 })
const potato = food('Potatis, kokt', 'potatis', { kcal: 80 })
const beans = food('Kidneybönor, kokta', 'baljvaxter', { kcal: 120 })
const salmon = food('Laxfilé', 'fisk', { kcal: 200, satFat: 2 })
const mince = food('Nötfärs 12 %, stekt', 'rott_kott', { kcal: 250 })
const rawMince = food('Nötfärs 12 %, rå', 'rott_kott', { kcal: 200 })
const nuts = food('Valnötter', 'notter_fron', { kcal: 650 })
const milk = food('Mellanmjölk', 'mejeri', { kcal: 45 }, { liquid: true })
const cream = food('Vispgrädde 40 %', 'mejeri', { kcal: 380 })
const oatDrink = food('Havredryck berikad', 'vaxtdryck', { kcal: 45 })
const tofu = food('Tofu naturell', 'vegoprotein', { kcal: 120 })
const quorn = food('Quornbitar', 'vegoprotein', { kcal: 100 })
const hummus = food('Hummus', 'sas_krydda', { kcal: 300 })
const oats = food('Havregryn', 'spannmal', { kcal: 370, wholegrain: 100, salt: 0 })
const whiteBread = food('Vitt formbröd', 'brod', { kcal: 260 })
const beer = food('Öl 3,5 %', 'alkohol', { kcal: 40, alcohol: 2.8 })

function input(byDate: Record<string, DiaryEntry[]>, extra: Partial<KostradInput> = {}): KostradInput {
  return {
    entriesByDate: byDate,
    exerciseByDate: {},
    dates: Object.keys(byDate),
    sex: 'kvinna',
    ...extra,
  }
}

function find(results: KostradResult[], id: KostradId): KostradResult {
  const r = results.find((x) => x.id === id)
  if (!r) throw new Error(`Saknar resultat ${id}`)
  return r
}

const WEEK = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27']

// ---------------------------------------------------------------------------
// foodKostrad
// ---------------------------------------------------------------------------

describe('foodKostrad', () => {
  it('räknar grönsaker, frukt och bär som frukt och grönt', () => {
    expect(foodKostrad(broccoli)).toEqual({ fruktGront: 100 })
    expect(foodKostrad(apple)).toEqual({ fruktGront: 100 })
    expect(foodKostrad(food('Blåbär', 'bar'))).toEqual({ fruktGront: 100 })
    expect(foodKostrad(food('Morot', 'rotfrukter'))).toEqual({ fruktGront: 100 })
  })

  it('räknar inte juice eller potatis som frukt och grönt', () => {
    expect(foodKostrad(juice)).toEqual({})
    expect(foodKostrad(potato)).toEqual({})
  })

  it('räknar baljväxter som eget råd (2025)', () => {
    expect(foodKostrad(beans)).toEqual({ baljvaxter: 100 })
    expect(foodKostrad(beans).fruktGront).toBeUndefined()
  })

  it('räknar sojaprodukter och hummus som baljväxter', () => {
    expect(foodKostrad(tofu).baljvaxter).toBe(100)
    expect(foodKostrad(quorn).baljvaxter).toBeUndefined()
    expect(foodKostrad(hummus).baljvaxter).toBe(60)
    expect(foodKostrad(food('Falafel', 'fardigratt')).baljvaxter).toBe(50)
  })

  it('räknar rött kött och chark, och omräknar rått kött till tillagad vikt', () => {
    expect(foodKostrad(mince)).toEqual({ rottKott: 100 })
    expect(foodKostrad(food('Falukorv', 'chark'))).toEqual({ rottKott: 100 })
    expect(foodKostrad(rawMince).rottKott).toBe(100 * RAW_TO_COOKED_MEAT)
    expect(foodKostrad(food('Kycklingfilé', 'fagel'))).toEqual({})
  })

  it('räknar fisk, skaldjur och nötter', () => {
    expect(foodKostrad(salmon)).toEqual({ fisk: 100 })
    expect(foodKostrad(food('Räkor', 'skaldjur'))).toEqual({ fisk: 100 })
    expect(foodKostrad(nuts)).toEqual({ notter: 100 })
  })

  it('räknar mejeri och växtdryck men inte grädde', () => {
    expect(foodKostrad(milk)).toEqual({ mejeri: 100 })
    expect(foodKostrad(oatDrink)).toEqual({ mejeri: 100 })
    expect(foodKostrad(cream)).toEqual({})
    expect(foodKostrad(food('Havregrädde', 'vaxtdryck'))).toEqual({})
  })

  it('använder livsmedlets egen kostrådsdata före schablonen', () => {
    const soup = food('Grönsakssoppa', 'fardigratt', { kcal: 50 }, { kostrad: { fruktGront: 60 } })
    expect(foodKostrad(soup)).toEqual({ fruktGront: 60 })
    const override = food('Specialbroccoli', 'gronsaker', { kcal: 30 }, { kostrad: { fruktGront: 50 } })
    expect(foodKostrad(override)).toEqual({ fruktGront: 50 })
  })

  it('returnerar en kopia som inte påverkar schablonen', () => {
    const r = foodKostrad(broccoli)
    r.fruktGront = 1
    expect(CATEGORY_KOSTRAD.gronsaker?.fruktGront).toBe(100)
  })
})

// ---------------------------------------------------------------------------
// evaluateKostrad
// ---------------------------------------------------------------------------

describe('evaluateKostrad', () => {
  it('returnerar tom lista utan registreringar', () => {
    expect(evaluateKostrad(input({}, { dates: WEEK }))).toEqual([])
    expect(evaluateKostrad(input({ '2026-09-21': [] }, { dates: WEEK }))).toEqual([])
  })

  it('ger alla råd med svensk text och unika id:n', () => {
    const results = evaluateKostrad(input({ '2026-09-21': [entry(broccoli, 100, '2026-09-21')] }))
    const ids = results.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual([
      'frukt_gront',
      'baljvaxter',
      'fullkorn',
      'fisk',
      'notter',
      'mejeri',
      'rott_kott',
      'salt',
      'mattat_fett',
      'socker',
      'alkohol',
      'rorelse',
    ])
    for (const r of results) {
      expect(r.title.length).toBeGreaterThan(0)
      expect(r.advice.length).toBeGreaterThan(10)
      expect(r.tip.length).toBeGreaterThan(10)
      expect(r.emoji.length).toBeGreaterThan(0)
      expect(r.source.length).toBeGreaterThan(0)
      expect(r.score).toBeGreaterThanOrEqual(0)
      expect(r.score).toBeLessThanOrEqual(1)
    }
  })

  it('räknar frukt och grönt som snitt per loggad dag', () => {
    const results = evaluateKostrad(
      input(
        {
          '2026-09-21': [entry(broccoli, 300, '2026-09-21'), entry(apple, 250, '2026-09-21')],
          '2026-09-22': [entry(broccoli, 400, '2026-09-22'), entry(juice, 200, '2026-09-22')],
        },
        { dates: WEEK },
      ),
    )
    const r = find(results, 'frukt_gront')
    expect(r.actual).toBe(475)
    expect(r.target).toBe(500)
    expect(r.perDay).toBe(true)
    expect(r.periodDays).toBe(2)
    expect(r.score).toBeCloseTo(0.95)
    expect(r.status).toBe('nastan')
    expect(r.tip).toMatch(/25 g/)
  })

  it('ger status bra och långt kvar för frukt och grönt', () => {
    const good = evaluateKostrad(input({ '2026-09-21': [entry(broccoli, 600, '2026-09-21')] }))
    expect(find(good, 'frukt_gront')).toMatchObject({ status: 'bra', score: 1 })
    const low = evaluateKostrad(input({ '2026-09-21': [entry(broccoli, 100, '2026-09-21')] }))
    expect(find(low, 'frukt_gront')).toMatchObject({ status: 'langt_kvar' })
    expect(find(low, 'frukt_gront').score).toBeCloseTo(0.2)
  })

  it('skalar veckoråd till antalet loggade dagar', () => {
    const results = evaluateKostrad(
      input({ '2026-09-21': [entry(salmon, 125, '2026-09-21')], '2026-09-22': [entry(broccoli, 100, '2026-09-22')] }, { dates: WEEK }),
    )
    const fish = find(results, 'fisk')
    expect(fish.target).toBeCloseTo((300 * 2) / 7)
    expect(fish.actual).toBe(125)
    expect(fish.status).toBe('bra')
    expect(fish.weeklyTarget).toBe(300)
    expect(fish.perDay).toBeUndefined()
  })

  it('bedömer rött kött som högst-råd', () => {
    const days = WEEK.slice(0, 7)
    const lagom: Record<string, DiaryEntry[]> = Object.fromEntries(days.map((d) => [d, [entry(mince, 50, d)]]))
    const r1 = find(evaluateKostrad(input(lagom)), 'rott_kott')
    expect(r1.actual).toBe(350)
    expect(r1.target).toBeCloseTo(350)
    expect(r1).toMatchObject({ status: 'bra', score: 1, direction: 'hogst' })

    const lite: Record<string, DiaryEntry[]> = Object.fromEntries(days.map((d) => [d, [entry(mince, 55, d)]]))
    expect(find(evaluateKostrad(input(lite)), 'rott_kott').status).toBe('nastan')

    const mycket: Record<string, DiaryEntry[]> = Object.fromEntries(days.map((d) => [d, [entry(mince, 100, d)]]))
    const r3 = find(evaluateKostrad(input(mycket)), 'rott_kott')
    expect(r3.status).toBe('over')
    expect(r3.score).toBe(0)
  })

  it('räknar rått kött om till tillagad vikt', () => {
    const r = find(evaluateKostrad(input({ '2026-09-21': [entry(rawMince, 200, '2026-09-21')] })), 'rott_kott')
    expect(r.actual).toBe(150)
  })

  it('räknar dagar med baljväxter', () => {
    const results = evaluateKostrad(
      input({
        '2026-09-21': [entry(beans, 100, '2026-09-21')],
        '2026-09-22': [entry(beans, 30, '2026-09-22')],
        '2026-09-23': [entry(tofu, 60, '2026-09-23')],
        '2026-09-24': [entry(broccoli, 100, '2026-09-24')],
      }),
    )
    const r = find(results, 'baljvaxter')
    expect(r).toMatchObject({ unit: 'dagar', target: 4, actual: 2, status: 'langt_kvar' })
    expect(r.score).toBeCloseTo(0.5)
  })

  it('räknar fullkorn från näringsvärdet med täckningsgrad', () => {
    const full = evaluateKostrad(input({ '2026-09-21': [entry(oats, 90, '2026-09-21')] }))
    expect(find(full, 'fullkorn')).toMatchObject({ actual: 90, target: 90, status: 'bra', coverage: 1 })

    const mixed = evaluateKostrad(input({ '2026-09-21': [entry(oats, 40, '2026-09-21'), entry(whiteBread, 200, '2026-09-21')] }))
    const r = find(mixed, 'fullkorn')
    expect(r.actual).toBe(40)
    // Havregryn 148 kcal känt av totalt 668 kcal.
    expect(r.coverage).toBeCloseTo(148 / 668)
    expect(r.tip).toMatch(/för låg/)
  })

  it('räknar salt från salt eller natrium, även i snabbposter', () => {
    const chips = food('Chips', 'snacks', { kcal: 530, sodium: 600 })
    const results = evaluateKostrad(
      input({ '2026-09-21': [entry(chips, 100, '2026-09-21'), quick({ kcal: 600, salt: 6 }, '2026-09-21')] }),
    )
    const salt = find(results, 'salt')
    expect(salt.actual).toBeCloseTo(7.5)
    expect(salt.status).toBe('over')
    expect(salt.coverage).toBe(1)
  })

  it('räknar mättat fett och socker i energiprocent', () => {
    const butterBread = food('Smörgås', 'brod', { kcal: 100, satFat: 2, addedSugar: 3 })
    const results = evaluateKostrad(input({ '2026-09-21': [entry(butterBread, 500, '2026-09-21')] }))
    const fat = find(results, 'mattat_fett')
    expect(fat.unit).toBe('E%')
    expect(fat.actual).toBeCloseTo(18)
    expect(fat.status).toBe('over')
    const sugar = find(results, 'socker')
    expect(sugar.actual).toBeCloseTo(12)
    expect(sugar.status).toBe('over')
  })

  it('graderar alkohol mot ingen säker nivå och Socialstyrelsens riskbruksgräns', () => {
    const none = evaluateKostrad(input({ '2026-09-21': [entry(broccoli, 100, '2026-09-21')] }))
    expect(find(none, 'alkohol')).toMatchObject({ status: 'bra', score: 1, actual: 0, target: 0 })

    // En stor stark (500 g × 2,8 g/100 g = 14 g ≈ 1,2 glas) under en vecka.
    const week: Record<string, DiaryEntry[]> = Object.fromEntries(WEEK.map((d) => [d, [entry(broccoli, 100, d)]]))
    week[WEEK[5]] = [...week[WEEK[5]], entry(beer, 500, WEEK[5])]
    const little = find(evaluateKostrad(input(week)), 'alkohol')
    expect(little.actual).toBeCloseTo(14 / 12)
    expect(little.status).toBe('nastan')

    // Samma mängd på en enda loggad dag motsvarar drygt 8 glas i veckan.
    const lot = find(evaluateKostrad(input({ '2026-09-21': [entry(beer, 500, '2026-09-21')] })), 'alkohol')
    expect(lot.status).toBe('over')
    expect(lot.tip).toMatch(/020-84 44 48/)
  })

  it('räknar mejeriprodukter per dag', () => {
    const results = evaluateKostrad(input({ '2026-09-21': [entry(milk, 200, '2026-09-21'), entry(oatDrink, 200, '2026-09-21'), entry(cream, 50, '2026-09-21')] }))
    expect(find(results, 'mejeri')).toMatchObject({ actual: 400, status: 'bra' })
  })

  it('räknar nötter per dag', () => {
    const results = evaluateKostrad(input({ '2026-09-21': [entry(nuts, 15, '2026-09-21')] }))
    expect(find(results, 'notter')).toMatchObject({ actual: 15, target: KOSTRAD_TARGETS.notterPerDay, status: 'nastan' })
  })

  it('räknar rörelse med hög intensitet dubbelt och skalar till loggade dagar', () => {
    const byDate: Record<string, DiaryEntry[]> = Object.fromEntries(WEEK.map((d) => [d, [entry(broccoli, 100, d)]]))
    const results = evaluateKostrad(
      input(byDate, { exerciseByDate: { [WEEK[0]]: [exercise(WEEK[0], 30, 3.5), exercise(WEEK[0], 45, 8)] } }),
    )
    const r = find(results, 'rorelse')
    expect(r.actual).toBe(120)
    expect(r.target).toBeCloseTo(150)
    expect(r.status).toBe('nastan')
    expect(r.score).toBeCloseTo(0.8)
  })

  it('räknar dagar med bara träning till rörelserådet', () => {
    const results = evaluateKostrad({
      entriesByDate: {},
      exerciseByDate: { '2026-09-21': [exercise('2026-09-21', 30)] },
      dates: WEEK,
      sex: 'man',
    })
    expect(results.map((r) => r.id)).toEqual(['rorelse'])
    expect(results[0]).toMatchObject({ actual: 30, status: 'bra', periodDays: 1 })
  })

  it('ignorerar poster utanför perioden', () => {
    const results = evaluateKostrad({
      entriesByDate: { '2026-09-21': [entry(broccoli, 500, '2026-09-21')], '2026-09-10': [entry(broccoli, 5000, '2026-09-10')] },
      exerciseByDate: {},
      dates: ['2026-09-21'],
      sex: 'kvinna',
    })
    expect(find(results, 'frukt_gront').actual).toBe(500)
  })
})

describe('kostradScore', () => {
  it('ger medelpoäng 0–100 och hoppar över osäkra råd', () => {
    const base = { title: 't', advice: 'a', unit: 'g', target: 1, actual: 1, direction: 'minst', tip: 't', emoji: 'x', periodDays: 1, source: 's' } as const
    const results: KostradResult[] = [
      { ...base, id: 'frukt_gront', score: 1, status: 'bra' },
      { ...base, id: 'fisk', score: 0.5, status: 'langt_kvar' },
      { ...base, id: 'fullkorn', score: 0, status: 'langt_kvar', coverage: 0.2 },
    ]
    expect(kostradScore(results)).toBe(75)
    expect(kostradScore([])).toBe(0)
  })
})
