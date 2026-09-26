import { describe, expect, it } from 'vitest'
import { FOOD_CATEGORIES } from '../types'
import type { Food, FoodCategory, FoodEntry, QuickEntry } from '../types'
import {
  CAR_KG_CO2E_PER_KM,
  CATEGORY_CO2E,
  CLIMATE_REFERENCE,
  CLIMATE_THRESHOLDS,
  MIN_SWAP_SAVING_KG,
  climateRating,
  co2eEquivalents,
  dayClimate,
  dayCo2e,
  entryCo2e,
  foodClimateFactor,
  foodCo2e,
  swapSuggestions,
} from './climate'

// ---------------------------------------------------------------------------
// Fixturer
// ---------------------------------------------------------------------------

let seq = 0
function food(name: string, category: FoodCategory, extra: Partial<Food> = {}): Food {
  return { id: `test:${name}`, name, source: 'custom', category, nutrients: { kcal: 100 }, portions: [], ...extra }
}
function entry(f: Food, grams: number): FoodEntry {
  return { id: `e${++seq}`, kind: 'food', food: f, amount: grams, unit: 'g', grams, date: '2026-09-21', meal: 'middag', createdAt: 0 }
}
const quick: QuickEntry = { id: 'q1', kind: 'quick', name: 'Lunch ute', nutrients: { kcal: 700 }, date: '2026-09-21', meal: 'lunch', createdAt: 0 }

const notfars = food('Nötfärs 12 %, rå', 'rott_kott')
const flaskfars = food('Fläskfärs', 'rott_kott')
const blandfars = food('Blandfärs', 'rott_kott')
const kycklingfars = food('Kycklingfärs', 'fagel')
const potatis = food('Potatis, kokt', 'potatis')
const ost = food('Hushållsost 26 %', 'ost')

// ---------------------------------------------------------------------------
// Schabloner
// ---------------------------------------------------------------------------

describe('CATEGORY_CO2E', () => {
  it('har ett rimligt värde med källa för varje kategori', () => {
    for (const c of FOOD_CATEGORIES) {
      const f = CATEGORY_CO2E[c]
      expect(f.kgPerKg).toBeGreaterThan(0)
      expect(f.kgPerKg).toBeLessThan(40)
      expect(f.source.length).toBeGreaterThan(0)
    }
  })

  it('följer RISE:s storleksordning mellan livsmedel', () => {
    expect(CATEGORY_CO2E.potatis.kgPerKg).toBe(0.1)
    expect(CATEGORY_CO2E.ost.kgPerKg).toBe(11)
    expect(CATEGORY_CO2E.agg.kgPerKg).toBe(1.4)
    expect(CATEGORY_CO2E.fagel.kgPerKg).toBe(3.3)
    expect(CATEGORY_CO2E.rott_kott.kgPerKg).toBeGreaterThan(CATEGORY_CO2E.fagel.kgPerKg)
    expect(CATEGORY_CO2E.fagel.kgPerKg).toBeGreaterThan(CATEGORY_CO2E.baljvaxter.kgPerKg)
  })
})

