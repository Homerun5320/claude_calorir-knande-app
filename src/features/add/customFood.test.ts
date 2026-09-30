import { describe, expect, it } from 'vitest'
import {
  applyLabelToDraft,
  atwaterCheck,
  clearedMessage,
  basisFactor,
  draftFromFood,
  draftNutrients,
  draftSignature,
  draftToFood,
  draftWarnings,
  emptyDraft,
  energyToKcal,
  fromPer100,
  isDerivedSodium,
  labelFillsExtras,
  MAIN_NUTRIENTS,
  newPortionDraft,
  toPer100,
  validateDraft,
  withLabelPanel,
  type CustomFoodDraft,
} from './customFood'
import { bulle, havredryckSnitt, kycklingbrost, mjolk, offBar } from './testFoods'
import { parseNutritionLabel } from '../../lib/nutritionLabel'

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
    expect(validateDraft(draft({ energy: 1500 })).energy).toMatch(/900\u00a0kcal per 100\u00a0g/)
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

  it('gör en kopia av ett samlingsvärde till ett vanligt eget livsmedel', () => {
    const food = draftToFood(draftFromFood(havredryckSnitt), { id: 'custom:min-havredryck', from: havredryckSnitt })
    expect(food.isAverage).toBeUndefined()
    expect(food.note).toBeUndefined()
    expect(food.nutrients.kcal).toBeCloseTo(45)
    // Omräkningen från rå vikt följer inte med (egna värden kan gälla rå eller tillagad vara).
    expect(draftToFood(draftFromFood(kycklingbrost), { id: 'custom:k', from: kycklingbrost }).rawWeight).toBeUndefined()
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

describe('Fyll i från förpackningen', () => {
  const LABEL = `Näringsvärde   per 100 g   per portion (30 g)   %RI*
Energi   1550 kJ / 370 kcal   465 kJ / 111 kcal   6 %
Fett   12 g   3,6 g   5 %
varav mättat fett   3,5 g   1,1 g   5 %
Kolhydrat   55 g   17 g   6 %
varav sockerarter   20 g   6,0 g   7 %
Fiber   6,0 g   1,8 g
Protein   8,0 g   2,4 g   5 %
Salt   0,50 g   0,15 g   3 %`

  it('öppnar panelen via en URL-parameter', () => {
    expect(withLabelPanel('/nytt-livsmedel')).toBe('/nytt-livsmedel?etikett=1')
    expect(withLabelPanel('/nytt-livsmedel?streckkod=7310865000637')).toBe('/nytt-livsmedel?streckkod=7310865000637&etikett=1')
  })

  it('fyller i värdena per 100 g, energin i vald enhet och portionen som mått', () => {
    const start = { ...emptyDraft({ name: 'Müslibar', barcode: '7310865000637' }), note: 'Från Coop' }
    const { draft: d, cleared } = applyLabelToDraft(start, parseNutritionLabel(LABEL))
    expect(cleared).toEqual([])
    expect(d).toMatchObject({ name: 'Müslibar', barcode: '7310865000637', note: 'Från Coop', basis: 'per100', energyUnit: 'kcal', energy: 370 })
    expect(d.values).toEqual({ fat: 12, satFat: 3.5, carbs: 55, sugars: 20, fiber: 6, protein: 8, salt: 0.5 })
    expect(d.portions.map((p) => [p.label, p.grams])).toEqual([['1 portion', 30]])
    expect(Object.keys(validateDraft(d))).toHaveLength(0)
    expect(draftWarnings(d)).toEqual([])
    const food = draftToFood(d, { id: 'custom:x', now: 1 })
    expect(food.nutrients).toMatchObject({ kcal: 370, protein: 8, salt: 0.5 })
    expect(food.nutrients.sodium).toBeCloseTo(200)
  })

  it('använder kJ när användaren föredrar kJ och etiketten har kJ', () => {
    const { draft: d } = applyLabelToDraft(emptyDraft({ energyUnit: 'kJ' }), parseNutritionLabel(LABEL))
    expect(d).toMatchObject({ energyUnit: 'kJ', energy: 1550 })
    // Bara kJ på etiketten: fylls i som kJ även när kcal är valt.
    const { draft: onlyKj } = applyLabelToDraft(emptyDraft(), parseNutritionLabel('Per 100 g\nEnergi 1550 kJ\nFett 12 g'))
    expect(onlyKj).toMatchObject({ energyUnit: 'kJ', energy: 1550 })
  })

  it('lägger inte till portionen två gånger och behåller egna värden som etiketten inte nämner', () => {
    const start = draft({ values: { vitD: 1.5, protein: 3 }, portions: [newPortionDraft('1 bar', 30)] })
    const { draft: d } = applyLabelToDraft(start, parseNutritionLabel(LABEL))
    expect(d.portions).toHaveLength(1)
    expect(d.values.vitD).toBe(1.5)
    expect(d.values.protein).toBe(8)
  })

  it('salt och natrium: anger etiketten bara det ena tas det andra bort (åt båda hållen)', () => {
    const { draft: d } = applyLabelToDraft(draft({ values: { sodium: 900 } }), parseNutritionLabel('Per 100 g: Energi 400 kJ/95 kcal, Salt 1 g'))
    expect(d.values.sodium).toBeUndefined()
    expect(d.values.salt).toBe(1)
    const { draft: natrium } = applyLabelToDraft(draft({ values: { salt: 2 } }), parseNutritionLabel('Per 100 g: Energi 400 kJ/95 kcal, Natrium 0,4 g'))
    expect(natrium.values).toEqual({ sodium: 400 })
    // Saltet räknas fram ur natriumet när livsmedlet sparas.
    expect(draftToFood(natrium, { id: 'custom:n' }).nutrients.salt).toBeCloseTo(1)
  })

  it('per portion med vikt: fylls i som på förpackningen ("Per portion", 40 g) och räknas om när man sparar', () => {
    const label = parseNutritionLabel('Per portion (40 g): Energi 836 kJ/200 kcal, Fett 8 g, Kolhydrat 18 g, Protein 16 g')
    const { draft: d } = applyLabelToDraft(emptyDraft({ name: 'Bar' }), label)
    expect(d).toMatchObject({ basis: 'portion', basisGrams: 40, basisLabel: '1 portion', energy: 200 })
    expect(d.values).toMatchObject({ fat: 8, carbs: 18, protein: 16 })
    const food = draftToFood(d, { id: 'custom:b' })
    expect(food.nutrients).toMatchObject({ kcal: 500, fat: 20, carbs: 45, protein: 40 })
    expect(food.portions).toEqual([{ id: 'portion', label: '1 portion', grams: 40 }])
  })

  it('räknar om formulärets övriga värden när basen byts (kopia per 100 g + etikett per portion)', () => {
    // En kopia av en Open Food Facts-produkt (per 100 g) med fler värden än etiketten.
    const start = draftFromFood({ ...offBar, nutrients: { ...offBar.nutrients, fiber: 6, salt: 0.5, sugars: 20 } })
    const { draft: d, cleared } = applyLabelToDraft(start, parseNutritionLabel('Per bar (40 g): Energi 200 kcal, Fett 8 g, Kolhydrat 18 g, Protein 16 g'))
    expect(cleared).toEqual([])
    expect(d).toMatchObject({ basis: 'portion', basisGrams: 40, basisLabel: '1 bar', energy: 200 })
    // 6 g fibrer per 100 g är 2,4 g per bar – inte 6.
    expect(d.values).toMatchObject({ fat: 8, carbs: 18, protein: 16, fiber: 2.4, salt: 0.2, sugars: 8 })
    const food = draftToFood(d, { id: 'custom:c' })
    expect(food.nutrients).toMatchObject({ kcal: 500, fiber: 6, salt: 0.5, sugars: 20 })
  })

  it('tömmer värden som inte går att räkna om när portionens vikt saknas – och säger det', () => {
    const start = draftFromFood({ ...offBar, nutrients: { ...offBar.nutrients, fiber: 6, salt: 0.5, sugars: 20 } })
    const { draft: d, cleared } = applyLabelToDraft(start, parseNutritionLabel('Per bar: Energi 200 kcal, Fett 8 g, Kolhydrat 18 g, Protein 16 g'))
    expect(d).toMatchObject({ basis: 'portion', basisGrams: undefined, energy: 200 })
    expect(d.values).toEqual({ fat: 8, carbs: 18, protein: 16 })
    expect(cleared).toEqual(['sugars', 'fiber', 'salt'])
    expect(clearedMessage(cleared, 'per100')).toBe(
      'Sockerarter, fibrer och salt var ifyllda per 100\u00a0g och gick inte att räkna om till per portion utan portionens vikt – fälten har tömts.',
    )
    expect(clearedMessage([], 'per100')).toBeUndefined()
  })

  it('från per portion till per 100 g: värden och energi räknas om och portionen blir ett mått', () => {
    const start = draft({ basis: 'portion', basisGrams: 30, basisLabel: '1 skiva', energy: 111, values: { fiber: 1.8, vitD: 0.3 } })
    const { draft: d, cleared } = applyLabelToDraft(start, parseNutritionLabel('Per 100 g: Fett 12 g, Kolhydrat 55 g, Protein 8 g'))
    expect(cleared).toEqual([])
    expect(d).toMatchObject({ basis: 'per100', basisGrams: undefined, energy: 370 })
    expect(d.values).toMatchObject({ fat: 12, fiber: 6, vitD: 1 })
    expect(d.portions.map((p) => [p.label, p.grams])).toEqual([['1 skiva', 30]])
    expect(fromPer100(6, 'portion', 30)).toBeCloseTo(1.8)
    expect(fromPer100(6, 'portion', undefined)).toBeUndefined()
  })

  it('per portion utan vikt: formuläret ställs på "Per portion" och frågar efter vikten', () => {
    const { draft: d } = applyLabelToDraft(draft(), parseNutritionLabel('Per portion: Energi 200 kcal, Fett 8 g, Protein 16 g'))
    expect(d).toMatchObject({ basis: 'portion', basisGrams: undefined, basisLabel: '1 portion', energy: 200 })
    expect(d.values).toMatchObject({ fat: 8, protein: 16 })
    expect(validateDraft(d).basisGrams).toBeDefined()
    const saved = draftToFood({ ...d, basisGrams: 50 }, { id: 'custom:p' })
    expect(saved.nutrients).toMatchObject({ kcal: 400, fat: 16, protein: 32 })
    expect(saved.portions).toEqual([{ id: 'portion', label: '1 portion', grams: 50 }])
  })

  it('markerar värden per 100 ml som flytande och öppnar övriga näringsämnen vid vitaminer', () => {
    const label = parseNutritionLabel('Näringsvärde per 100 ml: Energi 197 kJ/47 kcal, Fett 1,5 g, Kolhydrat 6,7 g, Protein 1,0 g, Vitamin D 1,1 µg')
    const { draft: d } = applyLabelToDraft(emptyDraft(), label)
    expect(d.liquid).toBe(true)
    expect(d.values.vitD).toBe(1.1)
    expect(labelFillsExtras(label)).toBe(true)
    expect(labelFillsExtras(parseNutritionLabel(LABEL))).toBe(false)
  })

  it('ändrar ingenting när inget hittades', () => {
    const start = draft({ values: { protein: 3 } })
    expect(applyLabelToDraft(start, parseNutritionLabel('Inget här'))).toEqual({ draft: start, cleared: [] })
    expect(applyLabelToDraft(start, parseNutritionLabel('Inget här')).draft).toBe(start)
  })
})
