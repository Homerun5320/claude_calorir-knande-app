/**
 * Receptfunktionens rena logik: skalning av ingredienser, läsbara mängder, instruktioner,
 * utkast i redigeraren, sökning, klimat per portion och vänliga texter.
 *
 * Näringsberäkningarna finns i `lib/recipes.ts` – här ligger bara det som är specifikt för
 * receptsidorna. Allt är rena funktioner (testas i `recipeLogic.test.ts`).
 */
import type { Food, FoodTag, Nutrients, PlateSplit, Recipe, RecipeIngredient, UnitKey } from '../../types'
import { EXTRAS_PREFIX, builtinRecipeInfo } from '../../data/recipes'
import { UNIT_LABELS, gramsFor, isPortionUnit, unitLabel } from '../../lib/units'
import { formatGrams, formatNumber, plural } from '../../lib/format'
import { foldSv } from '../../lib/search'
import { uid } from '../../lib/id'
import { recipeCo2e, recipeFinalWeight, recipeRawWeight, recipeServingWeight, recipeTags } from '../../lib/recipes'
import { CLIMATE_REFERENCE, CAR_KG_CO2E_PER_KM } from '../../lib/climate'

// ---------------------------------------------------------------------------
// Konstanter
// ---------------------------------------------------------------------------

/** Prefix för användarens egna recept-id:n. */
export const OWN_RECIPE_PREFIX = 'r_'

/** Max antal portioner i skalning och redigerare. */
export const MAX_SERVINGS = 200

/** Ett handplockat urval emojis för egna recept. */
export const RECIPE_EMOJIS = [
  '🍲', '🥘', '🍝', '🍛', '🥗', '🥪', '🌮', '🌯', '🍕', '🍔', '🥩', '🍗',
  '🐟', '🦐', '🥚', '🥞', '🥣', '🍜', '🥟', '🫘', '🥔', '🥕', '🥦', '🍄',
  '🧀', '🍞', '🥐', '🧁', '🍰', '🍪', '🍫', '🍓', '🫐', '🍎', '🥤', '🌱',
] as const

export const DEFAULT_RECIPE_EMOJI = '🍲'

/** Dölj webbläsarens egen rensa-knapp i sökfält (TextField har en egen). */
export const HIDE_NATIVE_CLEAR = '[&_input::-webkit-search-cancel-button]:appearance-none [&_input::-webkit-search-cancel-button]:hidden'

/** Svenska etiketter för märkningar. */
export const TAG_LABELS: Record<FoodTag, string> = {
  vegan: 'Vegansk',
  vegetarisk: 'Vegetarisk',
  glutenfri: 'Glutenfri',
  laktosfri: 'Laktosfri',
  nyckelhal: 'Nyckelhålsmärkt',
  fullkorn: 'Fullkorn',
  ekologisk: 'Ekologisk',
  svensk: 'Svensk',
  klassiker: 'Klassiker',
}

/** Märkningar som användaren kan välja i redigeraren. */
export const EDITABLE_TAGS: readonly FoodTag[] = ['vegetarisk', 'vegan', 'glutenfri', 'laktosfri', 'fullkorn', 'klassiker']

/** Ordning när märkningar visas. */
const TAG_ORDER: readonly FoodTag[] = ['vegan', 'vegetarisk', 'glutenfri', 'laktosfri', 'fullkorn', 'nyckelhal', 'ekologisk', 'klassiker', 'svensk']

/** Märkningar sorterade för visning (vegan först, "svensk" sist) utan dubbletter. */
export function sortedTags(tags: readonly FoodTag[]): FoodTag[] {
  return [...new Set(tags)].sort((a, b) => TAG_ORDER.indexOf(a) - TAG_ORDER.indexOf(b))
}

// ---------------------------------------------------------------------------
// Portioner och skalning
// ---------------------------------------------------------------------------

/** Portionsord: standard portion/portioner, för bakverk t.ex. bulle/bullar. */
export type ServingNoun = readonly [one: string, many: string]

