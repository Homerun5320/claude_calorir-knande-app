/**
 * Rena beräkningar för Insikter – dagssummor, snitt, energifördelning mot NNR, näringskällor,
 * måltidsfördelning, tallrik och klimat över en period.
 *
 * Grundregler (samma som i resten av Lagom):
 * - Bara dagar med registreringar räknas i snitt. Oregistrerade dagar drar aldrig ned något.
 * - Ett okänt näringsvärde är okänt, inte noll. Täckningsgraden visas i stället.
 * - Texterna är vänliga och icke-dömande – "lagom".
 */
import type { DiaryEntry, ExerciseEntry, FoodCategory, ISODate, MealId, Nutrients, WeightEntry } from '../../types'
import { MEAL_IDS } from '../../types'
import { dailyBudget, entryNutrients, exerciseKcal, totals } from '../../lib/diary'
import { energyDistribution, NUTRIENT_KEYS, type NutrientKey } from '../../lib/nutrients'
import { MIN_COVERAGE, nutrientStatus, percentOfReference, type ReferenceMap } from '../../lib/nnr'
import { mealPlate, PLATE_GOOD_SCORE, type MealPlate, type PlateVariant } from '../../lib/plate'
import { dayClimate, entryCo2e } from '../../lib/climate'
import { weightTrend } from '../../lib/energy'

export type EntriesByDate = Readonly<Record<ISODate, readonly DiaryEntry[] | undefined>>
export type ExerciseByDate = Readonly<Record<ISODate, readonly ExerciseEntry[] | undefined>>

const EMPTY: readonly DiaryEntry[] = []

/** Alla poster för datumen, i datumordning. */
export function periodEntries(entriesByDate: EntriesByDate, dates: readonly ISODate[]): DiaryEntry[] {
  const out: DiaryEntry[] = []
  for (const d of dates) for (const e of entriesByDate[d] ?? EMPTY) out.push(e)
  return out
}

/** Antal dagar i `dates` som har minst en post. */
export function countLoggedDays(entriesByDate: EntriesByDate, dates: readonly ISODate[]): number {
  let n = 0
  for (const d of dates) if ((entriesByDate[d]?.length ?? 0) > 0) n++
  return n
}

// ---------------------------------------------------------------------------
// Dagar
// ---------------------------------------------------------------------------

export interface DayStat {
  date: ISODate
  /** Minst en matpost den dagen. */
  logged: boolean
  entryCount: number
  /** Dagens summor (tomt objekt om inget är loggat). */
  totals: Nutrients
  /** Energi i kcal – `undefined` om dagen inte är loggad. */
  kcal?: number
  /** Dagens energibudget: mål + andel av träningen. */
  budget: number
  exerciseKcal: number
}

/**
 * En sammanfattning per dag i perioden. `targetKcal` är dagsmålet – eller, med veckobudget, en
 * funktion som ger dagsmålet för varje datum (`InsightsData.targetKcalFor`).
 */
export function buildDayStats(
  dates: readonly ISODate[],
  entriesByDate: EntriesByDate,
  exerciseByDate: ExerciseByDate,
  targetKcal: number | ((date: ISODate) => number),
  addBackPct: number,
): DayStat[] {
  return dates.map((date) => {
    const list = entriesByDate[date] ?? EMPTY
    const exercise = exerciseByDate[date]
    const logged = list.length > 0
    const t = logged ? totals(list) : {}
    const target = typeof targetKcal === 'function' ? targetKcal(date) : targetKcal
    return {
      date,
      logged,
      entryCount: list.length,
      totals: t,
      kcal: logged ? (t.kcal ?? 0) : undefined,
      budget: dailyBudget(target, exercise, addBackPct),
      exerciseKcal: exerciseKcal(exercise),
    }
  })
}

/** Dagar inom ±10 % av budgeten räknas som "nära målet". */
export const NEAR_BUDGET = 0.1

