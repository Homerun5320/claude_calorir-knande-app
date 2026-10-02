/**
 * Dela ett recept eller en sparad måltid – via länk eller fil, utan server.
 *
 * Formatet (version 1) är JSON med bara det användaren har valt att dela – aldrig dagboksdata:
 *
 *   { v: 1, kind: 'recipe', name, servings, emoji?, prepMinutes?, cookedWeightG?, instructions?,
 *     tags?, sourceUrl?, foods: SharedFood[], items: SharedItem[] }
 *   { v: 1, kind: 'meal', name, meal?, foods: SharedFood[], items: SharedItem[] }
 *
 * - `foods` är en tabell med livsmedlen och `items` pekar på dem med index (samma livsmedel två
 *   gånger står bara en gång i tabellen).
 * - Lagoms kurerade livsmedel delas som en hänvisning `{ ref: 'lagom:…', name }` och slås upp hos
 *   mottagaren – gamla id:n följer alias till ersättaren (`resolveFoodAlias`, `aliasAmount`).
 * - Allt annat (egna livsmedel, Open Food Facts, Livsmedelsverket, recept som ingrediens) bäddas in
 *   med näring per 100 g och portioner, och blir egna livsmedel hos mottagaren. Finns redan ett eget
 *   livsmedel med samma namn och värden återanvänds det i stället.
 * - Allergener och märkningar som säger vad något inte innehåller (glutenfri, laktosfri, vegansk)
 *   följer aldrig med: avsändaren kan ha fel och länken kan vara ändrad. Hos mottagaren saknar de
 *   inbäddade livsmedlen därför allergenuppgifter ("Lagom har inga uppgifter om allergener …"), och
 *   receptets märkningar räknas fram ur Lagoms egna livsmedel (`recipeTags`). Vegansk blir vegetarisk.
 * - Källänken (`sourceUrl`) delas bara som sidans adress över https: det som kommer efter "?" och "#"
 *   (spårnings- och prenumerant-id i länkar från sociala medier och nyhetsbrev) följer aldrig med,
 *   varken ut eller in. Delningsarket säger att länken till källan är med.
 *
 * Länken: webbplatsens adress + `#/dela?d=<data>`, där `<data>` är `z.` + base64url av JSON:en
 * komprimerad med `CompressionStream('deflate-raw')`, eller `j.` + base64url av okomprimerad JSON
 * när komprimering saknas. Allt efter `#` stannar i webbläsaren – receptet skickas aldrig till
 * någon server. I apparna är ursprunget `capacitor://localhost`, så där används webbplatsens
 * riktiga adress (`VITE_API_BASE`); saknas den går det bara att dela som fil.
 *
 * Filen: `<namn>.lagom.json` med samma JSON (se `saveFile` i lib/backup.ts).
 *
 * Allt som läses in behandlas som opålitligt: strikt schema utan okända fält, gränser för
 * storlek, antal och tal, och städade strängar. Importen sker aldrig automatiskt – sidan
 * `/dela` visar en förhandsvisning och sparar först när användaren väljer det.
 */
import type {
  Food,
  FoodAlias,
  FoodCategory,
  FoodTag,
  MealId,
  MealTemplate,
  Nutrients,
  Portion,
  RawWeight,
  Recipe,
  RecipeIngredient,
  UnitKey,
} from '../types'
import { FOOD_CATEGORIES, MEAL_IDS } from '../types'
import { NUTRIENTS, NUTRIENT_KEYS } from './nutrients'
import { VOLUME_ML, gramsFor } from './units'
import { uid } from './id'
import { API_BASE } from '../config/commerce'
import { isNative } from '../native'
import { aliasAmount, canonicalFoodId, resolveFoodAlias } from '../data/foods/aliases'
import { useFoodStore } from '../stores/foodStore'

// ---------------------------------------------------------------------------
// Format och gränser
// ---------------------------------------------------------------------------

export const SHARE_VERSION = 1

/** Sökvägen i appen som öppnar ett delat recept (hash-routern: `#/dela?d=…`). */
export const SHARE_ROUTE = '/dela'

/** Filändelsen för delade filer: "Mormors gröt.lagom.json". */
export const SHARE_FILE_SUFFIX = '.lagom.json'

export const SHARE_LIMITS = {
  /** Största JSON i en länk, avkodad (byte). Större recept delas som fil. */
  linkJsonBytes: 32 * 1024,
  /** Största fil som läses in (byte). */
  fileBytes: 256 * 1024,
  /** Längsta data i en länk (tecken) – rymmer okomprimerad JSON upp till `linkJsonBytes`. */
  paramChars: 48_000,
  name: 120,
  brand: 80,
  instructions: 10_000,
  portionLabel: 60,
  portions: 20,
  /** Ingredienser i ett recept eller livsmedel i en måltid. */
  items: 100,
  foods: 100,
  servings: 200,
  prepMinutes: 10_000,
  /** Gram och mängd för en ingrediens, och tillagad vikt. */
  grams: 100_000,
  sourceUrl: 2000,
} as const

export type ShareKind = 'recipe' | 'meal'

/** Ett kurerat livsmedel ur Lagoms databas – slås upp hos mottagaren (följer alias). */
export interface SharedRefFood {
  ref: string
  /** Namnet hos avsändaren – visas bara om livsmedlet saknas hos mottagaren. */
  name: string
}

/** Ett inbäddat livsmedel med näring per 100 g (eget, Open Food Facts, Livsmedelsverket …). */
export interface SharedEmbeddedFood {
  name: string
  brand?: string
  category: FoodCategory
  /** Per 100 g. Ett saknat värde är okänt, aldrig 0. */
  nutrients: Nutrients
  portions?: Portion[]
  density?: number
  liquid?: true
  rawWeight?: RawWeight
  /** Märkningar utan glutenfri, laktosfri och vegansk (se `SHARED_TAGS`). */
  tags?: FoodTag[]
  /** Livsmedelsverkets livsmedelsnummer – mottagarens eget livsmedel används om det finns. */
  lmv?: number
}

