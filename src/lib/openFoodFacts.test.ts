/**
 * Tester för Open Food Facts-klienten med realistiska JSON-svar (fetch mockas).
 * Kör: npx vitest run src/lib/openFoodFacts.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  OFF_MESSAGES,
  OFF_TIMEOUT_MS,
  OpenFoodFactsError,
  fetchProductByBarcode,
  hasUsableNutrition,
  invalidBarcodeMessage,
  isAbortError,
  isValidEan,
  mapOffNutriments,
  mapOffProduct,
  offAllergens,
  offCategory,
  offAttributionText,
  offLabels,
  offProductUrl,
  parseQuantity,
  searchProducts,
  type OffProduct,
} from './openFoodFacts'
import type { FoodExtraWithAllergens } from './allergens'

// ---------------------------------------------------------------------------
// Fixturer (förkortade svar i samma form som api/v2/product/{code}.json)
// ---------------------------------------------------------------------------

const MILK: OffProduct = {
  code: '7310865004703',
  product_name: 'Mellanmjölk 1,5%',
  product_name_sv: 'Mellanmjölk 1,5 %',
  brands: 'Arla Ko,Arla',
  quantity: '1 l',
  serving_size: '2 dl',
  serving_quantity: 200,
  nutriments: {
    'energy-kcal_100g': 46,
    'energy-kj_100g': 193,
    energy_100g: 193,
    fat_100g: 1.5,
    'saturated-fat_100g': 1,
    carbohydrates_100g: 4.8,
    sugars_100g: 4.8,
    proteins_100g: 3.5,
    salt_100g: 0.1,
    sodium_100g: 0.04,
    'vitamin-d_100g': 0.000001,
    'vitamin-a_100g': 0.000036,
    'vitamin-b12_100g': 0.0000004,
    'vitamin-b2_100g': 0.00018,
    calcium_100g: 0.12,
    iodine_100g: 0.000016,
    'energy-kcal_unit': 'kcal',
  },
  nutriscore_grade: 'b',
  nova_group: 1,
  ingredients_text_sv: 'Mellanmjölk, vitamin A, vitamin D.',
  allergens_tags: ['en:milk'],
  labels_tags: ['en:keyhole', 'en:svenskt-sigill', 'en:no-gluten'],
  categories_tags: ['en:dairies', 'en:milks', 'en:semi-skimmed-milks'],
  image_front_small_url: 'https://images.openfoodfacts.org/images/products/731/086/500/4703/front_sv.3.200.jpg',
  image_front_url: 'https://images.openfoodfacts.org/images/products/731/086/500/4703/front_sv.3.400.jpg',
  countries_tags: ['en:sweden'],
  origins: 'Sverige',
}

const BEER: OffProduct = {
  code: '7350020001239',
  product_name: 'Pilsner',
  brands: 'Bryggeri Exempel',
  quantity: '50 cl',
  nutriments: {
    'energy-kcal_100g': 43,
    carbohydrates_100g: 3.1,
    sugars_100g: 0.2,
    proteins_100g: 0.4,
    fat_100g: 0,
    alcohol_100g: 5.2,
  },
  categories_tags: ['en:beverages', 'en:alcoholic-beverages', 'en:beers', 'en:lagers'],
  labels_tags: [],
}

/** Chokladkaka i flerpack med energi bara i kJ och decimaler som strängar. */
const CHOCOLATE: OffProduct = {
  code: '7311320123458',
  product_name: 'mjölkchoklad',
  generic_name_sv: 'Mjölkchoklad',
  brands: 'Exempelchoklad',
  quantity: '4 x 45 g',
  serving_size: '45 g',
  serving_quantity: '45',
  nutriments: {
    energy_100g: 2230,
    fat_100g: '30,5',
    'saturated-fat_100g': 18,
    carbohydrates_100g: 58,
    sugars_100g: 56,
    fiber_100g: 2.1,
    proteins_100g: 7.4,
    salt_100g: 0.25,
    iron_100g: 0.0024,
    magnesium_100g: 0.06,
    caffeine_100g: 0.02,
    cholesterol_100g: 0.012,
  },
  nutriscore_grade: 'e',
  nova_group: '4',
  ingredients_text: 'Sugar, cocoa butter, milk powder …',
  allergens_tags: ['en:milk', 'en:nuts', 'en:soybeans', 'en:gluten'],
  labels_tags: ['en:fairtrade-international', 'en:rainforest-alliance'],
  categories_tags: ['en:snacks', 'en:sweet-snacks', 'en:cocoa-and-its-products', 'en:chocolates', 'en:milk-chocolates'],
}

