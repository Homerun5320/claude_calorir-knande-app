/**
 * Dela recept och sparade måltider: rundresa, komprimering och reserv, storleksgränser, skadad
 * och illasinnad data, alias och importen till butiken.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Food, MealTemplate, Recipe } from '../types'
import { builtinFood, loadBuiltinCatalog, type BuiltinCatalog } from './foodRepo'
import { recipePerServing } from './recipes'
import { ALLERGENS_UNKNOWN_TEXT, assessAllergens } from './allergens'
import { mapOffProduct } from './openFoodFacts'
import { useFoodStore } from '../stores/foodStore'
import {
  SHARE_LIMITS,
  buildMealShare,
  buildRecipeShare,
  cleanShareText,
  createShareLink,
  decodeShareParam,
  encodeSharePayload,
  importShare,
  parseShareJson,
  readShareFile,
  SHARE_ERRORS,
  readShareText,
  resolveShare,
  shareBaseUrl,
  shareFileContent,
  shareFileName,
  shareParamFromText,
  toBase64Url,
  type ShareEnvironment,
  type SharePayload,
  type SharedMeal,
} from './shareLink'

const WEB: ShareEnvironment = {
  native: false,
  location: { protocol: 'https:', origin: 'https://lagom.example', pathname: '/' },
  apiBase: '',
}

let catalog: BuiltinCatalog
const lookup = (id: string) => builtinFood(catalog, id)

/** Tecken som inte ska skrivas som \u-escape i källkoden. */
const RLO = String.fromCharCode(0x202e)
const ZWSP = String.fromCharCode(0x200b)
const BEL = String.fromCharCode(7)
const NUL = String.fromCharCode(0)

const custom: Food = {
  id: 'custom:abc',
  name: 'Mammas müsli',
  source: 'custom',
  category: 'spannmal',
  nutrients: { kcal: 400, protein: 10, carbs: 60, fat: 12, fiber: 8 },
  portions: [{ id: 'skal', label: '1 skål', grams: 60 }],
  imageUrl: 'https://bilder.example/hemlig.jpg',
  barcode: '1234567890123',
  note: 'min privata anteckning',
  extra: { ingredientsText: 'hemlig ingredienslista', allergens: ['gluten'] },
  createdAt: 5,
  updatedAt: 6,
}

const off: Food = {
  id: 'off:7310865004703',
  name: 'Havredryck',
  brand: 'Oatly',
  source: 'openfoodfacts',
  category: 'vaxtdryck',
  nutrients: { kcal: 46, protein: 1, carbs: 6.7, fat: 1.5 },
  portions: [],
  liquid: true,
  density: 1.03,
}

function havregryn(): Food {
  const food = lookup('lagom:havregryn')
  if (!food) throw new Error('havregryn saknas i katalogen')
  return food
}

function makeRecipe(): Recipe {
  return {
    id: 'r_1',
    name: 'Frukostskål',
    servings: 2,
    emoji: '🥣',
    tags: ['vegetarisk'],
    prepMinutes: 5,
    instructions: 'Blanda allt.\nÄt direkt.',
    sourceUrl: 'https://recept.example/frukost',
    ingredients: [
      { id: 'i1', food: havregryn(), amount: 2, unit: 'dl', grams: 70 },
      { id: 'i2', food: custom, amount: 1, unit: 'portion:skal', grams: 60 },
      { id: 'i3', food: off, amount: 2, unit: 'dl', grams: 206 },
      { id: 'i4', food: custom, amount: 20, unit: 'g', grams: 20 },
    ],
    createdAt: 1,
    updatedAt: 1,
  }
}

function makeMeal(): MealTemplate {
  return {
    id: 'tpl_1',
    name: 'Min frukost',
    meal: 'frukost',
    items: [
      { food: havregryn(), amount: 1, unit: 'dl', grams: 35 },
      { food: off, amount: 2, unit: 'dl', grams: 206 },
    ],
    createdAt: 1,
  }
}

/** Ett giltigt litet delat innehåll att skada i testerna. */
function validMeal(): SharedMeal {
  return {
    v: 1,
    kind: 'meal',
    name: 'Mellis',
    foods: [{ name: 'Knäckemacka', category: 'brod', nutrients: { kcal: 350, protein: 9 } }],
    items: [{ food: 0, amount: 30, unit: 'g', grams: 30 }],
  }
}

const parse = (obj: unknown) => parseShareJson(JSON.stringify(obj))

