/**
 * Kontroll av innehållet i en säkerhetskopia innan den läses in.
 *
 * En säkerhetskopia kan vara skadad, handredigerad eller komma från en äldre version. Allt som
 * läses in här kontrolleras post för post, så att "Ersätt allt" aldrig kan lämna appen i ett läge
 * där en sida kraschar:
 * - Poster som saknar det nödvändigaste (t.ex. en vägning utan giltigt datum eller vikt, ett
 *   livsmedel utan id) hoppas över och räknas.
 * - Småfel rättas och räknas: saknat eller dubblerat id, fel datum på en post, okänd måltid,
 *   okänd kategori, ogiltiga tal i valfria fält (tas bort) och inställningar utanför sina gränser.
 * - Ett saknat näringsvärde förblir okänt – det blir aldrig 0.
 *
 * Resultatet har samma form som `createBackup()` ger, så `restoreBackup` kan lita på det.
 */
import type {
  ActivityLevel,
  DayMeta,
  DietType,
  DiaryEntry,
  ExerciseEntry,
  Food,
  FoodCategory,
  FoodExtra,
  FoodSource,
  FoodTag,
  GoalType,
  ISODate,
  KostradContrib,
  LifeStage,
  MacroPreset,
  MealConfig,
  MealId,
  MealTemplate,
  MeasurementEntry,
  Nutrients,
  PlateSplit,
  Portion,
  RawWeight,
  Profile,
  QuickEntry,
  Recipe,
  RecipeIngredient,
  Settings,
  Targets,
  ThemeMode,
  UnitKey,
  WeightEntry,
} from '../types'
import { ACTIVITY_LEVELS, FOOD_CATEGORIES, MEAL_IDS } from '../types'
import type { FoodUsage } from '../stores/foodStore'
import type { FastRecord } from '../stores/fastingStore'
import { DEFAULT_MEALS, DEFAULT_SETTINGS } from '../stores/profileStore'
import { NUTRIENT_KEYS } from './nutrients'
import { VOLUME_ML, gramsFor } from './units'
import { fromISODate, isValidISODate } from './dates'
import { sanitizePlanData, type PlanData } from './planning'
import { uid } from './id'
import { plural } from './format'
import { decodeLicense, normalizeLicenseKey } from './license'

// ---------------------------------------------------------------------------
// Rapport
// ---------------------------------------------------------------------------

/** Delar av en säkerhetskopia som kan innehålla skadade poster. */
export type BackupPart =
  | 'profile'
  | 'entries'
  | 'water'
  | 'exercise'
  | 'days'
  | 'customFoods'
  | 'recipes'
  | 'ingredients'
  | 'cachedFoods'
  | 'favorites'
  | 'usage'
  | 'templates'
  | 'weights'
  | 'measurements'
  | 'fasts'
  | 'plan'

/** Vad som rättades eller hoppades över när säkerhetskopian lästes in. */
export interface BackupRepairs {
  /** Antal poster per del som var för skadade för att läsas in. */
  skipped: Partial<Record<BackupPart, number>>
  /** Avsnitt som hade fel form (t.ex. vikterna som ett objekt i stället för en lista) och lästes in tomma. */
  brokenSections: BackupPart[]
  /** Antal poster med småfel som rättades (t.ex. saknat id, okänd måltid eller ogiltigt tal). */
  repaired: number
}

/** Svenska namn i singular och plural för sammanfattningen. */
const PART_NOUNS: Record<BackupPart, readonly [one: string, many: string]> = {
  profile: ['profil', 'profiler'],
  entries: ['dagbokspost', 'dagboksposter'],
  water: ['vattennotering', 'vattennoteringar'],
  exercise: ['träningspass', 'träningspass'],
  days: ['dagsanteckning', 'dagsanteckningar'],
  customFoods: ['eget livsmedel', 'egna livsmedel'],
  recipes: ['recept', 'recept'],
  ingredients: ['receptingrediens', 'receptingredienser'],
  cachedFoods: ['sparad produkt', 'sparade produkter'],
  favorites: ['favorit', 'favoriter'],
  usage: ['rad i användningsstatistiken', 'rader i användningsstatistiken'],
  templates: ['sparad måltid', 'sparade måltider'],
  weights: ['vägning', 'vägningar'],
  measurements: ['mätning', 'mätningar'],
  fasts: ['fasta', 'fastor'],
  plan: ['planerad rad', 'planerade rader'],
}

/** Avsnittens namn när hela avsnittet var oläsbart. */
const SECTION_NAMES: Record<BackupPart, string> = {
  profile: 'profilen',
  entries: 'dagboken',
  water: 'vattnet',
  exercise: 'träningen',
  days: 'dagsanteckningarna',
  customFoods: 'de egna livsmedlen',
  recipes: 'recepten',
  ingredients: 'receptens ingredienser',
  cachedFoods: 'de sparade produkterna',
  favorites: 'favoriterna',
  usage: 'användningsstatistiken',
  templates: 'de sparade måltiderna',
  weights: 'vikterna',
  measurements: 'måtten',
  fasts: 'fastan',
  plan: 'veckoplaneringen',
}

/** Läsbara rader om det som hoppas över, t.ex. ["2 dagboksposter", "vikterna (fel format)"]. */
export function describeRepairs(repairs: BackupRepairs): string[] {
  const out: string[] = []
  for (const part of Object.keys(PART_NOUNS) as BackupPart[]) {
    const n = repairs.skipped[part] ?? 0
    if (n > 0) out.push(plural(n, PART_NOUNS[part][0], PART_NOUNS[part][1]))
  }
  for (const part of repairs.brokenSections) out.push(`${SECTION_NAMES[part]} (fel format)`)
  return out
}

/** Totalt antal poster som hoppas över (ett oläsbart avsnitt räknas som en). */
export function skippedCount(repairs: BackupRepairs): number {
  return Object.values(repairs.skipped).reduce((s, n) => s + (n ?? 0), 0) + repairs.brokenSections.length
}

interface Ctx {
  repairs: BackupRepairs
  now: number
  /** Id:n som redan används (dubbletter får nya id). */
  seenIds: Set<string>
}

/** En post i taget: `fixed` sätts när något i posten har rättats. */
interface Rec {
  fixed: boolean
}

/** Standardvärde för ett fält som saknades eller var ogiltigt (posten räknas som rättad). */
function repair<T>(r: Rec, value: T): T {
  r.fixed = true
  return value
}

function skip(ctx: Ctx, part: BackupPart, n = 1): void {
  if (n > 0) ctx.repairs.skipped[part] = (ctx.repairs.skipped[part] ?? 0) + n
}

