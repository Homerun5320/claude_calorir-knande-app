// @vitest-environment node
/**
 * Tester för Livsmedelsverkets mappning och klient, samt importskriptet
 * (scripts/import-livsmedelsverket.mjs) – med fixturer i samma form som API:t.
 * Kör: npx vitest run src/lib/livsmedelsverket.test.ts
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  LMV_API_BASE,
  LMV_ATTRIBUTION,
  LMV_LICENSE,
  LMV_LICENSE_URL,
  LMV_MAPPING_TABLES,
  categorizeLmv,
  fetchLmvFoodList,
  fetchLmvNutrients,
  importAll,
  mapLmvFood,
  mapLmvNutrients,
  parseLmvUnit,
  parseLmvValue,
  tidyLmvName,
  type LmvImportProgress,
  type LmvListItem,
  type LmvNutrientRow,
} from './livsmedelsverket'
import { NUTRIENTS } from './nutrients'
import { normalizeSv } from './search'
import { parseLmvDataset } from './foodRepo'

// ---------------------------------------------------------------------------
// Fixturer
// ---------------------------------------------------------------------------

/** Rad i samma form som /livsmedel/{nummer}/naringsvarden (med några extrafält). */
const row = (namn: string, euroFIRkod: string | undefined, forkortning: string | undefined, varde: number | string | null, enhet: string, extra: Partial<LmvNutrientRow> = {}): LmvNutrientRow => ({
  namn,
  forkortning,
  euroFIRkod,
  varde,
  enhet,
  viktGram: 100,
  matrisenhet: 'gram',
  berakningsmetod: 'Analys',
  ...extra,
})

const MJOLK: LmvListItem = { nummer: 1, namn: 'Mjölk fett 3%', livsmedelsTypId: 1 }
const MJOLK_ROWS: LmvNutrientRow[] = [
  row('Energi (kcal)', 'ENERC', 'Ener', 60, 'kcal'),
  row('Energi (kJ)', 'ENERC', 'Ener', 251, 'kJ'),
  row('Kolhydrater, tillgängliga', 'CHO', 'Kolh', 4.6, 'g'),
  row('Sockerarter, totalt', 'SUGAR', 'Sock', 4.6, 'g'),
  row('Fett, totalt', 'FAT', 'Fett', 3, 'g'),
  row('Summa mättade fettsyror', 'FASAT', 'Mfet', 1.87, 'g'),
  row('Summa enkelomättade fettsyror', 'FAMS', 'Mone', 0.78, 'g'),
  row('Summa fleromättade fettsyror', 'FAPU', 'Pole', 0.11, 'g'),
  row('Protein', 'PROT', 'Prot', 3.4, 'g'),
  row('Fibrer', 'FIBT', 'Fibe', 0, 'g'),
  row('Vatten', 'WATER', 'Vatt', 88.2, 'g'),
  row('Aska', 'ASH', 'Aska', 0.7, 'g'),
  row('Alkohol', 'ALC', 'Alko', 0, 'g'),
  row('Kolesterol', 'CHORL', 'Chol', 10, 'mg'),
  row('Salt, NaCl', 'NACL', 'NaCl', 0.1, 'g'),
  row('Natrium, Na', 'NA', 'Na', 40, 'mg'),
  row('Kalcium, Ca', 'CA', 'Ca', 120, 'mg'),
  row('Jod, I', 'ID', 'I', 16, 'µg'),
  row('Retinolekvivalenter', 'VITA', 'RE', 36, 'µg'),
  row('Vitamin D', 'VITD', 'VitD', 0.5, 'µg'),
  row('Riboflavin', 'RIBF', 'Ribo', 0.17, 'mg'),
  row('Niacin', 'NIA', 'Niacin', 0.1, 'mg'),
  row('Niacinekvivalenter', 'NIAEQ', 'NE', 0.9, 'mg'),
  row('Folat, totalt', 'FOL', 'Folat', 5, 'µg'),
  row('Vitamin B12', 'VITB12', 'VitB12', 0.4, 'µg'),
  row('Linolsyra C18:2', 'F18D2CN6', 'C18:2', 0.07, 'g'),
]