beforeAll(async () => {
  // Livsmedelsverkets fil finns inte i testmiljön – katalogen blir Lagoms egna livsmedel.
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'))
  catalog = await loadBuiltinCatalog()
})

beforeEach(() => {
  useFoodStore.setState({ customFoods: {}, recipes: {}, templates: [], cachedFoods: {}, favorites: [], usage: {} })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ---------------------------------------------------------------------------

describe('buildRecipeShare', () => {
  it('delar bara receptet – kurerade livsmedel som hänvisning, egna inbäddade utan privata fält', () => {
    const payload = buildRecipeShare(makeRecipe())
    expect(payload).toMatchObject({ v: 1, kind: 'recipe', name: 'Frukostskål', servings: 2, emoji: '🥣', prepMinutes: 5 })
    // Samma livsmedel två gånger står bara en gång i tabellen.
    expect(payload.foods).toHaveLength(3)
    expect(payload.foods[0]).toEqual({ ref: 'lagom:havregryn', name: 'Havregryn' })
    expect(payload.items.map((i) => i.food)).toEqual([0, 1, 2, 1])
    expect(payload.items[1]).toEqual({ food: 1, amount: 1, unit: 'portion:skal', grams: 60 })
    expect(payload.foods[1]).toEqual({
      name: 'Mammas müsli',
      category: 'spannmal',
      nutrients: { kcal: 400, protein: 10, carbs: 60, fat: 12, fiber: 8 },
      portions: [{ id: 'skal', label: '1 skål', grams: 60 }],
    })
    const json = JSON.stringify(payload)
    for (const secret of ['custom:abc', 'hemlig', 'privata', 'bilder.example', '1234567890123', 'off:', 'createdAt']) {
      expect(json).not.toContain(secret)
    }
  })

  it('delar ett gammalt kurerat id som ersättaren med omräknad mängd', () => {
    const old: Food = { ...havregryn(), id: 'lagom:notfars-5-ra', name: 'Nötfärs 5 %, rå' }
    const recipe: Recipe = { ...makeRecipe(), ingredients: [{ id: 'i1', food: old, amount: 500, unit: 'g', grams: 500 }] }
    const payload = buildRecipeShare(recipe)
    expect(payload.foods[0]).toEqual({ ref: 'lagom:notfars-5-stekt', name: 'Nötfärs 5 %, rå' })
    expect(payload.items[0]).toMatchObject({ amount: 500, unit: 'g-ra' })
  })

  it('delar en portion som inte följer med i gram och hoppar över rader utan vikt', () => {
    const noPortions: Food = { ...custom, portions: [] }
    const recipe: Recipe = {
      ...makeRecipe(),
      ingredients: [
        { id: 'i1', food: noPortions, amount: 2, unit: 'portion:skal', grams: 120 },
        { id: 'i2', food: custom, amount: 0, unit: 'g', grams: 0 },
      ],
    }
    const payload = buildRecipeShare(recipe)
    expect(payload.items).toEqual([{ food: 0, amount: 120, unit: 'g', grams: 120 }])
  })

  it('ger alltid något som mottagarens strikta kontroll godtar – även med konstiga värden', () => {
    const odd: Food = {
      ...custom,
      id: 'custom:konstig',
      name: `  Konstig${BEL}${RLO} vara  `,
      brand: 'x'.repeat(300),
      nutrients: { kcal: 5000, protein: -1, carbs: Number.NaN, fat: 100.9999, vitC: 12.34567 },
      portions: [
        { id: 'ok', label: '', grams: 10 },
        { id: 'dålig id!', label: 'Trasig', grams: 5 },
        { id: 'ok', label: 'Dubblett', grams: 7 },
        { id: 'noll', label: 'Noll', grams: 0 },
      ],
      tags: ['vegan', 'vegan', 'okänd' as never],
      density: 50,
      rawWeight: { factor: 99, kind: 'ra' },
      extra: { allergens: ['gluten', 'gluten', '', 'y'.repeat(100)] },
    }
    const recipe: Recipe = {
      ...makeRecipe(),
      name: `${NUL}${ZWSP}`,
      servings: 0.2,
      prepMinutes: 0.4,
      cookedWeightG: 0.01,
      tags: ['vegan', 'vegan'],
      instructions: `${BEL}\r\n`,
      ingredients: [
        { id: 'a', food: odd, amount: 0.00001, unit: 'portion:ok', grams: 0.00001 },
        { id: 'b', food: odd, amount: 0.0001, unit: 'kg', grams: 0.1 },
        { id: 'c', food: odd, amount: 2, unit: 'portion:dålig id!', grams: 10 },
        { id: 'd', food: odd, amount: 1, unit: 'dl', grams: Number.NaN },
      ],
    }
    const payload = buildRecipeShare(recipe)
    expect(payload.name).toBe('Namnlöst recept')
    expect(payload.servings).toBe(1)
    expect(payload.prepMinutes).toBeUndefined()
    expect(payload.cookedWeightG).toBeUndefined()
    expect(payload.items).toEqual([
      { food: 0, amount: 0.1, unit: 'g', grams: 0.1 },
      { food: 0, amount: 10, unit: 'g', grams: 10 },
      // Vikten räknas fram hos avsändaren; den orimliga densiteten följer inte med, så mängden delas i gram.
      { food: 0, amount: 5000, unit: 'g', grams: 5000 },
    ])
    // Vegansk delas som vegetarisk (märkningar om vad något saknar följer aldrig med).
    expect(payload.foods[0]).toMatchObject({ name: 'Konstig vara', nutrients: { fat: 101, vitC: 12.346 }, portions: [{ id: 'ok', label: 'ok', grams: 10 }], tags: ['vegetarisk'] })
    expect(payload.tags).toEqual(['vegetarisk'])
    expect(payload.foods[0]).not.toHaveProperty('allergens')
    expect(parse(payload)).toEqual({ ok: true, payload })
  })

  it('tar bara med en https-källa och kortar för långa texter', () => {
    const recipe: Recipe = { ...makeRecipe(), name: 'x'.repeat(500), sourceUrl: 'http://osaker.example/recept', emoji: 'inte en emoji' }
    const payload = buildRecipeShare(recipe)
    expect(payload.name).toHaveLength(SHARE_LIMITS.name)
    expect(payload.sourceUrl).toBeUndefined()
    expect(payload.emoji).toBeUndefined()
  })
})

describe('rundresa', () => {
  it('länk → avkodning ger exakt samma recept', async () => {
    const payload = buildRecipeShare(makeRecipe())
    const link = await createShareLink(payload, WEB)
    expect(link.ok).toBe(true)
    if (!link.ok) return
    expect(link.url.startsWith('https://lagom.example/#/dela?d=z.')).toBe(true)
    const param = shareParamFromText(`Här är receptet: ${link.url} – smaklig måltid!`)
    expect(param).toBeDefined()
    const read = await decodeShareParam(param!)
    expect(read).toEqual({ ok: true, payload })
  })

  it('ger samma näring per portion hos mottagaren', async () => {
    const recipe = makeRecipe()
    const encoded = await encodeSharePayload(buildRecipeShare(recipe))
    if (!encoded.ok) throw new Error('kunde inte koda')
    const read = await decodeShareParam(encoded.param)
    if (!read.ok) throw new Error(read.error)
    const resolved = resolveShare(read.payload, { lookup })
    if (resolved.kind !== 'recipe') throw new Error('fel sort')
    expect(resolved.missing).toEqual([])
    expect(resolved.newFoods.map((f) => f.name).sort()).toEqual(['Havredryck', 'Mammas müsli'])
    expect(resolved.recipe.ingredients).toHaveLength(4)
    const before = recipePerServing(recipe)
    const after = recipePerServing(resolved.recipe)
    for (const key of ['kcal', 'protein', 'carbs', 'fat'] as const) expect(after[key]).toBeCloseTo(before[key]!, 1)
    expect(resolved.recipe).toMatchObject({ name: 'Frukostskål', servings: 2, instructions: 'Blanda allt.\nÄt direkt.', sourceUrl: 'https://recept.example/frukost' })
    expect(resolved.recipe.id).toMatch(/^r_/)
    // Nya id:n – inget följer med från avsändaren.
    expect(resolved.recipe.ingredients.every((i) => i.id.startsWith('i_'))).toBe(true)
    expect(resolved.newFoods.every((f) => f.id.startsWith('custom:') && f.source === 'custom')).toBe(true)
  })

  it('fungerar för en sparad måltid', async () => {
    const payload = buildMealShare(makeMeal())
    expect(payload).toMatchObject({ kind: 'meal', name: 'Min frukost', meal: 'frukost' })
    const encoded = await encodeSharePayload(payload)
    if (!encoded.ok) throw new Error('kunde inte koda')
    const read = await decodeShareParam(encoded.param)
    expect(read).toEqual({ ok: true, payload })
  })

  it('fil → inläsning ger samma innehåll', async () => {
    const payload = buildRecipeShare(makeRecipe())
    const file = new File([shareFileContent(payload)], shareFileName(payload.name), { type: 'application/json' })
    expect(file.name).toBe('Frukostskål.lagom.json')
    expect(await readShareFile(file)).toEqual({ ok: true, payload })
  })

  it('läser inklistrad JSON och säger till om text som inte är något delat', async () => {
    const payload = buildMealShare(makeMeal())
    expect(await readShareText(shareFileContent(payload))).toEqual({ ok: true, payload })
    expect(await readShareText('')).toEqual({ ok: false, error: 'empty' })
    expect(await readShareText('kladdkaka med grädde')).toEqual({ ok: false, error: 'notShare' })
  })

  it('ger filnamn utan tecken som filsystem inte tål', () => {
    expect(shareFileName('Mormors "bästa" gröt/2')).toBe('Mormors bästa gröt2.lagom.json')
    expect(shareFileName('...')).toBe('recept.lagom.json')
  })
})

describe('komprimering och reserv', () => {
  it('komprimerar med deflate-raw när det blir kortare', async () => {
    const payload = buildRecipeShare(makeRecipe())
    const packed = await encodeSharePayload(payload)
    if (!packed.ok) throw new Error('kunde inte koda')
    expect(packed.compressed).toBe(true)
    expect(packed.param.startsWith('z.')).toBe(true)
    const plain = `j.${toBase64Url(new TextEncoder().encode(JSON.stringify(payload)))}`
    expect(packed.param.length).toBeLessThan(plain.length)
  })

  it('delar okomprimerat när webbläsaren saknar CompressionStream', async () => {
    vi.stubGlobal('CompressionStream', undefined)
    vi.stubGlobal('DecompressionStream', undefined)
    const payload = buildRecipeShare(makeRecipe())
    const encoded = await encodeSharePayload(payload)
    if (!encoded.ok) throw new Error('kunde inte koda')
    expect(encoded.compressed).toBe(false)
    expect(encoded.param.startsWith('j.')).toBe(true)
    expect(await decodeShareParam(encoded.param)).toEqual({ ok: true, payload })
  })

  it('säger till när en komprimerad länk inte kan packas upp här', async () => {
    const encoded = await encodeSharePayload(buildRecipeShare(makeRecipe()))
    if (!encoded.ok) throw new Error('kunde inte koda')
    vi.stubGlobal('DecompressionStream', undefined)
    expect(await decodeShareParam(encoded.param)).toEqual({ ok: false, error: 'unsupported' })
  })
})

describe('storleksgränser', () => {
  function bigRecipe(): Recipe {
    const full = Object.fromEntries(
      ['kcal', 'protein', 'carbs', 'sugars', 'fiber', 'fat', 'satFat', 'monoFat', 'polyFat', 'salt', 'vitC', 'calcium', 'iron', 'potassium', 'sodium'].map((k, i) => [k, 1.234 + i]),
    )
    const ingredients = Array.from({ length: 100 }, (_, i) => ({
      id: `i${i}`,
      food: { ...custom, id: `custom:${i}`, name: `Ett ganska långt namn på ingrediens nummer ${i}`, nutrients: full },
      amount: 10 + i,
      unit: 'g' as const,
      grams: 10 + i,
    }))
    return { ...makeRecipe(), ingredients, instructions: 'Rör om. '.repeat(1200) }
  }

  it('säger att ett för stort recept ska delas som fil – och filen fungerar', async () => {
    const payload = buildRecipeShare(bigRecipe())
    expect(await createShareLink(payload, WEB)).toEqual({ ok: false, error: 'tooLarge' })
    const file = new File([shareFileContent(payload)], 'stort.lagom.json')
    expect(await readShareFile(file)).toEqual({ ok: true, payload })
  })

  it('stoppar för långa länkar och för stora filer', async () => {
    expect(await decodeShareParam(`j.${'A'.repeat(SHARE_LIMITS.paramChars)}`)).toEqual({ ok: false, error: 'tooLarge' })
    const big = `j.${toBase64Url(new TextEncoder().encode(JSON.stringify({ ...validMeal(), name: 'x'.repeat(40_000) })))}`
    expect(await decodeShareParam(big)).toEqual({ ok: false, error: 'tooLarge' })
    const file = new File(['{', ' '.repeat(SHARE_LIMITS.fileBytes), '}'], 'stor.lagom.json')
    expect(await readShareFile(file)).toEqual({ ok: false, error: 'tooLarge' })
  })

  it('en trasig fil får ett fel om filen – inte om en länk', async () => {
    const payload = buildMealShare(makeMeal())
    const truncated = new File([shareFileContent(payload).slice(0, 40)], 'trasig.lagom.json')
    expect(await readShareFile(truncated)).toEqual({ ok: false, error: 'corruptFile' })
    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], 'bild.png')
    expect(await readShareFile(png)).toEqual({ ok: false, error: 'corruptFile' })
    expect(SHARE_ERRORS.corruptFile).toMatch(/^Filen/)
    // Giltig JSON med ett okänt fält är fortfarande "gick inte att läsa in".
    const unknownField = new File([JSON.stringify({ ...payload, extra: 1 })], 'x.lagom.json')
    expect(await readShareFile(unknownField)).toEqual({ ok: false, error: 'invalid' })
  })

  it('packar inte upp en "zip-bomb" längre än gränsen', async () => {
    // 4 MB mellanslag komprimeras till några kB men skulle packas upp till 4 MB.
    const cs = new CompressionStream('deflate-raw')
    const writer = cs.writable.getWriter()
    void writer.write(new Uint8Array(4 * 1024 * 1024).fill(32)).then(() => writer.close())
    const chunks: number[] = []
    const reader = cs.readable.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(...value)
    }
    const param = `z.${toBase64Url(new Uint8Array(chunks))}`
    expect(param.length).toBeLessThan(SHARE_LIMITS.paramChars)
    expect(await decodeShareParam(param)).toEqual({ ok: false, error: 'tooLarge' })
  })
})