export interface DaysSummary {
  /** Antal förflutna dagar som skickades in. */
  elapsedDays: number
  loggedDays: number
  /** Snittenergi per loggad dag. */
  avgKcal?: number
  /** Snittbudget för de loggade dagarna. */
  avgBudget?: number
  /** Loggade dagar inom ±10 % av dagens budget. */
  nearBudgetDays: number
  totalKcal: number
}

/** Sammanfatta (förflutna) dagar. Snitten räknas bara på loggade dagar. */
export function summarizeDays(days: readonly DayStat[]): DaysSummary {
  const logged = days.filter((d) => d.logged)
  const totalKcal = logged.reduce((s, d) => s + (d.kcal ?? 0), 0)
  const budgetSum = logged.reduce((s, d) => s + d.budget, 0)
  const nearBudgetDays = logged.filter((d) => d.budget > 0 && Math.abs((d.kcal ?? 0) - d.budget) <= d.budget * NEAR_BUDGET).length
  return {
    elapsedDays: days.length,
    loggedDays: logged.length,
    avgKcal: logged.length ? totalKcal / logged.length : undefined,
    avgBudget: logged.length ? budgetSum / logged.length : undefined,
    nearBudgetDays,
    totalKcal,
  }
}

export interface MacroKcal {
  protein: number
  carbs: number
  fat: number
  alcohol: number
}

/**
 * Dagens energi uppdelad på makronäringsämnen (kcal). Delarna skalas så att summan blir dagens
 * registrerade energi – då stämmer staplarna med dagens totala värde.
 */
export function macroKcal(day: Pick<DayStat, 'kcal' | 'totals'>): MacroKcal {
  const kcal = day.kcal ?? 0
  const dist = energyDistribution(day.totals)
  const sum = dist.protein + dist.carbs + dist.fat + dist.alcohol
  if (kcal <= 0 || sum <= 0) return { protein: 0, carbs: 0, fat: 0, alcohol: 0 }
  return {
    protein: (kcal * dist.protein) / sum,
    carbs: (kcal * dist.carbs) / sum,
    fat: (kcal * dist.fat) / sum,
    alcohol: (kcal * dist.alcohol) / sum,
  }
}

/**
 * Glidande medelvärde av energin över de senaste `window` dagarna (bara loggade dagar räknas).
 * En punkt kräver minst `minDays` loggade dagar i fönstret.
 */
export function rollingAverage(days: readonly DayStat[], window = 7, minDays = 2): Array<{ date: ISODate; value: number }> {
  const out: Array<{ date: ISODate; value: number }> = []
  for (let i = 0; i < days.length; i++) {
    let sum = 0
    let n = 0
    for (let j = Math.max(0, i - window + 1); j <= i; j++) {
      const k = days[j].kcal
      if (days[j].logged && k !== undefined) {
        sum += k
        n++
      }
    }
    if (n >= minDays) out.push({ date: days[i].date, value: sum / n })
  }
  return out
}

/** Minsta antal klara dagar innan Insikter säger något om ett lågt intag (samma som Idag). */
export const LOW_INTAKE_MIN_DAYS = 3

/**
 * Snittintaget för de dagar i perioden som är markerade som klara (och har poster), om det ligger
 * under `floorKcal` och bygger på minst tre dagar – annars undefined. Ofullständigt loggade dagar
 * räknas aldrig, så glömda måltider ger ingen notis. Används för en varsam notis – aldrig beröm.
 */
export function lowIntakeAverage(
  days: readonly DayStat[],
  isComplete: (date: ISODate) => boolean,
  floorKcal: number,
  minDays = LOW_INTAKE_MIN_DAYS,
): number | undefined {
  const values = days.filter((d) => d.logged && d.kcal !== undefined && Number.isFinite(d.kcal) && isComplete(d.date)).map((d) => d.kcal as number)
  if (values.length < minDays) return undefined
  const avg = values.reduce((s, v) => s + v, 0) / values.length
  return avg < floorKcal ? avg : undefined
}

