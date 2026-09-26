/**
 * Lagom – centrala domäntyper.
 *
 * Konventioner:
 * - Alla näringsvärden i `Food.nutrients` anges per 100 g ätlig del (även för drycker – per 100 g ≈ 100 ml).
 * - Ett saknat näringsvärde (undefined) betyder "okänt", aldrig noll. UI ska visa "–" och täckningsgrad.
 * - Datum lagras som lokal kalenderdag 'YYYY-MM-DD' (ISODate), aldrig som UTC-tidsstämpel.
 * - Inga TypeScript-enums (erasableSyntaxOnly) – använd union-typer och `as const`-objekt.
 */

import type { NutrientKey } from './lib/nutrients'

export type { NutrientKey }

/** Lokal kalenderdag, 'YYYY-MM-DD'. */
export type ISODate = string

/** Näringsvärden. Per 100 g i `Food`, totalt i beräknade summor. */
export type Nutrients = Partial<Record<NutrientKey, number>>

// ---------------------------------------------------------------------------
// Livsmedel
// ---------------------------------------------------------------------------

export type FoodSource =
  | 'lagom' // Lagoms kurerade svenska databas (inbyggd)
  | 'livsmedelsverket' // Importerad från Livsmedelsverkets livsmedelsdatabas
  | 'openfoodfacts' // Hämtad från Open Food Facts (streckkod/sök)
  | 'custom' // Skapad av användaren
  | 'recipe' // Användarens recept

/**
 * Livsmedelskategori. Styr ikon, Tallriksmodellen, kostråd och klimatschablon.
 */
export const FOOD_CATEGORIES = [
  'gronsaker', // grönsaker, sallad, svamp
  'rotfrukter', // morot, rödbeta, palsternacka, kålrot (räknas som grönsaker)
  'potatis', // potatis (räknas INTE till frukt & grönt i kostråden)
  'frukt',
  'bar',
  'baljvaxter', // bönor, linser, ärtor, kikärtor
  'notter_fron',
  'spannmal', // gryn, flingor, müsli, mjöl
  'brod', // bröd, knäckebröd
  'pasta_ris', // pasta, ris, bulgur, couscous, nudlar
  'mejeri', // mjölk, fil, yoghurt, grädde, kvarg
  'ost',
  'agg',
  'rott_kott', // nöt, fläsk, lamm, vilt (ej charkuterier)
  'chark', // korv, bacon, skinka, salami, pålägg av kött
  'fagel', // kyckling, kalkon
  'fisk',
  'skaldjur',
  'vegoprotein', // tofu, sojafärs, havrebaserat, quorn, tempeh
  'vaxtdryck', // havre-/soja-/mandeldryck
  'fett_olja', // smör, margarin, olja
  'sas_krydda', // såser, dressing, ketchup, senap, kryddor, buljong
  'sotsaker', // godis, choklad, sylt, socker, honung
  'bakverk', // bullar, kakor, tårtor, bakelser
  'glass_dessert',
  'snacks', // chips, popcorn, ostbågar
  'dryck', // kaffe, te, vatten, lightdryck
  'lask_saft', // sockersötad läsk, saft, energidryck
  'juice', // juice, smoothie, nektar
  'alkohol', // öl, vin, cider, sprit
  'fardigratt', // sammansatta rätter, husmanskost
  'snabbmat', // hamburgare, pizza, kebab
  'kosttillskott', // proteinpulver, bars
  'ovrigt',
] as const
export type FoodCategory = (typeof FOOD_CATEGORIES)[number]

export type FoodTag =
  | 'vegan'
  | 'vegetarisk'
  | 'glutenfri'
  | 'laktosfri'
  | 'nyckelhal' // Nyckelhålsmärkt
  | 'fullkorn'
  | 'ekologisk'
  | 'svensk' // Svensk råvara/klassiker
  | 'klassiker' // Svensk husmanskost/klassiker

/** Hushållsmått/portion för ett livsmedel, t.ex. { id: 'st', label: '1 st (medel)', grams: 60 }. */
export interface Portion {
  id: string
  label: string
  grams: number
}

/** Tallriksmodellens andelar (0–1, summa ≤ 1) av ett livsmedels vikt. */
export interface PlateSplit {
  /** Grönsaker, rotfrukter, frukt, bär, baljväxter räknas som grönt. */
  veg: number
  /** Potatis, pasta, ris, bröd, gryn. */
  carb: number
  /** Kött, fisk, ägg, bönor/tofu, ost. */
  protein: number
}

/** Gram per 100 g livsmedel som räknas mot Livsmedelsverkets kostråd. */
export interface KostradContrib {
  /** Frukt, grönsaker, bär, baljväxter (ej potatis, ej juice). */
  fruktGront?: number
  /** Rött kött + chark (tillagad vikt). */
  rottKott?: number
  /** Fisk och skaldjur. */
  fisk?: number
  /** Nötter och frön. */
  notter?: number
}