describe('skadad eller illasinnad data', () => {
  it('godtar det giltiga grundexemplet', () => {
    expect(parse(validMeal())).toEqual({ ok: true, payload: validMeal() })
  })

  it.each<[string, (m: SharedMeal) => unknown]>([
    ['okänt fält överst', (m) => ({ ...m, evil: true })],
    ['okänt fält i ett livsmedel', (m) => ({ ...m, foods: [{ ...m.foods[0], id: 'custom:x' }] })],
    ['okänt näringsämne', (m) => ({ ...m, foods: [{ ...m.foods[0], nutrients: { kcal: 1, gift: 3 } }] })],
    ['negativ energi', (m) => ({ ...m, foods: [{ ...m.foods[0], nutrients: { kcal: -5 } }] })],
    ['orimlig energi', (m) => ({ ...m, foods: [{ ...m.foods[0], nutrients: { kcal: 5000 } }] })],
    ['tal som text', (m) => ({ ...m, foods: [{ ...m.foods[0], nutrients: { kcal: '100' } }] })],
    ['okänd kategori', (m) => ({ ...m, foods: [{ ...m.foods[0], category: 'gift' }] })],
    ['för långt namn', (m) => ({ ...m, name: 'x'.repeat(SHARE_LIMITS.name + 1) })],
    ['tomt namn', (m) => ({ ...m, name: '   ' })],
    ['namn som inte är text', (m) => ({ ...m, name: { toString: 'x' } })],
    ['index utanför tabellen', (m) => ({ ...m, items: [{ ...m.items[0], food: 3 }] })],
    ['livsmedel som inte används', (m) => ({ ...m, foods: [...m.foods, { name: 'Smygis', category: 'ovrigt', nutrients: {} }] })],
    ['för många rader', (m) => ({ ...m, items: Array.from({ length: SHARE_LIMITS.items + 1 }, () => m.items[0]) })],
    ['noll gram', (m) => ({ ...m, items: [{ ...m.items[0], grams: 0 }] })],
    ['orimlig mängd', (m) => ({ ...m, items: [{ ...m.items[0], amount: 1e9 }] })],
    ['okänd enhet', (m) => ({ ...m, items: [{ ...m.items[0], unit: 'ton' }] })],
    ['portion med skräp i id', (m) => ({ ...m, items: [{ ...m.items[0], unit: 'portion:<script>' }] })],
    ['felaktig hänvisning', (m) => ({ ...m, foods: [{ ref: 'lagom:../../hemligt', name: 'x' }] })],
    ['hänvisning till eget livsmedel', (m) => ({ ...m, foods: [{ ref: 'custom:abc', name: 'x' }] })],
    ['hänvisning med egna värden', (m) => ({ ...m, foods: [{ ref: 'lagom:havregryn', name: 'x', nutrients: { kcal: 900 } }] })],
    ['okänd måltid', (m) => ({ ...m, meal: 'nattamat' })],
    ['fel version som text', (m) => ({ ...m, v: '1' })],
    ['lista i stället för objekt', (m) => ({ ...m, foods: [[1, 2, 3]] })],
  ])('avvisar %s', (_label, mutate) => {
    expect(parse(mutate(validMeal()))).toEqual({ ok: false, error: 'invalid' })
  })

  it('avvisar __proto__ och andra försök att ändra prototypen', () => {
    const json = JSON.stringify(validMeal()).replace('"name":"Mellis"', '"name":"Mellis","__proto__":{"admin":true}')
    expect(parseShareJson(json)).toEqual({ ok: false, error: 'invalid' })
    expect(({} as Record<string, unknown>).admin).toBeUndefined()
  })

  it.each<[string, unknown]>([
    ['javascript:', 'javascript:alert(1)'],
    ['http', 'http://osaker.example/'],
    ['data:', 'data:text/html,hej'],
    ['inbyggda inloggningsuppgifter', 'https://anvandare:losen@recept.example/'],
  ])('avvisar en källänk med %s', (_label, sourceUrl) => {
    const recipe = { ...validMeal(), kind: 'recipe', servings: 2, sourceUrl }
    delete (recipe as { meal?: unknown }).meal
    expect(parse(recipe)).toEqual({ ok: false, error: 'invalid' })
  })

  it('känner igen säkerhetskopior, nyare versioner och annat', () => {
    expect(parse({ format: 'lagom-backup', version: 1, data: {} })).toEqual({ ok: false, error: 'backup' })
    expect(parse({ ...validMeal(), v: 2 })).toEqual({ ok: false, error: 'newer' })
    expect(parse([1, 2, 3])).toEqual({ ok: false, error: 'notShare' })
    expect(parse({ ...validMeal(), kind: 'diary' })).toEqual({ ok: false, error: 'notShare' })
    expect(parseShareJson('inte json')).toEqual({ ok: false, error: 'corrupt' })
  })

  it('säger att en skadad länk är skadad', async () => {
    const encoded = await encodeSharePayload(buildRecipeShare(makeRecipe()))
    if (!encoded.ok) throw new Error('kunde inte koda')
    expect(await decodeShareParam(encoded.param.slice(0, -20))).toEqual({ ok: false, error: 'corrupt' })
    expect(await decodeShareParam('z.AAAAAAAAAAAA')).toEqual({ ok: false, error: 'corrupt' })
    expect(await decodeShareParam('z.!!!')).toEqual({ ok: false, error: 'corrupt' })
    expect(await decodeShareParam('x.abc')).toEqual({ ok: false, error: 'corrupt' })
    // Ogiltig UTF-8.
    expect(await decodeShareParam(`j.${toBase64Url(new Uint8Array([0xff, 0xfe, 0xfd]))}`)).toEqual({ ok: false, error: 'corrupt' })
  })

  it('städar bort styrtecken och osynliga riktningstecken', () => {
    const meal = { ...validMeal(), name: `Kladd${RLO}kaka${NUL}`, foods: [{ ...validMeal().foods[0], name: `Knäcke${ZWSP}${BEL}macka` }] }
    const read = parse(meal)
    expect(read.ok).toBe(true)
    if (!read.ok) return
    expect(read.payload.name).toBe('Kladdkaka')
    expect(read.payload.foods[0].name).toBe('Knäcke macka')
    expect(cleanShareText(`Steg 1\r\n\r\n\r\n\r\nSteg 2${BEL}`, true)).toBe('Steg 1\n\nSteg 2')
  })
})

