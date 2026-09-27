/**
 * Ren logik för dryckessidan: koffein över dagen och alkohol i standardglas.
 *
 * Koffein: halveringstiden hos friska vuxna är i genomsnitt ungefär 5 timmar (varierar ca 2–10 h,
 * längre vid graviditet och p-piller, kortare hos rökare). Kurvan är en förenklad uppskattning –
 * koffeinet räknas som upptaget direkt och bryts sedan ned exponentiellt.
 *
 * Alkohol: ett svenskt standardglas innehåller 12 g alkohol. Socialstyrelsens gränser för riskbruk
 * (som också Folkhälsomyndigheten, 1177 och Alkoholhjälpen använder): 10 standardglas eller mer per
 * vecka, eller 4 standardglas eller mer vid ett och samma tillfälle en gång i månaden eller oftare.
 * Det finns ingen helt riskfri nivå – ju mindre alkohol, desto lägre risk.
 */
import type { DiaryEntry, ISODate } from '../../types'
import { entryNutrients, totals } from '../../lib/diary'
import { standardDrinks } from '../../lib/nutrients'
import { formatNumber } from '../../lib/format'

/** Genomsnittlig halveringstid för koffein i timmar. */
export const CAFFEINE_HALF_LIFE_H = 5

/** Riktmärke när målet saknas: 400 mg per dag för friska vuxna (EFSA). */
export const DEFAULT_CAFFEINE_MAX_MG = 400

/** EFSA (2015): för barn och ungdomar under 18 år högst ca 3 mg koffein per kg kroppsvikt och dag. */
export const YOUTH_CAFFEINE_MG_PER_KG = 3

/** Vikt som används för ungdomars koffeingräns om vikten är okänd (kg). */
const YOUTH_FALLBACK_WEIGHT_KG = 50

/**
 * Dagens koffeinriktmärke. Vuxna: målet (400 mg, 200 mg vid graviditet och amning). Under 18 år:
 * högst 3 mg per kg kroppsvikt – aldrig mer än vuxenmålet.
 */
export function caffeineLimitMg(targetMaxMg: number, age: number | undefined, weightKg: number | undefined): number {
  const adult = targetMaxMg > 0 ? targetMaxMg : DEFAULT_CAFFEINE_MAX_MG
  if (age === undefined || age >= 18) return adult
  const kg = weightKg !== undefined && weightKg > 0 ? weightKg : YOUTH_FALLBACK_WEIGHT_KG
  return Math.min(adult, Math.round(YOUTH_CAFFEINE_MG_PER_KG * kg))
}

/** Ungefärlig läggdags som används i sömntipset. */
export const BEDTIME_MINUTE = 23 * 60

/** Socialstyrelsens gränser för riskbruk, standardglas. */
export const RISK_DRINKS_PER_WEEK = 10
export const RISK_DRINKS_PER_OCCASION = 4

const pad = (n: number) => String(n).padStart(2, '0')

/** 'HH:mm' → minuter efter midnatt, eller NaN. */
export function timeToMinutes(time: string | undefined): number {
  const m = time?.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return Number.NaN
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return Number.NaN
  return h * 60 + min
}

/** Minuter efter midnatt → 'HH:mm'. */
export function minutesToTime(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
}

/** Klockslag för en post: angivet klockslag, annars när den registrerades. */
export function entryMinutes(e: Pick<DiaryEntry, 'time' | 'createdAt'>): number {
  const t = timeToMinutes(e.time)
  if (Number.isFinite(t)) return t
  const d = new Date(e.createdAt)
  return d.getHours() * 60 + d.getMinutes()
}

/** Namn på en dagbokspost. */
export function entryName(e: DiaryEntry): string {
  return e.kind === 'food' ? e.food.name : e.name
}

// ---------------------------------------------------------------------------
// Koffein
// ---------------------------------------------------------------------------

export interface CaffeineIntake {
  id: string
  name: string
  /** Minuter efter midnatt. */
  minute: number
  mg: number
}

/** Poster med koffein, sorterade på klockslag. Okänt koffein räknas inte. */
export function caffeineIntakes(entries: readonly DiaryEntry[]): CaffeineIntake[] {
  const out: CaffeineIntake[] = []
  for (const e of entries) {
    const mg = entryNutrients(e).caffeine
    if (mg === undefined || !Number.isFinite(mg) || mg < 0.5) continue
    out.push({ id: e.id, name: entryName(e), minute: entryMinutes(e), mg })
  }
  return out.sort((a, b) => a.minute - b.minute || a.id.localeCompare(b.id))
}

/** Uppskattat koffein kvar i kroppen vid en tidpunkt (minuter efter midnatt samma dag). */
export function caffeineInBody(intakes: readonly CaffeineIntake[], atMinute: number, halfLifeH = CAFFEINE_HALF_LIFE_H): number {
  let sum = 0
  for (const i of intakes) {
    if (i.minute > atMinute) continue
    const hours = (atMinute - i.minute) / 60
    sum += i.mg * Math.pow(0.5, hours / halfLifeH)
  }
  return sum
}

export interface CurvePoint {
  minute: number
  mg: number
}

