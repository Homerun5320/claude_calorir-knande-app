/**
 * ProgressBar – linjär förloppsindikator (t.ex. makron, vatten, veckomål).
 *
 * Över målet visas lugnt: stapeln skalas så att målet hamnar vid en markering och
 * överskottet ritas randigt i samma ton – inget larmande rött (om inte `overTone` säger annat).
 * `target` ritar en extra markering, t.ex. ett proteinmål inom en större skala.
 */
import { useId, type CSSProperties, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { cx } from './Button'
import { toneColor, type Tone } from './Badge'

export interface ProgressBarProps {
  value: number
  /** Målet/skalan (100 %). */
  max?: number
  /** Färgton (standard gran). */
  tone?: Tone
  /** Valfri egen CSS-färg (t.ex. `var(--lg-fjall)`) – går före `tone`. */
  color?: string
  /** Ton för överskottet (standard samma som `tone`). */
  overTone?: Tone
  /** Markering vid ett delmål (samma enhet som value). */
  target?: number
  size?: 'xs' | 'sm' | 'md' | 'lg'
  /** Synlig etikett ovanför stapeln (fungerar också som tillgänglig etikett). */
  label?: ReactNode
  /** Högerställd text ovanför stapeln, t.ex. "62 / 90 g". */
  valueLabel?: ReactNode
  /** Tillgänglig etikett om ingen synlig finns. */
  'aria-label'?: string
  /** Uppläst värde, t.ex. "62 av 90 gram". */
  valueText?: string
  /** Animera fyllningen vid första visning (standard true). */
  animate?: boolean
  className?: string
}

const HEIGHTS = { xs: 'h-1', sm: 'h-1.5', md: 'h-2.5', lg: 'h-3.5' } as const

/** Diagonala ränder i en given färg. */
function stripes(color: string): CSSProperties {
  return {
    backgroundColor: `color-mix(in oklab, ${color} 55%, transparent)`,
    backgroundImage: `repeating-linear-gradient(-45deg, ${color} 0 4px, transparent 4px 8px)`,
  }
}

/**
 * ```tsx
 * <ProgressBar label="Protein" valueLabel="62 / 90 g" value={62} max={90} tone="protein" />
 * <ProgressBar value={2300} max={2000} tone="gran" aria-label="Energi" />  // lugn randig överdel
 * ```
 */
export function ProgressBar({
  value,
  max = 100,
  tone = 'gran',
  color,
  overTone,
  target,
  size = 'md',
  label,
  valueLabel,
  'aria-label': ariaLabel,
  valueText,
  animate = true,
  className,
}: ProgressBarProps) {
  const labelId = useId()
  const reduce = useReducedMotion()
  const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0
  const safeMax = max > 0 ? max : 1
  const fill = color ?? toneColor(tone)
  const overFill = overTone ? toneColor(overTone) : fill
  const over = safeValue > safeMax

  // Skalan växer när värdet (eller delmålet) passerar max, så att allt syns.
  const scale = Math.max(safeMax, safeValue, target ?? 0)
  const pct = (n: number) => `${Math.min(100, (n / scale) * 100)}%`
  const basePct = pct(Math.min(safeValue, safeMax))
  const overPct = over ? `${((safeValue - safeMax) / scale) * 100}%` : '0%'
  const transition = reduce || !animate ? { duration: 0 } : { type: 'spring' as const, stiffness: 120, damping: 22 }
  const initial = reduce || !animate ? false : { width: '0%' }

  return (
    <div className={cx('w-full', className)}>
      {(label !== undefined || valueLabel !== undefined) && (
        <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[0.8125rem]">
          {label !== undefined && (
            <span id={labelId} className="font-medium text-ink-2">
              {label}
            </span>
          )}
          {valueLabel !== undefined && <span className="ml-auto tabular-nums text-ink-3">{valueLabel}</span>}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={Math.round(safeValue * 100) / 100}
        aria-valuetext={valueText}
        aria-label={label === undefined ? ariaLabel : undefined}
        aria-labelledby={label !== undefined ? labelId : undefined}
        className={cx('relative flex w-full overflow-hidden rounded-full bg-surface-2', HEIGHTS[size])}
      >
        <motion.div
          className="h-full shrink-0"
          style={{ backgroundColor: fill, borderRadius: over ? '999px 0 0 999px' : '999px' }}
          initial={initial}
          animate={{ width: basePct }}
          transition={transition}
        />
        {over && (
          <motion.div
            data-testid="progress-over"
            className="h-full shrink-0 rounded-r-full"
            style={{ ...stripes(overFill), boxShadow: `inset 2px 0 0 0 var(--lg-surface)` }}
            initial={initial}
            animate={{ width: overPct }}
            transition={{ ...transition, delay: reduce || !animate ? 0 : 0.15 }}
          />
        )}
        {target !== undefined && target > 0 && target <= scale && (
          <span
            aria-hidden
            className="absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full bg-ink/45 ring-1 ring-surface/70"
            style={{ left: pct(target) }}
          />
        )}
      </div>
    </div>
  )
}