describe('foodCo2e', () => {
  it('använder livsmedlets eget värde först', () => {
    const f = food('Havredryck', 'vaxtdryck', { co2e: 0.33 })
    expect(foodCo2e(f)).toBe(0.33)
    expect(foodClimateFactor(f).source).toMatch(/eget värde/)
    expect(foodClimateFactor({ ...f, source: 'openfoodfacts' }).source).toBe('Open Food Facts')
  })

  it('använder kategorins schablon', () => {
    expect(foodCo2e(potatis)).toBe(0.1)
    expect(foodCo2e(food('Okänd rätt', 'fardigratt'))).toBe(2.5)
  })

  it('förfinar rött kött utifrån namnet', () => {
    expect(foodCo2e(notfars)).toBe(28)
    expect(foodCo2e(food('Entrecôte', 'rott_kott'))).toBe(28)
    expect(foodCo2e(flaskfars)).toBe(4.4)
    expect(foodCo2e(food('Bacon', 'chark'))).toBe(4.4)
    expect(foodCo2e(blandfars)).toBe(16)
    expect(foodCo2e(food('Lammracks', 'rott_kott'))).toBe(21)
    expect(foodCo2e(food('Älgfärs', 'rott_kott'))).toBe(1.5)
    expect(foodCo2e(food('Älgkalv, stek', 'rott_kott'))).toBe(1.5)
    expect(foodCo2e(food('Okänt kött', 'rott_kott'))).toBe(CATEGORY_CO2E.rott_kott.kgPerKg)
  })

  it('räknar sammansatta rätter och hamburgare med en köttandel', () => {
    expect(foodCo2e(food('Köttfärssås på nötfärs', 'fardigratt'))).toBe(8)
    expect(foodCo2e(food('Hamburgare med bröd', 'snabbmat'))).toBe(10)
    expect(foodCo2e(food('Kycklinghamburgare', 'snabbmat'))).toBe(CATEGORY_CO2E.snabbmat.kgPerKg)
    expect(foodCo2e(food('Vegoburgare', 'snabbmat'))).toBe(CATEGORY_CO2E.snabbmat.kgPerKg)
  })

  it('förfinar andra kategorier med stor spridning', () => {
    expect(foodCo2e(food('Smör normalsaltat', 'fett_olja'))).toBe(7)
    expect(foodCo2e(food('Flytande margarin', 'fett_olja'))).toBe(1.1)
    expect(foodCo2e(food('Rapsolja', 'fett_olja'))).toBe(1.5)
    expect(foodCo2e(food('Blåmusslor', 'skaldjur'))).toBe(0.3)
    expect(foodCo2e(food('Räkor, skalade', 'skaldjur'))).toBe(7)
    expect(foodCo2e(food('Laxfilé', 'fisk'))).toBe(2.3)
    expect(foodCo2e(food('Vispgrädde', 'mejeri'))).toBe(4)
    // Nyckelord gäller bara i rätt kategori.
    expect(foodCo2e(food('Nötter', 'notter_fron'))).toBe(CATEGORY_CO2E.notter_fron.kgPerKg)
  })

  it('räknar om ris och pasta till kokt vikt', () => {
    expect(foodCo2e(food('Ris, jasmin', 'pasta_ris'))).toBe(3.1)
    expect(foodCo2e(food('Ris, jasmin, kokt', 'pasta_ris'))).toBeCloseTo(1.24)
    expect(foodCo2e(food('Spagetti', 'pasta_ris'))).toBe(0.8)
    expect(foodCo2e(food('Spagetti, kokt', 'pasta_ris'))).toBeCloseTo(0.32)
    expect(foodClimateFactor(food('Pasta, kokt', 'pasta_ris')).source).toMatch(/kokt vikt/)
    // "okokt" ska inte tolkas som kokt.
    expect(foodCo2e(food('Pasta, okokt', 'pasta_ris'))).toBe(0.8)
  })
})

describe('entryCo2e och dayCo2e', () => {
  it('räknar kg CO2e för en post', () => {
    expect(entryCo2e(entry(notfars, 125))).toBeCloseTo(3.5)
    expect(entryCo2e(entry(potatis, 200))).toBeCloseTo(0.02)
  })

  it('räknar snabbposter och ogiltiga vikter som 0', () => {
    expect(entryCo2e(quick)).toBe(0)
    expect(entryCo2e(entry(notfars, Number.NaN))).toBe(0)
    expect(entryCo2e(entry(notfars, -10))).toBe(0)
  })

  it('summerar en dag', () => {
    expect(dayCo2e([entry(notfars, 125), entry(potatis, 200), quick])).toBeCloseTo(3.52)
    expect(dayCo2e([])).toBe(0)
  })

  it('fördelar per kategori och räknar okända poster', () => {
    const d = dayClimate([entry(notfars, 100), entry(ost, 30), entry(potatis, 200), entry(flaskfars, 100), quick])
    expect(d.kg).toBeCloseTo(2.8 + 0.33 + 0.02 + 0.44)
    expect(d.unknownEntries).toBe(1)
    expect(d.byCategory[0]).toEqual({ category: 'rott_kott', kg: expect.closeTo(3.24, 5) })
    expect(d.byCategory.map((x) => x.category)).toEqual(['rott_kott', 'ost', 'potatis'])
  })
})

// ---------------------------------------------------------------------------
// Referenser
// ---------------------------------------------------------------------------

describe('CLIMATE_REFERENCE och co2eEquivalents', () => {
  it('har dokumenterade referensnivåer', () => {
    expect(CLIMATE_REFERENCE.averageSwedeKgPerDay).toBeCloseTo(CLIMATE_REFERENCE.averageSwedeKgPerYear / 365, 1)
    expect(CLIMATE_REFERENCE.klimatsmartKgPerDay).toBeCloseTo(CLIMATE_REFERENCE.klimatsmartKgPerWeek / 7, 1)
    expect(CLIMATE_REFERENCE.klimatsmartKgPerDay).toBeLessThan(CLIMATE_REFERENCE.averageSwedeKgPerDay)
    expect(CAR_KG_CO2E_PER_KM).toBe(0.126)
  })

  it('räknar om till bilkilometer och måltider', () => {
    const eq = co2eEquivalents(1.26)
    expect(eq.carKm).toBeCloseTo(10)
    expect(eq.onePlanetMeals).toBeCloseTo(2.52)
    expect(eq.averageDayShare).toBeCloseTo(1.26 / 4.7)
  })

  it('hanterar noll, negativa och ogiltiga värden', () => {
    expect(co2eEquivalents(0)).toEqual({ carKm: 0, averageDayShare: 0, onePlanetMeals: 0 })
    expect(co2eEquivalents(-3).carKm).toBe(0)
    expect(co2eEquivalents(Number.NaN).carKm).toBe(0)
  })
})

