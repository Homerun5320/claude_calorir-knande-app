/**
 * Små presentationella byggstenar för Insikter: notiser, andelsstaplar, veckodagsstaplar och
 * tomma lägen. Endast designsystemets tokens.
 */
import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Link } from 'react-router-dom'
import { CalendarRange, ChevronRight, Info } from 'lucide-react'
import { Button, EmptyState } from '../../components/ui'
import { WEEKDAYS, WEEKDAYS_SHORT } from '../../lib/dates'
import type { Period } from './period'

/** Liten förklarande text med informationsikon. */
export function InfoNote({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p className={`flex gap-2 text-xs leading-relaxed text-ink-3 ${className}`}>
      <Info className="mt-px size-3.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  )
}

/** Tonad ruta med emoji och text – för iakttagelser och tips. */
export function Callout({ emoji, children, className = '' }: { emoji?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`flex items-start gap-3 rounded-2xl bg-surface-2/70 px-3.5 py-3 text-sm leading-relaxed text-ink-2 ${className}`}>
      {emoji && (
        <span className="text-lg leading-none" aria-hidden="true">
          {emoji}
        </span>
      )}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

/**
 * Namn till vänster och värde till höger i en rad ovanför en andelsstapel. Värdet hamnar under namnet
 * när de inte ryms bredvid varandra, och vid stor text (200 %) får namnet två rader i stället för "…" –
 * annars trycks namnet ihop till några få tecken eller värdet sticker utanför kortet. `min-w-24` håller
 * isär de två: smalare än så får namnet inte bli bredvid värdet.
 * `@container` + `@max-[12rem]`: rem i en containerfråga följer rotens teckenstorlek, så vid normal text
 * (raden ≈ 17 rem) är namnet en rad med "…" precis som förut.
 */
export function NameValueRow({ name, value, className = '' }: { name: ReactNode; value?: ReactNode; className?: string }) {
  return (
    <div className={`@container flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 text-sm ${className}`}>
      <span className="min-w-24 flex-1 basis-0 truncate break-words font-medium text-ink @max-[12rem]:line-clamp-2 @max-[12rem]:whitespace-normal">{name}</span>{' '}
      {value !== undefined && value !== null && value !== false && (
        <span className="ml-auto max-w-full text-right text-xs text-ink-3 tabular-nums">{value}</span>
      )}
    </div>
  )
}

/** Färgprick för teckenförklaringar. */
export function Dot({ color, className = '' }: { color: string; className?: string }) {
  return <span aria-hidden="true" className={`inline-block size-2.5 shrink-0 rounded-full ${className}`} style={{ background: color }} />
}

/** Horisontell andelsstapel (0–1). Dekorativ – värdet ska stå i text bredvid. */
export function ShareBar({ value, color = 'var(--lg-gran)', className = '' }: { value: number; color?: string; className?: string }) {
  const reduce = useReducedMotion()
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) * 100
  return (
    <div aria-hidden="true" className={`h-2 w-full overflow-hidden rounded-full bg-surface-2 ${className}`}>
      <motion.div
        className="h-full rounded-full"
        style={{ background: color }}
        initial={reduce ? false : { width: 0 }}
        animate={{ width: `${Math.max(pct, pct > 0 ? 3 : 0)}%` }}
        transition={{ type: 'spring', stiffness: 160, damping: 26 }}
      />
    </div>
  )
}

export interface ColumnDatum {
  key: string
  /** Kort etikett under stapeln. */
  label: string
  /** Etikett för skärmläsare, t.ex. "måndag: 2 100 kcal". */
  ariaLabel: string
  value?: number
  /** Text ovanför stapeln (utelämnas för att dölja siffror). */
  valueLabel?: string
  highlight?: boolean
}

/** Enkla lodräta staplar i HTML – t.ex. veckodagar, timmar eller veckor. */
export function Columns({
  data,
  height = 128,
  color = 'var(--lg-gran)',
  label,
  gap = 'gap-1.5',
  className = '',
}: {
  data: readonly ColumnDatum[]
  height?: number
  color?: string
  /** Tailwind-klass för avståndet mellan staplarna. */
  gap?: 'gap-0.5' | 'gap-1' | 'gap-1.5'
  /** Tillgänglig beskrivning av hela diagrammet. */
  label: string
  className?: string
}) {
  const reduce = useReducedMotion()
  const max = Math.max(0, ...data.map((d) => d.value ?? 0))
  const muted = `color-mix(in oklab, ${color} 38%, var(--lg-surface-2))`
  return (
    <ul role="list" aria-label={label} className={`flex items-stretch ${gap} ${className}`} style={{ height }}>
      {data.map((d, i) => {
        const pct = max > 0 && d.value !== undefined ? (d.value / max) * 100 : 0
        return (
          <li key={d.key} className="flex min-w-0 flex-1 flex-col items-center gap-1" aria-label={d.ariaLabel}>
            <span className="h-4 text-[10px] leading-4 font-medium whitespace-nowrap text-ink-3 tabular-nums" aria-hidden="true">
              {d.valueLabel ?? ''}
            </span>
            <div className="flex w-full flex-1 items-end justify-center" aria-hidden="true">
              {d.value === undefined || d.value <= 0 ? (
                <span className="mb-0.5 size-1.5 rounded-full bg-ink-3/35" />
              ) : (
                <motion.span
                  className="block w-full max-w-7 rounded-t-[7px] rounded-b-[3px]"
                  style={{ background: d.highlight ? color : muted, height: `${Math.max(pct, 4)}%`, originY: 1 }}
                  initial={reduce ? false : { scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ type: 'spring', stiffness: 220, damping: 24, delay: reduce ? 0 : Math.min(0.3, i * 0.03) }}
                />
              )}
            </div>
            <span
              className={`h-3 text-[11px] leading-3 whitespace-nowrap ${d.highlight ? 'font-semibold text-ink' : 'text-ink-3'}`}
              aria-hidden="true"
            >
              {d.label}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/** Veckodagsdata för `Columns`. */
export function weekdayColumns(
  pattern: ReadonlyArray<{ weekday: number; avg?: number; count: number }>,
  format: (v: number) => string,
  showValues: boolean,
): ColumnDatum[] {
  const known = pattern.filter((p) => p.avg !== undefined)
  const top = known.length ? known.reduce((a, b) => ((b.avg ?? 0) > (a.avg ?? 0) ? b : a)) : undefined
  return pattern.map((p) => ({
    key: String(p.weekday),
    label: WEEKDAYS_SHORT[p.weekday],
    value: p.avg,
    valueLabel: showValues && p.avg !== undefined ? format(p.avg) : undefined,
    highlight: top?.weekday === p.weekday,
    ariaLabel: `${WEEKDAYS[p.weekday]}: ${p.avg === undefined ? 'ingen data' : `${format(p.avg)} i snitt (${p.count} ${p.count === 1 ? 'dag' : 'dagar'})`}`,
  }))
}

/** Tomt läge när perioden saknar registreringar. */
export function PeriodEmpty({
  period,
  onLonger,
  onPrevious,
}: {
  period: Period
  onLonger?: () => void
  onPrevious?: () => void
}) {
  const what = period.kind === 'vecka' ? (period.isCurrent ? 'den här veckan' : 'den veckan') : period.phrase
  return (
    <div className="card p-2">
      <EmptyState
        compact
        illustration="chart"
        title={`Inget loggat ${what}`}
        text="Insikterna bygger bara på dagar du har loggat. Välj en annan period eller logga en måltid – så växer bilden fram."
        action={
          <>
            {onPrevious && (
              <Button variant="soft" size="sm" onClick={onPrevious}>
                Förra veckan
              </Button>
            )}
            {onLonger && (
              <Button variant="soft" size="sm" iconLeft={CalendarRange} onClick={onLonger}>
                Visa 90 dagar
              </Button>
            )}
            <Button variant="primary" size="sm" to="/lagg-till">
              Lägg till mat
            </Button>
          </>
        }
      />
    </div>
  )
}

/** Diskret källhänvisning längst ned i en flik. */
export function SourceNote({ children }: { children: ReactNode }) {
  return <p className="px-1 pt-1 text-[0.6875rem] leading-relaxed text-ink-3">{children}</p>
}

/** Liten textlänk i ett korts huvud (t.ex. "Vikt ›"). Tryckytan är minst 44 px. */
export function CardLink({ to, children, label }: { to: string; children: ReactNode; label?: string }) {
  return (
    <Link
      to={to}
      aria-label={label}
      className="relative inline-flex items-center gap-0.5 rounded-lg px-1 py-1 text-[0.8125rem] font-semibold text-gran transition-colors after:absolute after:-inset-2 hover:text-gran-strong"
    >
      {children}
      <ChevronRight aria-hidden="true" className="size-3.5" strokeWidth={2.6} />
    </Link>
  )
}

/** Som `CardLink` men för att byta flik. */
export function CardAction({ onClick, children, label }: { onClick: () => void; children: ReactNode; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="relative inline-flex items-center gap-0.5 rounded-lg px-1 py-1 text-[0.8125rem] font-semibold text-gran transition-colors after:absolute after:-inset-2 hover:text-gran-strong"
    >
      {children}
      <ChevronRight aria-hidden="true" className="size-3.5" strokeWidth={2.6} />
    </button>
  )
}