function broken(ctx: Ctx, part: BackupPart): void {
  if (!ctx.repairs.brokenSections.includes(part)) ctx.repairs.brokenSections.push(part)
}

/** Kör en sanerare för en post och för bok över resultatet. */
function record<T>(ctx: Ctx, part: BackupPart, raw: unknown, sanitize: (raw: unknown, r: Rec) => T | null): T | null {
  const r: Rec = { fixed: false }
  let value: T | null
  try {
    value = sanitize(raw, r)
  } catch {
    value = null
  }
  if (value === null) skip(ctx, part)
  else if (r.fixed) ctx.repairs.repaired++
  return value
}

// ---------------------------------------------------------------------------
// Grundtyper
// ---------------------------------------------------------------------------

type Obj = Record<string, unknown>

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''
/** Ett id som kan användas som nyckel i ett vanligt objekt ('__proto__' skulle byta prototyp). */
const isKey = (v: unknown): v is string => isNonEmptyString(v) && v !== '__proto__'

/**
 * Övre gränser för tal – ändliga tal som ändå är orimliga (t.ex. 1e300 g) ger annars summor som
 * blir oändliga i diagram och veckosnitt.
 */
const MAX_NUTRIENT = 1_000_000
const MAX_GRAMS = 100_000

/** Ett valfritt fält: undefined om det saknas, annars värdet om det är giltigt (annars rättat bort). */
function optional<T>(raw: unknown, r: Rec, check: (v: unknown) => v is T): T | undefined {
  if (raw === undefined || raw === null) return undefined
  if (check(raw)) return raw
  r.fixed = true
  return undefined
}

function optString(raw: unknown, r: Rec): string | undefined {
  return optional(raw, r, (v): v is string => typeof v === 'string')
}

function optNumber(raw: unknown, r: Rec, min: number, max = Number.POSITIVE_INFINITY, exclusiveMin = false): number | undefined {
  return optional(raw, r, (v): v is number => isNum(v) && (exclusiveMin ? v > min : v >= min) && v <= max)
}

function optBoolean(raw: unknown, r: Rec): boolean | undefined {
  return optional(raw, r, (v): v is boolean => typeof v === 'boolean')
}

function oneOf<T extends string>(values: readonly T[]): (v: unknown) => v is T {
  const set = new Set<string>(values)
  return (v): v is T => typeof v === 'string' && set.has(v)
}

/** Ett obligatoriskt val med standardvärde (rättas om värdet saknas eller är okänt). */
function choice<T extends string>(raw: unknown, r: Rec, values: readonly T[], fallback: T): T {
  if (oneOf(values)(raw)) return raw
  r.fixed = true
  return fallback
}

function stringList(raw: unknown, r: Rec): string[] | undefined {
  if (raw === undefined || raw === null) return undefined
  if (!Array.isArray(raw)) {
    r.fixed = true
    return undefined
  }
  const list = raw.filter((x): x is string => typeof x === 'string')
  if (list.length !== raw.length) r.fixed = true
  return list
}

/** Största tidsstämpeln som ger ett giltigt `Date` (större värden får t.ex. `toISOString` att kasta). */
const MAX_TIMESTAMP = 8.64e15

/** Tidsstämpel i ms (ett ändligt tal som ger ett giltigt datum), annars `fallback`. */
function timestamp(raw: unknown, r: Rec, fallback: number): number {
  if (isNum(raw) && raw >= 0 && raw <= MAX_TIMESTAMP) return raw
  r.fixed = true
  return fallback
}

/** Ett id: behåll giltiga och unika, annars ett nytt. */
function idFor(raw: unknown, r: Rec, ctx: Ctx, prefix: string): string {
  if (isNonEmptyString(raw) && !ctx.seenIds.has(raw)) {
    ctx.seenIds.add(raw)
    return raw
  }
  r.fixed = true
  let id = uid(prefix)
  while (ctx.seenIds.has(id)) id = uid(prefix)
  ctx.seenIds.add(id)
  return id
}

/** Lokal middag för ett datum – rimlig tidsstämpel när en post saknar egen. */
function noonOf(date: ISODate): number {
  const d = fromISODate(date)
  d.setHours(12, 0, 0, 0)
  return d.getTime()
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

/**
 * Gå igenom ett objekt med datum som nycklar. Poster med ogiltigt datum hoppas över
 * (`countOf` avgör hur många poster de räknas som).
 */
function byDate<T>(
  raw: unknown,
  ctx: Ctx,
  part: BackupPart,
  each: (value: unknown, date: ISODate) => T | null,
  countOf: (value: unknown) => number = () => 1,
): Record<ISODate, T> {
  const out: Record<ISODate, T> = {}
  if (raw === undefined || raw === null) return out
  if (!isObj(raw)) {
    broken(ctx, part)
    return out
  }
  for (const [date, value] of Object.entries(raw)) {
    if (!isValidISODate(date)) {
      skip(ctx, part, countOf(value))
      continue
    }
    const v = each(value, date)
    if (v !== null) out[date] = v
  }
  return out
}

/** En lista i säkerhetskopian. Fel form → tom lista (avsnittet räknas som oläsbart). */
function list(raw: unknown, ctx: Ctx, part: BackupPart): unknown[] {
  if (raw === undefined || raw === null) return []
  if (Array.isArray(raw)) return raw
  broken(ctx, part)
  return []
}

/** Ett objekt med id som nycklar. Fel form → tomt objekt. */
function dict(raw: unknown, ctx: Ctx, part: BackupPart): Obj {
  if (raw === undefined || raw === null) return {}
  if (isObj(raw)) return raw
  broken(ctx, part)
  return {}
}

// ---------------------------------------------------------------------------
// Livsmedel
// ---------------------------------------------------------------------------

const FOOD_SOURCES: readonly FoodSource[] = ['lagom', 'livsmedelsverket', 'openfoodfacts', 'custom', 'recipe']
const FOOD_TAGS: readonly FoodTag[] = ['vegan', 'vegetarisk', 'glutenfri', 'laktosfri', 'nyckelhal', 'fullkorn', 'ekologisk', 'svensk', 'klassiker']
const KOSTRAD_KEYS: ReadonlyArray<keyof KostradContrib> = ['fruktGront', 'rottKott', 'fisk', 'notter', 'baljvaxter', 'mejeri']
const VOLUME_UNITS = Object.keys(VOLUME_ML)

/** Källan utifrån id:ts prefix, när källan saknas. */
function sourceFromId(id: string): FoodSource {
  if (id.startsWith('lagom:')) return 'lagom'
  if (id.startsWith('lmv:')) return 'livsmedelsverket'
  if (id.startsWith('off:')) return 'openfoodfacts'
  if (id.startsWith('recipe:')) return 'recipe'
  return 'custom'
}

/** Näringsvärden: bara kända nycklar med ändliga tal ≥ 0. Saknade värden förblir okända. */
function sanitizeNutrients(raw: unknown, r: Rec): Nutrients {
  const out: Nutrients = {}
  if (raw === undefined || raw === null) return out
  if (!isObj(raw)) {
    r.fixed = true
    return out
  }
  for (const key of NUTRIENT_KEYS) {
    const v = raw[key]
    if (v === undefined || v === null) continue
    if (isNum(v) && v >= 0 && v <= MAX_NUTRIENT) out[key] = v
    else r.fixed = true
  }
  return out
}

function sanitizePortions(raw: unknown, r: Rec): Portion[] {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) {
    r.fixed = true
    return []
  }
  const out: Portion[] = []
  const ids = new Set<string>()
  for (const p of raw) {
    if (!isObj(p) || !isNonEmptyString(p.id) || ids.has(p.id) || !isNum(p.grams) || p.grams <= 0 || p.grams > MAX_GRAMS) {
      r.fixed = true
      continue
    }
    ids.add(p.id)
    out.push({ id: p.id, label: isNonEmptyString(p.label) ? p.label : p.id, grams: p.grams })
  }
  return out
}

