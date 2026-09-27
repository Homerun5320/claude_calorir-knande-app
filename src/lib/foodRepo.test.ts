/**
 * Livsmedelsregistret: de inbyggda klassikerna ('recipe:klassiker-*') ska gå att slå upp som
 * livsmedel – annars försvinner en loggad klassiker från Senaste, favoriter och detaljsidan.
 * Kurerade livsmedel som länkar till Livsmedelsverket (`lmvNumber`) berikas med de officiella
 * värdena, och Livsmedelsverkets dubblett döljs i sökningen men går att slå upp på id.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Food } from '../types'
import { enrichCuratedFoods, enrichFood, getFoodById, loadBuiltinCatalog, recipeFood, resolveFoodSync, type BuiltinCatalog } from './foodRepo'
import { NUTRIENT_KEYS, type NutrientKey } from './nutrients'
import { recipeFoodId } from './recipes'
import { createSearchIndex, searchFoods } from './search'
import { BUILTIN_FOODS } from '../data/foods/index'

let catalog: BuiltinCatalog

beforeAll(async () => {
  // Livsmedelsverkets fil finns inte i testmiljön.
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'))
  catalog = await loadBuiltinCatalog()
})

describe('inbyggda recept i registret', () => {
  it('läser in klassikerna tillsammans med livsmedlen', () => {
    expect(catalog.error).toBeUndefined()
    expect(catalog.recipes.length).toBeGreaterThan(20)
    expect(catalog.recipes.every((r) => r.builtin && r.id.startsWith('klassiker-'))).toBe(true)
    expect(catalog.recipeFoods).toHaveLength(catalog.recipes.length)
  })

  it('slår upp en klassiker på livsmedels-id – samma objekt som när den loggas', () => {
    const kottbullar = catalog.recipes.find((r) => r.id === 'klassiker-kottbullar')
    expect(kottbullar).toBeDefined()
    const id = recipeFoodId('klassiker-kottbullar')
    const food = catalog.byId.get(id)
    expect(food).toMatchObject({ id: 'recipe:klassiker-kottbullar', name: 'Köttbullar', source: 'recipe', category: 'fardigratt' })
    expect(food).toBe(recipeFood(kottbullar!))
    expect(resolveFoodSync(id)).toBe(food)
    expect(food?.portions[0]).toMatchObject({ id: 'portion' })
    expect(food?.nutrients.kcal).toBeGreaterThan(0)
  })

  it('hittar klassikerna asynkront och låter livsmedelslistan vara orörd', async () => {
    await expect(getFoodById('recipe:klassiker-pannkakor')).resolves.toMatchObject({ name: 'Pannkakor', source: 'recipe' })
    await expect(getFoodById('recipe:klassiker-finns-inte')).resolves.toBeUndefined()
    // Databasens livsmedelslista (t.ex. antal i Inställningar) innehåller bara livsmedel.
    expect(catalog.foods.some((f) => f.source === 'recipe')).toBe(false)
  })

  it('ger samma recept i båda stegen av inläsningen', async () => {
    const again = await loadBuiltinCatalog()
    expect(again.recipes).toBe(catalog.recipes)
    expect(again.recipeFoods).toBe(catalog.recipeFoods)
  })
})

describe('utan Livsmedelsverkets fil (offline)', () => {
  it('visar Lagoms egna livsmedel oförändrade och går att söka i', () => {
    expect(catalog.complete).toBe(true)
    expect(catalog.lmv).toBeNull()
    expect(catalog.foods).toBe(BUILTIN_FOODS)
    expect(catalog.byId.get('lagom:kanelbulle-bageri')).toBe(BUILTIN_FOODS.find((f) => f.id === 'lagom:kanelbulle-bageri'))
    const hits = searchFoods(createSearchIndex(catalog.foods), 'kanelbulle')
    expect(hits[0]?.food.source).toBe('lagom')
  })
})

// ---------------------------------------------------------------------------
// Berikning (rena funktioner)
// ---------------------------------------------------------------------------

const food = (id: string, nutrients: Food['nutrients'], extra: Partial<Food> = {}): Food => ({
  id,
  name: id,
  source: 'lagom',
  category: 'ovrigt',
  nutrients,
  portions: [],
  ...extra,
})

describe('enrichFood', () => {
  const lmv = food('lmv:150', { kcal: 46, protein: 3.5, carbs: 4.8, sugars: 4.8, fat: 1.5, satFat: 0.9, vitD: 1, calcium: 120, iodine: 15 }, { source: 'livsmedelsverket', lmvNumber: 150 })

  it('fyller i saknade näringsämnen men skriver aldrig över definierade', () => {
    const curated = food('lagom:mjolk', { kcal: 45, protein: 3.4, carbs: 4.9, fat: 1.5, vitD: 0.9 }, { lmvNumber: 150 })
    const before = structuredClone(curated)
    const enriched = enrichFood(curated, lmv)
    expect(enriched).not.toBe(curated)
    expect(enriched.nutrients).toEqual({ kcal: 45, protein: 3.4, carbs: 4.9, fat: 1.5, vitD: 0.9, sugars: 4.8, satFat: 0.9, calcium: 120, iodine: 15 })
    expect(enriched).toMatchObject({ id: 'lagom:mjolk', source: 'lagom', lmvNumber: 150 })
    // Originalet ändras inte.
    expect(curated).toEqual(before)
  })

  it('ger samma objekt när inget saknas eller länken saknas', () => {
    const full = food('lagom:full', { ...lmv.nutrients }, { lmvNumber: 150 })
    expect(enrichFood(full, lmv)).toBe(full)
    const unlinked = food('lagom:x', { kcal: 1 })
    expect(enrichFood(unlinked, undefined)).toBe(unlinked)
  })

  it('håller ifyllda delvärden förenliga med det kurerade livsmedlets egna', () => {
    const source = food('lmv:9', { sugars: 12, addedSugar: 11, satFat: 20, monoFat: 10, polyFat: 6, omega3: 2, salt: 1.2, sodium: 480 }, { source: 'livsmedelsverket', lmvNumber: 9 })
    // Märkesvara med egna (lägre) värden för kolhydrater, fett och natrium.
    const curated = food('lagom:marke', { kcal: 300, protein: 5, carbs: 10, fat: 24, satFat: 12, sodium: 100 }, { lmvNumber: 9 })
    const n = enrichFood(curated, source).nutrients
    expect(n.sugars).toBe(10)
    expect(n.addedSugar).toBe(10)
    expect(n.satFat).toBe(12)
    expect((n.monoFat ?? 0) + (n.polyFat ?? 0) + (n.satFat ?? 0)).toBeLessThanOrEqual(24.01)
    expect(n.monoFat).toBeCloseTo(7.5, 1)
    expect(n.polyFat).toBeCloseTo(4.5, 1)
    expect(n.omega3).toBe(2)
    // Salt följer det egna natriumvärdet, inte Livsmedelsverkets.
    expect(n.sodium).toBe(100)
    expect(n.salt).toBe(0.25)
  })
})

describe('enrichCuratedFoods', () => {
  const lmvFoods = [food('lmv:1', { kcal: 884, fat: 100, vitA: 31 }, { source: 'livsmedelsverket', lmvNumber: 1 })]
  const curated = [food('lagom:talg', { kcal: 880, protein: 0, carbs: 0, fat: 100 }, { lmvNumber: 1 }), food('lagom:annat', { kcal: 10 })]

  it('är memoiserad och lämnar indata orörda', () => {
    const a = enrichCuratedFoods(curated, lmvFoods)
    expect(enrichCuratedFoods(curated, lmvFoods)).toBe(a)
    expect(a).not.toBe(curated)
    expect(a[0].nutrients.vitA).toBe(31)
    expect(curated[0].nutrients.vitA).toBeUndefined()
    // Olänkade livsmedel är samma objekt.
    expect(a[1]).toBe(curated[1])
  })

  it('returnerar listan oförändrad utan Livsmedelsverkets data', () => {
    expect(enrichCuratedFoods(curated, [])).toBe(curated)
  })
})

// ---------------------------------------------------------------------------
// Hela katalogen med Livsmedelsverkets riktiga datafil
// ---------------------------------------------------------------------------

/** Node-moduler importeras dynamiskt och löst typat (appens tsconfig saknar Node-typer med avsikt). */
type Loose = any
const nodeModule = (name: string): Promise<Loose> => import(/* @vite-ignore */ name)