/** Kvalitativ etikett för snittintag mot budget (medvetet läge och delad rapport). */
export function mindfulAverageLabel(ratio: number | undefined): { title: string; hint: string } {
  if (ratio === undefined || !Number.isFinite(ratio) || ratio <= 0) return { title: 'Inget att visa än', hint: 'Logga några dagar så ser du hur det går.' }
  if (ratio < 0.75) return { title: 'Lite i underkant', hint: 'Ät gärna ordentligt – kroppen behöver energi.' }
  if (ratio < 0.9) return { title: 'Strax under', hint: 'Nära det du behöver.' }
  if (ratio <= 1.1) return { title: 'Lagom', hint: 'Precis i nivå med det du behöver.' }
  if (ratio <= 1.25) return { title: 'Strax över', hint: 'Helt okej – det jämnar ut sig.' }
  return { title: 'Över målet', hint: 'Helt okej – det jämnar ut sig över tid.' }
}

// ---------------------------------------------------------------------------
// Energifördelning mot NNR 2023
// ---------------------------------------------------------------------------

export type MacroRangeKey = 'protein' | 'fat' | 'carbs'
export type RangeStatus = 'under' | 'inom' | 'over'

/** NNR 2023: rekommenderade intervall i energiprocent (E%) för vuxna. */
export const NNR_E_RANGES: Record<MacroRangeKey, readonly [number, number]> = {
  protein: [10, 20],
  fat: [25, 40],
  carbs: [45, 60],
}

export const MACRO_LABELS: Record<MacroRangeKey, string> = {
  protein: 'Protein',
  fat: 'Fett',
  carbs: 'Kolhydrater',
}

export const RANGE_STATUS_LABELS: Record<RangeStatus, string> = {
  under: 'Lite lågt',
  inom: 'Inom intervallet',
  over: 'Lite högt',
}

const VERDICT_TEXT: Record<MacroRangeKey, Record<RangeStatus, string>> = {
  protein: {
    under: 'Lite i underkant. Ägg, bönor, fisk, kyckling eller kvarg är enkla sätt att få mer.',
    inom: 'Inom NNR:s intervall – fint!',
    over: 'Över intervallet – helt okej för de flesta, särskilt om du tränar. Se bara till att grönt och fullkorn också får plats.',
  },
  fat: {
    under: 'Lite fett. En skvätt rapsolja, nötter, frön eller fet fisk ger viktiga fettsyror.',
    inom: 'Inom intervallet – lagom!',
    over: 'Lite mycket fett. Välj gärna oftare flytande oljor och magrare mejeri- och köttprodukter.',
  },
  carbs: {
    under: 'Färre kolhydrater än intervallet. Fullkorn, frukt och baljväxter ger både fibrer och energi.',
    inom: 'Inom intervallet – snyggt!',
    over: 'Många kolhydrater. Få gärna med lite mer protein och fett i måltiderna.',
  },
}

export interface MacroVerdict {
  key: MacroRangeKey
  label: string
  /** Andel av energin (E%). */
  pct: number
  min: number
  max: number
  status: RangeStatus
  text: string
}

/** Energifördelningen för ett (genomsnittligt) intag jämfört med NNR:s intervall. Tom lista utan energi. */
export function macroVerdicts(n: Nutrients): MacroVerdict[] {
  const dist = energyDistribution(n)
  if (dist.protein + dist.carbs + dist.fat + dist.alcohol <= 0) return []
  return (['protein', 'fat', 'carbs'] as const).map((key) => {
    const pct = dist[key]
    const [min, max] = NNR_E_RANGES[key]
    const rounded = Math.round(pct)
    const status: RangeStatus = rounded < min ? 'under' : rounded > max ? 'over' : 'inom'
    return { key, label: MACRO_LABELS[key], pct, min, max, status, text: VERDICT_TEXT[key][status] }
  })
}

// ---------------------------------------------------------------------------
// Loggning
// ---------------------------------------------------------------------------

export interface Consistency {
  logged: number
  elapsed: number
  /** 0–1 */
  ratio: number
  title: string
  text: string
}