/** Lax med omega-3 bara som enskilda fettsyror och selen i mg. */
const LAX: LmvListItem = { nummer: 2, namn: 'Lax odlad rå' }
const LAX_ROWS: LmvNutrientRow[] = [
  row('Energi (kcal)', 'ENERC', 'Ener', 201, 'kcal'),
  row('Protein', 'PROT', 'Prot', 20.3, 'g'),
  row('Fett, totalt', 'FAT', 'Fett', 13.3, 'g'),
  row('Kolhydrater, tillgängliga', 'CHO', 'Kolh', 0, 'g'),
  row('Linolensyra C18:3', 'F18D3N3', 'C18:3', 0.6, 'g'),
  row('EPA (C20:5)', 'F20D5N3', 'C20:5', 0.5, 'g'),
  row('DPA (C22:5)', 'F22D5N3', 'C22:5', 0.25, 'g'),
  row('DHA (C22:6)', 'F22D6N3', 'C22:6', 0.9, 'g'),
  row('Vitamin D', 'VITD', 'VitD', 8.1, 'µg'),
  row('Selen, Se', 'SE', 'Se', 0.024, 'mg'),
  row('Vitamin B12', 'VITB12', 'VitB12', 3.2, 'μg'), // grekiskt my
]

/** Morot: vitamin A bara som retinol + betakaroten. */
const MOROT: LmvListItem = { nummer: 3, namn: 'Morot rå' }
const MOROT_ROWS: LmvNutrientRow[] = [
  row('Energi (kcal)', 'ENERC', 'Ener', 36, 'kcal'),
  row('Protein', 'PROT', 'Prot', 0.6, 'g'),
  row('Kolhydrater, tillgängliga', 'CHO', 'Kolh', 6.8, 'g'),
  row('Fett, totalt', 'FAT', 'Fett', 0.2, 'g'),
  row('Fibrer', 'FIBT', 'Fibe', 2.6, 'g'),
  row('Retinol', 'RETOL', 'Retinol', 0, 'µg'),
  row('β-Karoten', 'CARTB', 'B-karo', 8000, 'µg'),
  row('Vitamin C', 'VITC', 'VitC', 'spår', 'mg'),
]

/** Knäckebröd: bara svenska namn (inga koder), energi bara i kJ, decimalkomma och andra enheter. */
const KNACKE: LmvListItem = { nummer: 4, namn: 'Knäckebröd  fullkorn råg' }
const KNACKE_ROWS: LmvNutrientRow[] = [
  { namn: 'Energi (kJ)', varde: '1 400', enhet: 'kJ' },
  { namn: 'Kolhydrater, tillgängliga', varde: '60,1', enhet: 'g' },
  { namn: 'Protein', varde: '9,5', enhet: 'g' },
  { namn: 'Fett, totalt', varde: 2, enhet: 'g' },
  { namn: 'Fibrer', varde: 16.5, enhet: 'g' },
  { namn: 'Fullkorn totalt', varde: 90, enhet: 'g' },
  { namn: 'Salt, NaCl', varde: 1.1, enhet: 'g' },
  { namn: 'Järn, Fe', varde: 3200, enhet: 'µg' },
  { namn: 'Selen, Se', varde: 0.004, enhet: 'mg' },
  { namn: 'Tiamin', varde: '<0,01', enhet: 'mg' },
  { namn: 'Magnesium, Mg', varde: -5, enhet: 'mg' },
  { namn: 'Zink, Zn', varde: null, enhet: 'mg' },
  { namn: 'Okänt ämne', varde: 3, enhet: 'g' },
]

/** Öl: bara förkortningar, värden per 50 g (viktGram). */
const OL: LmvListItem = { nummer: 5, namn: 'Öl starköl 5,2%' }
const OL_ROWS: LmvNutrientRow[] = [
  { forkortning: 'Ener', varde: 21.5, enhet: 'kcal', viktGram: 50 },
  { forkortning: 'Kolh', varde: 1.55, enhet: 'g', viktGram: 50 },
  { forkortning: 'Prot', varde: 0.2, enhet: 'g', viktGram: 50 },
  { forkortning: 'Alko', varde: 2.05, enhet: 'g', viktGram: 50 },
]

