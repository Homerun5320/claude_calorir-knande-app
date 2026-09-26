/**
 * Mönster över tid: veckodagar, måltidstider, mående mot intag, alkohol per vecka.
 *
 * Allt här är rena funktioner. Texterna är nyfikna iakttagelser – aldrig pekpinnar – och visas
 * bara när underlaget räcker (t.ex. minst sju dagar med skattat mående).
 */
import type { DayMeta, DiaryEntry, ISODate, MealId } from '../../types'
import { MEAL_IDS } from '../../types'
import { capitalize, isoWeek, startOfWeek, WEEKDAYS, weekdayIndex } from '../../lib/dates'
import { formatNumber } from '../../lib/format'
import { totals } from '../../lib/diary'
import { standardDrinks } from '../../lib/nutrients'
import type { DayStat, EntriesByDate } from './aggregate'

// ---------------------------------------------------------------------------
// Veckodagar
// ---------------------------------------------------------------------------

export interface WeekdayAverage {
  /** 0 = måndag … 6 = söndag */
  weekday: number
  /** Snittenergi (kcal) för loggade dagar på den veckodagen. */
  avg?: number
  /** Antal loggade dagar. */
  count: number
}

/** Snittenergi per veckodag (måndag först). Bara loggade dagar räknas. */
export function weekdayPattern(days: readonly DayStat[]): WeekdayAverage[] {
  const sum = Array.from({ length: 7 }, () => 0)
  const count = Array.from({ length: 7 }, () => 0)
  for (const d of days) {
    if (!d.logged || d.kcal === undefined) continue
    const i = weekdayIndex(d.date)
    sum[i] += d.kcal
    count[i]++
  }
  return sum.map((s, weekday) => ({ weekday, count: count[weekday], avg: count[weekday] > 0 ? s / count[weekday] : undefined }))
}

export interface PatternInsight {
  emoji: string
  text: string
}

/** Minst så här många loggade dagar krävs för att tolka ett veckodagsmönster. */
export const MIN_PATTERN_DAYS = 10

/**
 * En lättsam iakttagelse om veckodagsmönstret – bara när den faktiskt stämmer
 * (t.ex. "Fredagsmys syns på fredagar" kräver att fredagen är veckans största dag med marginal).
 */
export function weekdayInsight(pattern: readonly WeekdayAverage[]): PatternInsight | null {
  const known = pattern.filter((p): p is WeekdayAverage & { avg: number } => p.avg !== undefined)
  const samples = pattern.reduce((s, p) => s + p.count, 0)
  if (known.length < 5 || samples < MIN_PATTERN_DAYS) return null
  const mean = known.reduce((s, p) => s + p.avg, 0) / known.length
  if (mean <= 0) return null
  const top = known.reduce((a, b) => (b.avg > a.avg ? b : a))
  const low = known.reduce((a, b) => (b.avg < a.avg ? b : a))
  const standsOut = (p: WeekdayAverage & { avg: number }) => p.count >= 2 && p.avg >= mean * 1.1

  if (top.weekday === 4 && standsOut(top)) return { emoji: '🍿', text: 'Fredagsmys syns på fredagar – precis som det ska vara.' }
  if (top.weekday === 5 && standsOut(top)) return { emoji: '🍬', text: 'Lördagen toppar veckan – lördagsgodis och långfrukost, kanske?' }
  if (top.weekday === 6 && standsOut(top)) return { emoji: '🍽️', text: 'Söndagen är veckans rikligaste dag – söndagsmiddagen gör sig påmind.' }

  const avgOf = (list: ReadonlyArray<WeekdayAverage & { avg: number }>) =>
    list.length ? list.reduce((s, p) => s + p.avg, 0) / list.length : undefined
  const weekend = avgOf(known.filter((p) => p.weekday >= 5))
  const weekdays = avgOf(known.filter((p) => p.weekday < 5))
  if (weekend !== undefined && weekdays !== undefined && weekend >= weekdays * 1.12) {
    return { emoji: '🥂', text: 'Helgerna är lite festligare än vardagarna – så ser livet ut för de flesta.' }
  }
  if (top.avg - low.avg <= mean * 0.15) return { emoji: '🌿', text: 'Jämnt över veckan – riktigt lagom!' }
  if (low.weekday === 0 && low.count >= 2) return { emoji: '☕', text: 'Måndagar börjar lugnt – veckans minsta dag.' }
  return {
    emoji: '📅',
    text: `${capitalize(WEEKDAYS[top.weekday])}ar är veckans största dag och ${WEEKDAYS[low.weekday]}ar den minsta.`,
  }
}