/** Vänlig text om hur många dagar som är loggade – aldrig skuld. */
export function consistency(logged: number, elapsed: number): Consistency {
  const ratio = elapsed > 0 ? Math.min(1, logged / elapsed) : 0
  const title = `Du har loggat ${logged} av ${elapsed} ${elapsed === 1 ? 'dag' : 'dagar'}`
  let text: string
  if (elapsed === 0) text = 'Perioden har inte börjat än.'
  else if (logged === 0) text = 'Ingen fara – insikterna väntar här när du vill.'
  else if (ratio >= 1) text = 'Varje dag i perioden är med – imponerande! 🌟'
  else if (ratio >= 0.7) text = 'Fint! Ju fler dagar, desto säkrare blir insikterna.'
  else if (ratio >= 0.4) text = 'Bra jobbat – varje loggad dag ger en ny pusselbit.'
  else text = 'Varje loggad dag räknas. Dagar som inte är loggade räknas inte in i snitten, så de drar inte ned något.'
  return { logged, elapsed, ratio, title, text }
}

// ---------------------------------------------------------------------------
// Näringsämnen
// ---------------------------------------------------------------------------

export interface RankedNutrient {
  key: NutrientKey
  value: number
  /** Procent av rekommenderat intag. */
  percent: number
}

/**
 * De näringsämnen där snittet ligger högst respektive lägst i förhållande till rekommenderat
 * intag (RI/AI). Maxgränser (salt, mättat fett …) och ämnen med låg täckning tas inte med.
 */
export function rankNutrients(
  averages: Nutrients,
  coverage: Partial<Record<NutrientKey, number>>,
  refs: ReferenceMap,
  limit = 3,
): { strongest: RankedNutrient[]; weakest: RankedNutrient[] } {
  const list: RankedNutrient[] = []
  for (const key of NUTRIENT_KEYS) {
    // Energi och fettkvaliteter (E%-intervall där "mer" inte är bättre) jämförs inte här.
    if (key === 'kcal' || key === 'monoFat' || key === 'polyFat') continue
    const ref = refs[key]
    const value = averages[key]
    if (!ref || ref.kind === 'max' || !(ref.ri && ref.ri > 0) || value === undefined) continue
    const cov = coverage[key]
    if (cov !== undefined && cov < MIN_COVERAGE) continue
    const percent = percentOfReference(value, ref)
    if (percent === undefined) continue
    list.push({ key, value, percent })
  }
  const strongest = list
    .filter((x) => x.percent >= 100)
    .sort((a, b) => b.percent - a.percent)
    .slice(0, limit)
  const weakest = list
    .filter((x) => x.percent < 100)
    .sort((a, b) => a.percent - b.percent)
    .slice(0, limit)
  return { strongest, weakest }
}

/**
 * Referenser där protein jämförs med ditt eget proteinmål – samma mål som energikortet visar – i
 * stället för NNR:s minimibehov. Annars kan samma snitt vara både "under målet" och "123 %".
 * Proteinmålet är aldrig lägre än NNR:s rekommendation för din vikt.
 */
export function withPersonalProtein(refs: ReferenceMap, proteinTargetG: number | undefined): ReferenceMap {
  const ref = refs.protein
  if (!ref || proteinTargetG === undefined || !(proteinTargetG > 0)) return refs
  return { ...refs, protein: { ...ref, ri: proteinTargetG, note: 'Ditt proteinmål' } }
}

/**
 * Referenser för näringstabellen utan omdömen som bygger på för lite data. När värdet saknas för
 * en stor del av maten (täckning under `MIN_COVERAGE`) är snittet bara en nedre gräns: "Bra" och
 * "Över" stämmer då fortfarande, men "Lågt", "Nästan" och "under maxgränsen" kan vara fel. För de
 * ämnena tas referensen bort så att tabellen bara visar värdet – samma regel som Kostråd och
 * "Håll koll på" använder.
 */