describe('alias och livsmedel hos mottagaren', () => {
  it('följer alias till ersättaren och räknar om mängden', () => {
    const payload: SharePayload = {
      ...validMeal(),
      foods: [{ ref: 'lagom:notfars-5-ra', name: 'Nötfärs, rå' }],
      items: [{ food: 0, amount: 500, unit: 'g', grams: 500 }],
    }
    const resolved = resolveShare(payload, { lookup })
    if (resolved.kind !== 'meal') throw new Error('fel sort')
    const item = resolved.template.items[0]
    const stekt = lookup('lagom:notfars-5-stekt')!
    expect(item.food.id).toBe('lagom:notfars-5-stekt')
    expect(item.unit).toBe('g-ra')
    expect(item.amount).toBe(500)
    expect(item.grams).toBeCloseTo(500 * stekt.rawWeight!.factor, 1)
    expect(resolved.newFoods).toEqual([])
  })

  it('räknar i gram när mottagarens livsmedel saknar portionen', () => {
    const payload: SharePayload = {
      ...validMeal(),
      foods: [{ ref: 'lagom:havregryn', name: 'Havregryn' }],
      items: [{ food: 0, amount: 2, unit: 'portion:finns-inte', grams: 80 }],
    }
    const resolved = resolveShare(payload, { lookup })
    if (resolved.kind !== 'meal') throw new Error('fel sort')
    expect(resolved.template.items[0]).toMatchObject({ amount: 80, unit: 'g', grams: 80 })
  })

  it('använder mottagarens eget Livsmedelsverket-livsmedel när det finns', () => {
    const lmvFood: Food = { id: 'lmv:123', name: 'Mjölk 3 %', source: 'livsmedelsverket', category: 'mejeri', nutrients: { kcal: 60 }, portions: [], lmvNumber: 123 }
    const payload: SharePayload = {
      ...validMeal(),
      foods: [{ name: 'Mjölk 3 %', category: 'mejeri', nutrients: { kcal: 60 }, lmv: 123 }],
    }
    const resolved = resolveShare(payload, { lookup: (id) => (id === 'lmv:123' ? lmvFood : undefined) })
    if (resolved.kind !== 'meal') throw new Error('fel sort')
    expect(resolved.template.items[0].food).toBe(lmvFood)
    expect(resolved.newFoods).toEqual([])
  })

  it('räknar upp Lagom-livsmedel som saknas i den här versionen – och sparar då ingenting', () => {
    const payload: SharePayload = { ...validMeal(), foods: [{ ref: 'lagom:framtidens-bulle', name: 'Framtidens bulle' }] }
    const resolved = resolveShare(payload, { lookup })
    expect(resolved.missing).toEqual(['Framtidens bulle'])
    expect(importShare(payload, lookup)).toBeNull()
    expect(useFoodStore.getState().templates).toEqual([])
  })
})

