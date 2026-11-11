/**
 * Receptimport: tolka recept från en webbsida (schema.org/Recipe i JSON-LD) och inklistrade
 * ingredienslistor ("2 dl vetemjöl", "1 st gul lök", "smör till formen").
 *
 * - `parseRecipeJsonLd` läser alla `<script type="application/ld+json">` i en HTML-sträng –
 *   med stöd för `@graph`, listor, `@type` som sträng eller lista, ingredienser i grupper
 *   (HowToSection/ItemList) eller som objekt, och portioner som tal, text eller lista – och plockar ut
 *   namn, portioner, tid och ingrediensrader. Instruktionerna importeras inte (bara länken sparas).
 *   Sidor med mikrodata får ett motsvarande JSON-LD-block av serverfunktionen (netlify/lib/recipeFetch.ts).
 *   Sidan är opålitlig: högst `MAX_IMPORT_INGREDIENTS` rader per recept, och antalet recept, block och
 *   besökta JSON-värden är begränsade så att en elak sida inte kan frysa appen.
 * - `parseIngredientLines` delar upp en ingredienslista i rader med mängd, enhet och namn – med
 *   fritextens `parseQuantity` (lib/freeText.ts) och receptens egna former ("ca", "2–3", "à 400 g",
 *   "1 msk + 1 tsk", "2 x 400 g"). Rader utan mängd markeras "kontrollera". Rubriker ("Sås:",
 *   "Till servering") hoppas över, och ett inklistrat helt recept läses bara fram till instruktionerna.
 * - `ingredientAmount` räknar om en tolkad rad till en enhet som livsmedlet har (gram, köksmått,
 *   portioner – och "g rå"/"dl okokt" för livsmedel som anges tillagade).
 *
 * Allt är rena funktioner (testas i `importRecipe.test.ts`).
 */
import type { Food, UnitKey, VolumeUnit } from '../../types'
import { parseSwedishNumber } from '../../lib/format'
import { amountFor, parseQuantity, type ParsedQuantity } from '../../lib/freeText'
import { foldSv } from '../../lib/search'
import { gramsFor, VOLUME_ML } from '../../lib/units'

// ---------------------------------------------------------------------------
// JSON-LD
// ---------------------------------------------------------------------------

export interface ImportedRecipe {
  name: string
  /** Antal portioner ("4 portioner" → 4, "ca 8 bitar" → 8). */
  servings?: number
  /** Total tid i minuter (totalTime, annars prepTime + cookTime). */
  totalMinutes?: number
  /** Ingrediensraderna som de står på sidan. */
  ingredients: string[]
  /** Receptets egen adress om sidan anger den. */
  url?: string
  /** Sidan hade fler än `MAX_IMPORT_INGREDIENTS` rader – bara de första är med. */
  truncated?: true
}

// Gränser för det som läses från en receptsida. Sidan är opålitlig data: ett JSON-LD-block på 1 MiB
// rymmer tiotusentals ingredienser, och varje rad blir en egen rad i granskningen (livsmedelssökning
// mot hela katalogen). Gränserna är rikliga för riktiga recept – de flesta har under 30 rader – men
// håller arbetet litet vad sidan än skickar.

/** Högsta antal ingrediensrader från ett recept (som mikrodata-vägen på servern) – och i en inklistrad lista. */
export const MAX_IMPORT_INGREDIENTS = 200
/** Högsta antal recept som tas ur en sida. */
const MAX_IMPORT_RECIPES = 20
/** Högsta antal JSON-LD-block som läses. */
const MAX_LD_BLOCKS = 30
/** Högsta antal JSON-värden (objekt, listor och strängar) som besöks på en hel sida. */
const MAX_JSON_NODES = 50_000
/** En ingrediensrad längre än så här (före rensning) är ingen ingrediens – hoppas över utan att tolkas. */
const MAX_RAW_LINE_CHARS = 2000
/** Längsta namn och adress som tas med från sidan. */
const MAX_IMPORT_NAME_CHARS = 200
const MAX_IMPORT_URL_CHARS = 2000

/** Återstående arbete för en sida (delas av alla block och recept). */
interface Budget {
  nodes: number
}

type Json = unknown
type Obj = Record<string, Json>

const isObj = (v: Json): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

/** "Recipe", "schema:Recipe", "https://schema.org/Recipe" – eller en lista som innehåller någon av dem. */
function isRecipeType(type: Json): boolean {
  const types = Array.isArray(type) ? type : [type]
  return types.some((t) => typeof t === 'string' && /(^|[/:])Recipe$/i.test(t.trim()))
}

