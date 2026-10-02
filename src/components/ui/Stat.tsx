/**
 * Stat – nyckeltal: liten etikett, stort värde i Fraunces, enhet, undertext och valfri trend.
 *
 * Trenden färgas bara som "bra" (mossa) när riktningen är den önskade – annars neutralt grå.
 * Aldrig rött: en vecka över målet är inget misslyckande.
 */
import type { ReactNode } from 'react'
import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react'
import { cx } from './Button'
import { toneTextColor, type Tone } from './Badge'

export interface StatTrend {
  direction: 'up' | 'down' | 'flat'
  /** Text efter pilen, t.ex. "−0,4 kg". */
  label?: ReactNode
  /** Vilken riktning som är önskad. Utelämna för helt neutral färg. */
  good?: 'up' | 'down'
}

export interface StatProps {
  /** Liten etikett i versaler. */
  label: ReactNode
  value: ReactNode
  /** Enhet efter värdet, t.ex. "kcal". */
  unit?: ReactNode
  /** Undertext, t.ex. "av 2 100 kcal". */
  sublabel?: ReactNode
  trend?: StatTrend
  size?: 'sm' | 'md' | 'lg'
  align?: 'start' | 'center'
  /** Färgar värdet med en ton (t.ex. protein). */
  tone?: Tone
  /** Liten ikon eller färgprick före etiketten. */
  icon?: ReactNode
  className?: string
}

const VALUE_SIZES = { sm: 'text-2xl', md: 'text-[2rem]', lg: 'text-[2.75rem]' } as const

const TREND_ICONS = { up: ArrowUpRight, down: ArrowDownRight, flat: ArrowRight } as const
const TREND_WORDS = { up: 'upp', down: 'ned', flat: 'oförändrat' } as const

/**
 * ```tsx
 * <Stat label="Snitt per dag" value="1 980" unit="kcal" sublabel="senaste 7 dagarna"
 *   trend={{ direction: 'down', label: '−120', good: 'down' }} />
 * ```
 */
export function Stat({ label, value, unit, sublabel, trend, size = 'md', align = 'start', tone, icon, className }: StatProps) {
  const TrendIcon = trend ? TREND_ICONS[trend.direction] : null
  const trendGood = trend?.good !== undefined && trend.direction === trend.good
  return (
    <div className={cx('flex min-w-0 flex-col', align === 'center' && 'items-center text-center', className)}>
      <div className="eyebrow flex items-center gap-1.5">
        {icon}
        {/* Radbryts i stället för att kortas med "…" – etiketten ska gå att läsa vid stor text (WCAG 1.4.4). */}
        <span className="min-w-0 break-words">{label}</span>
      </div>
      <div className={cx('mt-1 flex items-baseline gap-1', align === 'center' && 'justify-center')}>
        <span
          className={cx('display-num font-medium leading-none', VALUE_SIZES[size], !tone && 'text-ink')}
          style={tone ? { color: toneTextColor(tone) } : undefined}
        >
          {value}
        </span>
        {/* Mellanslaget syns inte i flexlayouten, men skärmläsare och kopiering får "2,4 kg" i stället för "2,4kg". */}
        {unit !== undefined && ' '}
        {unit !== undefined && <span className="text-sm font-medium text-ink-3">{unit}</span>}
      </div>
      {(sublabel !== undefined || trend !== undefined) && (
        <div className={cx('mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.8125rem] text-ink-3', align === 'center' && 'justify-center')}>
          {trend && TrendIcon && (
            <span
              className={cx(
                'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold tabular-nums',
                trendGood ? 'bg-mossa-soft text-good' : 'bg-surface-2 text-ink-2',
              )}
            >
              <TrendIcon aria-hidden className="size-3.5" strokeWidth={2.5} />
              <span className="sr-only">{TREND_WORDS[trend.direction]}</span>
              {trend.label}
            </span>
          )}
          {sublabel !== undefined && <span>{sublabel}</span>}
        </div>
      )}
    </div>
  )
}