describe('allergener och märkningar i delat innehåll', () => {
  const chocolate = () =>
    mapOffProduct({
      code: '7310000000001',
      product_name: 'Chokladkaka',
      nutriments: { 'energy-kcal_100g': 530, proteins_100g: 7, carbohydrates_100g: 55, fat_100g: 30 },
      allergens_tags: ['en:milk'],
      traces_tags: ['en:nuts'],
      labels_tags: ['en:gluten-free'],
      ingredients_text_sv: 'socker, kakaosmör, mjölkpulver',
    })!

  it('en produkt med spår av nötter säger aldrig "anger inget" hos mottagaren', () => {
    const product = chocolate()
    // Hos avsändaren: spåren flaggas.
    expect(assessAllergens(product, ['notter']).flags.map((f) => f.text)).toEqual(['Kan innehålla spår av nötter – som du har markerat'])
    const template: MealTemplate = { id: 'tpl_x', name: 'Fika', items: [{ food: product, amount: 50, unit: 'g', grams: 50 }], createdAt: 1 }
    const payload = buildMealShare(template)
    expect(JSON.stringify(payload)).not.toMatch(/allergen|mjölk|notter|nötter|glutenfri/i)
    const read = parse(payload)
    if (!read.ok) throw new Error('kunde inte läsas')
    const received = resolveShare(read.payload, { lookup: () => undefined }).newFoods[0]
    expect(received.source).toBe('custom')
    expect(received.extra).toBeUndefined()
    expect(received.tags ?? []).not.toContain('glutenfri')
    const a = assessAllergens(received, ['notter'])
    expect(a.flags).toEqual([])
    expect(a.note).toBe(ALLERGENS_UNKNOWN_TEXT)
  })

  it('en ändrad länk kan inte smyga in allergener eller "fri från"-märkningar', () => {
    const payload = buildMealShare({ id: 'tpl_x', name: 'Fika', items: [{ food: chocolate(), amount: 50, unit: 'g', grams: 50 }], createdAt: 1 })
    const withAllergens = { ...payload, foods: [{ ...payload.foods[0], allergens: ['xyz'] }] }
    expect(parseShareJson(JSON.stringify(withAllergens))).toEqual({ ok: false, error: 'invalid' })
    const tagged = { ...payload, foods: [{ ...payload.foods[0], tags: ['glutenfri', 'laktosfri', 'vegan', 'ekologisk'] }] }
    const read = parseShareJson(JSON.stringify(tagged))
    if (!read.ok) throw new Error('kunde inte läsas')
    expect((read.payload.foods[0] as { tags?: string[] }).tags).toEqual(['vegetarisk', 'ekologisk'])
    const recipe = { ...buildRecipeShare(makeRecipe()), tags: ['glutenfri', 'laktosfri', 'klassiker'] }
    const readRecipe = parseShareJson(JSON.stringify(recipe))
    if (!readRecipe.ok || readRecipe.payload.kind !== 'recipe') throw new Error('kunde inte läsas')
    expect(readRecipe.payload.tags).toEqual(['klassiker'])
    const resolved = resolveShare(readRecipe.payload, { lookup })
    if (resolved.kind !== 'recipe') throw new Error('fel sort')
    expect(resolved.recipe.tags).toEqual(['klassiker'])
  })
})