/** Havredryck – växtbaserad, flytande, vegansk. */
const OAT: OffProduct = {
  code: '7350001100999',
  product_name_sv: 'Havredryck iKaffe',
  brands: 'Havrebolaget',
  quantity: '1 L',
  nutriments: {
    'energy-kcal_100g': 59,
    fat_100g: 3,
    carbohydrates_100g: 6.6,
    sugars_100g: 3.4,
    fiber_100g: 0.8,
    proteins_100g: 1.1,
    salt_100g: 0.1,
    'vitamin-d_100g': 0.0000011,
    calcium_100g: 0.12,
  },
  labels_tags: ['en:vegan', 'en:eu-organic', 'en:krav'],
  categories_tags: ['en:plant-based-foods-and-beverages', 'en:beverages', 'en:plant-based-milk-alternatives', 'en:oat-based-drinks'],
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------

describe('isValidEan', () => {
  it('godkänner giltiga EAN-13, EAN-8 och UPC-A', () => {
    expect(isValidEan('4006381333931')).toBe(true)
    expect(isValidEan('7310865004703')).toBe(true)
    expect(isValidEan('73513537')).toBe(true)
    expect(isValidEan('036000291452')).toBe(true)
    expect(isValidEan(' 7310865 004703 ')).toBe(true)
  })

  it('underkänner fel kontrollsiffra, fel längd och bokstäver', () => {
    expect(isValidEan('4006381333932')).toBe(false)
    expect(isValidEan('73513538')).toBe(false)
    expect(isValidEan('123')).toBe(false)
    expect(isValidEan('40063813339311')).toBe(false)
    expect(isValidEan('abcdefghijklm')).toBe(false)
    expect(isValidEan('')).toBe(false)
  })
})

describe('texter och länkar', () => {
  it('ber om att skanna igen bara när kameran fungerar', () => {
    expect(invalidBarcodeMessage(true)).toBe(OFF_MESSAGES.invalid_barcode)
    expect(invalidBarcodeMessage(true)).toMatch(/Skanna igen/)
    expect(invalidBarcodeMessage(false)).toBe('Streckkoden ser inte ut att stämma. Kontrollera siffrorna under streckkoden och skriv in dem igen.')
    expect(invalidBarcodeMessage(false)).not.toMatch(/Skanna/)
  })

  it('anger licenserna och länkar till produktsidan', () => {
    expect(offAttributionText(true)).toBe(
      'Produktdata från Open Food Facts (ODbL), produktbild under CC BY-SA 3.0 – en öppen databas som byggs av användare. Kontrollera mot förpackningen.',
    )
    expect(offAttributionText(false)).not.toMatch(/CC BY-SA/)
    expect(offProductUrl('7310 865-000637')).toBe('https://world.openfoodfacts.org/product/7310865000637')
  })
})

describe('mappning av näringsvärden', () => {
  it('räknar om vitaminer och mineraler från gram', () => {
    const n = mapOffNutriments(MILK.nutriments)
    expect(n.kcal).toBe(46)
    expect(n.protein).toBe(3.5)
    expect(n.vitD).toBeCloseTo(1, 6)
    expect(n.vitA).toBeCloseTo(36, 6)
    expect(n.vitB12).toBeCloseTo(0.4, 6)
    expect(n.riboflavin).toBeCloseTo(0.18, 6)
    expect(n.calcium).toBeCloseTo(120, 6)
    expect(n.iodine).toBeCloseTo(16, 6)
    expect(n.sodium).toBeCloseTo(40, 6)
    expect(n.salt).toBe(0.1)
    // Värden som inte finns är okända – inte 0.
    expect(n.fiber).toBeUndefined()
    expect(n.iron).toBeUndefined()
  })

  it('räknar om kJ till kcal när kcal saknas', () => {
    const n = mapOffNutriments(CHOCOLATE.nutriments)
    expect(n.kcal).toBeCloseTo(2230 / 4.184, 3)
    expect(n.fat).toBe(30.5) // decimalkomma i sträng
    expect(n.iron).toBeCloseTo(2.4, 6)
    expect(n.magnesium).toBeCloseTo(60, 6)
    expect(n.caffeine).toBeCloseTo(20, 6)
    expect(n.cholesterol).toBeCloseTo(12, 6)
  })

  it('räknar om alkohol från volymprocent till gram', () => {
    const n = mapOffNutriments(BEER.nutriments)
    expect(n.alcohol).toBeCloseTo(5.2 * 0.789, 6)
  })

  it('ignorerar orimliga och negativa värden', () => {
    const n = mapOffNutriments({ fat_100g: 130, proteins_100g: -1, 'energy-kcal_100g': 2000, 'energy-kj_100g': 1500, sugars_100g: 'okänt' })
    expect(n.fat).toBeUndefined()
    expect(n.protein).toBeUndefined()
    expect(n.sugars).toBeUndefined()
    expect(n.kcal).toBeCloseTo(1500 / 4.184, 3)
  })
})

describe('kategorier, allergener och märkningar', () => {
  it('översätter kategorier', () => {
    expect(offCategory(MILK.categories_tags)).toBe('mejeri')
    expect(offCategory(BEER.categories_tags)).toBe('alkohol')
    expect(offCategory(CHOCOLATE.categories_tags)).toBe('sotsaker')
    expect(offCategory(OAT.categories_tags)).toBe('vaxtdryck')
    expect(offCategory(['en:dairies', 'en:cheeses', 'en:hard-cheeses'])).toBe('ost')
    expect(offCategory(['en:dairies', 'en:butters'])).toBe('fett_olja')
    expect(offCategory(['en:breads', 'en:crispbreads'])).toBe('brod')
    expect(offCategory(['en:breakfast-cereals', 'en:mueslis'])).toBe('spannmal')
    expect(offCategory(['en:meats', 'en:prepared-meats', 'en:sausages'])).toBe('chark')
    expect(offCategory(['en:fish-and-seafood', 'en:crustaceans', 'en:shrimps'])).toBe('skaldjur')
    expect(offCategory(['en:fish-and-seafood', 'en:fishes', 'en:salmons'])).toBe('fisk')
    expect(offCategory(['en:snacks', 'en:salty-snacks', 'en:chips'])).toBe('snacks')
    expect(offCategory(['en:biscuits-and-cakes', 'en:biscuits'])).toBe('bakverk')
    expect(offCategory(['en:meals', 'en:pizzas'])).toBe('snabbmat')
    expect(offCategory(['en:okand'])).toBe('ovrigt')
    expect(offCategory(undefined)).toBe('ovrigt')
  })

  it('skiljer läsk med socker från sockerfri dryck', () => {
    expect(offCategory(['en:beverages', 'en:sodas'], { sugars: 10.6 })).toBe('lask_saft')
    expect(offCategory(['en:beverages', 'en:sodas'], { sugars: 0 })).toBe('dryck')
    expect(offCategory(['en:beverages', 'en:sodas', 'en:diet-sodas'], { sugars: 0 })).toBe('dryck')
    expect(offCategory(['en:beverages'], { sugars: 8 })).toBe('lask_saft')
    expect(offCategory(['en:beverages'])).toBe('dryck')
  })

  it('översätter allergener till svenska', () => {
    expect(offAllergens(CHOCOLATE.allergens_tags)).toEqual(['gluten', 'mjölk', 'nötter', 'soja'])
    expect(
      offAllergens([
        'en:crustaceans', 'en:peanuts', 'en:sesame-seeds', 'en:celery', 'en:mustard', 'en:lupin', 'en:molluscs',
        'en:sulphur-dioxide-and-sulphites', 'en:eggs', 'en:fish', 'sv:havre', 'en:okand',
      ]),
    ).toEqual(['blötdjur', 'fisk', 'havre', 'jordnötter', 'kräftdjur', 'lupin', 'selleri', 'senap', 'sesam', 'svaveldioxid/sulfit', 'ägg'])
  })

  it('översätter märkningar och sätter taggar', () => {
    const milk = offLabels(MILK.labels_tags)
    expect(milk.labels).toEqual(['Nyckelhålet', 'Svenskt Sigill', 'Glutenfri'])
    expect(milk.tags).toEqual(expect.arrayContaining(['nyckelhal', 'svensk', 'glutenfri']))
    const oat = offLabels(OAT.labels_tags)
    expect(oat.labels).toEqual(['KRAV', 'EU-ekologisk', 'Vegansk'])
    expect(oat.tags).toEqual(expect.arrayContaining(['ekologisk', 'vegan', 'vegetarisk']))
    expect(offLabels(['en:nyckelhalet', 'en:lactose-free']).tags).toEqual(['nyckelhal', 'laktosfri'])
  })

  it('tolkar förpackningsstorlekar', () => {
    expect(parseQuantity('1 l')).toEqual({ grams: 1000, volume: true })
    expect(parseQuantity('1,5 L')).toEqual({ grams: 1500, volume: true })
    expect(parseQuantity('500 g')).toEqual({ grams: 500, volume: false })
    expect(parseQuantity('6 x 33 cl')).toEqual({ grams: 1980, unitGrams: 330, count: 6, volume: true })
    expect(parseQuantity('4×125g')).toEqual({ grams: 500, unitGrams: 125, count: 4, volume: false })
    expect(parseQuantity('ca 1 st')).toBeUndefined()
    expect(parseQuantity(undefined)).toBeUndefined()
  })
})

describe('mapOffProduct', () => {
  it('mappar en mjölk komplett', () => {
    const food = mapOffProduct(MILK)!
    expect(food).toMatchObject({
      id: 'off:7310865004703',
      name: 'Mellanmjölk 1,5 %',
      brand: 'Arla Ko',
      source: 'openfoodfacts',
      category: 'mejeri',
      barcode: '7310865004703',
      liquid: true,
      imageUrl: MILK.image_front_small_url,
    })
    expect(food.portions).toEqual([{ id: 'portion', label: '1 portion (2 dl)', grams: 200 }, { id: 'forpackning', label: 'Hela förpackningen (1 l)', grams: 1000 }])
    expect(food.extra).toEqual({
      nutriscore: 'b',
      nova: 1,
      ingredientsText: 'Mellanmjölk, vitamin A, vitamin D.',
      allergens: ['mjölk'],
      allergenKeys: ['mjolk'],
      traceKeys: [],
      quantity: '1 l',
      origin: 'Sverige',
      labels: ['Nyckelhålet', 'Svenskt Sigill', 'Glutenfri'],
    })
    expect(food.tags).toEqual(expect.arrayContaining(['nyckelhal', 'svensk', 'glutenfri']))
    expect(food.note).toMatch(/per 100 ml/)
    expect(hasUsableNutrition(food)).toBe(true)
  })

  it('mappar öl med alkohol i gram och burken som portion', () => {
    const food = mapOffProduct(BEER)!
    expect(food.category).toBe('alkohol')
    expect(food.liquid).toBe(true)
    expect(food.nutrients.alcohol).toBeCloseTo(4.1, 1)
    expect(food.portions).toEqual([{ id: 'forpackning', label: 'Hela förpackningen (50 cl)', grams: 500 }])
  })

  it('mappar flerpack, svenskt generiskt namn och stor bokstav', () => {
    const food = mapOffProduct(CHOCOLATE)!
    expect(food.name).toBe('Mjölkchoklad')
    expect(food.liquid).toBeUndefined()
    expect(food.category).toBe('sotsaker')
    expect(food.portions).toEqual([
      { id: 'portion', label: '1 portion (45 g)', grams: 45 },
      { id: 'forpackning', label: 'Hela förpackningen (4 x 45 g)', grams: 180 },
    ])
    expect(food.extra?.nova).toBe(4)
    expect(food.extra?.ingredientsText).toBe('Sugar, cocoa butter, milk powder …')
    expect(food.extra?.labels).toEqual(['Fairtrade', 'Rainforest Alliance'])
    expect((food.extra as FoodExtraWithAllergens).allergenKeys).toEqual(['gluten', 'soja', 'mjolk', 'notter'])
    // Salt ↔ natrium kompletteras.
    expect(food.nutrients.sodium).toBeCloseTo(100, 6)
  })

  it('mappar växtdryck som flytande och vegansk', () => {
    const food = mapOffProduct(OAT)!
    expect(food.category).toBe('vaxtdryck')
    expect(food.liquid).toBe(true)
    expect(food.tags).toEqual(expect.arrayContaining(['vegan', 'vegetarisk', 'ekologisk']))
    expect(food.nutrients.vitD).toBeCloseTo(1.1, 6)
    // Ingen portion angiven och 1 l är för stort som förval.
    expect(food.portions).toEqual([])
  })

  it('sparar allergenerna som nycklar och "kan innehålla spår av" utan det som redan ingår', () => {
    const food = mapOffProduct({ ...CHOCOLATE, traces_tags: ['en:peanuts', 'en:sesame-seeds', 'en:milk', 'en:okand'] })!
    const extra = food.extra as FoodExtraWithAllergens
    expect(extra.allergens).toEqual(['gluten', 'mjölk', 'nötter', 'soja'])
    expect(extra.allergenKeys).toEqual(['gluten', 'soja', 'mjolk', 'notter'])
    expect(extra.traceKeys).toEqual(['jordnotter', 'sesam'])
    // Utan allergener och spår sparas tomma listor – då vet Lagom att spåren har lästs in.
    const oat = mapOffProduct(OAT)!.extra as FoodExtraWithAllergens
    expect(oat.allergenKeys).toEqual([])
    expect(oat.traceKeys).toEqual([])
    const beer = mapOffProduct({ ...BEER, allergens_tags: [], traces_tags: [] })!
    expect(beer.extra).toEqual({ quantity: '50 cl', allergenKeys: [], traceKeys: [] })
  })

  it('märker produkter med allergentaggar som Lagom inte kan tolka', () => {
    const tagged = (allergens: string[], traces: string[] = []) => (mapOffProduct({ ...BEER, allergens_tags: allergens, traces_tags: traces })!.extra as FoodExtraWithAllergens).unreadAllergenTags
    expect(tagged(['fi:maito'])).toBe(true)
    expect(tagged(['en:milk'], ['de:schalenfruechte'])).toBe(true)
    // Kanoniska taggar utanför EU:s lista och kända svenska ord är inte okända.
    expect(tagged(['en:kiwi', 'en:none', 'sv:havre'])).toBeUndefined()
  })

  it('tolkar okända svenska allergentaggar när ordet är känt', () => {
    const food = mapOffProduct({ ...BEER, allergens_tags: ['sv:havre', 'en:none'], traces_tags: ['sv:mandel'] })!
    const extra = food.extra as FoodExtraWithAllergens
    expect(extra.allergens).toEqual(['havre'])
    expect(extra.allergenKeys).toEqual(['gluten'])
    expect(extra.traceKeys).toEqual(['notter'])
  })

  it('returnerar produkter utan näringsvärden så att användaren kan komplettera', () => {
    const food = mapOffProduct({ code: '7312345678909', product_name: 'Okänt kex', nutriments: {} })!
    expect(food.nutrients).toEqual({})
    expect(hasUsableNutrition(food)).toBe(false)
    expect(mapOffProduct({ product_name: 'Utan kod' })).toBeNull()
    expect(mapOffProduct({ code: '7312345678909' })!.name).toBe('Okänd produkt (7312345678909)')
  })
})

describe('fetchProductByBarcode', () => {
  it('hämtar och mappar en produkt', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: MILK.code, status: 1, status_verbose: 'product found', product: MILK }))
    const food = await fetchProductByBarcode('7310865004703')
    expect(food?.id).toBe('off:7310865004703')
    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toMatch(/^https:\/\/world\.openfoodfacts\.org\/api\/v2\/product\/7310865004703\.json\?fields=/)
    expect(url).toContain('product_name_sv')
    expect(url).toContain('nutriments')
    expect(url).toContain('allergens_tags')
    expect(url).toContain('traces_tags')
  })

  it('returnerar null när produkten saknas (404 eller status 0)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: '4006381333931', status: 0, status_verbose: 'product not found' }, 404))
    expect(await fetchProductByBarcode('4006381333931')).toBeNull()
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 0, status_verbose: 'product not found' }))
    expect(await fetchProductByBarcode('4006381333931')).toBeNull()
  })

  it('kastar för ogiltig streckkod utan att anropa nätet', async () => {
    await expect(fetchProductByBarcode('4006381333932')).rejects.toMatchObject({ code: 'invalid_barcode' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('ger svenskt fel när enheten är offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const err = await fetchProductByBarcode('7310865004703').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(OpenFoodFactsError)
    expect((err as Error).message).toMatch(/^Ingen internetanslutning/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('skiljer på nätverksfel och offline när anropet misslyckas', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(fetchProductByBarcode('7310865004703')).rejects.toMatchObject({ code: 'network', message: OFF_MESSAGES.network })
    const online = vi.spyOn(navigator, 'onLine', 'get')
    online.mockReturnValueOnce(true).mockReturnValue(false)
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(fetchProductByBarcode('7310865004703')).rejects.toMatchObject({ code: 'offline' })
  })

  it('avbryter efter tidsgränsen', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementationOnce(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        }),
    )
    const p = fetchProductByBarcode('7310865004703').catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(OFF_TIMEOUT_MS + 10)
    const err = await p
    expect(err).toMatchObject({ code: 'timeout', message: OFF_MESSAGES.timeout })
  })

  it('låter anroparen avbryta', async () => {
    const ctrl = new AbortController()
    fetchMock.mockImplementationOnce(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        }),
    )
    const p = fetchProductByBarcode('7310865004703', ctrl.signal).catch((e: unknown) => e)
    ctrl.abort()
    expect(isAbortError(await p)).toBe(true)
    // Redan avbruten signal – inget anrop görs.
    const err = await fetchProductByBarcode('7310865004703', ctrl.signal).catch((e: unknown) => e)
    expect(isAbortError(err)).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('översätter HTTP-fel', async () => {
    fetchMock.mockResolvedValueOnce(new Response('Too many requests', { status: 429 }))
    await expect(fetchProductByBarcode('7310865004703')).rejects.toMatchObject({ code: 'rate_limited', status: 429 })
    fetchMock.mockResolvedValueOnce(new Response('Bad gateway', { status: 502 }))
    await expect(fetchProductByBarcode('7310865004703')).rejects.toMatchObject({ code: 'server', status: 502 })
    fetchMock.mockResolvedValueOnce(new Response('<html>', { status: 200 }))
    await expect(fetchProductByBarcode('7310865004703')).rejects.toMatchObject({ code: 'bad_response' })
  })
})

