/**
 * Receptmatematik – delas av receptfunktionen och livsmedelsregistret (`foodRepo`).
 *
 * Principer
 * - Ingrediensernas näringsvärden summeras utifrån deras vikt i gram (`ingredient.grams`).
 * - Färdig vikt = uppmätt vikt efter tillagning (`cookedWeightG`) om den finns, annars råvikten.
 *   Vatten som kokar bort koncentrerar näringen per 100 g; vatten som sugs upp (ris, pasta) späder ut den.
 * - Ett näringsämne som saknas i en ingrediens räknas inte som 0 – summan bygger på de ingredienser
 *   där värdet är känt. `recipeNutrientCoverage` visar hur stor andel av vikten som har kända värden.
 * - Tallriksmodell, kostråd och klimat vägs ihop från ingredienserna (via `foodPlate`, `foodKostrad`
 *   och `foodCo2e`, som faller tillbaka på kategorins schablon när ett livsmedel saknar egna värden).
 */
import type { Food, FoodTag, Nutrients, PlateSplit, Portion, Recipe, RecipeIngredient } from '../types'
import { NUTRIENT_KEYS, scaleNutrients, sumNutrients, nutrientsForGrams, type NutrientKey } from './nutrients'
import { gramsFor } from './units'
import { plural } from './format'
import { foodPlate } from './plate'
import { foodKostrad, type KostradContribFull } from './kostrad'
import { foodCo2e } from './climate'

/** Prefix för recept som livsmedel. */
export const RECIPE_ID_PREFIX = 'recipe:'

/** Livsmedels-id för ett recept: 'recipe:<id>' (om id:t inte redan har prefixet). */
export function recipeFoodId(recipeId: string): string {
  return recipeId.startsWith(RECIPE_ID_PREFIX) ? recipeId : `${RECIPE_ID_PREFIX}${recipeId}`
}

/**
 * En ingrediens vikt i gram. Använder `grams` om det är giltigt, annars räknas mängd + enhet om
 * (t.ex. äldre data). Ogiltiga värden ger 0.
 */
export function ingredientGrams(ingredient: RecipeIngredient): number {
  if (Number.isFinite(ingredient.grams) && ingredient.grams > 0) return ingredient.grams
  const g = gramsFor(ingredient.food, ingredient.amount, ingredient.unit)
  return Number.isFinite(g) && g > 0 ? g : 0
}

/** Antal portioner, minst 1 (skyddar mot 0 och ogiltiga värden). */
export function recipeServings(recipe: Pick<Recipe, 'servings'>): number {
  const s = recipe.servings
  return Number.isFinite(s) && s > 0 ? s : 1
}

/** Totala näringsvärden för hela receptet. */
export function recipeTotals(recipe: Pick<Recipe, 'ingredients'>): Nutrients {
  return sumNutrients(recipe.ingredients.map((i) => nutrientsForGrams(i.food.nutrients, ingredientGrams(i))))
}

/** Summan av ingrediensernas vikt i gram (före tillagning). */
export function recipeRawWeight(recipe: Pick<Recipe, 'ingredients'>): number {
  return recipe.ingredients.reduce((sum, i) => sum + ingredientGrams(i), 0)
}

/** Färdig vikt i gram: uppmätt vikt efter tillagning, annars råvikten. */
export function recipeFinalWeight(recipe: Pick<Recipe, 'ingredients' | 'cookedWeightG'>): number {
  const cooked = recipe.cookedWeightG
  if (cooked !== undefined && Number.isFinite(cooked) && cooked > 0) return cooked
  return recipeRawWeight(recipe)
}

/** Näringsvärden per 100 g färdig rätt. Tomt objekt om receptet saknar vikt. */
export function recipeNutrientsPer100(recipe: Pick<Recipe, 'ingredients' | 'cookedWeightG'>): Nutrients {
  const final = recipeFinalWeight(recipe)
  if (!(final > 0)) return {}
  return scaleNutrients(recipeTotals(recipe), 100 / final)
}

/** Näringsvärden för en portion. */
export function recipePerServing(recipe: Pick<Recipe, 'ingredients' | 'servings'>): Nutrients {
  return scaleNutrients(recipeTotals(recipe), 1 / recipeServings(recipe))
}

/** Vikt i gram för en portion färdig rätt. */
export function recipeServingWeight(recipe: Pick<Recipe, 'ingredients' | 'cookedWeightG' | 'servings'>): number {
  return recipeFinalWeight(recipe) / recipeServings(recipe)
}

/**
 * Andel (0–1) av receptets råvikt där respektive näringsämne är känt. Bra för att visa
 * "Vitamin D är okänt för 30 % av ingredienserna".
 */
export function recipeNutrientCoverage(recipe: Pick<Recipe, 'ingredients'>): Record<NutrientKey, number> {
  const raw = recipeRawWeight(recipe)
  const out = {} as Record<NutrientKey, number>
  for (const key of NUTRIENT_KEYS) {
    if (!(raw > 0)) {
      out[key] = 0
      continue
    }
    let known = 0
    for (const i of recipe.ingredients) if (i.food.nutrients[key] !== undefined) known += ingredientGrams(i)
    out[key] = known / raw
  }
  return out
}

// ---------------------------------------------------------------------------
// Tallriksmodell, kostråd, klimat och märkningar
// ---------------------------------------------------------------------------

const round = (v: number, decimals: number) => {
  const f = 10 ** decimals
  return Math.round(v * f) / f
}

