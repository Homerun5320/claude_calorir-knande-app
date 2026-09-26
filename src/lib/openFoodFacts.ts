/**
 * Open Food Facts – öppen produktdatabas (ODbL) för streckkoder och märkesvaror.
 *
 * Anropas direkt från användarens webbläsare (Open Food Facts tillåter CORS). Inga personuppgifter
 * skickas – bara streckkoden eller söksträngen.
 *
 * Omräkningar (Open Food Facts lagrar `*_100g` i gram för alla massenheter):
 * - vitaminer/mineraler i mg: g × 1 000, i µg: g × 1 000 000
 * - energi: `energy-kcal_100g`, annars `energy-kj_100g`/`energy_100g` (kJ) ÷ 4,184
 * - alkohol: `alcohol_100g` är volymprocent → g per 100 g ≈ % vol × 0,789 (etanolens densitet)
 * - drycker anges per 100 ml; Lagom räknar dem som per 100 g (≈ 100 ml) och markerar dem `liquid`.
 */
import type { Food, FoodCategory, FoodExtra, FoodTag, Nutrients, Portion } from '../types'
import { completeNutrients, KJ_PER_KCAL, type NutrientKey } from './nutrients'
import { formatNumber } from './format'

// ---------------------------------------------------------------------------
// Konfiguration och fel
// ---------------------------------------------------------------------------

export const OFF_PRODUCT_URL = 'https://world.openfoodfacts.org/api/v2/product'
/** Svenska sajten ger produkter som säljs i Sverige. */
export const OFF_SEARCH_URL = 'https://se.openfoodfacts.org/cgi/search.pl'
/** Tidsgräns per anrop. */
export const OFF_TIMEOUT_MS = 10_000
export const OFF_ATTRIBUTION = 'Produktdata från Open Food Facts (ODbL)'

/** Fält som hämtas – håller svaren små. */
export const OFF_FIELDS = [
  'code',
  'product_name',
  'product_name_sv',
  'generic_name_sv',
  'brands',
  'quantity',
  'product_quantity',
  'product_quantity_unit',
  'serving_size',
  'serving_quantity',
  'nutriments',
  'nutriscore_grade',
  'nova_group',
  'ingredients_text_sv',
  'ingredients_text',
  'allergens_tags',
  'labels_tags',
  'categories_tags',
  'image_front_small_url',
  'image_front_url',
  'countries_tags',
  'origins',
].join(',')

export type OffErrorCode =
  | 'offline'
  | 'timeout'
  | 'network'
  | 'server'
  | 'rate_limited'
  | 'invalid_barcode'
  | 'bad_response'
  | 'not_found'

/** Användarvänliga felmeddelanden på svenska. */
export const OFF_MESSAGES: Record<OffErrorCode, string> = {
  offline: 'Ingen internetanslutning. Kontrollera uppkopplingen och försök igen.',
  timeout: 'Open Food Facts svarar inte just nu. Försök igen om en stund.',
  network: 'Kunde inte nå Open Food Facts. Kontrollera uppkopplingen och försök igen.',
  server: 'Open Food Facts har tillfälliga problem. Försök igen lite senare.',
  rate_limited: 'Många sökningar på kort tid – vänta en liten stund och försök igen.',
  invalid_barcode: 'Streckkoden ser inte ut att stämma. Skanna igen eller skriv in siffrorna under streckkoden.',
  bad_response: 'Oväntat svar från Open Food Facts. Försök igen senare.',
  not_found: 'Produkten hittades inte i Open Food Facts.',
}

export class OpenFoodFactsError extends Error {
  readonly code: OffErrorCode
  readonly status?: number

  constructor(code: OffErrorCode, status?: number) {
    super(OFF_MESSAGES[code])
    this.name = 'OpenFoodFactsError'
    this.code = code
    this.status = status
  }
}

/** true om felet kommer från att anropet avbröts (t.ex. när användaren lämnar sidan). */
export function isAbortError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'AbortError'
}

// ---------------------------------------------------------------------------
// Streckkoder
// ---------------------------------------------------------------------------

/** Ta bort blanksteg och bindestreck från en inmatad streckkod. */
export function normalizeBarcode(code: string): string {
  return code.replace(/[\s-]/g, '')
}

/**
 * Kontrollerar en EAN-8-, UPC-A- (12 siffror), EAN-13- eller GTIN-14-kod med kontrollsiffra.
 */
