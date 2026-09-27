/**
 * Perioder för Insikter: vald ISO-vecka (med bläddring bakåt) eller de senaste 30/90 dagarna.
 *
 * Perioden har alltid alla sina datum (`dates`, t.ex. måndag–söndag), men bara dagar till och med
 * idag räknas som förflutna (`elapsed`). Oregistrerade dagar räknas aldrig in i snitt – det är
 * anroparens ansvar att filtrera på loggade dagar. Dagens (ofta ofullständiga) registrering räknas
 * bara med när dagen är klar, se `withCountedDays`.
 */
import type { ISODate } from '../../types'
import { addDays, dateRange, fromISODate, isoWeek, MONTHS_SHORT, startOfWeek } from '../../lib/dates'

export const PERIOD_KINDS = ['vecka', '30', '90'] as const
export type PeriodKind = (typeof PERIOD_KINDS)[number]

export const PERIOD_LABELS: Record<PeriodKind, string> = {
  vecka: 'Vecka',
  '30': '30 dagar',
  '90': '90 dagar',
}

/** Hur långt bakåt man kan bläddra i veckor (ca fem år). */
export const MAX_WEEKS_BACK = 260

export interface Period {
  kind: PeriodKind
  /** Veckoförskjutning: 0 = innevarande vecka, −1 = förra veckan … (bara för 'vecka'). */
  offset: number
  start: ISODate
  /** Sista dagen (inklusive). Kan ligga i framtiden för innevarande vecka. */
  end: ISODate
  /** Alla datum i perioden. */
  dates: ISODate[]
  /** Datum till och med idag. */
  elapsed: ISODate[]
  /** Rubrik, t.ex. "Vecka 39" eller "Senaste 30 dagarna". */
  title: string
  /** Kort etikett, t.ex. "Den här veckan", "Förra veckan" eller "Senaste 30 dagarna". */
  label: string
  /** "21–27 sep" eller "28 aug – 26 sep". */
  range: string
  /** Används i löptext och delad rapport: "vecka 39", "de senaste 30 dagarna". */
  phrase: string
  /** Innevarande period (innehåller idag). */
  isCurrent: boolean
  /**
   * true när idag är borttagen ur `elapsed` för att dagen inte är markerad som klar än
   * (se `withCountedDays`).
   */
  todayExcluded?: boolean
}

export function parsePeriodKind(value: string | null | undefined): PeriodKind {
  return value === '30' || value === '90' ? value : 'vecka'
}

/** Tolka veckoförskjutningen från adressen. Framtida veckor tillåts inte. */
export function parseWeekOffset(value: string | null | undefined): number {
  if (value === null || value === undefined || value.trim() === '') return 0
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.max(-MAX_WEEKS_BACK, Math.min(0, Math.trunc(n)))
}

/** "21–27 sep", "29 sep – 5 okt", "29 dec 2025 – 4 jan 2026" (år visas när det skiljer sig från idag). */
export function formatDateRange(start: ISODate, end: ISODate, today: ISODate): string {
  const a = fromISODate(start)
  const b = fromISODate(end)
  const thisYear = fromISODate(today).getFullYear()
  const sameYear = a.getFullYear() === b.getFullYear()
  const endYear = b.getFullYear() !== thisYear || !sameYear ? ` ${b.getFullYear()}` : ''
  if (start === end) return `${b.getDate()} ${MONTHS_SHORT[b.getMonth()]}${endYear}`
  if (sameYear && a.getMonth() === b.getMonth()) return `${a.getDate()}–${b.getDate()} ${MONTHS_SHORT[b.getMonth()]}${endYear}`
  const startYear = sameYear ? '' : ` ${a.getFullYear()}`
  return `${a.getDate()} ${MONTHS_SHORT[a.getMonth()]}${startYear} – ${b.getDate()} ${MONTHS_SHORT[b.getMonth()]}${endYear}`
}

function daysOf(kind: PeriodKind): number {
  return kind === '30' ? 30 : kind === '90' ? 90 : 7
}

function build(kind: PeriodKind, offset: number, start: ISODate, end: ISODate, today: ISODate): Period {
  const dates = dateRange(start, end)
  const elapsed = dates.filter((d) => d <= today)
  const isCurrent = start <= today && today <= end
  if (kind === 'vecka') {
    const week = isoWeek(start)
    const label = offset === 0 ? 'Den här veckan' : offset === -1 ? 'Förra veckan' : `Vecka ${week}`
    return {
      kind,
      offset,
      start,
      end,
      dates,
      elapsed,
      title: `Vecka ${week}`,
      label,
      range: formatDateRange(start, end, today),
      phrase: `vecka ${week}`,
      isCurrent,
    }
  }
  const n = daysOf(kind)
  return {
    kind,
    offset: 0,
    start,
    end,
    dates,
    elapsed,
    title: `Senaste ${n} dagarna`,
    label: `Senaste ${n} dagarna`,
    range: formatDateRange(start, end, today),
    phrase: `de senaste ${n} dagarna`,
    isCurrent,
  }
}

/**
 * Perioden med de dagar som räknas i snitt och summeringar. Dagens (ofta ofullständiga)
 * registrering räknas bara med när dagen är markerad som klar – eller när ingen annan förfluten
 * dag i perioden har registreringar. Samma regel som veckosnittet och kostråden på Idag, så att en
 * halv dag inte drar ned snitten. Samma objekt returneras när inget behöver ändras.
 */
export function withCountedDays(p: Period, today: ISODate, todayComplete: boolean, hasEntries: (date: ISODate) => boolean): Period {
  if (todayComplete || !p.elapsed.includes(today)) return p
  const earlier = p.elapsed.filter((d) => d !== today)
  if (!earlier.some(hasEntries)) return p
  return { ...p, elapsed: earlier, todayExcluded: true }
}

/** Perioden för en typ och (för veckor) en förskjutning bakåt. */
export function makePeriod(kind: PeriodKind, offset: number, today: ISODate): Period {
  if (kind === 'vecka') {
    const o = Math.max(-MAX_WEEKS_BACK, Math.min(0, Math.trunc(offset) || 0))
    const start = addDays(startOfWeek(today), o * 7)
    return build(kind, o, start, addDays(start, 6), today)
  }
  const n = daysOf(kind)
  return build(kind, 0, addDays(today, -(n - 1)), today, today)
}

/**
 * Perioden närmast före (för jämförelser, t.ex. "+120 kcal mot förra veckan").
 * För innevarande vecka jämförs bara lika många dagar (mån–idag mot mån–samma veckodag förra veckan).
 */
export function previousPeriod(p: Period, today: ISODate): Period {
  if (p.kind === 'vecka') {
    const prev = makePeriod('vecka', p.offset - 1, today)
    if (!p.isCurrent) return prev
    const sameLength = prev.dates.slice(0, p.elapsed.length)
    return { ...prev, elapsed: sameLength }
  }
  const n = daysOf(p.kind)
  const end = addDays(p.start, -1)
  return build(p.kind, 0, addDays(end, -(n - 1)), end, today)
}
