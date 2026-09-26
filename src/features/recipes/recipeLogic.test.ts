import { describe, expect, it } from 'vitest'
import type { Food, Recipe } from '../../types'
import { EXTRAS_PREFIX } from '../../data/recipes'
import {
  cookedWeightText,
  cookedWeightWarning,
  copyRecipe,
  draftFromRecipe,
  emptyDraft,
  filterRecipes,
  formatFractionAmount,
  formatIngredientAmount,
  hasErrors,
  isDraftDirty,
  makeIngredient,
  parseInstructions,
  plateNote,
  portionAmountText,
  recipeFavoriteId,
  recipeFromDraft,
  roundAmount,
  scaleFactor,
  scaleIngredient,
  servingClimate,
  servingsText,
  showPlateFor,
  sortOwnRecipes,
  sortedTags,
  validateDraft,
  weightInfo,
} from './recipeLogic'

const mjol: Food = {
  id: 'lagom:vetemjol',
  name: 'Vetemjöl',
  source: 'lagom',
  category: 'spannmal',
  nutrients: { kcal: 343, protein: 10, carbs: 70, fat: 1.5 },
  portions: [],
  density: 0.6,
}

const agg: Food = {
  id: 'lagom:agg-ratt',
  name: 'Ägg, rått',
  source: 'lagom',
  category: 'agg',
  nutrients: { kcal: 138, protein: 12.5, fat: 9.7, carbs: 0.3 },
  portions: [{ id: 'st', label: '1 ägg (M, utan skal)', grams: 50 }],
  tags: ['vegetarisk'],
}

const lok: Food = {
  id: 'lagom:lok-gul',
  name: 'Lök, gul',
  source: 'lagom',
  category: 'gronsaker',
  nutrients: { kcal: 38, protein: 1, carbs: 7, fat: 0.1 },
  portions: [
    { id: 'st', label: '1 st medelstor', grams: 100 },
    { id: 'klyfta', label: '1 klyfta', grams: 5 },
  ],
  density: 0.55,
  tags: ['vegan'],
}

function recipe(partial: Partial<Recipe> = {}): Recipe {
  return {
    id: 'r_test',
    name: 'Pannkakor',
    servings: 4,
    ingredients: [
      { id: 'i1', food: mjol, amount: 2.5, unit: 'dl', grams: 150 },
      { id: 'i2', food: agg, amount: 3, unit: 'portion:st', grams: 150 },
    ],
    createdAt: 1,
    updatedAt: 1,
    ...partial,
  }
}

describe('skalning', () => {
  it('räknar skalfaktor från receptets portioner', () => {
    expect(scaleFactor({ servings: 4 }, 6)).toBe(1.5)
    expect(scaleFactor({ servings: 4 }, 2)).toBe(0.5)
    expect(scaleFactor({ servings: 0 }, 3)).toBe(3)
    expect(scaleFactor({ servings: 4 }, 0)).toBe(1)
  })

  it('skalar mängd och gram', () => {
    const ing = recipe().ingredients[1]
    expect(scaleIngredient(ing, 1)).toBe(ing)
    expect(scaleIngredient(ing, 1.5)).toMatchObject({ amount: 4.5, grams: 225 })
  })

  it('avrundar till köksvänliga mängder', () => {
    expect(roundAmount(333.3, 'g')).toBe(335)
    expect(roundAmount(37.4, 'g')).toBe(37)
    expect(roundAmount(2.34, 'g')).toBe(2.3)
    expect(roundAmount(1.3, 'dl')).toBe(1.25)
    expect(roundAmount(0.4, 'portion:st')).toBe(0.5)
    expect(roundAmount(0.1, 'tsk')).toBe(0.1)
    expect(roundAmount(22.4, 'portion:st')).toBe(22)
    expect(roundAmount(1.234, 'kg')).toBe(1.23)
    expect(roundAmount(-1, 'g')).toBe(0)
  })
})

