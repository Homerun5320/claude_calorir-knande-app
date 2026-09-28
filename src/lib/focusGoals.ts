/**
 * Veckans fokus – ett enda litet mål för veckan, byggt på Livsmedelsverkets kostråd (och
 * Folkhälsomyndighetens råd om rörelse).
 *
 * Användaren väljer själv ett fokus (Inställningar → Mål), och Idag visar hur det går den här
 * veckan (måndag till idag). Tonen är alltid uppmuntrande: inga streaks, inga "du missade"-texter
 * – bara hur långt man kommit och att det finns dagar kvar.
 *
 * Räkneregler:
 * - Antal gånger (fisk, baljväxter, fullkornsdagar) och rörelseminuter räknar hela veckan
 *   till och med idag – en fiskmiddag idag syns direkt.
 * - Snitt och andelar (grönt per dag, dagar under saltmålet, alkoholfria dagar) räknar bara
 *   loggade dagar, och dagens halvfärdiga registrering först när dagen är markerad som klar –
 *   samma regel som kostråden på Idag (`kostradWeekDates`).
 */
import type { DiaryEntry, ExerciseEntry, ISODate } from '../types'
import { dateRange, startOfWeek, weekdayIndex } from './dates'
import { entryNutrients } from './diary'
import { moderateEquivalentMinutes } from './exercise'
import { formatNumber, plural } from './format'
import { evaluateKostrad, foodKostrad, isUsable, KOSTRAD_TARGETS, type KostradId, type KostradResult } from './kostrad'

// ---------------------------------------------------------------------------
// Underlag
// ---------------------------------------------------------------------------

export interface FocusWeekData {
  entriesByDate: Record<ISODate, readonly DiaryEntry[] | undefined>
  exerciseByDate: Record<ISODate, readonly ExerciseEntry[] | undefined>
  /** Idag – veckan räknas från måndag till och med idag. */
  today: ISODate
  /** Dagen är markerad som klar: då räknas idag med i snitt och andelar. */
  todayComplete?: boolean
}

/** Veckans dagar från måndag till och med idag. */
export function focusWeekDates(today: ISODate): ISODate[] {
  return dateRange(startOfWeek(today), today)
}

/** Dagar kvar av veckan efter idag (0 på söndag). */
export function daysLeftInWeek(today: ISODate): number {
  return 6 - weekdayIndex(today)
}

const hasFood = (week: FocusWeekData, d: ISODate) => (week.entriesByDate[d]?.length ?? 0) > 0

/**
 * Loggade dagar som räknas i snitt och andelar: idag bara när dagen är klar – eller när ingen
 * tidigare dag i veckan har registreringar (annars säger kortet ingenting förrän i morgon).
 */
export function countedFoodDays(week: FocusWeekData): ISODate[] {
  const logged = focusWeekDates(week.today).filter((d) => hasFood(week, d))
  if (week.todayComplete || !logged.includes(week.today)) return logged
  const earlier = logged.filter((d) => d !== week.today)
  return earlier.length > 0 ? earlier : logged
}

function kostradFor(week: FocusWeekData, dates: readonly ISODate[], id: KostradId): KostradResult | undefined {
  if (dates.length === 0) return undefined
  return evaluateKostrad({ entriesByDate: week.entriesByDate, exerciseByDate: week.exerciseByDate, dates, sex: 'kvinna' }).find((r) => r.id === id)
}

// ---------------------------------------------------------------------------
// Tröskelvärden
// ---------------------------------------------------------------------------

/** Gram fisk och skaldjur för att en måltid ska räknas som en fiskmåltid (t.ex. sill på knäckebröd). */
export const FISH_MEAL_MIN_G = 50
/** Gram fullkorn för att en dag ska räknas som en fullkornsdag – ungefär en portion gröt (kostrådet är 90 g). */
export const WHOLEGRAIN_DAY_MIN_G = 30
/** Gram alkohol under vilket en dag räknas som alkoholfri (spår i t.ex. såser räknas inte). */
export const ALCOHOL_FREE_MAX_G = 0.5

