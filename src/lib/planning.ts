/**
 * Veckoplanering med inköpslista – ren logik utan React och butiker (testas i planning.test.ts).
 *
 * - Typerna för planerade rader (`PlanItem`) och veckans inköpslista (`WeekShopping`).
 * - Veckor: måndag först, datum via `lib/dates` (`weekDates`, `weekTitle`, `weekRangeText`).
 * - Energi och protein per planerad rad och dag (`planItemNutrients`, `planTotals`) och en lugn,
 *   icke-dömande text mot dagsmålet (`planBalanceText`).
 * - Inköpslistan (`buildShoppingList`): recepten skalas efter antalet portioner att laga, sparade
 *   måltider och livsmedel räknas i gram, samma livsmedel summeras (även via alias för gamla id:n)
 *   och allt grupperas per butiksavdelning. Kött, fisk, pasta och ris anges i rå eller okokt vikt –
 *   så som varan köps – och annars i svenska mått där livsmedlet har portioner (`formatAmount`).
 * - Tolerant inläsning av sparad data och säkerhetskopior (`sanitizePlanData`): skadade rader hoppas
 *   över och småfel rättas, så att sidan aldrig kraschar på gammal eller handredigerad data.
 *
 * Ett recept planeras med två tal: portioner att LAGA (styr inköpslistan – 0 betyder rester, inget
 * att handla) och portioner du själv ÄTER (styr energin och loggningen i dagboken). Så fungerar
 * planeringen även för ett hushåll där alla äter av samma gryta.
 */
import type { Food, FoodCategory, FoodSource, ISODate, MealConfig, MealId, Nutrients, Portion, RawWeight, Recipe, UnitKey } from '../types'
import { FOOD_CATEGORIES, MEAL_IDS } from '../types'
import { aliasAmount, canonicalFoodId, resolveFoodAlias } from '../data/foods/aliases'
import { addDays, diffDays, formatDayShort, fromISODate, isValidISODate, isoWeek, startOfWeek, todayISO } from './dates'
import { formatGrams, formatNumber } from './format'
import { DEFAULT_MEAL_NAMES } from './meals'
import { NUTRIENT_KEYS, nutrientsForGrams, scaleNutrients, sumNutrients } from './nutrients'
import { RECIPE_ID_PREFIX, ingredientGrams, recipeFinalWeight, recipePerServing, recipeServings } from './recipes'
import { densityOf, formatAmount, gramsFor, isPortionUnit, isRawUnit, isVolumeUnit, rawKindLabel, VOLUME_ML } from './units'

// ---------------------------------------------------------------------------
// Typer
// ---------------------------------------------------------------------------

/** Energi och protein – det som visas per planerad rad och dag. */
export type PlanNutrients = Pick<Nutrients, 'kcal' | 'protein'>

/** Ett livsmedel med mängd (samma form som i en sparad måltid). */
export interface PlanFoodAmount {
  /** Ögonblicksbild av livsmedlet när raden planerades. */
  food: Food
  amount: number
  unit: UnitKey
  /** Uppslagen vikt i gram (tillagad vikt för livsmedel som anges tillagade). */
  grams: number
}

interface PlanItemBase {
  id: string
  date: ISODate
  meal: MealId
  createdAt: number
  /**
   * Dagboksposterna som skapades när raden loggades. Raden räknas som loggad så länge någon av
   * dem finns kvar i dagboken – ångras loggningen blir raden ologgad igen.
   */
  loggedEntryIds?: string[]
}

/** Ett recept: eget ('r_…') eller inbyggd klassiker ('klassiker-…'). */
export interface PlanRecipeItem extends PlanItemBase {
  kind: 'recipe'
  /** Receptets id (utan prefixet 'recipe:'). */
  recipeId: string
  /** Namn och emoji när raden planerades – visas om receptet inte går att hitta. */
  name: string
  emoji?: string
  /** Portioner att laga – styr inköpslistan. 0 = rester, inget att handla. */
  servings: number
  /** Portioner du själv äter – styr energin och loggningen. */
  eat: number
  /** Energi och protein per portion när raden planerades (reserv om receptet inte finns). */
  perServing?: PlanNutrients
}

/** En sparad måltid – livsmedlen kopieras, så att planen fungerar även om måltiden tas bort. */
export interface PlanMealItem extends PlanItemBase {
  kind: 'meal'
  templateId?: string
  name: string
  items: PlanFoodAmount[]
}

/** Ett enskilt livsmedel med mängd. */
export interface PlanFoodItem extends PlanItemBase, PlanFoodAmount {
  kind: 'food'
}

export type PlanItem = PlanRecipeItem | PlanMealItem | PlanFoodItem
export type PlanItemKind = PlanItem['kind']

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

/** En ny rad innan den får id och tidsstämpel. */
export type NewPlanItem = DistributiveOmit<PlanItem, 'id' | 'createdAt' | 'loggedEntryIds'>

/** En egen rad i inköpslistan ("Diskmedel", "Kaffefilter"). */
export interface ShoppingExtra {
  id: string
  text: string
  checked: boolean
  createdAt: number
}

/** Inköpslistans tillstånd för en vecka (nyckel: veckans måndag). */
export interface WeekShopping {
  /** Avbockade varor (`ShoppingLine.key`). */
  checked: string[]
  extras: ShoppingExtra[]
}

/** Allt som sparas för planeringen. */
export interface PlanData {
  /** Planerade rader per datum. */
  items: Record<ISODate, PlanItem[]>
  /** Inköpslistans bockar och egna rader per vecka (måndagens datum). */
  shopping: Record<ISODate, WeekShopping>
}

/** Slår upp ett recept på id ('klassiker-…', 'r_…' eller 'recipe:…'). */
export type RecipeResolver = (recipeId: string) => Recipe | undefined

// ---------------------------------------------------------------------------
// Gränser
// ---------------------------------------------------------------------------

/**
 * Flest portioner att laga per planerad rad. Högt nog för bak med många bitar (en sats
 * pepparkakor ger 120) – skyddet gäller bara orimliga värden.
 */