export type SharedFood = SharedRefFood | SharedEmbeddedFood

export interface SharedItem {
  /** Index i `foods`. */
  food: number
  amount: number
  unit: UnitKey
  /** Vikt i gram hos avsändaren – används om enheten inte går att räkna om hos mottagaren. */
  grams: number
}

interface SharedBase {
  v: typeof SHARE_VERSION
  name: string
  foods: SharedFood[]
  items: SharedItem[]
}

export interface SharedRecipe extends SharedBase {
  kind: 'recipe'
  servings: number
  emoji?: string
  prepMinutes?: number
  cookedWeightG?: number
  instructions?: string
  tags?: FoodTag[]
  sourceUrl?: string
}

export interface SharedMeal extends SharedBase {
  kind: 'meal'
  meal?: MealId
}

export type SharePayload = SharedRecipe | SharedMeal

/** Felmeddelanden när något delat inte går att öppna. */
export const SHARE_ERRORS = {
  empty: 'Klistra in länken du har fått, eller välj en fil.',
  notShare: 'Det här ser inte ut som ett recept eller en måltid som delats från Lagom.',
  backup: 'Det här är en säkerhetskopia. Läs in den under Inställningar → Data och säkerhetskopia i stället.',
  corrupt: 'Länken verkar vara ofullständig eller skadad. Be om en ny länk – eller om en fil.',
  corruptFile: 'Filen verkar vara ofullständig eller skadad. Be om en ny fil – eller om en länk.',
  invalid: 'Innehållet gick inte att läsa in. Be om en ny länk eller en fil.',
  newer: 'Det här är delat från en nyare version av Lagom. Uppdatera appen och försök igen.',
  tooLarge: 'Det här är för stort för att vara ett recept som delats från Lagom.',
  unsupported: 'Den här webbläsaren kan inte packa upp länken. Uppdatera webbläsaren, eller be om en fil i stället.',
} as const

export type ShareErrorCode = keyof typeof SHARE_ERRORS

export type ShareReadResult = { ok: true; payload: SharePayload } | { ok: false; error: ShareErrorCode }

// ---------------------------------------------------------------------------
// Strängar och tal
// ---------------------------------------------------------------------------

/**
 * Byt ut styrtecken (C0, DEL och C1) mot `replacement`. Med `keepLines` behålls radbrytning och
 * tabb. (Utan reguljärt uttryck – lintern varnar för styrtecken i sådana.)
 */
function replaceControl(s: string, replacement: string, keepLines: boolean): string {
  let out = ''
  for (const ch of s) {
    const c = ch.charCodeAt(0)
    const control = (c <= 0x1f && !(keepLines && (c === 0x0a || c === 0x09))) || (c >= 0x7f && c <= 0x9f)
    out += control ? replacement : ch
  }
  return out
}
/**
 * Osynliga tecken som kan användas för att lura ögat: riktningsstyrning (bidi), nollbreddsmellanrum
 * och BOM. Nollbreddsfogning (U+200D) behålls – den behövs i emojier.
 */
const INVISIBLE = /[\u200B\u200C\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g

/**
 * Städa en sträng: Unicode-normalisering (NFC), inga styrtecken eller osynliga tecken. En rad:
 * allt blanktecken blir ett mellanslag. Flera rader (instruktioner): radbrytningar behålls, men
 * högst en tom rad i följd.
 */
export function cleanShareText(value: string, multiline = false): string {
  let s = value.normalize('NFC').replace(INVISIBLE, '')
  if (multiline) {
    s = replaceControl(s.replace(/\r\n?/g, '\n'), '', true)
      .replace(/[^\S\n]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
  } else {
    s = replaceControl(s, ' ', false).replace(/\s+/g, ' ')
  }
  return s.trim()
}

/** Korta till högst `max` UTF-16-tecken utan att dela ett surrogatpar. */
function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  let out = s.slice(0, max)
  const last = out.charCodeAt(out.length - 1)
  if (last >= 0xd800 && last <= 0xdbff) out = out.slice(0, -1)
  return out.trimEnd()
}

/** Städa och korta en sträng för delning (avsändaren – mottagaren kontrollerar samma gränser). */
function shareText(value: string | undefined, max: number, multiline = false): string {
  return value === undefined ? '' : truncate(cleanShareText(value, multiline), max)
}

const round = (v: number, decimals: number) => {
  const f = 10 ** decimals
  return Math.round(v * f) / f
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Högsta rimliga värde per 100 g för ett näringsämne, efter enhet. */
const NUTRIENT_CAP: Record<(typeof NUTRIENTS)[keyof typeof NUTRIENTS]['unit'], number> = {
  kcal: 1000,
  g: 101,
  mg: 100_000,
  µg: 100_000_000,
}

/** Ett näringsvärde per 100 g som går att dela och läsa in: ett ändligt tal från 0 upp till taket. */
function validNutrient(key: keyof typeof NUTRIENTS, v: unknown): v is number {
  return isNum(v) && v >= 0 && v <= NUTRIENT_CAP[NUTRIENTS[key].unit]
}

/** Märkningar som kan stå i delat innehåll (okända ger fel vid inläsningen). */
const FOOD_TAGS: readonly FoodTag[] = ['vegan', 'vegetarisk', 'glutenfri', 'laktosfri', 'nyckelhal', 'fullkorn', 'ekologisk', 'svensk', 'klassiker']
/**
 * Märkningar som säger vad något inte innehåller – de delas aldrig och tas bort vid inläsningen
 * (ett "fri från" utan källa, se lib/allergens.ts). Vegansk blir vegetarisk.
 */
const UNSHARED_TAGS: readonly FoodTag[] = ['vegan', 'glutenfri', 'laktosfri']

/** Märkningarna som de delas och läses in: utan `UNSHARED_TAGS`, i ursprunglig ordning och utan dubbletter. */
function sharedTags(tags: readonly FoodTag[] | undefined): FoodTag[] {
  const out = new Set<FoodTag>()
  for (const t of tags ?? []) {
    if (!FOOD_TAGS.includes(t)) continue
    if (t === 'vegan') out.add('vegetarisk')
    else if (!UNSHARED_TAGS.includes(t)) out.add(t)
  }
  return [...out]
}
const RAW_KINDS: ReadonlyArray<RawWeight['kind']> = ['ra', 'okokt', 'torkad', 'fryst']
const VOLUME_UNITS = new Set(Object.keys(VOLUME_ML))
const PORTION_ID = /^[\p{L}\p{N}_.-]{1,40}$/u
const CURATED_REF = /^lagom:[a-z0-9][a-z0-9-]{0,99}$/
/** En kort emoji (även sammansatta med fogning och variantväljare). */
const EMOJI = /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\u200D|\uFE0F){1,16}$/u

function isUnitSyntax(v: unknown): v is UnitKey {
  if (typeof v !== 'string') return false
  if (v === 'g' || v === 'kg' || v === 'g-ra' || v === 'dl-ra' || VOLUME_UNITS.has(v)) return true
  return v.startsWith('portion:') && PORTION_ID.test(v.slice('portion:'.length))
}

/**
 * En källänk som får delas: bara https, högst 2 000 tecken och utan inloggningsuppgifter. Bara sidans
 * adress följer med (protokoll, värd och sökväg) – aldrig det som kommer efter "?" eller "#". Länkar
 * som kopierats från sociala medier och nyhetsbrev bär ofta spårnings- och prenumerant-id
 * (`fbclid`, `igshid`, `utm_*`, `subscriber=…`), och en delad länk kan vidarebefordras av vem som
 * helst. Avsändarens egen sparade länk ändras inte. Samma regel gäller en länk som läses in, så en
 * äldre delning med parametrar sparas också utan dem.
 */
function shareableSourceUrl(url: string | undefined): string | undefined {
  if (!url || url.length > SHARE_LIMITS.sourceUrl) return undefined
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' || u.username || u.password) return undefined
    u.search = ''
    u.hash = ''
    const out = u.toString()
    return out.length <= SHARE_LIMITS.sourceUrl ? out : undefined
  } catch {
    return undefined
  }
}