export function isValidEan(code: string): boolean {
  const c = normalizeBarcode(code)
  if (!/^\d+$/.test(c) || ![8, 12, 13, 14].includes(c.length)) return false
  let sum = 0
  // Vikterna 3,1,3,1 … räknat från siffran närmast kontrollsiffran.
  for (let i = c.length - 2, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) sum += Number(c[i]) * w
  return (10 - (sum % 10)) % 10 === Number(c[c.length - 1])
}

// ---------------------------------------------------------------------------
// Råformat från Open Food Facts
// ---------------------------------------------------------------------------

export interface OffProduct {
  code?: string
  product_name?: string
  product_name_sv?: string
  generic_name_sv?: string
  brands?: string
  quantity?: string
  product_quantity?: number | string
  product_quantity_unit?: string
  serving_size?: string
  serving_quantity?: number | string
  nutriments?: Record<string, number | string | undefined>
  nutriscore_grade?: string
  nova_group?: number | string
  ingredients_text_sv?: string
  ingredients_text?: string
  allergens_tags?: string[]
  labels_tags?: string[]
  categories_tags?: string[]
  image_front_small_url?: string
  image_front_url?: string
  countries_tags?: string[]
  origins?: string
}

// ---------------------------------------------------------------------------
// Mappning
// ---------------------------------------------------------------------------

/** [OFF-nyckel utan _100g, Lagom-nyckel, faktor från OFF:s gram]. Första träffen vinner. */
const NUTRIENT_MAP: ReadonlyArray<readonly [string, NutrientKey, number]> = [
  ['proteins', 'protein', 1],
  ['carbohydrates', 'carbs', 1],
  ['sugars', 'sugars', 1],
  ['added-sugars', 'addedSugar', 1],
  ['fiber', 'fiber', 1],
  ['fat', 'fat', 1],
  ['saturated-fat', 'satFat', 1],
  ['monounsaturated-fat', 'monoFat', 1],
  ['polyunsaturated-fat', 'polyFat', 1],
  ['omega-3-fat', 'omega3', 1],
  ['cholesterol', 'cholesterol', 1e3],
  ['salt', 'salt', 1],
  ['sodium', 'sodium', 1e3],
  ['caffeine', 'caffeine', 1e3],
  ['vitamin-a', 'vitA', 1e6],
  ['vitamin-d', 'vitD', 1e6],
  ['vitamin-e', 'vitE', 1e3],
  ['vitamin-k', 'vitK', 1e6],
  ['vitamin-c', 'vitC', 1e3],
  ['vitamin-b1', 'thiamin', 1e3],
  ['vitamin-b2', 'riboflavin', 1e3],
  ['vitamin-pp', 'niacin', 1e3],
  ['vitamin-b3', 'niacin', 1e3],
  ['vitamin-b6', 'vitB6', 1e3],
  ['vitamin-b9', 'folate', 1e6],
  ['folates', 'folate', 1e6],
  ['vitamin-b12', 'vitB12', 1e6],
  ['calcium', 'calcium', 1e3],
  ['iron', 'iron', 1e3],
  ['magnesium', 'magnesium', 1e3],
  ['potassium', 'potassium', 1e3],
  ['phosphorus', 'phosphorus', 1e3],
  ['zinc', 'zinc', 1e3],
  ['selenium', 'selenium', 1e6],
  ['iodine', 'iodine', 1e6],
]

/** Näringsämnen som anges i gram och inte kan överstiga 100 g per 100 g. */
const MAX_100: ReadonlySet<NutrientKey> = new Set([
  'protein', 'carbs', 'sugars', 'addedSugar', 'fiber', 'fat', 'satFat', 'monoFat', 'polyFat', 'omega3', 'salt', 'alcohol',
])

/** Etanolens densitet, g/ml. */
const ETHANOL_DENSITY = 0.789

function num(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.replace(',', '.').replace(/[<>~≈\s]/g, ''))
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

/** Avrunda bort flyttalsbrus (0,37999999 → 0,38). */
const tidy = (v: number) => Number(v.toPrecision(6))