/** Avkoda HTML-entiteter och ta bort taggar ("Mormors k&ouml;ttbullar" → "Mormors köttbullar"). */
export function cleanText(value: string): string {
  let text = value
  if (/[<&]/.test(text) && typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(`<!doctype html><body>${text}`, 'text/html')
    text = doc.body.textContent ?? ''
  }
  return text.replace(/\s+/g, ' ').trim()
}

/** Nästlingsdjup som läses i värden från sidan – en elak sida kan inte spränga anropsstacken. */
const MAX_VALUE_DEPTH = 6

function textOf(v: Json, depth = 0): string | undefined {
  if (depth > MAX_VALUE_DEPTH) return undefined
  if (typeof v === 'string') return cleanText(v) || undefined
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  if (isObj(v)) return textOf(v.text ?? v.name ?? v['@value'], depth + 1)
  if (Array.isArray(v)) {
    for (const x of v) {
      const t = textOf(x, depth + 1)
      if (t) return t
    }
  }
  return undefined
}

/** Första talet i en text: "ca 8 bitar" → 8, "4–6 portioner" → 4, "2,5" → 2,5. */
function firstNumber(text: string): number | undefined {
  const m = text.match(/\d+(?:[.,]\d+)?/)
  if (!m) return undefined
  const n = parseSwedishNumber(m[0])
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/** Tal följt av ett portionsord ("4 portioner", "4 pers", "serves 4" räknas via firstNumber). */
const YIELD_PORTIONS = /(\d+(?:[.,]\d+)?)(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?\s*(?:portioner|portion|port\b|personer|person|pers\b|servings?|serves)/iu
/** Tal följt av ett styckord ("1 långpanna, ca 24 bitar" → 24 bitar är bättre än 1 långpanna). */
const YIELD_PIECES = /(\d+(?:[.,]\d+)?)(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?\s*(?:bitar|bit\b|st\b|stycken|styck|bullar|kakor|skivor|rutor|muffins|pannkakor|glas|koppar)/iu

function yieldNumber(text: string, re: RegExp): number | undefined {
  const m = re.exec(text)
  if (!m) return undefined
  const n = parseSwedishNumber(m[1])
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/**
 * recipeYield som tal: tal, text ("4 portioner", "ca 8 bitar") eller lista. Portioner går före
 * styck ("1 långpanna (ca 24 bitar)" → 24), och annars gäller första talet.
 */
export function parseYield(v: Json): number | undefined {
  const texts: string[] = []
  const gather = (x: Json, depth: number) => {
    if (depth > 3) return
    if (typeof x === 'number') texts.push(Number.isFinite(x) && x > 0 ? String(x) : '')
    else if (typeof x === 'string') texts.push(x)
    else if (Array.isArray(x)) for (const y of x) gather(y, depth + 1)
    else if (isObj(x)) {
      const value = x.value ?? x['@value'] ?? x.maxValue ?? x.minValue
      const unit = typeof x.unitText === 'string' ? x.unitText : ''
      if (typeof value === 'number' || typeof value === 'string') texts.push(`${value} ${unit}`.trim())
    }
  }
  gather(v, 0)
  for (const re of [YIELD_PORTIONS, YIELD_PIECES]) {
    for (const t of texts) {
      const n = yieldNumber(t, re)
      if (n !== undefined) return Math.max(1, Math.round(n))
    }
  }
  for (const t of texts) {
    const n = firstNumber(t)
    if (n !== undefined) return Math.max(1, Math.round(n))
  }
  return undefined
}

const DURATION_NUM = String.raw`(\d+(?:[.,]\d+)?)`
const ISO_DURATION = new RegExp(
  `^P(?:${DURATION_NUM}Y)?(?:${DURATION_NUM}M)?(?:${DURATION_NUM}W)?(?:${DURATION_NUM}D)?(?:T(?:${DURATION_NUM}H)?(?:${DURATION_NUM}M)?(?:${DURATION_NUM}S)?)?$`,
  'i',
)

/**
 * ISO 8601-tid i minuter: "PT45M" → 45, "PT1H10M" → 70, "P0DT2H" → 120, "PT90S" → 2,
 * "P0Y0M0DT0H45M0.000S" → 45. År och månader godtas bara som 0.
 */
export function parseIsoDuration(v: Json): number | undefined {
  if (typeof v !== 'string') return undefined
  const text = v.trim().toUpperCase()
  const m = ISO_DURATION.exec(text)
  if (!m || text === 'P' || text.endsWith('T')) return undefined
  const num = (s: string | undefined) => (s ? Number(s.replace(',', '.')) : 0)
  if (num(m[1]) > 0 || num(m[2]) > 0) return undefined
  const minutes = num(m[3]) * 7 * 1440 + num(m[4]) * 1440 + num(m[5]) * 60 + num(m[6]) + num(m[7]) / 60
  return Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : undefined
}

const TEXT_DURATION = /(\d+(?:[.,]\d+)?)\s*(dygn|dagar|dag|timmar|timme|tim|h|minuter|minut|min|m)(?![\p{L}])/giu

/**
 * Tid i minuter: ISO 8601, ett tal (minuter) eller svensk text ("30 minuter", "1 tim 15 min", "ca 1 h").
 */
export function parseRecipeDuration(v: Json): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? Math.round(v) : undefined
  if (typeof v !== 'string') return undefined
  const iso = parseIsoDuration(v)
  if (iso !== undefined) return iso
  const text = v.trim()
  if (/^\d+(?:[.,]\d+)?$/.test(text)) {
    const n = parseSwedishNumber(text)
    return n > 0 ? Math.round(n) : undefined
  }
  let minutes = 0
  for (const m of text.matchAll(TEXT_DURATION)) {
    const n = parseSwedishNumber(m[1])
    const unit = m[2].toLowerCase()
    minutes += unit === 'dygn' || unit.startsWith('dag') ? n * 1440 : unit === 'h' || unit.startsWith('tim') ? n * 60 : n
  }
  return Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : undefined
}

/** Mängden i ett ingrediensobjekt (HowToSupply: requiredQuantity 2 + unitText "dl"). */
function quantityText(v: Json, depth = 0): string {
  if (depth > MAX_VALUE_DEPTH) return ''
  if (typeof v === 'number' && Number.isFinite(v)) return String(v).replace('.', ',')
  if (typeof v === 'string') return cleanText(v)
  if (isObj(v)) {
    const value = quantityText(v.value ?? v['@value'], depth + 1)
    const unit = typeof v.unitText === 'string' ? cleanText(v.unitText) : ''
    return `${value} ${unit}`.trim()
  }
  return ''
}

/**
 * Ingrediensraderna läggs i `out`: strängar (även flera rader i en sträng, med radbrytningar eller
 * <br>), listor, grupper (HowToSection/ItemList med itemListElement) och objekt (HowToSupply,
 * ListItem). Läsningen slutar när `out` har `MAX_IMPORT_INGREDIENTS + 1` rader (en extra så att
 * anroparen ser att det fanns fler) eller när sidans arbetsbudget är slut.
 */
function collectIngredients(v: Json, out: string[], budget: Budget, depth = 0): void {
  if (depth > 5 || out.length > MAX_IMPORT_INGREDIENTS || budget.nodes <= 0) return
  budget.nodes--
  if (typeof v === 'string') {
    for (const line of v.split(/\r?\n|<br\s*\/?>/i)) {
      if (out.length > MAX_IMPORT_INGREDIENTS) return
      if (line.length > MAX_RAW_LINE_CHARS) continue
      const text = cleanText(line)
      if (text) out.push(text)
    }
    return
  }
  if (Array.isArray(v)) {
    for (const x of v) {
      if (out.length > MAX_IMPORT_INGREDIENTS || budget.nodes <= 0) return
      collectIngredients(x, out, budget, depth + 1)
    }
    return
  }
  if (!isObj(v)) return
  if (v.itemListElement !== undefined) return collectIngredients(v.itemListElement, out, budget, depth + 1)
  if (v.recipeIngredient !== undefined) return collectIngredients(v.recipeIngredient, out, budget, depth + 1)
  if (isObj(v.item)) return collectIngredients(v.item, out, budget, depth + 1)
  const name = textOf(v.name ?? v.text ?? v['@value'] ?? v.item)
  if (!name) return
  const amount = quantityText(v.requiredQuantity ?? v.amount ?? v.quantity, depth)
  out.push(amount && !name.startsWith(amount) ? `${amount} ${name}` : name)
}

function toRecipe(o: Obj, budget: Budget): ImportedRecipe | null {
  const name = (textOf(o.name) ?? textOf(o.headline))?.slice(0, MAX_IMPORT_NAME_CHARS).trim()
  const lines: string[] = []
  collectIngredients(o.recipeIngredient ?? o.ingredients, lines, budget)
  const truncated = lines.length > MAX_IMPORT_INGREDIENTS
  const ingredients = truncated ? lines.slice(0, MAX_IMPORT_INGREDIENTS) : lines
  if (!name && ingredients.length === 0) return null
  const total = parseRecipeDuration(o.totalTime)
  const prep = parseRecipeDuration(o.prepTime)
  const cook = parseRecipeDuration(o.cookTime)
  const minutes = total ?? (prep !== undefined || cook !== undefined ? (prep ?? 0) + (cook ?? 0) : undefined)
  const recipe: ImportedRecipe = { name: name || 'Importerat recept', ingredients }
  if (truncated) recipe.truncated = true
  const servings = parseYield(o.recipeYield ?? o.yield)
  if (servings !== undefined) recipe.servings = servings
  if (minutes !== undefined && minutes > 0) recipe.totalMinutes = minutes
  const url = typeof o.url === 'string' ? o.url : typeof o['@id'] === 'string' ? o['@id'] : undefined
  if (url && url.length <= MAX_IMPORT_URL_CHARS && /^https?:\/\//i.test(url)) recipe.url = url
  return recipe
}

/** Leta igenom JSON-LD (listor, @graph och nästlade objekt som mainEntity) efter recept. */
function collect(node: Json, out: ImportedRecipe[], depth: number, budget: Budget): void {
  if (depth > 6 || out.length >= MAX_IMPORT_RECIPES || budget.nodes <= 0) return
  budget.nodes--
  if (Array.isArray(node)) {
    for (const x of node) {
      if (out.length >= MAX_IMPORT_RECIPES || budget.nodes <= 0) return
      collect(x, out, depth + 1, budget)
    }
    return
  }
  if (!isObj(node)) return
  if (isRecipeType(node['@type'])) {
    const r = toRecipe(node, budget)
    if (r) out.push(r)
    return
  }
  for (const [key, value] of Object.entries(node)) {
    if (out.length >= MAX_IMPORT_RECIPES || budget.nodes <= 0) return
    if (key === '@context') continue
    if (typeof value === 'object' && value !== null) collect(value, out, depth + 1, budget)
  }
}

/** JSON som kan ha skräp runt sig (kommentarer, CDATA) – eller vara ogiltig. */
function parseJsonBlock(text: string): Json | undefined {
  const cleaned = text
    .replace(/^\s*<!\[CDATA\[/, '')
    .replace(/\]\]>\s*$/, '')
    .replace(/^\s*<!--/, '')
    .replace(/-->\s*$/, '')
    .trim()
  if (!cleaned) return undefined
  // Vanliga fel på receptsidor: råa radbrytningar i strängar och kommatecken före } eller ].
  const attempts = [cleaned, cleaned.replace(/[\r\n\t]+/g, ' '), cleaned.replace(/[\r\n\t]+/g, ' ').replace(/,\s*([}\]])/g, '$1')]
  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt) as Json
    } catch {
      /* prova nästa */
    }
  }
  return undefined
}

