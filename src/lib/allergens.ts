/**
 * Allergier och intoleranser – användarens profil och varsamma flaggor för produkter.
 *
 * Listan följer bilaga II till förordning (EU) nr 1169/2011 ("allergenlistan", 14 ämnen) med
 * Livsmedelsverkets svenska benämningar (livsmedelsverket.se → Allergimärkning, granskad
 * 2025-10-22), plus laktos för den som är laktosintolerant. Laktos är ingen egen allergen i
 * märkningen – den ingår i "mjölk och mjölkprodukter".
 *
 * Grundregler:
 * - Allergenuppgifter finns bara för produkter från Open Food Facts: `allergens_tags` (innehåller)
 *   och `traces_tags` ("kan innehålla spår av"). Nycklarna sparas på produkten i `food.extra`
 *   (`allergenKeys`, `traceKeys` – alltid satta, även tomma, när produkten har lästs med den här
 *   ordlistan; `unreadAllergenTags` när Open Food Facts anger något som ordlistan inte känner igen).
 *   Äldre sparade produkter har bara de svenska namnen i `extra.allergens` och inga spår – då sägs
 *   att uppgifterna om spår saknas, aldrig att Open Food Facts inte anger något.
 * - Bara en produkt med källan Open Food Facts (`source: 'openfoodfacts'`) kan ge den lugnande raden
 *   "Open Food Facts anger inget av det du har markerat". Lagoms egna livsmedel, Livsmedelsverkets
 *   poster, recept och egna livsmedel – även kopior av produkter och livsmedel som kommit med ett
 *   delat recept – räknas som okända: "Lagom har inga uppgifter om allergener …". Varningar (det
 *   som en kopia av en produkt säger att den innehåller) visas ändå – de kan bara göra en försiktig.
 * - Allergener följer aldrig med när ett recept eller en måltid delas (lib/shareLink.ts).
 * - Lagom påstår aldrig att något är säkert eller fritt från något. Det enda som sägs om "fri från"
 *   är produktens egen märkning, med källan: "Märkt laktosfri enligt Open Food Facts".
 * - Flaggorna är varsamma: varningsfärgens token, en ikon och en text som "Innehåller mjölk – som
 *   du har markerat". Aldrig röda larm.
 * - Profilen (`settings.allergens`) är hälsouppgifter och sparas bara på enheten.
 */
import type { AllergenKey, Food, FoodExtra } from '../types'
import { ALLERGEN_KEYS } from '../types'

// ---------------------------------------------------------------------------
// Allergenerna
// ---------------------------------------------------------------------------

export interface AllergenMeta {
  /** Livsmedelsverkets benämning, för listor och kryssrutor ("Sojabönor"). */
  label: string
  /** Kort form i löptext: "Innehåller {name}" ("soja"). */
  name: string
  /** Vad som ingår, enligt Livsmedelsverkets allergenlista. */
  hint?: string
}

export const ALLERGEN_META: Record<AllergenKey, AllergenMeta> = {
  gluten: {
    label: 'Spannmål som innehåller gluten',
    name: 'gluten',
    hint: 'Vete, råg, korn, havre, spelt/dinkel, khorasanvete och korsningar mellan dem.',
  },
  kraftdjur: { label: 'Kräftdjur', name: 'kräftdjur', hint: 'Till exempel räkor, krabba, hummer och kräftor.' },
  agg: { label: 'Ägg', name: 'ägg' },
  fisk: { label: 'Fisk', name: 'fisk' },
  jordnotter: { label: 'Jordnötter', name: 'jordnötter' },
  soja: { label: 'Sojabönor', name: 'soja', hint: 'Även det som framställs av soja, till exempel sojalecitin.' },
  mjolk: { label: 'Mjölk och mjölkprodukter', name: 'mjölk', hint: 'Inklusive laktos.' },
  notter: {
    label: 'Nötter',
    name: 'nötter',
    hint: 'Mandel, hasselnöt, valnöt, cashewnöt, pekannöt, paranöt, pistaschmandel och makadamianöt/Queenslandsnöt.',
  },
  selleri: { label: 'Selleri', name: 'selleri' },
  senap: { label: 'Senap', name: 'senap' },
  sesam: { label: 'Sesamfrön', name: 'sesam' },
  sulfiter: {
    label: 'Svaveldioxid och sulfit',
    name: 'svaveldioxid/sulfit',
    hint: 'Mer än 10 mg per kg eller liter – till exempel i vin och torkad frukt.',
  },
  lupin: { label: 'Lupin', name: 'lupin' },
  blotdjur: { label: 'Blötdjur', name: 'blötdjur', hint: 'Snäckor, musslor och bläckfisk.' },
  laktos: {
    label: 'Laktos',
    name: 'laktos',
    hint: 'Laktosintolerans. Laktos märks inte ut för sig – Lagom flaggar produkter som innehåller mjölk.',
  },
}