export const MAX_COOK_SERVINGS = 500
/** Flest portioner du själv äter per planerad rad. */
export const MAX_EAT_SERVINGS = 10
/** Längsta text på en egen rad i inköpslistan. */
export const MAX_EXTRA_LENGTH = 120
/** Flest egna rader per vecka. */
export const MAX_EXTRAS_PER_WEEK = 100
/** Flest planerade rader per dag (skydd mot skadad data). */
export const MAX_ITEMS_PER_DAY = 60

// ---------------------------------------------------------------------------
// Veckor
// ---------------------------------------------------------------------------

/** Veckans måndag för ett datum (veckan börjar på måndag). */
export function weekStartOf(date: ISODate): ISODate {
  return startOfWeek(date)
}

/** Veckans sju datum, måndag först. */
export function weekDates(weekStart: ISODate): ISODate[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
}

/** "Vecka 40" (ISO-veckonummer, som i Sverige). */
export function weekTitle(weekStart: ISODate): string {
  return `Vecka ${isoWeek(weekStart)}`
}

/** "29 sep – 5 okt", med år när veckan inte ligger i innevarande år ("29 dec 2025 – 4 jan 2026"). */
export function weekRangeText(weekStart: ISODate, today: ISODate = todayISO()): string {
  const end = addDays(weekStart, 6)
  const startYear = fromISODate(weekStart).getFullYear()
  const endYear = fromISODate(end).getFullYear()
  const thisYear = fromISODate(today).getFullYear()
  const a = formatDayShort(weekStart)
  const b = formatDayShort(end)
  if (startYear === thisYear && endYear === thisYear) return `${a} – ${b}`
  if (startYear === endYear) return `${a} – ${b} ${endYear}`
  return `${a} ${startYear} – ${b} ${endYear}`
}

/** "Denna vecka", "Nästa vecka", "Förra veckan" – annars undefined. */
export function relativeWeekLabel(weekStart: ISODate, today: ISODate = todayISO()): string | undefined {
  const diff = diffDays(weekStartOf(today), weekStart)
  if (diff === 0) return 'Denna vecka'
  if (diff === 7) return 'Nästa vecka'
  if (diff === -7) return 'Förra veckan'
  return undefined
}

// ---------------------------------------------------------------------------
// Portioner och mängder
// ---------------------------------------------------------------------------

/** Antal i välbekant form: 0,5 → "½", 1,5 → "1½", 2 → "2", 0,4 → "0,4". */
export function formatCount(value: number): string {
  if (!Number.isFinite(value)) return '–'
  const whole = Math.floor(value + 1e-9)
  const rest = value - whole
  const glyph = Math.abs(rest - 0.25) < 1e-6 ? '¼' : Math.abs(rest - 0.5) < 1e-6 ? '½' : Math.abs(rest - 0.75) < 1e-6 ? '¾' : ''
  if (glyph) return whole > 0 ? `${whole}${glyph}` : glyph
  return formatNumber(value, 2)
}

/** "1 portion", "½ portion", "1½ portioner", "4 portioner". */
export function portionsText(n: number): string {
  return `${formatCount(n)} ${n > 0 && n <= 1 ? 'portion' : 'portioner'}`
}

/**
 * Steget för "Portioner att laga": hela portioner för vanliga recept, men halva satser för bak
 * med många bitar (12 bitar sockerkaka → 6, 120 pepparkakor → 60) – så att man inte behöver
 * trycka 120 gånger för att gå till rester.
 */
export function cookServingsStep(recipeServings: number): number {
  if (!Number.isInteger(recipeServings) || recipeServings < 12) return 1
  return recipeServings % 2 === 0 ? recipeServings / 2 : recipeServings
}

/**
 * Kort beskrivning av en planerad rad:
 * - recept: "1 portion", "4 portioner, du äter 1" eller "Rester, du äter 1 portion",
 * - sparad måltid: livsmedlens namn ("Havregryn, Mjölk, Blåbär"),
 * - livsmedel: mängden med vikt ("2 dl (206 g)", "150 g rå (113 g tillagat)").
 */
export function planItemAmountText(item: PlanItem): string {
  if (item.kind === 'recipe') {
    if (!(item.servings > 0)) return `Rester, du äter ${portionsText(item.eat)}`
    if (item.servings === item.eat) return capitalizeSv(portionsText(item.eat))
    return `${capitalizeSv(portionsText(item.servings))}, du äter ${formatCount(item.eat)}`
  }
  if (item.kind === 'meal') return item.items.map((i) => i.food.name).join(', ')
  const u = item.unit
  return formatAmount(item.food, item.amount, u, isPortionUnit(u) || isVolumeUnit(u) || isRawUnit(u))
}

function capitalizeSv(s: string): string {
  return s.charAt(0).toLocaleUpperCase('sv-SE') + s.slice(1)
}

/** Planerad rads namn (receptets aktuella namn om det finns). */
export function planItemName(item: PlanItem, resolve?: RecipeResolver): string {
  if (item.kind === 'recipe') return resolve?.(item.recipeId)?.name ?? item.name
  if (item.kind === 'meal') return item.name
  return item.food.name
}

// ---------------------------------------------------------------------------
// Energi och protein
// ---------------------------------------------------------------------------

const validGrams = (g: number) => Number.isFinite(g) && g > 0

/** Receptets id utan prefixet 'recipe:' ("recipe:klassiker-kottbullar" → "klassiker-kottbullar"). */
export function recipeKey(id: string): string {
  return id.startsWith(RECIPE_ID_PREFIX) ? id.slice(RECIPE_ID_PREFIX.length) : id
}

/** Energi och protein per portion för ett recept – sparas på raden som reserv. */
export function recipePlanNutrients(recipe: Recipe): PlanNutrients {
  const per = recipePerServing(recipe)
  const out: PlanNutrients = {}
  if (per.kcal !== undefined) out.kcal = per.kcal
  if (per.protein !== undefined) out.protein = per.protein
  return out
}

/**
 * Näringsvärden för en planerad rad så som du äter den. Recept räknas med receptets aktuella
 * innehåll (eller värdet när raden planerades om receptet inte finns) gånger dina portioner.
 * Ett okänt värde förblir okänt – det blir aldrig 0.
 */