const LASK: LmvListItem = { nummer: 6, namn: 'Läsk sockerfri' }
const LASK_ROWS: LmvNutrientRow[] = [
  row('Energi (kcal)', 'ENERC', 'Ener', 1, 'kcal'),
  row('Sockerarter, totalt', 'SUGAR', 'Sock', 0, 'g'),
  row('Koffein', 'CAFFN', undefined, 10, 'mg'),
]

const FIXTURES: Array<[LmvListItem, LmvNutrientRow[]]> = [
  [MJOLK, MJOLK_ROWS],
  [LAX, LAX_ROWS],
  [MOROT, MOROT_ROWS],
  [KNACKE, KNACKE_ROWS],
  [OL, OL_ROWS],
  [LASK, LASK_ROWS],
]

/** Realistiska namn i Livsmedelsverkets stil → förväntad kategori. */
const NAME_CATEGORIES: Array<[string, string]> = [
  ['Mjölk fett 3%', 'mejeri'],
  ['Filmjölk naturell fett 3%', 'mejeri'],
  ['Grädde vispgrädde fett 36%', 'mejeri'],
  ['Chokladmjölk', 'mejeri'],
  ['Ost hårdost fett 28%', 'ost'],
  ['Prästost fett 31%', 'ost'],
  ['Smör normalsaltat fett 82%', 'fett_olja'],
  ['Rapsolja', 'fett_olja'],
  ['Ägg hönsägg kokt', 'agg'],
  ['Nötkött färs 10% fett rå', 'rott_kott'],
  ['Fläsk kotlett rå', 'rott_kott'],
  ['Rostbiff', 'rott_kott'],
  ['Kyckling bröstfilé rå', 'fagel'],
  ['Kycklingfärs rå', 'fagel'],
  ['Falukorv', 'chark'],
  ['Leverpastej', 'chark'],
  ['Blodpudding', 'chark'],
  ['Vegetarisk korv', 'vegoprotein'],
  ['Tofu naturell', 'vegoprotein'],
  ['Lax odlad rå', 'fisk'],
  ['Torsk filé fryst', 'fisk'],
  ['Löjrom', 'fisk'],
  ['Fiskbullar i buljong', 'fisk'],
  ['Räkor kokta', 'skaldjur'],
  ['Potatis kokt', 'potatis'],
  ['Morot rå', 'rotfrukter'],
  ['Sötpotatis rå', 'rotfrukter'],
  ['Vitkål rå', 'gronsaker'],
  ['Rödlök rå', 'gronsaker'],
  ['Smörgåsgurka', 'gronsaker'],
  ['Vattenmelon', 'frukt'],
  ['Äpple med skal', 'frukt'],
  ['Äppelmos', 'frukt'],
  ['Lingon', 'bar'],
  ['Hallonsylt', 'sotsaker'],
  ['Mjölkchoklad', 'sotsaker'],
  ['Kanelbulle', 'bakverk'],
  ['Vetebröd', 'bakverk'],
  ['Knäckebröd fullkorn', 'brod'],
  ['Hönökaka', 'brod'],
  ['Havregryn', 'spannmal'],
  ['Vetemjöl', 'spannmal'],
  ['Pasta kokt', 'pasta_ris'],
  ['Ris jasmin okokt', 'pasta_ris'],
  ['Bönor bruna kokta', 'baljvaxter'],
  ['Jordnötssmör', 'notter_fron'],
  ['Valnötter', 'notter_fron'],
  ['Öl starköl 5,2%', 'alkohol'],
  ['Rödvin', 'alkohol'],
  ['Havredryck berikad', 'vaxtdryck'],
  ['Apelsinjuice', 'juice'],
  ['Läsk sockrad', 'lask_saft'],
  ['Kaffe bryggt', 'dryck'],
  ['Ketchup', 'sas_krydda'],
  ['Tomatsås', 'sas_krydda'],
  ['Köttfärssås', 'fardigratt'],
  ['Köttbullar stekta', 'fardigratt'],
  ['Ärtsoppa med fläsk', 'fardigratt'],
  ['Ostsmörgås', 'fardigratt'],
  ['Pizza vesuvio', 'snabbmat'],
  ['Glass gräddglass vanilj', 'glass_dessert'],
  ['Chips potatis', 'snacks'],
  ['Gelatin', 'ovrigt'],
]

