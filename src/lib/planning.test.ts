/**
 * Veckoplaneringens logik: veckor, energi mot dagsmålet, kopiering av vecka, butiksavdelningar,
 * inköpslistans summering och mått, delningstext och tolerant inläsning.
 */
import { describe, expect, it } from 'vitest'
import type { Food, MealConfig, Recipe } from '../types'
import {
  DEPARTMENTS,
  buildShoppingList,
  cleanExtraText,
  cookServingsStep,
  departmentFor,
  formatCount,
  groupByMeal,
  isTapWater,
  planBalance,
  planBalanceText,
  planItemAmountText,
  planItemName,
  planItemNutrients,
  planTotals,
  portionsText,
  recipeKey,
  recipePlanNutrients,
  relativeWeekLabel,
  remainingCount,
  sanitizePlanData,
  sanitizePlanFood,
  shiftWeekItems,
  shoppingAmountText,
  shoppingKey,
  shoppingListText,
  weekDates,
  weekItemCount,
  weekItems,
  weekRangeText,
  weekStartOf,
  weekTitle,
  type PlanFoodItem,
  type PlanItem,
  type PlanMealItem,
  type PlanRecipeItem,
  type RecipeResolver,
} from './planning'

// ---------------------------------------------------------------------------
// Testdata
// ---------------------------------------------------------------------------

const nötfärs: Food = {
  id: 'lagom:notfars-stekt',
  name: 'Nötfärs',
  source: 'lagom',
  category: 'rott_kott',
  nutrients: { kcal: 250, protein: 26, fat: 16 },
  portions: [{ id: 'portion', label: '1 portion', grams: 125 }],
  rawWeight: { factor: 0.75, kind: 'ra' },
}

const lök: Food = {
  id: 'lagom:lok',
  name: 'Lök',
  source: 'lagom',
  category: 'gronsaker',
  nutrients: { kcal: 40, protein: 1 },
  portions: [{ id: 'st', label: '1 st (medel)', grams: 100 }],
}

const mjölk: Food = {
  id: 'lagom:mjolk',
  name: 'Mjölk',
  source: 'lagom',
  category: 'mejeri',
  nutrients: { kcal: 46, protein: 3.5 },
  portions: [{ id: 'glas', label: '1 glas (2 dl)', grams: 206 }],
  density: 1.03,
  liquid: true,
}

const pasta: Food = {
  id: 'lagom:pasta-kokt',
  name: 'Pasta',
  source: 'lagom',
  category: 'pasta_ris',
  nutrients: { kcal: 150, protein: 5.5 },
  portions: [],
  rawWeight: { factor: 2.4, kind: 'okokt', density: 0.4 },
}

const vatten: Food = {
  id: 'lagom:vatten-kranvatten',
  name: 'Vatten',
  source: 'lagom',
  category: 'dryck',
  nutrients: { kcal: 0 },
  portions: [],
  density: 1,
  liquid: true,
}

const ägg: Food = {
  id: 'lagom:agg-ratt',
  name: 'Ägg',
  source: 'lagom',
  category: 'agg',
  nutrients: { kcal: 136, protein: 12.1 },
  portions: [{ id: 'st', label: '1 ägg (M, utan skal)', grams: 50 }],
}

const havregryn: Food = {
  id: 'lagom:havregryn',
  name: 'Havregryn',
  source: 'lagom',
  category: 'spannmal',
  nutrients: { kcal: 370, protein: 13 },
  portions: [],
  density: 0.35,
}

const okändEnergi: Food = {
  id: 'custom:sas',
  name: 'Okänd sås',
  source: 'custom',
  category: 'sas_krydda',
  nutrients: {},
  portions: [],
}

const köttfärssås: Recipe = {
  id: 'r_sas',
  name: 'Köttfärssås',
  emoji: '🍝',
  servings: 4,
  ingredients: [
    { id: 'i1', food: nötfärs, amount: 500, unit: 'g-ra', grams: 375 },
    { id: 'i2', food: lök, amount: 1, unit: 'portion:st', grams: 100 },
    { id: 'i3', food: vatten, amount: 3, unit: 'dl', grams: 300 },
  ],
  createdAt: 1,
  updatedAt: 1,
}

const pannkakor: Recipe = {
  id: 'klassiker-pannkakor',
  name: 'Pannkakor',
  servings: 4,
  builtin: true,
  ingredients: [
    { id: 'p1', food: ägg, amount: 3, unit: 'portion:st', grams: 150 },
    { id: 'p2', food: mjölk, amount: 6, unit: 'dl', grams: 618 },
  ],
  createdAt: 1,
  updatedAt: 1,
}

const RECIPES: Record<string, Recipe> = { [köttfärssås.id]: köttfärssås, [pannkakor.id]: pannkakor }
const resolve: RecipeResolver = (id) => RECIPES[recipeKey(id)]

const MONDAY = '2026-09-28'

function recipeItem(patch: Partial<PlanRecipeItem> = {}): PlanRecipeItem {
  return {
    id: 'p1',
    date: MONDAY,
    meal: 'middag',
    createdAt: 1,
    kind: 'recipe',
    recipeId: köttfärssås.id,
    name: köttfärssås.name,
    servings: 4,
    eat: 1,
    ...patch,
  }
}