/**
 * Alla recept (schema.org/Recipe) i en HTML-strängs JSON-LD-block. Tom lista om inget recept finns.
 */
export function parseRecipeJsonLd(html: string): ImportedRecipe[] {
  if (typeof html !== 'string' || html.trim() === '' || typeof DOMParser === 'undefined') return []
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const out: ImportedRecipe[] = []
  const budget: Budget = { nodes: MAX_JSON_NODES }
  let blocks = 0
  for (const script of Array.from(doc.querySelectorAll('script'))) {
    const type = (script.getAttribute('type') ?? '').toLowerCase()
    if (!type.includes('ld+json')) continue
    if (++blocks > MAX_LD_BLOCKS || out.length >= MAX_IMPORT_RECIPES || budget.nodes <= 0) break
    const json = parseJsonBlock(script.textContent ?? '')
    if (json !== undefined) collect(json, out, 0, budget)
  }
  return out
}

// ---------------------------------------------------------------------------
// Ingrediensrader
// ---------------------------------------------------------------------------

/** Måttenheter som räknas om direkt – övriga enhetsord är portionsord ("klyfta", "burk"). */
const MEASURE_UNITS: ReadonlySet<string> = new Set(['g', 'hg', 'kg', 'ml', 'cl', 'dl', 'l', 'msk', 'tsk', 'krm'])
/** Förpackningsord som får matcha varandra ("1 förp" ↔ portionen "1 paket"). */
const PACK_WORDS: readonly string[] = ['förpackning', 'paket', 'burk', 'påse', 'ask']
/** Enheter för en förpacknings storlek ("à 400 g", "(5 dl)"). */
const SIZE_UNITS: Readonly<Record<string, string>> = { g: 'g', gr: 'g', gram: 'g', hg: 'hg', kg: 'kg', ml: 'ml', cl: 'cl', dl: 'dl', l: 'l', liter: 'l' }

