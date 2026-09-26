/**
 * Datumväljare i stil med ‹ Idag › – för dagboken och dagens översikt.
 *
 * - Pilar för föregående/nästa dag, veckonummer ("v. 39") och relativa namn (Idag, Igår, Imorgon).
 * - Svep åt vänster/höger (pekarhändelser) byter dag. `useSwipe` kan även användas på hela sidan.
 * - Tryck på datumet öppnar systemets datumväljare för att hoppa direkt.
 * - Framtida dagar tillåts för planering, som standard upp till 7 dagar fram.
 */
import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import type { ISODate } from '../../types'
import {
  addDays,
  diffDays,
  formatDayLong,
  formatDayShort,
  isoWeek,
  relativeDayLabel,
  todayISO,
  WEEKDAYS,
  weekdayIndex,
} from '../../lib/dates'

// ---------------------------------------------------------------------------
// Svep
// ---------------------------------------------------------------------------

export interface SwipeOptions {
  /** Fingret drogs åt vänster (brukar betyda "nästa"). */
  onSwipeLeft?: () => void
  /** Fingret drogs åt höger (brukar betyda "föregående"). */
  onSwipeRight?: () => void
  /** Minsta horisontella sträcka i pixlar. Standard 56. */
  threshold?: number
  /** Längsta tid för ett svep i ms. Standard 800. */
  maxDuration?: number
}

export interface SwipeHandlers {
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void
  onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void
  onPointerCancel: () => void
  /** Låt webbläsaren sköta vertikal scroll men ge oss horisontella rörelser. */
  style: { touchAction: 'pan-y' }
}

/**
 * Enkla svepgester med pekarhändelser (fungerar för touch, penna och mus).
 * Sprid resultatet på ett element: `<div {...useSwipe({ onSwipeLeft: next })}>`.
 */
export function useSwipe({ onSwipeLeft, onSwipeRight, threshold = 56, maxDuration = 800 }: SwipeOptions): SwipeHandlers {
  const start = useRef<{ x: number; y: number; t: number; id: number } | null>(null)
  const latest = useRef({ onSwipeLeft, onSwipeRight })
  useLayoutEffect(() => {
    latest.current = { onSwipeLeft, onSwipeRight }
  })
  return useMemo<SwipeHandlers>(
    () => ({
      onPointerDown: (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return
        start.current = { x: e.clientX, y: e.clientY, t: e.timeStamp, id: e.pointerId }
      },
      onPointerUp: (e) => {
        const s = start.current
        start.current = null
        if (!s || s.id !== e.pointerId) return
        const dx = e.clientX - s.x
        const dy = e.clientY - s.y
        if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy) * 1.5 || e.timeStamp - s.t > maxDuration) return
        if (dx < 0) latest.current.onSwipeLeft?.()
        else latest.current.onSwipeRight?.()
      },
      onPointerCancel: () => {
        start.current = null
      },
      style: { touchAction: 'pan-y' },
    }),
    [threshold, maxDuration],
  )
}

// ---------------------------------------------------------------------------
// Datumnavigering
// ---------------------------------------------------------------------------

export interface DateNavigatorProps {
  date: ISODate
  onChange: (date: ISODate) => void
  /** Dagens datum (skicka gärna `useToday()` så att det uppdateras vid midnatt). */
  today?: ISODate
  /** Hur många dagar framåt man får planera. Standard 7. */
  maxFutureDays?: number
  /** Tidigaste datum. */
  minDate?: ISODate
  /** Visa veckonummer. Standard true. */
  showWeek?: boolean
  /** Byt dag genom att svepa på komponenten. Standard true. */
  swipe?: boolean
  className?: string
}