export function planItemNutrients(item: PlanItem, resolve?: RecipeResolver): Nutrients {
  if (item.kind === 'food') return validGrams(item.grams) ? nutrientsForGrams(item.food.nutrients, item.grams) : {}
  if (item.kind === 'meal') {
    return sumNutrients(item.items.filter((i) => validGrams(i.grams)).map((i) => nutrientsForGrams(i.food.nutrients, i.grams)))
  }
  const eat = Number.isFinite(item.eat) && item.eat > 0 ? item.eat : 0
  const recipe = resolve?.(item.recipeId)
  const per: Nutrients = recipe ? recipePerServing(recipe) : (item.perServing ?? {})
  return scaleNutrients(per, eat)
}

export interface PlanTotals {
  /** Planerad energi (kcal) – undefined om ingen rad har känd energi. */
  kcal?: number
  /** Planerat protein (g) – undefined om inget värde är känt. */
  protein?: number
  /** Antal planerade rader. */
  count: number
}

/** Summan av planerade rader (t.ex. en dag). */
export function planTotals(items: readonly PlanItem[], resolve?: RecipeResolver): PlanTotals {
  const sum = sumNutrients(items.map((i) => planItemNutrients(i, resolve)))
  return { kcal: sum.kcal, protein: sum.protein, count: items.length }
}

/** Hur den planerade energin förhåller sig till dagsmålet – aldrig värderande. */
export type PlanBalance = 'tom' | 'plats' | 'nara' | 'over'

/** Inom ±10 % av dagsmålet räknas som nära. */
export function planBalance(plannedKcal: number | undefined, targetKcal: number): PlanBalance {
  if (plannedKcal === undefined || !Number.isFinite(plannedKcal) || plannedKcal <= 0) return 'tom'
  if (!(targetKcal > 0)) return 'nara'
  const ratio = plannedKcal / targetKcal
  if (ratio > 1.1) return 'over'
  if (ratio >= 0.9) return 'nara'
  return 'plats'
}

/**
 * En lugn rad om dagens planerade energi mot dagsmålet – inga varningar och ingen skuld:
 * "Plats för ca 450 kcal till", "Lagom nära dagsmålet", "Över dagsmålet – helt okej, det jämnar
 * ut sig över veckan". `formatEnergy` formaterar i användarens enhet (kcal/kJ).
 */
export function planBalanceText(plannedKcal: number | undefined, targetKcal: number, formatEnergy: (kcal: number) => string): string {
  switch (planBalance(plannedKcal, targetKcal)) {
    case 'tom':
      return 'Inget planerat än'
    case 'over':
      return 'Över dagsmålet – helt okej, det jämnar ut sig över veckan'
    case 'nara':
      return 'Lagom nära dagsmålet'
    case 'plats':
      return `Plats för ca ${formatEnergy(targetKcal - (plannedKcal ?? 0))} till`
  }
}

// ---------------------------------------------------------------------------
// Dagens måltider
// ---------------------------------------------------------------------------

export interface PlannedMeal {
  meal: MealId
  name: string
  items: PlanItem[]
}

/**
 * Dagens planerade rader per måltid, i användarens ordning (inställningarna) och med användarens
 * namn på måltiderna. Bara måltider med rader tas med – även avstängda måltider om något är
 * planerat där.
 */
export function groupByMeal(items: readonly PlanItem[], meals: readonly MealConfig[]): PlannedMeal[] {
  const order: MealId[] = [...meals.map((m) => m.id), ...MEAL_IDS.filter((id) => !meals.some((m) => m.id === id))]
  const out: PlannedMeal[] = []
  for (const meal of order) {
    const list = items.filter((i) => i.meal === meal)
    if (list.length === 0) continue
    const name = meals.find((m) => m.id === meal)?.name.trim() || DEFAULT_MEAL_NAMES[meal]
    out.push({ meal, name, items: list })
  }
  return out
}

// ---------------------------------------------------------------------------
// Kopiera vecka
// ---------------------------------------------------------------------------

/**
 * Raderna i en vecka flyttade till en annan vecka (samma veckodag), med nya id:n och utan
 * loggningsmarkering – t.ex. "Kopiera förra veckan".
 */
export function shiftWeekItems(
  source: Readonly<Record<ISODate, readonly PlanItem[]>>,
  fromWeekStart: ISODate,
  toWeekStart: ISODate,
  makeId: () => string,
  now: number = Date.now(),
): PlanItem[] {
  const offset = diffDays(fromWeekStart, toWeekStart)
  const out: PlanItem[] = []
  for (const date of weekDates(fromWeekStart)) {
    for (const item of source[date] ?? []) {
      const copy: PlanItem = { ...item, id: makeId(), createdAt: now, date: addDays(date, offset) }
      delete copy.loggedEntryIds
      out.push(copy)
    }
  }
  return out
}

/** Antal planerade rader i en vecka. */
export function weekItemCount(items: Readonly<Record<ISODate, readonly PlanItem[]>>, weekStart: ISODate): number {
  return weekDates(weekStart).reduce((n, d) => n + (items[d]?.length ?? 0), 0)
}

// ---------------------------------------------------------------------------
// Butiksavdelningar
// ---------------------------------------------------------------------------

/** Butiksavdelningar i den ordning man brukar gå genom en svensk mataffär. */
export const DEPARTMENTS = [
  { id: 'frukt_gront', label: 'Frukt och grönt' },
  { id: 'brod', label: 'Bröd' },
  { id: 'mejeri', label: 'Mejeri och ägg' },
  { id: 'kott_fisk', label: 'Kött, fisk och vego' },
  { id: 'torrvaror', label: 'Torrvaror' },
  { id: 'frys', label: 'Frys' },
  { id: 'ovrigt', label: 'Övrigt' },
] as const

export type DepartmentId = (typeof DEPARTMENTS)[number]['id']

export const DEPARTMENT_LABELS: Record<DepartmentId, string> = Object.fromEntries(DEPARTMENTS.map((d) => [d.id, d.label])) as Record<
  DepartmentId,
  string
>

