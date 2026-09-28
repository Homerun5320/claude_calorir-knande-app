/**
 * Rena hjälpfunktioner för Idag-skärmen – testbara utan React.
 *
 * Här bestäms bl.a. vilken matdag som visas i huvudet, hur måltidskorten sammanfattas,
 * veckans staplar och snitt, vilka kostråd som lyfts fram och vilka sammanhangskort
 * (fasta, träning, koffein, alkohol) som ska visas.
 */
import type { DayMeta, DiaryEntry, ExerciseEntry, GoalType, ISODate, LifeStage, MealId, WeightEntry } from '../../types'
import { addDays, capitalize, dateRange, diffDays, formatDayLong, formatDayShort, greeting, isoWeek, startOfWeek } from '../../lib/dates'
import { dailyBudget, entryKcal, totals } from '../../lib/diary'
import { bmi, minHealthyBmi, weightTrend } from '../../lib/energy'
import { goodDirection } from '../body/bodyLogic'
import { formatEnergy, formatNumber, plural } from '../../lib/format'
import { isUsable, type KostradId, type KostradResult, type KostradStatus } from '../../lib/kostrad'
import { standardDrinks } from '../../lib/nutrients'
import { foodDayCountdown, foodDayFor, upcomingFoodDays, type FoodDay } from '../../lib/swedishCalendar'
import type { RingStatus } from '../../components/signature'

// ---------------------------------------------------------------------------
// Huvudet: hälsning, datum och matdag
// ---------------------------------------------------------------------------

/** "God morgon, Anna" – eller bara "God morgon" utan namn. */
export function greetingFor(now: Date, name?: string): string {
  const trimmed = name?.trim()
  return trimmed ? `${greeting(now)}, ${trimmed}` : greeting(now)
}

/** "Lördag 26 september · v. 39" */
export function formatHeaderDate(today: ISODate): string {
  return `${formatDayLong(today, today)} · v. ${isoWeek(today)}`
}

export interface HeaderFoodDay {
  day: FoodDay
  /** 'idag' = infaller idag, 'pagar' = pågående period, 'snart' = inom några dagar, 'vecka' = veckotradition idag. */
  when: 'idag' | 'pagar' | 'snart' | 'vecka'
  /** Synlig text, t.ex. "Kanelbullens dag om 8 dagar". */
  text: string
}

/**
 * Vilken matdag som ska lyftas fram i huvudet:
 * 1. en matdag/högtid som infaller (eller pågår) idag,
 * 2. annars nästa matdag inom `withinDays` dagar,
 * 3. annars dagens veckotradition (t.ex. fredagsmys).
 */
export function headerFoodDay(today: ISODate, withinDays = 10): HeaderFoodDay | null {
  const todays = foodDayFor(today)
  const special = todays.find((d) => !d.weekly)
  if (special) {
    const ongoing = special.date !== today
    if (ongoing) return { day: special, when: 'pagar', text: `${special.name} pågår` }
    return { day: special, when: 'idag', text: special.endDate ? `${special.name} börjar idag` : `${special.name} idag` }
  }
  const next = upcomingFoodDays(today, 4).find((d) => d.date > today && diffDays(today, d.date) <= withinDays)
  if (next) {
    return { day: next, when: 'snart', text: `${next.name} ${foodDayCountdown(next, today).toLowerCase()}` }
  }
  const weekly = todays.find((d) => d.weekly)
  if (weekly) return { day: weekly, when: 'vecka', text: `${capitalize(weekly.name)} idag` }
  return null
}

// ---------------------------------------------------------------------------
// Måltider
// ---------------------------------------------------------------------------

/** Namnet på en dagbokspost. */
export function entryName(e: DiaryEntry): string {
  return e.kind === 'food' ? e.food.name : e.name
}

export interface MealSummary {
  kcal: number
  count: number
  /** De första (unika) namnen i måltiden. */
  names: string[]
  /** Antal ytterligare unika namn som inte visas. */
  more: number
}