/** Energi i kcal per 100 g, eller undefined. Tar kcal i första hand och räknar annars om från kJ. */
function energyKcal(n: Record<string, unknown>): number | undefined {
  const kcal = num(n['energy-kcal_100g'])
  if (kcal !== undefined && kcal >= 0 && kcal <= 950) return tidy(kcal)
  const kj = num(n['energy-kj_100g']) ?? num(n['energy_100g'])
  if (kj !== undefined && kj >= 0 && kj <= 950 * KJ_PER_KCAL) return tidy(kj / KJ_PER_KCAL)
  return undefined
}

/** Näringsvärden per 100 g från OFF:s `nutriments`. Okända värden utelämnas (inte 0). */
export function mapOffNutriments(nutriments: Record<string, unknown> | undefined): Nutrients {
  const out: Nutrients = {}
  if (!nutriments) return out
  const kcal = energyKcal(nutriments)
  if (kcal !== undefined) out.kcal = kcal
  for (const [offKey, key, factor] of NUTRIENT_MAP) {
    if (out[key] !== undefined) continue
    const v = num(nutriments[`${offKey}_100g`])
    if (v === undefined || v < 0) continue
    if (MAX_100.has(key) && v > 100) continue
    out[key] = tidy(v * factor)
  }
  const alcVol = num(nutriments['alcohol_100g'])
  if (alcVol !== undefined && alcVol >= 0 && alcVol <= 100) out.alcohol = tidy(alcVol * ETHANOL_DENSITY)
  return out
}

/** true om energin är känd direkt eller kan räknas fram ur protein, kolhydrater och fett. */
function hasUsableEnergy(n: Nutrients): boolean {
  return n.kcal !== undefined || (n.protein !== undefined && n.carbs !== undefined && n.fat !== undefined)
}

/** true om livsmedlet har energi (och därmed går att logga meningsfullt). */
export function hasUsableNutrition(food: Pick<Food, 'nutrients'>): boolean {
  return food.nutrients.kcal !== undefined
}

// --- Kategorier ------------------------------------------------------------

