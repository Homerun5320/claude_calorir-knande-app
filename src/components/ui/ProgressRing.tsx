/**
 * ProgressRing – cirkulär förloppsindikator med rundade ändar (t.ex. dagens energi).
 *
 * Över 100 % ritas ett andra, mörkare varv ovanpå det första – samma ton, bara djupare –
 * så att överskottet syns utan att kännas som en varning.
 */
import { useId, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { cx } from './Button'
import { toneColor, type Tone } from './Badge'

export interface ProgressRingProps {
  value: number
  max?: number
  /** Diameter i px (standard 132). */
  size?: number
  /** Linjetjocklek i px (standard 12). */
  thickness?: number
  tone?: Tone
  /** Egen CSS-färg för bågen – går före `tone`. */
  color?: string
  /** Färg på spåret (standard: ytfärg 2). */
  trackColor?: string
  /** Ton för överskottsvarvet (standard: tonen blandad med bläck). */
  overTone?: Tone
  /** Innehåll i mitten, t.ex. kvarvarande kcal. */
  children?: ReactNode
  'aria-label'?: string
  /** Uppläst värde, t.ex. "1 450 av 2 100 kcal". */
  valueText?: string
  /** Animera vid första visning (standard true). */
  animate?: boolean
  className?: string
}

/**
 * ```tsx
 * <ProgressRing value={eaten} max={target} tone="gran" aria-label="Energi idag" valueText="1 450 av 2 100 kcal">
 *   <span className="display-num text-3xl">650</span><span className="eyebrow">kvar</span>
 * </ProgressRing>
 * ```
 */
export function ProgressRing({
  value,
  max = 100,
  size = 132,
  thickness = 12,
  tone = 'gran',
  color,
  trackColor = 'var(--lg-surface-2)',
  overTone,
  children,
  'aria-label': ariaLabel,
  valueText,
  animate = true,
  className,
}: ProgressRingProps) {
  const reduce = useReducedMotion()
  // useId kan innehålla tecken som inte fungerar i url(#…) – behåll bara säkra tecken.
  const gradId = `ring-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const safeMax = max > 0 ? max : 1
  const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0
  const ratio = safeValue / safeMax
  const main = Math.min(1, ratio)
  // Överskott ritas som ett andra varv (högst ett helt till).
  const extra = Math.min(1, Math.max(0, ratio - 1))

  const stroke = color ?? toneColor(tone)
  const overStroke = overTone ? toneColor(overTone) : `color-mix(in oklab, ${stroke} 62%, var(--lg-ink))`
  const r = (size - thickness) / 2
  const c = size / 2
  const instant = reduce || !animate
  const transition = instant ? { duration: 0 } : { type: 'spring' as const, stiffness: 60, damping: 16, mass: 0.9 }

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={Math.round(safeValue * 100) / 100}
      aria-valuetext={valueText}
      aria-label={ariaLabel}
      className={cx('relative inline-grid shrink-0 place-items-center', className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90" aria-hidden>
        <defs>
          {/* Svag ljusning längs bågen för djup – samma ton, inga nya färger. */}
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" style={{ stopColor: stroke }} />
            <stop offset="100%" style={{ stopColor: `color-mix(in oklab, ${stroke} 80%, var(--lg-surface))` }} />
          </linearGradient>
        </defs>
        <circle cx={c} cy={c} r={r} fill="none" style={{ stroke: trackColor }} strokeWidth={thickness} />
        <motion.circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={thickness}
          strokeLinecap="round"
          initial={instant ? false : { pathLength: 0 }}
          animate={{ pathLength: main, opacity: main > 0 ? 1 : 0 }}
          transition={transition}
        />
        {extra > 0 && (
          <motion.circle
            data-testid="ring-over"
            cx={c}
            cy={c}
            r={r}
            fill="none"
            style={{ stroke: overStroke }}
            strokeWidth={thickness}
            strokeLinecap="round"
            initial={instant ? false : { pathLength: 0 }}
            animate={{ pathLength: extra }}
            transition={instant ? transition : { ...transition, delay: 0.35 }}
          />
        )}
      </svg>
      {children !== undefined && <div className="relative flex flex-col items-center justify-center text-center">{children}</div>}
    </div>
  )
}