function foodItem(food: Food, amount: number, unit: PlanFoodItem['unit'], grams: number, patch: Partial<PlanFoodItem> = {}): PlanFoodItem {
  return { id: `f-${food.id}-${amount}`, date: MONDAY, meal: 'frukost', createdAt: 1, kind: 'food', food, amount, unit, grams, ...patch }
}

function mealItem(patch: Partial<PlanMealItem> = {}): PlanMealItem {
  return {
    id: 'm1',
    date: MONDAY,
    meal: 'frukost',
    createdAt: 1,
    kind: 'meal',
    name: 'Frukostgröt',
    items: [
      { food: havregryn, amount: 1, unit: 'dl', grams: 35 },
      { food: mjölk, amount: 1, unit: 'portion:glas', grams: 206 },
    ],
    ...patch,
  }
}

const line = (list: ReturnType<typeof buildShoppingList>, name: string) => list.groups.flatMap((g) => g.lines).find((l) => l.name === name)

// ---------------------------------------------------------------------------
// Veckor
// ---------------------------------------------------------------------------

describe('veckor', () => {
  it('börjar på måndag och har sju dagar', () => {
    expect(weekStartOf('2026-10-01')).toBe(MONDAY)
    expect(weekStartOf('2026-10-04')).toBe(MONDAY) // söndag
    expect(weekStartOf(MONDAY)).toBe(MONDAY)
    expect(weekDates(MONDAY)).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
  })

  it('ger veckonummer och datumintervall på svenska', () => {
    expect(weekTitle(MONDAY)).toBe('Vecka 40')
    expect(weekRangeText(MONDAY, MONDAY)).toBe('28 sep – 4 okt')
    // Över årsskiftet står åren med.
    expect(weekRangeText('2025-12-29', MONDAY)).toBe('29 dec 2025 – 4 jan 2026')
    expect(weekTitle('2025-12-29')).toBe('Vecka 1')
    expect(weekRangeText('2027-03-01', MONDAY)).toBe('1 mars – 7 mars 2027')
  })

  it('namnger denna, nästa och förra veckan', () => {
    expect(relativeWeekLabel(MONDAY, '2026-10-01')).toBe('Denna vecka')
    expect(relativeWeekLabel('2026-10-05', '2026-10-01')).toBe('Nästa vecka')
    expect(relativeWeekLabel('2026-09-21', '2026-10-01')).toBe('Förra veckan')
    expect(relativeWeekLabel('2026-10-12', '2026-10-01')).toBeUndefined()
  })

  it('räknar och listar veckans rader', () => {
    const items = { [MONDAY]: [recipeItem()], '2026-10-04': [mealItem()], '2026-10-05': [recipeItem({ id: 'x' })] }
    expect(weekItemCount(items, MONDAY)).toBe(2)
    expect(weekItems(items, MONDAY).map((i) => i.id)).toEqual(['p1', 'm1'])
  })
})

// ---------------------------------------------------------------------------
// Mängder och energi
// ---------------------------------------------------------------------------

describe('portioner och beskrivningar', () => {
  it('skriver antal som bråk', () => {
    expect(formatCount(0.5)).toBe('½')
    expect(formatCount(1.5)).toBe('1½')
    expect(formatCount(2.25)).toBe('2¼')
    expect(formatCount(3)).toBe('3')
    expect(formatCount(0.4)).toBe('0,4')
    expect(portionsText(1)).toBe('1 portion')
    expect(portionsText(0.5)).toBe('½ portion')
    expect(portionsText(1.5)).toBe('1½ portioner')
    expect(portionsText(4)).toBe('4 portioner')
  })

  it('stegar portioner att laga i hela portioner – och i halva satser för bak med många bitar', () => {
    expect(cookServingsStep(4)).toBe(1)
    expect(cookServingsStep(10)).toBe(1)
    expect(cookServingsStep(2.5)).toBe(1)
    expect(cookServingsStep(0)).toBe(1)
    expect(cookServingsStep(12)).toBe(6)
    expect(cookServingsStep(40)).toBe(20)
    expect(cookServingsStep(120)).toBe(60)
    expect(cookServingsStep(25)).toBe(25)
  })

  it('beskriver recept, måltider och livsmedel', () => {
    expect(planItemAmountText(recipeItem())).toBe('4 portioner, du äter 1')
    expect(planItemAmountText(recipeItem({ servings: 1, eat: 1 }))).toBe('1 portion')
    expect(planItemAmountText(recipeItem({ servings: 6, eat: 1.5 }))).toBe('6 portioner, du äter 1½')
    expect(planItemAmountText(recipeItem({ servings: 0, eat: 1.5 }))).toBe('Rester, du äter 1½ portioner')
    expect(planItemAmountText(mealItem())).toBe('Havregryn, Mjölk')
    expect(planItemAmountText(foodItem(mjölk, 2, 'dl', 206))).toBe('2 dl (206 g)')
    expect(planItemAmountText(foodItem(nötfärs, 150, 'g-ra', 112.5))).toBe('150 g rå (113 g tillagat)')
    expect(planItemAmountText(foodItem(lök, 120, 'g', 120))).toBe('120 g')
  })

  it('använder receptets aktuella namn när det finns', () => {
    expect(planItemName(recipeItem({ name: 'Gammalt namn' }), resolve)).toBe('Köttfärssås')
    expect(planItemName(recipeItem({ recipeId: 'r_borta', name: 'Borttaget' }), resolve)).toBe('Borttaget')
    expect(planItemName(foodItem(lök, 1, 'portion:st', 100))).toBe('Lök')
  })
})