describe('importShare', () => {
  it('sparar receptet och de egna livsmedel som följer med', () => {
    const result = importShare(buildRecipeShare(makeRecipe()), lookup)
    expect(result).toMatchObject({ kind: 'recipe', name: 'Frukostskål', newFoods: 2 })
    const state = useFoodStore.getState()
    const recipe = state.recipes[result!.id]
    expect(recipe.name).toBe('Frukostskål')
    const customIds = Object.keys(state.customFoods)
    expect(customIds).toHaveLength(2)
    // Ingredienserna pekar på de nya egna livsmedlen.
    expect(recipe.ingredients[1].food.id).toBe(recipe.ingredients[3].food.id)
    expect(customIds).toContain(recipe.ingredients[1].food.id)
    // Allergener följer aldrig med – hos mottagaren saknas uppgifterna.
    expect(state.customFoods[recipe.ingredients[1].food.id].extra).toBeUndefined()
  })

  it('skapar inga dubbletter när samma recept importeras igen', () => {
    const payload = buildRecipeShare(makeRecipe())
    importShare(payload, lookup)
    const second = importShare(payload, lookup)
    expect(second?.newFoods).toBe(0)
    const state = useFoodStore.getState()
    expect(Object.keys(state.customFoods)).toHaveLength(2)
    expect(Object.keys(state.recipes)).toHaveLength(2)
  })

  it('återanvänder ett eget livsmedel med samma namn och värden', () => {
    useFoodStore.setState({ customFoods: { 'custom:min': { ...custom, id: 'custom:min', name: 'mammas MÜSLI ' } } })
    const result = importShare(buildRecipeShare(makeRecipe()), lookup)
    expect(result?.newFoods).toBe(1)
    const recipe = useFoodStore.getState().recipes[result!.id]
    expect(recipe.ingredients[1].food.id).toBe('custom:min')
  })

  it('sparar en delad måltid bland de sparade måltiderna', () => {
    const result = importShare(buildMealShare(makeMeal()), lookup)
    expect(result).toMatchObject({ kind: 'meal', name: 'Min frukost', newFoods: 1 })
    const [template] = useFoodStore.getState().templates
    expect(template.id).toBe(result!.id)
    expect(template.id).toMatch(/^tpl_/)
    expect(template.meal).toBe('frukost')
    expect(template.items.map((i) => i.food.name)).toEqual(['Havregryn', 'Havredryck'])
  })
})