/** Avdelning per livsmedelskategori. */
export const CATEGORY_DEPARTMENT: Record<FoodCategory, DepartmentId> = {
  gronsaker: 'frukt_gront',
  rotfrukter: 'frukt_gront',
  potatis: 'frukt_gront',
  frukt: 'frukt_gront',
  bar: 'frukt_gront',
  baljvaxter: 'torrvaror',
  notter_fron: 'torrvaror',
  spannmal: 'torrvaror',
  brod: 'brod',
  pasta_ris: 'torrvaror',
  mejeri: 'mejeri',
  ost: 'mejeri',
  agg: 'mejeri',
  rott_kott: 'kott_fisk',
  chark: 'kott_fisk',
  fagel: 'kott_fisk',
  fisk: 'kott_fisk',
  skaldjur: 'kott_fisk',
  vegoprotein: 'kott_fisk',
  vaxtdryck: 'mejeri',
  fett_olja: 'mejeri',
  sas_krydda: 'torrvaror',
  sotsaker: 'torrvaror',
  bakverk: 'brod',
  glass_dessert: 'frys',
  snacks: 'ovrigt',
  dryck: 'ovrigt',
  lask_saft: 'ovrigt',
  juice: 'ovrigt',
  alkohol: 'ovrigt',
  fardigratt: 'ovrigt',
  snabbmat: 'ovrigt',
  kosttillskott: 'ovrigt',
  ovrigt: 'ovrigt',
}

/** "fryst", "frysta", "djupfryst" som eget ord – men inte "frystorkat". */
const FROZEN_WORD = /(^|[^a-zåäöé])(djup)?frysta?(?![a-zåäöé])/

/**
 * Butiksavdelningen för ett livsmedel, härledd från kategorin: frysta varor hamnar i frysen och
 * matoljor bland torrvarorna (smör och margarin står i mejeridisken).
 */
export function departmentFor(food: Pick<Food, 'category' | 'name'> & Partial<Pick<Food, 'rawWeight'>>): DepartmentId {
  const name = food.name.toLocaleLowerCase('sv-SE')
  if (food.rawWeight?.kind === 'fryst' || FROZEN_WORD.test(name)) return 'frys'
  // Köps torkat (t.ex. sojafärs) – står i listan i torkad vikt, bland torrvarorna.
  if (food.rawWeight?.kind === 'torkad') return 'torrvaror'
  if (food.category === 'fett_olja' && name.includes('olja') && !/smör|margarin/.test(name)) return 'torrvaror'
  return CATEGORY_DEPARTMENT[food.category] ?? 'ovrigt'
}

/** Kranvatten köper man inte – det hoppas över i inköpslistan. */
export function isTapWater(food: Pick<Food, 'id' | 'name' | 'category'>): boolean {
  if (canonicalFoodId(food.id) === 'lagom:vatten-kranvatten') return true
  return food.category === 'dryck' && /^(kran)?vatten$/.test(food.name.trim().toLocaleLowerCase('sv-SE'))
}

// ---------------------------------------------------------------------------
// Inköpslista
// ---------------------------------------------------------------------------

export interface ShoppingLine {
  /** Stabil nyckel för bocken: 'food:<id>' (gamla id:n följer sitt alias). */
  key: string
  name: string
  brand?: string
  department: DepartmentId
  /** Livsmedlet (första ögonblicksbilden) – för ikon och mått. */
  food: Food
  /** Total vikt i gram så som livsmedlet anges (tillagad vikt för kött, pasta och ris). */
  grams: number
  /** Mängden att köpa: "500 g rå", "3 st (medel, 360 g)", "6 dl", "1,5 l". Tom om okänd. */
  amountText: string
  /** Rätterna varan behövs till (recept och sparade måltider), i planeringens ordning. */
  usedFor: string[]
  /** true om vikten saknas för någon del – mängden kan då vara större än den som visas. */
  partial: boolean
}

export interface ShoppingGroup {
  id: DepartmentId
  label: string
  lines: ShoppingLine[]
}

export interface ShoppingList {
  groups: ShoppingGroup[]
  /** Antal varor. */
  count: number
  /** Namn på planerade recept som inte gick att hitta (borttagna) – de ingår inte. */
  missingRecipes: string[]
}

export interface ShoppingOptions {
  /**
   * Slår upp dagens livsmedel på id (t.ex. den inbyggda katalogen). Används för gamla id:n i äldre
   * recept och sparade måltider: mängden räknas om till ersättaren (`aliasAmount`), så att t.ex.
   * gram av en gammal rå rad och gram av den nya tillagade raden aldrig blandas.
   */
  food?: (id: string) => Food | undefined
}

interface Contribution {
  /** Radens nyckel i listan (`shoppingKey`). */
  key: string
  food: Food
  amount: number
  unit: UnitKey
  grams: number
  usedFor?: string
}

/** Hur många nivåer recept i recept följs (ett recept som ingrediens i ett annat). */
const MAX_RECIPE_DEPTH = 3

/**
 * Ett gammalt id vars mängder inte går att lägga ihop med ersättarens utan omräkning: en rå rad
 * som ersatts av den tillagade (`unit: 'g-ra'`) eller en ersättare med annan energi per gram
 * (`scale`). Vanliga namnbyten och sammanslagningar har samma vikt och kan summeras direkt.
 */
function needsConversion(alias: { unit?: string; scale?: number }): boolean {
  return alias.unit === 'g-ra' || (alias.scale !== undefined && alias.scale !== 1)
}

