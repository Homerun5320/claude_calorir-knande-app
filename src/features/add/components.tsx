/**
 * Små byggstenar för flödet "Lägg till mat": källmärke, måltidsväljare, sökrad med snabbknapp
 * och en hook för att lämna sidan.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Check, Plus } from 'lucide-react'
import type { Food, FoodSource, MealConfig, MealId, UnitKey } from '../../types'
import { Badge, Chip, cx, useMediaQuery } from '../../components/ui'
import { FoodRow, foodToRow, MEAL_META, useEnergyFormatter } from '../../components/domain'
import { useProfileStore } from '../../stores/profileStore'
import { isUsableUnit } from '../../components/domain/PortionPicker'
import { nutriScoreInfo, sourceMeta } from './addLogic'

// ---------------------------------------------------------------------------
// Navigering
// ---------------------------------------------------------------------------

/**
 * Gå tillbaka i historiken om det finns något att gå tillbaka till, annars till `fallback`.
 * (react-router sparar historikindex i `history.state.idx`.)
 */
export function useLeave(): (fallback: string) => void {
  const navigate = useNavigate()
  return useCallback(
    (fallback: string) => {
      const idx = (window.history.state as { idx?: number } | null)?.idx
      if (typeof idx === 'number' && idx > 0) navigate(-1)
      else navigate(fallback, { replace: true })
    },
    [navigate],
  )
}

// ---------------------------------------------------------------------------
// Källmärke
// ---------------------------------------------------------------------------

/** Märke för samlingsvärden (genomsnitt av vanliga märken). */
export function AverageBadge() {
  return (
    <Badge tone="neutral" title="Samlingsvärde – genomsnitt av vanliga märken. Skanna streckkoden för ditt märke.">
      Snitt
    </Badge>
  )
}

export function FoodSourceBadge({ source, short = false, className }: { source: FoodSource; short?: boolean; className?: string }) {
  const meta = sourceMeta(source)
  return (
    <Badge tone={meta.tone} className={className} title={meta.crowdSourced ? `${meta.label} – användarbidrag` : meta.label}>
      {short ? meta.short : meta.label}
    </Badge>
  )
}

// ---------------------------------------------------------------------------
// Nutri-Score
// ---------------------------------------------------------------------------

type NutriScore = NonNullable<ReturnType<typeof nutriScoreInfo>>

/**
 * Textfärg på Nutri-Scores fyllda färg. I ljust läge når ljus text bara 1,9:1 på gult (C) och
 * 3,1:1 på orange (D) – där blir texten mörk. Grönt och rött får vit text (≥ 4,5:1). I mörkt
 * läge är alla färgerna ljusa och texten mörk.
 */
export function nutriScoreTextClass(tone: NutriScore['tone']): string {
  return tone === 'sol' || tone === 'hjortron' ? 'text-ink dark:text-bg' : 'text-on-gran'
}

