import { describe, expect, it } from 'vitest'
import {
  atwaterCheck,
  basisFactor,
  draftFromFood,
  draftNutrients,
  draftSignature,
  draftToFood,
  draftWarnings,
  emptyDraft,
  energyToKcal,
  isDerivedSodium,
  MAIN_NUTRIENTS,
  newPortionDraft,
  toPer100,
  validateDraft,
  type CustomFoodDraft,
} from './customFood'
import { bulle, mjolk, offBar } from './testFoods'

function draft(patch: Partial<CustomFoodDraft> = {}): CustomFoodDraft {
  return { ...emptyDraft(), name: 'Proteinbar', energy: 200, ...patch }
}

describe('per portion → per 100 g', () => {
  it('räknar om ett värde per portion till per 100 g', () => {
    expect(toPer100(20, 'portion', 50)).toBe(40)
    expect(toPer100(5, 'portion', 30)).toBeCloseTo(16.667, 3)
    expect(toPer100(12, 'per100')).toBe(12)
  })

  it('låter okända värden förbli okända', () => {
    expect(toPer100(undefined, 'portion', 50)).toBeUndefined()
    expect(toPer100(10, 'portion', undefined)).toBeUndefined()
    expect(basisFactor('portion', 0)).toBeNaN()
  })

  it('räknar om hela formuläret per portion, inklusive kJ', () => {
    const n = draftNutrients(draft({ basis: 'portion', basisGrams: 55, energyUnit: 'kJ', energy: 920, values: { protein: 16.5, fat: 6.6 } }))
    expect(n.kcal).toBeCloseTo(((920 / 4.184) * 100) / 55, 0)
    expect(n.protein).toBeCloseTo(30, 5)
    expect(n.fat).toBeCloseTo(12, 5)
    expect(n.carbs).toBeUndefined()
  })

  it('kompletterar natrium från salt', () => {
    const n = draftNutrients(draft({ values: { salt: 1 } }))
    expect(n.sodium).toBeCloseTo(400)
  })

  it('räknar om natrium när saltet ändras på ett sparat livsmedel', () => {
    const saved = draftToFood(draft({ values: { salt: 1 } }), { id: 'custom:x', now: 1 })
    expect(saved.nutrients.sodium).toBeCloseTo(400)
    const edit = draftFromFood(saved)
    // Det härledda natriumvärdet fylls inte i formuläret …
    expect(edit.values.sodium).toBeUndefined()
    expect(edit.values.salt).toBe(1)
    // … så att det följer med när saltet ändras.
    const changed = draftNutrients({ ...edit, values: { ...edit.values, salt: 2 } })
    expect(changed.salt).toBe(2)
    expect(changed.sodium).toBeCloseTo(800)
  })

  it('behåller ett natriumvärde som inte är härlett från saltet', () => {
    expect(isDerivedSodium(1, 400)).toBe(true)
    expect(isDerivedSodium(1.25, 500.2)).toBe(true)
    expect(isDerivedSodium(1, 300)).toBe(false)
    expect(isDerivedSodium(undefined, 300)).toBe(false)
    const edit = draftFromFood({ ...offBar, nutrients: { ...offBar.nutrients, salt: 1, sodium: 300 } })
    expect(edit.values.sodium).toBe(300)
  })

  it('följer näringsdeklarationens ordning utan tillsatt socker', () => {
    expect(MAIN_NUTRIENTS).toEqual(['fat', 'satFat', 'carbs', 'sugars', 'fiber', 'protein', 'salt'])
  })

  it('räknar kJ till kcal', () => {
    expect(energyToKcal(418.4, 'kJ')).toBeCloseTo(100)
    expect(energyToKcal(100, 'kcal')).toBe(100)
  })
})

describe('Atwater-kontroll', () => {
  it('godkänner energi som stämmer med makronäringsämnena', () => {
    const r = atwaterCheck({ kcal: 345, protein: 6.8, carbs: 48, fat: 13.5, fiber: 2.2 })
    expect(r?.mismatch).toBe(false)
  })

  it('varnar när energin inte stämmer (t.ex. kJ inskrivet som kcal)', () => {
    const r = atwaterCheck({ kcal: 1443, protein: 6.8, carbs: 48, fat: 13.5 })
    expect(r?.mismatch).toBe(true)
    expect(r?.expected).toBeCloseTo(6.8 * 4 + 48 * 4 + 13.5 * 9)
  })

  it('kontrollerar bara när makronäringsämnena är kända', () => {
    expect(atwaterCheck({ kcal: 200, protein: 10 })).toBeNull()
  })

  it('visas som icke-blockerande varning i formuläret', () => {
    const d = draft({ energy: 900, values: { protein: 10, carbs: 20, fat: 5 } })
    expect(Object.keys(validateDraft(d))).toHaveLength(0)
    expect(draftWarnings(d)[0]).toMatch(/Energin stämmer inte med makronäringsämnena/)
  })
})