/** Ordnade regler: första regeln där någon tagg finns i `categories_tags` vinner. */
const CATEGORY_RULES: ReadonlyArray<readonly [FoodCategory, readonly string[]]> = [
  ['kosttillskott', ['en:dietary-supplements', 'en:protein-powders', 'en:protein-bars', 'en:bodybuilding-supplements', 'en:meal-replacements', 'en:sports-nutrition']],
  ['alkohol', ['en:alcoholic-beverages', 'en:beers', 'en:wines', 'en:ciders', 'en:spirits', 'en:liquors', 'en:liqueurs']],
  ['vaxtdryck', ['en:plant-based-milk-alternatives', 'en:plant-milks', 'en:non-dairy-milk-alternatives', 'en:oat-based-drinks', 'en:soy-based-drinks', 'en:almond-based-drinks', 'en:rice-based-drinks']],
  ['juice', ['en:fruit-juices', 'en:juices', 'en:smoothies', 'en:fruit-nectars', 'en:nectars', 'en:vegetable-juices']],
  ['dryck', ['en:diet-sodas', 'en:artificially-sweetened-beverages', 'en:waters', 'en:mineral-waters', 'en:coffees', 'en:teas', 'en:coffee-drinks', 'en:tea-based-beverages']],
  ['lask_saft', ['en:sodas', 'en:carbonated-soft-drinks', 'en:energy-drinks', 'en:syrups', 'en:sweetened-beverages', 'en:soft-drinks', 'en:iced-teas', 'en:sports-drinks']],
  ['ost', ['en:cheeses']],
  ['fett_olja', ['en:butters', 'en:margarines', 'en:vegetable-oils', 'en:olive-oils', 'en:rapeseed-oils', 'en:fats', 'en:spreadable-fats', 'en:cooking-fats']],
  ['glass_dessert', ['en:ice-creams', 'en:frozen-desserts', 'en:sorbets', 'en:puddings', 'en:dairy-desserts']],
  ['mejeri', ['en:yogurts', 'en:milks', 'en:creams', 'en:fermented-milk-products', 'en:quarks', 'en:fresh-cheeses', 'en:sour-creams', 'en:dairy-drinks', 'en:dairies']],
  ['agg', ['en:eggs', 'en:chicken-eggs']],
  ['vegoprotein', ['en:meat-analogues', 'en:plant-based-meat-alternatives', 'en:meat-alternatives', 'en:tofu', 'en:tempeh', 'en:seitan']],
  ['snabbmat', ['en:pizzas', 'en:burgers', 'en:hamburgers', 'en:kebabs', 'en:fast-foods', 'en:hot-dogs', 'en:nuggets']],
  ['fardigratt', ['en:meals', 'en:prepared-meals', 'en:frozen-ready-meals', 'en:ready-meals', 'en:soups', 'en:quiches', 'en:lasagnas', 'en:sandwiches', 'en:prepared-salads']],
  ['chark', ['en:sausages', 'en:hams', 'en:bacon', 'en:salami', 'en:cold-cuts', 'en:prepared-meats', 'en:pates', 'en:liver-pates', 'en:cured-meats']],
  ['fagel', ['en:poultries', 'en:poultry', 'en:chickens', 'en:chicken', 'en:turkeys', 'en:ducks']],
  ['skaldjur', ['en:crustaceans', 'en:shrimps', 'en:prawns', 'en:mussels', 'en:shellfish', 'en:molluscs', 'en:crabs', 'en:lobsters']],
  ['fisk', ['en:fishes', 'en:fish-and-seafood', 'en:smoked-fishes', 'en:salmons', 'en:tunas', 'en:herrings', 'en:mackerels', 'en:cods', 'en:canned-fishes', 'en:fish-eggs', 'en:seafood']],
  ['rott_kott', ['en:meats', 'en:beef', 'en:pork', 'en:lamb-meat', 'en:game-meats', 'en:minced-meats']],
  ['snacks', ['en:chips-and-fries', 'en:crisps', 'en:chips', 'en:salty-snacks', 'en:popcorn', 'en:appetizers', 'en:puffed-salty-snacks']],
  ['notter_fron', ['en:nuts', 'en:seeds', 'en:nut-butters', 'en:peanut-butters', 'en:peanuts', 'en:almonds']],
  ['brod', ['en:breads', 'en:crispbreads', 'en:rusks', 'en:flatbreads', 'en:tortillas', 'en:toasts', 'en:sliced-breads']],
  ['spannmal', ['en:breakfast-cereals', 'en:mueslis', 'en:granolas', 'en:flakes', 'en:rolled-oats', 'en:oat-flakes', 'en:flours', 'en:porridges', 'en:cereal-grains']],
  ['pasta_ris', ['en:pastas', 'en:rices', 'en:noodles', 'en:couscous', 'en:bulgur', 'en:quinoa']],
  ['bakverk', ['en:biscuits', 'en:cakes', 'en:pastries', 'en:biscuits-and-cakes', 'en:viennoiseries', 'en:cookies', 'en:buns', 'en:sweet-pastries-and-pies', 'en:sweet-pies', 'en:waffles', 'en:muffins']],
  ['sotsaker', ['en:chocolates', 'en:candies', 'en:confectioneries', 'en:sweet-spreads', 'en:jams', 'en:marmalades', 'en:honeys', 'en:sugars', 'en:chewing-gum', 'en:chocolate-spreads', 'en:syrups-and-honeys']],
  ['baljvaxter', ['en:legumes', 'en:beans', 'en:lentils', 'en:chickpeas', 'en:peas', 'en:pulses', 'en:hummus']],
  ['sas_krydda', ['en:sauces', 'en:condiments', 'en:dressings', 'en:ketchup', 'en:mustards', 'en:mayonnaises', 'en:spices', 'en:herbs', 'en:broths', 'en:stocks', 'en:salts', 'en:vinegars', 'en:dips', 'en:pestos']],
  ['potatis', ['en:potatoes', 'en:french-fries', 'en:mashed-potatoes']],
  ['bar', ['en:berries', 'en:frozen-berries']],
  ['frukt', ['en:fruits', 'en:fresh-fruits', 'en:dried-fruits', 'en:fruit-purees', 'en:compotes', 'en:canned-fruits']],
  ['gronsaker', ['en:vegetables', 'en:fresh-vegetables', 'en:frozen-vegetables', 'en:canned-vegetables', 'en:mushrooms', 'en:salads', 'en:tomatoes']],
  ['dryck', ['en:beverages', 'en:drinks']],
]

/** Kategorier som är drycker (flytande, per 100 ml). */
const DRINK_CATEGORIES: ReadonlySet<FoodCategory> = new Set(['dryck', 'lask_saft', 'juice', 'alkohol', 'vaxtdryck'])
/** Mejeriprodukter som dricks eller mäts i dl. */
const LIQUID_DAIRY_TAGS = ['en:milks', 'en:fermented-milks', 'en:dairy-drinks', 'en:drinkable-yogurts', 'en:creams', 'en:buttermilks']

