/**
 * Datumhjälp för lokal kalenderdag ('YYYY-MM-DD') med svensk formatering.
 * Veckan börjar på måndag och veckonummer följer ISO 8601 (som i Sverige).
 */
import type { ISODate } from '../types'

const pad = (n: number) => String(n).padStart(2, '0')

/** Date → 'YYYY-MM-DD' i lokal tid. */
export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 'YYYY-MM-DD' → Date (lokal midnatt). */
export function fromISODate(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export function todayISO(now: Date = new Date()): ISODate {
  return toISODate(now)
}

export function addDays(date: ISODate, days: number): ISODate {
  const d = fromISODate(date)
  d.setDate(d.getDate() + days)
  return toISODate(d)
}

/** Antal dagar från a till b (b − a). */
export function diffDays(a: ISODate, b: ISODate): number {
  const ms = fromISODate(b).getTime() - fromISODate(a).getTime()
  return Math.round(ms / 86_400_000)
}

/** Alla datum från start till och med end. */
export function dateRange(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = []
  const n = diffDays(start, end)
  for (let i = 0; i <= n; i++) out.push(addDays(start, i))
  return out
}

/** De senaste `n` dagarna, slutar med `end` (inklusive). */
export function lastNDays(n: number, end: ISODate = todayISO()): ISODate[] {
  return dateRange(addDays(end, -(n - 1)), end)
}

/** ISO-veckonummer (som används i Sverige). */
export function isoWeek(date: ISODate): number {
  const d = fromISODate(date)
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNr = (target.getUTCDay() + 6) % 7 // måndag = 0
  target.setUTCDate(target.getUTCDate() - dayNr + 3)
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4))
  const diff = (target.getTime() - firstThursday.getTime()) / 86_400_000
  return 1 + Math.round((diff - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7)
}

/** Måndagen i veckan som innehåller datumet. */
export function startOfWeek(date: ISODate): ISODate {
  const d = fromISODate(date)
  const dayNr = (d.getDay() + 6) % 7
  return addDays(date, -dayNr)
}

/** 0 = måndag … 6 = söndag */
export function weekdayIndex(date: ISODate): number {
  return (fromISODate(date).getDay() + 6) % 7
}

export const WEEKDAYS = ['måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag', 'söndag'] as const
export const WEEKDAYS_SHORT = ['mån', 'tis', 'ons', 'tors', 'fre', 'lör', 'sön'] as const
export const MONTHS = [
  'januari', 'februari', 'mars', 'april', 'maj', 'juni',
  'juli', 'augusti', 'september', 'oktober', 'november', 'december',
] as const
export const MONTHS_SHORT = ['jan', 'feb', 'mars', 'apr', 'maj', 'juni', 'juli', 'aug', 'sep', 'okt', 'nov', 'dec'] as const

/** "idag", "igår", "imorgon" eller "tisdag 23 sep". */
export function relativeDayLabel(date: ISODate, today: ISODate = todayISO()): string {
  const diff = diffDays(today, date)
  if (diff === 0) return 'Idag'
  if (diff === -1) return 'Igår'
  if (diff === 1) return 'Imorgon'
  return formatDayLong(date, today)
}

/** "tisdag 23 september" (+ år om annat än innevarande). */
export function formatDayLong(date: ISODate, today: ISODate = todayISO()): string {
  const d = fromISODate(date)
  const base = `${WEEKDAYS[weekdayIndex(date)]} ${d.getDate()} ${MONTHS[d.getMonth()]}`
  return d.getFullYear() === fromISODate(today).getFullYear() ? capitalize(base) : `${capitalize(base)} ${d.getFullYear()}`
}

/** "23 sep" */
export function formatDayShort(date: ISODate): string {
  const d = fromISODate(date)
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`
}

/** "2026-09-23" → "23/9" */
export function formatDayNumeric(date: ISODate): string {
  const d = fromISODate(date)
  return `${d.getDate()}/${d.getMonth() + 1}`
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Tid på dygnet → hälsning. */
export function greeting(now: Date = new Date()): string {
  const h = now.getHours()
  if (h < 5) return 'God natt'
  if (h < 10) return 'God morgon'
  if (h < 12) return 'God förmiddag'
  if (h < 18) return 'God eftermiddag'
  return 'God kväll'
}

/** 'HH:mm' för nuvarande tid. */
export function nowTime(now: Date = new Date()): string {
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`
}

export function ageFromBirthYear(birthYear: number, today: ISODate = todayISO()): number {
  return fromISODate(today).getFullYear() - birthYear
}