// ---------------------------------------------------------------------------
// Avsändaren: bygg det som delas
// ---------------------------------------------------------------------------

/** Näringsvärden per 100 g som går att dela (bara kända nycklar, inom gränserna, avrundade). */
function shareNutrients(n: Nutrients): Nutrients {
  const out: Nutrients = {}
  for (const key of NUTRIENT_KEYS) {
    const v = n[key]
    if (validNutrient(key, v)) out[key] = round(v, 3)
  }
  return out
}

function sharePortions(portions: readonly Portion[] | undefined): Portion[] {
  const out: Portion[] = []
  const ids = new Set<string>()
  for (const p of portions ?? []) {
    if (out.length >= SHARE_LIMITS.portions) break
    if (!PORTION_ID.test(p.id) || ids.has(p.id) || !isNum(p.grams) || p.grams <= 0 || p.grams > SHARE_LIMITS.grams) continue
    const label = shareText(p.label, SHARE_LIMITS.portionLabel) || p.id
    ids.add(p.id)
    out.push({ id: p.id, label, grams: round(p.grams, 2) })
  }
  return out
}

function shareRawWeight(raw: RawWeight | undefined): RawWeight | undefined {
  if (!raw || !isNum(raw.factor) || raw.factor < 0.05 || raw.factor > 20 || !RAW_KINDS.includes(raw.kind)) return undefined
  const out: RawWeight = { factor: raw.factor, kind: raw.kind }
  if (isNum(raw.density) && raw.density > 0 && raw.density <= 10) out.density = raw.density
  return out
}

/** Ett livsmedel som det delas: hänvisning för Lagoms kurerade, annars inbäddat. */
function shareFood(food: Food): SharedFood {
  const name = shareText(food.name, SHARE_LIMITS.name) || 'Namnlöst livsmedel'
  const ref = canonicalFoodId(food.id)
  if (CURATED_REF.test(ref)) return { ref, name }
  const out: SharedEmbeddedFood = {
    name,
    category: FOOD_CATEGORIES.includes(food.category) ? food.category : 'ovrigt',
    nutrients: shareNutrients(food.nutrients ?? {}),
  }
  const brand = shareText(food.brand, SHARE_LIMITS.brand)
  if (brand) out.brand = brand
  const portions = sharePortions(food.portions)
  if (portions.length > 0) out.portions = portions
  if (isNum(food.density) && food.density > 0 && food.density <= 10) out.density = food.density
  if (food.liquid === true) out.liquid = true
  const rawWeight = shareRawWeight(food.rawWeight)
  if (rawWeight) out.rawWeight = rawWeight
  const tags = sharedTags(food.tags)
  if (tags.length > 0) out.tags = tags
  // Allergener följer aldrig med (se filens kommentar).
  if (food.source === 'livsmedelsverket') {
    const lmv = food.lmvNumber ?? (food.id.startsWith('lmv:') ? Number(food.id.slice(4)) : Number.NaN)
    if (Number.isInteger(lmv) && lmv >= 0 && lmv <= 1_000_000) out.lmv = lmv
  }
  return out
}

interface ShareSource {
  food: Food
  amount: number
  unit: UnitKey
  grams: number
}