/** Punkter för koffeinkurvan mellan två klockslag. Varje intag får en punkt precis före och vid intaget. */
export function caffeineCurve(intakes: readonly CaffeineIntake[], fromMinute: number, toMinute: number, stepMinutes = 15): CurvePoint[] {
  const minutes = new Set<number>()
  for (let m = fromMinute; m <= toMinute; m += stepMinutes) minutes.add(m)
  minutes.add(toMinute)
  for (const i of intakes) {
    if (i.minute >= fromMinute && i.minute <= toMinute) {
      if (i.minute - 0.01 >= fromMinute) minutes.add(i.minute - 0.01)
      minutes.add(i.minute)
    }
  }
  return [...minutes].sort((a, b) => a - b).map((minute) => ({ minute, mg: caffeineInBody(intakes, minute) }))
}

export type CaffeineLevel = 'inget' | 'lagom' | 'nara' | 'over'

/** Nivå mot dagens riktmärke. */
export function caffeineLevel(mg: number, maxMg: number): CaffeineLevel {
  const max = maxMg > 0 ? maxMg : DEFAULT_CAFFEINE_MAX_MG
  if (!(mg > 0.5)) return 'inget'
  if (mg > max) return 'over'
  if (mg >= max * 0.75) return 'nara'
  return 'lagom'
}

export const CAFFEINE_LEVEL_TEXT: Record<CaffeineLevel, { label: string; text: string }> = {
  inget: { label: 'Inget än', text: 'Inget koffein registrerat idag.' },
  lagom: { label: 'Lagom', text: 'Gott om marginal till dagens riktmärke.' },
  nara: { label: 'Nära riktmärket', text: 'Nära dagens riktmärke – kanske något koffeinfritt till nästa fika?' },
  over: { label: 'Över riktmärket', text: 'Över riktmärket idag. Vatten eller koffeinfritt kan vara skönt resten av dagen.' },
}

/** Sömntips utifrån dagens sista koffeinintag och uppskattad mängd vid läggdags. */
export function sleepTip(intakes: readonly CaffeineIntake[], bedtimeMinute = BEDTIME_MINUTE): string {
  const last = intakes[intakes.length - 1]
  if (!last) return 'Koffein har en halveringstid på ungefär 5 timmar – en eftermiddagskaffe kan påverka sömnen.'
  const hoursBefore = (bedtimeMinute - last.minute) / 60
  if (hoursBefore < 6) {
    return 'Koffein har en halveringstid på ungefär 5 timmar – en del av dagens sista kopp finns kvar vid läggdags och kan göra sömnen lättare. Koffeinfritt är ett gott alternativ på kvällen.'
  }
  return 'Koffein har en halveringstid på ungefär 5 timmar. Dagens sista kopp var i god tid före kvällen – skönt för sömnen.'
}

// ---------------------------------------------------------------------------
// Alkohol
// ---------------------------------------------------------------------------

export interface DayDrinks {
  date: ISODate
  drinks: number
}

export interface AlcoholSummary {
  days: DayDrinks[]
  /** Standardglas totalt för dagarna. */
  total: number
  /** Flest standardglas en enskild dag. */
  maxDay: number
  daysWithAlcohol: number
}

/** Standardglas (12 g alkohol) per dag och totalt. */
export function alcoholSummary(entriesByDate: Record<ISODate, readonly DiaryEntry[] | undefined>, dates: readonly ISODate[]): AlcoholSummary {
  let total = 0
  let maxDay = 0
  let daysWithAlcohol = 0
  const days = dates.map((date) => {
    const list = entriesByDate[date]
    const drinks = list && list.length > 0 ? standardDrinks(totals(list)) : 0
    total += drinks
    if (drinks > maxDay) maxDay = drinks
    if (drinks >= 0.05) daysWithAlcohol++
    return { date, drinks }
  })
  return { days, total, maxDay, daysWithAlcohol }
}

export type AlcoholStatus = 'inget' | 'under' | 'over'

/**
 * Neutral status mot Socialstyrelsens gränser. 'over' betyder att veckan eller ett enskilt tillfälle
 * når nivån där vården brukar erbjuda stöd – aldrig en varning i rött, bara information.
 */
export function alcoholStatus(summary: Pick<AlcoholSummary, 'total' | 'maxDay'>): AlcoholStatus {
  if (summary.total < 0.05) return 'inget'
  // Små avrundningar (t.ex. 3,96 glas) ska inte slå över gränsen.
  if (summary.total >= RISK_DRINKS_PER_WEEK - 0.05 || summary.maxDay >= RISK_DRINKS_PER_OCCASION - 0.05) return 'over'
  return 'under'
}

export const ALCOHOL_STATUS_TEXT: Record<AlcoholStatus, string> = {
  inget: 'Ingen alkohol registrerad i veckan.',
  under: 'Ju mindre alkohol, desto bättre för sömn, återhämtning och hälsa på sikt.',
  over: 'Veckan når nivån där vården brukar erbjuda stöd. Vill du fundera på dina vanor finns anonymt stöd hos Alkoholhjälpen.',
}

// ---------------------------------------------------------------------------
// Vatten
// ---------------------------------------------------------------------------

/** Snabbval för vatten. Glaset följer inställningarna. */
export function waterPresets(glassMl: number): Array<{ id: string; label: string; ml: number }> {
  const glass = glassMl > 0 ? Math.round(glassMl) : 250
  return [
    { id: 'glas', label: `1 glas (${formatNumber(glass)} ml)`, ml: glass },
    { id: 'flaska', label: '1 flaska (50 cl)', ml: 500 },
  ]
}
