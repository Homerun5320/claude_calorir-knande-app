/**
 * Munkdiagram (ring) – t.ex. energifördelning mellan protein, kolhydrater och fett,
 * eller en förloppsring med `total` (resten av ringen visas som spår).
 *
 * Segmenten ritas som bågar med rundade ändar och en jämn luft mellan sig. Mitten är en fri yta
 * (`children`) – när användaren pekar på ett segment eller en rad i teckenförklaringen visas
 * segmentets värde och andel där i stället.
 */
import { useId, useMemo, useState, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { formatNumber, formatPercent } from '../../lib/format'
import { arcPath, polarToCartesian } from './chartUtils'

export interface DonutSegment {
  key: string
  /** Svensk etikett, t.ex. "Protein". */
  label: string
  value: number
  /** CSS-färg, helst token: `var(--lg-lingon)`. */
  color: string
}

export interface DonutChartProps {
  segments: readonly DonutSegment[]
  /** Diameter i pixlar. Standard 168. */
  size?: number
  /** Ringens tjocklek. Standard 16. */
  thickness?: number
  /** Luft mellan segment i pixlar. Standard 3. */
  gap?: number
  /** Om större än summan blir resten av ringen ett tomt spår (förloppsring). */
  total?: number
  /** Innehåll i mitten, t.ex. en stor siffra. */
  children?: ReactNode
  unit?: string
  formatValue?: (value: number) => string
  /** Teckenförklaring. Standard: 'bottom' vid två eller fler segment, annars 'none'. */
  legend?: 'bottom' | 'right' | 'none'
  /** Visa procentandel i teckenförklaringen. Standard true. */
  showPercent?: boolean
  title?: string
  summary?: string
  className?: string
}

export function DonutChart({
  segments,
  size = 168,
  thickness = 16,
  gap = 3,
  total,
  children,
  unit,
  formatValue,
  legend,
  showPercent = true,
  title = 'Fördelning',
  summary,
  className = '',
}: DonutChartProps) {
  const reduced = useReducedMotion() ?? false
  const [active, setActive] = useState<string | null>(null)
  const legendId = `dc-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`

  const fmt = useMemo(
    () => formatValue ?? ((v: number) => `${formatNumber(v, Math.abs(v) >= 100 ? 0 : 1)}${unit ? `\u00a0${unit}` : ''}`),
    [formatValue, unit],
  )

  const r = (size - thickness) / 2
  const c = size / 2
  const positive = segments.filter((s) => Number.isFinite(s.value) && s.value > 0)
  const sum = positive.reduce((a, s) => a + s.value, 0)
  const denom = Math.max(sum, total ?? 0)
  const full = positive.length === 1 && sum >= denom
  // Rundade ändar sticker ut en halv tjocklek – kompensera så att luften blir exakt `gap` pixlar.
  const capAngle = full ? 0 : (thickness / 2 + gap / 2) / r

  let angle = 0
  const arcs = positive.map((s) => {
    const sweep = denom > 0 ? (s.value / denom) * Math.PI * 2 : 0
    const start = angle
    angle += sweep
    return { s, start, end: angle, sweep, share: sum > 0 ? s.value / sum : 0 }
  })

  const legendMode = legend ?? (segments.length >= 2 ? 'bottom' : 'none')
  const activeArc = arcs.find((a) => a.s.key === active)
  const shareOf = (s: DonutSegment) => (sum > 0 && s.value > 0 ? (s.value / sum) * 100 : 0)

  const autoSummary =
    summary ??
    (sum > 0
      ? `${title}: ${segments.map((s) => `${s.label} ${fmt(Math.max(0, s.value))} (${formatPercent(shareOf(s))})`).join(', ')}.`
      : `${title}: ingen data ännu.`)

  const ring = (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={autoSummary}
        className="block overflow-visible"
      >
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--lg-surface-2)" strokeWidth={thickness} />
        {arcs.map((a, i) => {
          const dimmed = active !== null && active !== a.s.key
          const width = active === a.s.key ? thickness + 3 : thickness
          const drawStart = a.start + capAngle
          const drawEnd = a.end - capAngle
          const common = {
            onPointerEnter: () => setActive(a.s.key),
            onPointerLeave: () => setActive(null),
            onPointerDown: () => setActive((k) => (k === a.s.key ? null : a.s.key)),
            style: { transition: 'opacity 160ms ease, stroke-width 160ms ease' },
          }
          if (!full && drawEnd - drawStart <= 0.001) {
            // För litet för en båge – visa en prick så att segmentet ändå syns.
            const p = polarToCartesian(c, c, r, a.start + a.sweep / 2)
            return (
              <motion.circle
                key={a.s.key}
                cx={p.x}
                cy={p.y}
                r={width / 2}
                fill={a.s.color}
                initial={reduced ? false : { opacity: 0 }}
                animate={{ opacity: dimmed ? 0.35 : 1 }}
                transition={{ duration: 0.4, delay: 0.1 + i * 0.12 }}
                {...common}
              />
            )
          }
          return (
            <motion.path
              key={a.s.key}
              d={full ? arcPath(c, c, r, 0, Math.PI * 2) : arcPath(c, c, r, drawStart, drawEnd)}
              fill="none"
              stroke={a.s.color}
              strokeWidth={width}
              strokeLinecap={full ? 'butt' : 'round'}
              opacity={dimmed ? 0.35 : 1}
              initial={reduced ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.7, delay: 0.1 + i * 0.12, ease: [0.22, 1, 0.36, 1] }}
              {...common}
            />
          )
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center" aria-hidden={activeArc ? true : undefined}>
        {activeArc ? (
          <div className="px-3">
            <div className="eyebrow">{activeArc.s.label}</div>
            <div className="font-display text-xl font-semibold leading-tight text-ink tabular-nums">{fmt(activeArc.s.value)}</div>
            <div className="text-xs text-ink-3 tabular-nums">{formatPercent(activeArc.share * 100)}</div>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  )

  if (legendMode === 'none') return <div className={className}>{ring}</div>

  return (
    <div className={`flex ${legendMode === 'right' ? 'flex-row items-center gap-5' : 'flex-col items-center gap-4'} ${className}`}>
      {ring}
      <ul
        id={legendId}
        className={`text-sm ${legendMode === 'right' ? 'min-w-0 flex-1 space-y-2' : 'grid w-full grid-cols-1 gap-1.5 sm:grid-cols-2'}`}
      >
        {segments.map((s) => (
          <li
            key={s.key}
            className={`flex items-center gap-2.5 rounded-xl px-2 py-1 transition-colors ${active === s.key ? 'bg-surface-2' : ''}`}
            onPointerEnter={() => setActive(s.key)}
            onPointerLeave={() => setActive(null)}
          >
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: s.color }} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-ink-2">{s.label}</span>
            <span className="font-semibold text-ink tabular-nums">{fmt(Math.max(0, s.value))}</span>
            {showPercent && <span className="w-11 text-right text-xs text-ink-3 tabular-nums">{formatPercent(shareOf(s))}</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}