/** Livsmedelstabell och rader för ingredienserna eller måltidens livsmedel. */
function shareItems(sources: readonly ShareSource[]): { foods: SharedFood[]; items: SharedItem[] } {
  const foods: SharedFood[] = []
  const items: SharedItem[] = []
  const index = new Map<string, number>()
  for (const s of sources) {
    if (items.length >= SHARE_LIMITS.items) break
    if (!s.food || typeof s.food.id !== 'string') continue
    // Avrundat före kontrollen – mottagaren godtar bara vikter och mängder över noll.
    const grams = round(isNum(s.grams) && s.grams > 0 ? s.grams : gramsFor(s.food, s.amount, s.unit), 2)
    if (!isNum(grams) || grams <= 0 || grams > SHARE_LIMITS.grams) continue
    // Ett gammalt kurerat id delas som ersättaren, med mängden omräknad.
    const alias = resolveFoodAlias(s.food.id)
    const moved = aliasAmount(alias, s.amount, s.unit)
    let amount = round(moved.amount, 3)
    let unit = moved.unit
    const key = alias?.to ?? s.food.id
    let i = index.get(key)
    if (i === undefined) {
      if (foods.length >= SHARE_LIMITS.foods) continue
      i = foods.length
      foods.push(shareFood(s.food))
      index.set(key, i)
    }
    const shared = foods[i]
    // En enhet som inte går att räkna om med det inbäddade livsmedlet (t.ex. en portion som inte
    // följer med) eller en ogiltig mängd delas i gram.
    const embeddedUnitFails =
      'category' in shared &&
      !(gramsFor({ portions: shared.portions ?? [], density: shared.density, liquid: shared.liquid, rawWeight: shared.rawWeight }, amount, unit) > 0)
    if (!isUnitSyntax(unit) || !isNum(amount) || amount <= 0 || amount > SHARE_LIMITS.grams || embeddedUnitFails) {
      amount = grams
      unit = 'g'
    }
    items.push({ food: i, amount, unit, grams })
  }
  return { foods, items }
}

/** Receptet som det delas – bara receptet, aldrig något ur dagboken. */
export function buildRecipeShare(recipe: Recipe): SharedRecipe {
  const { foods, items } = shareItems(recipe.ingredients)
  const out: SharedRecipe = {
    v: SHARE_VERSION,
    kind: 'recipe',
    name: shareText(recipe.name, SHARE_LIMITS.name) || 'Namnlöst recept',
    servings: Math.min(SHARE_LIMITS.servings, Math.max(1, Math.round(isNum(recipe.servings) ? recipe.servings : 1))),
    foods,
    items,
  }
  if (recipe.emoji && EMOJI.test(recipe.emoji)) out.emoji = recipe.emoji
  if (isNum(recipe.prepMinutes) && recipe.prepMinutes >= 1) out.prepMinutes = Math.min(SHARE_LIMITS.prepMinutes, Math.round(recipe.prepMinutes))
  const cooked = isNum(recipe.cookedWeightG) ? round(recipe.cookedWeightG, 1) : 0
  if (cooked > 0 && cooked <= SHARE_LIMITS.grams) out.cookedWeightG = cooked
  const instructions = shareText(recipe.instructions, SHARE_LIMITS.instructions, true)
  if (instructions) out.instructions = instructions
  const tags = sharedTags(recipe.tags)
  if (tags.length > 0) out.tags = tags
  const sourceUrl = shareableSourceUrl(recipe.sourceUrl)
  if (sourceUrl) out.sourceUrl = sourceUrl
  return out
}

/** Den sparade måltiden som den delas. */
export function buildMealShare(template: MealTemplate): SharedMeal {
  const { foods, items } = shareItems(template.items)
  const out: SharedMeal = {
    v: SHARE_VERSION,
    kind: 'meal',
    name: shareText(template.name, SHARE_LIMITS.name) || 'Sparad måltid',
    foods,
    items,
  }
  if (template.meal && MEAL_IDS.includes(template.meal)) out.meal = template.meal
  return out
}

// ---------------------------------------------------------------------------
// Mottagaren: strikt kontroll
// ---------------------------------------------------------------------------

class InvalidShare extends Error {}

type Obj = Record<string, unknown>

function fail(): never {
  throw new InvalidShare('ogiltigt delat innehåll')
}

/** Ett vanligt objekt med bara tillåtna nycklar (okända fält ger fel). */
function strictObject(raw: unknown, allowed: ReadonlySet<string>): Obj {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw) || Object.getPrototypeOf(raw) !== Object.prototype) fail()
  for (const key of Object.keys(raw)) if (!allowed.has(key)) fail()
  return raw as Obj
}

function strictArray(raw: unknown, max: number, min = 0): unknown[] {
  if (!Array.isArray(raw) || raw.length < min || raw.length > max) fail()
  return raw
}

/** En sträng som redan är städad och inom sin längd – annars fel. */
function text(raw: unknown, max: number, opts: { multiline?: boolean; optional?: boolean } = {}): string | undefined {
  if (raw === undefined && opts.optional) return undefined
  if (typeof raw !== 'string' || raw.length > max) fail()
  const clean = cleanShareText(raw, opts.multiline)
  if (!clean) {
    if (opts.optional) return undefined
    fail()
  }
  return clean
}

function num(raw: unknown, min: number, max: number, opts: { integer?: boolean; exclusiveMin?: boolean; optional?: boolean } = {}): number | undefined {
  if (raw === undefined && opts.optional) return undefined
  if (!isNum(raw) || raw > max || (opts.exclusiveMin ? raw <= min : raw < min)) fail()
  if (opts.integer && !Number.isInteger(raw)) fail()
  return raw
}

const REF_KEYS = new Set(['ref', 'name'])
const FOOD_KEYS = new Set(['name', 'brand', 'category', 'nutrients', 'portions', 'density', 'liquid', 'rawWeight', 'tags', 'lmv'])
const PORTION_KEYS = new Set(['id', 'label', 'grams'])
const RAW_KEYS = new Set(['factor', 'kind', 'density'])
const ITEM_KEYS = new Set(['food', 'amount', 'unit', 'grams'])
const NUTRIENT_KEY_SET = new Set<string>(NUTRIENT_KEYS)
const RECIPE_KEYS = new Set(['v', 'kind', 'name', 'servings', 'emoji', 'prepMinutes', 'cookedWeightG', 'instructions', 'tags', 'sourceUrl', 'foods', 'items'])
const MEAL_KEYS = new Set(['v', 'kind', 'name', 'meal', 'foods', 'items'])

