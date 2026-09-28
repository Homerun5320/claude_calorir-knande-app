/**
 * Stepper – kompakt −/värde/+ (t.ex. antal portioner, glas vatten).
 *
 * Håll in en knapp för att upprepa (accelererar). Filen exporterar även `StepButton`,
 * `usePressRepeat` och `stepNumber` som NumberField återanvänder.
 */
import { useCallback, useEffect, useRef, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Minus, Plus } from 'lucide-react'
import { formatNumber } from '../../lib/format'
import { cx } from './Button'

// ---------------------------------------------------------------------------
// Hjälpare
// ---------------------------------------------------------------------------

/** Antal decimaler i ett steg: 0,25 → 2. */
export function stepDecimals(step: number): number {
  const s = String(step)
  const i = s.indexOf('.')
  return i === -1 ? 0 : s.length - i - 1
}

/** Begränsa till [min, max]. */
export function clampNumber(value: number, min?: number, max?: number): number {
  let v = value
  if (min !== undefined && v < min) v = min
  if (max !== undefined && v > max) v = max
  return v
}

/**
 * Ett steg upp eller ned som snäpper till stegrutnätet (som en inbyggd nummerkontroll):
 * 155 + steg 10 → 160, 160 + steg 10 → 170. Undviker flyttalsbrus (0,1 + 0,2).
 */
export function stepNumber(value: number | undefined, direction: 1 | -1, step = 1, min?: number, max?: number, multiplier = 1): number {
  const s = step * multiplier
  const base = value ?? min ?? 0
  const eps = 1e-9
  const next = direction > 0 ? (Math.floor(base / s + eps) + 1) * s : (Math.ceil(base / s - eps) - 1) * s
  return clampNumber(Number(next.toFixed(stepDecimals(step) + 2)), min, max)
}

/**
 * Upprepa en handling medan en knapp hålls nedtryckt: första upprepningen efter 420 ms,
 * sedan allt snabbare. Ett vanligt klick (eller Enter/mellanslag) ger exakt ett steg.
 */
export function usePressRepeat(action: () => void, disabled = false) {
  const actionRef = useRef(action)
  const timer = useRef<number | undefined>(undefined)
  const repeated = useRef(false)

  useEffect(() => {
    actionRef.current = action
  })

  const stop = useCallback(() => {
    if (timer.current !== undefined) window.clearTimeout(timer.current)
    timer.current = undefined
  }, [])

  // Sluta när knappen inaktiveras (t.ex. när max nås) och vid avmontering.
  useEffect(() => {
    if (disabled) stop()
  }, [disabled, stop])
  useEffect(() => stop, [stop])

  return {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (disabled || e.button !== 0) return
      stop()
      repeated.current = false
      let delay = 160
      const tick = () => {
        repeated.current = true
        actionRef.current()
        delay = Math.max(45, delay * 0.84)
        timer.current = window.setTimeout(tick, delay)
      }
      timer.current = window.setTimeout(tick, 420)
    },
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
    onBlur: stop,
    onClick: (e: MouseEvent) => {
      // Efter en hållning har värdet redan ändrats – klicket som följer ska inte ge ett extra steg.
      // (Klick från tangentbordet har detail 0 och räknas alltid.)
      if (repeated.current && e.detail !== 0) {
        repeated.current = false
        return
      }
      actionRef.current()
    },
    // Förhindra långtrycksmeny på mobil.
    onContextMenu: (e: MouseEvent) => e.preventDefault(),
  }
}

// ---------------------------------------------------------------------------
// StepButton
// ---------------------------------------------------------------------------

export interface StepButtonProps {
  direction: 1 | -1
  onStep: () => void
  /** Tillgänglig etikett, t.ex. "Öka portioner". */
  label: string
  disabled?: boolean
  size?: 'sm' | 'md' | 'lg'
  /** raised = vit knapp (i ett spår), soft = tonad gran, plain = ingen bakgrund. */
  variant?: 'raised' | 'soft' | 'plain'
  className?: string
}

