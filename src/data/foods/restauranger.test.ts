/**
 * Restaurangkedjor och kaféer: kedjornas värden, källhänvisningen och att sökningen fortfarande
 * visar basvarorna först. Kör: npx vitest run src/data/foods
 */
import { describe, expect, it } from 'vitest'
import type { FoodUsage } from '../../stores/foodStore'
import type { Food, MealId } from '../../types'
import { BUILTIN_FOODS, BUILTIN_FOOD_FILES } from './index'
import { FOOD_ALIASES } from './aliases'
import { LEGACY_FOOD_IDS } from './legacy-ids'
import { STAPLE_FOODS } from './staples'
import {
  RESTAURANT_CHAINS,
  chainFoods,
  chainSourceNote,
  fetchedDateSv,
  genitiveSv,
  per100Factor,
  restauranger,
  type ChainItem,
  type ChainMenu,
  type ChainSource,
} from './restauranger'
import { BUILTIN_RECIPE_SEEDS, loadBuiltinRecipes } from '../recipes'
import { createSearchIndex, isCompositeFood, normalizeSv, searchFoods } from '../../lib/search'
import { recipeFood } from '../../lib/foodRepo'
import { DEMO_FAVORITES, demoFoodIds } from '../../lib/demo'
import { isValidISODate, todayISO } from '../../lib/dates'
import { createUsageBoost } from '../../hooks/useFoodSearch'

/**
 * Tredjepartssajter och arkiv som inte är kedjornas egna källor. Prövas mot värddatorn, inte hela
 * adressen – McDonald's egen källa heter t.ex. ".../naringskalkylatorn.html".
 */
const NOT_OFFICIAL_HOST = /fatsecret|matkalkyl|kostplanering|maxmeny|godmiddag|myfitnesspal|openfoodfacts|wikipedia|archive\.(org|ph|today|is)/i

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

/** Fel i en produkt så som kedjan anger den (före omräkningen till per 100 g). */
function itemProblems(item: ChainItem): string[] {
  const out: string[] = []
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(item.id)) out.push(`ogiltig id-del ${item.id}`)
  if (!item.name.trim() || item.name !== item.name.trim()) out.push('namn saknas eller har blanksteg i kanterna')
  if (item.portions.length === 0) out.push('portioner saknas (den första är kedjans portion)')
  if (!(per100Factor(item) > 0)) out.push('första portionen saknar vikt')
  const grams = item.per === 'portion' ? (item.portions[0]?.[2] ?? 0) : 100
  const mass = item.prot + item.carb + item.fat + (item.fiber ?? 0) + (item.salt ?? 0) + (item.alc ?? 0)
  if (mass > grams + 1) out.push(`näringsämnena väger ${mass} g men portionen ${grams} g`)
  if (item.kj !== undefined && Math.abs(item.kj - item.kcal * 4.184) > Math.max(8, item.kj * 0.03)) {
    out.push(`${item.kj} kJ stämmer inte med ${item.kcal} kcal`)
  }
  // Rimlighetskontroll: 4 × protein + 4 × kolhydrater + 9 × fett + 2 × fiber + 7 × alkohol inom ±12 %
  // eller ±12 kcal per 100 g – samma gräns som foods.test.ts har för hela databasen.
  const calc = 4 * item.prot + 4 * item.carb + 9 * item.fat + 2 * (item.fiber ?? 0) + 7 * (item.alc ?? 0)
  if (Math.abs(item.kcal - calc) > Math.max(12 * (grams / 100), item.kcal * 0.12)) {
    out.push(`${item.kcal} kcal stämmer inte med makron (${Math.round(calc)} kcal)`)
  }
  if (item.sugar !== undefined && item.sugar > item.carb + 0.5) out.push('socker > kolhydrater')
  if (item.addedSugar !== undefined && item.sugar !== undefined && item.addedSugar > item.sugar + 0.5) out.push('tillsatt socker > socker')
  if (item.satFat !== undefined && item.satFat > item.fat + 0.5) out.push('mättat fett > fett')
  const values = [item.kcal, item.prot, item.carb, item.fat, item.fiber, item.sugar, item.addedSugar, item.satFat, item.salt, item.alc, item.caffeine]
  if (values.some((v) => v !== undefined && !(v >= 0 && Number.isFinite(v)))) out.push('negativa eller ogiltiga värden')
  if (new Set(item.portions.map(([id]) => id)).size !== item.portions.length) out.push('dubbla portion-id')
  return out
}