// ---------------------------------------------------------------------------
// Målen
// ---------------------------------------------------------------------------

export type FocusGoalId = 'fisk' | 'mer-gronsaker' | 'fullkorn' | 'baljvaxter' | 'mindre-salt' | 'alkoholfria-dagar' | 'rorelse'

interface FocusCount {
  done: number
  target: number
  /** "1 av 2 fiskmåltider", "I snitt 320 av 500 g om dagen". */
  label: string
  /** Liten tilläggsrad, t.ex. om osäkra dagar. */
  note?: string
  /** Inget att bedöma än (snitt- och andelsmål utan loggade dagar). */
  empty?: boolean
}

export interface FocusGoal {
  id: FocusGoalId
  /** Kort rubrik, t.ex. "Fisk två gånger". */
  title: string
  /** En mening om vad fokuset innebär och varför. */
  description: string
  emoji: string
  /** Kostrådet som fokuset bygger på. */
  kostrad: KostradId
  /** "Snitt/andel"-mål: målet gäller de loggade dagarna, inte hela veckan. */
  share?: boolean
  count: (week: FocusWeekData) => FocusCount
}

/** Antal måltider (dag + måltid) med minst `FISH_MEAL_MIN_G` fisk eller skaldjur. */
export function fishMeals(week: FocusWeekData): number {
  let n = 0
  for (const d of focusWeekDates(week.today)) {
    const perMeal = new Map<string, number>()
    for (const e of week.entriesByDate[d] ?? []) {
      if (e.kind !== 'food' || !(e.grams > 0)) continue
      const fish = ((foodKostrad(e.food).fisk ?? 0) * e.grams) / 100
      if (fish > 0) perMeal.set(e.meal, (perMeal.get(e.meal) ?? 0) + fish)
    }
    for (const g of perMeal.values()) if (g >= FISH_MEAL_MIN_G) n++
  }
  return n
}

function wholegrainDays(week: FocusWeekData): number {
  let n = 0
  for (const d of focusWeekDates(week.today)) {
    let g = 0
    for (const e of week.entriesByDate[d] ?? []) g += entryNutrients(e).wholegrain ?? 0
    if (g >= WHOLEGRAIN_DAY_MIN_G) n++
  }
  return n
}