// ---------------------------------------------------------------------------

describe('värden och enheter', () => {
  it('tolkar värden', () => {
    expect(parseLmvValue(1.5)).toBe(1.5)
    expect(parseLmvValue('1,5')).toBe(1.5)
    expect(parseLmvValue('1 400')).toBe(1400)
    expect(parseLmvValue('spår')).toBe(0)
    expect(parseLmvValue('<0,1')).toBe(0)
    expect(parseLmvValue(-1)).toBeUndefined()
    expect(parseLmvValue(null)).toBeUndefined()
    expect(parseLmvValue('')).toBeUndefined()
    expect(parseLmvValue('okänt')).toBeUndefined()
  })

  it('tolkar enheter', () => {
    expect(parseLmvUnit('g')).toBe('g')
    expect(parseLmvUnit('mg')).toBe('mg')
    expect(parseLmvUnit('µg')).toBe('µg')
    expect(parseLmvUnit('μg')).toBe('µg')
    expect(parseLmvUnit('ug')).toBe('µg')
    expect(parseLmvUnit('kcal')).toBe('kcal')
    expect(parseLmvUnit('kJ')).toBe('kJ')
    expect(parseLmvUnit('%')).toBe('g')
    expect(parseLmvUnit('RE')).toBeUndefined()
    expect(parseLmvUnit(undefined)).toBeUndefined()
  })

  it('snyggar till namn', () => {
    expect(tidyLmvName('Mjölk fett 3%')).toBe('Mjölk fett 3 %')
    expect(tidyLmvName('  knäckebröd   fullkorn ')).toBe('Knäckebröd fullkorn')
  })
})

describe('mapLmvNutrients', () => {
  it('mappar via EuroFIR-koder och väljer kcal-raden för energi', () => {
    const n = mapLmvNutrients(MJOLK_ROWS)
    expect(n).toMatchObject({
      kcal: 60,
      carbs: 4.6,
      sugars: 4.6,
      fat: 3,
      satFat: 1.87,
      monoFat: 0.78,
      polyFat: 0.11,
      protein: 3.4,
      fiber: 0,
      alcohol: 0,
      cholesterol: 10,
      salt: 0.1,
      sodium: 40,
      calcium: 120,
      iodine: 16,
      vitA: 36,
      vitD: 0.5,
      riboflavin: 0.17,
      folate: 5,
      vitB12: 0.4,
    })
    // Niacinekvivalenter föredras framför niacin.
    expect(n.niacin).toBe(0.9)
    // Okända ämnen (vatten, aska, linolsyra) ignoreras; saknade ämnen förblir okända.
    expect(Object.keys(n)).not.toContain('water')
    expect(n.iron).toBeUndefined()
    expect(n.omega3).toBeUndefined()
  })

  it('räknar ihop omega-3 och räknar om mg till µg', () => {
    const n = mapLmvNutrients(LAX_ROWS)
    expect(n.omega3).toBeCloseTo(2.25, 6)
    expect(n.selenium).toBeCloseTo(24, 6)
    expect(n.vitB12).toBe(3.2)
    expect(n.vitD).toBe(8.1)
    // Salt/natrium saknas och ska inte hittas på.
    expect(n.salt).toBeUndefined()
  })

  it('räknar fram retinolekvivalenter och tolkar "spår" som 0', () => {
    const n = mapLmvNutrients(MOROT_ROWS)
    expect(n.vitA).toBeCloseTo(666.7, 1)
    expect(n.vitC).toBe(0)
  })

  it('faller tillbaka på svenska namn, kJ och decimalkomma', () => {
    const n = mapLmvNutrients(KNACKE_ROWS)
    expect(n.kcal).toBeCloseTo(334.6, 1)
    expect(n.carbs).toBe(60.1)
    expect(n.protein).toBe(9.5)
    expect(n.fiber).toBe(16.5)
    expect(n.wholegrain).toBe(90)
    expect(n.salt).toBe(1.1)
    expect(n.sodium).toBe(440)
    expect(n.iron).toBe(3.2)
    expect(n.selenium).toBe(4)
    expect(n.thiamin).toBe(0)
    expect(n.magnesium).toBeUndefined()
    expect(n.zinc).toBeUndefined()
  })

  it('mappar via förkortningar och skalar värden som inte gäller 100 g', () => {
    const n = mapLmvNutrients(OL_ROWS)
    expect(n).toEqual({ kcal: 43, carbs: 3.1, protein: 0.4, alcohol: 4.1 })
  })

  it('räknar energi ur makron när energi saknas', () => {
    const n = mapLmvNutrients([row('Protein', 'PROT', 'Prot', 10, 'g'), row('Fett, totalt', 'FAT', 'Fett', 5, 'g')])
    expect(n.kcal).toBe(85)
  })

  it('tål skräp', () => {
    expect(mapLmvNutrients([])).toEqual({})
    expect(mapLmvNutrients([null as unknown as LmvNutrientRow, { namn: 'Protein' }])).toEqual({})
  })
})