/** Märkningarna: okända ger fel; glutenfri, laktosfri och vegansk tas bort (se `UNSHARED_TAGS`). */
function validateTags(raw: unknown): FoodTag[] | undefined {
  if (raw === undefined) return undefined
  const list = strictArray(raw, FOOD_TAGS.length)
  const tags = sharedTags(list.map((t) => (typeof t === 'string' && (FOOD_TAGS as readonly string[]).includes(t) ? (t as FoodTag) : fail())))
  return tags.length > 0 ? tags : undefined
}

function validateFood(raw: unknown): SharedFood {
  if (typeof raw === 'object' && raw !== null && 'ref' in raw) {
    const o = strictObject(raw, REF_KEYS)
    if (typeof o.ref !== 'string' || !CURATED_REF.test(o.ref)) fail()
    return { ref: o.ref, name: text(o.name, SHARE_LIMITS.name)! }
  }
  const o = strictObject(raw, FOOD_KEYS)
  const category = (FOOD_CATEGORIES as readonly unknown[]).includes(o.category) ? (o.category as FoodCategory) : fail()
  const nutrientsRaw = strictObject(o.nutrients, NUTRIENT_KEY_SET)
  const nutrients: Nutrients = {}
  for (const key of NUTRIENT_KEYS) {
    const v = nutrientsRaw[key]
    if (v === undefined) continue
    if (!validNutrient(key, v)) fail()
    nutrients[key] = v
  }
  const food: SharedEmbeddedFood = { name: text(o.name, SHARE_LIMITS.name)!, category, nutrients }
  const brand = text(o.brand, SHARE_LIMITS.brand, { optional: true })
  if (brand) food.brand = brand
  if (o.portions !== undefined) {
    const ids = new Set<string>()
    food.portions = strictArray(o.portions, SHARE_LIMITS.portions, 1).map((p) => {
      const po = strictObject(p, PORTION_KEYS)
      if (typeof po.id !== 'string' || !PORTION_ID.test(po.id) || ids.has(po.id)) fail()
      ids.add(po.id)
      return { id: po.id, label: text(po.label, SHARE_LIMITS.portionLabel)!, grams: num(po.grams, 0, SHARE_LIMITS.grams, { exclusiveMin: true })! }
    })
  }
  const density = num(o.density, 0, 10, { exclusiveMin: true, optional: true })
  if (density !== undefined) food.density = density
  if (o.liquid !== undefined) {
    if (o.liquid !== true) fail()
    food.liquid = true
  }
  if (o.rawWeight !== undefined) {
    const rw = strictObject(o.rawWeight, RAW_KEYS)
    const kind = RAW_KINDS.includes(rw.kind as RawWeight['kind']) ? (rw.kind as RawWeight['kind']) : fail()
    const raw: RawWeight = { factor: num(rw.factor, 0.05, 20)!, kind }
    const rawDensity = num(rw.density, 0, 10, { exclusiveMin: true, optional: true })
    if (rawDensity !== undefined) raw.density = rawDensity
    food.rawWeight = raw
  }
  const tags = validateTags(o.tags)
  if (tags) food.tags = tags
  const lmv = num(o.lmv, 0, 1_000_000, { integer: true, optional: true })
  if (lmv !== undefined) food.lmv = lmv
  return food
}

function validateItem(raw: unknown, foods: readonly SharedFood[]): SharedItem {
  const o = strictObject(raw, ITEM_KEYS)
  const food = num(o.food, 0, foods.length - 1, { integer: true })!
  if (!isUnitSyntax(o.unit)) fail()
  return {
    food,
    amount: num(o.amount, 0, SHARE_LIMITS.grams, { exclusiveMin: true })!,
    unit: o.unit,
    grams: num(o.grams, 0, SHARE_LIMITS.grams, { exclusiveMin: true })!,
  }
}

/**
 * Kontrollera innehållet strikt och returnera en städad kopia. Kastar vid minsta avvikelse: okända
 * fält, fel typ, för långa strängar, tal utanför gränserna, livsmedel som inte används …
 */
function validatePayload(raw: unknown): SharePayload {
  const kind = typeof raw === 'object' && raw !== null ? (raw as Obj).kind : undefined
  if (kind !== 'recipe' && kind !== 'meal') fail()
  const o = strictObject(raw, kind === 'recipe' ? RECIPE_KEYS : MEAL_KEYS)
  if (o.v !== SHARE_VERSION) fail()
  const name = text(o.name, SHARE_LIMITS.name)!
  const foods = strictArray(o.foods, SHARE_LIMITS.foods, 1).map(validateFood)
  const items = strictArray(o.items, SHARE_LIMITS.items, 1).map((it) => validateItem(it, foods))
  // Varje livsmedel i tabellen ska användas – annars skulle oanvända livsmedel kunna smygas in.
  const used = new Set(items.map((i) => i.food))
  if (used.size !== foods.length) fail()

  if (kind === 'meal') {
    const meal: SharedMeal = { v: SHARE_VERSION, kind, name, foods, items }
    if (o.meal !== undefined) {
      if (!(MEAL_IDS as readonly unknown[]).includes(o.meal)) fail()
      meal.meal = o.meal as MealId
    }
    return meal
  }
  const recipe: SharedRecipe = { v: SHARE_VERSION, kind, name, servings: num(o.servings, 1, SHARE_LIMITS.servings, { integer: true })!, foods, items }
  if (o.emoji !== undefined) {
    if (typeof o.emoji !== 'string' || !EMOJI.test(o.emoji)) fail()
    recipe.emoji = o.emoji
  }
  const prep = num(o.prepMinutes, 1, SHARE_LIMITS.prepMinutes, { integer: true, optional: true })
  if (prep !== undefined) recipe.prepMinutes = prep
  const cooked = num(o.cookedWeightG, 0, SHARE_LIMITS.grams, { exclusiveMin: true, optional: true })
  if (cooked !== undefined) recipe.cookedWeightG = cooked
  const instructions = text(o.instructions, SHARE_LIMITS.instructions, { multiline: true, optional: true })
  if (instructions) recipe.instructions = instructions
  const tags = validateTags(o.tags)
  if (tags) recipe.tags = tags
  if (o.sourceUrl !== undefined) {
    const url = typeof o.sourceUrl === 'string' ? shareableSourceUrl(o.sourceUrl) : undefined
    if (!url) fail()
    recipe.sourceUrl = url
  }
  return recipe
}