/** De 14 allergenerna i bilaga II (EU:s allergenlista), i förordningens ordning. */
export const EU_ALLERGENS: readonly AllergenKey[] = ALLERGEN_KEYS.filter((k) => k !== 'laktos')
/** Intoleranser som inte är egna allergener i märkningen. */
export const INTOLERANCES: readonly AllergenKey[] = ['laktos']

/** Inställningssidan för allergier (sektionen `allergier` i SettingsPage). */
export const ALLERGY_SETTINGS_PATH = '/installningar/allergier'

/** Livsmedelsverket – Allergi och överkänslighet (för konsumenter). */
export const LMV_ALLERGY_URL = 'https://www.livsmedelsverket.se/matvanor-halsa--miljo/sjukdomar-allergier-och-halsa/allergi-och-overkanslighet/'
/** Livsmedelsverket – Allergimärkning (allergenlistan, "kan innehålla spår av", "fri från"). */
export const LMV_ALLERGY_LABELLING_URL = 'https://www.livsmedelsverket.se/livsmedel-och-innehall/text-pa-forpackning-markning/allergimarkning/'

const KEY_SET: ReadonlySet<string> = new Set(ALLERGEN_KEYS)

export function isAllergenKey(v: unknown): v is AllergenKey {
  return typeof v === 'string' && KEY_SET.has(v)
}

/** Nycklarna i allergenlistans ordning, utan dubbletter och okända värden. */
export function sortAllergens(keys: Iterable<unknown>): AllergenKey[] {
  const set = new Set<AllergenKey>()
  for (const k of keys) if (isAllergenKey(k)) set.add(k)
  return ALLERGEN_KEYS.filter((k) => set.has(k))
}

/**
 * Slå på eller av en allergen i profilen. Tom lista blir `undefined` (inget sparat fält).
 */
export function toggleAllergen(list: readonly AllergenKey[] | undefined, key: AllergenKey, on: boolean): AllergenKey[] | undefined {
  const next = new Set(list ?? [])
  if (on) next.add(key)
  else next.delete(key)
  const sorted = sortAllergens(next)
  return sorted.length > 0 ? sorted : undefined
}

/** "a", "a och b", "a, b och c". */
export function joinSv(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? ''
  return `${parts.slice(0, -1).join(', ')} och ${parts[parts.length - 1]}`
}

function capitalize(s: string): string {
  return s.charAt(0).toLocaleUpperCase('sv-SE') + s.slice(1)
}

/**
 * Kort sammanfattning för raden i Inställningar: "Inga valda", "Mjölk och nötter",
 * "Gluten, mjölk, nötter och 2 till".
 */
export function allergenSummary(keys: readonly AllergenKey[] | undefined): string {
  const list = sortAllergens(keys ?? [])
  if (list.length === 0) return 'Inga valda'
  const names = list.map((k) => ALLERGEN_META[k].name)
  if (names.length <= 3) return capitalize(joinSv(names))
  return `${capitalize(names.slice(0, 3).join(', '))} och ${names.length - 3} till`
}

// ---------------------------------------------------------------------------
// Open Food Facts → nycklar
// ---------------------------------------------------------------------------

/**
 * Open Food Facts kanoniska allergentaggar (taxonomin `allergens.txt`) → Lagoms nycklar.
 * Taxonomin har också vissa japanska allergener (apelsin, kiwi …) – de ingår inte i EU:s lista.
 */
const OFF_TAG_KEYS: Readonly<Record<string, AllergenKey>> = {
  'en:gluten': 'gluten',
  'en:crustaceans': 'kraftdjur',
  'en:eggs': 'agg',
  'en:fish': 'fisk',
  'en:peanuts': 'jordnotter',
  'en:soybeans': 'soja',
  'en:milk': 'mjolk',
  'en:nuts': 'notter',
  'en:celery': 'selleri',
  'en:mustard': 'senap',
  'en:sesame-seeds': 'sesam',
  'en:sulphur-dioxide-and-sulphites': 'sulfiter',
  'en:lupin': 'lupin',
  'en:molluscs': 'blotdjur',
}

