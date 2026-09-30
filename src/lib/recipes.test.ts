/**
 * Tester för receptmatematiken. Kör: npx vitest run src/lib/recipes.test.ts
 */
import { describe, expect, it } from 'vitest'
import type { Food, Recipe, RecipeIngredient } from '../types'
import {
  ingredientGrams,
  recipeCo2e,
  recipeFinalWeight,
  recipeFoodId,
  recipeKostrad,
  recipeNutrientCoverage,
  recipeNutrientsPer100,
  recipePerServing,
  recipePlate,
  recipeRawWeight,
  recipeServingWeight,
  recipeTags,
  recipeToFood,
  recipeTotals,
} from './recipes'
import { foodCo2e } from './climate'

const vetemjol: Food = {
  id: 'lagom:vetemjol',
  name: 'Vetemjöl',
  source: 'lagom',
  category: 'spannmal',
  nutrients: { kcal: 350, protein: 11, carbs: 70, fat: 1.5, fiber: 3 },
  portions: [],
  density: 0.6,
  tags: ['vegan'],
}
const mjolk: Food = {
  id: 'lagom:mjolk-3',
  name: 'Mjölk 3 %',
  source: 'lagom',
  category: 'mejeri',
  nutrients: { kcal: 60, protein: 3.4, carbs: 4.6, fat: 3, calcium: 120, vitD: 0.5 },
  portions: [],
  liquid: true,
  tags: ['vegetarisk'],
}
const agg: Food = {
  id: 'lagom:agg',
  name: 'Ägg',
  source: 'lagom',
  category: 'agg',
  nutrients: { kcal: 140, protein: 12.5, carbs: 0.4, fat: 9.7, vitD: 1.8 },
  portions: [{ id: 'st', label: '1 st (medel)', grams: 60 }],
  tags: ['vegetarisk', 'glutenfri'],
}
const smor: Food = {
  id: 'lagom:smor',
  name: 'Smör',
  source: 'lagom',
  category: 'fett_olja',
  nutrients: { kcal: 740, protein: 0.6, carbs: 0.6, fat: 82 },
  portions: [],
  tags: ['vegetarisk', 'glutenfri'],
}

const ing = (id: string, food: Food, amount: number, unit: RecipeIngredient['unit'], grams: number): RecipeIngredient => ({
  id,
  food,
  amount,
  unit,
  grams,
})

/** Klassiska pannkakor – 4 portioner. */
const pannkakor: Recipe = {
  id: 'pannkakor',
  name: 'Pannkakor',
  servings: 4,
  ingredients: [
    ing('1', vetemjol, 2.5, 'dl', 150),
    ing('2', mjolk, 6, 'dl', 600),
    ing('3', agg, 3, 'portion:st', 180),
    ing('4', smor, 25, 'g', 25),
  ],
  cookedWeightG: 880,
  createdAt: 1,
  updatedAt: 2,
}