/**
 * Tolka delad JSON (från en länk, en fil eller inklistrad text). Säger vänligt till om det är en
 * säkerhetskopia, något annat eller från en nyare version.
 */
export function parseShareJson(json: string): ShareReadResult {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return { ok: false, error: 'corrupt' }
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, error: 'notShare' }
  const o = raw as Obj
  if (o.format === 'lagom-backup') return { ok: false, error: 'backup' }
  if (!('v' in o) || (o.kind !== 'recipe' && o.kind !== 'meal')) return { ok: false, error: 'notShare' }
  if (isNum(o.v) && o.v > SHARE_VERSION) return { ok: false, error: 'newer' }
  try {
    return { ok: true, payload: validatePayload(raw) }
  } catch {
    return { ok: false, error: 'invalid' }
  }
}

// ---------------------------------------------------------------------------
// Kodning: komprimering och base64url
// ---------------------------------------------------------------------------

const DEFLATE_PREFIX = 'z.'
const PLAIN_PREFIX = 'j.'
const PARAM = /^([zj])\.([A-Za-z0-9_-]+)$/

class TooLarge extends Error {}

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromBase64Url(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) throw new Error('ogiltig base64url')
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4)
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

/**
 * Skicka bytes genom en (de)komprimeringsström. Läser högst `limit` byte ut – en "zip-bomb" som
 * packar upp till något enormt avbryts direkt (TooLarge).
 */
async function pipeBytes(bytes: Uint8Array, stream: CompressionStream | DecompressionStream, limit: number): Promise<Uint8Array> {
  const writer = stream.writable.getWriter()
  const reader = stream.readable.getReader()
  // Fel i skrivningen (t.ex. skadad data) syns också i läsningen – fånga dem här så att de inte blir ohanterade.
  writer
    .write(bytes as Uint8Array<ArrayBuffer>)
    .then(() => writer.close())
    .catch(() => {})
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > limit) {
      await reader.cancel().catch(() => {})
      throw new TooLarge('för stort')
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }
  return out
}

/** Kan webbläsaren komprimera med 'deflate-raw'? (Äldre webbläsare saknar formatet.) */
function compressor(): CompressionStream | null {
  try {
    return typeof CompressionStream === 'function' ? new CompressionStream('deflate-raw') : null
  } catch {
    return null
  }
}

function decompressor(): DecompressionStream | null {
  try {
    return typeof DecompressionStream === 'function' ? new DecompressionStream('deflate-raw') : null
  } catch {
    return null
  }
}

export type EncodeResult = { ok: true; param: string; compressed: boolean } | { ok: false; error: 'tooLarge' }

/**
 * Koda det som delas till länkens data: komprimerat (`z.`) när webbläsaren klarar det och det
 * blir kortare, annars okomprimerat (`j.`). För stort för en länk → `tooLarge` (dela som fil).
 */
export async function encodeSharePayload(payload: SharePayload): Promise<EncodeResult> {
  const bytes = utf8(JSON.stringify(payload))
  if (bytes.length > SHARE_LIMITS.linkJsonBytes) return { ok: false, error: 'tooLarge' }
  const plain = PLAIN_PREFIX + toBase64Url(bytes)
  const cs = compressor()
  if (cs) {
    try {
      const packed = DEFLATE_PREFIX + toBase64Url(await pipeBytes(bytes, cs, SHARE_LIMITS.linkJsonBytes * 2))
      if (packed.length < plain.length) return { ok: true, param: packed, compressed: true }
    } catch {
      // Komprimeringen misslyckades – okomprimerat nedan.
    }
  }
  return { ok: true, param: plain, compressed: false }
}

/** Läs länkens data (`z.…` eller `j.…`). */
export async function decodeShareParam(param: string): Promise<ShareReadResult> {
  const value = param.trim()
  if (!value) return { ok: false, error: 'empty' }
  if (value.length > SHARE_LIMITS.paramChars) return { ok: false, error: 'tooLarge' }
  const match = PARAM.exec(value)
  if (!match) return { ok: false, error: 'corrupt' }
  let bytes: Uint8Array
  try {
    bytes = fromBase64Url(match[2])
  } catch {
    return { ok: false, error: 'corrupt' }
  }
  if (match[1] === 'z') {
    const ds = decompressor()
    if (!ds) return { ok: false, error: 'unsupported' }
    try {
      bytes = await pipeBytes(bytes, ds, SHARE_LIMITS.linkJsonBytes)
    } catch (err) {
      return { ok: false, error: err instanceof TooLarge ? 'tooLarge' : 'corrupt' }
    }
  } else if (bytes.length > SHARE_LIMITS.linkJsonBytes) {
    return { ok: false, error: 'tooLarge' }
  }
  let json: string
  try {
    json = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return { ok: false, error: 'corrupt' }
  }
  return parseShareJson(json)
}

/** Datan ur en inklistrad länk (eller bara datan själv): "…#/dela?d=z.abc" → "z.abc". */
export function shareParamFromText(text: string): string | undefined {
  const value = text.trim()
  if (PARAM.test(value)) return value
  const match = /[?&]d=([zj]\.[A-Za-z0-9_-]+)/.exec(value)
  return match?.[1]
}