/** Gissa Lagoms kategori utifrån Open Food Facts kategoritaggar (och sockerhalt för drycker). */
export function offCategory(tags: readonly string[] | undefined, nutrients: Nutrients = {}): FoodCategory {
  const set = new Set(tags ?? [])
  for (const [cat, list] of CATEGORY_RULES) {
    if (!list.some((t) => set.has(t))) continue
    // Osötade/lightdrycker hör inte till läsk och saft.
    if ((cat === 'lask_saft' || (cat === 'dryck' && list.includes('en:beverages'))) && nutrients.sugars !== undefined) {
      return nutrients.sugars >= 1 ? 'lask_saft' : 'dryck'
    }
    return cat
  }
  return 'ovrigt'
}

// --- Allergener och märkningar ----------------------------------------------

const ALLERGENS: Record<string, string> = {
  'en:milk': 'mjölk',
  'en:gluten': 'gluten',
  'en:nuts': 'nötter',
  'en:eggs': 'ägg',
  'en:soybeans': 'soja',
  'en:fish': 'fisk',
  'en:crustaceans': 'kräftdjur',
  'en:peanuts': 'jordnötter',
  'en:sesame-seeds': 'sesam',
  'en:celery': 'selleri',
  'en:mustard': 'senap',
  'en:lupin': 'lupin',
  'en:molluscs': 'blötdjur',
  'en:sulphur-dioxide-and-sulphites': 'svaveldioxid/sulfit',
}

/** Allergener på svenska, i bokstavsordning och utan dubbletter. */
export function offAllergens(tags: readonly string[] | undefined): string[] {
  const out = new Set<string>()
  for (const tag of tags ?? []) {
    const sv = ALLERGENS[tag]
    if (sv) out.add(sv)
    else if (tag.startsWith('sv:')) out.add(tag.slice(3).replace(/-/g, ' '))
  }
  return [...out].sort((a, b) => a.localeCompare(b, 'sv'))
}

const LABELS: ReadonlyArray<{ tags: readonly string[]; label: string; tag?: FoodTag }> = [
  { tags: ['en:keyhole', 'en:nyckelhalet', 'sv:nyckelhalet', 'en:green-keyhole', 'en:the-keyhole'], label: 'Nyckelhålet', tag: 'nyckelhal' },
  { tags: ['en:krav', 'sv:krav', 'se:krav', 'en:krav-organic'], label: 'KRAV', tag: 'ekologisk' },
  { tags: ['en:eu-organic', 'en:organic', 'sv:ekologisk', 'en:ecological'], label: 'EU-ekologisk', tag: 'ekologisk' },
  { tags: ['en:svenskt-sigill', 'sv:svenskt-sigill', 'en:swedish-seal-of-quality'], label: 'Svenskt Sigill', tag: 'svensk' },
  { tags: ['sv:kott-fran-sverige', 'en:meat-from-sweden', 'en:kott-fran-sverige'], label: 'Kött från Sverige', tag: 'svensk' },
  { tags: ['sv:fran-sverige', 'en:from-sweden', 'en:made-in-sweden', 'en:produced-in-sweden'], label: 'Från Sverige', tag: 'svensk' },
  { tags: ['en:vegan', 'en:vegan-society-vegan', 'en:eu-vegan', 'en:v-label-vegan'], label: 'Vegansk', tag: 'vegan' },
  { tags: ['en:vegetarian', 'en:eu-vegetarian', 'en:v-label-vegetarian'], label: 'Vegetarisk', tag: 'vegetarisk' },
  { tags: ['en:gluten-free', 'en:no-gluten', 'en:crossed-grain-symbol'], label: 'Glutenfri', tag: 'glutenfri' },
  { tags: ['en:lactose-free', 'en:no-lactose'], label: 'Laktosfri', tag: 'laktosfri' },
  { tags: ['en:whole-grain', 'en:wholegrain', 'sv:fullkorn'], label: 'Fullkorn', tag: 'fullkorn' },
  { tags: ['en:fairtrade-international', 'en:fair-trade', 'en:fairtrade'], label: 'Fairtrade' },
  { tags: ['en:msc-sustainable-fishing', 'en:sustainable-seafood-msc', 'en:msc'], label: 'MSC' },
  { tags: ['en:asc-certified', 'en:aquaculture-stewardship-council', 'en:asc'], label: 'ASC' },
  { tags: ['en:rainforest-alliance'], label: 'Rainforest Alliance' },
]