export const DEFAULT_SERVING_NOUN: ServingNoun = ['portion', 'portioner']

/** "4 portioner", "1 bulle", "40 bullar". */
export function servingsText(n: number, noun: ServingNoun = DEFAULT_SERVING_NOUN): string {
  return plural(n, noun[0], noun[1])
}

/** "Per portion", "Per bulle". */
export function perServingText(noun: ServingNoun = DEFAULT_SERVING_NOUN): string {
  return `Per ${noun[0]}`
}

/** Skalfaktor från receptets portioner till önskat antal. */
export function scaleFactor(recipe: Pick<Recipe, 'servings'>, servings: number): number {
  const base = Number.isFinite(recipe.servings) && recipe.servings > 0 ? recipe.servings : 1
  if (!Number.isFinite(servings) || servings <= 0) return 1
  return servings / base
}

/** En ingrediens skalad med en faktor (mängd och gram). */
export function scaleIngredient<T extends Pick<RecipeIngredient, 'amount' | 'grams'>>(ingredient: T, factor: number): T {
  if (factor === 1) return ingredient
  return { ...ingredient, amount: ingredient.amount * factor, grams: ingredient.grams * factor }
}

/**
 * Avrunda en mängd till något man kan mäta upp i ett kök:
 * gram/ml till 5 (över 100), hela (över 10) eller en decimal; kg/l två decimaler;
 * mått och portioner till närmaste fjärdedel (eller hela tal från 20).
 */
export function roundAmount(amount: number, unit: UnitKey): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0
  if (unit === 'g' || unit === 'ml') {
    if (amount >= 100) return Math.round(amount / 5) * 5
    if (amount >= 10) return Math.round(amount)
    return Math.round(amount * 10) / 10
  }
  if (unit === 'kg' || unit === 'l') return Math.round(amount * 100) / 100
  if (amount >= 20) return Math.round(amount)
  if (amount < 0.25) return Math.round(amount * 100) / 100
  return Math.round(amount * 4) / 4
}

/** 0,5 → "½", 1,5 → "1½", 2,25 → "2¼", 0,4 → "0,4". */
export function formatFractionAmount(value: number): string {
  if (!Number.isFinite(value)) return '–'
  const whole = Math.floor(value + 1e-9)
  const rest = value - whole
  const glyph = Math.abs(rest - 0.25) < 1e-6 ? '¼' : Math.abs(rest - 0.5) < 1e-6 ? '½' : Math.abs(rest - 0.75) < 1e-6 ? '¾' : ''
  if (glyph) return whole > 0 ? `${whole}${glyph}` : glyph
  return formatNumber(value, 2)
}

/** Pluralformer för vanliga portionsord i livsmedelsdatabasen. */
const PLURALS: Record<string, string> = {
  st: 'st',
  ägg: 'ägg',
  äggula: 'äggulor',
  äggvita: 'äggvitor',
  klyfta: 'klyftor',
  förpackning: 'förpackningar',
  portion: 'portioner',
  tortilla: 'tortillas',
  platta: 'plattor',
  påse: 'påsar',
  tärning: 'tärningar',
  knippe: 'knippen',
  skiva: 'skivor',
  burk: 'burkar',
  bit: 'bitar',
  kaka: 'kakor',
  stjälk: 'stjälkar',
  klick: 'klickar',
  filé: 'filéer',
  kruka: 'krukor',
  ask: 'askar',
  huvud: 'huvuden',
  kvist: 'kvistar',
  nypa: 'nypor',
  kopp: 'koppar',
  flaska: 'flaskor',
  paket: 'paket',
  tub: 'tuber',
  kula: 'kulor',
  skopa: 'skopor',
  handfull: 'handfullar',
  näve: 'nävar',
  blad: 'blad',
  bukett: 'buketter',
  ring: 'ringar',
  rad: 'rader',
  glas: 'glas',
  dl: 'dl',
  msk: 'msk',
  tsk: 'tsk',
  krm: 'krm',
}

