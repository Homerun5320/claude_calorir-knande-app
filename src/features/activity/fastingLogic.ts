/**
 * Ren logik för periodisk fasta: protokoll, förlopp, tidsformat, starttid och veckosummering.
 *
 * Evidensläget (kort): periodisk fasta ger ungefär samma viktnedgång som vanlig kaloriminskning.
 * Effekten kommer främst av att man äter mindre totalt – inte av fastan i sig. Lagom presenterar
 * därför fasta som ett av flera sätt att strukturera ätandet, utan överdrivna löften.
 */
import type { ISODate } from '../../types'
import type { FastRecord } from '../../stores/fastingStore'
import { formatDuration } from '../../lib/format'
import { diffDays, formatDayShort, relativeDayLabel, toISODate, todayISO } from '../../lib/dates'

export interface FastingProtocol {
  /** '16:8' – sparas i `FastRecord.protocol`. */
  id: string
  fastHours: number
  eatHours: number
  /** Kort etikett, t.ex. "Populärast". */
  title: string
  description: string
}

export const FASTING_PROTOCOLS: readonly FastingProtocol[] = [
  { id: '12:12', fastHours: 12, eatHours: 12, title: 'Nybörjarvänlig', description: 'Ungefär en natt plus kvällen, t.ex. ät 08–20.' },
  { id: '14:10', fastHours: 14, eatHours: 10, title: 'Mjuk start', description: 'Ett lite kortare ätfönster, t.ex. ät 09–19.' },
  { id: '16:8', fastHours: 16, eatHours: 8, title: 'Vanligast', description: 'Hoppa över frukost eller kvällsmat, t.ex. ät 12–20.' },
  { id: '18:6', fastHours: 18, eatHours: 6, title: 'För den vane', description: 'Två måltider i ett kort fönster, t.ex. ät 12–18.' },
  { id: '20:4', fastHours: 20, eatHours: 4, title: 'Krävande', description: 'Ett mycket kort ätfönster, t.ex. ät 14–18. Passar få.' },
]

export const DEFAULT_PROTOCOL_ID = '16:8'

/** Protokoll på id (t.ex. '16:8'). */
export function protocolById(id: string | undefined): FastingProtocol | undefined {
  return FASTING_PROTOCOLS.find((p) => p.id === id)
}

/** Längsta tillåtna fasta bakåt när starttiden ändras. */
export const MAX_FAST_HOURS = 72

const HOUR_MS = 3_600_000
const MINUTE_MS = 60_000

// ---------------------------------------------------------------------------
// Förlopp
// ---------------------------------------------------------------------------

export interface FastProgress {
  elapsedMs: number
  targetMs: number
  remainingMs: number
  /** 0–1+ (passerar 1 när målet är nått). */
  ratio: number
  done: boolean
  /** Epoch ms när målet nås. */
  goalAt: number
}

export function fastProgress(active: { start: number; targetHours: number }, nowMs: number): FastProgress {
  const elapsedMs = Math.max(0, nowMs - active.start)
  const targetMs = Math.max(MINUTE_MS, active.targetHours * HOUR_MS)
  return {
    elapsedMs,
    targetMs,
    remainingMs: Math.max(0, targetMs - elapsedMs),
    ratio: elapsedMs / targetMs,
    done: elapsedMs >= targetMs,
    goalAt: active.start + targetMs,
  }
}

// ---------------------------------------------------------------------------
// Format
// ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0')