export function reliableReferences(averages: Nutrients, coverage: Partial<Record<NutrientKey, number>>, refs: ReferenceMap): ReferenceMap {
  const out: ReferenceMap = {}
  for (const [key, ref] of Object.entries(refs) as Array<[NutrientKey, NonNullable<ReferenceMap[NutrientKey]>]>) {
    const cov = coverage[key]
    if (cov === undefined || cov >= MIN_COVERAGE) {
      out[key] = ref
      continue
    }
    const status = nutrientStatus(averages[key], ref)
    const reachedRi = status === 'uppnatt' && ref.ri !== undefined && ref.ri > 0
    if (reachedRi || status === 'over_max' || status === 'over_ul') out[key] = ref
  }
  return out
}

/** Ämnen där tabellens omdöme har tagits bort på grund av låg täckning (se `reliableReferences`). */
export function uncertainNutrients(refs: ReferenceMap, reliable: ReferenceMap, averages: Nutrients): NutrientKey[] {
  return (Object.keys(refs) as NutrientKey[]).filter((k) => !reliable[k] && averages[k] !== undefined)
}

export interface SourceItem {
  /** Livsmedels-id, eller 'snabb:<namn>' för snabbposter. */
  id: string
  name: string
  category?: FoodCategory
  /** Summerad mängd av ämnet under perioden. */
  amount: number
  /** Andel (0–1) av periodens kända totalmängd. */
  share: number
  /** Antal poster. */
  count: number
}

export interface SourcesResult {
  items: SourceItem[]
  /** Summa av ämnet i alla poster där det är känt. */
  total: number
  /** Poster där ämnet saknas (okänt, inte noll). */
  unknownEntries: number
}

/** De livsmedel som bidragit mest till ett näringsämne under perioden. */
export function topSources(entries: readonly DiaryEntry[], key: NutrientKey, limit = 5): SourcesResult {
  const map = new Map<string, SourceItem>()
  let total = 0
  let unknownEntries = 0
  for (const e of entries) {
    const v = entryNutrients(e)[key]
    if (v === undefined || !Number.isFinite(v)) {
      unknownEntries++
      continue
    }
    if (v <= 0) continue
    total += v
    const id = e.kind === 'food' ? e.food.id : `snabb:${e.name.trim().toLowerCase()}`
    const cur = map.get(id)
    if (cur) {
      cur.amount += v
      cur.count++
    } else {
      map.set(id, {
        id,
        name: e.kind === 'food' ? e.food.name : e.name.trim() || 'Snabbregistrering',
        category: e.kind === 'food' ? e.food.category : e.category,
        amount: v,
        share: 0,
        count: 1,
      })
    }
  }
  const items = [...map.values()]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, Math.max(0, limit))
    .map((x) => ({ ...x, share: total > 0 ? x.amount / total : 0 }))
  return { items, total, unknownEntries }
}

export interface CoverageSummary {
  /** Antal ämnen som bedöms. */
  total: number
  /** Ämnen med känt värde för minst 90 % av energin. */
  complete: number
  /** Ämnen som är kända för en del av maten. */
  partial: NutrientKey[]
  /** Ämnen som saknas helt. */
  missing: NutrientKey[]
}

const COVERAGE_KEYS = NUTRIENT_KEYS.filter((k) => k !== 'kcal')

/** Hur fullständiga näringsdata är för perioden. */
export function coverageSummary(
  coverage: Partial<Record<NutrientKey, number>>,
  keys: readonly NutrientKey[] = COVERAGE_KEYS,
): CoverageSummary {
  const partial: NutrientKey[] = []
  const missing: NutrientKey[] = []
  let complete = 0
  for (const k of keys) {
    const c = coverage[k]
    if (c === undefined) missing.push(k)
    else if (c >= 0.9) complete++
    else partial.push(k)
  }
  return { total: keys.length, complete, partial, missing }
}

