import { describe, expect, it } from 'vitest'
import { FOOD_CATEGORIES } from '../types'
import type { DiaryEntry, Food, FoodCategory, FoodEntry, QuickEntry } from '../types'
import {
  CATEGORY_PLATE,
  PLATE_GOOD_SCORE,
  PLATE_IDEAL,
  PLATE_PART_LABELS,
  PLATE_VARIANT_LABELS,
  foodPlate,
  mealPlate,
  plateScore,
} from './plate'

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
const quick: QuickEntry = { id: 'q1', kind: 'quick', name: 'Lunch ute', nutrients: { kcal: 700 }, date: '2026-09-21', meal: 'lunch', createdAt: 0, category: 'fardigratt' }

const broccoli = food('Broccoli', 'gronsaker')
const carrot = food('Morot', 'rotfrukter')
const potato = food('Potatis, kokt', 'potatis')
const pasta = food('Pasta, kokt', 'pasta_ris')
const salmon = food('Laxfilé', 'fisk')
const chicken = food('Kycklingfilé', 'fagel')
const lentils = food('Linser, kokta', 'baljvaxter')
const oil = food('Rapsolja', 'fett_olja')
const coffee = food('Bryggkaffe', 'dryck')
const bun = food('Kanelbulle', 'bakverk')

// ---------------------------------------------------------------------------
// Ideal och schabloner
// ---------------------------------------------------------------------------

describe('PLATE_IDEAL', () => {
  it('följer Livsmedelsverkets två varianter', () => {
    expect(PLATE_IDEAL.vanlig).toEqual({ veg: 0.5, carb: 0.3, protein: 0.2 })
    expect(PLATE_IDEAL.aktiv.protein).toBe(0.2)
    expect(PLATE_IDEAL.aktiv.veg).toBe(PLATE_IDEAL.aktiv.carb)
    for (const v of Object.values(PLATE_IDEAL)) {
      expect(v.veg + v.carb + v.protein).toBeCloseTo(1)
    }
  })

  it('har svenska etiketter', () => {
    expect(PLATE_VARIANT_LABELS.aktiv.label).toMatch(/rör dig mycket/)
    expect(PLATE_PART_LABELS.protein.label).toMatch(/baljväxter/)
  })
})