const NUM = String.raw`\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d*\s?[½¼¾⅓⅔]|\d+(?:[.,]\d+)?`
/** "ca 2 dl", "cirka 500 g", "ev. 1 tsk". */
const APPROX_RE = /^(?:ca\.?|cirka|ungefär|omkring|ev\.?|eventuellt)\s+/iu
/** Intervall i början: "2–3 klyftor", "4-5 dl". */
const RANGE_RE = new RegExp(String.raw`^(${NUM})\s*[-–—]\s*(${NUM})(?=\s|$|\p{L})`, 'u')
/** Förpackningens storlek: "à 400 g", "(à 400 g)", "á 2,5 dl". */
const EACH_RE = new RegExp(String.raw`(?:^|\s)\(?\s*(?:à|á|a)\s+(?:ca\.?\s+)?(${NUM})\s*(\p{L}+)\.?\s*\)?(?=\s|$|,)`, 'iu')
/** Storlek inom parentes efter ett förpackningsord: "1 burk krossade tomater (400 g)". */
const PACK_SIZE_RE = new RegExp(String.raw`\(\s*(?:ca\.?\s+)?(${NUM})\s*(\p{L}+)\.?\s*\)`, 'iu')
/** Total vikt inom parentes efter styck eller portioner: "2 kycklingfiléer (ca 300 g)", "1 kyckling (ca 1,2 kg)". */
const WEIGHT_NOTE_RE = new RegExp(String.raw`\(\s*(?:(?:ca\.?|cirka|ungefär)\s+)?(${NUM})\s*(g|gr|gram|hg|kg)\.?\s*\)`, 'iu')