/** Kort förklaring av datatäckningen. */
export function coverageText(s: CoverageSummary): string {
  if (s.complete === s.total) return `Näringsvärden finns för alla ${s.total} ämnen i maten du loggat.`
  const parts: string[] = [`Fullständiga värden för ${s.complete} av ${s.total} ämnen.`]
  if (s.partial.length > 0) {
    parts.push(
      `För ${s.partial.length} ${s.partial.length === 1 ? 'ämne' : 'ämnen'} saknas värden för en del av maten (t.ex. snabbposter och vissa streckkodsvaror), så snittet kan vara något lågt.`,
    )
  }
  if (s.missing.length > 0) parts.push(`${s.missing.length} ${s.missing.length === 1 ? 'ämne saknas' : 'ämnen saknas'} helt.`)
  parts.push('Okända värden räknas aldrig som noll.')
  return parts.join(' ')
}

// ---------------------------------------------------------------------------
// Måltider och tallrik
// ---------------------------------------------------------------------------

export interface MealShare {
  meal: MealId
  kcal: number
  /** Andel (0–1) av periodens energi. */
  share: number
  /** Snitt per loggad dag. */
  perDay: number
  entries: number
}

/** Hur energin fördelas mellan måltiderna under perioden (bara måltider med energi). */
export function mealDistribution(entries: readonly DiaryEntry[], loggedDays: number): MealShare[] {
  const kcal = new Map<MealId, number>()
  const count = new Map<MealId, number>()
  let total = 0
  for (const e of entries) {
    const k = entryNutrients(e).kcal ?? 0
    if (!Number.isFinite(k)) continue
    kcal.set(e.meal, (kcal.get(e.meal) ?? 0) + k)
    count.set(e.meal, (count.get(e.meal) ?? 0) + 1)
    total += k
  }
  return MEAL_IDS.filter((m) => (kcal.get(m) ?? 0) > 0).map((meal) => {
    const k = kcal.get(meal) ?? 0
    return {
      meal,
      kcal: k,
      share: total > 0 ? k / total : 0,
      perDay: loggedDays > 0 ? k / loggedDays : 0,
      entries: count.get(meal) ?? 0,
    }
  })
}

/** Huvudmåltider som bedöms med Tallriksmodellen. */
export const MAIN_MEALS: readonly MealId[] = ['lunch', 'middag', 'kvallsmat']

export interface PlateSummary {
  /** Sammanvägd tallrik (gramviktad) för alla huvudmåltider i perioden. */
  plate: MealPlate
  /** Antal huvudmåltider som gick att bedöma. */
  meals: number
  /** Antal av dem som var lagom fördelade. */
  lagomMeals: number
}

/**
 * Tallrikens sammanfattning i en mening med rätt böjning: "1 huvudmåltid bedömd – …",
 * "0 av 1 huvudmåltid var lagom fördelad", "2 av 5 huvudmåltider var lagom fördelade – fint!".
 */
export function plateMealsText(meals: number, lagomMeals: number): string {
  const noun = meals === 1 ? 'huvudmåltid' : 'huvudmåltider'
  if (lagomMeals === 0) return `${meals} ${noun} ${meals === 1 ? 'bedömd' : 'bedömda'} – små byten gör tallriken mer lagom.`
  const fordelad = meals === 1 ? 'fördelad' : 'fördelade'
  return `${lagomMeals} av ${meals} ${noun} var lagom ${fordelad}${lagomMeals / meals >= 0.5 ? ' – fint!' : '.'}`
}

/** Den genomsnittliga tallriken för periodens huvudmåltider (lunch, middag, kvällsmat). */
export function mainMealPlate(entriesByDate: EntriesByDate, dates: readonly ISODate[], variant: PlateVariant): PlateSummary {
  const all: DiaryEntry[] = []
  let meals = 0
  let lagomMeals = 0
  for (const d of dates) {
    const list = entriesByDate[d] ?? EMPTY
    for (const meal of MAIN_MEALS) {
      const items = list.filter((e) => e.meal === meal)
      if (items.length === 0) continue
      const mp = mealPlate(items, variant)
      if (!mp.hasPlate) continue
      meals++
      if (mp.score >= PLATE_GOOD_SCORE) lagomMeals++
      all.push(...items)
    }
  }
  return { plate: mealPlate(all, variant), meals, lagomMeals }
}