export const FOCUS_GOALS: readonly FocusGoal[] = [
  {
    id: 'fisk',
    title: 'Fisk två gånger',
    description: 'Fisk eller skaldjur till två måltider i veckan – lax, sill, makrill, fiskpinnar och tonfisk räknas alla.',
    emoji: '🐟',
    kostrad: 'fisk',
    count: (week) => {
      const done = fishMeals(week)
      return { done, target: 2, label: `${done} av 2 fiskmåltider` }
    },
  },
  {
    id: 'mer-gronsaker',
    title: 'Mer grönt',
    description: 'Sikta på 500 gram grönsaker, frukt och bär om dagen – frysta räknas lika bra som färska.',
    emoji: '🥦',
    kostrad: 'frukt_gront',
    share: true,
    count: (week) => {
      const target = KOSTRAD_TARGETS.fruktGrontPerDay
      const r = kostradFor(week, countedFoodDays(week), 'frukt_gront')
      const done = r ? Math.round(r.actual) : 0
      return { done, target, label: `I snitt ${formatNumber(done)} av ${formatNumber(target)} g om dagen`, empty: !r }
    },
  },
  {
    id: 'fullkorn',
    title: 'Fullkorn varje dag',
    description: `Något fullkorn varje dag – gröt, fullkornsbröd, knäckebröd eller fullkornspasta. En dag räknas från ${WHOLEGRAIN_DAY_MIN_G} gram fullkorn.`,
    emoji: '🌾',
    kostrad: 'fullkorn',
    count: (week) => {
      const done = wholegrainDays(week)
      return { done, target: 7, label: `${done} av 7 dagar med fullkorn` }
    },
  },
  {
    id: 'baljvaxter',
    title: 'Baljväxter tre gånger',
    description: 'Bönor, linser, ärter eller kikärtor tre dagar i veckan – i grytan, salladen eller som hummus.',
    emoji: '🫘',
    kostrad: 'baljvaxter',
    count: (week) => {
      const r = kostradFor(week, focusWeekDates(week.today), 'baljvaxter')
      const done = r ? r.actual : 0
      return { done, target: 3, label: `${done} av 3 gånger med baljväxter` }
    },
  },
  {
    id: 'mindre-salt',
    title: 'Mindre salt',
    description: 'Högst 6 gram salt om dagen. Smaka av innan du saltar och krydda gärna med örter, citron och peppar.',
    emoji: '🧂',
    kostrad: 'salt',
    share: true,
    count: (week) => {
      let under = 0
      let assessed = 0
      let uncertain = 0
      for (const d of countedFoodDays(week)) {
        const r = kostradFor(week, [d], 'salt')
        if (!r) continue
        if (!isUsable(r)) {
          uncertain++
          continue
        }
        assessed++
        if (r.actual <= KOSTRAD_TARGETS.saltPerDay) under++
      }
      return {
        done: under,
        target: assessed,
        label: `${under} av ${plural(assessed, 'dag', 'dagar')} under 6 g salt`,
        note: uncertain > 0 ? `${plural(uncertain, 'dag', 'dagar')} saknar saltvärden för mycket av maten och räknas inte.` : undefined,
        empty: assessed === 0,
      }
    },
  },
  {
    id: 'alkoholfria-dagar',
    title: 'Alkoholfria dagar',
    description: 'Fler dagar utan alkohol – ju mindre desto bättre. Alkoholfria alternativ blir allt godare.',
    emoji: '🍋',
    kostrad: 'alkohol',
    share: true,
    count: (week) => {
      const days = countedFoodDays(week)
      let free = 0
      for (const d of days) {
        let g = 0
        for (const e of week.entriesByDate[d] ?? []) g += entryNutrients(e).alcohol ?? 0
        if (g < ALCOHOL_FREE_MAX_G) free++
      }
      return { done: free, target: days.length, label: `${free} av ${plural(days.length, 'loggad dag', 'loggade dagar')} utan alkohol`, empty: days.length === 0 }
    },
  },
  {
    id: 'rorelse',
    title: 'Rörelse 150 minuter',
    description: 'Minst 150 minuter i veckan som gör dig lite andfådd – promenader och cykling räknas, hög intensitet dubbelt.',
    emoji: '🚶',
    kostrad: 'rorelse',
    count: (week) => {
      let minutes = 0
      for (const d of focusWeekDates(week.today)) minutes += moderateEquivalentMinutes(week.exerciseByDate[d] ?? [])
      const done = Math.round(minutes)
      return { done, target: KOSTRAD_TARGETS.rorelsePerWeek, label: `${formatNumber(done)} av ${KOSTRAD_TARGETS.rorelsePerWeek} minuter` }
    },
  },
]

/** Fokuset med ett visst id (undefined för okända id:n, t.ex. från en nyare version). */
export function focusGoal(id: string | undefined): FocusGoal | undefined {
  return id === undefined ? undefined : FOCUS_GOALS.find((g) => g.id === id)
}

// ---------------------------------------------------------------------------
// Framsteg
// ---------------------------------------------------------------------------