function sourceProblems(source: ChainSource): string[] {
  const out: string[] = []
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(source.slug)) out.push(`ogiltig slug ${source.slug}`)
  if (!source.chain.trim()) out.push('kedjans namn saknas')
  if (!/^https:\/\/[^\s()]+$/.test(source.url) || !hostOf(source.url)) out.push(`ogiltig adress ${source.url}`)
  if (NOT_OFFICIAL_HOST.test(hostOf(source.url))) out.push(`${source.url} är inte kedjans egen källa`)
  if (!isValidISODate(source.fetched) || source.fetched > todayISO()) out.push(`ogiltigt hämtdatum ${source.fetched}`)
  return out
}

const TEST_SOURCE: ChainSource = { slug: 'testkedjan', chain: 'Testkedjan', url: 'https://example.se/naringsvarden.pdf', fetched: '2026-09-29' }

const TEST_BURGER: ChainItem = {
  id: 'burgare',
  name: 'Testburgare',
  cat: 'snabbmat',
  per: 'portion',
  kj: 2092,
  kcal: 500, prot: 25, carb: 50, fat: 21, fiber: 3, sugar: 8, satFat: 8, salt: 2.5,
  portions: [['st', '1 st (200 g)', 200], ['tva', '2 st', 400]],
  syn: ['testburgaren'],
}