// ---------------------------------------------------------------------------
// Klimat
// ---------------------------------------------------------------------------

export interface ClimateDayStat {
  date: ISODate
  logged: boolean
  /** kg CO2e – `undefined` om dagen inte är loggad. */
  kg?: number
  /** Snabbposter som inte kunde beräknas. */
  unknownEntries: number
}

export function climateDays(dates: readonly ISODate[], entriesByDate: EntriesByDate): ClimateDayStat[] {
  return dates.map((date) => {
    const list = entriesByDate[date] ?? EMPTY
    if (list.length === 0) return { date, logged: false, unknownEntries: 0 }
    const c = dayClimate(list)
    return { date, logged: true, kg: c.kg, unknownEntries: c.unknownEntries }
  })
}

export interface ClimateSummary {
  loggedDays: number
  totalKg: number
  /** Snitt per loggad dag. */
  avgKg?: number
  unknownEntries: number
}

export function summarizeClimate(days: readonly ClimateDayStat[]): ClimateSummary {
  const logged = days.filter((d) => d.logged)
  const totalKg = logged.reduce((s, d) => s + (d.kg ?? 0), 0)
  return {
    loggedDays: logged.length,
    totalKg,
    avgKg: logged.length ? totalKg / logged.length : undefined,
    unknownEntries: days.reduce((s, d) => s + d.unknownEntries, 0),
  }
}

export interface Emitter {
  id: string
  name: string
  category: FoodCategory
  kg: number
  grams: number
  /** Andel (0–1) av periodens beräknade klimatavtryck. */
  share: number
  count: number
}

/** Livsmedlen med störst klimatavtryck under perioden. */
export function topEmitters(entries: readonly DiaryEntry[], limit = 5): Emitter[] {
  const map = new Map<string, Emitter>()
  let total = 0
  for (const e of entries) {
    if (e.kind !== 'food' || !Number.isFinite(e.grams) || e.grams <= 0) continue
    const kg = entryCo2e(e)
    if (!Number.isFinite(kg) || kg <= 0) continue
    total += kg
    const cur = map.get(e.food.id)
    if (cur) {
      cur.kg += kg
      cur.grams += e.grams
      cur.count++
    } else {
      map.set(e.food.id, { id: e.food.id, name: e.food.name, category: e.food.category, kg, grams: e.grams, share: 0, count: 1 })
    }
  }
  return [...map.values()]
    .sort((a, b) => b.kg - a.kg)
    .slice(0, Math.max(0, limit))
    .map((x) => ({ ...x, share: total > 0 ? x.kg / total : 0 }))
}

// ---------------------------------------------------------------------------
// Vikt
// ---------------------------------------------------------------------------

export interface WeightWindow {
  /** Trendvikt per dag inom fönstret. */
  points: Array<{ date: ISODate; value: number }>
  /** Antal vägningar inom fönstret. */
  measured: number
  /** Trendens förändring från första till sista punkten (kg). */
  change?: number
  /** Senaste trendvärdet. */
  latest?: number
}

/** Vikttrenden (utjämnad) mellan två datum. */
export function weightWindow(weights: readonly WeightEntry[], start: ISODate, end: ISODate): WeightWindow {
  const measured = weights.filter((w) => w.date >= start && w.date <= end).length
  if (weights.length === 0) return { points: [], measured }
  const points = weightTrend(weights)
    .filter((p) => p.date >= start && p.date <= end)
    .map((p) => ({ date: p.date, value: p.trend }))
  const latest = points.length ? points[points.length - 1].value : undefined
  const change = points.length >= 2 && measured >= 2 ? points[points.length - 1].value - points[0].value : undefined
  return { points, measured, change, latest }
}