export interface FocusProgress {
  done: number
  target: number
  /** Hela raden med en uppmuntran: "2 av 2 fiskmåltider – snyggt!" */
  text: string
  /** 0–1 för förloppsstapeln. */
  ratio: number
  /** Målet är nått för veckan (eller alla loggade dagar hittills för snitt- och andelsmål). */
  reached: boolean
  /** Samma besked utan siffror, för medvetet läge. */
  mindfulText: string
  /** Liten tilläggsrad, t.ex. om osäkra dagar. */
  note?: string
  /** Inget att bedöma än den här veckan. */
  empty: boolean
}

/** Uppmuntran efter siffrorna – aldrig skuld, aldrig "du missade". */
function cheer(reached: boolean, done: number, daysLeft: number): string {
  if (reached) return 'snyggt!'
  if (daysLeft > 0) return done > 0 ? 'en bit på väg, det finns dagar kvar' : 'det finns dagar kvar'
  return done > 0 ? 'en bit på väg, varje steg räknas' : 'ny vecka imorgon'
}

function mindfulCheer(reached: boolean, ratio: number, daysLeft: number): string {
  if (reached) return 'I mål den här veckan – snyggt!'
  if (ratio >= 0.5) return daysLeft > 0 ? 'En bit på väg – det finns dagar kvar' : 'En bra bit på väg – varje steg räknas'
  return daysLeft > 0 ? 'Ett litet steg i taget – det finns dagar kvar' : 'Varje steg räknas – ny vecka imorgon'
}

/**
 * Hur det går med ett fokus den här veckan (måndag till idag). undefined för okända id:n.
 *
 * ```ts
 * focusProgress('fisk', { entriesByDate, exerciseByDate, today })
 * // → { done: 1, target: 2, text: '1 av 2 fiskmåltider – en bit på väg, det finns dagar kvar', … }
 * ```
 */
export function focusProgress(id: string, week: FocusWeekData): FocusProgress | undefined {
  const goal = focusGoal(id)
  if (!goal) return undefined
  const { done, target, label, note, empty: noData } = goal.count(week)
  const daysLeft = daysLeftInWeek(week.today)
  const empty = noData === true || target <= 0
  const reached = !empty && done >= target
  const ratio = empty ? 0 : Math.max(0, Math.min(1, done / target))
  const text = empty
    ? daysLeft > 0
      ? 'Inget loggat ännu den här veckan – det finns dagar kvar'
      : 'Inget loggat den här veckan – ny vecka imorgon'
    : `${label} – ${cheer(reached, done, daysLeft)}`
  const mindfulText = empty ? (daysLeft > 0 ? 'Veckan har precis börjat – det finns dagar kvar' : 'Ny vecka imorgon') : mindfulCheer(reached, ratio, daysLeft)
  return { done, target, text, ratio, reached, mindfulText, note, empty }
}

/**
 * Söndagens summering av veckans fokus, t.ex. för kvällsreflektionen:
 * "Fisk två gånger: 2 av 2 fiskmåltider – snyggt jobbat den här veckan!"
 */
export function focusWeekSummary(id: string, week: FocusWeekData, mindful = false): string | undefined {
  const goal = focusGoal(id)
  const p = focusProgress(id, week)
  if (!goal || !p) return undefined
  if (p.empty) return `${goal.title}: inget loggat den här veckan – fokuset finns kvar nästa vecka.`
  const counts = mindful ? '' : `${goal.count(week).label} – `
  if (p.reached) return `${goal.title}: ${counts}snyggt jobbat den här veckan!`
  if (p.ratio >= 0.5) return `${goal.title}: ${counts}en bra bit på väg. Fortsätt i samma takt nästa vecka.`
  return `${goal.title}: ${counts}varje steg räknas. Vill du, finns fokuset kvar nästa vecka.`
}

/** Måndagen i veckan som ett fokus väljs – sparas som `weeklyFocus.since`. */
export function focusSince(today: ISODate): ISODate {
  return startOfWeek(today)
}

/** Söndag – dagen för veckans summering. */
export function isWeekSummaryDay(today: ISODate): boolean {
  return weekdayIndex(today) === 6
}