/**
 * Ord som betyder en allergen: Lagoms egna svenska namn (sparade i `extra.allergens`) och vanliga
 * ord i taggar som Open Food Facts inte har känt igen (t.ex. `sv:havre`). Bara hela ord matchas,
 * så att t.ex. "ragu" aldrig tolkas som råg.
 */
const WORDS: ReadonlyArray<readonly [AllergenKey, readonly string[]]> = [
  ['gluten', ['gluten', 'vete', 'durumvete', 'råg', 'korn', 'havre', 'spelt', 'dinkel', 'kamut', 'khorasanvete', 'vetemjöl', 'rågmjöl', 'wheat', 'rye', 'barley', 'oats']],
  ['kraftdjur', ['kräftdjur', 'skaldjur', 'räkor', 'räka', 'krabba', 'hummer', 'kräftor', 'crustaceans', 'shrimp', 'crab', 'lobster']],
  ['agg', ['ägg', 'äggula', 'äggvita', 'äggpulver', 'egg', 'eggs']],
  ['fisk', ['fisk', 'torsk', 'lax', 'sill', 'ansjovis', 'fish']],
  ['jordnotter', ['jordnöt', 'jordnötter', 'peanut', 'peanuts']],
  ['soja', ['soja', 'sojabönor', 'sojalecitin', 'soy', 'soya', 'soybeans']],
  ['mjolk', ['mjölk', 'mjölkpulver', 'mjölkprotein', 'grädde', 'smör', 'ost', 'vassle', 'laktos', 'milk', 'lactose', 'whey']],
  ['notter', ['nötter', 'nöt', 'mandel', 'mandlar', 'hasselnöt', 'hasselnötter', 'valnöt', 'valnötter', 'cashewnöt', 'cashewnötter', 'pekannöt', 'paranöt', 'pistaschmandel', 'pistagenötter', 'makadamianöt', 'queenslandsnöt', 'nuts', 'almonds', 'hazelnuts']],
  ['selleri', ['selleri', 'rotselleri', 'blekselleri', 'celery']],
  ['senap', ['senap', 'senapsfrö', 'mustard']],
  ['sesam', ['sesam', 'sesamfrö', 'sesamfrön', 'sesame']],
  ['sulfiter', ['svaveldioxid/sulfit', 'svaveldioxid och sulfit', 'svaveldioxid', 'sulfit', 'sulfiter', 'sulphites', 'sulfites']],
  ['lupin', ['lupin', 'lupinmjöl']],
  ['blotdjur', ['blötdjur', 'musslor', 'mussla', 'bläckfisk', 'snäckor', 'ostron', 'molluscs']],
]