/** Liten fylld etikett "Nutri-Score C" med läsbar kontrast i både ljust och mörkt läge. */
export function NutriScoreBadge({ score }: { score: NutriScore }) {
  return (
    <span
      style={{ '--tone': `var(--lg-${score.tone})` } as CSSProperties}
      className={cx(
        'inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-full bg-(--tone) px-2 text-[0.6875rem] font-semibold leading-none',
        nutriScoreTextClass(score.tone),
      )}
    >
      Nutri-Score {score.grade}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Måltidsväljare
// ---------------------------------------------------------------------------

/** Aktiverade måltider – plus den valda om den är avstängd i inställningarna. */
export function visibleMeals(meals: MealConfig[], selected: MealId): MealConfig[] {
  return meals.filter((m) => m.enabled || m.id === selected)
}

/**
 * Måltidsväljare som vågrät rad. Den valda måltiden rullas alltid fram – annars kan t.ex.
 * "Mellanmål" ligga utanför skärmen i 375 px och man ser inte vart maten hamnar.
 */
export function MealChips({ value, onChange, className, label = 'Måltid' }: { value: MealId; onChange: (meal: MealId) => void; className?: string; label?: string }) {
  const meals = useProfileStore((s) => s.settings.meals)
  const list = visibleMeals(meals, value)
  const ref = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const mounted = useRef(false)

  useEffect(() => {
    const row = ref.current
    const chip = row?.querySelector<HTMLElement>('[aria-pressed="true"]')
    if (row && chip) {
      const box = row.getBoundingClientRect()
      const c = chip.getBoundingClientRect()
      if (c.left < box.left || c.right > box.right) {
        // Rulla bara raden i sidled (scrollIntoView skulle även kunna rulla sidan).
        const left = row.scrollLeft + (c.left - box.left) - (box.width - c.width) / 2
        row.scrollTo?.({ left: Math.max(0, left), behavior: mounted.current && !reduce ? 'smooth' : 'auto' })
      }
    }
    mounted.current = true
  }, [value, list.length, reduce])

  return (
    <div ref={ref} role="group" aria-label={label} className={cx('no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-1.5', className)}>
      {list.map((m) => (
        <Chip key={m.id} selected={m.id === value} onClick={() => onChange(m.id)} icon={MEAL_META[m.id].icon}>
          {m.name}
        </Chip>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sökrad
// ---------------------------------------------------------------------------

const LONG_PRESS_MS = 480

/** Långtryck (mobil) eller högerklick (desktop) på en rad. */
function useLongPress(onLongPress: () => void) {
  const timer = useRef<number | undefined>(undefined)
  const fired = useRef(false)
  const start = useRef<{ x: number; y: number } | null>(null)
  const cbRef = useRef(onLongPress)
  useEffect(() => {
    cbRef.current = onLongPress
  })
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const cancel = () => {
    window.clearTimeout(timer.current)
    start.current = null
  }
  return {
    /** true om det senaste trycket var ett långtryck – då ska klicket ignoreras. */
    consumeFired: () => {
      const f = fired.current
      fired.current = false
      return f
    },
    handlers: {
      onPointerDown: (e: ReactPointerEvent) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return
        // Knappar i raden (t.ex. "+") har egna tryck.
        if ((e.target as Element).closest?.('[data-no-longpress]')) return
        fired.current = false
        start.current = { x: e.clientX, y: e.clientY }
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => {
          fired.current = true
          start.current = null
          if (typeof navigator !== 'undefined') navigator.vibrate?.(12)
          cbRef.current()
        }, LONG_PRESS_MS)
      },
      onPointerMove: (e: ReactPointerEvent) => {
        const s = start.current
        if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 10) cancel()
      },
      onPointerUp: cancel,
      onPointerCancel: cancel,
      onPointerLeave: cancel,
      onContextMenu: (e: ReactMouseEvent) => {
        if ((e.target as Element).closest?.('[data-no-longpress]')) return
        e.preventDefault()
        cancel()
        fired.current = false
        cbRef.current()
      },
    },
  }
}

export interface AddRowProps {
  food: Food
  /** Mängd att visa i undertiteln (t.ex. senast använda). */
  amount?: number
  unit?: UnitKey
  /** Tryck på raden – öppna portionsväljaren. */
  onPick: (food: Food) => void
  /** Snabbknappen "+" – lägg till direkt med förvald mängd. Utelämna för att dölja knappen. */
  onQuickAdd?: (food: Food) => void
  /** Långtryck/högerklick – visa detaljer. */
  onDetails?: (food: Food) => void
  /** Visa källmärke (kort). */
  showSource?: boolean
  /** Antal av livsmedlet i korgen (visas som en liten markering). */
  inBasket?: number
  extraBadge?: ReactNode
  compact?: boolean
}

/**
 * En sökträff/listrad: tryck för att välja mängd, "+" för att lägga till direkt, håll inne (eller
 * högerklicka) för detaljer. I medvetet läge döljs energi och makron. På smala skärmar står
 * energin på raden under namnet – då får namnet hela bredden och bryts inte mitt i ord.
 */
export function AddRow({ food, amount, unit, onPick, onQuickAdd, onDetails, showSource = true, inBasket = 0, extraBadge, compact }: AddRowProps) {
  const mindful = useProfileStore((s) => s.settings.mindfulMode)
  const formatEnergy = useEnergyFormatter()
  // Smal skärm: energin flyttar till raden under namnet så att namnet får hela bredden
  // (annars blir det ~125 px i 390 px och liknande livsmedel går inte att skilja åt).
  const wide = useMediaQuery('(min-width: 640px)')
  const reduce = useReducedMotion()
  const [added, setAdded] = useState(false)
  const addedTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(addedTimer.current), [])
  const longPress = useLongPress(() => onDetails?.(food))

  const useUnit = unit && isUsableUnit(food, unit) ? unit : undefined
  const row = foodToRow(food, useUnit ? { amount, unit: useUnit } : {})
  const energyInline = !mindful && !wide
  const energyText = mindful ? undefined : row.kcal === undefined ? 'energi okänd' : formatEnergy(row.kcal)
  const badge = (
    <span className="inline-flex items-center gap-1">
      {extraBadge}
      {showSource && <FoodSourceBadge source={food.source} short />}
      {food.isAverage && <AverageBadge />}
      {inBasket > 0 && (
        <Badge tone="gran" variant="solid" title="I korgen">
          {inBasket > 1 ? `${inBasket} i korgen` : 'I korgen'}
        </Badge>
      )}
      {energyInline && (
        <span className={cx('whitespace-nowrap text-xs font-semibold tabular-nums', row.kcal === undefined ? 'text-ink-3' : 'text-ink-2')}>
          {energyText}
          {row.amountText && <span className="font-normal text-ink-3"> ·</span>}
        </span>
      )}
    </span>
  )
  const hasBadge = showSource || inBasket > 0 || Boolean(extraBadge) || energyInline || food.isAverage === true

  const quick = onQuickAdd ? (
    <motion.button
      type="button"
      data-no-longpress
      onClick={() => {
        onQuickAdd(food)
        setAdded(true)
        window.clearTimeout(addedTimer.current)
        addedTimer.current = window.setTimeout(() => setAdded(false), 1400)
      }}
      whileTap={reduce ? undefined : { scale: 0.88 }}
      aria-label={`Lägg till ${food.name} direkt (${row.amountText ?? 'förvald mängd'})`}
      className={cx(
        'relative grid size-10 place-items-center rounded-full transition-colors after:absolute after:-inset-1',
        added ? 'bg-gran text-on-gran' : 'bg-gran-soft text-gran hover:bg-gran hover:text-on-gran',
      )}
    >
      <AnimatePresence initial={false} mode="popLayout">
        {added ? (
          <motion.span key="ok" initial={reduce ? false : { scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}>
            <Check className="size-5" strokeWidth={2.6} aria-hidden />
          </motion.span>
        ) : (
          <motion.span key="plus" initial={reduce ? false : { scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}>
            <Plus className="size-5" strokeWidth={2.6} aria-hidden />
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  ) : undefined

  return (
    <div {...(onDetails ? longPress.handlers : {})} className="select-none [-webkit-touch-callout:none]">
      <FoodRow
        {...row}
        kcal={mindful ? undefined : row.kcal}
        showMacros={!mindful}
        hideEnergy={mindful || energyInline}
        compact={compact}
        badge={hasBadge ? badge : undefined}
        onClick={() => {
          if (longPress.consumeFired()) return
          onPick(food)
        }}
        actionLabel={[food.name, food.isAverage ? 'samlingsvärde' : undefined, row.amountText, energyText].filter(Boolean).join(', ') + '. Välj mängd.'}
        trailing={quick}
      />
    </div>
  )
}

/** Lista med jämna avdelare för rader. */
export function RowList({ children, className }: { children: ReactNode; className?: string }) {
  return <ul className={cx('card divide-y divide-line/70 px-4 py-1', className)}>{children}</ul>
}