function sanitizePlate(raw: unknown, r: Rec): PlateSplit | undefined {
  if (raw === undefined || raw === null) return undefined
  const share = (v: unknown) => isNum(v) && v >= 0 && v <= 1
  if (isObj(raw) && share(raw.veg) && share(raw.carb) && share(raw.protein)) {
    return { veg: raw.veg as number, carb: raw.carb as number, protein: raw.protein as number }
  }
  r.fixed = true
  return undefined
}

function sanitizeKostrad(raw: unknown, r: Rec): KostradContrib | undefined {
  if (raw === undefined || raw === null) return undefined
  if (!isObj(raw)) {
    r.fixed = true
    return undefined
  }
  const out: KostradContrib = {}
  for (const key of KOSTRAD_KEYS) {
    const v = raw[key]
    if (v === undefined || v === null) continue
    if (isNum(v) && v >= 0) out[key] = v
    else r.fixed = true
  }
  return out
}

const RAW_KINDS: ReadonlyArray<RawWeight['kind']> = ['ra', 'okokt', 'torkad', 'fryst']

/** Omräkning från rå/okokt vikt: faktor 0,05–20, känt slag och valfri densitet för den okokta varan. */
function sanitizeRawWeight(raw: unknown, r: Rec): RawWeight | undefined {
  if (raw === undefined || raw === null) return undefined
  if (!isObj(raw) || !isNum(raw.factor) || raw.factor < 0.05 || raw.factor > 20 || !oneOf(RAW_KINDS)(raw.kind)) {
    r.fixed = true
    return undefined
  }
  const out: RawWeight = { factor: raw.factor, kind: raw.kind }
  const density = optNumber(raw.density, r, 0, 10, true)
  if (density !== undefined) out.density = density
  return out
}

function sanitizeExtra(raw: unknown, r: Rec): FoodExtra | undefined {
  if (raw === undefined || raw === null) return undefined
  if (!isObj(raw)) {
    r.fixed = true
    return undefined
  }
  const extra: FoodExtra = {}
  const nutriscore = optional(raw.nutriscore, r, (v): v is string => typeof v === 'string' && /^[a-e]$/i.test(v))
  if (nutriscore !== undefined) extra.nutriscore = nutriscore.toLowerCase()
  const nova = optional(raw.nova, r, (v): v is number => isNum(v) && Number.isInteger(v) && v >= 1 && v <= 4)
  if (nova !== undefined) extra.nova = nova
  for (const key of ['ingredientsText', 'quantity', 'origin'] as const) {
    const v = optString(raw[key], r)
    if (v !== undefined) extra[key] = v
  }
  for (const key of ['allergens', 'labels'] as const) {
    const v = stringList(raw[key], r)
    if (v !== undefined) extra[key] = v
  }
  return extra
}

/**
 * Ett livsmedel (eget, sparat eller en ögonblicksbild i dagboken). Kräver id; namn, källa,
 * kategori, näringsvärden och portioner rättas om de saknas. Ogiltiga valfria fält tas bort.
 */