describe('receptmatematik', () => {
  it('summerar näringsvärden utifrån gram', () => {
    const t = recipeTotals(pannkakor)
    // 150×3,5 + 600×0,6 + 180×1,4 + 25×7,4
    expect(t.kcal).toBeCloseTo(1322, 6)
    expect(t.protein).toBeCloseTo(150 * 0.11 + 600 * 0.034 + 180 * 0.125 + 25 * 0.006, 6)
    // Okända värden räknas inte som 0 – kalcium finns bara i mjölken.
    expect(t.calcium).toBeCloseTo(720, 6)
    expect(t.fiber).toBeCloseTo(4.5, 6)
  })

  it('räknar rå och färdig vikt', () => {
    expect(recipeRawWeight(pannkakor)).toBe(955)
    expect(recipeFinalWeight(pannkakor)).toBe(880)
    expect(recipeFinalWeight({ ...pannkakor, cookedWeightG: undefined })).toBe(955)
    expect(recipeFinalWeight({ ...pannkakor, cookedWeightG: 0 })).toBe(955)
    expect(recipeServingWeight(pannkakor)).toBe(220)
  })

  it('räknar per 100 g färdig rätt och per portion', () => {
    expect(recipeNutrientsPer100(pannkakor).kcal).toBeCloseTo((1322 / 880) * 100, 6)
    expect(recipePerServing(pannkakor).kcal).toBeCloseTo(1322 / 4, 6)
    // Utan tillagad vikt används råvikten.
    expect(recipeNutrientsPer100({ ...pannkakor, cookedWeightG: undefined }).kcal).toBeCloseTo((1322 / 955) * 100, 6)
  })

  it('hanterar tomma och trasiga recept', () => {
    const empty: Recipe = { ...pannkakor, ingredients: [], cookedWeightG: undefined, servings: 0 }
    expect(recipeTotals(empty)).toEqual({})
    expect(recipeNutrientsPer100(empty)).toEqual({})
    expect(recipePerServing(empty)).toEqual({})
    expect(recipePlate(empty)).toBeUndefined()
    expect(recipeCo2e(empty)).toBeUndefined()
    const food = recipeToFood({ ...empty, name: '  ' })
    expect(food.name).toBe('Namnlöst recept')
    expect(food.portions).toEqual([])
  })

  it('räknar om ingredienser med ogiltig vikt från mängd och enhet', () => {
    const broken = ing('x', vetemjol, 2, 'dl', Number.NaN)
    expect(ingredientGrams(broken)).toBeCloseTo(120, 6)
    expect(ingredientGrams(ing('y', mjolk, 1, 'portion:saknas', Number.NaN))).toBe(0)
  })

  it('visar hur stor del av vikten som har kända värden', () => {
    const cov = recipeNutrientCoverage(pannkakor)
    expect(cov.kcal).toBe(1)
    expect(cov.vitD).toBeCloseTo(780 / 955, 6)
    expect(cov.iodine).toBe(0)
  })

  it('väger ihop Tallriksmodellen efter råvikt', () => {
    const plate = recipePlate(pannkakor)!
    expect(plate.veg).toBe(0)
    expect(plate.carb).toBeCloseTo(150 / 955, 3)
    expect(plate.protein).toBeCloseTo(180 / 955, 3)
  })

  it('räknar kostråd per 100 g färdig rätt', () => {
    const k = recipeKostrad(pannkakor)
    expect(k.mejeri).toBeCloseTo((600 / 880) * 100, 1)
    expect(k.rottKott).toBeUndefined()
    // Grönsakssoppa: 400 g morötter + 600 g vatten, kokas ned till 900 g.
    const morot: Food = { id: 'lagom:morot', name: 'Morot', source: 'lagom', category: 'rotfrukter', nutrients: { kcal: 35 }, portions: [] }
    const vatten: Food = { id: 'lagom:vatten', name: 'Vatten', source: 'lagom', category: 'dryck', nutrients: { kcal: 0 }, portions: [], liquid: true }
    const soppa: Recipe = { ...pannkakor, ingredients: [ing('a', morot, 400, 'g', 400), ing('b', vatten, 6, 'dl', 600)], cookedWeightG: 900 }
    expect(recipeKostrad(soppa).fruktGront).toBeCloseTo((400 / 900) * 100, 1)
  })

  it('summerar klimatavtrycket per kg färdig rätt', () => {
    const expected =
      ((150 / 1000) * foodCo2e(vetemjol) +
        (600 / 1000) * foodCo2e(mjolk) +
        (180 / 1000) * foodCo2e(agg) +
        (25 / 1000) * foodCo2e(smor)) /
      0.88
    expect(recipeCo2e(pannkakor)).toBeCloseTo(expected, 2)
  })

  it('ärver märkningar bara när alla ingredienser har dem', () => {
    const tags = recipeTags(pannkakor)
    expect(tags).toContain('vegetarisk')
    expect(tags).not.toContain('vegan')
    expect(tags).not.toContain('glutenfri') // mjölet är inte glutenfritt
    expect(recipeTags({ ingredients: [ing('1', vetemjol, 1, 'g', 100)], tags: ['klassiker'] })).toEqual(
      expect.arrayContaining(['klassiker', 'vegan', 'vegetarisk']),
    )
    expect(recipeTags({ ingredients: [ing('1', { ...vetemjol, tags: undefined }, 1, 'g', 100)] })).toEqual([])
  })
})

describe('recipeToFood', () => {
  it('skapar ett loggbart livsmedel', () => {
    const food = recipeToFood(pannkakor)
    expect(food.id).toBe('recipe:pannkakor')
    expect(food.name).toBe('Pannkakor')
    expect(food.source).toBe('recipe')
    expect(food.category).toBe('fardigratt')
    expect(food.nutrients.kcal).toBeCloseTo(150.23, 1)
    expect(food.portions).toEqual([
      { id: 'portion', label: '1 portion', grams: 220 },
      { id: 'hela', label: 'Hela receptet', grams: 880 },
    ])
    expect(food.plate?.carb).toBeCloseTo(0.157, 3)
    expect(food.kostrad).toEqual({ mejeri: 68.2 })
    expect(food.co2e).toBe(recipeCo2e(pannkakor))
    expect(food.tags).toContain('vegetarisk')
    expect(food.note).toBe('4 portioner · 4 ingredienser')
    expect(food.createdAt).toBe(1)
    expect(food.updatedAt).toBe(2)
  })

  it('lägger inte till prefixet två gånger', () => {
    expect(recipeFoodId('abc')).toBe('recipe:abc')
    expect(recipeFoodId('recipe:abc')).toBe('recipe:abc')
    expect(recipeToFood({ ...pannkakor, id: 'recipe:xyz' }).id).toBe('recipe:xyz')
  })

  it('räknar portionsvikt korrekt när portionerna inte går jämnt upp', () => {
    const food = recipeToFood({ ...pannkakor, servings: 3 })
    expect(food.portions[0].grams).toBeCloseTo(293.3, 1)
    expect(food.note).toBe('3 portioner · 4 ingredienser')
    expect(recipeToFood({ ...pannkakor, servings: 1 }).note).toBe('1 portion · 4 ingredienser')
  })
})