/** Mått som kan läggas ihop eller multipliceras, med storlek i ml respektive g. */
const SUMMABLE = String.raw`krm|tsk|msk|ml|cl|dl|l|liter|g|gr|gram|hg|kg`
/** "1 msk + 1 tsk olja", "1 dl och 2 msk vatten" – två mått av samma slag läggs ihop. */
const SUM_RE = new RegExp(String.raw`^(${NUM})\s*(${SUMMABLE})\.?\s*(?:\+|och|plus)\s*(${NUM})\s*(${SUMMABLE})\.?(?=\s|$)`, 'iu')
/** "2 x 400 g krossade tomater", "2 × 5 dl buljong". */
const TIMES_RE = new RegExp(String.raw`^(${NUM})\s*(?:st\.?\s*)?[x×*]\s*(${NUM})\s*(${SUMMABLE})\.?(?=\s|$)`, 'iu')
const WEIGHT_G: Readonly<Record<string, number>> = { g: 1, gr: 1, gram: 1, hg: 100, kg: 1000 }
const VOLUME: Readonly<Record<string, number>> = { ...VOLUME_ML, liter: 1000 }

const round3 = (v: number) => Math.round(v * 1000) / 1000
const own = (obj: object, key: string) => Object.prototype.hasOwnProperty.call(obj, key)
const swedish = (n: number) => String(round3(n)).replace('.', ',')

/**
 * Summan av två mått av samma slag i det största av måtten som ger ett jämnt tal
 * ("1 dl + 2 msk" → "1,3 dl", "1 msk + 1 tsk" → "4 tsk"). undefined om de inte går att lägga ihop.
 */
function sumMeasures(a: number, unitA: string, b: number, unitB: string): string | undefined {
  const ua = unitA.toLocaleLowerCase('sv-SE')
  const ub = unitB.toLocaleLowerCase('sv-SE')
  const table = own(VOLUME, ua) && own(VOLUME, ub) ? VOLUME : own(WEIGHT_G, ua) && own(WEIGHT_G, ub) ? WEIGHT_G : undefined
  if (!table || !(a > 0) || !(b > 0)) return undefined
  const total = a * table[ua] + b * table[ub]
  const [lo, hi] = [Math.min(table[ua], table[ub]), Math.max(table[ua], table[ub])]
  // Måtten i raden och köksmåtten mellan dem ("2 msk + 1 krm" → "6,2 tsk"), störst först.
  const kitchen = table === VOLUME ? ['l', 'dl', 'msk', 'tsk', 'krm'] : ['kg', 'hg', 'g']
  const units = [...new Set([ua, ub, ...kitchen.filter((u) => table[u] >= lo && table[u] <= hi)])].sort((x, y) => table[y] - table[x])
  const even = units.find((u) => {
    const x = (total / table[u]) * 10
    return Math.abs(x - Math.round(x)) < 1e-6
  })
  const unit = even ?? units[units.length - 1]
  return `${swedish(total / table[unit])} ${unit}`
}

/**
 * Mängd, enhet och namn i en ingrediensrad. Bygger på fritextens `parseQuantity` (tal, bråk,
 * talord, mått och portionsord) och lägger till det som är vanligt i recept:
 * "ca 1 kg potatis", intervall ("2–3 klyftor vitlök" → 2,5), förkortningar med punkt ("3 msk. olja",
 * "1 förp. tomater"), förpackningar med storlek ("2 burkar krossade tomater (à 400 g)" → 800 g),
 * sammansatta mått ("1 msk + 1 tsk" → 4 tsk), multiplikation ("2 x 400 g" → 800 g) och bråkstreck ("1⁄2").
 */