describe('categorizeLmv', () => {
  it.each(NAME_CATEGORIES)('%s → %s', (name, category) => {
    expect(categorizeLmv(name).category).toBe(category)
  })

  it('markerar drycker, mejeri och soppor som flytande', () => {
    expect(categorizeLmv('Mjölk fett 3%').liquid).toBe(true)
    expect(categorizeLmv('Havredryck berikad').liquid).toBe(true)
    expect(categorizeLmv('Ärtsoppa med fläsk').liquid).toBe(true)
    expect(categorizeLmv('Mjölkpulver').liquid).toBe(false)
    expect(categorizeLmv('Ost hårdost fett 28%').liquid).toBe(false)
  })

  it('ger densitet för torrvaror och fetter så att dl och msk fungerar', () => {
    expect(categorizeLmv('Rapsolja').density).toBe(0.92)
    expect(categorizeLmv('Vetemjöl').density).toBe(0.6)
    expect(categorizeLmv('Potatismjöl').density).toBe(0.8)
    expect(categorizeLmv('Havregryn').density).toBe(0.35)
    expect(categorizeLmv('Strösocker').density).toBe(0.85)
    expect(categorizeLmv('Florsocker').density).toBe(0.6)
    expect(categorizeLmv('Ris jasmin okokt').density).toBe(0.85)
    expect(categorizeLmv('Ris jasmin kokt').density).toBeUndefined()
    expect(categorizeLmv('Mjölk fett 3%').density).toBeUndefined()
  })

  it('använder näringsvärden för läsk och alkohol', () => {
    expect(categorizeLmv('Läsk sockerfri', undefined, { sugars: 0 }).category).toBe('dryck')
    expect(categorizeLmv('Glögg', undefined, { alcohol: 8 }).category).toBe('alkohol')
    expect(categorizeLmv('Cider päron', undefined, { alcohol: 3.5 }).category).toBe('alkohol')
  })

  it('faller tillbaka på klassificeringar', () => {
    expect(categorizeLmv('Xyzprodukt', [{ typ: 'Livsmedelsgrupp', namn: 'Frukt, färsk' }]).category).toBe('frukt')
    expect(categorizeLmv('Xyzprodukt', [{ grupper: [{ namn: 'Fisk och skaldjur' }] }]).category).toBe('fisk')
    expect(categorizeLmv('Xyzprodukt').category).toBe('ovrigt')
  })
})