/** Sammanfatta en måltid: energi, antal poster och de första namnen (utan dubbletter). */
export function summarizeMeal(entries: readonly DiaryEntry[] | undefined, maxNames = 3): MealSummary {
  const list = entries ?? []
  const unique: string[] = []
  const seen = new Set<string>()
  let kcal = 0
  for (const e of list) {
    kcal += entryKcal(e)
    const name = entryName(e).trim()
    const key = name.toLocaleLowerCase('sv-SE')
    if (name && !seen.has(key)) {
      seen.add(key)
      unique.push(name)
    }
  }
  return { kcal, count: list.length, names: unique.slice(0, maxNames), more: Math.max(0, unique.length - maxNames) }
}

/** "Havregrynsgröt, Lingonsylt och 2 till" */
export function mealNamesText(summary: Pick<MealSummary, 'names' | 'more'>): string {
  const { names, more } = summary
  if (names.length === 0) return ''
  if (more > 0) return `${names.join(', ')} och ${more} till`
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} och ${names[names.length - 1]}`
}

/** Vänlig uppmaning för en tom måltid. */
export const EMPTY_MEAL_HINTS: Record<MealId, string> = {
  frukost: 'Gröt, fil eller en macka?',
  lunch: 'Vad blev det till lunch?',
  fika: 'Kaffe och något gott?',
  middag: 'Vad står på bordet ikväll?',
  kvallsmat: 'Något litet innan läggdags?',
  mellanmal: 'Frukt, nötter eller yoghurt?',
}

/** Antal poster i gårdagens måltid som kan kopieras till idag. */
export function copyableCount(yesterday: readonly DiaryEntry[] | undefined, meal: MealId): number {
  return (yesterday ?? []).filter((e) => e.meal === meal).length
}

/** Id för poster som finns i `after` men inte i `before` – används för att ångra en kopiering. */
export function newEntryIds(before: readonly DiaryEntry[] | undefined, after: readonly DiaryEntry[] | undefined): string[] {
  const old = new Set((before ?? []).map((e) => e.id))
  return (after ?? []).filter((e) => !old.has(e.id)).map((e) => e.id)
}

/** true om dagboken är helt tom – första dagen med appen. */
export function isDiaryEmpty(entriesByDate: Record<ISODate, readonly DiaryEntry[] | undefined>): boolean {
  for (const list of Object.values(entriesByDate)) if (list && list.length > 0) return false
  return true
}

// ---------------------------------------------------------------------------
// Veckan
// ---------------------------------------------------------------------------

export interface WeekDay {
  date: ISODate
  /** Ätit, kcal – undefined om inget är registrerat. */
  kcal?: number
  /** Dagens budget inklusive återlagd träning, kcal. */
  budget: number
}

/** Energiintag och budget per dag för de angivna datumen. */
export function weekSeries(
  dates: readonly ISODate[],
  entriesByDate: Record<ISODate, readonly DiaryEntry[] | undefined>,
  exerciseByDate: Record<ISODate, readonly ExerciseEntry[] | undefined>,
  targetKcal: number,
  addBackPct: number,
): WeekDay[] {
  return dates.map((date) => {
    const list = entriesByDate[date]
    const kcal = list && list.length > 0 ? (totals(list).kcal ?? 0) : undefined
    return { date, kcal, budget: dailyBudget(targetKcal, exerciseByDate[date], addBackPct) }
  })
}

/**
 * Snitt per registrerad dag. Dagens (ofta ofullständiga) siffra räknas bara med om dagen är
 * markerad som klar – eller om den är den enda dagen med data.
 */
export function weekAverage(series: readonly WeekDay[], today: ISODate, todayComplete = false): number | undefined {
  const logged = series.filter((d): d is WeekDay & { kcal: number } => d.kcal !== undefined && d.kcal > 0)
  const usable = logged.filter((d) => d.date !== today || todayComplete)
  const pick = usable.length > 0 ? usable : logged
  if (pick.length === 0) return undefined
  return pick.reduce((s, d) => s + d.kcal, 0) / pick.length
}

/**
 * Uppläst sammanfattning av veckodiagrammet. Snittet är detsamma som visas under diagrammet
 * (`weekAverage`) – så att skärmläsaren inte läser upp två olika snitt efter varandra.
 */
export function weekChartSummary(
  series: readonly WeekDay[],
  today: ISODate,
  todayComplete: boolean,
  targetKcal: number,
  unit: 'kcal' | 'kJ' = 'kcal',
): string {
  const title = 'Energi per dag de senaste sju dagarna'
  const logged = series.filter((d): d is WeekDay & { kcal: number } => d.kcal !== undefined)
  if (logged.length === 0) return `${title}: inget loggat den här veckan ännu.`
  const e = (kcal: number) => formatEnergy(kcal, unit)
  const parts = [`${title}. Loggat ${formatNumber(logged.length)} av ${plural(series.length, 'dag', 'dagar')}.`]
  const average = weekAverage(series, today, todayComplete)
  if (average !== undefined) {
    // Samma regel som weekAverage: idag räknas inte förrän dagen är klar (om det finns andra dagar).
    const withoutToday = !todayComplete && logged.some((d) => d.date === today && d.kcal > 0) && logged.some((d) => d.date !== today && d.kcal > 0)
    parts.push(`Snitt ${e(average)} per dag${withoutToday ? ', utom idag som inte är klar än' : ''}.`)
  }
  const top = logged.reduce((a, b) => (b.kcal > a.kcal ? b : a))
  parts.push(`Högst ${e(top.kcal)} (${top.date === today ? 'idag' : formatDayShort(top.date)}).`)
  parts.push(`Mål ${e(targetKcal)}.`)
  return parts.join(' ')
}

// ---------------------------------------------------------------------------
// Kostråd
// ---------------------------------------------------------------------------

/**
 * Dagarna som veckans kostråd räknas på: måndag till och med idag – men dagens (ofta ofullständiga)
 * registrering räknas bara med när dagen är markerad som klar, eller när ingen tidigare dag i
 * veckan har registreringar. Samma regel som veckosnittet, så att en halv dag inte drar ned snitten.
 */
export function kostradWeekDates(
  today: ISODate,
  entriesByDate: Record<ISODate, readonly DiaryEntry[] | undefined>,
  exerciseByDate: Record<ISODate, readonly ExerciseEntry[] | undefined>,
  todayComplete: boolean,
): { dates: ISODate[]; todayExcluded: boolean } {
  const start = startOfWeek(today)
  const all = dateRange(start, today)
  if (todayComplete || start === today) return { dates: all, todayExcluded: false }
  const earlier = dateRange(start, addDays(today, -1))
  const hasEarlier = earlier.some((d) => (entriesByDate[d]?.length ?? 0) > 0 || (exerciseByDate[d]?.length ?? 0) > 0)
  return hasEarlier ? { dates: earlier, todayExcluded: true } : { dates: all, todayExcluded: false }
}

/**
 * Kostråd som passar som små framstegschips – bara "ät mer av"-råd, i ordning efter hur
 * centrala de är. "Högst"-råden (salt, socker, rött kött, alkohol) lyfts inte fram här.
 */
export const KOSTRAD_HIGHLIGHT_ORDER: readonly KostradId[] = ['frukt_gront', 'fisk', 'fullkorn', 'baljvaxter', 'rorelse', 'notter', 'mejeri']

export const KOSTRAD_STATUS_LABEL: Record<KostradStatus, string> = {
  bra: 'I mål',
  nastan: 'Nästan',
  langt_kvar: 'På väg',
  over: 'Över',
}

/**
 * Statusord för ett kostrådschip. Veckoråd (fisk, rörelse) bedöms mot veckomålet omskalat till
 * dagarna som gått – den som ligger i takt är alltså "bra" innan hela veckomålet är nått. Då heter
 * det "I fas", så att "I mål" aldrig står bredvid t.ex. "283 av 300 g i veckan".
 */
export function kostradStatusLabel(r: Pick<KostradResult, 'status' | 'actual' | 'weeklyTarget'>): string {
  if (r.status === 'bra' && r.weeklyTarget !== undefined && r.actual < r.weeklyTarget) return 'I fas'
  return KOSTRAD_STATUS_LABEL[r.status]
}

/** Kortare rubriker som får plats i ett chip. */
export const KOSTRAD_SHORT_TITLE: Partial<Record<KostradId, string>> = {
  frukt_gront: 'Grönt, frukt & bär',
  fisk: 'Fisk',
  fullkorn: 'Fullkorn',
  baljvaxter: 'Baljväxter',
  rorelse: 'Rörelse',
  notter: 'Nötter & frön',
  mejeri: 'Mejeri',
}

/**
 * De `count` mest relevanta kostråden för veckan hittills:
 * ett råd som redan är uppfyllt (för att fira), sedan de som är nära målet och sist de som
 * har längre kvar. Osäkra resultat (täckningsgrad under 50 %) hoppas över.
 * Resultatet sorteras i den fasta ordningen så att chipsen inte hoppar runt.
 */
export function pickKostradHighlights(results: readonly KostradResult[], count = 3): KostradResult[] {
  const rank = (r: KostradResult) => KOSTRAD_HIGHLIGHT_ORDER.indexOf(r.id)
  const candidates = results
    .filter((r) => r.direction === 'minst' && rank(r) >= 0 && isUsable(r))
    .sort((a, b) => rank(a) - rank(b))
  if (candidates.length <= count) return candidates

  const picked: KostradResult[] = []
  const take = (r: KostradResult | undefined) => {
    if (r && !picked.includes(r) && picked.length < count) picked.push(r)
  }
  take(candidates.find((r) => r.status === 'bra'))
  for (const r of candidates) if (r.status === 'nastan') take(r)
  for (const r of candidates) if (r.status === 'langt_kvar') take(r)
  for (const r of candidates) take(r)
  return picked.sort((a, b) => rank(a) - rank(b))
}

/**
 * "320 av 500 g/dag", "150 av 300 g/vecka", "2 av 4 dagar", "0 av 1 dag", "45 av 150 min/vecka" – samma
 * form för dags- och veckoråd, och hårt mellanslag mellan tal och enhet.
 */
export function kostradProgressText(r: KostradResult): string {
  const n = (v: number) => formatNumber(v)
  if (r.unit === 'dagar') return `${n(r.actual)} av ${plural(r.target, 'dag', 'dagar')}`
  if (r.weeklyTarget !== undefined) {
    const unit = r.unit === 'min' ? 'min' : 'g'
    return `${n(r.actual)} av ${n(r.weeklyTarget)}\u00a0${unit}/vecka`
  }
  return `${n(r.actual)} av ${n(r.target)}\u00a0${r.unit}`
}

// ---------------------------------------------------------------------------
// Sammanhangskort
// ---------------------------------------------------------------------------

export type ContextCardId = 'fasta' | 'traning' | 'koffein' | 'alkohol'

export interface ContextInput {
  /** Pågående fasta. */
  fasting: boolean
  /** Antal träningspass idag. */
  exerciseCount: number
  /** Koffein idag i mg (undefined = okänt). */
  caffeineMg?: number
  /** Standardglas alkohol hittills i veckan. */
  alcoholDrinksWeek: number
}

/** Vilka sammanhangskort som ska visas, i visningsordning. */
export function contextCards(input: ContextInput): ContextCardId[] {
  const out: ContextCardId[] = []
  if (input.fasting) out.push('fasta')
  if (input.exerciseCount > 0) out.push('traning')
  if ((input.caffeineMg ?? 0) > 0.5) out.push('koffein')
  if (input.alcoholDrinksWeek >= 0.05) out.push('alkohol')
  return out
}

/** Standardglas alkohol (12 g) för de angivna dagarna. */
export function alcoholDrinks(entriesByDate: Record<ISODate, readonly DiaryEntry[] | undefined>, dates: readonly ISODate[]): number {
  let sum = 0
  for (const d of new Set(dates)) {
    const list = entriesByDate[d]
    if (list && list.length > 0) sum += standardDrinks(totals(list))
  }
  return sum
}

export type CaffeineLevel = 'lagom' | 'nara' | 'over'

/** Koffeinnivå mot dagens riktmärke (standard 400 mg). */
export function caffeineLevel(mg: number, maxMg: number): CaffeineLevel {
  const max = maxMg > 0 ? maxMg : 400
  if (mg > max) return 'over'
  if (mg >= max * 0.75) return 'nara'
  return 'lagom'
}

export const CAFFEINE_TEXT: Record<CaffeineLevel, string> = {
  lagom: 'Gott om marginal till dagens riktmärke.',
  nara: 'Nära dagens riktmärke – kanske något koffeinfritt till nästa fika?',
  over: 'Över riktmärket idag. Vatten eller koffeinfritt kan vara skönt resten av dagen.',
}

export interface FastProgress {
  elapsedMin: number
  targetMin: number
  /** 0–1+ (kan passera 1 när målet är nått). */
  ratio: number
  remainingMin: number
  done: boolean
}

/** Hur långt en pågående fasta har kommit. */
export function fastProgress(active: { start: number; targetHours: number }, nowMs: number): FastProgress {
  const elapsedMin = Math.max(0, (nowMs - active.start) / 60_000)
  const targetMin = Math.max(1, active.targetHours * 60)
  return {
    elapsedMin,
    targetMin,
    ratio: elapsedMin / targetMin,
    remainingMin: Math.max(0, targetMin - elapsedMin),
    done: elapsedMin >= targetMin,
  }
}

// ---------------------------------------------------------------------------
// Vikt
// ---------------------------------------------------------------------------

export interface WeightSnapshot {
  latest: WeightEntry
  /** Utjämnad trendvikt idag. */
  trendKg: number
  /** Förändring i trendvikt senaste 7 dagarna (kg), om det finns underlag. */
  weekChangeKg?: number
  direction: 'up' | 'down' | 'flat'
}

/** Senaste vägning + trend (exponentiellt glidande medelvärde) och förändring senaste veckan. */
export function weightSnapshot(weights: readonly WeightEntry[], today: ISODate): WeightSnapshot | null {
  if (weights.length === 0) return null
  const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date))
  const latest = sorted[sorted.length - 1]
  const points = weightTrend(sorted, 0.1, today > latest.date ? today : undefined)
  const last = points[points.length - 1]
  const trendKg = last?.trend ?? latest.kg
  if (sorted.length < 2 || points.length < 2) return { latest, trendKg, direction: 'flat' }
  const ref = points[Math.max(0, points.length - 8)]
  const weekChangeKg = trendKg - ref.trend
  const direction = Math.abs(weekChangeKg) < 0.05 ? 'flat' : weekChangeKg > 0 ? 'up' : 'down'
  return { latest, trendKg, weekChangeKg, direction }
}

/** Snabbare än så här (andel av kroppsvikten per vecka) rekommenderas inte. */
export const MAX_WEEKLY_LOSS_SHARE = 0.01

export type WeightCaution = 'snabb' | 'lag'

/**
 * Ska Idag säga något varsamt om vikten i stället för att tona nedgången grönt?
 * - 'snabb': trenden går ned mer än 1 % av kroppsvikten per vecka.
 * - 'lag': BMI under 18,5 (under 22 från 70 år) för vuxna – inte under graviditet eller amning.
 *
 * `age` är åldern enligt födelseåret (70-årsgränsen), `youngestAge` den yngsta möjliga
 * (18-årsgränsen, se lib/energy). Saknas `youngestAge` används `age`.
 */
export function weightCaution(
  snap: Pick<WeightSnapshot, 'trendKg' | 'weekChangeKg' | 'direction'>,
  profile: { heightCm?: number; age?: number; youngestAge?: number; lifeStage?: LifeStage },
): WeightCaution | null {
  const { heightCm, age, lifeStage } = profile
  const young = profile.youngestAge ?? age
  if (snap.direction === 'down' && snap.weekChangeKg !== undefined && -snap.weekChangeKg > snap.trendKg * MAX_WEEKLY_LOSS_SHARE) {
    return 'snabb'
  }
  const adult = young === undefined || young >= 18
  const pregnantOrNursing = lifeStage !== undefined && lifeStage !== 'ingen'
  if (heightCm && heightCm > 0 && adult && !pregnantOrNursing) {
    if (bmi(snap.trendKg, heightCm) < minHealthyBmi(age)) return 'lag'
  }
  return null
}

/** Minsta antal dagar markerade som klara innan Lagom säger något om ett lågt intag. */
export const LOW_INTAKE_MIN_DAYS = 3

/**
 * Snittintag de senaste sju dagarna, räknat bara på dagar som är markerade som klara (och har
 * poster). Returnerar snittet om det ligger under `floorKcal` och bygger på minst tre dagar –
 * annars undefined. Ofullständigt loggade dagar räknas aldrig, så glömda måltider ger inget larm.
 */
export function lowIntakeAverage(
  today: ISODate,
  entriesByDate: Record<ISODate, readonly DiaryEntry[] | undefined>,
  days: Record<ISODate, DayMeta | undefined>,
  floorKcal: number,
): number | undefined {
  const values: number[] = []
  for (const date of dateRange(addDays(today, -6), today)) {
    const list = entriesByDate[date]
    if (days[date]?.complete !== true || !list || list.length === 0) continue
    const kcal = totals(list).kcal
    if (kcal !== undefined && Number.isFinite(kcal)) values.push(kcal)
  }
  if (values.length < LOW_INTAKE_MIN_DAYS) return undefined
  const avg = values.reduce((sum, v) => sum + v, 0) / values.length
  return avg < floorKcal ? avg : undefined
}

// ---------------------------------------------------------------------------
// Kvällsreflektion
// ---------------------------------------------------------------------------

/** Kvällsreflektionen visas efter 18, i medvetet läge eller när dagen redan har reflekterats. */
export function showEveningCheckIn(now: Date, mindful: boolean, meta: DayMeta): boolean {
  if (mindful || now.getHours() >= 18) return true
  return meta.mood !== undefined || meta.energy !== undefined || meta.hunger !== undefined || meta.complete === true
}

// ---------------------------------------------------------------------------
// Dagsringen
// ---------------------------------------------------------------------------

/** Vänlig rad under Dagsringen (inga larm, ingen skuld). null = ringen säger det som behövs. */
export function ringNote(status: RingStatus): string | null {
  switch (status) {
    case 'tom':
      return 'En ny dag. Ät när hungern säger till – vi håller koll på resten.'
    case 'lagom':
      return 'Precis lagom idag – snyggt!'
    case 'over':
      return 'Över målet idag – helt okej, det jämnar ut sig över veckan.'
    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Dagens tallrik
// ---------------------------------------------------------------------------

/** Huvudmåltiderna som bildar "dagens tallrik". */
export const PLATE_MEALS: readonly MealId[] = ['lunch', 'middag']

/** Poster från dagens huvudmåltider (lunch och middag). */
export function mainMealEntries(entries: readonly DiaryEntry[]): DiaryEntry[] {
  return entries.filter((e) => PLATE_MEALS.includes(e.meal))
}

/**
 * Åt vilket håll en viktförändring tonas mjukt grön – samma regel som under Vikt
 * (`goodDirection`). Viktnedgång tonas aldrig grönt: Lagom berömmer inte att gå ner i vikt.
 * En uppgång mot ett mål om att gå upp får en mild grön ton, utom vid graviditet, amning och
 * under 18 år (`age` = yngsta möjliga ålder).
 */
export function weightGoodDirection(
  goal: GoalType | undefined,
  lifeStage: LifeStage | undefined,
  age: number | undefined,
): 'up' | undefined {
  return goodDirection(goal, lifeStage, age)
}
