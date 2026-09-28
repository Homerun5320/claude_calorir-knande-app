/**
 * Månadskalender där varje dag färgas efter ett värde (t.ex. loggade kcal, andel av målet eller
 * antal gram grönsaker). Veckan börjar på måndag och veckonummer visas – som i en svensk almanacka.
 *
 * - Fem steg från ytfärg till full färg (token-baserat via `color-mix`, fungerar i mörkt läge).
 * - Dagar utan data visas tomma, idag får en ring och vald dag en tydligare markering.
 * - Piltangenter flyttar mellan dagar (upp/ned = en vecka), PageUp/PageDown byter månad.
 * - Valfria små markeringar per dag (`marks`), t.ex. "🎉" på helgdagar.
 * - Varje dag har en osynligt utökad tryckyta (44 px hög), eftersom cellerna är smala på mobil.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ISODate } from '../../types'
import {
  addDays,
  capitalize,
  formatDayLong,
  fromISODate,
  isoWeek,
  MONTHS,
  todayISO,
  toISODate,
  WEEKDAYS,
  WEEKDAYS_SHORT,
  weekdayIndex,
} from '../../lib/dates'
import { formatNumber } from '../../lib/format'
import { heatLevel, heatScale } from './chartUtils'

export interface CalendarHeatmapProps {
  /** Valfri dag i månaden som ska visas. */
  month: ISODate
  /** Värde per dag. Saknad nyckel = ingen data. */
  values: Readonly<Partial<Record<ISODate, number>>>
  today?: ISODate
  selected?: ISODate
  onSelect?: (date: ISODate) => void
  /** Visar pilar för att byta månad. Anropas med första dagen i den nya månaden. */
  onMonthChange?: (month: ISODate) => void
  /** Värdet som ger starkaste färgen. Standard: månadens högsta värde. */
  max?: number
  /** Egen nivåberäkning (0–4), t.ex. hur nära målet dagen var. */
  level?: (value: number, date: ISODate) => number
  /** CSS-färg för skalan (token). Standard `var(--lg-gran)`. */
  color?: string
  formatValue?: (value: number) => string
  /** Etiketter i teckenförklaringen. Standard ['Mindre', 'Mer']. */
  legendLabels?: readonly [string, string]
  showLegend?: boolean
  showWeekNumbers?: boolean
  /** Hindra val av framtida dagar. */
  disableFuture?: boolean
  /** Senaste månad man kan bläddra till. */
  maxDate?: ISODate
  /** Tidigaste månad man kan bläddra till. */
  minDate?: ISODate
  /** Liten markering (emoji/tecken) per dag. */
  marks?: Readonly<Partial<Record<ISODate, string>>>
  /** Rubrik. Standard: "September 2026". */
  title?: string
  className?: string
}

const LEVELS = 5

function firstOfMonth(date: ISODate): ISODate {
  const d = fromISODate(date)
  return toISODate(new Date(d.getFullYear(), d.getMonth(), 1))
}

function shiftMonth(date: ISODate, delta: number): ISODate {
  const d = fromISODate(date)
  return toISODate(new Date(d.getFullYear(), d.getMonth() + delta, 1))
}

