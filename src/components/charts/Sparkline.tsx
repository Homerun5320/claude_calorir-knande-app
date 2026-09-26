/**
 * Liten trendlinje utan axlar – för statistikrutor och listor ("Vikt senaste 30 dagarna").
 * Luckor (`null`/`undefined`) bryter linjen i stället för att dra en rak linje över dem.
 */
import { useId } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { areaPath, extent, linearScale, monotonePath, type Point } from './chartUtils'

export interface SparklineProps {
  values: ReadonlyArray<number | null | undefined>
  /** Bredd i pixlar. Standard 96. */
  width?: number
  /** Höjd i pixlar. Standard 28. */
  height?: number
  /** CSS-färg, helst token. Standard `var(--lg-gran)`. */
  color?: string
  /** Tonad yta under linjen. Standard true. */
  area?: boolean
  /** Prick på sista värdet. Standard true. */
  endDot?: boolean
  strokeWidth?: number
  /** Lås y-domänen (annars min–max av värdena). */
  domain?: readonly [number, number]
  /** Horisontell referenslinje, t.ex. målet. */
  reference?: number
  /** Beskrivning för skärmläsare. Utan den räknas linjen som dekoration. */
  ariaLabel?: string
  className?: string
}

export function Sparkline({
  values,
  width = 96,
  height = 28,
  color = 'var(--lg-gran)',
  area = true,
  endDot = true,
  strokeWidth = 2,
  domain,
  reference,
  ariaLabel,
  className = '',
}: SparklineProps) {
  const reduced = useReducedMotion() ?? false
  const gradId = `sp-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const pad = endDot ? 4 : Math.ceil(strokeWidth)
  const ext = extent([...values, ...(reference !== undefined ? [reference] : [])])
  const [lo, hi] = domain ?? ext ?? [0, 1]
  const xs = linearScale([0, Math.max(1, values.length - 1)], [pad, width - pad])
  const ys = linearScale([lo, hi === lo ? lo + 1 : hi], [height - pad, pad])

  // Dela upp i sammanhängande delar vid luckor.
  const runs: Point[][] = []
  let run: Point[] = []
  values.forEach((v, i) => {
    if (v === null || v === undefined || !Number.isFinite(v)) {
      if (run.length) runs.push(run)
      run = []
      return
    }
    run.push({ x: values.length === 1 ? width / 2 : xs(i), y: hi === lo && !domain ? height / 2 : ys(v) })
  })
  if (run.length) runs.push(run)
  const last = runs.length ? runs[runs.length - 1][runs[runs.length - 1].length - 1] : undefined

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={`block overflow-visible ${className}`}
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
    >
      {area && (
        <defs>
          <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.24} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
      )}
      {reference !== undefined && Number.isFinite(reference) && (
        <line
          x1={0}
          x2={width}
          y1={ys(reference)}
          y2={ys(reference)}
          stroke="var(--lg-ink-3)"
          strokeOpacity={0.5}
          strokeDasharray="2 3"
          strokeWidth={1}
        />
      )}
      {area &&
        runs
          .filter((r) => r.length > 1)
          .map((r, i) => (
            <motion.path
              key={`a${i}`}
              d={areaPath(r, height)}
              fill={`url(#${gradId})`}
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            />
          ))}
      {runs
        .filter((r) => r.length > 1)
        .map((r, i) => (
          <motion.path
            key={`l${i}`}
            d={monotonePath(r)}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={reduced ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          />
        ))}
      {/* Ensamma punkter syns som prickar */}
      {runs
        .filter((r) => r.length === 1 && r[0] !== last)
        .map((r, i) => (
          <circle key={`p${i}`} cx={r[0].x} cy={r[0].y} r={strokeWidth} fill={color} />
        ))}
      {endDot && last && (
        <motion.circle
          cx={last.x}
          cy={last.y}
          r={3}
          fill={color}
          stroke="var(--lg-surface)"
          strokeWidth={2}
          initial={reduced ? false : { scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20, delay: 0.55 }}
        />
      )}
    </svg>
  )
}
