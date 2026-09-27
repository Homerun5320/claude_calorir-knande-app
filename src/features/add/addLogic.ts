/**
 * Rena hjälpfunktioner för flödet "Lägg till mat": URL-parametrar, källor, korgsummor,
 * smarta förslag, snabbregistrering, kostråd och klimat per portion.
 *
 * Inget här rör React eller butikerna – allt går att testa direkt.
 */
import type { Food, FoodSource, FoodTag, ISODate, MealConfig, MealId, Nutrients, UnitKey } from '../../types'
import { MEAL_IDS } from '../../types'
import type { FoodUsage } from '../../stores/foodStore'
import { KJ_PER_KCAL, nutrientsForGrams, sumNutrients } from '../../lib/nutrients'
import { formatNumber } from '../../lib/format'
import { isValidISODate } from '../../lib/dates'
import { mealForTime } from '../../lib/meals'
import { foodKostrad, KOSTRAD_TARGETS } from '../../lib/kostrad'
import { normalizeBarcode } from '../../lib/openFoodFacts'

// ---------------------------------------------------------------------------
// URL-parametrar och länkar
// ---------------------------------------------------------------------------

export const ADD_TABS = ['senaste', 'favoriter', 'mina', 'maltider'] as const
export type AddTab = (typeof ADD_TABS)[number]

export const ADD_TAB_LABELS: Record<AddTab, string> = {
  senaste: 'Senaste',
  favoriter: 'Favoriter',
  mina: 'Mina',
  maltider: 'Måltider',
}

/** true för en giltig kalenderdag 'YYYY-MM-DD' – samma som `isValidISODate` i lib/dates. */
export const isISODate = isValidISODate

export function isMealId(value: string | null | undefined): value is MealId {
  return !!value && (MEAL_IDS as readonly string[]).includes(value)
}

export interface AddParams {
  date: ISODate
  meal: MealId
  tab: AddTab
}

/**
 * Tolka `?maltid=frukost&datum=2026-09-26&flik=favoriter`. Ogiltiga värden ersätts med
 * dagens datum, måltiden som passar klockslaget och fliken "Senaste".
 */
export function parseAddParams(params: URLSearchParams, meals: MealConfig[], today: ISODate, now: Date = new Date()): AddParams {
  const rawDate = params.get('datum')
  const rawMeal = params.get('maltid')
  const rawTab = params.get('flik')
  return {
    date: isISODate(rawDate) ? rawDate : today,
    meal: isMealId(rawMeal) ? rawMeal : mealForTime(meals, now),
    tab: (ADD_TABS as readonly string[]).includes(rawTab ?? '') ? (rawTab as AddTab) : 'senaste',
  }
}

function query(pairs: Record<string, string | undefined>): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(pairs)) if (v) p.set(k, v)
  const s = p.toString()
  return s ? `?${s}` : ''
}

export function addPageHref(target: { meal?: MealId; date?: ISODate; tab?: AddTab }): string {
  return `/lagg-till${query({ maltid: target.meal, datum: target.date, flik: target.tab })}`
}

export function scanHref(target: { meal?: MealId; date?: ISODate }): string {
  return `/skanna${query({ maltid: target.meal, datum: target.date })}`
}

export function foodDetailHref(id: string, target: { meal?: MealId; date?: ISODate } = {}): string {
  return `/livsmedel/${encodeURIComponent(id)}${query({ maltid: target.meal, datum: target.date })}`
}

export function foodEditHref(id: string): string {
  return `/livsmedel/${encodeURIComponent(id)}/redigera`
}

export function newFoodHref(opts: { barcode?: string; name?: string; copyOf?: string; meal?: MealId; date?: ISODate } = {}): string {
  return `/nytt-livsmedel${query({ streckkod: opts.barcode, namn: opts.name, kopia: opts.copyOf, maltid: opts.meal, datum: opts.date })}`
}