export function parseRecipeQuantity(text: string): ParsedQuantity {
  const raw = text.trim()
  // Bråkstreck ("1⁄2") som vanliga snedstreck.
  let s = raw.replace(/\s+/g, ' ').replace(/[\u2044\u2215]/g, '/').replace(APPROX_RE, '')
  const sum = SUM_RE.exec(s)
  const summed = sum ? sumMeasures(parseSwedishNumber(sum[1]), sum[2], parseSwedishNumber(sum[3]), sum[4]) : undefined
  if (sum && summed) s = `${summed}${s.slice(sum[0].length)}`
  const times = TIMES_RE.exec(s)
  if (times) {
    const product = parseSwedishNumber(times[1]) * parseSwedishNumber(times[2])
    if (product > 0) s = `${swedish(product)} ${times[3]}${s.slice(times[0].length)}`
  }
  const range = RANGE_RE.exec(s)
  if (range) {
    const a = parseSwedishNumber(range[1])
    const b = parseSwedishNumber(range[2])
    if (a > 0 && b > a) s = `${String(round3((a + b) / 2)).replace('.', ',')}${s.slice(range[0].length)}`
  }
  s = s
    .replace(/(^|\s)(msk|tsk|krm|st|dl|cl|ml|kg|hg|gr|g|l|förp|fp|pkt|port)\.(?=\s|$)/giu, '$1$2')
    .replace(/^(\S+\s+)(förp|fp)(?=\s)/iu, '$1förpackning')
    .replace(/^(\S+\s+)pkt(?=\s)/iu, '$1paket')
    .replace(/^(\S+\s+)port(?=\s)/iu, '$1portioner')

  const parsed = parseQuantity(s)
  // "Gul lök, 1 st" – skiljetecknet före mängden hör inte till namnet.
  const q = { ...parsed, name: parsed.name.replace(/\s*[,;:]+$/u, '') }
  const withoutMatch = (m: RegExpExecArray) =>
    `${q.name.slice(0, m.index)} ${q.name.slice(m.index + m[0].length)}`.replace(/\s+/g, ' ').replace(/^[,\s]+/, '').trim()
  if (q.unit === undefined || !MEASURE_UNITS.has(q.unit)) {
    const pack = q.unit !== undefined && PACK_WORDS.includes(q.unit)
    const each = EACH_RE.exec(q.name) ?? (pack ? PACK_SIZE_RE.exec(q.name) : null)
    const inner = each ? parseSwedishNumber(each[1]) : Number.NaN
    const innerUnit = each ? SIZE_UNITS[each[2].toLocaleLowerCase('sv-SE')] : undefined
    if (each && inner > 0 && innerUnit) {
      return { amount: round3((q.amount ?? 1) * inner), unit: innerUnit, name: withoutMatch(each), raw }
    }
    // "2 kycklingfiléer (ca 300 g)": vikten inom parentes är hela mängden och säkrare än en styckportion.
    const note = pack ? null : WEIGHT_NOTE_RE.exec(q.name)
    const total = note ? parseSwedishNumber(note[1]) : Number.NaN
    const totalUnit = note ? SIZE_UNITS[note[2].toLocaleLowerCase('sv-SE')] : undefined
    if (note && total > 0 && totalUnit) {
      return { amount: round3(total), unit: totalUnit, name: withoutMatch(note), raw }
    }
  }
  return { ...q, ...(q.amount !== undefined ? { amount: round3(q.amount) } : {}), raw }
}

export interface ParsedIngredientLine {
  /** Raden som den skrevs (utan punkttecken). */
  raw: string
  amount?: number
  /** Mått ('g', 'dl', 'msk' …), 'st' eller ett portionsord i singular ("klyfta", "burk"). */
  unit?: string
  /** Storleksord ("1 stor gul lök"). */
  size?: ParsedQuantity['size']
  /** Livsmedlets namn att söka på ("gul lök", "smör"). */
  name: string
  /** Mängd saknas ("smör till formen", "salt och peppar") – användaren behöver kontrollera raden. */
  check: boolean
}

/** Tillagningsord som inte hjälper sökningen ("finhackad lök" → "lök"). */
const PREP_WORDS = new Set([
  'finhackad', 'finhackade', 'hackad', 'hackade', 'grovhackad', 'grovhackade', 'riven', 'rivet', 'rivna', 'finriven', 'finrivet', 'finrivna',
  'skivad', 'skivade', 'tärnad', 'tärnade', 'strimlad', 'strimlade', 'pressad', 'pressade', 'smält', 'smälta',
  'rumsvarm', 'rumsvarmt', 'rumsvarma', 'delad', 'delade', 'skalad', 'skalade', 'urkärnad', 'urkärnade', 'färsk', 'färska',
  'färskt', 'ca', 'ev', 'ev.', 'gärna', 'cirka', 'ungefär', 'stor', 'stora', 'stort', 'liten', 'litet', 'små', 'medelstor', 'medelstora',
])