describe('mängder i text', () => {
  it('visar bråk med glyfer', () => {
    expect(formatFractionAmount(0.5)).toBe('½')
    expect(formatFractionAmount(1.5)).toBe('1½')
    expect(formatFractionAmount(2.25)).toBe('2¼')
    expect(formatFractionAmount(0.75)).toBe('¾')
    expect(formatFractionAmount(3)).toBe('3')
    expect(formatFractionAmount(0.4)).toBe('0,4')
  })

  it('böjer portionsord', () => {
    expect(portionAmountText('1 ägg (M, utan skal)', 3)).toBe('3 ägg')
    expect(portionAmountText('1 st medelstor', 0.5)).toBe('½ st')
    expect(portionAmountText('1 klyfta', 2)).toBe('2 klyftor')
    expect(portionAmountText('1 portion till mat (ca 30 g)', 4)).toBe('4 portioner')
    expect(portionAmountText('1 förpackning (400 g)', 1)).toBe('1 förpackning')
    expect(portionAmountText('1 hel gurka', 0.5)).toBe('½ hel gurka')
    expect(portionAmountText('1 hel gurka', 2)).toBe('2 × hel gurka')
    expect(portionAmountText('1 burgare', 2)).toBe('2 × burgare')
    expect(portionAmountText('på en toast (15 g)', 2)).toBe('2 × på en toast (15 g)')
  })

  it('formaterar ingrediensens mängd med vikt', () => {
    expect(formatIngredientAmount(mjol, 2.5, 'dl')).toEqual({ text: '2½ dl', grams: '150 g' })
    expect(formatIngredientAmount(agg, 4.5, 'portion:st')).toEqual({ text: '4½ ägg', grams: '225 g' })
    expect(formatIngredientAmount(mjol, 500, 'g')).toEqual({ text: '500 g' })
    expect(formatIngredientAmount(mjol, 1250, 'g').text).toBe('1,25 kg')
    expect(formatIngredientAmount(lok, 2, 'portion:klyfta')).toEqual({ text: '2 klyftor', grams: '10 g' })
  })

  it('skriver portioner på svenska', () => {
    expect(servingsText(1)).toBe('1 portion')
    expect(servingsText(4)).toBe('4 portioner')
    expect(servingsText(40, ['bulle', 'bullar'])).toBe('40 bullar')
  })
})

describe('instruktioner', () => {
  it('delar upp i steg och tar bort numrering', () => {
    const text = '1. Hacka löken.\n\n2) Fräs den.\n- Servera.\n   '
    expect(parseInstructions(text)).toEqual({ steps: ['Hacka löken.', 'Fräs den.', 'Servera.'] })
  })

  it('plockar ut "Du behöver även"', () => {
    const text = `${EXTRAS_PREFIX} 50 g jäst, pärlsocker.\nBaka bullarna.`
    expect(parseInstructions(text)).toEqual({ extras: '50 g jäst, pärlsocker', steps: ['Baka bullarna.'] })
  })

  it('klarar tom text', () => {
    expect(parseInstructions(undefined)).toEqual({ steps: [] })
    expect(parseInstructions('')).toEqual({ steps: [] })
  })
})