describe('climateRating', () => {
  it('ger låg, medel och hög klimatpåverkan', () => {
    expect(climateRating(1.2).level).toBe('lag')
    expect(climateRating(CLIMATE_THRESHOLDS.lag).level).toBe('lag')
    expect(climateRating(3).level).toBe('medel')
    expect(climateRating(CLIMATE_THRESHOLDS.hog).level).toBe('medel')
    expect(climateRating(6).level).toBe('hog')
    expect(climateRating(Number.NaN).level).toBe('lag')
  })

  it('har svenska etiketter och designtokens', () => {
    expect(climateRating(1).label).toBe('Låg klimatpåverkan')
    expect(climateRating(1).tone).toBe('mossa')
    expect(climateRating(3).tone).toBe('sol')
    expect(climateRating(8)).toMatchObject({ label: 'Hög klimatpåverkan', tone: 'hjortron' })
  })
})

// ---------------------------------------------------------------------------
// Bytesförslag
// ---------------------------------------------------------------------------

describe('swapSuggestions', () => {
  it('föreslår att byta nötfärs med uppskattad besparing', () => {
    const e = entry(notfars, 125)
    const [s] = swapSuggestions([e])
    expect(s.id).toBe('notfars')
    expect(s.entryIds).toEqual([e.id])
    expect(s.savingKg).toBeCloseTo((28 - 2) * 0.125)
    expect(s.text).toBe('Byt nötfärsen mot kycklingfärs, sojafärs eller linser – sparar ca 3,3 kg CO2e')
  })

  it('sorterar på största besparing och begränsar antalet', () => {
    const list = [entry(ost, 40), entry(notfars, 100), entry(food('Smör', 'fett_olja'), 30), entry(food('Räkor', 'skaldjur'), 100)]
    const all = swapSuggestions(list, 10)
    expect(all.map((s) => s.id)).toEqual(['notfars', 'rakor', 'ost', 'smor'])
    for (let i = 1; i < all.length; i++) expect(all[i].savingKg).toBeLessThanOrEqual(all[i - 1].savingKg)
    expect(swapSuggestions(list)).toHaveLength(3)
    expect(swapSuggestions(list, 1)).toHaveLength(1)
    expect(swapSuggestions(list, 0)).toHaveLength(0)
  })

  it('slår ihop flera poster med samma regel', () => {
    const a = entry(notfars, 100)
    const b = entry(notfars, 100)
    const [s] = swapSuggestions([a, b])
    expect(s.entryIds).toEqual([a.id, b.id])
    expect(s.savingKg).toBeCloseTo(5.2)
  })

  it('föreslår inget för klimatsmarta val eller små mängder', () => {
    expect(swapSuggestions([entry(kycklingfars, 150), entry(potatis, 300)])).toEqual([])
    expect(swapSuggestions([entry(food('Smör', 'fett_olja'), 5)])).toEqual([])
    expect(swapSuggestions([entry(food('Kycklingkorv', 'chark'), 100)])).toEqual([])
    expect(swapSuggestions([entry(food('Älgfärs', 'rott_kott'), 150)])).toEqual([])
    expect(swapSuggestions([quick])).toEqual([])
    expect(MIN_SWAP_SAVING_KG).toBeGreaterThan(0)
  })

  it('föreslår byten för lamm, hamburgare, ris och chark', () => {
    const ids = swapSuggestions(
      [
        entry(food('Lammfärs', 'rott_kott'), 100),
        entry(food('Hamburgare', 'snabbmat'), 200),
        entry(food('Ris, jasmin', 'pasta_ris'), 75),
        entry(food('Falukorv', 'chark'), 150),
      ],
      10,
    ).map((s) => s.id)
    expect(ids).toEqual(expect.arrayContaining(['lamm', 'hamburgare', 'ris', 'chark']))
  })

  it('skriver förslagen på svenska', () => {
    for (const s of swapSuggestions([entry(ost, 50), entry(food('Vispgrädde', 'mejeri'), 100)], 5)) {
      expect(s.text).toMatch(/^Byt .+ mot .+ – sparar ca \d+,\d kg CO2e$/)
    }
  })
})