describe('med Livsmedelsverkets datafil', () => {
  let full: BuiltinCatalog
  let repo: typeof import('./foodRepo')
  /** Lagoms livsmedel ur samma modulinstans som `repo`. */
  let builtin: Food[]
  let publishes = 0
  const linked = new Map<number, Food[]>()

  beforeAll(async () => {
    const { readFile } = await nodeModule('node:fs/promises')
    const { cwd } = await nodeModule('node:process')
    const { join } = await nodeModule('node:path')
    const text: string = await readFile(join(cwd(), 'public', 'data', 'livsmedelsverket.json'), 'utf8')
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(text, { status: 200, headers: { 'Content-Type': 'application/json' } }))
    // Ny modulinstans: katalogen ovan lästes in offline.
    vi.resetModules()
    repo = await import('./foodRepo')
    builtin = (await import('../data/foods/index')).BUILTIN_FOODS
    for (const f of builtin) if (f.lmvNumber !== undefined) linked.set(f.lmvNumber, [...(linked.get(f.lmvNumber) ?? []), f])
    repo.subscribeBuiltinCatalog(() => publishes++)
    full = await repo.loadBuiltinCatalog()
  })

  afterAll(() => {
    vi.mocked(globalThis.fetch).mockRejectedValue(new TypeError('offline'))
  })

  it('läser in hela databasen och publicerar katalogen en gång, komplett', () => {
    expect(full.complete).toBe(true)
    expect(full.error).toBeUndefined()
    expect(full.lmv?.count).toBe(2606)
    expect(publishes).toBe(1)
  })

  it('har länkar till livsmedel som finns i databasen', () => {
    expect(linked.size).toBeGreaterThan(500)
    const missing = [...linked.keys()].filter((n) => !full.byId.has(`lmv:${n}`))
    expect(missing).toEqual([])
  })

  it('fyller i varje saknat näringsämne från det länkade livsmedlet och behåller Lagoms egna värden', () => {
    let filled = 0
    const problems: string[] = []
    for (const original of builtin) {
      const enriched = full.byId.get(original.id)!
      expect(enriched.id).toBe(original.id)
      if (original.lmvNumber === undefined) {
        expect(enriched).toBe(original)
        continue
      }
      const source = full.byId.get(`lmv:${original.lmvNumber}`)!
      for (const key of NUTRIENT_KEYS) {
        const own = original.nutrients[key]
        if (own !== undefined) {
          if (enriched.nutrients[key] !== own) problems.push(`${original.id}: ${key} skrevs över`)
        } else if (source.nutrients[key] !== undefined) {
          if (enriched.nutrients[key] === undefined) problems.push(`${original.id}: ${key} fylldes inte i`)
          else filled++
        }
      }
      // Portioner, synonymer och namn är Lagoms.
      expect(enriched.portions).toBe(original.portions)
      expect(enriched.name).toBe(original.name)
    }
    expect(problems).toEqual([])
    expect(filled).toBeGreaterThan(5000)
  })

  it('ger berikade livsmedel med rimliga och förenliga värden', () => {
    const bad: string[] = []
    for (const f of full.foods) {
      if (f.source !== 'lagom') continue
      const n = f.nutrients
      if (n.sugars !== undefined && n.carbs !== undefined && n.sugars > n.carbs + 0.6) bad.push(`${f.id}: socker > kolhydrater`)
      if (n.addedSugar !== undefined && n.sugars !== undefined && n.addedSugar > n.sugars + 0.6) bad.push(`${f.id}: tillsatt socker > socker`)
      const fa = (n.satFat ?? 0) + (n.monoFat ?? 0) + (n.polyFat ?? 0)
      if (n.fat !== undefined && fa > n.fat + 0.6) bad.push(`${f.id}: fettsyror ${fa.toFixed(1)} > fett ${n.fat}`)
      if (n.omega3 !== undefined && n.polyFat !== undefined && n.omega3 > n.polyFat + 0.3) bad.push(`${f.id}: omega-3 > fleromättat`)
      if (n.salt !== undefined && n.sodium !== undefined && Math.abs(n.salt - (n.sodium * 2.5) / 1000) > 0.05) bad.push(`${f.id}: salt och natrium stämmer inte`)
    }
    expect(bad).toEqual([])
  })

  it('visar ett berikat länkat livsmedel med vitaminer och mineraler', () => {
    const milk = builtin.find((f) => f.lmvNumber !== undefined && /mellanmjölk/i.test(f.name))
    expect(milk).toBeDefined()
    const enriched = full.byId.get(milk!.id)!
    const micro: NutrientKey[] = ['vitA', 'vitD', 'riboflavin', 'vitB12', 'calcium', 'iodine', 'selenium', 'zinc']
    expect(micro.filter((k) => enriched.nutrients[k] === undefined)).toEqual([])
  })

  it('döljer länkade Livsmedelsverket-livsmedel i listan men slår upp dem på id', async () => {
    const hidden = full.foods.filter((f) => f.source === 'livsmedelsverket' && f.lmvNumber !== undefined && linked.has(f.lmvNumber))
    expect(hidden).toEqual([])
    const lmvInList = full.foods.filter((f) => f.source === 'livsmedelsverket').length
    expect(lmvInList).toBe(2606 - linked.size)
    expect(full.foods.length).toBe(builtin.length + lmvInList)
    expect(new Set(full.foods.map((f) => f.id)).size).toBe(full.foods.length)
    // Gamla dagboksposter och favoriter med 'lmv:'-id fungerar.
    const [someNumber] = linked.keys()
    const byId = await repo.getFoodById(`lmv:${someNumber}`)
    expect(byId).toMatchObject({ id: `lmv:${someNumber}`, source: 'livsmedelsverket' })
    expect(repo.resolveFoodSync(`lmv:${someNumber}`)).toBe(byId)
    // Livsmedel som bara finns hos Livsmedelsverket är sökbara.
    expect(full.foods.some((f) => f.id === 'lmv:1' && f.name === 'Nöt talg')).toBe(linked.has(1) ? false : true)
  })

  it('ger inga dubbletter i sökningen för länkade livsmedel', () => {
    const index = createSearchIndex(full.foods)
    for (const q of ['mellanmjölk', 'kanelbulle', 'falukorv', 'potatis kokt', 'nötfärs', 'lax']) {
      const hits = searchFoods(index, q, { limit: 50 })
      expect(hits.length, q).toBeGreaterThan(0)
      const numbers = hits.map((h) => h.food.lmvNumber).filter((n): n is number => n !== undefined)
      const lmvHits = hits.filter((h) => h.food.source === 'livsmedelsverket' && linked.has(h.food.lmvNumber!))
      expect(lmvHits.map((h) => h.food.id), q).toEqual([])
      // Samma livsmedelsnummer förekommer bara hos kurerade livsmedel som delar länk medvetet.
      const dup = numbers.filter((n, i) => numbers.indexOf(n) !== i && (linked.get(n)?.length ?? 0) <= 1)
      expect(dup, q).toEqual([])
    }
    const talg = searchFoods(index, 'nöt talg')
    expect(talg.some((h) => h.food.id === 'lmv:1')).toBe(true)
  })

  it('räknar klassikerna på de berikade livsmedlen', () => {
    const kottbullar = full.recipes.find((r) => r.id === 'klassiker-kottbullar')!
    for (const ing of kottbullar.ingredients) expect(ing.food).toBe(full.byId.get(ing.food.id))
    expect(full.byId.get(recipeFoodId('klassiker-kottbullar'))).toBe(repo.recipeFood(kottbullar))
    expect(full.recipeFoods).toHaveLength(full.recipes.length)
  })
})