/** Plocka ut alla livsmedel som ingår i raderna, med recepten utlösta i sina ingredienser. */
function collectContributions(
  items: readonly PlanItem[],
  resolve: RecipeResolver | undefined,
  findFood: ShoppingOptions['food'],
): { list: Contribution[]; missing: string[] } {
  const list: Contribution[] = []
  const missing: string[] = []

  const addRecipe = (recipe: Recipe, factor: number, depth: number) => {
    for (const ing of recipe.ingredients) {
      const grams = ingredientGrams(ing) * factor
      const amount = Number.isFinite(ing.amount) ? ing.amount * factor : Number.NaN
      addFood(ing.food, amount, ing.unit, grams, recipe.name, depth + 1)
    }
  }

  const addFood = (food: Food, amount: number, unit: UnitKey, grams: number, usedFor: string | undefined, depth: number) => {
    if (isTapWater(food)) return
    // Ett recept som livsmedel (t.ex. i en sparad måltid) löses ut i sina ingredienser.
    if ((food.source === 'recipe' || food.id.startsWith(RECIPE_ID_PREFIX)) && depth < MAX_RECIPE_DEPTH) {
      const recipe = resolve?.(recipeKey(food.id))
      const g = validGrams(grams) ? grams : gramsFor(food, amount, unit)
      const final = recipe ? recipeFinalWeight(recipe) : 0
      if (recipe && final > 0 && validGrams(g)) {
        addRecipe(recipe, g / final, depth)
        return
      }
    }
    // Ett gammalt id (i äldre recept och sparade måltider) räknas på ersättaren.
    const alias = resolveFoodAlias(food.id)
    const target = alias ? findFood?.(alias.to) : undefined
    if (alias && target) {
      const moved = aliasAmount(alias, amount, unit)
      const g = gramsFor(target, moved.amount, moved.unit)
      if (validGrams(g)) {
        list.push({ key: shoppingKey(target), food: target, amount: moved.amount, unit: moved.unit, grams: g, usedFor })
        return
      }
    }
    // Går det inte att räkna om (ersättaren är inte inläst) står en rå eller omskalad rad för sig.
    const key = alias && needsConversion(alias) ? `food:${food.id}` : shoppingKey(food)
    list.push({ key, food, amount, unit, grams, usedFor })
  }

  for (const item of items) {
    if (item.kind === 'recipe') {
      if (!(item.servings > 0)) continue
      const recipe = resolve?.(item.recipeId)
      if (!recipe) {
        if (!missing.includes(item.name)) missing.push(item.name)
        continue
      }
      addRecipe(recipe, item.servings / recipeServings(recipe), 0)
    } else if (item.kind === 'meal') {
      for (const i of item.items) addFood(i.food, i.amount, i.unit, i.grams, item.name, 0)
    } else {
      addFood(item.food, item.amount, item.unit, item.grams, undefined, 0)
    }
  }
  return { list, missing }
}

/** Avrunda uppåt till närmaste steg (0,26 st → ½ st med steget 0,5). */
function roundUp(value: number, step: number): number {
  return Math.ceil(value / step - 1e-9) * step
}

/** Gram för inköp, avrundat uppåt: hela gram under 100 g, annars jämna 5 g. Minst 1 g. */
function roundGrams(g: number): number {
  return Math.max(1, roundUp(g, g < 100 ? 1 : 5))
}

/** Steg för avrundning uppåt per volymenhet. */
const VOLUME_STEP: Record<string, number> = { l: 0.25, dl: 0.25, cl: 1, ml: 10, msk: 0.5, tsk: 0.5, krm: 1 }

/** Portionsord som köps i hela styck ("1 st (medel)", "1 ägg (M, utan skal)", "1 klyfta"). */
const COUNT_LABEL = /^1\s+(st|ägg|äggula|äggvita|klyfta|filé|korv|burk|paket|förpackning|påse|flaska|huvud|knippe|kruka|ask)\b/i

/** true för en portion som räknas i styck. */
function isCountPortion(p: Portion): boolean {
  return p.grams > 0 && (p.id === 'st' || COUNT_LABEL.test(p.label.trim()))
}

/** En portion som räknas i styck – helst "st". */
function countPortion(food: Pick<Food, 'portions'>): Portion | undefined {
  return food.portions.find((p) => p.id === 'st' && p.grams > 0) ?? food.portions.find(isCountPortion)
}

/** Antal styck att köpa: halva under 1 ("½ st lök"), annars hela ("3 ägg", inte "2¾ ägg"). */
function roundCount(n: number): number {
  return n < 1 ? roundUp(n, 0.5) : Math.ceil(n - 1e-9)
}

/**
 * Portioner som beskriver hur mycket man äter, inte hur mycket man köper: "1 portion till mat",
 * "1 liten portion", "1 klick", "1 näve", "1 glas", "1 skvätt i kaffet", "1 liten (2 cl)".
 */