/** Adjektiv som inleder vissa portionsetiketter ("1 hel gurka", "1 liten burk"). */
const LEADING_ADJECTIVES = new Set(['hel', 'helt', 'halv', 'liten', 'litet', 'stor', 'stort'])

/**
 * Mängden för en portionsenhet i läsbar form, t.ex. "3 ägg", "½ st", "2 klyftor", "4 portioner",
 * "½ hel gurka". Etiketter som inte börjar med "1 …" skrivs som "2 × på en toast (15 g)".
 */
export function portionAmountText(label: string, amount: number): string {
  const qty = formatFractionAmount(amount)
  const m = label.trim().match(/^1\s+(.+)$/)
  if (!m) return `${qty} × ${label.trim()}`
  const core = m[1].replace(/\s*\([^)]*\)/g, '').trim()
  const words = core.split(/\s+/)
  const first = (words[0] ?? '').replace(/[,.]$/, '')
  if (LEADING_ADJECTIVES.has(first.toLocaleLowerCase('sv-SE'))) {
    const phrase = words.slice(0, 2).join(' ').replace(/[,.]$/, '')
    return amount <= 1 ? `${qty} ${phrase}` : `${qty} × ${phrase}`
  }
  if (amount <= 1) return `${qty} ${first}`
  const many = PLURALS[first.toLocaleLowerCase('sv-SE')]
  return many ? `${qty} ${many}` : `${qty} × ${core}`
}

export interface AmountDisplay {
  /** Huvudtexten, t.ex. "2½ dl", "3 ägg", "500 g". */
  text: string
  /** Vikten, t.ex. "150 g" – utelämnas när mängden redan är i gram. */
  grams?: string
}

/** Läsbar mängd för en ingrediens (efter avrundning) med vikten som komplement. */
export function formatIngredientAmount(food: Pick<Food, 'portions' | 'density' | 'liquid'>, amount: number, unit: UnitKey): AmountDisplay {
  const rounded = roundAmount(amount, unit)
  const g = gramsFor(food, amount, unit)
  const gramsText = Number.isFinite(g) && g > 0 ? formatGrams(roundAmount(g, 'g'), g < 10 ? 1 : 0) : undefined
  if (unit === 'g') return { text: formatGrams(rounded, rounded < 10 ? 1 : 0) }
  if (isPortionUnit(unit)) return { text: portionAmountText(unitLabel(food, unit), rounded), grams: gramsText }
  const short = UNIT_LABELS[unit as keyof typeof UNIT_LABELS]?.short ?? unit
  const qty = unit === 'kg' || unit === 'l' || rounded >= 20 ? formatNumber(rounded, 2) : formatFractionAmount(rounded)
  return { text: `${qty} ${short}`, grams: gramsText }
}

// ---------------------------------------------------------------------------
// Instruktioner
// ---------------------------------------------------------------------------

export interface ParsedInstructions {
  /** Ingredienser som inte räknas, t.ex. "50 g jäst, pärlsocker". */
  extras?: string
  steps: string[]
}

const STEP_MARKER = /^\s*(?:\d{1,2}\s*[.)]|[-–•*])\s*/