/** Hur ingrediensen skärs ("lax i bitar", "potatis i klyftor") – hör inte till namnet. */
const CUT_PHRASE = /\s+i\s+(?:(?:små|mindre|stora|större|tunna|grova|jämna)\s+)?(?:bitar|tärningar|skivor|klyftor|strimlor|kuber|ringar|stavar|slantar|remsor|halvor|fjärdedelar)\b.*$/iu

/** Vanliga kortformer i recept → livsmedlets namn ("1 msk soja" är sojasås, inte sojafärs). */
const RECIPE_SHORTHAND: Readonly<Record<string, string>> = { soja: 'sojasås', 'japansk soja': 'sojasås', 'kinesisk soja': 'sojasås' }

/**
 * Sökord för en ingrediens: utan parenteser, allt efter kommatecken, "till …", "i bitar" och
 * tillagningsord. Vid alternativ gäller det första ("blandfärs eller nötfärs", "smör/margarin").
 */
export function ingredientQuery(text: string): string {
  let s = text
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+(till|för|att|efter)\s+.*$/i, '')
    .replace(CUT_PHRASE, '')
    .split(/[,;+]|\s+eller\s+|\s*\/\s*/i)[0]
  s = s
    .split(/\s+/)
    .filter((w) => w && !PREP_WORDS.has(w.toLocaleLowerCase('sv-SE').replace(/[.,]$/, '')))
    .join(' ')
  const query = s.replace(/^(av|med)\s+/i, '').trim()
  const lower = query.toLocaleLowerCase('sv-SE')
  return own(RECIPE_SHORTHAND, lower) ? RECIPE_SHORTHAND[lower] : query
}

/** Punkttecken i början av en rad ("- ", "• ", "* "). */
const BULLET = /^\s*(?:[-–—•*·▪◦]+)\s*/

/** Rubriker i en ingredienslista ("Ingredienser", "Sås", "Till servering") – inga livsmedel. */
const HEADING = /^(?:ingredienser|ingredienslista|ingrediens|du behöver|det här behöver du|detta behöver du|så här mycket|tillbehör|servering|garnering|sås|fyllning|marinad|deg|smet|glasyr|botten|kräm|topping|frosting|till\s+\p{L}+(?:\s+\p{L}+)?)$/iu
/** Där instruktionerna börjar i ett inklistrat recept – resten är inga ingredienser. */
const INSTRUCTIONS = /^(?:gör så här|så här gör du|så gör du|gör så|instruktioner|instruktion|tillagning|tillvägagångssätt|beskrivning|steg för steg|arbetsgång)$/iu
/** Uppgifter om receptet ("Portioner: 4", "Tid: 30 min"). */
const RECIPE_FACT = /^(?:portioner|antal portioner|antal|tid|total tid|tillagningstid|svårighetsgrad|energi|kalorier|näringsvärde\p{L}*|betyg)\s*:/iu
/** Ett numrerat steg ("1. Sätt ugnen på 200 grader", "Steg 2: …"). */
const STEP = /^(?:steg\s*\d+\s*[.:)]?|\d+\s*[.)])\s+\p{Lu}/u
/** Rader som bara säger hur mycket receptet ger ("4 portioner", "ca 20 bitar"). */
const YIELD_ONLY = /^(?:portioner|portion|personer|pers|bitar|stycken|st|port|minuter|min|timmar|timme)$/iu

/**
 * Dela upp en inklistrad ingredienslista – eller ett helt recept – i rader. Tomma rader, rubriker
 * ("Sås:", "Till servering"), uppgifter som "4 portioner" och numrerade steg hoppas över, och efter
 * rubriken för instruktionerna ("Gör så här") läses inget mer.
 */
export function parseIngredientLines(text: string): ParsedIngredientLine[] {
  const out: ParsedIngredientLine[] = []
  for (const line of (text ?? '').split(/\r?\n/)) {
    // Samma gräns som för en receptsida: en text med tusentals rader ska inte frysa granskningen.
    if (out.length >= MAX_IMPORT_INGREDIENTS) break
    const raw = line.replace(BULLET, '').replace(/\s+/g, ' ').trim()
    if (!raw || raw.length > 200) continue
    const bare = raw.replace(/[\s:.]+$/u, '')
    if (INSTRUCTIONS.test(bare)) break
    if (raw.endsWith(':') || HEADING.test(bare) || RECIPE_FACT.test(raw) || STEP.test(raw)) continue
    // En lång mening som slutar med punkt är en instruktion, inte en ingrediens.
    if (/[.!]$/u.test(raw) && raw.split(' ').length >= 10) continue
    const q = parseRecipeQuantity(raw)
    if (q.amount !== undefined && (q.name === '' || YIELD_ONLY.test(q.name))) continue
    const name = ingredientQuery(q.name) || q.name || raw
    const item: ParsedIngredientLine = { raw, name, check: q.amount === undefined }
    if (q.amount !== undefined) item.amount = q.amount
    if (q.unit !== undefined) item.unit = q.unit
    if (q.size !== undefined) item.size = q.size
    out.push(item)
  }
  return out
}