// ---------------------------------------------------------------------------
// Måltidstider
// ---------------------------------------------------------------------------

/** 'HH:mm' → minuter efter midnatt, eller undefined. */
export function parseClock(time: string | undefined): number | undefined {
  if (!time) return undefined
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim())
  if (!m) return undefined
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return undefined
  return h * 60 + min
}

/** Minuter efter midnatt → "07:30". */
export function formatClock(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export function median(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export interface MealTime {
  meal: MealId
  /** Mediantid i minuter efter midnatt. */
  median: number
  count: number
}

export interface TimingSummary {
  /** Poster med klockslag. */
  timedEntries: number
  /** Antal poster per timme (0–23). */
  byHour: number[]
  byMeal: MealTime[]
  /** Median för dagens första och sista måltid (dagar med minst två olika klockslag). */
  firstMedian?: number
  lastMedian?: number
  /** Antal dagar som första/sista-medianen bygger på. */
  windowDays: number
}

/** Minsta antal poster med klockslag för att visa dygnsrytmen. */
export const MIN_TIMED_ENTRIES = 5

/** När på dygnet man äter – utifrån poster som har klockslag. */
export function mealTiming(entries: readonly DiaryEntry[]): TimingSummary {
  const byHour = Array.from({ length: 24 }, () => 0)
  const perMeal = new Map<MealId, number[]>()
  const perDay = new Map<ISODate, number[]>()
  let timedEntries = 0
  for (const e of entries) {
    const t = parseClock(e.time)
    if (t === undefined) continue
    timedEntries++
    byHour[Math.floor(t / 60)]++
    perMeal.set(e.meal, [...(perMeal.get(e.meal) ?? []), t])
    perDay.set(e.date, [...(perDay.get(e.date) ?? []), t])
  }
  const byMeal: MealTime[] = MEAL_IDS.filter((m) => perMeal.has(m)).map((meal) => {
    const list = perMeal.get(meal) ?? []
    return { meal, median: median(list) ?? 0, count: list.length }
  })
  const firsts: number[] = []
  const lasts: number[] = []
  for (const list of perDay.values()) {
    const min = Math.min(...list)
    const max = Math.max(...list)
    if (max > min) {
      firsts.push(min)
      lasts.push(max)
    }
  }
  return {
    timedEntries,
    byHour,
    byMeal,
    firstMedian: median(firsts),
    lastMedian: median(lasts),
    windowDays: firsts.length,
  }
}

// ---------------------------------------------------------------------------
// Mående mot intag
// ---------------------------------------------------------------------------

/** Pearsons korrelationskoefficient, eller undefined om den inte går att räkna. */
export function pearson(xs: readonly number[], ys: readonly number[]): number | undefined {
  const n = Math.min(xs.length, ys.length)
  if (n < 3) return undefined
  let sx = 0
  let sy = 0
  for (let i = 0; i < n; i++) {
    sx += xs[i]
    sy += ys[i]
  }
  const mx = sx / n
  const my = sy / n
  let num = 0
  let dx2 = 0
  let dy2 = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx
    const dy = ys[i] - my
    num += dx * dy
    dx2 += dx * dx
    dy2 += dy * dy
  }
  if (dx2 === 0 || dy2 === 0) return undefined
  return num / Math.sqrt(dx2 * dy2)
}

export type MoodMetric = 'mood' | 'energy' | 'hunger'
export type IntakeVariable = 'kcal' | 'protein' | 'fiber'

export const MOOD_METRICS: readonly MoodMetric[] = ['mood', 'energy', 'hunger']
const INTAKE_VARIABLES: readonly IntakeVariable[] = ['kcal', 'protein', 'fiber']

const METRIC_WORD: Record<MoodMetric, string> = { mood: 'humöret', energy: 'energin', hunger: 'hungern' }
const METRIC_EMOJI: Record<MoodMetric, string> = { mood: '😊', energy: '⚡', hunger: '🍽️' }
const VARIABLE_PHRASE: Record<IntakeVariable, string> = {
  kcal: 'ätit mer',
  protein: 'ätit mer protein',
  fiber: 'fått i dig mer fibrer',
}

/** Minsta antal dagar med både skattning och registrering. */
export const MIN_MOOD_DAYS = 7
/** Minsta korrelation (absolutbelopp) för att ett samband ska nämnas. */
export const MIN_CORRELATION = 0.3

export interface MoodInsight {
  metric: MoodMetric
  variable: IntakeVariable
  r: number
  /** Antal dagar i underlaget. */
  n: number
  /** Snittskattning (1–5) på dagar med mer respektive mindre av variabeln. */
  highMean: number
  lowMean: number
  emoji: string
  text: string
}

export interface MoodAnalysis {
  insights: MoodInsight[]
  /** Loggade dagar med minst en skattning (humör, energi eller hunger). */
  ratedDays: number
}

/**
 * Enkla samband mellan mående (1–5) och intag. För varje skattning väljs det starkaste sambandet
 * (|r| ≥ 0,3) med energi, protein eller fibrer, och beskrivs som skillnaden mellan dagar med mer
 * respektive mindre av variabeln. Samband är inte orsak – texterna är iakttagelser.
 */
export function moodInsights(days: readonly DayStat[], meta: Readonly<Record<ISODate, DayMeta | undefined>>): MoodAnalysis {
  const logged = days.filter((d) => d.logged)
  const ratedDays = logged.filter((d) => {
    const m = meta[d.date]
    return m !== undefined && (m.mood !== undefined || m.energy !== undefined || m.hunger !== undefined)
  }).length

  const insights: MoodInsight[] = []
  for (const metric of MOOD_METRICS) {
    let best: MoodInsight | undefined
    for (const variable of INTAKE_VARIABLES) {
      const pairs: Array<{ x: number; y: number }> = []
      for (const d of logged) {
        const y = meta[d.date]?.[metric]
        const x = variable === 'kcal' ? d.kcal : d.totals[variable]
        if (y === undefined || x === undefined || !Number.isFinite(x) || !Number.isFinite(y)) continue
        pairs.push({ x, y })
      }
      if (pairs.length < MIN_MOOD_DAYS) continue
      const r = pearson(
        pairs.map((p) => p.x),
        pairs.map((p) => p.y),
      )
      if (r === undefined || Math.abs(r) < MIN_CORRELATION) continue
      const sorted = [...pairs].sort((a, b) => a.x - b.x)
      const half = Math.floor(sorted.length / 2)
      const lowMean = sorted.slice(0, half).reduce((s, p) => s + p.y, 0) / half
      const highMean = sorted.slice(sorted.length - half).reduce((s, p) => s + p.y, 0) / half
      if (Math.abs(highMean - lowMean) < 0.3) continue
      if (best && Math.abs(best.r) >= Math.abs(r)) continue
      const dir = highMean > lowMean ? 'högre' : 'lägre'
      best = {
        metric,
        variable,
        r,
        n: pairs.length,
        highMean,
        lowMean,
        emoji: METRIC_EMOJI[metric],
        text: `Dagar då du ${VARIABLE_PHRASE[variable]} har du skattat ${METRIC_WORD[metric]} ${dir} – ${formatNumber(highMean, 1)} mot ${formatNumber(lowMean, 1)} av 5.`,
      }
    }
    if (best) insights.push(best)
  }
  return { insights, ratedDays }
}

// ---------------------------------------------------------------------------
// Alkohol
// ---------------------------------------------------------------------------

export interface WeekDrinks {
  /** Måndagen i veckan. */
  weekStart: ISODate
  week: number
  /** Standardglas (12 g alkohol). */
  drinks: number
  loggedDays: number
}

/** Standardglas per kalendervecka (bara veckor med minst en loggad dag). */
export function alcoholByWeek(dates: readonly ISODate[], entriesByDate: EntriesByDate): WeekDrinks[] {
  const map = new Map<ISODate, WeekDrinks>()
  for (const date of dates) {
    const list = entriesByDate[date]
    if (!list || list.length === 0) continue
    const weekStart = startOfWeek(date)
    const cur = map.get(weekStart) ?? { weekStart, week: isoWeek(weekStart), drinks: 0, loggedDays: 0 }
    cur.drinks += standardDrinks(totals(list))
    cur.loggedDays++
    map.set(weekStart, cur)
  }
  return [...map.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart))
}

/** Socialstyrelsens gräns för riskbruk: 10 standardglas per vecka. */
export const ALCOHOL_RISK_PER_WEEK = 10

/** Koffein i en kopp bryggkaffe (ca 1,5 dl), mg – Livsmedelsverkets ungefärliga värde. */
export const CAFFEINE_PER_CUP_MG = 100