/** Märkningar (svenska etiketter) och motsvarande Lagom-taggar. */
export function offLabels(tags: readonly string[] | undefined): { labels: string[]; tags: FoodTag[] } {
  const set = new Set(tags ?? [])
  const labels: string[] = []
  const foodTags = new Set<FoodTag>()
  for (const rule of LABELS) {
    if (!rule.tags.some((t) => set.has(t))) continue
    if (!labels.includes(rule.label)) labels.push(rule.label)
    if (rule.tag) foodTags.add(rule.tag)
  }
  if (foodTags.has('vegan')) foodTags.add('vegetarisk')
  return { labels, tags: [...foodTags] }
}

// --- Mängder och portioner -------------------------------------------------

const UNIT_GRAMS: Record<string, number> = { kg: 1000, g: 1, gr: 1, gram: 1, l: 1000, dl: 100, cl: 10, ml: 1 }
const VOLUME_UNITS = new Set(['l', 'dl', 'cl', 'ml'])

interface ParsedQuantity {
  /** Total vikt/volym i g (ml ≈ g). */
  grams: number
  /** Vikt per styck i flerpack. */
  unitGrams?: number
  count?: number
  volume: boolean
}

/** Tolka "500 g", "1,5 l", "6 x 33 cl", "4×125g". */
export function parseQuantity(text: string | undefined): ParsedQuantity | undefined {
  if (!text) return undefined
  const s = text.toLowerCase().replace(/,/g, '.')
  const multi = s.match(/(\d+)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*(kg|gr|gram|g|l|dl|cl|ml)\b/)
  if (multi) {
    const count = Number(multi[1])
    const unitGrams = Number(multi[2]) * UNIT_GRAMS[multi[3]]
    if (count > 0 && unitGrams > 0) return { grams: count * unitGrams, unitGrams, count, volume: VOLUME_UNITS.has(multi[3]) }
  }
  const single = s.match(/(\d+(?:\.\d+)?)\s*(kg|gr|gram|g|l|dl|cl|ml)\b/)
  if (single) {
    const grams = Number(single[1]) * UNIT_GRAMS[single[2]]
    if (grams > 0) return { grams, volume: VOLUME_UNITS.has(single[2]) }
  }
  return undefined
}

/** "30 g" → "1 portion (30 g)", "1 glas (250 ml)" behålls. Decimalpunkt blir decimalkomma. */
function servingLabel(size: string | undefined, grams: number, liquid: boolean): string {
  const s = size?.trim().replace(/(\d)\.(\d)/g, '$1,$2').replace(/\s+/g, ' ')
  if (!s) return `1 portion (${formatNumber(grams, 0)} ${liquid ? 'ml' : 'g'})`
  if (/^\d+(?:,\d+)?\s*(g|gr|gram|ml|cl|dl|l)\.?$/i.test(s)) return `1 portion (${s})`
  return s.length > 40 ? `1 portion (${formatNumber(grams, 0)} ${liquid ? 'ml' : 'g'})` : s
}

function buildPortions(p: OffProduct, liquid: boolean): Portion[] {
  const portions: Portion[] = []
  const serving = num(p.serving_quantity)
  if (serving !== undefined && serving > 0 && serving < 5000) {
    portions.push({ id: 'portion', label: servingLabel(p.serving_size, serving, liquid), grams: tidy(serving) })
  }
  const qty = parseQuantity(p.quantity)
  if (qty) {
    const sameAsServing = serving !== undefined && qty.unitGrams !== undefined && Math.abs(serving - qty.unitGrams) < 0.5
    if (qty.unitGrams && qty.count && qty.count > 1 && qty.unitGrams < 5000 && !sameAsServing) {
      const unitText = `${formatNumber(qty.unitGrams >= 1000 ? qty.unitGrams / 1000 : qty.unitGrams, 2)} ${qty.volume ? (qty.unitGrams >= 1000 ? 'l' : 'ml') : qty.unitGrams >= 1000 ? 'kg' : 'g'}`
      portions.push({ id: 'st', label: `1 st (${unitText})`, grams: tidy(qty.unitGrams) })
    }
    // Hela förpackningen som förval bara för små förpackningar (en burk, en bar, en bägare).
    const small = qty.grams <= (liquid ? 500 : 250)
    if (qty.grams < 5000 && (portions.length > 0 || small)) {
      portions.push({ id: 'forpackning', label: `Hela förpackningen (${p.quantity!.trim()})`, grams: tidy(qty.grams) })
    }
  }
  return portions
}

