/**
 * Ren logik för Mer, Om Lagom och Matkalendern: dagsljus, veckotraditioner, säsongens råvaror
 * och små nyckeltal.
 */
import type { DiaryEntry, ISODate } from '../../types'
import { MONTHS, addDays, fromISODate, toISODate } from '../../lib/dates'
import { formatNumber } from '../../lib/format'
import { DEFAULT_LAT, DEFAULT_LON, sunTimes, type Produce, type ProduceKind, type SunTimes } from '../../lib/season'
import { weeklyFoodDayFor, type FoodDay } from '../../lib/swedishCalendar'

export const STOCKHOLM_TZ = 'Europe/Stockholm'

const clockFormatters = new Map<string, Intl.DateTimeFormat>()
function clockFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = clockFormatters.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('sv-SE', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone })
    clockFormatters.set(timeZone, f)
  }
  return f
}

/** Klockslag "07:42" i given tidszon (standard Stockholm), eller "–". */
export function formatClock(d: Date | null, timeZone: string = STOCKHOLM_TZ): string {
  if (!d || Number.isNaN(d.getTime())) return '–'
  const parts = clockFormatter(timeZone).formatToParts(d)
  const h = parts.find((p) => p.type === 'hour')?.value ?? '00'
  const m = parts.find((p) => p.type === 'minute')?.value ?? '00'
  return `${h}:${m}`
}

/** Minuter efter midnatt i given tidszon. */
export function clockMinutes(d: Date, timeZone: string = STOCKHOLM_TZ): number {
  const [h, m] = formatClock(d, timeZone).split(':').map(Number)
  return h * 60 + m
}

/** Var på dygnet (0–1) solen går upp och ner – för en dagsljusstapel. null vid midnattssol/polarnatt. */
export function daylightSpan(t: SunTimes, timeZone: string = STOCKHOLM_TZ): { start: number; end: number } | null {
  if (!t.sunrise || !t.sunset) return null
  return { start: clockMinutes(t.sunrise, timeZone) / 1440, end: clockMinutes(t.sunset, timeZone) / 1440 }
}

/** Timmar → "11 h 42 min" (hårt mellanslag mellan tal och enhet, så att de aldrig hamnar på olika rader). */
export function formatDaylight(hours: number): string {
  const total = Math.round(Math.max(0, hours) * 60)
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m}\u00a0min`
  return m === 0 ? `${h}\u00a0h` : `${h}\u00a0h ${m}\u00a0min`
}

/** Hur många minuter dagsljuset ändrats sedan igår (positivt = ljusare). */
export function daylightDeltaMinutes(today: ISODate, lat: number = DEFAULT_LAT, lon: number = DEFAULT_LON): number {
  const now = sunTimes(today, lat, lon).daylightHours
  const before = sunTimes(addDays(today, -1), lat, lon).daylightHours
  return Math.round((now - before) * 60)
}

/** "3 minuter längre än igår" / "4 minuter kortare än igår" / "lika lång som igår". */
export function describeDaylightDelta(minutes: number): string {
  if (minutes === 0) return 'Ungefär lika lång som igår'
  const n = Math.abs(minutes)
  return `${formatNumber(n)}\u00a0${n === 1 ? 'minut' : 'minuter'} ${minutes > 0 ? 'längre' : 'kortare'} än igår`
}

/**
 * Mörka halvåret (oktober–mars) då solen står så lågt i Sverige att huden knappt bildar
 * något D-vitamin.
 */
export function isVitaminDSeason(date: ISODate): boolean {
  const m = fromISODate(date).getMonth() + 1
  return m >= 10 || m <= 3
}

/** Nästa veckotradition (torsdag/fredag/lördag) från och med idag. */
export function nextWeeklyTradition(today: ISODate): { day: FoodDay; inDays: number } | null {
  for (let i = 0; i < 7; i++) {
    const day = weeklyFoodDayFor(addDays(today, i))
    if (day) return { day, inDays: i }
  }
  return null
}

/** Nästa förekomst (från och med idag) av en viss veckotradition, t.ex. 'fredagsmys'. */
export function nextWeeklyOccurrence(key: string, today: ISODate): FoodDay | null {
  for (let i = 0; i < 7; i++) {
    const day = weeklyFoodDayFor(addDays(today, i))
    if (day?.key === key) return day
  }
  return null
}

/** Länk till livsmedelssöket för ett sökord. */
export function foodSearchPath(term: string): string {
  return `/lagg-till?q=${encodeURIComponent(term.trim())}`
}

export const PRODUCE_KIND_LABELS: Record<ProduceKind, string> = {
  grönsak: 'Grönsaker och rotfrukter',
  frukt: 'Frukt',
  bär: 'Bär',
  svamp: 'Svamp',
  fisk: 'Fisk och skaldjur',
}

/** Gruppera råvaror efter slag, i ordningen grönsaker → frukt → bär → svamp → fisk. */
export function groupProduce(list: readonly Produce[]): Array<{ kind: ProduceKind; label: string; items: Produce[] }> {
  const order: ProduceKind[] = ['grönsak', 'frukt', 'bär', 'svamp', 'fisk']
  return order
    .map((kind) => ({ kind, label: PRODUCE_KIND_LABELS[kind], items: list.filter((p) => p.kind === kind) }))
    .filter((g) => g.items.length > 0)
}

/** Millisekunder → "12 h 5 min" (för pågående fasta). */
export function formatElapsed(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60_000))
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m}\u00a0min`
  return `${h}\u00a0h ${m}\u00a0min`
}

/** Antal dagar med minst en post de senaste `n` dagarna (till och med idag). */
export function loggedDaysInLast(entries: Record<ISODate, readonly DiaryEntry[] | undefined>, today: ISODate, n = 7): number {
  let count = 0
  for (let i = 0; i < n; i++) if ((entries[addDays(today, -i)]?.length ?? 0) > 0) count++
  return count
}

/** Tidsstämpel → "12 september" (eller "12 september 2025" om annat år). */
export function formatSince(ms: number, today: ISODate): string {
  const d = new Date(ms)
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`
  return d.getFullYear() === fromISODate(today).getFullYear() ? base : `${base} ${d.getFullYear()}`
}

/** Antal dagar sedan en tidsstämpel (dag 1 = samma dag). */
export function dayNumberSince(ms: number, today: ISODate): number {
  const start = fromISODate(toISODate(new Date(ms))).getTime()
  const now = fromISODate(today).getTime()
  return Math.max(1, Math.round((now - start) / 86_400_000) + 1)
}