/** Avkoda ett id från URL:en ('lagom%3Akanelbulle' → 'lagom:kanelbulle'). Tål redan avkodade id:n. */
export function decodeFoodId(raw: string | undefined): string {
  if (!raw) return ''
  if (!/%[0-9a-f]{2}/i.test(raw)) return raw
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

// ---------------------------------------------------------------------------
// Streckkoder
// ---------------------------------------------------------------------------

/** UPC-A (12 siffror) och EAN-13 med inledande nolla är samma kod. */
export function barcodeVariants(code: string): string[] {
  const c = normalizeBarcode(code)
  if (c.length === 12) return [c, `0${c}`]
  if (c.length === 13 && c.startsWith('0')) return [c, c.slice(1)]
  return [c]
}

/**
 * Hitta ett livsmedel med en viss streckkod i en lista (t.ex. användarens egna livsmedel).
 * Egna livsmedel ska gå före sparade Open Food Facts-produkter – de är ofta rättade kopior.
 */
export function findByBarcode<T extends Pick<Food, 'barcode'>>(foods: Iterable<T>, code: string): T | undefined {
  const variants = barcodeVariants(code)
  for (const f of foods) {
    if (f.barcode && variants.includes(normalizeBarcode(f.barcode))) return f
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Källor
// ---------------------------------------------------------------------------

export interface SourceMeta {
  /** Fullständigt namn, t.ex. "Livsmedelsverket". */
  label: string
  /** Kort etikett för listor. */
  short: string
  tone: 'gran' | 'fjall' | 'hjortron' | 'blabar' | 'vinbar'
  /** Förklaring av var värdena kommer ifrån. */
  provenance: string
  /** Användarbidrag som bör kontrolleras. */
  crowdSourced: boolean
}

export const SOURCE_META: Record<FoodSource, SourceMeta> = {
  lagom: {
    label: 'Lagom',
    short: 'Lagom',
    tone: 'gran',
    provenance: 'Värden från Lagoms svenska databas, baserad på Livsmedelsverkets livsmedelsdatabas och granskad av Lagom.',
    crowdSourced: false,
  },
  livsmedelsverket: {
    label: 'Livsmedelsverket',
    short: 'LMV',
    tone: 'fjall',
    provenance: 'Värden från Livsmedelsverkets livsmedelsdatabas – Sveriges officiella källa för näringsvärden.',
    crowdSourced: false,
  },
  openfoodfacts: {
    label: 'Open Food Facts',
    short: 'OFF',
    tone: 'hjortron',
    provenance: 'Från Open Food Facts – användarbidrag, kontrollera mot förpackningen.',
    crowdSourced: true,
  },
  custom: {
    label: 'Eget',
    short: 'Eget',
    tone: 'blabar',
    provenance: 'Ett livsmedel du har lagt in själv. Värdena finns bara på din enhet.',
    crowdSourced: false,
  },
  recipe: {
    label: 'Recept',
    short: 'Recept',
    tone: 'vinbar',
    provenance: 'Beräknat från ingredienserna i ditt recept, per tillagad vikt.',
    crowdSourced: false,
  },
}

export function sourceMeta(source: FoodSource | undefined): SourceMeta {
  return SOURCE_META[source ?? 'lagom'] ?? SOURCE_META.lagom
}

// ---------------------------------------------------------------------------
// Korg och summor
// ---------------------------------------------------------------------------

export interface GramItem {
  food: Pick<Food, 'nutrients'>
  grams: number
}

export interface ItemTotals {
  count: number
  grams: number
  nutrients: Nutrients
  /** Summerad energi – undefined om ingen post har känd energi. */
  kcal: number | undefined
  /** Antal poster där energin är okänd. */
  unknownEnergy: number
  /**
   * Antal poster där energi, protein, kolhydrater eller fett är okänt – då är summan bara
   * det som är känt (minst så mycket), inte hela sanningen.
   */
  incomplete: number
}

const TOTAL_KEYS = ['kcal', 'protein', 'carbs', 'fat'] as const

/** Summor för korgen eller en sparad måltid. Poster utan giltig vikt räknas inte in. */
export function itemTotals(items: readonly GramItem[]): ItemTotals {
  const valid = items.filter((i) => Number.isFinite(i.grams) && i.grams > 0)
  const nutrients = sumNutrients(valid.map((i) => nutrientsForGrams(i.food.nutrients, i.grams)))
  return {
    count: items.length,
    grams: valid.reduce((s, i) => s + i.grams, 0),
    nutrients,
    kcal: nutrients.kcal,
    unknownEnergy: items.filter((i) => i.food.nutrients.kcal === undefined || !(i.grams > 0)).length,
    incomplete: valid.filter((i) => TOTAL_KEYS.some((k) => i.food.nutrients[k] === undefined)).length,
  }
}

/**
 * Förvalt namn när korgen sparas som måltid: "Min frukost", "Mitt mellanmål". Ett-ord som
 * slutar på "-mål" (mellanmål, kvällsmål) och "mellis" får "Mitt".
 */
export function defaultTemplateName(mealName: string): string {
  const name = mealName.trim().toLocaleLowerCase('sv-SE')
  if (!name) return 'Min måltid'
  return `${/(mål|mellis)$/.test(name) ? 'Mitt' : 'Min'} ${name}`
}

/** "1 livsmedel" / "3 livsmedel". */
export function countLabel(n: number): string {
  return `${formatNumber(n)} livsmedel`
}

// ---------------------------------------------------------------------------
// Smarta förslag
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000

/**
 * Livsmedel som användaren brukar äta till en viss måltid (minst två gånger och minst 30 % av
 * gångerna). Nyligen använda väger tyngre. Returnerar livsmedels-id:n, bäst först.
 */
export function mealSuggestions(
  usage: Readonly<Record<string, FoodUsage>>,
  meal: MealId,
  limit = 8,
  now: number = Date.now(),
): string[] {
  const scored: Array<{ id: string; score: number }> = []
  for (const [id, u] of Object.entries(usage)) {
    const n = u.meals?.[meal] ?? 0
    if (n < 2 || u.count <= 0 || n / u.count < 0.3) continue
    const days = Math.max(0, (now - u.lastUsed) / DAY_MS)
    scored.push({ id, score: n * (0.4 + 0.6 * Math.exp(-days / 30)) })
  }
  return scored
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, limit)
    .map((s) => s.id)
}

/** Senast använda mängd för ett livsmedel, om den finns. */
export function lastUsed(usage: Readonly<Record<string, FoodUsage>>, id: string): { amount: number; unit: UnitKey } | undefined {
  const u = usage[id]
  return u ? { amount: u.lastAmount, unit: u.lastUnit } : undefined
}

// ---------------------------------------------------------------------------
// Snabbregistrering
// ---------------------------------------------------------------------------

export interface QuickInput {
  energy: number | undefined
  protein?: number
  carbs?: number
  fat?: number
}

/**
 * Näringsvärden för en snabbregistrering. Energin anges i användarens enhet (kcal eller kJ) och
 * lagras alltid i kcal. Tomma fält blir okända – inte noll. Returnerar null utan giltig energi.
 */
export function quickNutrients(input: QuickInput, unit: 'kcal' | 'kJ'): Nutrients | null {
  const e = input.energy
  if (e === undefined || !Number.isFinite(e) || e < 0) return null
  const out: Nutrients = { kcal: unit === 'kJ' ? e / KJ_PER_KCAL : e }
  for (const key of ['protein', 'carbs', 'fat'] as const) {
    const v = input[key]
    if (v !== undefined && Number.isFinite(v) && v >= 0) out[key] = v
  }
  return out
}

// ---------------------------------------------------------------------------
// Kostråd och klimat per portion
// ---------------------------------------------------------------------------

export interface KostradContribution {
  key: 'fruktGront' | 'baljvaxter' | 'fullkorn' | 'fisk' | 'notter' | 'mejeri' | 'rottKott'
  label: string
  /** Gram i den valda mängden. */
  grams: number
  /** Förklaring på svenska. */
  text: string
  /** Andel (0–1) av rekommendationen – undefined för råd om att begränsa. */
  share?: number
  tone: 'mossa' | 'fjall' | 'sol'
}

/**
 * Hur en mängd av livsmedlet bidrar till Livsmedelsverkets kostråd. Används på detaljsidan:
 * "120 g av rekommenderade 500 g om dagen".
 */
export function kostradContributions(food: Food, grams: number): KostradContribution[] {
  if (!(grams > 0)) return []
  const k = foodKostrad(food)
  const f = grams / 100
  const g = (v: number) => formatNumber(v, v < 10 ? 1 : 0)
  const out: KostradContribution[] = []
  const add = (c: KostradContribution) => {
    if (c.grams >= 0.5) out.push(c)
  }
  if (k.fruktGront) {
    const v = k.fruktGront * f
    const t = KOSTRAD_TARGETS.fruktGrontPerDay
    add({ key: 'fruktGront', label: 'Grönsaker, frukt och bär', grams: v, share: v / t, text: `${g(v)} g av rekommenderade ${t} g om dagen`, tone: 'mossa' })
  }
  if (k.baljvaxter) {
    const v = k.baljvaxter * f
    const t = KOSTRAD_TARGETS.baljvaxterDayMinG
    add({ key: 'baljvaxter', label: 'Baljväxter', grams: v, share: v / t, text: `${g(v)} g – från ${t} g räknas dagen som en baljväxtdag`, tone: 'mossa' })
  }
  const wholegrain = food.nutrients.wholegrain
  if (wholegrain !== undefined && wholegrain > 0) {
    const v = wholegrain * f
    const t = KOSTRAD_TARGETS.fullkornPerDay
    add({ key: 'fullkorn', label: 'Fullkorn', grams: v, share: v / t, text: `${g(v)} g av rekommenderade ${t} g om dagen`, tone: 'mossa' })
  }
  if (k.fisk) {
    const v = k.fisk * f
    const t = KOSTRAD_TARGETS.fiskPerWeek
    add({ key: 'fisk', label: 'Fisk och skaldjur', grams: v, share: v / t, text: `${g(v)} g av ${t}–450 g i veckan`, tone: 'fjall' })
  }
  if (k.notter) {
    const v = k.notter * f
    const t = KOSTRAD_TARGETS.notterPerDay
    add({ key: 'notter', label: 'Nötter och frön', grams: v, share: v / t, text: `${g(v)} g av ${t}–30 g om dagen`, tone: 'mossa' })
  }
  if (k.mejeri) {
    const v = k.mejeri * f
    const t = KOSTRAD_TARGETS.mejeriPerDay
    add({ key: 'mejeri', label: 'Mejeriprodukter', grams: v, share: v / t, text: `${g(v)} g av ${t}–${KOSTRAD_TARGETS.mejeriMaxPerDay} ml om dagen`, tone: 'fjall' })
  }
  if (k.rottKott) {
    const v = k.rottKott * f
    const t = KOSTRAD_TARGETS.rottKottPerWeek
    add({ key: 'rottKott', label: 'Rött kött och chark', grams: v, text: `${g(v)} g – rådet är högst ${t} g tillagat i veckan`, tone: 'sol' })
  }
  return out
}

export interface FoodClimateLevel {
  level: 'lag' | 'medel' | 'hog'
  label: string
  tone: 'mossa' | 'sol' | 'hjortron'
}

/**
 * Klimatnivå för ett livsmedel utifrån kg CO2e per kg. Gränser: upp till 2 kg (t.ex. grönsaker,
 * bröd, mjölk) är låg, upp till 7 kg (t.ex. fågel, fläsk, ägg) medel, däröver hög (nöt, lamm, ost).
 */
export function foodClimateLevel(kgPerKg: number): FoodClimateLevel {
  if (!Number.isFinite(kgPerKg) || kgPerKg <= 2) return { level: 'lag', label: 'Låg klimatpåverkan', tone: 'mossa' }
  if (kgPerKg <= 7) return { level: 'medel', label: 'Medelhög klimatpåverkan', tone: 'sol' }
  return { level: 'hog', label: 'Hög klimatpåverkan', tone: 'hjortron' }
}

// ---------------------------------------------------------------------------
// Etiketter
// ---------------------------------------------------------------------------

export const TAG_LABELS: Record<FoodTag, string> = {
  vegan: 'Vegansk',
  vegetarisk: 'Vegetarisk',
  glutenfri: 'Glutenfri',
  laktosfri: 'Laktosfri',
  nyckelhal: 'Nyckelhålsmärkt',
  fullkorn: 'Fullkorn',
  ekologisk: 'Ekologisk',
  svensk: 'Svensk råvara',
  klassiker: 'Svensk klassiker',
}

export const ALL_TAGS = Object.keys(TAG_LABELS) as FoodTag[]

export const NOVA_INFO: Record<1 | 2 | 3 | 4, { label: string; description: string }> = {
  1: { label: 'Obearbetat', description: 'Obearbetade eller minimalt bearbetade livsmedel, t.ex. frukt, grönsaker, mjölk och kött.' },
  2: { label: 'Matlagningsingrediens', description: 'Bearbetade ingredienser för matlagning, t.ex. olja, smör, socker och salt.' },
  3: { label: 'Bearbetat', description: 'Bearbetade livsmedel av få ingredienser, t.ex. ost, konserver och bröd från bageriet.' },
  4: { label: 'Ultraprocessat', description: 'Industriellt framställda produkter med många ingredienser och tillsatser.' },
}

export function novaInfo(group: number | undefined): { group: 1 | 2 | 3 | 4; label: string; description: string } | null {
  if (group !== 1 && group !== 2 && group !== 3 && group !== 4) return null
  return { group, ...NOVA_INFO[group] }
}

export function nutriScoreInfo(grade: string | undefined): { grade: 'A' | 'B' | 'C' | 'D' | 'E'; tone: 'mossa' | 'gran' | 'sol' | 'hjortron' | 'lingon' } | null {
  const g = grade?.trim().toUpperCase()
  switch (g) {
    case 'A':
      return { grade: 'A', tone: 'mossa' }
    case 'B':
      return { grade: 'B', tone: 'gran' }
    case 'C':
      return { grade: 'C', tone: 'sol' }
    case 'D':
      return { grade: 'D', tone: 'hjortron' }
    case 'E':
      return { grade: 'E', tone: 'lingon' }
    default:
      return null
  }
}