export interface FoodExtra {
  /** Nutri-Score 'a'–'e'. */
  nutriscore?: string
  /** NOVA-grupp 1–4 (grad av processning). */
  nova?: number
  ingredientsText?: string
  /** Allergener på svenska, t.ex. ['mjölk', 'gluten']. */
  allergens?: string[]
  /** Förpackningsstorlek, t.ex. "500 g". */
  quantity?: string
  /** Ursprungsland/-länder. */
  origin?: string
  /** Märkningar, t.ex. ['Nyckelhålet', 'KRAV']. */
  labels?: string[]
}

export interface Food {
  /** Unikt id med prefix: 'lagom:', 'lmv:', 'off:', 'custom:', 'recipe:'. */
  id: string
  /** Svenskt namn. */
  name: string
  brand?: string
  source: FoodSource
  category: FoodCategory
  /** Per 100 g. */
  nutrients: Nutrients
  /** Hushållsmått/portioner utöver gram. Första elementet är förvald portion. */
  portions: Portion[]
  /** g per ml – aktiverar volymmått (dl, msk, tsk, krm, cl, l, ml). */
  density?: number
  /** Dryck/flytande – visa gärna ml/dl/cl som förvald enhet. */
  liquid?: boolean
  barcode?: string
  tags?: FoodTag[]
  /** Alternativa sökord, t.ex. ['bulle', 'kanelsnäcka']. */
  synonyms?: string[]
  /** kg CO2e per kg livsmedel. Om saknas används kategorins schablon. */
  co2e?: number
  /** Om saknas härleds från kategori. */
  plate?: PlateSplit
  /** Om saknas härleds från kategori. */
  kostrad?: KostradContrib
  imageUrl?: string
  /** Fri text: källa, beredning etc. */
  note?: string
  /** Livsmedelsverkets livsmedelsnummer om känt. */
  lmvNumber?: number
  /** Extra produktinformation (främst från Open Food Facts). */
  extra?: FoodExtra
  createdAt?: number
  updatedAt?: number
}

/**
 * Enhet för en mängd. Volymenheter kräver `density` (eller liquid → 1,0 g/ml).
 * 'portion:<id>' refererar till `Food.portions[].id`.
 */
export type VolumeUnit = 'ml' | 'cl' | 'dl' | 'l' | 'krm' | 'tsk' | 'msk'
export type UnitKey = 'g' | 'kg' | VolumeUnit | `portion:${string}`

// ---------------------------------------------------------------------------
// Dagbok
// ---------------------------------------------------------------------------

export const MEAL_IDS = ['frukost', 'lunch', 'fika', 'middag', 'kvallsmat', 'mellanmal'] as const
export type MealId = (typeof MEAL_IDS)[number]

export interface MealConfig {
  id: MealId
  name: string
  enabled: boolean
}

interface BaseEntry {
  id: string
  date: ISODate
  meal: MealId
  /** 'HH:mm' lokal tid när måltiden åts (valfritt). */
  time?: string
  note?: string
  createdAt: number
}

export interface FoodEntry extends BaseEntry {
  kind: 'food'
  /** Ögonblicksbild av livsmedlet vid registrering – dagboken påverkas inte av senare ändringar. */
  food: Food
  amount: number
  unit: UnitKey
  /** Uppslagen vikt i gram. */
  grams: number
}

export interface QuickEntry extends BaseEntry {
  kind: 'quick'
  name: string
  /** Totala näringsvärden för posten (inte per 100 g). */
  nutrients: Nutrients
  category?: FoodCategory
}

export type DiaryEntry = FoodEntry | QuickEntry

/** Mående och anteckningar för en dag (medveten ätning). */
export interface DayMeta {
  note?: string
  /** 1–5 */
  mood?: number
  /** 1–5 */
  energy?: number
  /** 1–5, hur hungrig man varit överlag */
  hunger?: number
  sleepHours?: number
  steps?: number
  /**
   * Dagen markerad som komplett registrerad. Räcker de klara dagarna (≥ 14 på 4 veckor) bygger
   * den adaptiva förbrukningen bara på dem (`adaptiveIntake`); Idag räknar in dagen i veckosnittet.
   */
  complete?: boolean
}

export interface ExerciseEntry {
  id: string
  date: ISODate
  /** Id i aktivitetslistan eller 'custom'. */
  activityId: string
  name: string
  minutes: number
  /** Beräknad (eller manuellt angiven) energiförbrukning utöver vila, kcal. */
  kcal: number
  met?: number
  distanceKm?: number
  note?: string
  createdAt: number
}