// ---------------------------------------------------------------------------
// Mängd för ett livsmedel
// ---------------------------------------------------------------------------

export interface IngredientAmount {
  amount: number
  unit: UnitKey
  grams: number
}

function rawDensity(food: Pick<Food, 'rawWeight'>): number | undefined {
  const d = food.rawWeight?.density
  return d !== undefined && Number.isFinite(d) && d > 0 ? d : undefined
}

const hasRawWeight = (food: Pick<Food, 'rawWeight'>) => food.rawWeight !== undefined && food.rawWeight.factor > 0

/** Ord som visar att en vara redan är tillagad eller konserverad. */
const COOKED_WORDS = /(^|[^a-zåäö])(kokt|kokta|kokad|kokade|tillagad|tillagade|tillagat|stekt|stekta|konserverad|konserverade|burk)([^a-zåäö]|$)/

/**
 * Räkna om en tolkad rad till en enhet som livsmedlet har. Recept anges i rå eller okokt vikt, så
 * för livsmedel som anges tillagade (`rawWeight`) blir "500 g" till "500 g rå/okokt" och "2 dl" till
 * "2 dl okokt". Styck och portionsord ("2 ägg", "1 klyfta vitlök") räknas med samma regler som
 * fritexten (`amountFor`). undefined när mängden saknas eller inte går att räkna om säkert (t.ex. dl
 * utan densitet, eller en burk när livsmedlet saknar en burkportion).
 */
export function ingredientAmount(
  food: Food,
  line: Pick<ParsedIngredientLine, 'amount' | 'unit'> & Partial<Pick<ParsedIngredientLine, 'raw' | 'name' | 'size'>>,
): IngredientAmount | undefined {
  const { amount, unit } = line
  if (amount === undefined || !(amount > 0)) return undefined
  // "400 g kokta kikärtor" är redan tillagat – då gäller vanliga gram.
  const cooked = line.raw !== undefined && COOKED_WORDS.test(line.raw.toLocaleLowerCase('sv-SE'))
  const raw = hasRawWeight(food) && !cooked
  const done = (a: number, u: UnitKey): IngredientAmount | undefined => {
    const grams = gramsFor(food, a, u)
    return Number.isFinite(grams) && grams > 0 ? { amount: a, unit: u, grams: Math.round(grams * 10) / 10 } : undefined
  }
  if (unit === 'g' || unit === 'kg' || unit === 'hg') {
    const g = unit === 'kg' ? amount * 1000 : unit === 'hg' ? amount * 100 : amount
    return done(g, raw ? 'g-ra' : 'g')
  }
  if (unit !== undefined && own(VOLUME_ML, unit)) {
    const vol = unit as VolumeUnit
    if (raw) {
      // Receptets volym är rå/okokt. Utan rå densitet går den inte att räkna om säkert – livsmedlets
      // vanliga densitet gäller den tillagade varan ("2 dl nudlar" är inte 2 dl kokta nudlar).
      // Raden hamnar då under "Kontrollera mängden".
      return rawDensity(food) !== undefined ? done((amount * VOLUME_ML[vol]) / VOLUME_ML.dl, 'dl-ra') : undefined
    }
    const direct = done(amount, vol)
    if (direct) return direct
    // Annars kanske livsmedlet har måttet som portion ("1 msk") – se nedan.
  }
  const q: ParsedQuantity = { amount, unit, name: line.name ?? '', raw: line.raw ?? '', ...(line.size ? { size: line.size } : {}) }
  const choice = amountFor(food, q)
  if (choice.ok) return done(choice.amount, choice.unit)
  // "1 förp" när livsmedlet har portionen "1 paket" (eller tvärtom).
  if (unit !== undefined && PACK_WORDS.includes(unit)) {
    const pack = food.portions.find((p) => foldSv(p.label).split(/[^a-z0-9]+/).some((w) => PACK_WORDS.some((pw) => foldSv(pw) === w)))
    if (pack) return done(amount, `portion:${pack.id}`)
  }
  return undefined
}