export function DateNavigator({
  date,
  onChange,
  today = todayISO(),
  maxFutureDays = 7,
  minDate,
  showWeek = true,
  swipe = true,
  className = '',
}: DateNavigatorProps) {
  const reduced = useReducedMotion() ?? false
  const inputRef = useRef<HTMLInputElement>(null)
  const maxDate = addDays(today, Math.max(0, maxFutureDays))
  const canPrev = !minDate || date > minDate
  const canNext = date < maxDate

  // Riktning för animationen härleds från föregående datum (Reacts mönster för "förra propen").
  const [prevDate, setPrevDate] = useState(date)
  const [direction, setDirection] = useState(0)
  if (prevDate !== date) {
    setDirection(date > prevDate ? 1 : -1)
    setPrevDate(date)
  }

  const go = (delta: number) => {
    const next = addDays(date, delta)
    if (delta < 0 && !canPrev) return
    if (delta > 0 && !canNext) return
    onChange(next)
  }
  const swipeHandlers = useSwipe({ onSwipeLeft: () => go(1), onSwipeRight: () => go(-1) })

  const openPicker = () => {
    const el = inputRef.current
    if (!el) return
    try {
      if (typeof el.showPicker === 'function') {
        el.showPicker()
        return
      }
    } catch {
      /* t.ex. äldre Safari eller inbäddad ram – fall tillbaka nedan */
    }
    el.focus()
    el.click()
  }

  const diff = diffDays(today, date)
  const label = relativeDayLabel(date, today)
  const relative = Math.abs(diff) <= 1
  const week = `v. ${isoWeek(date)}`
  const subtitle = relative
    ? `${WEEKDAYS[weekdayIndex(date)]} ${formatDayShort(date)}${showWeek ? ` · ${week}` : ''}`
    : showWeek
      ? week
      : ''
  const fullLabel = formatDayLong(date, today)
  const offset = reduced ? 0 : 28

  return (
    <div
      className={`flex select-none items-center gap-1 ${className}`}
      role="group"
      aria-label="Välj dag"
      {...(swipe ? swipeHandlers : {})}
    >
      <button
        type="button"
        onClick={() => go(-1)}
        disabled={!canPrev}
        aria-label={`Föregående dag, ${formatDayLong(addDays(date, -1), today)}`}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink-2 transition-colors hover:bg-surface-2 active:scale-95 disabled:opacity-30"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>

      <div className="relative min-w-0 flex-1 overflow-hidden text-center">
        <AnimatePresence mode="popLayout" initial={false} custom={direction}>
          <motion.div
            key={date}
            custom={direction}
            initial={{ x: direction * offset, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -direction * offset, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            className="flex flex-col items-center"
          >
            <button
              type="button"
              onClick={openPicker}
              aria-label={`${label === fullLabel ? fullLabel : `${label}, ${fullLabel}`}, ${week}. Välj datum`}
              className="group flex max-w-full items-center gap-1.5 rounded-xl px-2 font-display text-xl font-semibold leading-tight text-ink transition-colors hover:bg-surface-2"
            >
              <span className="truncate">{label}</span>
              <CalendarDays
                className="h-3.5 w-3.5 shrink-0 text-ink-3 opacity-60 transition-opacity group-hover:opacity-100"
                aria-hidden="true"
              />
            </button>
            <div className="mt-0.5 flex h-5 items-center justify-center gap-2 text-xs text-ink-3 tabular-nums">
              {subtitle && <span aria-hidden="true">{subtitle}</span>}
              {diff !== 0 && (
                <button
                  type="button"
                  onClick={() => onChange(today)}
                  aria-label="Gå till idag"
                  className="relative rounded-full bg-gran-soft px-2 py-0.5 text-[11px] font-semibold text-gran transition-transform after:absolute after:-inset-x-1 after:-inset-y-3 after:content-[''] active:scale-95"
                >
                  Till idag
                </button>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
        <input
          ref={inputRef}
          type="date"
          tabIndex={-1}
          aria-hidden="true"
          value={date}
          min={minDate}
          max={maxDate}
          onChange={(e) => {
            const v = e.target.value
            if (!v) return
            if (v > maxDate || (minDate && v < minDate)) return
            onChange(v)
          }}
          className="pointer-events-none absolute bottom-0 left-1/2 h-px w-px opacity-0"
        />
      </div>

      <button
        type="button"
        onClick={() => go(1)}
        disabled={!canNext}
        aria-label={`Nästa dag, ${formatDayLong(addDays(date, 1), today)}`}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink-2 transition-colors hover:bg-surface-2 active:scale-95 disabled:opacity-30"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  )
}