/**
 * Läs något som användaren klistrat in: en delad länk, bara datan i den, eller innehållet i en
 * delad fil (JSON).
 */
export async function readShareText(text: string): Promise<ShareReadResult> {
  const value = text.trim()
  if (!value) return { ok: false, error: 'empty' }
  if (value.startsWith('{')) {
    if (utf8(value).length > SHARE_LIMITS.fileBytes) return { ok: false, error: 'tooLarge' }
    return parseShareJson(value)
  }
  const param = shareParamFromText(value)
  return param ? decodeShareParam(param) : { ok: false, error: 'notShare' }
}

/** Läs en delad fil ("Mormors gröt.lagom.json"). Felen gäller filen, inte en länk. */
export async function readShareFile(file: Blob): Promise<ShareReadResult> {
  if (file.size > SHARE_LIMITS.fileBytes) return { ok: false, error: 'tooLarge' }
  let text: string
  try {
    text = await file.text()
  } catch {
    return { ok: false, error: 'corruptFile' }
  }
  if (!text.trim()) return { ok: false, error: 'notShare' }
  const result = parseShareJson(text.replace(/^\uFEFF/, ''))
  return !result.ok && result.error === 'corrupt' ? { ok: false, error: 'corruptFile' } : result
}

// ---------------------------------------------------------------------------
// Länk och fil
// ---------------------------------------------------------------------------

/** Webbplatsens adress ur `VITE_API_BASE` – bara en https-adress. */
export function siteUrlFrom(base: string): string | null {
  return /^https:\/\/[^/\s]+/i.test(base) ? `${base.replace(/\/+$/, '')}/` : null
}

export interface ShareEnvironment {
  native: boolean
  location?: Pick<Location, 'protocol' | 'origin' | 'pathname'>
  apiBase: string
}

function currentEnvironment(): ShareEnvironment {
  return { native: isNative(), location: typeof window !== 'undefined' ? window.location : undefined, apiBase: API_BASE }
}

/**
 * Adressen som delade länkar börjar med, eller null när bara fil går. På webben är det sidan man
 * är på; i apparna (capacitor://localhost) webbplatsens riktiga adress.
 */
export function shareBaseUrl(env: ShareEnvironment = currentEnvironment()): string | null {
  const loc = env.location
  if (!env.native && loc && (loc.protocol === 'https:' || loc.protocol === 'http:')) return `${loc.origin}${loc.pathname}`
  return siteUrlFrom(env.apiBase)
}

/** Den fullständiga länken: "https://…/#/dela?d=z.…". */
export function shareUrl(base: string, param: string): string {
  return `${base}#${SHARE_ROUTE}?d=${param}`
}

export type ShareLinkResult = { ok: true; url: string } | { ok: false; error: 'tooLarge' | 'noSite' }

/** Skapa en delningslänk – eller säg varför det inte går (för stort, eller ingen webbplats i appen). */
export async function createShareLink(payload: SharePayload, env: ShareEnvironment = currentEnvironment()): Promise<ShareLinkResult> {
  const base = shareBaseUrl(env)
  if (!base) return { ok: false, error: 'noSite' }
  const encoded = await encodeSharePayload(payload)
  if (!encoded.ok) return encoded
  return { ok: true, url: shareUrl(base, encoded.param) }
}