/** Dela upp instruktionstexten i steg (en rad per steg) och plocka ut "Du behöver även: …". */
export function parseInstructions(text: string | undefined): ParsedInstructions {
  const lines = (text ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  let extras: string | undefined
  const steps: string[] = []
  for (const line of lines) {
    if (extras === undefined && line.startsWith(EXTRAS_PREFIX)) {
      const rest = line.slice(EXTRAS_PREFIX.length).trim().replace(/\.$/, '')
      if (rest) extras = rest
      continue
    }
    const step = line.replace(STEP_MARKER, '').trim()
    if (step) steps.push(step)
  }
  return extras === undefined ? { steps } : { extras, steps }
}

// ---------------------------------------------------------------------------
// Utkast i redigeraren
// ---------------------------------------------------------------------------

export interface RecipeDraft {
  name: string
  emoji: string
  servings: number
  prepMinutes?: number
  ingredients: RecipeIngredient[]
  cookedWeightG?: number
  instructions: string
  tags: FoodTag[]
}

export function emptyDraft(): RecipeDraft {
  return { name: '', emoji: DEFAULT_RECIPE_EMOJI, servings: 4, ingredients: [], instructions: '', tags: [] }
}

export function draftFromRecipe(recipe: Recipe): RecipeDraft {
  return {
    name: recipe.name,
    emoji: recipe.emoji ?? DEFAULT_RECIPE_EMOJI,
    servings: recipe.servings > 0 ? recipe.servings : 1,
    prepMinutes: recipe.prepMinutes,
    ingredients: recipe.ingredients,
    cookedWeightG: recipe.cookedWeightG,
    instructions: recipe.instructions ?? '',
    tags: recipe.tags ?? [],
  }
}

export interface DraftErrors {
  name?: string
  ingredients?: string
  servings?: string
  cookedWeightG?: string
  prepMinutes?: string
}

/** Kontrollera ett utkast. Tomt objekt = giltigt. */
export function validateDraft(draft: RecipeDraft): DraftErrors {
  const errors: DraftErrors = {}
  if (!draft.name.trim()) errors.name = 'Ge receptet ett namn.'
  if (draft.ingredients.length === 0) errors.ingredients = 'Lägg till minst en ingrediens.'
  if (!Number.isFinite(draft.servings) || draft.servings < 1) errors.servings = 'Receptet behöver minst en portion.'
  if (draft.cookedWeightG !== undefined && !(draft.cookedWeightG > 0)) errors.cookedWeightG = 'Ange en vikt större än 0 g – eller lämna fältet tomt.'
  if (draft.prepMinutes !== undefined && !(draft.prepMinutes >= 0)) errors.prepMinutes = 'Ange tiden i minuter.'
  return errors
}

export function hasErrors(errors: DraftErrors): boolean {
  return Object.values(errors).some(Boolean)
}

/** Ett nytt id för ett eget recept: 'r_<uid>'. */
export function newRecipeId(): string {
  return uid(OWN_RECIPE_PREFIX)
}

/**
 * Ögonblicksbild av ett livsmedel för en ingrediens – utan stora fält som inte behövs
 * (ingredienslista från Open Food Facts).
 */
export function ingredientFood(food: Food): Food {
  if (!food.extra?.ingredientsText) return food
  const { ingredientsText: _omit, ...extra } = food.extra
  return { ...food, extra }
}

/** Skapa en ingrediens. Gram räknas om från mängd och enhet om de inte anges. */
export function makeIngredient(food: Food, amount: number, unit: UnitKey, grams?: number): RecipeIngredient {
  const g = grams !== undefined && Number.isFinite(grams) ? grams : gramsFor(food, amount, unit)
  return { id: uid('i_'), food: ingredientFood(food), amount, unit, grams: Math.round(g * 10) / 10 }
}

/** Bygg ett recept av ett utkast. `base` behåller id och skapandetid vid redigering. */
export function recipeFromDraft(draft: RecipeDraft, base?: Pick<Recipe, 'id' | 'createdAt'>, now: number = Date.now()): Recipe {
  const cooked = draft.cookedWeightG !== undefined && draft.cookedWeightG > 0 ? Math.round(draft.cookedWeightG) : undefined
  const prep = draft.prepMinutes !== undefined && draft.prepMinutes > 0 ? Math.round(draft.prepMinutes) : undefined
  const instructions = draft.instructions.trim()
  const recipe: Recipe = {
    id: base?.id ?? newRecipeId(),
    name: draft.name.trim(),
    emoji: draft.emoji || DEFAULT_RECIPE_EMOJI,
    servings: Math.max(1, Math.round(draft.servings)),
    ingredients: draft.ingredients,
    tags: sortedTags(draft.tags),
    createdAt: base?.createdAt ?? now,
    updatedAt: now,
  }
  if (cooked !== undefined) recipe.cookedWeightG = cooked
  if (prep !== undefined) recipe.prepMinutes = prep
  if (instructions) recipe.instructions = instructions
  return recipe
}

/** Kopiera ett recept (t.ex. en svensk klassiker) till ett nytt eget recept. */
export function copyRecipe(recipe: Recipe, now: number = Date.now()): Recipe {
  const { builtin: _builtin, ...rest } = recipe
  return {
    ...rest,
    id: newRecipeId(),
    ingredients: recipe.ingredients.map((i) => ({ ...i, id: uid('i_') })),
    tags: recipe.tags ? [...recipe.tags] : undefined,
    createdAt: now,
    updatedAt: now,
  }
}

/** true om utkastet skiljer sig från receptet (eller är ifyllt, för ett nytt recept). */
export function isDraftDirty(draft: RecipeDraft, original: RecipeDraft): boolean {
  return (
    draft.name.trim() !== original.name.trim() ||
    draft.emoji !== original.emoji ||
    draft.servings !== original.servings ||
    draft.prepMinutes !== original.prepMinutes ||
    draft.cookedWeightG !== original.cookedWeightG ||
    draft.instructions.trim() !== original.instructions.trim() ||
    draft.ingredients !== original.ingredients ||
    draft.tags.join(',') !== original.tags.join(',')
  )
}

// ---------------------------------------------------------------------------
// Sökning och sortering
// ---------------------------------------------------------------------------

/** Söktext för ett recept: namn, märkningar och ingredienser (normaliserat, utan å/ä/ö-skillnad). */
function searchText(recipe: Recipe): string {
  return foldSv(
    [recipe.name, ...(recipe.tags ?? []).map((t) => TAG_LABELS[t]), ...recipe.ingredients.map((i) => i.food.name)].join(' '),
  )
}

const textCache = new WeakMap<Recipe, string>()

/** true om alla ord i sökningen finns i receptets namn, märkningar eller ingredienser. */
export function recipeMatches(recipe: Recipe, query: string): boolean {
  const q = foldSv(query)
  if (!q) return true
  let text = textCache.get(recipe)
  if (text === undefined) {
    text = searchText(recipe)
    textCache.set(recipe, text)
  }
  const hay = text
  return q.split(/\s+/).every((word) => hay.includes(word))
}

/** Filtrera på sökning. Träffar i namnet sorteras först. */
export function filterRecipes(recipes: readonly Recipe[], query: string): Recipe[] {
  const q = foldSv(query)
  if (!q) return [...recipes]
  const hits = recipes.filter((r) => recipeMatches(r, q))
  const inName = (r: Recipe) => (foldSv(r.name).includes(q) ? 0 : 1)
  return hits.map((r, i) => ({ r, i, k: inName(r) })).sort((a, b) => a.k - b.k || a.i - b.i).map((x) => x.r)
}

/** Egna recept: favoriter först, sedan senast ändrade. */
export function sortOwnRecipes(recipes: readonly Recipe[], favorites: ReadonlySet<string>): Recipe[] {
  return [...recipes].sort((a, b) => {
    const fa = favorites.has(recipeFavoriteId(a.id)) ? 0 : 1
    const fb = favorites.has(recipeFavoriteId(b.id)) ? 0 : 1
    return fa - fb || b.updatedAt - a.updatedAt || a.name.localeCompare(b.name, 'sv')
  })
}

/** Id som används för favoriter – samma som receptets livsmedels-id ('recipe:<id>'). */
export function recipeFavoriteId(recipeId: string): string {
  return recipeId.startsWith('recipe:') ? recipeId : `recipe:${recipeId}`
}

/** Vegetariskt enligt märkningar (egna eller härledda från ingredienserna). */
export function isVegetarian(recipe: Recipe): boolean {
  const tags = recipeTags(recipe)
  return tags.includes('vegetarisk') || tags.includes('vegan')
}

// ---------------------------------------------------------------------------
// Tillagad vikt
// ---------------------------------------------------------------------------

export interface WeightInfo {
  raw: number
  final: number
  perServing: number
  /** Tillagad vikt är angiven. */
  cooked: boolean
  /** Förändring i procent från råvikt till tillagad vikt (negativ = vatten har kokat bort). */
  changePct?: number
  /** Receptet innehåller torra råvaror som suger upp vatten vid kokning (ris, pasta, gryn, baljväxter). */
  absorbs?: boolean
}

/** Kategorier med torra råvaror som suger upp vatten när de kokas. */
const ABSORBING_CATEGORIES: ReadonlySet<string> = new Set(['pasta_ris', 'spannmal', 'baljvaxter'])

export function weightInfo(recipe: Pick<Recipe, 'ingredients' | 'cookedWeightG' | 'servings'>): WeightInfo {
  const raw = recipeRawWeight(recipe)
  const final = recipeFinalWeight(recipe)
  const cooked = recipe.cookedWeightG !== undefined && recipe.cookedWeightG > 0
  const info: WeightInfo = { raw, final, perServing: recipeServingWeight(recipe), cooked }
  if (cooked && raw > 0) info.changePct = ((final - raw) / raw) * 100
  if (recipe.ingredients.some((i) => i.grams > 0 && ABSORBING_CATEGORIES.has(i.food.category))) info.absorbs = true
  return info
}

/** Vänlig förklaring av skillnaden mellan råvikt och tillagad vikt. */
export function cookedWeightText(info: WeightInfo): string {
  if (!info.cooked) return 'Ingen tillagad vikt angiven – näringen per portion räknas på råvikten.'
  const change = info.changePct ?? 0
  if (Math.abs(change) < 2) return 'Rätten väger ungefär lika mycket färdig som rå.'
  const pct = formatNumber(Math.abs(change))
  if (change < 0) return `Rätten har tappat ${pct} % i vikt (mest vatten som kokat bort) – varje gram innehåller därför mer näring.`
  // Viktökning kommer av vätska: antingen sådan som torra råvaror sugit upp, eller vatten och buljong
  // som inte står bland ingredienserna. Påstå inte att det är ris eller pasta om receptet saknar det.
  return info.absorbs
    ? `Rätten väger ${pct} % mer färdig – torra råvaror som ris, pasta, gryn och baljväxter suger upp vatten när de kokas.`
    : `Rätten väger ${pct} % mer färdig – troligen av vätska som inte står bland ingredienserna, till exempel vatten eller buljong.`
}

/** Mild varning om den tillagade vikten verkar orimlig jämfört med råvikten. */
export function cookedWeightWarning(raw: number, cooked: number | undefined): string | undefined {
  if (cooked === undefined || !(cooked > 0) || !(raw > 0)) return undefined
  const ratio = cooked / raw
  if (ratio < 0.3) return 'Vikten är mindre än en tredjedel av råvikten. Glömde du att dra av kastrullens vikt två gånger?'
  if (ratio > 3) return 'Vikten är mer än tre gånger råvikten. Räknade du med kastrullen?'
  return undefined
}

// ---------------------------------------------------------------------------
// Klimat
// ---------------------------------------------------------------------------

export interface ServingClimate {
  /** kg CO2e för en portion. */
  kg: number
  level: 'lag' | 'medel' | 'hog'
  label: string
  tone: 'mossa' | 'sol' | 'hjortron'
  /** "3,2 km" eller "400 meter" med bil. */
  carText: string
}

/**
 * Klimatavtryck för en portion, jämfört med en klimatsmart måltid (WWF One Planet Plate ≈ 0,5 kg).
 * Låg upp till en klimatsmart måltid, medel upp till tre gånger så mycket, annars hög.
 */
export function servingClimate(recipe: Pick<Recipe, 'ingredients' | 'cookedWeightG' | 'servings'>): ServingClimate | undefined {
  const perKg = recipeCo2e(recipe)
  const grams = recipeServingWeight(recipe)
  if (perKg === undefined || !(grams > 0)) return undefined
  const kg = (perKg * grams) / 1000
  const meal = CLIMATE_REFERENCE.onePlanetMealKg
  const km = kg / CAR_KG_CO2E_PER_KM
  const carText = km < 1 ? `${formatNumber(Math.max(10, Math.round((km * 1000) / 10) * 10))} meter` : `${formatNumber(km, 1)} km`
  if (kg <= meal) return { kg, level: 'lag', label: 'Låg klimatpåverkan', tone: 'mossa', carText }
  if (kg <= meal * 3) return { kg, level: 'medel', label: 'Medelhög klimatpåverkan', tone: 'sol', carText }
  return { kg, level: 'hog', label: 'Hög klimatpåverkan', tone: 'hjortron', carText }
}

// ---------------------------------------------------------------------------
// Tallriksmodellen
// ---------------------------------------------------------------------------

/** Andel av rätten som hör till tallrikens tre delar. */
export function plateShare(split: PlateSplit | undefined): number {
  if (!split) return 0
  return split.veg + split.carb + split.protein
}

/**
 * Tallriksmodellen passar måltider – inte bakverk, fika och desserter. Visas när minst en
 * tredjedel av rätten hör till tallrikens delar och högst en femtedel av energin kommer från socker.
 */
export function showPlateFor(recipe: Pick<Recipe, 'id' | 'builtin'>, perServing: Nutrients, plate: PlateSplit | undefined): boolean {
  if (recipe.builtin) {
    const info = builtinRecipeInfo(recipe.id)
    if (info?.group === 'fika' || info?.servingNoun) return false
  }
  if (plateShare(plate) < 0.35) return false
  const kcal = perServing.kcal
  const sugar = perServing.sugars ?? perServing.addedSugar
  if (kcal !== undefined && kcal > 0 && sugar !== undefined && (sugar * 4) / kcal >= 0.2) return false
  return true
}

/**
 * Tallrikens andelar räknade på bara de tre delarna (grönsaker, kolhydrater, protein) så att de
 * summerar till 1 – samma sätt som måltider räknas i dagboken (`mealPlate`). Sås, fett, mjölk och
 * annat "övrigt" ingår inte. undefined när inget hör till tallrikens delar.
 */
export function plateFractions(split: PlateSplit | undefined): PlateSplit | undefined {
  if (!split) return undefined
  const clean = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0)
  const veg = clean(split.veg)
  const carb = clean(split.carb)
  const protein = clean(split.protein)
  const total = veg + carb + protein
  if (!(total > 0)) return undefined
  return { veg: veg / total, carb: carb / total, protein: protein / total }
}

/** Neutral, uppmuntrande kommentar om rätten i Tallriksmodellen. */
export function plateNote(split: PlateSplit | undefined): string {
  const total = plateShare(split)
  if (!split || total < 0.05) return 'Rätten hör inte till tallrikens tre delar – njut av den som den är.'
  const veg = split.veg / total
  const protein = split.protein / total
  const carb = split.carb / total
  if (veg >= 0.4) return 'Fint med grönt! Rätten ligger nära Tallriksmodellens halva tallrik grönsaker.'
  if (veg < 0.15) {
    if (protein >= 0.35) return 'Mycket protein här – en sallad, rivna morötter eller ärtor vid sidan gör tallriken ännu mer lagom.'
    return 'Tips: servera med en sallad, rårivna morötter eller kokta grönsaker så blir tallriken mer i balans.'
  }
  if (carb >= 0.55) return 'Rätten är rik på potatis, pasta eller gryn. Lite extra grönsaker och en proteinkälla balanserar fint.'
  return 'En bra bas! Fyll gärna på med lite mer grönsaker för att nå halva tallriken.'
}
