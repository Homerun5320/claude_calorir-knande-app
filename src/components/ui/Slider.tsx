/**
 * Slider – stylad inbyggd range-kontroll (full tangentbords- och skärmläsarsupport)
 * med värdebubbla ovanför tummen, valfria markeringar och tonad fyllning.
 */
import { useId, useState, type CSSProperties, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { formatNumber } from '../../lib/format'
import { cx } from './Button'
import { toneVars, type Tone } from './Badge'
import { stepDecimals } from './Stepper'

export interface SliderMark {
  value: number
  label?: string
}

export interface SliderProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  label?: ReactNode
  labelHidden?: boolean
  'aria-label'?: string
  hint?: ReactNode
  /** Formatera värdet för bubblan, etikettraden och skärmläsare, t.ex. v => `${v} %`. */
  formatValue?: (value: number) => string
  /** Visa formaterat värde till höger om etiketten. */
  showValue?: boolean
  /** När bubblan visas: under interaktion (standard), alltid eller aldrig. */
  bubble?: 'active' | 'always' | 'never'
  /** Markeringar under spåret, t.ex. rekommenderat tempo. */
  marks?: ReadonlyArray<SliderMark>
  tone?: Tone
  disabled?: boolean
  id?: string
  name?: string
  className?: string
}

/** Tummens diameter i px – används för att placera bubbla och fyllning exakt. */
const THUMB = 28

/** Position för ett värde längs spåret, kompenserad för tummens bredd. */
function positionFor(pct: number): string {
  return `calc(${pct}% + ${(0.5 - pct / 100) * THUMB}px)`
}

const INPUT_CLASS = cx(
  'relative z-10 h-11 w-full cursor-pointer appearance-none bg-transparent outline-none focus-visible:outline-none disabled:cursor-not-allowed',
  // WebKit/Blink
  '[&::-webkit-slider-runnable-track]:h-11 [&::-webkit-slider-runnable-track]:bg-transparent',
  '[&::-webkit-slider-thumb]:mt-2 [&::-webkit-slider-thumb]:size-7 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full',
  '[&::-webkit-slider-thumb]:bg-surface [&::-webkit-slider-thumb]:shadow-[0_0_0_3px_var(--tone),0_3px_10px_-2px_var(--lg-shadow-c)]',
  '[&::-webkit-slider-thumb]:transition-transform [&:active::-webkit-slider-thumb]:scale-110',
  '[&:focus-visible::-webkit-slider-thumb]:shadow-[0_0_0_3px_var(--tone),0_0_0_7px_color-mix(in_oklab,var(--tone)_30%,transparent)]',
  // Firefox
  '[&::-moz-range-track]:bg-transparent',
  '[&::-moz-range-thumb]:size-7 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-surface',
  '[&::-moz-range-thumb]:shadow-[0_0_0_3px_var(--tone),0_3px_10px_-2px_var(--lg-shadow-c)]',
  '[&:focus-visible::-moz-range-thumb]:shadow-[0_0_0_3px_var(--tone),0_0_0_7px_color-mix(in_oklab,var(--tone)_30%,transparent)]',
)

/**
 * ```tsx
 * <Slider label="Tempo" value={rate} onChange={setRate} min={0.1} max={1} step={0.05}
 *   formatValue={(v) => `${formatNumber(v, 2)} kg/vecka`} showValue marks={[{ value: 0.5, label: 'Lagom' }]} />
 * ```
 */
export function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  labelHidden,
  'aria-label': ariaLabel,
  hint,
  formatValue,
  showValue,
  bubble = 'active',
  marks,
  tone = 'gran',
  disabled,
  id: idProp,
  name,
  className,
}: SliderProps) {
  const autoId = useId()
  const id = idProp ?? autoId
  const reduce = useReducedMotion()
  const [active, setActive] = useState(false)
  const range = max - min || 1
  const clamped = Math.min(max, Math.max(min, value))
  const pct = ((clamped - min) / range) * 100
  const format = formatValue ?? ((v: number) => formatNumber(v, stepDecimals(step)))
  const text = format(clamped)
  const showBubble = bubble === 'always' || (bubble === 'active' && active)

  return (
    <div className={cx('w-full', disabled && 'opacity-50', className)} style={toneVars(tone)}>
      {(label !== undefined || showValue) && (
        <div className={cx('mb-1 flex items-baseline justify-between gap-3', labelHidden && 'sr-only')}>
          {label !== undefined && (
            <label htmlFor={id} className="text-sm font-medium text-ink-2">
              {label}
            </label>
          )}
          {showValue && (
            <span aria-hidden className="ml-auto font-display text-lg font-semibold tabular-nums text-ink">
              {text}
            </span>
          )}
        </div>
      )}

      {/* Reservera plats för bubblan så att inget hoppar när den visas. */}
      <div className={cx('relative', bubble !== 'never' && 'pt-6')}>
        {/* Spår och fyllning (dekorativa – själva kontrollen ligger ovanpå). */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 flex h-11 items-center">
          <div className="relative h-2 w-full rounded-full bg-surface-3">
            <div className="absolute inset-y-0 left-0 rounded-full bg-(--tone)" style={{ width: positionFor(pct) }} />
            {marks?.map((m) => {
              const mp = ((Math.min(max, Math.max(min, m.value)) - min) / range) * 100
              return (
                <span
                  key={m.value}
                  className={cx('absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full', m.value <= clamped ? 'bg-surface/80' : 'bg-ink-3/50')}
                  style={{ left: positionFor(mp) }}
                />
              )
            })}
          </div>
        </div>

        <AnimatePresence>
          {showBubble && (
            <motion.div
              aria-hidden
              key="bubble"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.85 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 600, damping: 34 }}
              className="pointer-events-none absolute top-0 z-20 -translate-x-1/2"
              style={{ left: positionFor(pct) } as CSSProperties}
            >
              <div className="relative whitespace-nowrap rounded-lg bg-ink px-2 py-1 text-xs font-semibold tabular-nums text-bg shadow-float">
                {text}
                <span className="absolute left-1/2 top-full size-2 -translate-x-1/2 -translate-y-1 rotate-45 rounded-[2px] bg-ink" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <input
          id={id}
          name={name}
          type="range"
          min={min}
          max={max}
          step={step}
          value={clamped}
          disabled={disabled}
          aria-label={label === undefined ? ariaLabel : undefined}
          aria-valuetext={text}
          aria-describedby={hint !== undefined ? `${id}-hint` : undefined}
          onChange={(e) => onChange(Number(e.target.value))}
          onPointerDown={() => setActive(true)}
          onPointerUp={() => setActive(false)}
          onPointerCancel={() => setActive(false)}
          onFocus={() => setActive(true)}
          onBlur={() => setActive(false)}
          className={INPUT_CLASS}
        />
      </div>

      {marks?.some((m) => m.label) && (
        <div aria-hidden className="relative mt-1 h-4 text-[0.6875rem] font-medium text-ink-3">
          {marks.map(
            (m) =>
              m.label && (
                <span
                  key={m.value}
                  className="absolute -translate-x-1/2 whitespace-nowrap"
                  style={{ left: positionFor(((Math.min(max, Math.max(min, m.value)) - min) / range) * 100) }}
                >
                  {m.label}
                </span>
              ),
          )}
        </div>
      )}
      {hint !== undefined && (
        <p id={`${id}-hint`} className="mt-1.5 text-[0.8125rem] leading-snug text-ink-3">
          {hint}
        </p>
      )}
    </div>
  )
}