// --- Produkt → livsmedel ------------------------------------------------------

function clean(s: string | undefined): string | undefined {
  const t = s?.replace(/\s+/g, ' ').trim()
  return t ? t : undefined
}

function capitalizeFirst(s: string): string {
  return s.charAt(0).toLocaleUpperCase('sv-SE') + s.slice(1)
}

/**
 * Gör om en produkt från Open Food Facts till ett Lagom-livsmedel (id `off:<streckkod>`).
 * Returnerar null om produkten saknar streckkod.
 */
export function mapOffProduct(p: OffProduct, fallbackCode?: string): Food | null {
  const code = clean(p.code) ?? clean(fallbackCode)
  if (!code) return null
  const rawName = clean(p.product_name_sv) ?? clean(p.product_name) ?? clean(p.generic_name_sv)
  const baseNutrients = mapOffNutriments(p.nutriments)
  const nutrients = hasUsableEnergy(baseNutrients) ? completeNutrients(baseNutrients) : { ...baseNutrients }
  // completeNutrients kan räkna fram energi ur makron – avrunda så att värdena ser rimliga ut.
  if (nutrients.kcal !== undefined) nutrients.kcal = tidy(nutrients.kcal)
  if (nutrients.salt !== undefined) nutrients.salt = tidy(nutrients.salt)
  if (nutrients.sodium !== undefined) nutrients.sodium = tidy(nutrients.sodium)

  const categories = p.categories_tags ?? []
  const category = offCategory(categories, nutrients)
  const qty = parseQuantity(p.quantity)
  const liquid =
    DRINK_CATEGORIES.has(category) ||
    (category === 'mejeri' && (LIQUID_DAIRY_TAGS.some((t) => categories.includes(t)) || qty?.volume === true)) ||
    (category === 'ovrigt' && qty?.volume === true)

  const { labels, tags } = offLabels(p.labels_tags)
  const allergens = offAllergens(p.allergens_tags)
  const nutriscore = clean(p.nutriscore_grade)?.toLowerCase()
  const nova = num(p.nova_group)
  const extra: FoodExtra = {}
  if (nutriscore && /^[a-e]$/.test(nutriscore)) extra.nutriscore = nutriscore
  if (nova !== undefined && nova >= 1 && nova <= 4) extra.nova = Math.round(nova)
  const ingredients = clean(p.ingredients_text_sv) ?? clean(p.ingredients_text)
  if (ingredients) extra.ingredientsText = ingredients
  if (allergens.length > 0) extra.allergens = allergens
  const quantity = clean(p.quantity)
  if (quantity) extra.quantity = quantity
  const origin = clean(p.origins)
  if (origin) extra.origin = origin
  if (labels.length > 0) extra.labels = labels

  const brand = clean(p.brands?.split(',')[0])
  const notes = ['Från Open Food Facts – jämför gärna med förpackningen.']
  if (liquid) notes.push('Värdena gäller per 100 ml och räknas som 100 g.')

  const food: Food = {
    id: `off:${code}`,
    name: rawName ? capitalizeFirst(rawName) : `Okänd produkt (${code})`,
    source: 'openfoodfacts',
    category,
    nutrients,
    portions: buildPortions(p, liquid),
    note: notes.join(' '),
  }
  if (brand) food.brand = brand
  food.barcode = code
  if (liquid) food.liquid = true
  if (tags.length > 0) food.tags = tags
  const image = clean(p.image_front_small_url) ?? clean(p.image_front_url)
  if (image) food.imageUrl = image
  if (Object.keys(extra).length > 0) food.extra = extra
  return food
}

// ---------------------------------------------------------------------------
// Nätverk
// ---------------------------------------------------------------------------

function abortError(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('Avbrutet', 'AbortError')
}

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false

/**
 * Hämta JSON med tidsgräns och svenska felmeddelanden. Returnerar null för 404 när `allowNotFound`.
 */
