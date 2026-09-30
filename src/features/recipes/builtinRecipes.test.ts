/**
 * Kvalitetskontroll av de inbyggda svenska klassikerna: varje ingrediens finns i Lagoms databas,
 * går att räkna om till gram och varje recept ger en rimlig energimängd per portion.
 */
import { describe, expect, it, vi } from 'vitest'
import { BUILTIN_FOODS } from '../../data/foods/index'
import {
  BUILTIN_RECIPE_PREFIX,
  BUILTIN_RECIPE_SEEDS,
  EXTRAS_PREFIX,
  builtinRecipeInfo,
  isBuiltinRecipeId,
  loadBuiltinRecipes,
  resolveSeedIngredient,
} from '../../data/recipes'
import { recipeFinalWeight, recipePerServing, recipeRawWeight, recipeServingWeight, recipeToFood } from '../../lib/recipes'
import { gramsFor } from '../../lib/units'

const byId = new Map(BUILTIN_FOODS.map((f) => [f.id, f]))

/** Energi per portion för rätter som äts som en måltid respektive fika/bakverk per styck. */
const MEAL_RANGE: [number, number] = [150, 1200]
const PIECE_RANGE: [number, number] = [15, 600]

describe('Svenska klassiker – data', () => {
  it('har 25–35 recept med unika id:n', () => {
    expect(BUILTIN_RECIPE_SEEDS.length).toBeGreaterThanOrEqual(25)
    expect(BUILTIN_RECIPE_SEEDS.length).toBeLessThanOrEqual(35)
    const ids = BUILTIN_RECIPE_SEEDS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/)
  })

  it('varje ingrediens finns i BUILTIN_FOODS (direkt eller via alias) och kan räknas om till gram', () => {
    const problems: string[] = []
    for (const seed of BUILTIN_RECIPE_SEEDS) {
      for (const [foodId, seedAmount, seedUnit] of seed.ingredients) {
        const resolved = resolveSeedIngredient(byId, foodId, seedAmount, seedUnit)
        if (!resolved) {
          problems.push(`${seed.id}: ${foodId} saknas`)
          continue
        }
        const { food, amount, unit } = resolved
        const grams = gramsFor(food, amount, unit)
        if (!Number.isFinite(grams) || grams <= 0) problems.push(`${seed.id}: ${amount} ${unit} ${foodId} ger inga gram`)
      }
    }
    expect(problems).toEqual([])
  })

  it('pekar direkt på dagens livsmedel – inte på gamla id:n via alias', () => {
    const viaAlias = BUILTIN_RECIPE_SEEDS.flatMap((seed) =>
      seed.ingredients.filter(([foodId]) => !byId.has(foodId)).map(([foodId]) => `${seed.id}: ${foodId}`),
    )
    expect(viaAlias).toEqual([])
  })

  it('har namn, emoji, portioner, tid och instruktioner på svenska', () => {
    for (const seed of BUILTIN_RECIPE_SEEDS) {
      expect(seed.name.trim().length).toBeGreaterThan(2)
      expect(seed.emoji.length).toBeGreaterThan(0)
      expect(seed.servings).toBeGreaterThanOrEqual(1)
      expect(seed.prepMinutes).toBeGreaterThan(0)
      expect(seed.instructions.length).toBeGreaterThanOrEqual(2)
      expect(seed.intro.length).toBeGreaterThan(10)
      expect(seed.ingredients.length).toBeGreaterThanOrEqual(2)
    }
  })
})

describe('loadBuiltinRecipes', () => {
  const recipes = loadBuiltinRecipes(BUILTIN_FOODS)

  it('löser alla recept med alla ingredienser', () => {
    expect(recipes).toHaveLength(BUILTIN_RECIPE_SEEDS.length)
    for (const [i, r] of recipes.entries()) {
      const seed = BUILTIN_RECIPE_SEEDS[i]
      expect(r.id).toBe(`${BUILTIN_RECIPE_PREFIX}${seed.id}`)
      expect(r.builtin).toBe(true)
      expect(r.ingredients).toHaveLength(seed.ingredients.length)
      expect(new Set(r.ingredients.map((x) => x.id)).size).toBe(r.ingredients.length)
      for (const ing of r.ingredients) {
        expect(ing.grams).toBeGreaterThan(0)
        expect(ing.food.id.startsWith('lagom:')).toBe(true)
      }
      expect(isBuiltinRecipeId(r.id)).toBe(true)
      expect(builtinRecipeInfo(r.id)?.intro).toBe(seed.intro)
    }
  })

  it('ger rimlig energi per portion', () => {
    const out: string[] = []
    for (const r of recipes) {
      const kcal = recipePerServing(r).kcal ?? Number.NaN
      const piece = builtinRecipeInfo(r.id)?.servingNoun !== undefined
      const [min, max] = piece ? PIECE_RANGE : MEAL_RANGE
      if (!(kcal >= min && kcal <= max)) out.push(`${r.name}: ${Math.round(kcal)} kcal per portion`)
    }
    expect(out).toEqual([])
  })

  it('har en rimlig tillagad vikt (30–200 % av råvikten) och energitäthet', () => {
    for (const r of recipes) {
      const raw = recipeRawWeight(r)
      const final = recipeFinalWeight(r)
      expect(final / raw).toBeGreaterThan(0.3)
      expect(final / raw).toBeLessThan(2)
      const food = recipeToFood(r)
      // Ingen färdig rätt ska vara energitätare än rent fett eller tunnare än buljong.
      expect(food.nutrients.kcal).toBeGreaterThan(30)
      expect(food.nutrients.kcal).toBeLessThan(600)
      expect(recipeServingWeight(r)).toBeGreaterThan(5)
    }
  })

  it('lägger ingredienser utan näringsvärde först i instruktionerna', () => {
    const bullar = recipes.find((r) => r.id === 'klassiker-kanelbullar')
    expect(bullar?.instructions?.split('\n')[0]).toBe(`${EXTRAS_PREFIX} 50 g jäst, pärlsocker till garnering.`)
    const pannkakor = recipes.find((r) => r.id === 'klassiker-pannkakor')
    expect(pannkakor?.instructions?.startsWith(EXTRAS_PREFIX)).toBe(false)
  })

  it('memoiserar per livsmedelslista', () => {
    expect(loadBuiltinRecipes(BUILTIN_FOODS)).toBe(recipes)
  })

  it('hoppar över saknade livsmedel med en varning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const withoutMilk = BUILTIN_FOODS.filter((f) => f.id !== 'lagom:mjolk-standard-3')
    const list = loadBuiltinRecipes(withoutMilk)
    const pannkakor = list.find((r) => r.id === 'klassiker-pannkakor')
    expect(pannkakor?.ingredients.some((i) => i.food.id === 'lagom:mjolk-standard-3')).toBe(false)
    expect(pannkakor?.ingredients.length).toBe(4)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