describe('mapLmvFood', () => {
  it('skapar ett Lagom-livsmedel', () => {
    expect(mapLmvFood(MJOLK, MJOLK_ROWS)).toMatchObject({
      id: 'lmv:1',
      name: 'Mjölk fett 3 %',
      source: 'livsmedelsverket',
      category: 'mejeri',
      portions: [],
      lmvNumber: 1,
      liquid: true,
    })
    const ol = mapLmvFood(OL, OL_ROWS)
    expect(ol.name).toBe('Öl starköl 5,2 %')
    expect(ol.category).toBe('alkohol')
    const lask = mapLmvFood(LASK, LASK_ROWS)
    expect(lask.category).toBe('dryck')
    expect(lask.nutrients.caffeine).toBe(10)
    const knacke = mapLmvFood(KNACKE, KNACKE_ROWS)
    expect(knacke.name).toBe('Knäckebröd fullkorn råg')
    expect(knacke.category).toBe('brod')
    expect(knacke.liquid).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Klient (fetch mockas)
// ---------------------------------------------------------------------------

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('klient', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('hämtar listan sidvis', async () => {
    const all = FIXTURES.map(([item]) => item)
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      const offset = Number(url.searchParams.get('offset'))
      const limit = Number(url.searchParams.get('limit'))
      expect(url.searchParams.get('sprak')).toBe('1')
      return json({ _meta: { totalRecords: all.length, offset, limit, count: 0 }, livsmedel: all.slice(offset, offset + limit) })
    })
    vi.stubGlobal('fetch', fetchMock)
    const pages: number[] = []
    const list = await fetchLmvFoodList({ pageSize: 4, onPage: (n) => pages.push(n) })
    expect(list.map((x) => x.nummer)).toEqual([1, 2, 3, 4, 5, 6])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${LMV_API_BASE}/livsmedel?offset=0&limit=4&sprak=1`)
    expect(pages).toEqual([4, 6])
  })

  it('gör omförsök vid serverfel', async () => {
    vi.useFakeTimers()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('Service Unavailable', { status: 503 }))
      .mockResolvedValueOnce(json(MJOLK_ROWS))
    vi.stubGlobal('fetch', fetchMock)
    const p = fetchLmvNutrients(1)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(await p).toEqual(MJOLK_ROWS)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${LMV_API_BASE}/livsmedel/1/naringsvarden?sprak=1`)
  })

  it('gör inga omförsök vid 404', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('Not found', { status: 404 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchLmvNutrients(999)).rejects.toMatchObject({ name: 'LivsmedelsverketError', code: 'bad_response', status: 404 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('importerar allt med begränsad samtidighet och hoppar över fel', async () => {
    const rowsByNumber = new Map(FIXTURES.map(([item, rows]) => [item.nummer, rows]))
    const list = [...FIXTURES.map(([item]) => item), { nummer: 404, namn: 'Saknas' }]
    let inflight = 0
    let maxInflight = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = new URL(String(input))
        if (url.pathname.endsWith('/livsmedel')) return json({ _meta: { totalRecords: list.length }, livsmedel: list })
        const nummer = Number(url.pathname.split('/').at(-2))
        inflight++
        maxInflight = Math.max(maxInflight, inflight)
        await new Promise((r) => setTimeout(r, 5))
        inflight--
        const rows = rowsByNumber.get(nummer)
        return rows ? json(rows) : new Response('Not found', { status: 404 })
      }),
    )
    const progress: LmvImportProgress[] = []
    const foods = []
    for await (const food of importAll({ concurrency: 2, onProgress: (p) => progress.push(p) })) foods.push(food)
    expect(foods.map((f) => f.id).sort()).toEqual(['lmv:1', 'lmv:2', 'lmv:3', 'lmv:4', 'lmv:5', 'lmv:6'])
    expect(maxInflight).toBeLessThanOrEqual(2)
    expect(maxInflight).toBe(2)
    const last = progress.at(-1)!
    expect(last).toEqual({ phase: 'naringsvarden', done: 6, total: 7, failed: 1 })
    expect(progress[0].phase).toBe('lista')
  })

  it('kan avbrytas', async () => {
    const ctrl = new AbortController()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = new URL(String(input))
        if (url.pathname.endsWith('/livsmedel')) return json({ _meta: { totalRecords: 6 }, livsmedel: FIXTURES.map(([i]) => i) })
        ctrl.abort()
        return json(MJOLK_ROWS)
      }),
    )
    const run = async () => {
      for await (const food of importAll({ signal: ctrl.signal, concurrency: 1 })) void food
    }
    await expect(run()).rejects.toMatchObject({ name: 'AbortError' })
  })
})

// ---------------------------------------------------------------------------
// Importskriptet – samma mappning som appen och ett helt körningsflöde
// ---------------------------------------------------------------------------