describe('utkast', () => {
  it('kräver namn och minst en ingrediens', () => {
    const errors = validateDraft(emptyDraft())
    expect(errors.name).toBeDefined()
    expect(errors.ingredients).toBeDefined()
    expect(hasErrors(errors)).toBe(true)
    const ok = validateDraft({ ...emptyDraft(), name: 'Gröt', ingredients: recipe().ingredients })
    expect(hasErrors(ok)).toBe(false)
  })

  it('underkänner orimliga värden', () => {
    const base = { ...emptyDraft(), name: 'X', ingredients: recipe().ingredients }
    expect(validateDraft({ ...base, servings: 0 }).servings).toBeDefined()
    expect(validateDraft({ ...base, cookedWeightG: 0 }).cookedWeightG).toBeDefined()
    expect(validateDraft({ ...base, cookedWeightG: 800 }).cookedWeightG).toBeUndefined()
  })

  it('bygger ett recept med r_-id och behåller id vid redigering', () => {
    const draft = { ...emptyDraft(), name: '  Gröt  ', ingredients: recipe().ingredients, cookedWeightG: 812.4, prepMinutes: 0, instructions: '  Koka.  ', tags: ['klassiker', 'vegan'] as const }
    const fresh = recipeFromDraft({ ...draft, tags: [...draft.tags] }, undefined, 1000)
    expect(fresh.id).toMatch(/^r_/)
    expect(fresh.name).toBe('Gröt')
    expect(fresh.cookedWeightG).toBe(812)
    expect(fresh.prepMinutes).toBeUndefined()
    expect(fresh.instructions).toBe('Koka.')
    expect(fresh.tags).toEqual(['vegan', 'klassiker'])
    expect(fresh.createdAt).toBe(1000)
    const edited = recipeFromDraft(draftFromRecipe(fresh), { id: fresh.id, createdAt: fresh.createdAt }, 2000)
    expect(edited.id).toBe(fresh.id)
    expect(edited.createdAt).toBe(1000)
    expect(edited.updatedAt).toBe(2000)
  })

  it('märker ändringar', () => {
    const original = draftFromRecipe(recipe())
    expect(isDraftDirty(original, original)).toBe(false)
    expect(isDraftDirty({ ...original, name: 'Nytt' }, original)).toBe(true)
    expect(isDraftDirty({ ...original, ingredients: [...original.ingredients] }, original)).toBe(true)
  })

  it('skapar ingredienser med uträknad vikt', () => {
    const ing = makeIngredient(lok, 1, 'portion:st')
    expect(ing.grams).toBe(100)
    expect(ing.id).toMatch(/^i_/)
    expect(makeIngredient(mjol, 1, 'dl', 61.23).grams).toBe(61.2)
  })

  it('kopierar ett inbyggt recept till ett eget', () => {
    const builtin = recipe({ id: 'klassiker-pannkakor', builtin: true })
    const copy = copyRecipe(builtin, 5000)
    expect(copy.id).toMatch(/^r_/)
    expect(copy.builtin).toBeUndefined()
    expect(copy.name).toBe(builtin.name)
    expect(copy.createdAt).toBe(5000)
    expect(copy.ingredients).toHaveLength(2)
    expect(copy.ingredients[0].id).not.toBe(builtin.ingredients[0].id)
    expect(copy.ingredients[0].food).toBe(builtin.ingredients[0].food)
  })
})

describe('sökning och sortering', () => {
  const a = recipe({ id: 'r_a', name: 'Pannkakor', updatedAt: 10 })
  const b = recipe({ id: 'r_b', name: 'Ärtsoppa', updatedAt: 30, ingredients: [{ id: 'x', food: lok, amount: 1, unit: 'portion:st', grams: 100 }] })
  const c = recipe({ id: 'r_c', name: 'Lökpaj', updatedAt: 20 })

  it('söker i namn och ingredienser utan hänsyn till å/ä/ö', () => {
    expect(filterRecipes([a, b, c], 'artsoppa').map((r) => r.id)).toEqual(['r_b'])
    expect(filterRecipes([a, b, c], 'ÄGG').map((r) => r.id)).toEqual(['r_a', 'r_c'])
    // Träff i namnet går före träff bland ingredienserna.
    expect(filterRecipes([a, b, c], 'lök').map((r) => r.id)).toEqual(['r_c', 'r_b'])
    expect(filterRecipes([a, b], '')).toHaveLength(2)
  })

  it('sorterar favoriter först och sedan senast ändrade', () => {
    expect(sortOwnRecipes([a, b, c], new Set()).map((r) => r.id)).toEqual(['r_b', 'r_c', 'r_a'])
    expect(sortOwnRecipes([a, b, c], new Set([recipeFavoriteId('r_a')])).map((r) => r.id)).toEqual(['r_a', 'r_b', 'r_c'])
  })

  it('favorit-id är receptets livsmedels-id', () => {
    expect(recipeFavoriteId('r_a')).toBe('recipe:r_a')
    expect(recipeFavoriteId('recipe:r_a')).toBe('recipe:r_a')
  })

  it('sorterar märkningar', () => {
    expect(sortedTags(['svensk', 'klassiker', 'vegan', 'vegan'])).toEqual(['vegan', 'klassiker', 'svensk'])
  })
})