/** Timer: 5 h 3 min 9 s → "5:03:09". */
export function formatHms(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${h}:${pad(m)}:${pad(s)}`
}

/** Varaktighet i hela minuter nedåt: "16 h 5 min", "45 min", "0 min". */
export function formatFastDuration(ms: number): string {
  return formatDuration(Math.max(0, Math.floor(ms / MINUTE_MS)))
}

/** Klockslag 'HH:mm' för en tidpunkt. */
export function clockTime(ms: number): string {
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** "idag 20:00", "igår 20:00", "imorgon 12:00" eller "tisdag 23 september 20:00". */
export function dayAndTime(ms: number, today: ISODate = todayISO()): string {
  const label = relativeDayLabel(toISODate(new Date(ms)), today)
  const day = /^(Idag|Igår|Imorgon)$/.test(label) ? label.toLowerCase() : label
  return `${day} ${clockTime(ms)}`
}

/** Kompakt för listor: "Idag 20:00", "Igår 20:00", "24 sep 20:00". */
export function shortDayAndTime(ms: number, today: ISODate = todayISO()): string {
  const date = toISODate(new Date(ms))
  const diff = diffDays(date, today)
  const day = diff === 0 ? 'Idag' : diff === 1 ? 'Igår' : diff === -1 ? 'Imorgon' : formatDayShort(date)
  return `${day} ${clockTime(ms)}`
}

// ---------------------------------------------------------------------------
// Starttid
// ---------------------------------------------------------------------------

export type StartDay = 'idag' | 'igar' | 'forrgar'

export const START_DAYS: ReadonlyArray<{ value: StartDay; label: string; offset: number }> = [
  { value: 'forrgar', label: 'I förrgår', offset: -2 },
  { value: 'igar', label: 'Igår', offset: -1 },
  { value: 'idag', label: 'Idag', offset: 0 },
]

/** Epoch ms för ett klockslag ('HH:mm') en viss dag relativt `now`, eller null om ogiltigt. */
export function resolveStartTime(time: string, day: StartDay, now: Date = new Date()): number | null {
  const m = time.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  const offset = START_DAYS.find((d) => d.value === day)?.offset ?? 0
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, h, min, 0, 0)
  return date.getTime()
}

/** Troligaste dag för ett klockslag: idag om det redan har passerat, annars igår. */
export function guessStartDay(time: string, now: Date = new Date()): StartDay {
  const today = resolveStartTime(time, 'idag', now)
  return today !== null && today <= now.getTime() ? 'idag' : 'igar'
}

/** Dagval och klockslag för en befintlig starttid. */
export function startParts(startMs: number, now: Date = new Date()): { day: StartDay; time: string } {
  const diff = diffDays(toISODate(new Date(startMs)), toISODate(now))
  const day: StartDay = diff >= 2 ? 'forrgar' : diff === 1 ? 'igar' : 'idag'
  return { day, time: clockTime(startMs) }
}

/** Felmeddelande för en starttid, eller null om den är giltig. */
export function validateStart(startMs: number | null, nowMs: number): string | null {
  if (startMs === null || !Number.isFinite(startMs)) return 'Ange ett klockslag, t.ex. 20:00.'
  if (startMs > nowMs + MINUTE_MS) return 'Starttiden kan inte ligga i framtiden.'
  if (nowMs - startMs > MAX_FAST_HOURS * HOUR_MS) return `Starttiden kan ligga högst ${MAX_FAST_HOURS} timmar bakåt.`
  return null
}

/** Förvalt klockslag när man anger att man började tidigare: nu, avrundat nedåt till kvart. */
export function defaultStartTime(now: Date = new Date()): string {
  const quarter = Math.floor(now.getMinutes() / 15) * 15
  return `${pad(now.getHours())}:${pad(quarter)}`
}

// ---------------------------------------------------------------------------
// Historik
// ---------------------------------------------------------------------------

/** Tolerans så att en fasta som avslutas någon sekund före målet ändå räknas. */
const SUCCESS_TOLERANCE_MS = MINUTE_MS

export function fastDurationMs(rec: Pick<FastRecord, 'start' | 'end'>): number {
  return Math.max(0, rec.end - rec.start)
}

/** Nåddes målet? */
export function fastSucceeded(rec: Pick<FastRecord, 'start' | 'end' | 'targetHours'>): boolean {
  return fastDurationMs(rec) >= rec.targetHours * HOUR_MS - SUCCESS_TOLERANCE_MS
}

/** Andel av målet, 0–1+. */
export function fastRatio(rec: Pick<FastRecord, 'start' | 'end' | 'targetHours'>): number {
  const target = rec.targetHours * HOUR_MS
  return target > 0 ? fastDurationMs(rec) / target : 0
}

/** En fasta hör till dagen den avslutades. */
export function fastDate(rec: Pick<FastRecord, 'end'>): ISODate {
  return toISODate(new Date(rec.end))
}

export interface FastingWeek {
  count: number
  completed: number
  totalMs: number
  averageMs: number
  longestMs: number
  /** Per dag i veckan: 'klar' om ett mål nåddes, 'pabörjad' om en fasta avslutades, annars null. */
  days: Array<{ date: ISODate; status: 'klar' | 'paborjad' | null }>
}

/** Summering för de angivna dagarna (fastor räknas till dagen de avslutades). */
export function fastingWeek(history: readonly FastRecord[], dates: readonly ISODate[]): FastingWeek {
  const inRange = new Set(dates)
  const byDay = new Map<ISODate, FastRecord[]>()
  for (const rec of history) {
    const d = fastDate(rec)
    if (!inRange.has(d)) continue
    const list = byDay.get(d)
    if (list) list.push(rec)
    else byDay.set(d, [rec])
  }
  let count = 0
  let completed = 0
  let totalMs = 0
  let longestMs = 0
  for (const list of byDay.values()) {
    for (const rec of list) {
      const ms = fastDurationMs(rec)
      count++
      totalMs += ms
      if (ms > longestMs) longestMs = ms
      if (fastSucceeded(rec)) completed++
    }
  }
  const days = dates.map((date) => {
    const list = byDay.get(date)
    const status: 'klar' | 'paborjad' | null = !list ? null : list.some(fastSucceeded) ? 'klar' : 'paborjad'
    return { date, status }
  })
  return { count, completed, totalMs, averageMs: count > 0 ? totalMs / count : 0, longestMs, days }
}

/** Vänlig text när en fasta avslutas. */
export function endMessage(rec: Pick<FastRecord, 'start' | 'end' | 'targetHours'>): string {
  if (fastSucceeded(rec)) return `Snyggt – ${formatFastDuration(fastDurationMs(rec))} fasta är sparad.`
  return `Fastan är sparad (${formatFastDuration(fastDurationMs(rec))}). Bra att lyssna på kroppen.`
}

/** Senast använda protokoll, eller standard. */
export function lastProtocolId(history: readonly FastRecord[]): string {
  const last = history.find((h) => protocolById(h.protocol))
  return last?.protocol ?? DEFAULT_PROTOCOL_ID
}