async function offFetchJson(url: string, signal: AbortSignal | undefined, allowNotFound: boolean): Promise<unknown> {
  if (signal?.aborted) throw abortError(signal)
  if (isOffline()) throw new OpenFoodFactsError('offline')
  const ctrl = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    ctrl.abort()
  }, OFF_TIMEOUT_MS)
  const onAbort = () => ctrl.abort()
  signal?.addEventListener('abort', onAbort, { once: true })
  const failure = (): unknown => {
    if (signal?.aborted) return abortError(signal)
    if (timedOut) return new OpenFoodFactsError('timeout')
    if (isOffline()) return new OpenFoodFactsError('offline')
    return new OpenFoodFactsError('network')
  }
  try {
    let res: Response
    try {
      res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } })
    } catch {
      throw failure()
    }
    if (res.status === 404 && allowNotFound) return null
    if (res.status === 429) throw new OpenFoodFactsError('rate_limited', 429)
    if (res.status >= 500) throw new OpenFoodFactsError('server', res.status)
    if (!res.ok) throw new OpenFoodFactsError('bad_response', res.status)
    try {
      return await res.json()
    } catch {
      if (signal?.aborted || timedOut) throw failure()
      throw new OpenFoodFactsError('bad_response', res.status)
    }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

/**
 * Slå upp en produkt via streckkod. Returnerar null om produkten inte finns i Open Food Facts
 * (visa då `OFF_MESSAGES.not_found` och erbjud att skapa ett eget livsmedel).
 *
 * Produkter som saknar näringsvärden returneras ändå (med namn, bild och streckkod) så att
 * användaren kan komplettera – kontrollera med `hasUsableNutrition`.
 *
 * @throws OpenFoodFactsError vid ogiltig streckkod, nätverksfel, tidsgräns eller serverfel.
 *         Ett avbrutet anrop kastar signalens AbortError (kontrollera med `isAbortError`).
 */
export async function fetchProductByBarcode(code: string, signal?: AbortSignal): Promise<Food | null> {
  const barcode = normalizeBarcode(code)
  if (!isValidEan(barcode)) throw new OpenFoodFactsError('invalid_barcode')
  const url = `${OFF_PRODUCT_URL}/${barcode}.json?fields=${OFF_FIELDS}`
  const json = await offFetchJson(url, signal, true)
  if (json === null || typeof json !== 'object') return null
  const body = json as { status?: number | string; product?: OffProduct }
  if (Number(body.status) !== 1 || !body.product || typeof body.product !== 'object') return null
  return mapOffProduct(body.product, barcode)
}

export interface SearchProductsOptions {
  /** Sida, börjar på 1. */
  page?: number
  /** Antal per sida (max 50, standard 24). */
  pageSize?: number
  signal?: AbortSignal
}

/**
 * Sök produkter som säljs i Sverige. Returnerar bara produkter med användbara energivärden.
 * Open Food Facts begränsar antalet sökningar per minut – anropa vid uttrycklig sökning
 * (knapp/Enter), inte för varje tangenttryckning.
 *
 * @throws OpenFoodFactsError vid nätverksfel, tidsgräns, för många anrop eller serverfel.
 */
export async function searchProducts(query: string, opts: SearchProductsOptions = {}): Promise<Food[]> {
  const q = query.replace(/\s+/g, ' ').trim()
  if (!q) return []
  const params = new URLSearchParams({
    search_terms: q,
    search_simple: '1',
    action: 'process',
    json: '1',
    page_size: String(Math.min(50, Math.max(1, Math.floor(opts.pageSize ?? 24)))),
    page: String(Math.max(1, Math.floor(opts.page ?? 1))),
    sort_by: 'unique_scans_n',
    fields: OFF_FIELDS,
  })
  const json = await offFetchJson(`${OFF_SEARCH_URL}?${params.toString()}`, opts.signal, false)
  const products = (json as { products?: unknown } | null)?.products
  if (!Array.isArray(products)) throw new OpenFoodFactsError('bad_response')
  const seen = new Set<string>()
  const out: Food[] = []
  for (const raw of products) {
    if (!raw || typeof raw !== 'object') continue
    const food = mapOffProduct(raw as OffProduct)
    if (!food || !hasUsableNutrition(food) || seen.has(food.id)) continue
    seen.add(food.id)
    out.push(food)
  }
  return out
}