describe('tillagad vikt, klimat och tallrik', () => {
  it('räknar vikt per portion och förändring', () => {
    const info = weightInfo(recipe({ cookedWeightG: 240 }))
    expect(info.raw).toBe(300)
    expect(info.final).toBe(240)
    expect(info.perServing).toBe(60)
    expect(info.changePct).toBeCloseTo(-20)
    expect(cookedWeightText(info)).toContain('20 %')
    expect(cookedWeightText(weightInfo(recipe()))).toContain('råvikten')
  })

  it('varnar vänligt för orimliga vikter', () => {
    expect(cookedWeightWarning(1000, 200)).toBeDefined()
    expect(cookedWeightWarning(1000, 4000)).toBeDefined()
    expect(cookedWeightWarning(1000, 850)).toBeUndefined()
    expect(cookedWeightWarning(1000, undefined)).toBeUndefined()
  })

  it('ger klimat per portion med nivå', () => {
    const low = servingClimate(recipe())
    expect(low).toBeDefined()
    expect(low?.kg).toBeGreaterThan(0)
    expect(low?.level).toBe('lag')
    const beef: Food = { ...mjol, id: 'x:biff', name: 'Nötkött', category: 'rott_kott', co2e: 30 }
    const high = servingClimate(recipe({ servings: 1, ingredients: [{ id: 'b', food: beef, amount: 200, unit: 'g', grams: 200 }] }))
    expect(high?.level).toBe('hog')
    expect(high?.carText).toMatch(/km$/)
  })

  it('visar Tallriksmodellen bara för måltider', () => {
    const meal = { veg: 0.3, carb: 0.3, protein: 0.2 }
    expect(showPlateFor({ id: 'r_x' }, { kcal: 500, sugars: 5 }, meal)).toBe(true)
    // Mycket socker = efterrätt eller fika.
    expect(showPlateFor({ id: 'r_x' }, { kcal: 300, sugars: 25 }, meal)).toBe(false)
    // För lite av rätten hör till tallrikens delar (sås, dryck, fett …).
    expect(showPlateFor({ id: 'r_x' }, { kcal: 300 }, { veg: 0.1, carb: 0.1, protein: 0.05 })).toBe(false)
    expect(showPlateFor({ id: 'r_x' }, { kcal: 300 }, undefined)).toBe(false)
    // Bakverk bland klassikerna.
    expect(showPlateFor({ id: 'klassiker-lussekatter', builtin: true }, { kcal: 180 }, meal)).toBe(false)
    expect(showPlateFor({ id: 'klassiker-kalops', builtin: true }, { kcal: 450 }, meal)).toBe(true)
  })

  it('ger neutrala tallrikskommentarer', () => {
    expect(plateNote(undefined)).toMatch(/njut/)
    expect(plateNote({ veg: 0.5, carb: 0.3, protein: 0.2 })).toMatch(/grönt/)
    expect(plateNote({ veg: 0, carb: 0.2, protein: 0.8 })).toMatch(/sallad/)
    for (const text of [plateNote({ veg: 0.2, carb: 0.7, protein: 0.1 }), plateNote({ veg: 0.25, carb: 0.4, protein: 0.35 })]) {
      expect(text).not.toMatch(/för mycket|dålig|fel/i)
    }
  })
})