describe('searchProducts', () => {
  it('söker bland svenska produkter och filtrerar bort de utan energi', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        count: 4,
        page: 2,
        page_size: 24,
        products: [OAT, { code: '7312345678909', product_name: 'Havredryck utan värden', nutriments: {} }, OAT, MILK, null],
      }),
    )
    const foods = await searchProducts('  havre   dryck ', { page: 2 })
    expect(foods.map((f) => f.id)).toEqual(['off:7350001100999', 'off:7310865004703'])
    const url = new URL(String(fetchMock.mock.calls[0][0]))
    expect(url.origin).toBe('https://se.openfoodfacts.org')
    expect(url.pathname).toBe('/cgi/search.pl')
    expect(url.searchParams.get('search_terms')).toBe('havre dryck')
    expect(url.searchParams.get('search_simple')).toBe('1')
    expect(url.searchParams.get('action')).toBe('process')
    expect(url.searchParams.get('json')).toBe('1')
    expect(url.searchParams.get('page_size')).toBe('24')
    expect(url.searchParams.get('page')).toBe('2')
    expect(url.searchParams.get('fields')).toContain('nutriments')
  })

  it('gör inget anrop för tom sökning', async () => {
    expect(await searchProducts('   ')).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('kastar vid oväntat svar', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'nope' }))
    await expect(searchProducts('mjölk')).rejects.toMatchObject({ code: 'bad_response' })
  })
})