describe('chainFoods', () => {
  it('räknar om kedjans värden per portion till per 100 g', () => {
    const [food] = chainFoods({ source: TEST_SOURCE, items: [TEST_BURGER] })
    expect(food.id).toBe('lagom:testkedjan-burgare')
    expect(food.brand).toBe('Testkedjan')
    expect(food.source).toBe('lagom')
    expect(food.nutrients).toMatchObject({ kcal: 250, protein: 12.5, carbs: 25, fat: 10.5, fiber: 1.5, sugars: 4, satFat: 4, salt: 1.25 })
    // Okända värden förblir okända – aldrig 0.
    expect(food.nutrients.addedSugar).toBeUndefined()
    expect(food.nutrients.alcohol).toBeUndefined()
    expect(food.portions).toEqual([{ id: 'st', label: '1 st (200 g)', grams: 200 }, { id: 'tva', label: '2 st', grams: 400 }])
    expect(food.synonyms).toEqual(['testburgaren'])
    expect(food.isAverage).toBeUndefined()
    expect(food.note).toBe(
      'Källa: Testkedjans näringsinformation (https://example.se/naringsvarden.pdf), hämtad 29 september 2026. Recept och portioner kan ändras – kontrollera hos kedjan.',
    )
  })

  it('avrundar omräknade värden och behåller värden per 100 g', () => {
    const latte: ChainItem = {
      id: 'latte', name: 'Testlatte', cat: 'dryck', per: 'portion',
      kcal: 212, prot: 13.9, carb: 20.1, fat: 8.4, salt: 0.4, caffeine: 130,
      portions: [['mellan', '1 mellan (350 ml)', 361]], liquid: true, density: 1.03, extra: 'Med mellanmjölk.',
    }
    const bun: ChainItem = { id: 'bulle', name: 'Testbulle', cat: 'bakverk', per: '100g', kcal: 336, prot: 6, carb: 45, fat: 14.5, portions: [['st', '1 st (110 g)', 110]] }
    const [l, b] = chainFoods({ source: TEST_SOURCE, items: [latte, bun] })
    expect(l.nutrients).toMatchObject({ kcal: 59, protein: 3.9, carbs: 5.6, fat: 2.3, salt: 0.11, caffeine: 36 })
    expect(l.liquid).toBe(true)
    expect(l.density).toBe(1.03)
    expect(l.note).toMatch(/kontrollera hos kedjan\. Med mellanmjölk\.$/)
    expect(b.nutrients).toMatchObject({ kcal: 336, protein: 6, carbs: 45, fat: 14.5 })
    expect(b.nutrients.caffeine).toBeUndefined()
  })

  it('skriver källan med svensk genitiv', () => {
    expect(genitiveSv('Burger King')).toBe('Burger Kings')
    expect(genitiveSv('Espresso House')).toBe('Espresso Houses')
    expect(genitiveSv('Pressbyrån')).toBe('Pressbyråns')
    expect(genitiveSv('Max')).toBe('Max')
    expect(genitiveSv('Starbucks')).toBe('Starbucks')
    expect(genitiveSv("McDonald's")).toBe("McDonald's")
    expect(chainSourceNote({ ...TEST_SOURCE, chain: 'Max' })).toMatch(/^Källa: Max näringsinformation \(https:/)
    expect(fetchedDateSv('2026-09-29')).toBe('29 september 2026')
    expect(fetchedDateSv('2027-01-05')).toBe('5 januari 2027')
  })

  it('hittar fel i kedjans siffror', () => {
    expect(itemProblems(TEST_BURGER)).toEqual([])
    expect(itemProblems({ ...TEST_BURGER, kj: 1800 }).join()).toContain('kJ')
    expect(itemProblems({ ...TEST_BURGER, kcal: 400, kj: 1674 }).join()).toContain('makron')
    // 13 % från makrona: fälls här precis som i foods.test.ts (±12 %).
    expect(itemProblems({ ...TEST_BURGER, kcal: 575, kj: 2406 }).join()).toContain('makron')
    expect(itemProblems({ ...TEST_BURGER, kcal: 555, kj: 2322 })).toEqual([])
    expect(itemProblems({ ...TEST_BURGER, portions: [] }).length).toBeGreaterThan(0)
    expect(sourceProblems(TEST_SOURCE)).toEqual([])
    expect(sourceProblems({ ...TEST_SOURCE, url: 'https://www.fatsecret.se/kalorier-naring/max' }).length).toBe(1)
    expect(sourceProblems({ ...TEST_SOURCE, url: 'https://web.archive.org/web/2026/https://www.max.se/' }).length).toBe(1)
    // Kedjornas egna adresser godkänns, även när sökvägen innehåller ord som "kalkylator".
    expect(sourceProblems({ ...TEST_SOURCE, url: 'https://www.mcdonalds.com/se/sv-se/naringskalkylatorn.html' })).toEqual([])
    expect(sourceProblems({ ...TEST_SOURCE, url: 'https://www.max.se/maten/naringsvarden/' })).toEqual([])
    expect(sourceProblems({ ...TEST_SOURCE, fetched: '2999-01-01' }).length).toBe(1)
    expect(sourceProblems({ ...TEST_SOURCE, fetched: '2026-02-30' }).length).toBe(1)
    expect(sourceProblems({ ...TEST_SOURCE, url: 'http://example.se/naringsvarden' }).length).toBe(1)
  })
})

describe('restaurangkedjornas livsmedel', () => {
  it('är registrerade i databasen', () => {
    expect(BUILTIN_FOOD_FILES.restauranger).toBe(restauranger)
    const ids = new Set(BUILTIN_FOODS.map((f) => f.id))
    for (const f of restauranger) expect(ids.has(f.id), f.id).toBe(true)
    expect(restauranger).toHaveLength(RESTAURANT_CHAINS.reduce((n, c) => n + c.items.length, 0))
  })

  it('har en giltig källa per kedja och rimliga siffror per produkt', () => {
    const slugs = RESTAURANT_CHAINS.map((c) => c.source.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    const bad: string[] = []
    for (const { source, items } of RESTAURANT_CHAINS) {
      for (const p of sourceProblems(source)) bad.push(`${source.chain}: ${p}`)
      if (items.length === 0) bad.push(`${source.chain}: inga produkter`)
      for (const item of items) for (const p of itemProblems(item)) bad.push(`${source.chain} ${item.name}: ${p}`)
    }
    expect(bad).toEqual([])
  })

  it('är kedjans specifika produkter med källhänvisning, inga samlingsvärden', () => {
    const recipeNames = new Set(BUILTIN_RECIPE_SEEDS.map((r) => normalizeSv(r.name)))
    const legacy = new Set(LEGACY_FOOD_IDS)
    const bad: string[] = []
    const check = ({ source }: ChainMenu, f: Food) => {
      if (f.brand !== source.chain) bad.push(`${f.id}: brand ska vara ${source.chain}`)
      if (!f.id.startsWith(`lagom:${source.slug}-`)) bad.push(`${f.id}: id ska börja med kedjans slug`)
      if (!f.note?.startsWith(chainSourceNote(source))) bad.push(`${f.id}: källhänvisningen saknas`)
      if (f.isAverage || f.lmvNumber !== undefined || f.rawWeight) bad.push(`${f.id}: inte avg, lmv eller raw för kedjans produkter`)
      if (legacy.has(f.id) || FOOD_ALIASES.has(f.id)) bad.push(`${f.id}: krockar med ett tidigare id eller alias`)
      // Undvik förväxling med de inbyggda klassikerna (t.ex. receptet "Köttbullar").
      if (recipeNames.has(normalizeSv(f.name))) bad.push(`${f.id}: samma namn som ett inbyggt recept`)
    }
    for (const menu of RESTAURANT_CHAINS) for (const f of chainFoods(menu)) check(menu, f)
    expect(bad).toEqual([])
  })
})

describe('sökningen visar basvarorna före kedjornas produkter', () => {
  const recipes = loadBuiltinRecipes(BUILTIN_FOODS).map(recipeFood)
  const indexes = [createSearchIndex(BUILTIN_FOODS), createSearchIndex(recipes)]
  const now = Date.UTC(2026, 8, 29, 12)
  // Samma upplägg som i lib/search.test.ts: rätter (även kedjornas snabbmat) används ofta till lunch.
  const usage: Record<string, FoodUsage> = {}
  const used = (id: string, count: number, meal: MealId) => {
    usage[id] = { count, lastUsed: now - 3_600_000, meals: { [meal]: count } } as FoodUsage
  }
  for (const id of demoFoodIds()) used(id, 8, 'middag')
  for (const f of [...BUILTIN_FOODS, ...recipes]) if (isCompositeFood(f)) used(f.id, 12, 'lunch')
  const boost = createUsageBoost(usage, [...DEMO_FAVORITES], 'lunch', now)
  const idsOf = (q: string) =>
    searchFoods(indexes, q, { limit: 40, boost, staples: STAPLE_FOODS, optionalWords: new Set(['rå']) }).map((r) => r.food.id)
  const chainIds = new Set(restauranger.map((f) => f.id))

  /**
   * Vardagsord → basvaror som ska finnas bland träffarna och komma före alla kedjeprodukter. Den
   * inbördes ordningen mellan basvarorna prövas i lib/search.test.ts, inte här.
   */
  const BASICS: Record<string, string[]> = {
    hamburgare: ['lagom:hamburgerbiff', 'lagom:cheeseburgare'],
    burgare: ['lagom:cheeseburgare', 'lagom:kycklingburgare', 'lagom:vegoburgare-brod-dressing'],
    kaffe: ['lagom:kaffe-bryggt', 'lagom:kaffe-med-mjolk', 'lagom:caffe-latte-mellanmjolk'],
    kanelbulle: ['lagom:kanelbulle-bageri'],
    bulle: ['lagom:kanelbulle-bageri', 'lagom:kardemummabulle-bageri'],
    pizza: ['lagom:pizza-margherita', 'lagom:pizza-vesuvio'],
    latte: ['lagom:caffe-latte-mellanmjolk', 'lagom:caffe-latte-havredryck'],
    cappuccino: ['lagom:cappuccino-mellanmjolk'],
    espresso: ['lagom:espresso'],
    'chai latte': ['lagom:chai-latte-mellanmjolk'],
    te: ['lagom:te-svart-bryggt'],
    'pommes frites': ['lagom:pommes-frites-ugnsbakade', 'lagom:pommes-frites-friterade'],
    milkshake: ['lagom:milkshake-vanilj'],
    shake: ['lagom:milkshake-vanilj'],
    mjukglass: ['lagom:mjukglass'],
    glass: ['lagom:graddglass-vanilj', 'lagom:mjukglass'],
    nuggets: ['lagom:vegonuggets-panerade', 'lagom:kycklingnuggets'],
    kycklingburgare: ['lagom:kycklingburgare'],
    muffin: ['lagom:muffins-vanilj'],
    croissant: ['lagom:croissant-smor'],
    smoothie: ['lagom:smoothie-frukt-bar-fardig'],
    juice: ['lagom:apelsinjuice'],
    läsk: ['lagom:lask-sockersotad'],
    tunnbrödsrulle: ['lagom:tunnbrodsrulle'],
    'varm korv': ['lagom:varmkorv-wienerkorv', 'lagom:varmkorv-med-brod'],
    sallad: ['lagom:sallad-blandad'],
    wrap: ['lagom:wrap-kyckling'],
    smörgås: ['lagom:smorgas-grovt-ost', 'lagom:smorgas-skinka'],
    baguette: ['lagom:baguette', 'lagom:baguette-kyckling'],
  }

  for (const [q, basics] of Object.entries(BASICS)) {
    it(`"${q}" → ${basics.join(', ')} före kedjornas produkter`, () => {
      const list = idsOf(q)
      expect(list.length).toBeGreaterThan(0)
      expect(chainIds.has(list[0]), `${list[0]} är en kedjeprodukt`).toBe(false)
      const firstChain = list.findIndex((id) => chainIds.has(id))
      for (const id of basics) {
        const at = list.indexOf(id)
        expect(at, id).toBeGreaterThanOrEqual(0)
        if (firstChain >= 0) expect(at, `${id} före kedjornas produkter`).toBeLessThan(firstChain)
      }
    })
  }
})