/** "Svaveldioxid/sulfit", "sv:jordnötter", "mjölk-pulver" → gemener utan prefix, med mellanslag. */
function normalizeWord(s: string): string {
  return s
    .toLocaleLowerCase('sv-SE')
    .replace(/^[a-z]{2}:/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const WORD_KEYS: ReadonlyMap<string, AllergenKey> = new Map(WORDS.flatMap(([key, words]) => words.map((w) => [normalizeWord(w), key] as const)))

/** Nyckeln för en allergentagg från Open Food Facts (`en:milk`, `sv:havre` …), eller undefined. */
export function offAllergenKey(tag: string): AllergenKey | undefined {
  if (typeof tag !== 'string') return undefined
  const t = tag.trim().toLowerCase()
  return OFF_TAG_KEYS[t] ?? WORD_KEYS.get(normalizeWord(t))
}

/** Nycklar ur Open Food Facts-taggar, i allergenlistans ordning och utan dubbletter. */
export function offAllergenKeys(tags: readonly string[] | undefined): AllergenKey[] {
  return sortAllergens((tags ?? []).map(offAllergenKey))
}

/**
 * true om Open Food Facts anger en allergen eller ett spår som Lagom inte kan tolka – en tagg på
 * ett annat språk som taxonomin inte har känt igen (t.ex. `fi:maito`, `sv:vetegluten`). Kanoniska
 * `en:`-taggar utanför EU:s lista (t.ex. `en:kiwi`, `en:none`) räknas inte.
 */
export function hasUnreadAllergenTags(tags: readonly unknown[] | undefined): boolean {
  if (!Array.isArray(tags)) return false
  return tags.some((t) => typeof t === 'string' && t.trim() !== '' && !t.trim().toLowerCase().startsWith('en:') && offAllergenKey(t) === undefined)
}

/** Nyckeln för ett svenskt allergennamn som Lagom har sparat ("mjölk", "svaveldioxid/sulfit"). */
export function allergenKeyFromName(name: string): AllergenKey | undefined {
  if (typeof name !== 'string') return undefined
  return WORD_KEYS.get(normalizeWord(name))
}

// ---------------------------------------------------------------------------
// Produktens allergenuppgifter
// ---------------------------------------------------------------------------

/**
 * Fälten som sparas på produkten i `food.extra` – finns i `FoodExtra` (src/types.ts) och
 * kontrolleras i säkerhetskopian (`sanitizeExtra` i lib/backupValidation.ts). Typerna nedan finns
 * kvar för den kod som redan använder dem.
 */
export interface AllergenExtraFields {
  /** Allergener som produkten innehåller enligt Open Food Facts (`allergens_tags`). */
  allergenKeys?: AllergenKey[]
  /** "Kan innehålla spår av" enligt Open Food Facts (`traces_tags`), utan det som redan ingår. */
  traceKeys?: AllergenKey[]
  /** Open Food Facts anger allergener eller spår som Lagom inte kan tolka. */
  unreadAllergenTags?: boolean
}

export type FoodExtraWithAllergens = FoodExtra & AllergenExtraFields

export interface FoodAllergenData {
  /**
   * En produkt från Open Food Facts (`source: 'openfoodfacts'`) med allergenuppgifter (allergener,
   * spår eller en ingrediensförteckning som Open Food Facts har tolkat). false = okänt, inte "inga".
   * Egna livsmedel – även kopior av produkter och livsmedel från ett delat recept – är aldrig kända.
   */
  known: boolean
  /** Uppgifterna om spår har lästs (saknas i produkter som sparades innan spåren lästes in). */
  tracesKnown: boolean
  /** Open Food Facts anger något som Lagom inte kan tolka – då sägs aldrig att inget anges. */
  unread: boolean
  contains: AllergenKey[]
  traces: AllergenKey[]
  /** Märkt laktosfri enligt Open Food Facts (`labels_tags`). Bara produkter från Open Food Facts. */
  labelledLactoseFree: boolean
  /** Märkt glutenfri enligt Open Food Facts (`labels_tags`). Bara produkter från Open Food Facts. */
  labelledGlutenFree: boolean
}

/** Märkningarnas svenska etiketter från `offLabels` i openFoodFacts.ts. */
const LACTOSE_FREE_LABEL = 'Laktosfri'
const GLUTEN_FREE_LABEL = 'Glutenfri'

/**
 * Allergenuppgifterna för ett livsmedel. Bara Open Food Facts har sådana uppgifter (`food.extra`
 * fylls bara därifrån – direkt, eller när användaren kopierar en produkt till ett eget livsmedel).
 * Det som en kopia säger att den innehåller flaggas ändå, men den räknas aldrig som känd.
 */
export function foodAllergenData(food: Pick<Food, 'source' | 'extra'>): FoodAllergenData {
  const x = food.extra as FoodExtraWithAllergens | undefined
  const stored = Array.isArray(x?.allergenKeys) ? sortAllergens(x.allergenKeys) : []
  const names = Array.isArray(x?.allergens) ? x.allergens.filter((n): n is string => typeof n === 'string') : []
  // Äldre sparade produkter har bara de svenska namnen.
  const fromNames = sortAllergens(names.map(allergenKeyFromName))
  const contains = sortAllergens([...stored, ...fromNames])
  const traces = Array.isArray(x?.traceKeys) ? sortAllergens(x.traceKeys).filter((k) => !contains.includes(k)) : []
  const fromOff = food.source === 'openfoodfacts'
  const labels = fromOff && Array.isArray(x?.labels) ? x.labels : []
  const hasIngredients = typeof x?.ingredientsText === 'string' && x.ingredientsText.trim() !== ''
  const known = fromOff && (contains.length > 0 || traces.length > 0 || names.length > 0 || hasIngredients)
  // Ett namn som inte går att tolka (t.ex. "vetegluten") betyder att något anges som Lagom inte känner igen.
  const unread = known && (x?.unreadAllergenTags === true || names.some((n) => allergenKeyFromName(n) === undefined))
  return {
    known,
    tracesKnown: known && Array.isArray(x?.traceKeys),
    unread,
    contains,
    traces,
    labelledLactoseFree: labels.includes(LACTOSE_FREE_LABEL),
    labelledGlutenFree: labels.includes(GLUTEN_FREE_LABEL),
  }
}

/** "Kan innehålla spår av" på svenska, för produktinformationen ("nötter och sesam"). */
export function traceNames(food: Pick<Food, 'source' | 'extra'>): string[] {
  return foodAllergenData(food).traces.map((k) => ALLERGEN_META[k].name)
}

// ---------------------------------------------------------------------------
// Flaggor
// ---------------------------------------------------------------------------

/**
 * - `contains`: produkten innehåller något som användaren har markerat.
 * - `traces`: "kan innehålla spår av" något som användaren har markerat.
 * - `lactose`: produkten innehåller mjölk och användaren har markerat laktos.
 * - `label`: produktens egen märkning (laktosfri/glutenfri) enligt Open Food Facts – en neutral
 *   uppgift med källa, aldrig ett löfte.
 */
export type AllergenFlagKind = 'contains' | 'traces' | 'lactose' | 'label'

export interface AllergenFlag {
  kind: AllergenFlagKind
  key: AllergenKey
  /** Hela texten, t.ex. "Innehåller mjölk – som du har markerat". */
  text: string
  /** 'warn' = varsam flagga (varningsfärgens token), 'info' = neutral uppgift. */
  tone: 'warn' | 'info'
}

export interface AllergenAssessment {
  /** Användaren har markerat minst en allergi eller intolerans. */
  active: boolean
  /** Produkten har allergenuppgifter (från Open Food Facts). */
  known: boolean
  flags: AllergenFlag[]
  /** Neutral rad under flaggorna. Saknas när användaren inte har markerat något. */
  note?: string
}

/** Lagoms egna livsmedel, Livsmedelsverket, recept och egna livsmedel – uppgiften saknas, inte allergenerna. */
export const ALLERGENS_UNKNOWN_TEXT = 'Lagom har inga uppgifter om allergener för det här livsmedlet – läs alltid förpackningen och ingredienserna.'
/** Ett eget livsmedel (t.ex. en kopia av en produkt) med flaggor: det som flaggas kan vara ofullständigt. */
export const ALLERGENS_OTHER_UNKNOWN_TEXT = 'Lagom har inga fullständiga uppgifter om allergener för det här livsmedlet – läs alltid förpackningen och ingredienserna.'
export const ALLERGENS_NONE_LISTED_TEXT =
  'Open Food Facts anger inget av det du har markerat. Uppgifterna kan vara ofullständiga – läs alltid förpackningen.'
/** Kort – produktens källa (Open Food Facts, användarbidrag) visas redan intill flaggorna. */
export const ALLERGENS_SOURCE_TEXT = 'Enligt Open Food Facts – läs alltid förpackningen.'
/** En produkt som sparades innan spåren lästes in, med flaggor. */
export const ALLERGENS_SOURCE_TRACES_UNKNOWN_TEXT =
  'Enligt Open Food Facts. Uppgifter om spår saknas för den här sparade produkten – läs alltid förpackningen.'
/** En produkt som sparades innan spåren lästes in, utan flaggor – aldrig "anger inget". */
export const ALLERGENS_TRACES_UNKNOWN_TEXT =
  'Uppgifter om spår saknas för den här sparade produkten, och uppgifterna från Open Food Facts kan vara ofullständiga – läs alltid förpackningen.'
/** Open Food Facts anger något som Lagom inte kan tolka. */
export const ALLERGENS_UNREAD_TEXT = 'Open Food Facts anger allergener som Lagom inte kan tolka – läs alltid förpackningen.'

export function containsText(key: AllergenKey): string {
  return `Innehåller ${ALLERGEN_META[key].name} – som du har markerat`
}

export function tracesText(key: AllergenKey): string {
  return `Kan innehålla spår av ${ALLERGEN_META[key].name} – som du har markerat`
}

export const LACTOSE_FROM_MILK_TEXT = 'Innehåller mjölk – kan innehålla laktos'
/** Laktos (men inte mjölk) i profilen och "kan innehålla spår av mjölk": en neutral uppgift. */
export const MILK_TRACES_TEXT = 'Kan innehålla spår av mjölk'
export const LABELLED_LACTOSE_FREE_TEXT = 'Märkt laktosfri enligt Open Food Facts'
export const LABELLED_GLUTEN_FREE_TEXT = 'Märkt glutenfri enligt Open Food Facts'

const EMPTY: readonly AllergenKey[] = []

/**
 * Varsamma flaggor för ett livsmedel utifrån användarens profil.
 *
 * - Innehåller → "Innehåller mjölk – som du har markerat".
 * - Spår (när det inte redan ingår) → "Kan innehålla spår av nötter – som du har markerat".
 * - Laktos i profilen: märkt laktosfri → "Märkt laktosfri enligt Open Food Facts"; annars mjölk →
 *   "Innehåller mjölk – kan innehålla laktos", och spår av mjölk visas som en neutral uppgift
 *   ("Kan innehålla spår av mjölk"). Har användaren även markerat mjölk flaggas mjölken som vanligt.
 * - Gluten i profilen och märkt glutenfri → "Märkt glutenfri enligt Open Food Facts" (vid sidan av
 *   en eventuell glutenflagga – båda är uppgifter ur källan).
 * - Raden under: källan när något flaggas, annars att Open Food Facts inte anger något av det
 *   markerade – bara för produkter från Open Food Facts vars spår har lästs och där allt gick att
 *   tolka. Annars att uppgifterna saknas (spår, tolkning eller allt). Aldrig "säker" eller "fri från".
 */
export function assessAllergens(food: Pick<Food, 'source' | 'extra'>, profile: readonly AllergenKey[] | undefined): AllergenAssessment {
  const selected = sortAllergens(profile ?? EMPTY)
  const data = foodAllergenData(food)
  if (selected.length === 0) return { active: false, known: data.known, flags: [] }

  const has = new Set(selected)
  const flags: AllergenFlag[] = []
  for (const key of selected) {
    if (key === 'laktos') continue
    if (data.contains.includes(key)) flags.push({ kind: 'contains', key, text: containsText(key), tone: 'warn' })
    else if (data.traces.includes(key)) flags.push({ kind: 'traces', key, text: tracesText(key), tone: 'warn' })
    if (key === 'gluten' && data.labelledGlutenFree) {
      flags.push({ kind: 'label', key, text: LABELLED_GLUTEN_FREE_TEXT, tone: 'info' })
    }
  }
  if (has.has('laktos') && !has.has('mjolk')) {
    if (data.labelledLactoseFree) flags.push({ kind: 'label', key: 'laktos', text: LABELLED_LACTOSE_FREE_TEXT, tone: 'info' })
    else if (data.contains.includes('mjolk')) flags.push({ kind: 'lactose', key: 'laktos', text: LACTOSE_FROM_MILK_TEXT, tone: 'warn' })
    else if (data.traces.includes('mjolk')) flags.push({ kind: 'traces', key: 'laktos', text: MILK_TRACES_TEXT, tone: 'info' })
  } else if (has.has('laktos') && data.labelledLactoseFree) {
    // Mjölkallergi och laktos: mjölken flaggas ovan, märkningen visas som uppgift vid sidan av.
    flags.push({ kind: 'label', key: 'laktos', text: LABELLED_LACTOSE_FREE_TEXT, tone: 'info' })
  }

  return { active: true, known: data.known, flags, note: assessmentNote(data, flags) }
}

function assessmentNote(data: FoodAllergenData, flags: readonly AllergenFlag[]): string {
  if (!data.known) return flags.length > 0 ? ALLERGENS_OTHER_UNKNOWN_TEXT : ALLERGENS_UNKNOWN_TEXT
  if (flags.some((f) => f.kind !== 'label')) return data.tracesKnown ? ALLERGENS_SOURCE_TEXT : ALLERGENS_SOURCE_TRACES_UNKNOWN_TEXT
  if (!data.tracesKnown) return ALLERGENS_TRACES_UNKNOWN_TEXT
  if (data.unread) return ALLERGENS_UNREAD_TEXT
  return ALLERGENS_NONE_LISTED_TEXT
}

/** Bara de varsamma flaggorna (för träfflistor, där neutrala rader blir brus). */
export function warnFlags(assessment: AllergenAssessment): AllergenFlag[] {
  return assessment.flags.filter((f) => f.tone === 'warn')
}