const EATING_LABEL =
  /^\s*1\s+((liten|litet|stor|stort)\s+)?(portion|barnportion|klick|näve|handfull|skvätt|nypa|slev|glas|mugg|kopp|skål|tallrik|kula|drink|smörgås)\b|^\s*1\s+(liten|litet|stor|stort)\s*(\(|$)/i

/**
 * true för en portion som går att handla efter ("1 burk", "1 förpackning", "1 skiva", "1 knippe").
 * Ätportioner ("8 klickar", "3 glas") och etiketter som inte börjar med "1 " ("på 1 smörgås",
 * "½ avokado") anges i stället från vikten – dl för drycker, st eller gram för övrigt.
 */
function isPurchasePortion(p: Portion): boolean {
  return /^\s*1\s/.test(p.label) && !EATING_LABEL.test(p.label)
}

/** Liter med kvartar ("1,25 l"). */
function litersText(ml: number): string {
  return `${formatNumber(roundUp(ml / 1000, 0.25), 2)} l`
}

function validRawWeight(food: Pick<Food, 'rawWeight'>): RawWeight | undefined {
  const rw = food.rawWeight
  return rw && Number.isFinite(rw.factor) && rw.factor > 0 ? rw : undefined
}

/**
 * Mängden att köpa för ett livsmedel i inköpslistan.
 *
 * 1. Rå/okokt vikt om alla delar angavs så ("500 g rå", "3 dl okokt").
 * 2. Livsmedel som anges tillagade (kött, fisk, pasta, ris …) räknas om till rå/okokt vikt –
 *    så som varan köps: 400 g stekt nötfärs → "500 g rå".
 * 3. Samma enhet i alla delar summeras i den enheten: "3 st (medel, 300 g)", "3 dl", "2 msk".
 *    Styckvaror avrundas uppåt till hela ("3 ägg", under 1 till halva: "½ st"), 10 dl eller mer
 *    blir liter (drycker) eller vikt (torrvaror) och minst 1 dl i skedmått blir gram eller dl.
 *    Ätportioner som "1 portion till mat", "1 klick" och "1 glas" anges från vikten.
 * 4. Annars från vikten: drycker i dl eller liter, styckvaror i st, övrigt i gram eller kg.
 *
 * Mängderna avrundas uppåt till jämna mått (¼ dl, hela st, 5 g).
 */
export function shoppingAmountText(food: Food, grams: number, units: ReadonlyMap<UnitKey, number> = new Map()): string {
  const single = units.size === 1 ? [...units][0] : undefined
  if (single && isRawUnit(single[0]) && single[1] > 0) {
    const [unit, amount] = single
    if (unit === 'g-ra') return `${formatGrams(roundGrams(amount))} ${rawKindLabel(food, unit)}`
    return formatAmount(food, roundUp(amount, 0.25), unit)
  }
  const rw = validRawWeight(food)
  if (rw && validGrams(grams)) return `${formatGrams(roundGrams(grams / rw.factor))} ${rawKindLabel(food)}`
  const density = densityOf(food)
  if (single && single[1] > 0) {
    const [unit, amount] = single
    if (unit === 'g') return formatGrams(roundGrams(amount))
    if (unit === 'kg') return formatGrams(roundGrams(amount * 1000))
    const portion = isPortionUnit(unit) ? food.portions.find((p) => `portion:${p.id}` === unit) : undefined
    if (portion && isCountPortion(portion)) return formatAmount(food, roundCount(amount), unit, true)
    // "8 portioner till mat" eller "3 glas" säger inget i butiken – då används vikten nedan.
    if (portion && isPurchasePortion(portion)) return formatAmount(food, roundUp(amount, 0.25), unit, true)
    if (isVolumeUnit(unit) && density !== undefined) {
      const ml = amount * VOLUME_ML[unit]
      const spoon = unit === 'msk' || unit === 'tsk' || unit === 'krm'
      // 10 dl eller mer: liter för drycker, vikt för torrvaror (mjöl och socker köps i kg).
      if (!spoon && ml >= 1000) return food.liquid ? litersText(ml) : formatGrams(roundGrams(validGrams(grams) ? grams : ml * density))
      // Många skedar blir dl (flytande) eller gram ("18 msk smör" → 245 g) nedan.
      if (!spoon || ml < VOLUME_ML.dl) return formatAmount(food, roundUp(amount, VOLUME_STEP[unit] ?? 0.5), unit)
    }
  }
  if (!validGrams(grams)) return ''
  if (food.liquid && density !== undefined) {
    const ml = grams / density
    if (ml >= 1000) return litersText(ml)
    return `${formatNumber(roundUp(ml / VOLUME_ML.dl, 0.5), 1)} dl`
  }
  const count = countPortion(food)
  if (count) return formatAmount(food, roundCount(grams / count.grams), `portion:${count.id}`, true)
  return formatGrams(roundGrams(grams))
}

/** Nyckeln för en vara i inköpslistan – gamla id:n följer sitt alias. */
export function shoppingKey(food: Pick<Food, 'id'>): string {
  return `food:${canonicalFoodId(food.id)}`
}

interface LineAcc {
  key: string
  food: Food
  grams: number
  partial: boolean
  units: Map<UnitKey, number>
  unitsValid: boolean
  usedFor: string[]
}

/**
 * Inköpslistan för planerade rader (t.ex. en vecka):
 * - recept skalas efter portioner att laga (rester med 0 portioner hoppas över),
 * - sparade måltider och livsmedel räknas med sina mängder,
 * - samma livsmedel summeras och grupperas per butiksavdelning, i butikens ordning och
 *   alfabetiskt inom avdelningen; gamla id:n räknas om till ersättaren (`opts.food`),
 * - kranvatten hoppas över, och recept som inte går att hitta räknas upp i `missingRecipes`.
 */
export function buildShoppingList(items: readonly PlanItem[], resolve?: RecipeResolver, opts: ShoppingOptions = {}): ShoppingList {
  const { list, missing } = collectContributions(items, resolve, opts.food)
  const acc = new Map<string, LineAcc>()
  for (const c of list) {
    const key = c.key
    let line = acc.get(key)
    if (!line) {
      line = { key, food: c.food, grams: 0, partial: false, units: new Map(), unitsValid: true, usedFor: [] }
      acc.set(key, line)
    }
    const g = validGrams(c.grams) ? c.grams : gramsFor(c.food, c.amount, c.unit)
    if (validGrams(g)) line.grams += g
    else line.partial = true
    if (Number.isFinite(c.amount) && c.amount > 0) line.units.set(c.unit, (line.units.get(c.unit) ?? 0) + c.amount)
    else line.unitsValid = false
    if (c.usedFor && !line.usedFor.includes(c.usedFor)) line.usedFor.push(c.usedFor)
  }

  const byDept = new Map<DepartmentId, ShoppingLine[]>()
  for (const line of acc.values()) {
    const department = departmentFor(line.food)
    const units = line.unitsValid ? line.units : new Map<UnitKey, number>()
    const out: ShoppingLine = {
      key: line.key,
      name: line.food.name,
      department,
      food: line.food,
      grams: line.grams,
      amountText: shoppingAmountText(line.food, line.grams, units),
      usedFor: line.usedFor,
      partial: line.partial,
    }
    if (line.food.brand) out.brand = line.food.brand
    const group = byDept.get(department)
    if (group) group.push(out)
    else byDept.set(department, [out])
  }

  const collator = new Intl.Collator('sv-SE', { sensitivity: 'base' })
  const groups: ShoppingGroup[] = []
  let count = 0
  for (const dept of DEPARTMENTS) {
    const lines = byDept.get(dept.id)
    if (!lines || lines.length === 0) continue
    lines.sort((a, b) => collator.compare(a.name, b.name))
    groups.push({ id: dept.id, label: dept.label, lines })
    count += lines.length
  }
  return { groups, count, missingRecipes: missing }
}

/** Alla planerade rader i en vecka, måndag först. */
export function weekItems(items: Readonly<Record<ISODate, readonly PlanItem[]>>, weekStart: ISODate): PlanItem[] {
  return weekDates(weekStart).flatMap((d) => items[d] ?? [])
}

/** En vara som den står i den delade texten: "Gul lök – 2 st (200 g)". */
function lineText(line: Pick<ShoppingLine, 'name' | 'brand' | 'amountText'>): string {
  const name = line.brand ? `${line.name} (${line.brand})` : line.name
  return line.amountText ? `${name} – ${line.amountText}` : name
}

/**
 * Inköpslistan som text att dela eller kopiera. Bara det som inte är avbockat tas med, grupperat
 * per avdelning, med egna rader sist.
 */
export function shoppingListText(
  title: string,
  list: Pick<ShoppingList, 'groups'>,
  extras: readonly ShoppingExtra[] = [],
  checked: ReadonlySet<string> = new Set(),
): string {
  const parts: string[] = [title]
  for (const group of list.groups) {
    const lines = group.lines.filter((l) => !checked.has(l.key))
    if (lines.length === 0) continue
    parts.push(`${group.label}\n${lines.map((l) => `• ${lineText(l)}`).join('\n')}`)
  }
  const own = extras.filter((e) => !e.checked)
  if (own.length > 0) parts.push(`Egna varor\n${own.map((e) => `• ${e.text}`).join('\n')}`)
  return parts.join('\n\n')
}

/** Antal varor som inte är avbockade (inklusive egna rader). */
export function remainingCount(list: Pick<ShoppingList, 'groups'>, extras: readonly ShoppingExtra[], checked: ReadonlySet<string>): number {
  let n = 0
  for (const g of list.groups) for (const l of g.lines) if (!checked.has(l.key)) n++
  return n + extras.filter((e) => !e.checked).length
}

/** Städa en egen rad: blanksteg trimmas och texten kortas till `MAX_EXTRA_LENGTH`. Tom → null. */
export function cleanExtraText(text: string): string | null {
  const t = text.replace(/\s+/g, ' ').trim()
  if (!t) return null
  return t.length > MAX_EXTRA_LENGTH ? t.slice(0, MAX_EXTRA_LENGTH).trimEnd() : t
}

// ---------------------------------------------------------------------------
// Tolerant inläsning
// ---------------------------------------------------------------------------

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const FOOD_SOURCES: readonly FoodSource[] = ['lagom', 'livsmedelsverket', 'openfoodfacts', 'custom', 'recipe']
const RAW_KINDS: ReadonlyArray<RawWeight['kind']> = ['ra', 'okokt', 'torkad', 'fryst']

export interface PlanSanitizeOptions {
  /**
   * Egen kontroll av livsmedel (t.ex. säkerhetskopians `sanitizeFood`). Standard: en enkel
   * kontroll av formen (id, namn, kategori, näringsvärden och portioner).
   */
  food?: (raw: unknown) => Food | null
  /** Id-generator för rader som saknar id. */
  makeId?: () => string
  now?: number
}

export interface PlanSanitizeResult {
  data: PlanData
  /** Rader som hoppades över (skadade). */
  skipped: number
  /** Rader med småfel som rättades (t.ex. fel datum eller okänd måltid). */
  repaired: number
}

/**
 * Enkel kontroll av ett livsmedel i planen: id och namn krävs; kategori, källa, näringsvärden,
 * portioner, densitet och rå vikt rättas eller tas bort. Ett saknat näringsvärde förblir okänt.
 */
export function sanitizePlanFood(raw: unknown): Food | null {
  if (!isObj(raw)) return null
  const id = typeof raw.id === 'string' ? raw.id.trim() : ''
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  if (!id || !name) return null
  const nutrients: Nutrients = {}
  if (isObj(raw.nutrients)) {
    for (const key of NUTRIENT_KEYS) {
      const v = raw.nutrients[key]
      if (finite(v) && v >= 0) nutrients[key] = v
    }
  }
  const portions: Portion[] = []
  if (Array.isArray(raw.portions)) {
    for (const p of raw.portions) {
      if (isObj(p) && typeof p.id === 'string' && p.id && typeof p.label === 'string' && finite(p.grams) && p.grams > 0) {
        portions.push({ id: p.id, label: p.label, grams: p.grams })
      }
    }
  }
  // Övriga fält behålls (t.ex. ett recepts egen tallriksmodell och kostråd) men kontrolleras.
  const food: Food = {
    ...(raw as unknown as Food),
    id,
    name,
    source: FOOD_SOURCES.includes(raw.source as FoodSource) ? (raw.source as FoodSource) : 'custom',
    category: (FOOD_CATEGORIES as readonly string[]).includes(raw.category as string) ? (raw.category as FoodCategory) : 'ovrigt',
    nutrients,
    portions,
  }
  for (const key of ['brand', 'barcode', 'imageUrl', 'note'] as const) {
    if (raw[key] !== undefined && typeof raw[key] !== 'string') delete food[key]
  }
  if (!(finite(raw.density) && raw.density > 0)) delete food.density
  if (typeof raw.liquid !== 'boolean') delete food.liquid
  if (raw.isAverage !== undefined && raw.isAverage !== true) delete food.isAverage
  for (const key of ['lmvNumber', 'co2e', 'createdAt', 'updatedAt'] as const) {
    if (raw[key] !== undefined && !finite(raw[key])) delete food[key]
  }
  for (const key of ['tags', 'synonyms'] as const) {
    const v = raw[key]
    if (v === undefined) continue
    if (Array.isArray(v)) (food as unknown as Obj)[key] = v.filter((t): t is string => typeof t === 'string')
    else delete food[key]
  }
  const plate = raw.plate
  if (plate !== undefined && !(isObj(plate) && finite(plate.veg) && finite(plate.carb) && finite(plate.protein))) delete food.plate
  const kostrad = raw.kostrad
  if (kostrad !== undefined && !(isObj(kostrad) && Object.values(kostrad).every((v) => v === undefined || finite(v)))) delete food.kostrad
  if (raw.extra !== undefined && !isObj(raw.extra)) delete food.extra
  const rw = raw.rawWeight
  if (isObj(rw) && finite(rw.factor) && rw.factor > 0 && RAW_KINDS.includes(rw.kind as RawWeight['kind'])) {
    food.rawWeight = { factor: rw.factor, kind: rw.kind as RawWeight['kind'] }
    if (finite(rw.density) && rw.density > 0) food.rawWeight.density = rw.density
  } else delete food.rawWeight
  return food
}

const VALID_UNIT = /^(g|kg|ml|cl|dl|l|krm|tsk|msk|g-ra|dl-ra|portion:.+)$/

/** Mängd och vikt för ett livsmedel; vikten räknas om när den saknas. null om den är oanvändbar. */
function sanitizeAmount(food: Food, raw: Obj): { amount: number; unit: UnitKey; grams: number } | null {
  const unit = typeof raw.unit === 'string' && VALID_UNIT.test(raw.unit) ? (raw.unit as UnitKey) : null
  if (!unit || !finite(raw.amount) || raw.amount <= 0) return null
  const grams = finite(raw.grams) && raw.grams > 0 ? raw.grams : gramsFor(food, raw.amount, unit)
  if (!validGrams(grams)) return null
  return { amount: raw.amount, unit, grams }
}

function sanitizePlanNutrients(raw: unknown): PlanNutrients | undefined {
  if (!isObj(raw)) return undefined
  const out: PlanNutrients = {}
  if (finite(raw.kcal) && raw.kcal >= 0) out.kcal = raw.kcal
  if (finite(raw.protein) && raw.protein >= 0) out.protein = raw.protein
  return Object.keys(out).length > 0 ? out : undefined
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/**
 * Läs planeringens data tolerant – från butikens sparade värde eller från en säkerhetskopia.
 * Skadade rader hoppas över, småfel rättas och räknas. Kastar aldrig.
 */
export function sanitizePlanData(raw: unknown, opts: PlanSanitizeOptions = {}): PlanSanitizeResult {
  const checkFood = opts.food ?? sanitizePlanFood
  const now = opts.now ?? Date.now()
  let counter = 0
  const makeId = opts.makeId ?? (() => `p_${now.toString(36)}${(counter++).toString(36)}`)
  let skipped = 0
  let repaired = 0
  const data: PlanData = { items: {}, shopping: {} }
  const src = isObj(raw) ? raw : {}

  const seen = new Set<string>()
  if (isObj(src.items)) {
    for (const [date, list] of Object.entries(src.items)) {
      if (!isValidISODate(date) || !Array.isArray(list)) {
        skipped += Array.isArray(list) ? list.length : 1
        continue
      }
      const out: PlanItem[] = []
      for (const entry of list) {
        if (out.length >= MAX_ITEMS_PER_DAY) {
          skipped++
          continue
        }
        const item = sanitizeItem(entry, date)
        if (item) out.push(item)
        else skipped++
      }
      if (out.length > 0) data.items[date] = out
    }
  } else if (src.items !== undefined) skipped++

  function sanitizeItem(entry: unknown, date: ISODate): PlanItem | null {
    if (!isObj(entry)) return null
    let fixed = false
    let id = typeof entry.id === 'string' && entry.id ? entry.id : ''
    if (!id || seen.has(id)) {
      id = makeId()
      fixed = true
    }
    let meal = entry.meal as MealId
    if (!(MEAL_IDS as readonly string[]).includes(entry.meal as string)) {
      meal = 'middag'
      fixed = true
    }
    if (entry.date !== date) fixed = true
    const createdAt = finite(entry.createdAt) ? entry.createdAt : now
    const base = { id, date, meal, createdAt }
    let item: PlanItem | null = null
    if (entry.kind === 'recipe') {
      const recipeId = typeof entry.recipeId === 'string' ? recipeKey(entry.recipeId.trim()) : ''
      if (!recipeId) return null
      const servings = finite(entry.servings) && entry.servings >= 0 ? clamp(entry.servings, 0, MAX_COOK_SERVINGS) : 1
      const eat = finite(entry.eat) && entry.eat > 0 ? clamp(entry.eat, 0.25, MAX_EAT_SERVINGS) : 1
      if (servings !== entry.servings || eat !== entry.eat) fixed = true
      const name = typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : 'Recept'
      const r: PlanRecipeItem = { ...base, kind: 'recipe', recipeId, name, servings, eat }
      if (typeof entry.emoji === 'string' && entry.emoji) r.emoji = entry.emoji
      const per = sanitizePlanNutrients(entry.perServing)
      if (per) r.perServing = per
      item = r
    } else if (entry.kind === 'meal') {
      const parts: PlanFoodAmount[] = []
      for (const p of Array.isArray(entry.items) ? entry.items : []) {
        const food = isObj(p) ? checkFood(p.food) : null
        const amount = food && isObj(p) ? sanitizeAmount(food, p) : null
        if (food && amount) parts.push({ food, ...amount })
        else fixed = true
      }
      if (parts.length === 0) return null
      const name = typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : 'Måltid'
      const m: PlanMealItem = { ...base, kind: 'meal', name, items: parts }
      if (typeof entry.templateId === 'string' && entry.templateId) m.templateId = entry.templateId
      item = m
    } else if (entry.kind === 'food') {
      const food = checkFood(entry.food)
      const amount = food ? sanitizeAmount(food, entry) : null
      if (!food || !amount) return null
      item = { ...base, kind: 'food', food, ...amount }
    } else {
      return null
    }
    if (Array.isArray(entry.loggedEntryIds)) {
      const ids = entry.loggedEntryIds.filter((x): x is string => typeof x === 'string' && x.length > 0)
      if (ids.length > 0) item.loggedEntryIds = ids
    }
    seen.add(id)
    if (fixed) repaired++
    return item
  }

  if (isObj(src.shopping)) {
    for (const [key, week] of Object.entries(src.shopping)) {
      if (!isValidISODate(key) || !isObj(week)) {
        skipped++
        continue
      }
      const weekStart = weekStartOf(key)
      if (weekStart !== key) repaired++
      const checked = Array.isArray(week.checked) ? [...new Set(week.checked.filter((x): x is string => typeof x === 'string' && x.length > 0))].slice(0, 2000) : []
      const extras: ShoppingExtra[] = []
      const extraIds = new Set<string>()
      for (const e of Array.isArray(week.extras) ? week.extras : []) {
        const text = isObj(e) && typeof e.text === 'string' ? cleanExtraText(e.text) : null
        if (!isObj(e) || !text || extras.length >= MAX_EXTRAS_PER_WEEK) {
          skipped++
          continue
        }
        let id = typeof e.id === 'string' && e.id ? e.id : ''
        if (!id || extraIds.has(id)) {
          id = makeId()
          repaired++
        }
        extraIds.add(id)
        extras.push({ id, text, checked: e.checked === true, createdAt: finite(e.createdAt) ? e.createdAt : now })
      }
      if (checked.length === 0 && extras.length === 0) continue
      const prev = data.shopping[weekStart]
      data.shopping[weekStart] = prev
        ? { checked: [...new Set([...prev.checked, ...checked])], extras: [...prev.extras, ...extras] }
        : { checked, extras }
    }
  } else if (src.shopping !== undefined) skipped++

  return { data, skipped, repaired }
}