interface ScriptModule {
  normalizeSv: (s: string) => string
  mapNutrients: (rows: unknown[]) => Record<string, number>
  mapFood: (item: LmvListItem, rows: unknown[], classes?: unknown[]) => unknown
  categorize: (name: string, classes?: unknown[], nutrients?: Record<string, number>) => unknown
  MAPPING_TABLES: unknown
  ATTRIBUTION: string
  LICENSE: string
  LICENSE_URL: string
  LMV_CODES: Record<string, string>
  NUTRIENT_UNITS: Record<string, string>
  run: (opts: Record<string, unknown>) => Promise<{ count: number; failed: number[]; out: string }>
}

const SCRIPT_URL = new URL('../../scripts/import-livsmedelsverket.mjs', import.meta.url).href
const loadScript = async () => (await import(/* @vite-ignore */ SCRIPT_URL)) as ScriptModule

/**
 * Node-moduler importeras dynamiskt och löst typat: appens tsconfig saknar (med avsikt) Node-typer,
 * och en global referens till dem skulle påverka typerna i hela appen.
 */
type Loose = any
const nodeModule = (name: string): Promise<Loose> => import(/* @vite-ignore */ name)

describe('scripts/import-livsmedelsverket.mjs', () => {
  it('har samma tabeller som appen', async () => {
    const script = await loadScript()
    expect(script.MAPPING_TABLES).toEqual(LMV_MAPPING_TABLES)
    const codes: Record<string, string> = {}
    const units: Record<string, string> = {}
    for (const meta of Object.values(NUTRIENTS)) {
      units[meta.key] = meta.unit
      if (meta.lmvCode && meta.lmvCode !== 'ENERC_KCAL') codes[meta.lmvCode] = meta.key
    }
    expect(script.LMV_CODES).toEqual(codes)
    expect(script.NUTRIENT_UNITS).toEqual(units)
  })

  it('anger samma källa och licens (CC BY 4.0) som appen', async () => {
    const script = await loadScript()
    expect(LMV_ATTRIBUTION).toBe('Källa: Livsmedelsverkets livsmedelsdatabas (CC BY 4.0)')
    expect(LMV_LICENSE).toBe('CC BY 4.0')
    expect(LMV_LICENSE_URL).toBe('https://creativecommons.org/licenses/by/4.0/deed.sv')
    expect(script.ATTRIBUTION).toBe(LMV_ATTRIBUTION)
    expect(script.LICENSE).toBe(LMV_LICENSE)
    expect(script.LICENSE_URL).toBe(LMV_LICENSE_URL)
  })

  it('den medföljande databasfilen anger licensen i metadatan', async () => {
    const { readFile } = await nodeModule('node:fs/promises')
    const { fileURLToPath } = await nodeModule('node:url')
    const text: string = await readFile(fileURLToPath(new URL('../../public/data/livsmedelsverket.json', import.meta.url)), 'utf8')
    // Metadatan står på första raden (en rad per livsmedel därefter).
    const firstLine = text.slice(0, text.indexOf('\n'))
    const meta = JSON.parse(`${firstLine.replace(/,\s*$/, '')}}`).meta as Record<string, unknown>
    expect(meta).toMatchObject({ license: LMV_LICENSE, licenseUrl: LMV_LICENSE_URL, attribution: LMV_ATTRIBUTION })
  })

  it('normaliserar text som appen', async () => {
    const script = await loadScript()
    for (const s of ['Mjölk 1,5%', 'Crème Fraîche', 'Smørrebrød', "Ben & Jerry's", 'KYCKLINGBRÖSTFILÉ', 'mjölk 1.5 %', '  a  b  ']) {
      expect(script.normalizeSv(s)).toBe(normalizeSv(s))
    }
  })

  it('mappar fixturerna identiskt med appen', async () => {
    const script = await loadScript()
    for (const [item, rows] of FIXTURES) {
      expect(script.mapNutrients(rows)).toEqual(mapLmvNutrients(rows))
      expect(script.mapFood(item, rows)).toEqual(mapLmvFood(item, rows))
    }
    for (const [name] of NAME_CATEGORIES) expect(script.categorize(name)).toEqual(categorizeLmv(name))
    expect(script.categorize('Xyz', [{ namn: 'Frukt, färsk' }])).toEqual(categorizeLmv('Xyz', [{ namn: 'Frukt, färsk' }]))
    expect(script.categorize('Läsk sockerfri', undefined, { sugars: 0 })).toEqual(categorizeLmv('Läsk sockerfri', undefined, { sugars: 0 }))
  })

  it('hämtar hela databasen från ett API och skriver en fil som appen kan läsa', async () => {
    const script = await loadScript()
    const { createServer } = await nodeModule('node:http')
    const { mkdtemp, readFile, rm } = await nodeModule('node:fs/promises')
    const { tmpdir } = await nodeModule('node:os')
    const { join } = await nodeModule('node:path')
    const rowsByNumber = new Map(FIXTURES.map(([item, rows]) => [item.nummer, rows]))
    const list = [...FIXTURES.map(([item]) => item), { nummer: 404, namn: 'Saknas' }]
    const requests: string[] = []
    const server: Loose = createServer((req: Loose, res: Loose) => {
      const url = new URL(req.url ?? '/', 'http://localhost')
      requests.push(url.pathname + url.search)
      res.setHeader('Content-Type', 'application/json')
      if (url.pathname === '/api/v1/livsmedel') {
        const offset = Number(url.searchParams.get('offset'))
        const limit = Number(url.searchParams.get('limit'))
        res.end(JSON.stringify({ _meta: { totalRecords: list.length, offset, limit }, livsmedel: list.slice(offset, offset + limit) }))
        return
      }
      const m = url.pathname.match(/^\/api\/v1\/livsmedel\/(\d+)\/naringsvarden$/)
      const rows = m ? rowsByNumber.get(Number(m[1])) : undefined
      if (rows) res.end(JSON.stringify(rows))
      else {
        res.statusCode = 404
        res.end(JSON.stringify({ fel: 'saknas' }))
      }
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
    const dir: string = await mkdtemp(join(tmpdir(), 'lagom-lmv-'))
    try {
      const { port } = server.address() as { port: number }
      const out: string = join(dir, 'livsmedelsverket.json')
      const logs: string[] = []
      const result = await script.run({
        baseUrl: `http://127.0.0.1:${port}/api/v1`,
        out,
        pageSize: 3,
        concurrency: 4,
        delayMs: 0,
        progress: false,
        log: (m: string) => logs.push(m),
      })
      expect(result.count).toBe(6)
      expect(result.failed).toEqual([404])
      expect(requests.filter((r) => r.startsWith('/api/v1/livsmedel?'))).toEqual([
        '/api/v1/livsmedel?offset=0&limit=3&sprak=1',
        '/api/v1/livsmedel?offset=3&limit=3&sprak=1',
        '/api/v1/livsmedel?offset=6&limit=3&sprak=1',
      ])
      const text: string = await readFile(out, 'utf8')
      const parsed = JSON.parse(text) as { meta: Record<string, unknown>; foods: Array<{ id: string }> }
      expect(parsed.meta).toMatchObject({
        source: 'Livsmedelsverkets livsmedelsdatabas',
        attribution: 'Källa: Livsmedelsverkets livsmedelsdatabas (CC BY 4.0)',
        license: 'CC BY 4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by/4.0/deed.sv',
        count: 6,
        total: 7,
        partial: true,
        failed: [404],
        schema: 1,
      })
      expect(parsed.meta.version).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(parsed.foods.map((f) => f.id)).toEqual(['lmv:1', 'lmv:2', 'lmv:3', 'lmv:4', 'lmv:5', 'lmv:6'])
      expect(parsed.foods[0]).toEqual(mapLmvFood(MJOLK, MJOLK_ROWS))
      expect(logs.some((l) => l.includes('Källa: Livsmedelsverkets livsmedelsdatabas (CC BY 4.0)'))).toBe(true)
      // Appen accepterar filen.
      const dataset = parseLmvDataset(parsed)
      expect(dataset.foods).toHaveLength(6)
      expect(dataset.meta?.count).toBe(6)
      expect(dataset.meta?.version).toBe(parsed.meta.version)
    } finally {
      server.close()
      await rm(dir, { recursive: true, force: true })
    }
  })
})