export function CalendarHeatmap({
  month,
  values,
  today = todayISO(),
  selected,
  onSelect,
  onMonthChange,
  max,
  level,
  color = 'var(--lg-gran)',
  formatValue = (v) => formatNumber(v),
  legendLabels = ['Mindre', 'Mer'],
  showLegend = true,
  showWeekNumbers = true,
  disableFuture = false,
  maxDate,
  minDate,
  marks,
  title,
  className = '',
}: CalendarHeatmapProps) {
  const first = firstOfMonth(month)
  const firstDate = fromISODate(first)
  const daysInMonth = new Date(firstDate.getFullYear(), firstDate.getMonth() + 1, 0).getDate()
  const last = addDays(first, daysInMonth - 1)
  const lead = weekdayIndex(first)
  const scale = useMemo(() => heatScale(color, LEVELS), [color])

  const days = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => addDays(first, i)), [first, daysInMonth])
  const monthMax = useMemo(() => {
    if (max !== undefined) return max
    let m = 0
    for (const d of days) {
      const v = values[d]
      if (v !== undefined && Number.isFinite(v) && v > m) m = v
    }
    return m
  }, [days, values, max])

  const levelOf = (d: ISODate): number | null => {
    const v = values[d]
    if (v === undefined || !Number.isFinite(v)) return null
    if (level) return Math.max(0, Math.min(LEVELS - 1, Math.round(level(v, d))))
    return heatLevel(v, monthMax, LEVELS)
  }

  // Rader om 7 dagar (null = utfyllnad före/efter månaden).
  const cells: Array<ISODate | null> = [...Array.from({ length: lead }, () => null), ...days]
  while (cells.length % 7 !== 0) cells.push(null)
  const rows: Array<Array<ISODate | null>> = []
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7))

  // --- Fokus (roving tabindex) -------------------------------------------------
  const inMonth = (d: ISODate | undefined | null): d is ISODate => !!d && d >= first && d <= last
  const [focusDate, setFocusDate] = useState<ISODate>(() => (inMonth(selected) ? selected : inMonth(today) ? today : first))
  const [hover, setHover] = useState<ISODate | null>(null)
  const [focused, setFocused] = useState<ISODate | null>(null)
  const pendingFocus = useRef(false)
  const buttons = useRef(new Map<ISODate, HTMLButtonElement>())
  const tabbable = inMonth(focusDate) ? focusDate : inMonth(selected) ? selected : inMonth(today) ? today : first

  useEffect(() => {
    if (!pendingFocus.current) return
    // Månadsbyte och nytt fokus batchas i samma rendering, så knappen finns redan här.
    pendingFocus.current = false
    buttons.current.get(focusDate)?.focus()
  }, [focusDate, first])

  const isFuture = (d: ISODate) => d > today
  const canPrev = !!onMonthChange && (!minDate || shiftMonth(first, -1) >= firstOfMonth(minDate))
  const nextFirst = shiftMonth(first, 1)
  const canNext = !!onMonthChange && (!maxDate || nextFirst <= maxDate) && (!disableFuture || nextFirst <= today)

  const moveFocus = (to: ISODate) => {
    if (disableFuture && isFuture(to)) return
    if (minDate && to < minDate) return
    if (maxDate && to > maxDate) return
    if (to < first || to > last) {
      if (!onMonthChange) return
      onMonthChange(firstOfMonth(to))
    }
    pendingFocus.current = true
    setFocusDate(to)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, d: ISODate) => {
    const map: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
    if (e.key in map) {
      e.preventDefault()
      moveFocus(addDays(d, map[e.key]))
    } else if (e.key === 'Home') {
      e.preventDefault()
      moveFocus(addDays(d, -weekdayIndex(d)))
    } else if (e.key === 'End') {
      e.preventDefault()
      moveFocus(addDays(d, 6 - weekdayIndex(d)))
    } else if ((e.key === 'PageUp' || e.key === 'PageDown') && onMonthChange) {
      e.preventDefault()
      const target = fromISODate(d)
      const delta = e.key === 'PageUp' ? -1 : 1
      const m = new Date(target.getFullYear(), target.getMonth() + delta, 1)
      const dim = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate()
      moveFocus(toISODate(new Date(m.getFullYear(), m.getMonth(), Math.min(target.getDate(), dim))))
    }
  }

  const heading = title ?? `${capitalize(MONTHS[firstDate.getMonth()])} ${firstDate.getFullYear()}`
  const readoutDate = hover ?? (inMonth(focused) ? focused : inMonth(selected) ? selected : undefined)
  const readoutValue = readoutDate ? values[readoutDate] : undefined
  const readout = readoutDate
    ? `${formatDayLong(readoutDate, today)} · ${readoutValue === undefined ? 'ingen registrering' : formatValue(readoutValue)}`
    : '\u00a0'

  const labelFor = (d: ISODate) => {
    const v = values[d]
    const parts = [formatDayLong(d, today)]
    parts.push(v === undefined ? 'ingen registrering' : formatValue(v))
    if (d === today) parts.push('idag')
    const mark = marks?.[d]
    if (mark) parts.push(mark)
    return parts.join(', ')
  }

  return (
    <div className={className}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-display text-lg font-semibold text-ink" aria-live="polite">
          {heading}
        </h3>
        {onMonthChange && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => canPrev && onMonthChange(shiftMonth(first, -1))}
              disabled={!canPrev}
              aria-label="Föregående månad"
              className="grid h-11 w-11 place-items-center rounded-full text-ink-2 transition-colors hover:bg-surface-2 disabled:opacity-30"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => canNext && onMonthChange(nextFirst)}
              disabled={!canNext}
              aria-label="Nästa månad"
              className="grid h-11 w-11 place-items-center rounded-full text-ink-2 transition-colors hover:bg-surface-2 disabled:opacity-30"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>

      <div
        role="group"
        aria-label={`${heading}. Använd piltangenterna för att flytta mellan dagar.`}
        className={`grid gap-1.5 ${showWeekNumbers ? 'grid-cols-[1.75rem_repeat(7,minmax(0,1fr))]' : 'grid-cols-7'}`}
        onPointerLeave={() => setHover(null)}
      >
        {showWeekNumbers && (
          <span className="text-center text-[10px] font-semibold uppercase tracking-wider text-ink-3" aria-hidden="true">
            v.
          </span>
        )}
        {WEEKDAYS_SHORT.map((w, i) => (
          <abbr
            key={w}
            title={WEEKDAYS[i]}
            className="pb-1 text-center text-[11px] font-semibold text-ink-3 no-underline"
            aria-hidden="true"
          >
            {w}
          </abbr>
        ))}

        {rows.map((row, ri) => {
          const weekDate = row.find((d) => d !== null) ?? first
          return [
            showWeekNumbers ? (
              <span key={`w${ri}`} className="grid place-items-center text-[11px] text-ink-3 tabular-nums" aria-hidden="true">
                {isoWeek(weekDate)}
              </span>
            ) : null,
            ...row.map((d, ci) => {
              if (!d) return <span key={`e${ri}-${ci}`} aria-hidden="true" />
              const lvl = levelOf(d)
              const future = isFuture(d)
              const disabled = (disableFuture && future) || (!!minDate && d < minDate) || (!!maxDate && d > maxDate)
              const isToday = d === today
              const isSel = d === selected
              const strong = lvl !== null && lvl >= 3
              return (
                <button
                  key={d}
                  ref={(el) => {
                    if (el) buttons.current.set(d, el)
                    else buttons.current.delete(d)
                  }}
                  type="button"
                  tabIndex={d === tabbable ? 0 : -1}
                  disabled={disabled}
                  aria-label={labelFor(d)}
                  aria-pressed={onSelect ? isSel : undefined}
                  aria-current={isToday ? 'date' : undefined}
                  onClick={() => {
                    setFocusDate(d)
                    onSelect?.(d)
                  }}
                  onFocus={() => {
                    setFocusDate(d)
                    setFocused(d)
                  }}
                  onBlur={() => setFocused((f) => (f === d ? null : f))}
                  onKeyDown={(e) => onKeyDown(e, d)}
                  onPointerEnter={() => setHover(d)}
                  // after:-inset-1: osynlig utökning av tryckytan till 44 px höjd (cellerna är ca 33 × 36 px
                  // på en 375 px-telefon). Den fyller mellanrummet mellan dagarna utan att synas.
                  className={`relative grid aspect-square min-h-9 place-items-center rounded-[0.8rem] after:absolute after:-inset-1 after:rounded-[1rem] after:content-[''] text-[13px] font-medium tabular-nums transition-[transform,box-shadow] duration-150 enabled:hover:scale-[1.06] enabled:active:scale-95 disabled:cursor-default ${
                    lvl === null ? 'text-ink-3' : strong ? 'text-on-gran' : 'text-ink'
                  } ${future ? 'opacity-45' : ''} ${
                    isSel
                      ? 'z-[1] shadow-[0_0_0_2px_var(--lg-surface),0_0_0_4px_var(--lg-ink)]'
                      : isToday
                        ? 'z-[1] shadow-[0_0_0_2px_var(--lg-surface),0_0_0_4px_var(--lg-gran)]'
                        : lvl === null
                          ? 'shadow-[inset_0_0_0_1px_var(--lg-line)]'
                          : ''
                  }`}
                  style={{ background: lvl === null ? 'transparent' : scale[lvl] }}
                >
                  <span className={isToday ? 'font-bold' : undefined}>{fromISODate(d).getDate()}</span>
                  {isToday && (
                    <span className="absolute bottom-[14%] left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-current" aria-hidden="true" />
                  )}
                  {marks?.[d] && (
                    <span className="pointer-events-none absolute -right-0.5 -top-1 text-[10px] leading-none" aria-hidden="true">
                      {marks[d]}
                    </span>
                  )}
                </button>
              )
            }),
          ]
        })}
      </div>

      {/* Avläsning för seende användare – skärmläsare får samma information via knapparnas etiketter. */}
      <p className="mt-2 min-h-5 text-center text-xs text-ink-2 tabular-nums" aria-hidden="true">
        {readout}
      </p>

      {showLegend && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[11px] text-ink-3" aria-hidden="true">
          <span className="inline-flex items-center gap-1.5">
            {legendLabels[0]}
            {scale.map((c, i) => (
              <span key={i} className="inline-block h-3 w-3 rounded-[4px]" style={{ background: c }} />
            ))}
            {legendLabels[1]}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-[4px] shadow-[inset_0_0_0_1px_var(--lg-line)]" />
            Ingen data
          </span>
        </div>
      )}
    </div>
  )
}