describe('validering', () => {
  it('kräver namn och energi', () => {
    const e = validateDraft(emptyDraft())
    expect(e.name).toBeDefined()
    expect(e.energy).toBeDefined()
  })

  it('kräver portionsvikt när värdena anges per portion', () => {
    expect(validateDraft(draft({ basis: 'portion' })).basisGrams).toBeDefined()
    expect(validateDraft(draft({ basis: 'portion', basisGrams: 40 })).basisGrams).toBeUndefined()
  })

  it('stoppar orimlig energi per 100 g', () => {
    expect(validateDraft(draft({ energy: 1500 })).energy).toMatch(/900 kcal/)
    expect(validateDraft(draft({ energy: 1500, energyUnit: 'kJ' })).energy).toBeUndefined()
  })

  it('kontrollerar streckkodens kontrollsiffra', () => {
    expect(validateDraft(draft({ barcode: '7310865000632' })).barcode).toBeDefined()
    expect(validateDraft(draft({ barcode: '7310865000637' })).barcode).toBeUndefined()
  })

  it('kräver både namn och vikt för portioner', () => {
    expect(validateDraft(draft({ portions: [newPortionDraft('1 bar')] })).portions).toBeDefined()
    expect(validateDraft(draft({ portions: [newPortionDraft('1 bar', 55)] })).portions).toBeUndefined()
    expect(validateDraft(draft({ portions: [newPortionDraft('')] })).portions).toBeUndefined()
  })

  it('varnar när delmängder är större än helheten', () => {
    const w = draftWarnings(draft({ values: { carbs: 10, sugars: 20, fat: 2, satFat: 5 } }))
    expect(w.some((x) => x.includes('Sockerarterna'))).toBe(true)
    expect(w.some((x) => x.includes('Mättat fett'))).toBe(true)
  })
})

describe('draftToFood', () => {
  it('bygger ett eget livsmedel per 100 g med portion från inmatningen', () => {
    const food = draftToFood(
      draft({
        brand: '  Märket ',
        category: 'kosttillskott',
        basis: 'portion',
        basisGrams: 55,
        basisLabel: '1 bar',
        energy: 209,
        values: { protein: 16.5 },
        barcode: '7310 8650 0063 7',
        tags: ['glutenfri'],
      }),
      { id: 'custom:abc', now: 1000 },
    )
    expect(food).toMatchObject({
      id: 'custom:abc',
      name: 'Proteinbar',
      brand: 'Märket',
      source: 'custom',
      category: 'kosttillskott',
      barcode: '7310865000637',
      tags: ['glutenfri'],
      createdAt: 1000,
      updatedAt: 1000,
    })
    expect(food.nutrients.kcal).toBeCloseTo(380, 0)
    expect(food.nutrients.protein).toBeCloseTo(30)
    expect(food.portions).toEqual([{ id: 'portion', label: '1 bar', grams: 55 }])
  })

  it('lägger inte till portionen två gånger och ger unika id:n', () => {
    const food = draftToFood(
      draft({
        basis: 'portion',
        basisGrams: 55,
        portions: [newPortionDraft('1 bar', 55), newPortionDraft('1 bar', 110), newPortionDraft('', 10)],
      }),
      { id: 'custom:x' },
    )
    expect(food.portions.map((p) => p.id)).toEqual(['1-bar', '1-bar-2'])
  })

  it('räknar vikt per dl till densitet', () => {
    const food = draftToFood(draft({ gramsPerDl: 35 }), { id: 'custom:x' })
    expect(food.density).toBeCloseTo(0.35)
    expect(food.liquid).toBeUndefined()
  })

  it('behåller bild och produktinfo vid kopiering men blir "Eget"', () => {
    const from = { ...offBar, imageUrl: 'https://bild', extra: { nutriscore: 'c' } }
    const food = draftToFood(draftFromFood(from), { id: 'custom:kopia', from })
    expect(food.source).toBe('custom')
    expect(food.imageUrl).toBe('https://bild')
    expect(food.extra?.nutriscore).toBe('c')
    expect(food.nutrients.kcal).toBeCloseTo(380)
    expect(food.portions[0]).toMatchObject({ id: 'serving', grams: 55 })
  })

  it('tål en rundtur via formuläret utan att ändra värdena', () => {
    const food = draftToFood(draftFromFood(mjolk), { id: mjolk.id })
    expect(food.nutrients.kcal).toBeCloseTo(46)
    expect(food.nutrients.protein).toBeCloseTo(3.5)
    expect(food.density).toBeCloseTo(1.03)
    expect(food.liquid).toBe(true)
    expect(food.portions).toEqual(mjolk.portions)
  })

  it('visar energin i kJ om användaren föredrar det', () => {
    expect(draftFromFood(bulle, 'kJ').energy).toBe(Math.round(345 * 4.184))
  })
})

describe('draftSignature', () => {
  it('ignorerar portionernas interna nycklar', () => {
    const a = draftFromFood(bulle)
    const b = draftFromFood(bulle)
    expect(a.portions[0].key).not.toBe(b.portions[0].key)
    expect(draftSignature(a)).toBe(draftSignature(b))
    expect(draftSignature({ ...a, name: 'Annat' })).not.toBe(draftSignature(b))
  })
})