const STEP_SIZES = {
  sm: { box: 'z-[1] size-8 after:absolute after:-inset-1.5 after:rounded-full', icon: 'size-4' },
  md: { box: 'z-[1] size-10 after:absolute after:-inset-0.5 after:rounded-full', icon: 'size-[1.125rem]' },
  lg: { box: 'size-14', icon: 'size-6' },
} as const

const STEP_VARIANTS = {
  raised: 'bg-surface text-ink shadow-card hover:bg-surface-2 dark:bg-surface-3 dark:hover:bg-line',
  soft: 'bg-gran-soft text-gran hover:bg-[color-mix(in_oklab,var(--lg-gran-soft)_82%,var(--lg-gran))]',
  plain: 'text-ink-2 hover:bg-surface-3 hover:text-ink',
} as const

/** Rund −/+-knapp med håll-för-att-upprepa. */
export function StepButton({ direction, onStep, label, disabled, size = 'md', variant = 'raised', className }: StepButtonProps) {
  const reduce = useReducedMotion()
  const handlers = usePressRepeat(onStep, disabled)
  const s = STEP_SIZES[size]
  const Icon = direction > 0 ? Plus : Minus
  return (
    <motion.button
      type="button"
      aria-label={label}
      disabled={disabled}
      {...handlers}
      whileTap={disabled || reduce ? undefined : { scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 600, damping: 30 }}
      className={cx(
        'relative grid shrink-0 select-none place-items-center rounded-full transition-[background-color,opacity] duration-150 touch-manipulation disabled:opacity-35',
        s.box,
        STEP_VARIANTS[variant],
        className,
      )}
    >
      <Icon aria-hidden className={s.icon} strokeWidth={2.4} />
    </motion.button>
  )
}

// ---------------------------------------------------------------------------
// Stepper
// ---------------------------------------------------------------------------

export interface StepperProps {
  value: number
  onChange: (value: number) => void
  /** Tillgänglig etikett för gruppen, t.ex. "Portioner". Används i knapparnas etiketter. */
  label: string
  min?: number
  max?: number
  step?: number
  /** Egen visning av värdet (standard: svenskt tal). */
  format?: (value: number) => ReactNode
  /** Enhet efter värdet, t.ex. "st". */
  unit?: string
  size?: 'sm' | 'md'
  disabled?: boolean
  className?: string
}

/**
 * ```tsx
 * <Stepper label="Portioner" value={servings} onChange={setServings} min={1} max={20} />
 * <Stepper label="Glas vatten" value={glasses} onChange={setGlasses} min={0} unit="glas" size="sm" />
 * ```
 */
export function Stepper({ value, onChange, label, min, max, step = 1, format, unit, size = 'md', disabled, className }: StepperProps) {
  const change = (dir: 1 | -1) => {
    const next = stepNumber(value, dir, step, min, max)
    if (next !== value) onChange(next)
  }
  const atMin = min !== undefined && value <= min
  const atMax = max !== undefined && value >= max
  return (
    <div
      role="group"
      aria-label={label}
      className={cx('inline-flex items-center gap-0.5 rounded-full bg-surface-2 p-1', disabled && 'opacity-50', className)}
    >
      <StepButton
        direction={-1}
        onStep={() => change(-1)}
        label={`Minska ${label.toLocaleLowerCase('sv-SE')}`}
        disabled={disabled || atMin}
        size={size === 'sm' ? 'sm' : 'md'}
      />
      <output
        aria-live="polite"
        className={cx(
          'min-w-[3.25ch] px-1.5 text-center font-semibold tabular-nums text-ink',
          size === 'sm' ? 'text-sm' : 'text-[1.0625rem]',
        )}
      >
        {format ? format(value) : formatNumber(value, stepDecimals(step))}
        {unit && <span className="ml-1 text-[0.8em] font-medium text-ink-3">{unit}</span>}
      </output>
      <StepButton
        direction={1}
        onStep={() => change(1)}
        label={`Öka ${label.toLocaleLowerCase('sv-SE')}`}
        disabled={disabled || atMax}
        size={size === 'sm' ? 'sm' : 'md'}
      />
    </div>
  )
}