describe('foodPlate', () => {
  it('har en schablon som summerar till 1 för varje kategori', () => {
    for (const c of FOOD_CATEGORIES) {
      const s = CATEGORY_PLATE[c]
      expect(s.veg + s.carb + s.protein + s.other).toBeCloseTo(1)
    }
  })

  it('placerar livsmedel enligt Tallriksmodellen', () => {
    expect(foodPlate(broccoli)).toEqual({ veg: 1, carb: 0, protein: 0, other: 0 })
    expect(foodPlate(carrot).veg).toBe(1)
    expect(foodPlate(food('Blåbär', 'bar')).veg).toBe(1)
    expect(foodPlate(potato).carb).toBe(1)
    expect(foodPlate(food('Knäckebröd', 'brod')).carb).toBe(1)
    expect(foodPlate(food('Havregryn', 'spannmal')).carb).toBe(1)
    expect(foodPlate(salmon).protein).toBe(1)
    expect(foodPlate(food('Ägg', 'agg')).protein).toBe(1)
    expect(foodPlate(food('Tofu', 'vegoprotein')).protein).toBe(1)
    expect(foodPlate(food('Halloumi', 'ost')).protein).toBe(1)
    expect(foodPlate(oil).other).toBe(1)
    expect(foodPlate(food('Mjölk', 'mejeri')).other).toBe(1)
    expect(foodPlate(food('Cashewnötter', 'notter_fron')).other).toBe(1)
  })

  it('räknar baljväxter till proteindelen', () => {
    expect(foodPlate(lentils)).toEqual({ veg: 0, carb: 0, protein: 1, other: 0 })
  })

  it('använder livsmedlets egen fördelning och lägger resten i övrigt', () => {
    const stew = food('Kycklinggryta', 'fardigratt', { plate: { veg: 0.3, carb: 0, protein: 0.4 } })
    const s = foodPlate(stew)
    expect(s.veg).toBe(0.3)
    expect(s.protein).toBe(0.4)
    expect(s.other).toBeCloseTo(0.3)
  })

  it('normaliserar felaktig fördelning som överstiger 1', () => {
    const bad = food('Fel', 'ovrigt', { plate: { veg: 1, carb: 1, protein: 0 } })
    const s = foodPlate(bad)
    expect(s.veg).toBeCloseTo(0.5)
    expect(s.carb).toBeCloseTo(0.5)
    expect(s.other).toBe(0)
  })

  it('returnerar en kopia av schablonen', () => {
    const s = foodPlate(broccoli)
    s.veg = 0
    expect(CATEGORY_PLATE.gronsaker.veg).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Måltider
// ---------------------------------------------------------------------------

describe('plateScore', () => {
  it('är 1 för idealet och 0 för helt olika fördelning', () => {
    expect(plateScore(PLATE_IDEAL.vanlig, PLATE_IDEAL.vanlig)).toBe(1)
    expect(plateScore({ veg: 0, carb: 0, protein: 1 }, { veg: 1, carb: 0, protein: 0 })).toBe(0)
    expect(plateScore({ veg: 0, carb: 0, protein: 1 }, PLATE_IDEAL.vanlig)).toBeCloseTo(0.2)
  })
})

describe('mealPlate', () => {
  it('ger full poäng för en tallrik enligt modellen', () => {
    const p = mealPlate([entry(broccoli, 150), entry(carrot, 100), entry(potato, 150), entry(salmon, 100), entry(oil, 10)])
    expect(p.grams).toEqual({ veg: 250, carb: 150, protein: 100, other: 10 })
    expect(p.fractions.veg).toBeCloseTo(0.5)
    expect(p.fractions.carb).toBeCloseTo(0.3)
    expect(p.fractions.protein).toBeCloseTo(0.2)
    expect(p.score).toBeCloseTo(1)
    expect(p.hasPlate).toBe(true)
    expect(p.focus).toBeUndefined()
    expect(p.advice).toMatch(/lagom/)
  })

  it('föreslår grönsaker när de saknas', () => {
    const p = mealPlate([entry(pasta, 250), entry(chicken, 150)])
    expect(p.fractions.veg).toBe(0)
    expect(p.score).toBeLessThan(PLATE_GOOD_SCORE)
    expect(p.focus).toBe('veg')
    expect(p.advice).toMatch(/näve grönsaker/)
  })

  it('föreslår protein när det saknas', () => {
    const p = mealPlate([entry(broccoli, 200), entry(potato, 200)])
    expect(p.focus).toBe('protein')
    expect(p.advice).toMatch(/protein/)
  })

  it('föreslår kolhydrater när de saknas', () => {
    const p = mealPlate([entry(broccoli, 250), entry(salmon, 100)])
    expect(p.focus).toBe('carb')
    expect(p.advice).toMatch(/potatis/)
  })

  it('pratar om överskott när inget tydligt underskott finns', () => {
    const p = mealPlate([entry(broccoli, 42), entry(potato, 22), entry(salmon, 36)])
    expect(p.score).toBeLessThan(PLATE_GOOD_SCORE)
    expect(p.advice).toMatch(/Proteindelen är stor/)
  })

  it('använder den aktiva varianten', () => {
    const meal: DiaryEntry[] = [entry(broccoli, 200), entry(potato, 200), entry(lentils, 100)]
    const aktiv = mealPlate(meal, 'aktiv')
    expect(aktiv.variant).toBe('aktiv')
    expect(aktiv.ideal).toEqual(PLATE_IDEAL.aktiv)
    expect(aktiv.score).toBeCloseTo(1)
    const vanlig = mealPlate(meal, 'vanlig')
    expect(vanlig.score).toBeCloseTo(0.9)
  })

  it('hanterar fika utan tallriksdelar', () => {
    const p = mealPlate([entry(coffee, 200), entry(bun, 80)])
    expect(p.hasPlate).toBe(false)
    expect(p.score).toBe(0)
    expect(p.fractions).toEqual({ veg: 0, carb: 0, protein: 0 })
    expect(p.advice).toMatch(/fika/)
  })

  it('hanterar tom måltid och snabbposter', () => {
    expect(mealPlate([]).advice).toMatch(/Registrera/)
    const p = mealPlate([quick])
    expect(p.hasPlate).toBe(false)
    expect(p.grams).toEqual({ veg: 0, carb: 0, protein: 0, other: 0 })
  })

  it('ignorerar poster med ogiltig vikt', () => {
    const p = mealPlate([entry(broccoli, Number.NaN), entry(potato, -5), entry(salmon, 100)])
    expect(p.grams.protein).toBe(100)
    expect(p.grams.veg).toBe(0)
  })
})