describe('energi och protein', () => {
  it('räknar recept efter portionerna du äter', () => {
    // Hela såsen: 375 g nötfärs (937,5 kcal) + 100 g lök (40 kcal) + vatten 0 = 977,5 kcal på 4 portioner.
    const n = planItemNutrients(recipeItem({ eat: 2 }), resolve)
    expect(n.kcal).toBeCloseTo((977.5 / 4) * 2, 5)
    expect(n.protein).toBeCloseTo(((375 * 0.26 + 1) / 4) * 2, 5)
  })

  it('faller tillbaka på det sparade värdet när receptet saknas', () => {
    const n = planItemNutrients(recipeItem({ recipeId: 'r_borta', perServing: { kcal: 500, protein: 30 }, eat: 1.5 }), resolve)
    expect(n).toEqual({ kcal: 750, protein: 45 })
    expect(planItemNutrients(recipeItem({ recipeId: 'r_borta' }), resolve)).toEqual({})
  })

  it('summerar måltider och livsmedel – okänt förblir okänt', () => {
    const meal = planItemNutrients(mealItem())
    expect(meal.kcal).toBeCloseTo(35 * 3.7 + 206 * 0.46, 5)
    expect(planItemNutrients(foodItem(okändEnergi, 100, 'g', 100))).toEqual({})
    const totals = planTotals([foodItem(okändEnergi, 100, 'g', 100)])
    expect(totals).toEqual({ kcal: undefined, protein: undefined, count: 1 })
    const day = planTotals([recipeItem(), mealItem(), foodItem(ägg, 2, 'portion:st', 100)], resolve)
    expect(day.count).toBe(3)
    expect(day.kcal).toBeCloseTo(977.5 / 4 + 35 * 3.7 + 206 * 0.46 + 136, 5)
  })

  it('sparar energi och protein per portion som reserv', () => {
    const per = recipePlanNutrients(köttfärssås)
    expect(per.kcal).toBeCloseTo(977.5 / 4, 5)
    expect(Object.keys(per).sort()).toEqual(['kcal', 'protein'])
  })
})

describe('dagsmålet', () => {
  const fmt = (kcal: number) => `${Math.round(kcal)} kcal`

  it('delar in i tom, plats, nära och över', () => {
    expect(planBalance(undefined, 2000)).toBe('tom')
    expect(planBalance(0, 2000)).toBe('tom')
    expect(planBalance(1000, 2000)).toBe('plats')
    expect(planBalance(1800, 2000)).toBe('nara')
    expect(planBalance(2200, 2000)).toBe('nara')
    expect(planBalance(2201, 2000)).toBe('over')
  })

  it('formulerar sig lugnt och aldrig dömande', () => {
    expect(planBalanceText(undefined, 2000, fmt)).toBe('Inget planerat än')
    expect(planBalanceText(1550, 2000, fmt)).toBe('Plats för ca 450 kcal till')
    expect(planBalanceText(1950, 2000, fmt)).toBe('Lagom nära dagsmålet')
    const over = planBalanceText(2600, 2000, fmt)
    expect(over).toBe('Över dagsmålet – helt okej, det jämnar ut sig över veckan')
    expect(over).not.toMatch(/för mycket|varning/i)
  })
})

describe('måltider per dag', () => {
  const meals: MealConfig[] = [
    { id: 'frukost', name: 'Frukost', enabled: true },
    { id: 'middag', name: 'Kvällsmiddag', enabled: true },
    { id: 'kvallsmat', name: 'Kvällsmat', enabled: false },
  ]

  it('följer användarens ordning och namn och visar bara måltider med rader', () => {
    const groups = groupByMeal([recipeItem(), mealItem(), foodItem(ägg, 1, 'portion:st', 50, { meal: 'kvallsmat' })], meals)
    expect(groups.map((g) => [g.meal, g.name, g.items.length])).toEqual([
      ['frukost', 'Frukost', 1],
      ['middag', 'Kvällsmiddag', 1],
      ['kvallsmat', 'Kvällsmat', 1],
    ])
  })

  it('tar med måltider som saknas i inställningarna med standardnamn', () => {
    const groups = groupByMeal([foodItem(ägg, 1, 'portion:st', 50, { meal: 'fika' })], meals)
    expect(groups).toEqual([{ meal: 'fika', name: 'Fika', items: [expect.objectContaining({ meal: 'fika' })] }])
  })
})