describe('shareBaseUrl', () => {
  it('använder sidan man är på i webbläsaren', () => {
    expect(shareBaseUrl(WEB)).toBe('https://lagom.example/')
    expect(shareBaseUrl({ native: false, location: { protocol: 'http:', origin: 'http://localhost:5173', pathname: '/index.html' }, apiBase: '' })).toBe(
      'http://localhost:5173/index.html',
    )
  })

  it('använder webbplatsens riktiga adress i apparna – eller ingen länk alls', () => {
    const app = { protocol: 'capacitor:', origin: 'capacitor://localhost', pathname: '/' }
    expect(shareBaseUrl({ native: true, location: app, apiBase: 'https://lagom.example/' })).toBe('https://lagom.example/')
    expect(shareBaseUrl({ native: true, location: app, apiBase: '' })).toBeNull()
    expect(shareBaseUrl({ native: true, location: app, apiBase: 'http://osaker.example' })).toBeNull()
    expect(shareBaseUrl({ native: false, location: { protocol: 'file:', origin: 'null', pathname: '/x' }, apiBase: '' })).toBeNull()
  })

  it('säger till när appen saknar webbplatsens adress', async () => {
    const link = await createShareLink(buildMealShare(makeMeal()), { native: true, apiBase: '' })
    expect(link).toEqual({ ok: false, error: 'noSite' })
  })
})
