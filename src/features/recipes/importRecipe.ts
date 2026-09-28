/**
 * Receptimport: tolka recept från en webbsida (schema.org/Recipe i JSON-LD) och inklistrade
 * ingredienslistor ("2 dl vetemjöl", "1 st gul lök", "smör till formen").
 *
 * - `parseRecipeJsonLd` läser alla `<script type="application/ld+json">` i en HTML-sträng –
 *   med stöd för `@graph`, listor och `@type` som sträng eller lista – och plockar ut namn,
 *   portioner, tid och ingrediensrader. Instruktionerna importeras inte (bara länken sparas).
 * - `parseIngredientLines` delar upp en ingredienslista i rader med mängd, enhet och namn – med
 *   fritextens `parseQuantity` (lib/freeText.ts) och receptens egna former ("ca", "2–3", "à 400 g").
 *   Rader utan mängd markeras "kontrollera".
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

function textOf(v: Json): string | undefined {
  if (typeof v === 'string') return cleanText(v) || undefined
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  if (isObj(v)) return textOf(v.text ?? v.name ?? v['@value'])
  if (Array.isArray(v)) {
    for (const x of v) {
      const t = textOf(x)
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

/** recipeYield som tal: tal, text ("4 portioner", "ca 8 bitar") eller lista (första talet). */
export function parseYield(v: Json): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? Math.round(v) : undefined
  if (typeof v === 'string') {
    const n = firstNumber(v)
    return n !== undefined ? Math.max(1, Math.round(n)) : undefined
  }
  if (Array.isArray(v)) {
    for (const x of v) {
      const n = parseYield(x)
      if (n !== undefined) return n
    }
  }
  if (isObj(v)) return parseYield(v.value ?? v['@value'])
  return undefined
}

/** ISO 8601-tid i minuter: "PT45M" → 45, "PT1H10M" → 70, "P0DT2H" → 120, "PT90S" → 2. */
export function parseIsoDuration(v: Json): number | undefined {
  if (typeof v !== 'string') return undefined
  const m = v.trim().match(/^P(?:(\d+(?:[.,]\d+)?)D)?(?:T(?:(\d+(?:[.,]\d+)?)H)?(?:(\d+(?:[.,]\d+)?)M)?(?:(\d+(?:[.,]\d+)?)S)?)?$/i)
  if (!m || v.trim().toUpperCase() === 'P' || v.trim().toUpperCase() === 'PT') return undefined
  const num = (s: string | undefined) => (s ? Number(s.replace(',', '.')) : 0)
  const minutes = num(m[1]) * 1440 + num(m[2]) * 60 + num(m[3]) + num(m[4]) / 60
  return Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : undefined
}

function ingredientList(v: Json): string[] {
  const list = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/\r?\n/) : []
  const out: string[] = []
  for (const x of list) {
    const t = textOf(x)
    if (t) out.push(t)
  }
  return out
}

function toRecipe(o: Obj): ImportedRecipe | null {
  const name = textOf(o.name) ?? textOf(o.headline)
  const ingredients = ingredientList(o.recipeIngredient ?? o.ingredients)
  if (!name && ingredients.length === 0) return null
  const total = parseIsoDuration(o.totalTime)
  const prep = parseIsoDuration(o.prepTime)
  const cook = parseIsoDuration(o.cookTime)
  const minutes = total ?? (prep !== undefined || cook !== undefined ? (prep ?? 0) + (cook ?? 0) : undefined)
  const recipe: ImportedRecipe = { name: name ?? 'Importerat recept', ingredients }
  const servings = parseYield(o.recipeYield ?? o.yield)
  if (servings !== undefined) recipe.servings = servings
  if (minutes !== undefined && minutes > 0) recipe.totalMinutes = minutes
  const url = typeof o.url === 'string' ? o.url : typeof o['@id'] === 'string' ? o['@id'] : undefined
  if (url && /^https?:\/\//i.test(url)) recipe.url = url
  return recipe
}

/** Leta igenom JSON-LD (listor, @graph och nästlade objekt som mainEntity) efter recept. */
function collect(node: Json, out: ImportedRecipe[], depth: number): void {
  if (depth > 6) return
  if (Array.isArray(node)) {
    for (const x of node) collect(x, out, depth + 1)
    return
  }
  if (!isObj(node)) return
  if (isRecipeType(node['@type'])) {
    const r = toRecipe(node)
    if (r) out.push(r)
    return
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === '@context') continue
    if (typeof value === 'object' && value !== null) collect(value, out, depth + 1)
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
  try {
    return JSON.parse(cleaned) as Json
  } catch {
    // Vanligt fel på receptsidor: råa radbrytningar i strängar.
    try {
      return JSON.parse(cleaned.replace(/[\r\n\t]+/g, ' ')) as Json
    } catch {
      return undefined
    }
  }
}

/**
 * Alla recept (schema.org/Recipe) i en HTML-strängs JSON-LD-block. Tom lista om inget recept finns.
 */
export function parseRecipeJsonLd(html: string): ImportedRecipe[] {
  if (typeof html !== 'string' || html.trim() === '' || typeof DOMParser === 'undefined') return []
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const out: ImportedRecipe[] = []
  for (const script of Array.from(doc.querySelectorAll('script'))) {
    const type = (script.getAttribute('type') ?? '').toLowerCase()
    if (!type.includes('ld+json')) continue
    const json = parseJsonBlock(script.textContent ?? '')
    if (json !== undefined) collect(json, out, 0)
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

const round3 = (v: number) => Math.round(v * 1000) / 1000
const own = (obj: object, key: string) => Object.prototype.hasOwnProperty.call(obj, key)

/**
 * Mängd, enhet och namn i en ingrediensrad. Bygger på fritextens `parseQuantity` (tal, bråk,
 * talord, mått och portionsord) och lägger till det som är vanligt i recept:
 * "ca 1 kg potatis", intervall ("2–3 klyftor vitlök" → 2,5), förkortningar med punkt ("3 msk. olja",
 * "1 förp. tomater") och förpackningar med storlek ("2 burkar krossade tomater (à 400 g)" → 800 g).
 */
export function parseRecipeQuantity(text: string): ParsedQuantity {
  const raw = text.trim()
  let s = raw.replace(/\s+/g, ' ').replace(APPROX_RE, '')
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

  const q = parseQuantity(s)
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

/** Sökord för en ingrediens: utan parenteser, allt efter kommatecken, "till …", "i bitar" och tillagningsord. */
export function ingredientQuery(text: string): string {
  let s = text
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+(till|för|att|efter)\s+.*$/i, '')
    .replace(CUT_PHRASE, '')
    .split(/[,;]/)[0]
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

/**
 * Dela upp en inklistrad ingredienslista i rader. Tomma rader och rubriker ("Sås:") hoppas över.
 */
export function parseIngredientLines(text: string): ParsedIngredientLine[] {
  const out: ParsedIngredientLine[] = []
  for (const line of (text ?? '').split(/\r?\n/)) {
    const raw = line.replace(BULLET, '').replace(/\s+/g, ' ').trim()
    if (!raw || raw.length > 200) continue
    if (raw.endsWith(':')) continue
    const q = parseRecipeQuantity(raw)
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
    if (raw && rawDensity(food) !== undefined) return done((amount * VOLUME_ML[vol]) / VOLUME_ML.dl, 'dl-ra')
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