export interface MealTemplate {
  id: string
  name: string
  meal?: MealId
  items: Array<{ food: Food; amount: number; unit: UnitKey; grams: number }>
  createdAt: number
}

// ---------------------------------------------------------------------------
// Recept
// ---------------------------------------------------------------------------

export interface RecipeIngredient {
  id: string
  food: Food
  amount: number
  unit: UnitKey
  grams: number
}

export interface Recipe {
  id: string
  name: string
  servings: number
  ingredients: RecipeIngredient[]
  /** Tillagad totalvikt i gram (vikt efter tillagning – vatten avdunstar/tillkommer). */
  cookedWeightG?: number
  instructions?: string
  prepMinutes?: number
  emoji?: string
  tags?: FoodTag[]
  /** Inbyggt klassiskt recept (kan kopieras men inte ändras). */
  builtin?: boolean
  createdAt: number
  updatedAt: number
}

// ---------------------------------------------------------------------------
// Kropp
// ---------------------------------------------------------------------------

export interface WeightEntry {
  id: string
  date: ISODate
  kg: number
  note?: string
  createdAt: number
}

export interface MeasurementEntry {
  id: string
  date: ISODate
  waistCm?: number
  hipCm?: number
  chestCm?: number
  armCm?: number
  thighCm?: number
  bodyFatPct?: number
  note?: string
  createdAt: number
}

// ---------------------------------------------------------------------------
// Profil, mål och inställningar
// ---------------------------------------------------------------------------

export type Sex = 'kvinna' | 'man'

/** PAL-nivå för vardagen (exklusive planerad träning som loggas separat). */
export const ACTIVITY_LEVELS = {
  stillasittande: { pal: 1.4, label: 'Stillasittande', description: 'Kontorsjobb, lite rörelse på fritiden' },
  latt: { pal: 1.55, label: 'Lätt aktiv', description: 'Promenerar dagligen, cyklar till jobbet' },
  aktiv: { pal: 1.7, label: 'Aktiv', description: 'Står och går mycket i jobbet (t.ex. vård, handel)' },
  mycket_aktiv: { pal: 1.9, label: 'Mycket aktiv', description: 'Tungt fysiskt arbete (t.ex. bygg, skog, lantbruk)' },
} as const
export type ActivityLevel = keyof typeof ACTIVITY_LEVELS

export type GoalType = 'ga_ner' | 'behalla' | 'ga_upp'

export type LifeStage = 'ingen' | 'gravid' | 'ammar'

export type DietType = 'allatare' | 'flexitarian' | 'pescetarian' | 'vegetarian' | 'vegan'

export type MacroPreset = 'nnr' | 'hogprotein' | 'lagkolhydrat' | 'lchf' | 'idrott' | 'anpassad'

export interface Profile {
  name?: string
  sex: Sex
  birthYear: number
  heightCm: number
  /** Vikt vid start (senaste vikt hämtas från viktloggen). */
  startWeightKg: number
  activityLevel: ActivityLevel
  goal: GoalType
  /** kg per vecka (positivt tal), används för ga_ner/ga_upp. */
  weeklyRateKg: number
  targetWeightKg?: number
  lifeStage: LifeStage
  diet: DietType
  macroPreset: MacroPreset
  /** Egna makrofördelningar i energiprocent när macroPreset = 'anpassad'. */
  customMacroPct?: { protein: number; carbs: number; fat: number }
  createdAt: number
}

export interface Targets {
  kcal: number
  proteinG: number
  carbsG: number
  fatG: number
  fiberG: number
  waterMl: number
  /** Maxgränser */
  saltMaxG: number
  satFatMaxG: number
  addedSugarMaxG: number
  caffeineMaxMg: number
}

export type ThemeMode = 'system' | 'ljust' | 'morkt'

export interface Settings {
  theme: ThemeMode
  meals: MealConfig[]
  /** Andel av loggade träningskalorier som läggs till dagens budget (0–100). */
  exerciseAddBackPct: number
  /** Medvetet läge: döljer siffror och fokuserar på Tallriksmodellen och mående. */
  mindfulMode: boolean
  /** Visa kJ i stället för kcal. */
  energyUnit: 'kcal' | 'kJ'
  /** Använd adaptiv energiförbrukning (beräknad från vikttrend och intag). */
  adaptiveTargets: boolean
  /** Glasstorlek för vattenregistrering, ml. */
  waterGlassMl: number
  showClimate: boolean
  showMicros: boolean
  seasonalTheme: boolean
  /** Makrovärden som visas på dagens översikt. */
  dashboardNutrients: NutrientKey[]
  /** Egna mål som skriver över beräknade. */
  targetOverrides: Partial<Targets>
  onboardingDone: boolean
}