function sanitizeFood(raw: unknown, r: Rec): Food | null {
  if (!isObj(raw) || !isKey(raw.id)) return null
  const id = raw.id.trim()
  if (id !== raw.id) r.fixed = true
  let name = typeof raw.name === 'string' ? raw.name.trim() : ''
  if (!name) {
    r.fixed = true
    name = 'Namnlöst livsmedel'
  }
  const food: Food = {
    id,
    name,
    source: choice(raw.source, r, FOOD_SOURCES, sourceFromId(id)),
    category: choice(raw.category, r, FOOD_CATEGORIES, 'ovrigt' as FoodCategory),
    nutrients: sanitizeNutrients(raw.nutrients, r),
    portions: sanitizePortions(raw.portions, r),
  }
  if (!isObj(raw.nutrients) || !Array.isArray(raw.portions)) r.fixed = true
  const brand = optString(raw.brand, r)
  if (brand) food.brand = brand
  const density = optNumber(raw.density, r, 0, 10, true)
  if (density !== undefined) food.density = density
  const liquid = optBoolean(raw.liquid, r)
  if (liquid !== undefined) food.liquid = liquid
  const barcode = optString(raw.barcode, r)
  if (barcode) food.barcode = barcode
  const tags = stringList(raw.tags, r)
  if (tags) {
    const valid = tags.filter(oneOf(FOOD_TAGS))
    if (valid.length !== tags.length) r.fixed = true
    if (valid.length > 0) food.tags = [...new Set(valid)]
  }
  const synonyms = stringList(raw.synonyms, r)
  if (synonyms && synonyms.length > 0) food.synonyms = synonyms
  const co2e = optNumber(raw.co2e, r, 0, 1000)
  if (co2e !== undefined) food.co2e = co2e
  const plate = sanitizePlate(raw.plate, r)
  if (plate) food.plate = plate
  const kostrad = sanitizeKostrad(raw.kostrad, r)
  if (kostrad) food.kostrad = kostrad
  const imageUrl = optional(raw.imageUrl, r, (v): v is string => typeof v === 'string' && /^https?:\/\//i.test(v))
  if (imageUrl) food.imageUrl = imageUrl
  const note = optString(raw.note, r)
  if (note) food.note = note
  const lmvNumber = optional(raw.lmvNumber, r, (v): v is number => isNum(v) && Number.isInteger(v) && v >= 0)
  if (lmvNumber !== undefined) food.lmvNumber = lmvNumber
  const rawWeight = sanitizeRawWeight(raw.rawWeight, r)
  if (rawWeight) food.rawWeight = rawWeight
  const isAverage = optBoolean(raw.isAverage, r)
  if (isAverage) food.isAverage = true
  const extra = sanitizeExtra(raw.extra, r)
  if (extra) food.extra = extra
  const createdAt = optNumber(raw.createdAt, r, 0, MAX_TIMESTAMP)
  if (createdAt !== undefined) food.createdAt = createdAt
  const updatedAt = optNumber(raw.updatedAt, r, 0, MAX_TIMESTAMP)
  if (updatedAt !== undefined) food.updatedAt = updatedAt
  return food
}

/** true för en enhet som finns: g, kg, volymmått, rå/okokt vikt ('g-ra', 'dl-ra') eller 'portion:<id>'. */
function isUnitKey(v: unknown): v is UnitKey {
  if (typeof v !== 'string') return false
  return (
    v === 'g' ||
    v === 'kg' ||
    v === 'g-ra' ||
    v === 'dl-ra' ||
    VOLUME_UNITS.includes(v) ||
    (v.startsWith('portion:') && v.length > 'portion:'.length)
  )
}

/**
 * Mängd, enhet och vikt för en post eller ingrediens. Vikten räknas fram om den saknas; kan
 * mängden inte tolkas (t.ex. en portion som inte finns) används vikten i gram. null om varken
 * mängd eller vikt går att använda.
 */
function sanitizeAmount(food: Food, raw: Obj, r: Rec): { amount: number; unit: UnitKey; grams: number } | null {
  const amount = isNum(raw.amount) && raw.amount > 0 && raw.amount <= MAX_GRAMS ? raw.amount : undefined
  const unit = isUnitKey(raw.unit) ? raw.unit : undefined
  const stored = isNum(raw.grams) && raw.grams >= 0 && raw.grams <= MAX_GRAMS ? raw.grams : undefined
  const computed = amount !== undefined && unit !== undefined ? gramsFor(food, amount, unit) : Number.NaN
  const unitWorks = Number.isFinite(computed) && computed >= 0 && computed <= MAX_GRAMS
  if (amount !== undefined && unit !== undefined && unitWorks) {
    if (stored === undefined) r.fixed = true
    return { amount, unit, grams: stored ?? computed }
  }
  if (stored !== undefined && stored > 0) {
    r.fixed = true
    return { amount: stored, unit: 'g', grams: stored }
  }
  return null
}

// ---------------------------------------------------------------------------
// Dagbok
// ---------------------------------------------------------------------------

function sanitizeEntry(raw: unknown, r: Rec, ctx: Ctx, date: ISODate): DiaryEntry | null {
  if (!isObj(raw)) return null
  const base = {
    id: idFor(raw.id, r, ctx, 'e_'),
    date,
    meal: choice(raw.meal, r, MEAL_IDS, 'mellanmal' as MealId),
    createdAt: timestamp(raw.createdAt, r, noonOf(date)),
  }
  if (raw.date !== date) r.fixed = true
  const time = optional(raw.time, r, (v): v is string => typeof v === 'string' && TIME.test(v))
  const note = optString(raw.note, r)
  const extras = { ...(time !== undefined && { time }), ...(note !== undefined && { note }) }

  if (raw.kind === 'food') {
    const food = sanitizeFood(raw.food, r)
    if (!food) return null
    const amount = sanitizeAmount(food, raw, r)
    if (!amount) return null
    return { ...base, ...extras, kind: 'food', food, ...amount }
  }
  if (raw.kind === 'quick') {
    let name = typeof raw.name === 'string' ? raw.name.trim() : ''
    if (!name) {
      r.fixed = true
      name = 'Snabbregistrering'
    }
    const entry: QuickEntry = { ...base, ...extras, kind: 'quick', name, nutrients: sanitizeNutrients(raw.nutrients, r) }
    const category = optional(raw.category, r, oneOf(FOOD_CATEGORIES))
    if (category) entry.category = category
    return entry
  }
  return null
}

function sanitizeExercise(raw: unknown, r: Rec, ctx: Ctx, date: ISODate): ExerciseEntry | null {
  if (!isObj(raw) || !isNum(raw.minutes) || raw.minutes <= 0 || raw.minutes > 24 * 60) return null
  if (raw.date !== date) r.fixed = true
  let kcal = 0
  if (isNum(raw.kcal) && raw.kcal >= 0 && raw.kcal <= 20_000) kcal = raw.kcal
  else r.fixed = true
  const entry: ExerciseEntry = {
    id: idFor(raw.id, r, ctx, 'x_'),
    date,
    activityId: isNonEmptyString(raw.activityId) ? raw.activityId : repair(r, 'custom'),
    name: isNonEmptyString(raw.name) ? raw.name.trim() : repair(r, 'Träning'),
    minutes: raw.minutes,
    kcal,
    createdAt: timestamp(raw.createdAt, r, noonOf(date)),
  }
  const met = optNumber(raw.met, r, 0, 30, true)
  if (met !== undefined) entry.met = met
  const distanceKm = optNumber(raw.distanceKm, r, 0, 1000)
  if (distanceKm !== undefined) entry.distanceKm = distanceKm
  const note = optString(raw.note, r)
  if (note !== undefined) entry.note = note
  return entry
}

function sanitizeDayMeta(raw: unknown, r: Rec): DayMeta | null {
  if (!isObj(raw)) return null
  const scale = (v: unknown): v is number => isNum(v) && Number.isInteger(v) && v >= 1 && v <= 5
  const meta: DayMeta = {}
  const note = optString(raw.note, r)
  if (note !== undefined) meta.note = note
  for (const key of ['mood', 'energy', 'hunger'] as const) {
    const v = optional(raw[key], r, scale)
    if (v !== undefined) meta[key] = v
  }
  const sleepHours = optNumber(raw.sleepHours, r, 0, 24)
  if (sleepHours !== undefined) meta.sleepHours = sleepHours
  const steps = optional(raw.steps, r, (v): v is number => isNum(v) && Number.isInteger(v) && v >= 0 && v <= 500_000)
  if (steps !== undefined) meta.steps = steps
  const complete = optBoolean(raw.complete, r)
  if (complete !== undefined) meta.complete = complete
  return meta
}

// ---------------------------------------------------------------------------
// Recept, sparade måltider och användning
// ---------------------------------------------------------------------------

/** Längsta tillåtna länk till ett originalrecept (tecken). */
const MAX_SOURCE_URL_LENGTH = 2000

/** En länk till ett originalrecept: en http(s)-adress på högst 2 000 tecken (aldrig t.ex. javascript:). */
const isSourceUrl = (v: unknown): v is string =>
  typeof v === 'string' && v.length <= MAX_SOURCE_URL_LENGTH && /^https?:\/\//i.test(v)

function sanitizeIngredient(raw: unknown, r: Rec, ctx: Ctx): RecipeIngredient | null {
  if (!isObj(raw)) return null
  const food = sanitizeFood(raw.food, r)
  if (!food) return null
  const amount = sanitizeAmount(food, raw, r)
  if (!amount || !(amount.grams > 0)) return null
  return { id: idFor(raw.id, r, ctx, 'i_'), food, ...amount }
}

function sanitizeRecipe(raw: unknown, r: Rec, ctx: Ctx): Recipe | null {
  if (!isObj(raw) || !isKey(raw.id)) return null
  const ingredients: RecipeIngredient[] = []
  if (Array.isArray(raw.ingredients)) {
    for (const item of raw.ingredients) {
      const ingredient = record(ctx, 'ingredients', item, (v, ir) => sanitizeIngredient(v, ir, ctx))
      if (ingredient) ingredients.push(ingredient)
    }
  } else {
    r.fixed = true
  }
  let name = typeof raw.name === 'string' ? raw.name.trim() : ''
  if (!name) {
    r.fixed = true
    name = 'Namnlöst recept'
  }
  let servings = 1
  if (isNum(raw.servings) && raw.servings > 0 && raw.servings <= 1000) servings = raw.servings
  else r.fixed = true
  const createdAt = timestamp(raw.createdAt, r, ctx.now)
  const recipe: Recipe = {
    id: raw.id,
    name,
    servings,
    ingredients,
    createdAt,
    updatedAt: timestamp(raw.updatedAt, r, createdAt),
  }
  const cooked = optNumber(raw.cookedWeightG, r, 0, 1_000_000, true)
  if (cooked !== undefined) recipe.cookedWeightG = cooked
  const instructions = optString(raw.instructions, r)
  if (instructions !== undefined) recipe.instructions = instructions
  const prep = optNumber(raw.prepMinutes, r, 0, 100_000)
  if (prep !== undefined) recipe.prepMinutes = prep
  const emoji = optString(raw.emoji, r)
  if (emoji) recipe.emoji = emoji
  const tags = stringList(raw.tags, r)
  if (tags) {
    const valid = tags.filter(oneOf(FOOD_TAGS))
    if (valid.length !== tags.length) r.fixed = true
    recipe.tags = [...new Set(valid)]
  }
  const sourceUrl = optional(raw.sourceUrl, r, isSourceUrl)
  if (sourceUrl) recipe.sourceUrl = sourceUrl
  // Inbyggda recept sparas aldrig i butiken – en kopia med märkningen skulle bli omöjlig att ändra.
  if (raw.builtin !== undefined) r.fixed = true
  return recipe
}

function sanitizeTemplate(raw: unknown, r: Rec, ctx: Ctx): MealTemplate | null {
  if (!isObj(raw) || !Array.isArray(raw.items)) return null
  const items: MealTemplate['items'] = []
  for (const item of raw.items) {
    if (!isObj(item)) {
      r.fixed = true
      continue
    }
    const food = sanitizeFood(item.food, r)
    const amount = food ? sanitizeAmount(food, item, r) : null
    if (!food || !amount) {
      r.fixed = true
      continue
    }
    items.push({ food, ...amount })
  }
  if (items.length === 0) return null
  const template: MealTemplate = {
    id: idFor(raw.id, r, ctx, 't_'),
    name: isNonEmptyString(raw.name) ? raw.name.trim() : repair(r, 'Sparad måltid'),
    items,
    createdAt: timestamp(raw.createdAt, r, ctx.now),
  }
  const meal = optional(raw.meal, r, oneOf(MEAL_IDS))
  if (meal) template.meal = meal
  return template
}

function sanitizeUsage(raw: unknown, r: Rec): FoodUsage | null {
  if (!isObj(raw) || !isNum(raw.count) || raw.count < 1) return null
  const meals: FoodUsage['meals'] = {}
  if (isObj(raw.meals)) {
    for (const [meal, n] of Object.entries(raw.meals)) {
      if (oneOf(MEAL_IDS)(meal) && isNum(n) && n >= 0) meals[meal] = n
      else r.fixed = true
    }
  } else {
    r.fixed = true
  }
  // Senaste mängden måste gå att räkna om till gram – annars föreslås 100 g.
  const unitOk = isUnitKey(raw.lastUnit)
  const amountOk = isNum(raw.lastAmount) && raw.lastAmount > 0
  if (!unitOk || !amountOk) r.fixed = true
  return {
    count: Math.round(raw.count),
    lastUsed: timestamp(raw.lastUsed, r, 0),
    lastAmount: unitOk && amountOk ? (raw.lastAmount as number) : 100,
    lastUnit: unitOk && amountOk ? (raw.lastUnit as UnitKey) : 'g',
    meals,
  }
}

// ---------------------------------------------------------------------------
// Kropp och fasta
// ---------------------------------------------------------------------------

function sanitizeWeight(raw: unknown, r: Rec, ctx: Ctx): WeightEntry | null {
  if (!isObj(raw) || typeof raw.date !== 'string' || !isValidISODate(raw.date)) return null
  if (!isNum(raw.kg) || raw.kg < 20 || raw.kg > 400) return null
  const entry: WeightEntry = {
    id: idFor(raw.id, r, ctx, 'w_'),
    date: raw.date,
    kg: raw.kg,
    createdAt: timestamp(raw.createdAt, r, noonOf(raw.date)),
  }
  const note = optString(raw.note, r)
  if (note !== undefined) entry.note = note
  return entry
}

const MEASUREMENT_KEYS = ['waistCm', 'hipCm', 'chestCm', 'armCm', 'thighCm'] as const

function sanitizeMeasurement(raw: unknown, r: Rec, ctx: Ctx): MeasurementEntry | null {
  if (!isObj(raw) || typeof raw.date !== 'string' || !isValidISODate(raw.date)) return null
  const entry: MeasurementEntry = {
    id: idFor(raw.id, r, ctx, 'm_'),
    date: raw.date,
    createdAt: timestamp(raw.createdAt, r, noonOf(raw.date)),
  }
  for (const key of MEASUREMENT_KEYS) {
    const v = optNumber(raw[key], r, 0, 400, true)
    if (v !== undefined) entry[key] = v
  }
  const fat = optNumber(raw.bodyFatPct, r, 0, 100, true)
  if (fat !== undefined) entry.bodyFatPct = fat
  const note = optString(raw.note, r)
  if (note !== undefined) entry.note = note
  const hasValue = MEASUREMENT_KEYS.some((k) => entry[k] !== undefined) || entry.bodyFatPct !== undefined || !!entry.note
  return hasValue ? entry : null
}

const MAX_FAST_HOURS = 24 * 14

function sanitizeFast(raw: unknown, r: Rec, ctx: Ctx): FastRecord | null {
  if (!isObj(raw) || !isNum(raw.start) || !isNum(raw.end) || raw.start <= 0 || raw.end < raw.start) return null
  if (raw.end - raw.start > MAX_FAST_HOURS * 3_600_000) return null
  return {
    id: idFor(raw.id, r, ctx, 'f_'),
    start: raw.start,
    end: raw.end,
    targetHours: isNum(raw.targetHours) && raw.targetHours > 0 && raw.targetHours <= MAX_FAST_HOURS ? raw.targetHours : repair(r, 16),
    protocol: isNonEmptyString(raw.protocol) ? raw.protocol : repair(r, 'eget'),
  }
}

function sanitizeActiveFast(raw: unknown, ctx: Ctx): { start: number; targetHours: number; protocol: string } | null {
  if (raw === undefined || raw === null) return null
  const r: Rec = { fixed: false }
  if (
    !isObj(raw) ||
    !isNum(raw.start) ||
    raw.start <= 0 ||
    raw.start > ctx.now + 86_400_000 ||
    !isNum(raw.targetHours) ||
    raw.targetHours <= 0 ||
    raw.targetHours > MAX_FAST_HOURS
  ) {
    skip(ctx, 'fasts')
    return null
  }
  const protocol = isNonEmptyString(raw.protocol) ? raw.protocol : repair(r, 'eget')
  if (r.fixed) ctx.repairs.repaired++
  return { start: raw.start, targetHours: raw.targetHours, protocol }
}

// ---------------------------------------------------------------------------
// Profil och inställningar
// ---------------------------------------------------------------------------

const GOALS: readonly GoalType[] = ['ga_ner', 'behalla', 'ga_upp']
const LIFE_STAGES: readonly LifeStage[] = ['ingen', 'gravid', 'ammar']
const DIETS: readonly DietType[] = ['allatare', 'flexitarian', 'pescetarian', 'vegetarian', 'vegan']
const MACRO_PRESETS: readonly MacroPreset[] = ['nnr', 'hogprotein', 'lagkolhydrat', 'lchf', 'idrott', 'anpassad']
const ACTIVITY_KEYS = Object.keys(ACTIVITY_LEVELS) as ActivityLevel[]
const THEMES: readonly ThemeMode[] = ['system', 'ljust', 'morkt']
const TARGET_KEYS: ReadonlyArray<keyof Targets> = [
  'kcal',
  'proteinG',
  'carbsG',
  'fatG',
  'fiberG',
  'waterMl',
  'saltMaxG',
  'satFatMaxG',
  'addedSugarMaxG',
  'caffeineMaxMg',
]

/**
 * Profilen kräver kön, födelseår, längd och startvikt inom rimliga gränser – annars används den
 * inte (appen frågar då efter uppgifterna igen). Övriga fält får säkra standardvärden.
 */
function sanitizeProfile(raw: unknown, r: Rec, now: number): Profile | null {
  if (!isObj(raw)) return null
  const year = new Date(now).getFullYear()
  const sex = raw.sex
  if (sex !== 'kvinna' && sex !== 'man') return null
  if (!isNum(raw.birthYear) || !Number.isInteger(raw.birthYear) || raw.birthYear < year - 120 || raw.birthYear > year) return null
  if (!isNum(raw.heightCm) || raw.heightCm < 50 || raw.heightCm > 272) return null
  if (!isNum(raw.startWeightKg) || raw.startWeightKg < 20 || raw.startWeightKg > 400) return null
  let weeklyRateKg = 0.25
  // Högst 1 kg i veckan – snabbare än så ger aldrig Lagom råd om.
  if (isNum(raw.weeklyRateKg) && raw.weeklyRateKg >= 0 && raw.weeklyRateKg <= 1) weeklyRateKg = raw.weeklyRateKg
  else r.fixed = true
  const profile: Profile = {
    sex,
    birthYear: raw.birthYear,
    heightCm: raw.heightCm,
    startWeightKg: raw.startWeightKg,
    activityLevel: choice(raw.activityLevel, r, ACTIVITY_KEYS, 'stillasittande'),
    // Ett okänt mål blir "behålla vikten" – aldrig viktnedgång av misstag.
    goal: choice(raw.goal, r, GOALS, 'behalla'),
    weeklyRateKg,
    lifeStage: choice(raw.lifeStage, r, LIFE_STAGES, 'ingen'),
    diet: choice(raw.diet, r, DIETS, 'allatare'),
    macroPreset: choice(raw.macroPreset, r, MACRO_PRESETS, 'nnr'),
    createdAt: timestamp(raw.createdAt, r, now),
  }
  const name = optString(raw.name, r)
  if (name !== undefined) profile.name = name
  const target = optNumber(raw.targetWeightKg, r, 20, 400)
  if (target !== undefined) profile.targetWeightKg = target
  if (raw.customMacroPct !== undefined && raw.customMacroPct !== null) {
    const m = raw.customMacroPct
    const pct = (v: unknown) => isNum(v) && v >= 0 && v <= 100
    if (isObj(m) && pct(m.protein) && pct(m.carbs) && pct(m.fat)) {
      profile.customMacroPct = { protein: m.protein as number, carbs: m.carbs as number, fat: m.fat as number }
    } else {
      r.fixed = true
      if (profile.macroPreset === 'anpassad') profile.macroPreset = 'nnr'
    }
  } else if (profile.macroPreset === 'anpassad') {
    r.fixed = true
    profile.macroPreset = 'nnr'
  }
  return profile
}

function sanitizeMeals(raw: unknown, r: Rec): MealConfig[] {
  if (!Array.isArray(raw)) {
    if (raw !== undefined) r.fixed = true
    return DEFAULT_MEALS.map((m) => ({ ...m }))
  }
  const out: MealConfig[] = []
  for (const m of raw) {
    if (!isObj(m) || !oneOf(MEAL_IDS)(m.id) || out.some((x) => x.id === m.id)) {
      r.fixed = true
      continue
    }
    const fallback = DEFAULT_MEALS.find((d) => d.id === m.id) as MealConfig
    const name = isNonEmptyString(m.name) ? m.name.trim() : repair(r, fallback.name)
    const enabled = typeof m.enabled === 'boolean' ? m.enabled : repair(r, fallback.enabled)
    out.push({ id: m.id, name, enabled })
  }
  // Alla måltider finns alltid med (avstängda om de saknades i kopian).
  for (const d of DEFAULT_MEALS) {
    if (!out.some((m) => m.id === d.id)) {
      r.fixed = true
      out.push({ ...d })
    }
  }
  return out
}

/** Veckans fokus: ett id och ett giltigt datum, annars inget fokus (rättat). */
function sanitizeWeeklyFocus(raw: unknown, r: Rec): Settings['weeklyFocus'] {
  if (raw === undefined || raw === null) return undefined
  if (isObj(raw) && isNonEmptyString(raw.id) && raw.id.length <= 200 && typeof raw.since === 'string' && isValidISODate(raw.since)) {
    return { id: raw.id, since: raw.since }
  }
  r.fixed = true
  return undefined
}

function sanitizeSettings(raw: unknown, r: Rec): Settings {
  const s: Obj = isObj(raw) ? raw : {}
  if (raw !== undefined && raw !== null && !isObj(raw)) r.fixed = true
  const bool = (key: keyof Settings): boolean => {
    const v = s[key]
    if (typeof v === 'boolean') return v
    if (v !== undefined) r.fixed = true
    return DEFAULT_SETTINGS[key] as boolean
  }
  const clamp = (key: 'exerciseAddBackPct' | 'waterGlassMl', min: number, max: number): number => {
    const v = s[key]
    if (isNum(v)) {
      if (v < min || v > max) r.fixed = true
      return Math.min(max, Math.max(min, v))
    }
    if (v !== undefined) r.fixed = true
    return DEFAULT_SETTINGS[key]
  }
  let dashboardNutrients = DEFAULT_SETTINGS.dashboardNutrients
  if (Array.isArray(s.dashboardNutrients)) {
    const valid = [...new Set(s.dashboardNutrients.filter(oneOf(NUTRIENT_KEYS)))]
    if (valid.length !== s.dashboardNutrients.length) r.fixed = true
    if (valid.length > 0) dashboardNutrients = valid
  } else if (s.dashboardNutrients !== undefined) {
    r.fixed = true
  }
  const targetOverrides: Partial<Targets> = {}
  if (isObj(s.targetOverrides)) {
    for (const [key, v] of Object.entries(s.targetOverrides)) {
      if (v === undefined || v === null) continue
      if ((TARGET_KEYS as readonly string[]).includes(key) && isNum(v) && v > 0) targetOverrides[key as keyof Targets] = v
      else r.fixed = true
    }
  } else if (s.targetOverrides !== undefined) {
    r.fixed = true
  }
  const settings: Settings = {
    theme: s.theme === undefined ? DEFAULT_SETTINGS.theme : choice(s.theme, r, THEMES, DEFAULT_SETTINGS.theme),
    meals: s.meals === undefined ? DEFAULT_MEALS.map((m) => ({ ...m })) : sanitizeMeals(s.meals, r),
    exerciseAddBackPct: clamp('exerciseAddBackPct', 0, 100),
    mindfulMode: bool('mindfulMode'),
    energyUnit: s.energyUnit === undefined ? DEFAULT_SETTINGS.energyUnit : choice(s.energyUnit, r, ['kcal', 'kJ'] as const, 'kcal'),
    adaptiveTargets: bool('adaptiveTargets'),
    waterGlassMl: clamp('waterGlassMl', 50, 1000),
    showClimate: bool('showClimate'),
    showMicros: bool('showMicros'),
    seasonalTheme: bool('seasonalTheme'),
    dashboardNutrients,
    targetOverrides,
    onboardingDone: bool('onboardingDone'),
  }
  const weeklyFocus = sanitizeWeeklyFocus(s.weeklyFocus, r)
  if (weeklyFocus) settings.weeklyFocus = weeklyFocus
  return settings
}

// ---------------------------------------------------------------------------
// Hela säkerhetskopian
// ---------------------------------------------------------------------------

/** Formen på `data` i en säkerhetskopia (samma som `BackupFile['data']`). */
export interface SanitizedBackupData {
  profile: { profile: Profile | null; settings: Settings }
  diary: {
    entries: Record<ISODate, DiaryEntry[]>
    water: Record<ISODate, number>
    exercise: Record<ISODate, ExerciseEntry[]>
    days: Record<ISODate, DayMeta>
  }
  food: {
    customFoods: Record<string, Food>
    recipes: Record<string, Recipe>
    cachedFoods: Record<string, Food>
    favorites: string[]
    usage: Record<string, FoodUsage>
    templates: MealTemplate[]
  }
  body: { weights: WeightEntry[]; measurements: MeasurementEntry[] }
  fasting: { active: { start: number; targetHours: number; protocol: string } | null; history: FastRecord[] }
  /** Licens och provperiod – saknas i säkerhetskopior från äldre versioner. */
  license?: { licenseKey: string | null; trialStartedAt: number | null }
  /** Veckoplaneringen och inköpslistan – saknas i säkerhetskopior från äldre versioner. */
  plan?: PlanData
}

/**
 * Licensavsnittet: en läsbar licensnyckel (signaturen kontrolleras när appen använder den) och en
 * provstart som aldrig ligger i framtiden. Allt annat blir null.
 */
export function sanitizeLicense(raw: unknown, now: number): SanitizedBackupData['license'] {
  if (!isObj(raw)) return undefined
  let licenseKey: string | null = null
  if (typeof raw.licenseKey === 'string' && raw.licenseKey.length <= 4096) {
    const key = normalizeLicenseKey(raw.licenseKey)
    if (decodeLicense(key)) licenseKey = key
  }
  const start = raw.trialStartedAt
  const trialStartedAt = typeof start === 'number' && Number.isFinite(start) && start > 0 ? Math.min(start, now) : null
  return { licenseKey, trialStartedAt }
}

/** Livsmedel i ett objekt med id som nycklar – nyckeln blir alltid livsmedlets eget id. */
function foodDict(raw: unknown, ctx: Ctx, part: BackupPart): Record<string, Food> {
  const out: Record<string, Food> = {}
  for (const value of Object.values(dict(raw, ctx, part))) {
    const food = record(ctx, part, value, sanitizeFood)
    if (!food) continue
    if (out[food.id]) {
      skip(ctx, part)
      continue
    }
    out[food.id] = food
  }
  return out
}

/**
 * Kontrollera och rätta innehållet i en säkerhetskopia. `data` måste redan vara ett objekt med
 * avsnitten profile, diary, food och body (det kontrollerar `parseBackup`).
 */
export function sanitizeBackupData(data: Obj, now: number = Date.now()): { data: SanitizedBackupData; repairs: BackupRepairs } {
  const repairs: BackupRepairs = { skipped: {}, brokenSections: [], repaired: 0 }
  const ctx: Ctx = { repairs, now, seenIds: new Set() }
  const section = (v: unknown): Obj => (isObj(v) ? v : {})

  // Profil och inställningar
  const p = section(data.profile)
  const settingsRec: Rec = { fixed: false }
  const settings = sanitizeSettings(p.settings, settingsRec)
  if (settingsRec.fixed) repairs.repaired++
  let profile: Profile | null = null
  if (p.profile !== undefined && p.profile !== null) {
    profile = record(ctx, 'profile', p.profile, (v, r) => sanitizeProfile(v, r, now))
    // Utan en användbar profil får appen fråga efter uppgifterna igen.
    if (!profile) settings.onboardingDone = false
  }

  // Dagbok
  const d = section(data.diary)
  const countList = (v: unknown) => (Array.isArray(v) ? v.length : 1)
  const entries = byDate(
    d.entries,
    ctx,
    'entries',
    (value, date) => {
      if (!Array.isArray(value)) {
        skip(ctx, 'entries')
        return null
      }
      const out: DiaryEntry[] = []
      for (const raw of value) {
        const e = record(ctx, 'entries', raw, (v, r) => sanitizeEntry(v, r, ctx, date))
        if (e) out.push(e)
      }
      return out.length > 0 ? out : null
    },
    countList,
  )
  const water = byDate(d.water, ctx, 'water', (value) => {
    // Högst 20 liter om dagen – allt över det är ett skrivfel.
    if (isNum(value) && value >= 0 && value <= 20_000) return value
    skip(ctx, 'water')
    return null
  })
  const exercise = byDate(
    d.exercise,
    ctx,
    'exercise',
    (value, date) => {
      if (!Array.isArray(value)) {
        skip(ctx, 'exercise')
        return null
      }
      const out: ExerciseEntry[] = []
      for (const raw of value) {
        const x = record(ctx, 'exercise', raw, (v, r) => sanitizeExercise(v, r, ctx, date))
        if (x) out.push(x)
      }
      return out.length > 0 ? out : null
    },
    countList,
  )
  const days = byDate(d.days, ctx, 'days', (value) => {
    const meta = record(ctx, 'days', value, sanitizeDayMeta)
    return meta && Object.keys(meta).length > 0 ? meta : null
  })

  // Livsmedel, recept och statistik
  const f = section(data.food)
  const customFoods = foodDict(f.customFoods, ctx, 'customFoods')
  const cachedFoods = foodDict(f.cachedFoods, ctx, 'cachedFoods')
  const recipes: Record<string, Recipe> = {}
  for (const value of Object.values(dict(f.recipes, ctx, 'recipes'))) {
    const recipe = record(ctx, 'recipes', value, (v, r) => sanitizeRecipe(v, r, ctx))
    if (!recipe) continue
    if (recipes[recipe.id]) {
      skip(ctx, 'recipes')
      continue
    }
    recipes[recipe.id] = recipe
  }
  const favorites: string[] = []
  for (const id of list(f.favorites, ctx, 'favorites')) {
    if (!isNonEmptyString(id)) skip(ctx, 'favorites')
    else if (!favorites.includes(id)) favorites.push(id)
  }
  const usage: Record<string, FoodUsage> = {}
  for (const [id, value] of Object.entries(dict(f.usage, ctx, 'usage'))) {
    const u = record(ctx, 'usage', value, sanitizeUsage)
    if (!u) continue
    if (isKey(id)) usage[id] = u
    else skip(ctx, 'usage')
  }
  const templates: MealTemplate[] = []
  for (const value of list(f.templates, ctx, 'templates')) {
    const t = record(ctx, 'templates', value, (v, r) => sanitizeTemplate(v, r, ctx))
    if (t) templates.push(t)
  }

  // Kropp: en vägning per dag (den senast sparade gäller), sorterat på datum.
  const b = section(data.body)
  const weightByDate = new Map<ISODate, WeightEntry>()
  for (const value of list(b.weights, ctx, 'weights')) {
    const w = record(ctx, 'weights', value, (v, r) => sanitizeWeight(v, r, ctx))
    if (!w) continue
    const prev = weightByDate.get(w.date)
    if (prev) repairs.repaired++
    if (!prev || w.createdAt >= prev.createdAt) weightByDate.set(w.date, w)
  }
  const weights = [...weightByDate.values()].sort((x, y) => x.date.localeCompare(y.date))
  const measurements: MeasurementEntry[] = []
  for (const value of list(b.measurements, ctx, 'measurements')) {
    const m = record(ctx, 'measurements', value, (v, r) => sanitizeMeasurement(v, r, ctx))
    if (m) measurements.push(m)
  }
  measurements.sort((x, y) => x.date.localeCompare(y.date))

  // Licens och provperiod (saknas i äldre säkerhetskopior)
  const license = sanitizeLicense(data.license, now)

  // Fasta (saknas i äldre säkerhetskopior)
  const fa = section(data.fasting)
  const active = sanitizeActiveFast(fa.active, ctx)
  const history: FastRecord[] = []
  for (const value of list(fa.history, ctx, 'fasts')) {
    const h = record(ctx, 'fasts', value, (v, r) => sanitizeFast(v, r, ctx))
    if (h) history.push(h)
  }

  // Veckoplanering (saknas i äldre säkerhetskopior). Livsmedlen i planen kontrolleras som de
  // egna livsmedlen.
  let plan: PlanData | undefined
  if (isObj(data.plan)) {
    const checkFood = (raw: unknown): Food | null => {
      try {
        return sanitizeFood(raw, { fixed: false })
      } catch {
        return null
      }
    }
    const result = sanitizePlanData(data.plan, { food: checkFood, now })
    plan = result.data
    skip(ctx, 'plan', result.skipped)
    repairs.repaired += result.repaired
  } else if (data.plan !== undefined && data.plan !== null) {
    broken(ctx, 'plan')
  }

  return {
    data: {
      profile: { profile, settings },
      diary: { entries, water, exercise, days },
      food: { customFoods, recipes, cachedFoods, favorites, usage, templates },
      body: { weights, measurements },
      fasting: { active, history },
      ...(license ? { license } : {}),
      ...(plan ? { plan } : {}),
    },
    repairs,
  }
}