/**
 * Tallriksmodellens fördelning för rätten, vägd efter ingrediensernas råvikt.
 * Delar som inte hör till tallrikens tre delar (sås, fett, dryck …) blir "övrigt" och ingår inte.
 */
export function recipePlate(recipe: Pick<Recipe, 'ingredients'>): PlateSplit | undefined {
  const raw = recipeRawWeight(recipe)
  if (!(raw > 0)) return undefined
  let veg = 0
  let carb = 0
  let protein = 0
  for (const i of recipe.ingredients) {
    const g = ingredientGrams(i)
    if (g <= 0) continue
    const p = foodPlate(i.food)
    veg += g * p.veg
    carb += g * p.carb
    protein += g * p.protein
  }
  return { veg: round(veg / raw, 3), carb: round(carb / raw, 3), protein: round(protein / raw, 3) }
}

/**
 * Gram per 100 g färdig rätt som räknas mot Livsmedelsverkets kostråd (frukt och grönt, rött kött,
 * fisk, nötter samt – sedan 2025 – baljväxter och mejeri). Nycklar med 0 utelämnas.
 */
export function recipeKostrad(recipe: Pick<Recipe, 'ingredients' | 'cookedWeightG'>): KostradContribFull {
  const final = recipeFinalWeight(recipe)
  const out: KostradContribFull = {}
  if (!(final > 0)) return out
  const sums: Partial<Record<keyof KostradContribFull, number>> = {}
  for (const i of recipe.ingredients) {
    const g = ingredientGrams(i)
    if (g <= 0) continue
    const k = foodKostrad(i.food)
    for (const key of Object.keys(k) as Array<keyof KostradContribFull>) {
      const v = k[key]
      if (v === undefined || !Number.isFinite(v) || v <= 0) continue
      sums[key] = (sums[key] ?? 0) + (g * v) / 100
    }
  }
  for (const key of Object.keys(sums) as Array<keyof KostradContribFull>) {
    const grams = sums[key] ?? 0
    if (grams > 0) out[key] = round((grams / final) * 100, 1)
  }
  return out
}

/** Klimatavtryck i kg CO2e per kg färdig rätt (summan av ingrediensernas avtryck). */
export function recipeCo2e(recipe: Pick<Recipe, 'ingredients' | 'cookedWeightG'>): number | undefined {
  const final = recipeFinalWeight(recipe)
  if (!(final > 0)) return undefined
  let kg = 0
  for (const i of recipe.ingredients) {
    const g = ingredientGrams(i)
    if (g <= 0) continue
    const c = foodCo2e(i.food)
    if (Number.isFinite(c) && c >= 0) kg += (g / 1000) * c
  }
  return round(kg / (final / 1000), 2)
}

/** Märkningar som gäller hela rätten. */
const INHERITED_TAGS: readonly FoodTag[] = ['vegan', 'vegetarisk', 'glutenfri', 'laktosfri']

/**
 * Märkningar för rätten: receptets egna plus vegan/vegetarisk/glutenfri/laktosfri när *alla*
 * ingredienser har märkningen (vegan räknas även som vegetarisk). Osäkert = ingen märkning.
 */
export function recipeTags(recipe: Pick<Recipe, 'ingredients' | 'tags'>): FoodTag[] {
  const tags = new Set<FoodTag>(recipe.tags ?? [])
  const withWeight = recipe.ingredients.filter((i) => ingredientGrams(i) > 0)
  if (withWeight.length > 0) {
    for (const tag of INHERITED_TAGS) {
      const all = withWeight.every((i) => {
        const t = i.food.tags ?? []
        return t.includes(tag) || (tag === 'vegetarisk' && t.includes('vegan'))
      })
      if (all) tags.add(tag)
    }
  }
  if (tags.has('vegan')) tags.add('vegetarisk')
  return [...tags]
}

// ---------------------------------------------------------------------------
// Recept → livsmedel
// ---------------------------------------------------------------------------

/**
 * Gör om ett recept till ett livsmedel som kan loggas i dagboken och sökas fram.
 *
 * - id `recipe:<recipe.id>`, källa `recipe`, kategori `fardigratt`
 * - näringsvärden per 100 g färdig rätt
 * - portioner: "1 portion" (färdig vikt / antal portioner) och "Hela receptet"
 * - Tallriksmodell, kostråd, klimat och märkningar vägs ihop från ingredienserna
 */
export function recipeToFood(recipe: Recipe): Food {
  const final = recipeFinalWeight(recipe)
  const servings = recipeServings(recipe)
  const portions: Portion[] =
    final > 0
      ? [
          { id: 'portion', label: '1 portion', grams: round(final / servings, 1) },
          { id: 'hela', label: 'Hela receptet', grams: round(final, 1) },
        ]
      : []
  const ingredientCount = recipe.ingredients.length
  const food: Food = {
    id: recipeFoodId(recipe.id),
    name: recipe.name.trim() || 'Namnlöst recept',
    source: 'recipe',
    category: 'fardigratt',
    nutrients: recipeNutrientsPer100(recipe),
    portions,
    kostrad: recipeKostrad(recipe),
    note: `${plural(servings, 'portion', 'portioner')} · ${plural(ingredientCount, 'ingrediens', 'ingredienser')}`,
    createdAt: recipe.createdAt,
    updatedAt: recipe.updatedAt,
  }
  const plate = recipePlate(recipe)
  if (plate) food.plate = plate
  const co2e = recipeCo2e(recipe)
  if (co2e !== undefined) food.co2e = co2e
  const tags = recipeTags(recipe)
  if (tags.length > 0) food.tags = tags
  return food
}