/** Filnamnet: "Mormors gröt.lagom.json" (tecken som filsystem inte tål tas bort). */
export function shareFileName(name: string): string {
  const safe = truncate(
    cleanShareText(name)
      .replace(/[\\/:*?"<>|#%{}^~[\]`]/g, '')
      .replace(/^[.\s]+|[.\s]+$/g, ''),
    60,
  )
  return `${safe || 'recept'}${SHARE_FILE_SUFFIX}`
}

/** Innehållet i en delad fil. */
export function shareFileContent(payload: SharePayload): string {
  return `${JSON.stringify(payload, null, 1)}\n`
}

// ---------------------------------------------------------------------------
// Import: livsmedel, förhandsvisning och sparande
// ---------------------------------------------------------------------------

export interface ResolveOptions {
  /**
   * Slå upp ett inbyggt livsmedel (Lagom eller Livsmedelsverket) på id, t.ex.
   * `(id) => builtinFood(catalog, id)`.
   */
  lookup: (id: string) => Food | undefined
  /** Användarens egna livsmedel: ett inbäddat livsmedel med samma namn och värden återanvänds. */
  customFoods?: Readonly<Record<string, Food>>
  now?: number
}

interface ResolvedBase {
  name: string
  /** Egna livsmedel som skapas när det sparas (inbäddade livsmedel som inte redan fanns). */
  newFoods: Food[]
  /** Namn på Lagom-livsmedel som inte finns i den här versionen av appen – då går det inte att spara. */
  missing: string[]
}

export type ResolvedShare = (ResolvedBase & { kind: 'recipe'; recipe: Recipe }) | (ResolvedBase & { kind: 'meal'; template: MealTemplate })

const foldName = (s: string | undefined) => (s ?? '').trim().toLocaleLowerCase('sv-SE')

function sameValue(a: number | undefined, b: number | undefined): boolean {
  if (a === undefined || b === undefined) return a === b
  return Math.abs(a - b) <= Math.max(0.01, 0.005 * Math.max(Math.abs(a), Math.abs(b)))
}

/** Samma livsmedel: samma namn och märke och samma näringsvärden (okänt = okänt). */
function sameFood(a: Food, b: Food): boolean {
  if (foldName(a.name) !== foldName(b.name) || foldName(a.brand) !== foldName(b.brand)) return false
  return NUTRIENT_KEYS.every((k) => sameValue(a.nutrients[k], b.nutrients[k]))
}

/** Ett inbäddat livsmedel som eget livsmedel (nytt id, källa 'custom'). */
function embeddedToFood(shared: SharedEmbeddedFood, kind: ShareKind, now: number): Food {
  const food: Food = {
    id: `custom:${uid()}`,
    name: shared.name,
    source: 'custom',
    category: shared.category,
    nutrients: { ...shared.nutrients },
    portions: (shared.portions ?? []).map((p) => ({ ...p })),
    note: kind === 'recipe' ? 'Kom med ett delat recept.' : 'Kom med en delad måltid.',
    createdAt: now,
    updatedAt: now,
  }
  if (shared.brand) food.brand = shared.brand
  if (shared.density !== undefined) food.density = shared.density
  if (shared.liquid) food.liquid = true
  if (shared.rawWeight) food.rawWeight = { ...shared.rawWeight }
  // Bara märkningar som inte säger vad något saknar, och inga allergenuppgifter (`extra`).
  const tags = sharedTags(shared.tags)
  if (tags.length > 0) food.tags = tags
  if (shared.lmv !== undefined) food.lmvNumber = shared.lmv
  return food
}

/** Ögonblicksbild i en ingrediens eller måltid – utan ingredienslistan från Open Food Facts. */
function snapshot(food: Food): Food {
  if (!food.extra?.ingredientsText) return food
  const { ingredientsText: _omit, ...extra } = food.extra
  return { ...food, extra }
}

/**
 * Gör om det delade till ett recept eller en måltid med mottagarens livsmedel – för
 * förhandsvisningen och för sparandet. Ger nya id:n; inget sparas här.
 */
export function resolveShare(payload: SharePayload, opts: ResolveOptions): ResolvedShare {
  const now = opts.now ?? Date.now()
  const existing = Object.values(opts.customFoods ?? {})
  const newFoods: Food[] = []
  const missing: string[] = []
  const resolved: Array<{ food: Food; alias?: FoodAlias } | null> = payload.foods.map((shared) => {
    if ('ref' in shared) {
      const alias = resolveFoodAlias(shared.ref)
      const food = opts.lookup(alias?.to ?? shared.ref)
      if (!food) {
        missing.push(shared.name)
        return null
      }
      return { food, alias }
    }
    if (shared.lmv !== undefined) {
      const lmv = opts.lookup(`lmv:${shared.lmv}`)
      if (lmv) return { food: lmv }
    }
    const candidate = embeddedToFood(shared, payload.kind, now)
    const dup = existing.find((f) => sameFood(f, candidate)) ?? newFoods.find((f) => sameFood(f, candidate))
    if (dup) return { food: dup }
    newFoods.push(candidate)
    return { food: candidate }
  })

  const lines: Array<{ food: Food; amount: number; unit: UnitKey; grams: number }> = []
  for (const item of payload.items) {
    const r = resolved[item.food]
    if (!r) continue
    const moved = aliasAmount(r.alias, item.amount, item.unit)
    const grams = gramsFor(r.food, moved.amount, moved.unit)
    const food = snapshot(r.food)
    if (isNum(grams) && grams > 0 && grams <= SHARE_LIMITS.grams) {
      lines.push({ food, amount: moved.amount, unit: moved.unit, grams: round(grams, 1) })
    } else {
      // Enheten finns inte hos mottagarens livsmedel (t.ex. en portion) – använd avsändarens vikt.
      lines.push({ food, amount: item.grams, unit: 'g', grams: item.grams })
    }
  }
  // Egna livsmedel skapas bara för det som faktiskt används.
  const usedIds = new Set(lines.map((l) => l.food.id))
  const created = newFoods.filter((f) => usedIds.has(f.id))

  if (payload.kind === 'meal') {
    const template: MealTemplate = { id: uid('tpl_'), name: payload.name, items: lines, createdAt: now }
    if (payload.meal) template.meal = payload.meal
    return { kind: 'meal', name: payload.name, template, newFoods: created, missing }
  }
  const ingredients: RecipeIngredient[] = lines.map((l) => ({ id: uid('i_'), ...l }))
  const recipe: Recipe = {
    id: uid('r_'),
    name: payload.name,
    servings: payload.servings,
    ingredients,
    emoji: payload.emoji ?? '🍲',
    tags: sharedTags(payload.tags),
    createdAt: now,
    updatedAt: now,
  }
  if (payload.prepMinutes !== undefined) recipe.prepMinutes = payload.prepMinutes
  if (payload.cookedWeightG !== undefined) recipe.cookedWeightG = payload.cookedWeightG
  if (payload.instructions) recipe.instructions = payload.instructions
  if (payload.sourceUrl) recipe.sourceUrl = payload.sourceUrl
  return { kind: 'recipe', name: payload.name, recipe, newFoods: created, missing }
}

export type ImportResult = { kind: 'recipe'; id: string; name: string; newFoods: number } | { kind: 'meal'; id: string; name: string; newFoods: number }

/**
 * Spara det delade som ett eget recept eller en sparad måltid (och de egna livsmedel som följer
 * med). Kontrollerar mot butikens aktuella egna livsmedel så att inga dubbletter skapas. null när
 * något Lagom-livsmedel saknas i den här versionen.
 *
 * OBS: anropa `requireAccess(…)` först – exempeldata är skrivskyddad och efter provperioden
 * skapas inget nytt.
 */
export function importShare(payload: SharePayload, lookup: ResolveOptions['lookup'], now: number = Date.now()): ImportResult | null {
  const store = useFoodStore.getState()
  const resolved = resolveShare(payload, { lookup, customFoods: store.customFoods, now })
  if (resolved.missing.length > 0) return null
  // En enda skrivning av butiken för alla nya livsmedel (varje set() skriver om hela butiken).
  store.addCustomFoods(resolved.newFoods)
  if (resolved.kind === 'recipe') {
    store.saveRecipe(resolved.recipe)
    return { kind: 'recipe', id: resolved.recipe.id, name: resolved.name, newFoods: resolved.newFoods.length }
  }
  store.saveTemplate(resolved.template)
  return { kind: 'meal', id: resolved.template.id, name: resolved.name, newFoods: resolved.newFoods.length }
}