describe('kopiera vecka', () => {
  it('flyttar raderna till samma veckodag, med nya id:n och utan loggning', () => {
    let n = 0
    const src = {
      '2026-09-21': [recipeItem({ id: 'a', date: '2026-09-21', loggedEntryIds: ['e1'] })],
      '2026-09-27': [mealItem({ id: 'b', date: '2026-09-27' })],
      '2026-09-28': [recipeItem({ id: 'c' })],
    }
    const out = shiftWeekItems(src, '2026-09-21', MONDAY, () => `ny${n++}`, 42)
    expect(out.map((i) => [i.id, i.date, i.createdAt])).toEqual([
      ['ny0', '2026-09-28', 42],
      ['ny1', '2026-10-04', 42],
    ])
    expect(out[0].loggedEntryIds).toBeUndefined()
    // Originalet ändras inte.
    expect(src['2026-09-21'][0].loggedEntryIds).toEqual(['e1'])
  })
})

// ---------------------------------------------------------------------------
// Avdelningar
// ---------------------------------------------------------------------------

describe('butiksavdelningar', () => {
  it('härleds från kategorin', () => {
    expect(departmentFor(lök)).toBe('frukt_gront')
    expect(departmentFor({ name: 'Potatis', category: 'potatis' })).toBe('frukt_gront')
    expect(departmentFor({ name: 'Rågbröd', category: 'brod' })).toBe('brod')
    expect(departmentFor(mjölk)).toBe('mejeri')
    expect(departmentFor(ägg)).toBe('mejeri')
    expect(departmentFor({ name: 'Havredryck', category: 'vaxtdryck' })).toBe('mejeri')
    expect(departmentFor(nötfärs)).toBe('kott_fisk')
    expect(departmentFor({ name: 'Tofu', category: 'vegoprotein' })).toBe('kott_fisk')
    expect(departmentFor(pasta)).toBe('torrvaror')
    expect(departmentFor({ name: 'Vaniljglass', category: 'glass_dessert' })).toBe('frys')
    expect(departmentFor({ name: 'Läsk', category: 'lask_saft' })).toBe('ovrigt')
  })

  it('lägger frysta varor i frysen och oljor bland torrvarorna', () => {
    expect(departmentFor({ name: 'Frysta blåbär', category: 'bar' })).toBe('frys')
    expect(departmentFor({ name: 'Pytt i panna, fryst', category: 'fardigratt' })).toBe('frys')
    expect(departmentFor({ name: 'Vegofärs', category: 'vegoprotein', rawWeight: { factor: 0.9, kind: 'fryst' } })).toBe('frys')
    expect(departmentFor({ name: 'Snabbkaffe, frystorkat', category: 'dryck' })).toBe('ovrigt')
    expect(departmentFor({ name: 'Rapsolja', category: 'fett_olja' })).toBe('torrvaror')
    expect(departmentFor({ name: 'Smör och rapsolja', category: 'fett_olja' })).toBe('mejeri')
    expect(departmentFor({ name: 'Smör', category: 'fett_olja' })).toBe('mejeri')
    // Köps torkat och står i torkad vikt.
    expect(departmentFor({ name: 'Sojafärs', category: 'vegoprotein', rawWeight: { factor: 3, kind: 'torkad' } })).toBe('torrvaror')
  })

  it('har avdelningarna i butikens ordning', () => {
    expect(DEPARTMENTS.map((d) => d.label)).toEqual(['Frukt och grönt', 'Bröd', 'Mejeri och ägg', 'Kött, fisk och vego', 'Torrvaror', 'Frys', 'Övrigt'])
  })

  it('känner igen kranvatten', () => {
    expect(isTapWater(vatten)).toBe(true)
    expect(isTapWater({ id: 'custom:v', name: 'Kranvatten', category: 'dryck' })).toBe(true)
    expect(isTapWater({ id: 'lagom:vatten-kolsyrat', name: 'Kolsyrat vatten', category: 'dryck' })).toBe(false)
    expect(isTapWater(mjölk)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Inköpslistan
// ---------------------------------------------------------------------------

describe('inköpslistans mått', () => {
  it('anger kött, pasta och ris i rå/okokt vikt', () => {
    expect(shoppingAmountText(nötfärs, 375, new Map([['g-ra', 500]]))).toBe('500 g rå')
    // Tillagad vikt räknas om: 300 g stekt = 400 g rå.
    expect(shoppingAmountText(nötfärs, 300, new Map([['g', 300]]))).toBe('400 g rå')
    expect(shoppingAmountText(nötfärs, 1500, new Map([['g', 1000], ['g-ra', 666]]))).toBe('2 kg rå')
    expect(shoppingAmountText(pasta, 480, new Map([['g', 480]]))).toBe('200 g okokt')
    expect(shoppingAmountText(pasta, 400, new Map([['dl-ra', 2.1]]))).toBe('2,25 dl okokt')
  })

  it('summerar i samma enhet och avrundar uppåt', () => {
    // Styckvaror köps hela – under 1 räcker en halv.
    expect(shoppingAmountText(lök, 250, new Map([['portion:st', 2.5]]))).toBe('3 st (medel, 300 g)')
    expect(shoppingAmountText(lök, 60, new Map([['portion:st', 0.6]]))).toBe('1 st (medel, 100 g)')
    expect(shoppingAmountText(lök, 40, new Map([['portion:st', 0.4]]))).toBe('½ st (medel, 50 g)')
    expect(shoppingAmountText(ägg, 438, new Map([['portion:st', 8.75]]))).toBe('9 ägg (M, utan skal, 450 g)')
    expect(shoppingAmountText(mjölk, 412, new Map([['dl', 4]]))).toBe('4 dl')
    expect(shoppingAmountText(mjölk, 412, new Map([['dl', 3.9]]))).toBe('4 dl')
    expect(shoppingAmountText(havregryn, 35, new Map([['g', 35]]))).toBe('35 g')
    expect(shoppingAmountText(havregryn, 1234, new Map([['g', 1234]]))).toBe('1,24 kg')
  })

  it('byter till liter, gram eller vikt när måttet blir otympligt', () => {
    // 10 dl eller mer blir liter.
    expect(shoppingAmountText(mjölk, 1133, new Map([['dl', 11]]))).toBe('1,25 l')
    // Minst 1 dl i skedmått: gram för fasta varor, dl för flytande.
    const smör: Food = { ...havregryn, id: 'lagom:smor', name: 'Smör', category: 'fett_olja', density: 0.91, portions: [] }
    expect(shoppingAmountText(smör, 245.7, new Map([['msk', 18]]))).toBe('250 g')
    expect(shoppingAmountText(smör, 27.3, new Map([['msk', 2]]))).toBe('2 msk')
    const olja: Food = { ...smör, id: 'lagom:olja', name: 'Rapsolja', liquid: true, density: 0.92 }
    expect(shoppingAmountText(olja, 110.4, new Map([['msk', 8]]))).toBe('1,5 dl')
    // "1 portion till mat" säger inget i butiken – då anges vikten.
    const sylt: Food = { ...havregryn, id: 'lagom:lingonsylt', name: 'Lingonsylt', portions: [{ id: 'portion', label: '1 portion till mat (30 g)', grams: 30 }] }
    expect(shoppingAmountText(sylt, 240, new Map([['portion:portion', 8]]))).toBe('240 g')
    const tomat: Food = { ...havregryn, id: 'lagom:krossade', name: 'Krossade tomater', portions: [{ id: 'burk', label: '1 burk (400 g)', grams: 400 }] }
    expect(shoppingAmountText(tomat, 600, new Map([['portion:burk', 1.5]]))).toBe('2 burkar (800 g)')
  })

  it('anger ätportioner från vikten och stora mängder torrvaror i vikt', () => {
    // "3 glas" mjölk → dl, "8 klickar" → gram, "½ avokado" → st.
    const mjölkGlas = new Map([['portion:glas', 3]] as const)
    expect(shoppingAmountText(mjölk, 618, mjölkGlas)).toBe('6 dl')
    const gräddfil: Food = { ...havregryn, id: 'lagom:graddfil', name: 'Gräddfil', category: 'mejeri', portions: [{ id: 'klick', label: '1 klick (2 msk)', grams: 32 }] }
    expect(shoppingAmountText(gräddfil, 256, new Map([['portion:klick', 8]]))).toBe('260 g')
    const avokado: Food = {
      ...havregryn,
      id: 'lagom:avokado',
      name: 'Avokado',
      category: 'frukt',
      portions: [
        { id: 'halv', label: '½ avokado (70 g)', grams: 70 },
        { id: 'st', label: '1 st (utan skal och kärna, 140 g)', grams: 140 },
      ],
    }
    expect(shoppingAmountText(avokado, 210, new Map([['portion:halv', 3]]))).toBe('2 st (utan skal och kärna, 280 g)')
    const vodka: Food = { ...mjölk, id: 'lagom:sprit', name: 'Sprit', portions: [{ id: 'liten', label: '1 liten (2 cl)', grams: 19 }] }
    expect(shoppingAmountText(vodka, 95, new Map([['portion:liten', 5]]))).toBe('1 dl')
    // 10 dl eller mer: liter för drycker (ovan), vikt för torrvaror.
    const mjöl: Food = { ...havregryn, id: 'lagom:vetemjol', name: 'Vetemjöl', density: 0.6 }
    expect(shoppingAmountText(mjöl, 900, new Map([['dl', 15]]))).toBe('900 g')
    expect(shoppingAmountText(mjöl, 150, new Map([['dl', 2.5]]))).toBe('2,5 dl')
  })

  it('räknar från vikten när enheterna blandas', () => {
    // Dryck i dl eller liter.
    expect(shoppingAmountText(mjölk, 824, new Map([['dl', 2], ['portion:glas', 3]]))).toBe('8 dl')
    expect(shoppingAmountText(mjölk, 1236, new Map([['dl', 6], ['portion:glas', 3]]))).toBe('1,25 l')
    // Styckvaror i st (uppåt till halva).
    expect(shoppingAmountText(ägg, 130, new Map([['g', 30], ['portion:st', 2]]))).toBe('3 ägg (M, utan skal, 150 g)')
    // Övrigt i gram – även varor med skivor som portion.
    expect(shoppingAmountText(havregryn, 105, new Map([['dl', 1], ['g', 70]]))).toBe('105 g')
    const rödbetor: Food = { ...havregryn, id: 'lagom:rodbetor', name: 'Inlagda rödbetor', portions: [{ id: 'skiva', label: '1 skiva', grams: 10 }] }
    expect(shoppingAmountText(rödbetor, 500, new Map([['g', 300], ['portion:skiva', 20]]))).toBe('500 g')
    expect(shoppingAmountText(rödbetor, 100, new Map([['portion:skiva', 10]]))).toBe('10 skivor (100 g)')
    expect(shoppingAmountText(havregryn, 0, new Map())).toBe('')
  })
})

describe('buildShoppingList', () => {
  it('skalar recept efter portioner att laga och hoppar över kranvatten', () => {
    const list = buildShoppingList([recipeItem({ servings: 2 })], resolve)
    expect(line(list, 'Nötfärs')?.amountText).toBe('250 g rå')
    expect(line(list, 'Lök')?.amountText).toBe('½ st (medel, 50 g)')
    expect(line(list, 'Vatten')).toBeUndefined()
    expect(line(list, 'Nötfärs')?.usedFor).toEqual(['Köttfärssås'])
    expect(list.count).toBe(2)
  })

  it('räknar inte rester (0 portioner att laga)', () => {
    const list = buildShoppingList([recipeItem({ servings: 0, eat: 1 })], resolve)
    expect(list.count).toBe(0)
    expect(list.groups).toEqual([])
  })

  it('summerar samma livsmedel från recept, måltider och livsmedel', () => {
    const list = buildShoppingList(
      [
        recipeItem(),
        recipeItem({ id: 'p2', date: '2026-09-30', servings: 4 }),
        foodItem(lök, 1, 'portion:st', 100),
        recipeItem({ id: 'p3', recipeId: 'klassiker-pannkakor', name: 'Pannkakor', servings: 2 }),
        mealItem(),
      ],
      resolve,
    )
    // 2 × 500 g rå = 1 kg rå.
    expect(line(list, 'Nötfärs')?.amountText).toBe('1 kg rå')
    // 1 + 1 + 1 st lök.
    expect(line(list, 'Lök')?.amountText).toBe('3 st (medel, 300 g)')
    expect(line(list, 'Lök')?.usedFor).toEqual(['Köttfärssås'])
    // Mjölk: 3 dl (halva pannkakssatsen) + 1 glas i gröten → blandade enheter → från vikten.
    expect(line(list, 'Mjölk')?.grams).toBeCloseTo(309 + 206, 5)
    expect(line(list, 'Mjölk')?.amountText).toBe('5 dl')
    expect(line(list, 'Mjölk')?.usedFor).toEqual(['Pannkakor', 'Frukostgröt'])
    expect(line(list, 'Ägg')?.amountText).toBe('2 ägg (M, utan skal, 100 g)')
    expect(line(list, 'Havregryn')?.amountText).toBe('1 dl')
  })

  it('grupperar per avdelning i butikens ordning och alfabetiskt inom avdelningen', () => {
    const list = buildShoppingList(
      [
        foodItem(ägg, 2, 'portion:st', 100),
        foodItem(mjölk, 2, 'dl', 206),
        foodItem(lök, 1, 'portion:st', 100),
        foodItem(nötfärs, 500, 'g-ra', 375),
        foodItem({ ...havregryn, id: 'lagom:bar', name: 'Frysta blåbär', category: 'bar' }, 100, 'g', 100),
      ],
      resolve,
    )
    expect(list.groups.map((g) => [g.id, g.lines.map((l) => l.name)])).toEqual([
      ['frukt_gront', ['Lök']],
      ['mejeri', ['Mjölk', 'Ägg']],
      ['kott_fisk', ['Nötfärs']],
      ['frys', ['Frysta blåbär']],
    ])
  })

  it('räknar upp recept som inte finns längre', () => {
    const list = buildShoppingList([recipeItem({ recipeId: 'r_borta', name: 'Mormors soppa' }), recipeItem({ id: 'x', recipeId: 'r_borta', name: 'Mormors soppa' })], resolve)
    expect(list.missingRecipes).toEqual(['Mormors soppa'])
    expect(list.count).toBe(0)
  })

  it('löser ut recept som ingår som livsmedel i en sparad måltid', () => {
    const sasFood: Food = { id: 'recipe:r_sas', name: 'Köttfärssås', source: 'recipe', category: 'fardigratt', nutrients: { kcal: 125 }, portions: [] }
    // Hela receptet väger 775 g – en fjärdedel (193,75 g) ger en fjärdedel av ingredienserna.
    const list = buildShoppingList([mealItem({ items: [{ food: sasFood, amount: 193.75, unit: 'g', grams: 193.75 }] })], resolve)
    expect(line(list, 'Nötfärs')?.amountText).toBe('125 g rå')
    expect(line(list, 'Köttfärssås')).toBeUndefined()
    // Går receptet inte att hitta står rätten själv på listan.
    const missing = buildShoppingList([mealItem({ items: [{ food: { ...sasFood, id: 'recipe:r_borta' }, amount: 200, unit: 'g', grams: 200 }] })], resolve)
    expect(line(missing, 'Köttfärssås')?.amountText).toBe('200 g')
  })

  it('slår ihop gamla id:n med ersättaren via alias', () => {
    expect(shoppingKey({ id: 'lagom:lok' })).toBe('food:lagom:lok')
    const list = buildShoppingList([foodItem(lök, 1, 'portion:st', 100), foodItem({ ...lök }, 1, 'portion:st', 100, { id: 'y' })], resolve)
    expect(line(list, 'Lök')?.amountText).toBe('2 st (medel, 200 g)')
  })

  it('räknar om gamla id:n (rå rad ersatt av tillagad) till ersättaren', () => {
    // Äldre recept har ögonblicksbilder av den gamla råa raden; nya planer har den stekta.
    const stekt: Food = { ...nötfärs, id: 'lagom:notfars-12-stekt', name: 'Nötfärs', rawWeight: { factor: 0.8, kind: 'ra' } }
    const gammalRå: Food = { id: 'lagom:notfars-12-ra', name: 'Nötfärs, rå', source: 'lagom', category: 'rott_kott', nutrients: { kcal: 200 }, portions: [] }
    const items = [foodItem(gammalRå, 500, 'g', 500), foodItem(stekt, 500, 'g-ra', 400, { id: 'ny' })]
    const catalog = new Map([[stekt.id, stekt]])
    const list = buildShoppingList(items, resolve, { food: (id) => catalog.get(id) })
    // 500 g rå + 500 g rå = 1 kg rå – inte 900 g (gram rått och tillagat blandat).
    expect(list.count).toBe(1)
    expect(line(list, 'Nötfärs')?.amountText).toBe('1 kg rå')
    expect(line(list, 'Nötfärs')?.grams).toBeCloseTo(800, 5)
    // Utan uppslag (databasen laddas) står den gamla raden för sig i stället för att blandas.
    const loose = buildShoppingList(items, resolve)
    expect(loose.count).toBe(2)
    expect(line(loose, 'Nötfärs, rå')?.amountText).toBe('500 g')
    expect(line(loose, 'Nötfärs')?.amountText).toBe('500 g rå')
    // Ett vanligt namnbyte (tillagad → tillagad) summeras direkt.
    const gammalStekt: Food = { ...stekt, id: 'lagom:notfars-10-stekt' }
    const merged = buildShoppingList([foodItem(gammalStekt, 200, 'g', 200), foodItem(stekt, 200, 'g', 200, { id: 'ny2' })], resolve)
    expect(merged.count).toBe(1)
    expect(line(merged, 'Nötfärs')?.amountText).toBe('500 g rå')
  })

  it('markerar varor där vikten saknas för en del', () => {
    const list = buildShoppingList([foodItem(lök, 1, 'portion:st', 100), foodItem(lök, 1, 'portion:saknas', Number.NaN, { id: 'z' })], resolve)
    expect(line(list, 'Lök')?.partial).toBe(true)
    expect(line(list, 'Lök')?.grams).toBe(100)
  })
})

describe('delningstext', () => {
  it('tar bara med det som inte är avbockat, per avdelning och med egna rader sist', () => {
    const list = buildShoppingList([recipeItem({ servings: 2 }), foodItem(mjölk, 5, 'dl', 515)], resolve)
    const extras = [
      { id: 'e1', text: 'Diskmedel', checked: false, createdAt: 1 },
      { id: 'e2', text: 'Kaffefilter', checked: true, createdAt: 2 },
    ]
    const text = shoppingListText('Inköpslista – vecka 40', list, extras, new Set([shoppingKey(mjölk)]))
    expect(text).toBe(
      ['Inköpslista – vecka 40', 'Frukt och grönt\n• Lök – ½ st (medel, 50 g)', 'Kött, fisk och vego\n• Nötfärs – 250 g rå', 'Egna varor\n• Diskmedel'].join('\n\n'),
    )
    expect(remainingCount(list, extras, new Set([shoppingKey(mjölk)]))).toBe(3)
  })

  it('visar märket och varor utan mängd', () => {
    const branded: Food = { ...okändEnergi, id: 'off:1', name: 'Pastasås', brand: 'Testmärket' }
    const list = buildShoppingList([foodItem(branded, 1, 'portion:burk', Number.NaN)], resolve)
    expect(shoppingListText('Lista', list)).toBe('Lista\n\nTorrvaror\n• Pastasås (Testmärket)')
  })

  it('städar egna rader', () => {
    expect(cleanExtraText('  Disk\n medel ')).toBe('Disk medel')
    expect(cleanExtraText('   ')).toBeNull()
    expect(cleanExtraText('x'.repeat(200))).toHaveLength(120)
  })
})

// ---------------------------------------------------------------------------
// Tolerant inläsning
// ---------------------------------------------------------------------------

describe('sanitizePlanData', () => {
  it('låter giltig data vara oförändrad', () => {
    const data = {
      items: { [MONDAY]: [recipeItem({ perServing: { kcal: 250, protein: 20 }, emoji: '🍝', loggedEntryIds: ['e1'] }), mealItem(), foodItem(lök, 1, 'portion:st', 100)] },
      shopping: { [MONDAY]: { checked: ['food:lagom:lok'], extras: [{ id: 'x1', text: 'Diskmedel', checked: true, createdAt: 5 }] } },
    }
    const res = sanitizePlanData(JSON.parse(JSON.stringify(data)))
    expect(res.skipped).toBe(0)
    expect(res.repaired).toBe(0)
    expect(res.data).toEqual(data)
  })

  it('tål skräp utan att kasta', () => {
    for (const raw of [null, undefined, 42, 'text', [], { items: 'x', shopping: 5 }, { items: { 'inte-ett-datum': [recipeItem()] } }]) {
      expect(() => sanitizePlanData(raw)).not.toThrow()
      expect(sanitizePlanData(raw).data).toEqual({ items: {}, shopping: {} })
    }
  })

  it('hoppar över skadade rader och rättar småfel', () => {
    let n = 0
    const res = sanitizePlanData(
      {
        items: {
          [MONDAY]: [
            recipeItem({ meal: 'brunch' as never, servings: Number.NaN, eat: 99 }),
            { ...recipeItem({ id: 'p1' }), date: '2020-01-01' },
            { kind: 'recipe', id: 'r2', meal: 'lunch' },
            { kind: 'food', id: 'f1', meal: 'lunch', food: { name: 'Utan id' }, amount: 1, unit: 'g', grams: 1 },
            foodItem(lök, 2, 'portion:st', Number.NaN, { id: 'f2' }),
            foodItem(lök, -1, 'g', 10, { id: 'f3' }),
            mealItem({ id: 'm2', items: [{ food: lök, amount: 1, unit: 'portion:st', grams: 100 }, { food: null as never, amount: 1, unit: 'g', grams: 1 }] }),
            mealItem({ id: 'm3', items: [] }),
            'skräp',
            { kind: 'okänd', id: 'k' },
          ],
        },
        shopping: {
          [MONDAY]: { checked: ['a', 'a', 7, 'b'], extras: [{ id: 'x', text: '  Mjöl ' }, { id: 'x', text: 'Socker' }, { text: '' }, 'skräp'] },
          '2026-10-01': { checked: ['c'], extras: [] },
          'fel': { checked: [] },
        },
      },
      { makeId: () => `ny${n++}`, now: 99 },
    )
    const list = res.data.items[MONDAY]
    expect(list.map((i) => i.id)).toEqual(['p1', 'ny0', 'f2', 'm2'])
    expect(list[0]).toMatchObject({ meal: 'middag', servings: 1, eat: 10 })
    expect(list[1]).toMatchObject({ date: MONDAY })
    // Vikten räknas om från mängden.
    expect(list[2]).toMatchObject({ amount: 2, grams: 200 })
    expect((list[3] as PlanMealItem).items).toHaveLength(1)
    expect(res.skipped).toBe(9)
    expect(res.data.shopping[MONDAY]).toEqual({
      checked: ['a', 'b', 'c'],
      extras: [
        { id: 'x', text: 'Mjöl', checked: false, createdAt: 99 },
        { id: 'ny1', text: 'Socker', checked: false, createdAt: 99 },
      ],
    })
  })

  it('kontrollerar livsmedlen i planen', () => {
    expect(sanitizePlanFood({ id: 'x' })).toBeNull()
    const food = sanitizePlanFood({
      id: 'custom:a',
      name: 'Egen',
      category: 'påhittad',
      source: 'annan',
      nutrients: { kcal: 100, protein: 'mycket', fat: -1 },
      portions: [{ id: 'st', label: '1 st', grams: 50 }, { id: 'bad', grams: 0 }],
      density: 'tung',
      rawWeight: { factor: 0, kind: 'ra' },
      plate: { veg: 'alla' },
      tags: ['vegan', 3],
    })
    expect(food).toEqual({
      id: 'custom:a',
      name: 'Egen',
      category: 'ovrigt',
      source: 'custom',
      nutrients: { kcal: 100 },
      portions: [{ id: 'st', label: '1 st', grams: 50 }],
      tags: ['vegan'],
    })
    // Ett recepts egen tallriksmodell och rå vikt behålls.
    expect(sanitizePlanFood({ ...nötfärs, plate: { veg: 0, carb: 0, protein: 1 } })).toEqual({ ...nötfärs, plate: { veg: 0, carb: 0, protein: 1 } })
  })

  it('kan använda en egen kontroll av livsmedel (t.ex. säkerhetskopians)', () => {
    const res = sanitizePlanData({ items: { [MONDAY]: [foodItem(lök, 1, 'portion:st', 100)] } }, { food: () => null })
    expect(res.data.items).toEqual({})
    expect(res.skipped).toBe(1)
  })

  it('behåller rader av alla slag genom en rundtur via JSON', () => {
    const items: PlanItem[] = [recipeItem(), mealItem(), foodItem(pasta, 1, 'dl-ra', 96)]
    const res = sanitizePlanData(JSON.parse(JSON.stringify({ items: { [MONDAY]: items }, shopping: {} })))
    expect(res.data.items[MONDAY]).toEqual(items)
  })
})
