/**
 * Stapeldiagram per dag – t.ex. intag (kcal) mot mål för veckan, eller staplade makron.
 *
 * - En stapel per dag med rundad topp och rak bas. Idag (eller `highlight`) betonas.
 * - Valfri horisontell mållinje (`target`) och/eller ett eget mål per dag (`BarDatum.target`),
 *   t.ex. när träning höjer dagens budget.
 * - Staplat läge via `stack` (t.ex. protein/kolhydrater/fett i kcal) med 2 px luft mellan segmenten.
 * - Veckodagsetiketter (mån–sön) för en vecka, dagnummer för längre perioder.
 * - Tooltip vid pekare/fokus, piltangenter, dold tabell för skärmläsare.
 *
 * Tonen är neutral: dagar över målet färgas inte rött – mållinjen räcker som referens.
 */
import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import type { ISODate } from '../../types'
import { formatDayLong, formatDayShort, fromISODate, WEEKDAYS_SHORT, weekdayIndex } from '../../lib/dates'
import { formatNumber } from '../../lib/format'
import {
  approxTextWidth,
  bandLayout,
  decimalsForStep,
  formatTicks,
  linearScale,
  niceTicks,
  roundedBarPath,
  TOOLTIP_CLASS,
  tooltipPlacement,
  useElementWidth,
  useMeasuredSize,
} from './chartUtils'

export interface BarDatum {
  date: ISODate
  /** Värde för enkla staplar. `undefined` = ingen data den dagen. */
  value?: number
  /** Värden per segment i staplat läge (nycklar enligt `stack`). */
  segments?: Partial<Record<string, number>>
  /** Dagens eget mål (t.ex. budget inklusive träning) – ritas som ett streck över stapeln. */
  target?: number
}

export interface BarStackKey {
  key: string
  /** Svensk etikett, t.ex. "Protein". */
  label: string
  /** CSS-färg, helst token: `var(--lg-lingon)`. */
  color: string
}

export type BarLabelMode = 'auto' | 'weekday' | 'day' | ((date: ISODate, index: number) => string)

export interface BarChartProps {
  data: readonly BarDatum[]
  /** Staplat läge: segmentens ordning nerifrån och upp. */
  stack?: readonly BarStackKey[]
  /** Gemensamt mål – horisontell streckad linje. */
  target?: number
  /** Etikett för målet i tooltip och teckenförklaring. Standard "Mål". */
  targetLabel?: string
  /** Dagen som betonas (oftast idag). */
  highlight?: ISODate
  /** Vald dag (t.ex. öppen i dagboken) – får en markering under stapeln. */
  selected?: ISODate
  onSelect?: (date: ISODate) => void
  /** Stapelfärg i enkelt läge. Standard `var(--lg-gran)`. */
  color?: string
  /** Tona ned andra staplar än den betonade (enkelt läge). Standard true. */
  dimOthers?: boolean
  /** Visa värdet ovanför den betonade stapeln (Fraunces). Standard true. */
  valueLabel?: boolean
  height?: number
  unit?: string
  formatValue?: (value: number) => string
  labels?: BarLabelMode
  yTickCount?: number
  title?: string
  summary?: string
  /** Teckenförklaring. Standard: visas i staplat läge eller när det finns ett mål. */
  legend?: boolean
  emptyText?: string
  className?: string
}

const GAP = 2
const NO_STACK: readonly BarStackKey[] = []
const MARGIN = { top: 24, bottom: 30, left: 4 }

export function BarChart({
  data,
  stack,
  target,
  targetLabel = 'Mål',
  highlight,
  selected,
  onSelect,
  color = 'var(--lg-gran)',
  dimOthers = true,
  valueLabel = true,
  height = 200,
  unit,
  formatValue,
  labels = 'auto',
  yTickCount = 3,
  title = 'Stapeldiagram',
  summary,
  legend,
  emptyText = 'Ingen data ännu',
  className = '',
}: BarChartProps) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const reduced = useReducedMotion() ?? false
  const [active, setActive] = useState<number | null>(null)
  const [viaKeyboard, setViaKeyboard] = useState(false)
  const [tooltipRef, tooltipSize] = useMeasuredSize<HTMLDivElement>()

  const fmt = useMemo(
    () => formatValue ?? ((v: number) => `${formatNumber(v, Math.abs(v) >= 100 ? 0 : 1)}${unit ? `\u00a0${unit}` : ''}`),
    [formatValue, unit],
  )

  // Summor per dag (staplat läge summerar segmenten).
  const totals = useMemo(
    () =>
      data.map((d) => {
        if (stack && stack.length > 0) {
          const vals = stack.map((s) => d.segments?.[s.key]).filter((v): v is number => v !== undefined && Number.isFinite(v))
          return vals.length ? vals.reduce((a, b) => a + Math.max(0, b), 0) : undefined
        }
        return d.value !== undefined && Number.isFinite(d.value) ? Math.max(0, d.value) : undefined
      }),
    [data, stack],
  )

  const ticks = useMemo(() => {
    const candidates = [...totals, target, ...data.map((d) => d.target)].filter((v): v is number => v !== undefined && Number.isFinite(v))
    const max = candidates.length ? Math.max(...candidates) : 0
    return niceTicks(0, max > 0 ? max : 1, yTickCount)
  }, [totals, target, data, yTickCount])

  const hasAny = totals.some((t) => t !== undefined)
  const keys = stack ?? NO_STACK
  const stacked = keys.length > 0
  const hasTargets = target !== undefined || data.some((d) => d.target !== undefined)

  // --- Layout --------------------------------------------------------------
  const tickLabels = formatTicks(ticks)
  const targetText = target !== undefined && Number.isFinite(target) ? targetLabelFor(target, ticks) : undefined
  // Axeletiketterna och mållinjens etikett ligger i högermarginalen – den får plats med båda.
  const gutter = Math.max(30, Math.max(...[...tickLabels, targetText ?? ''].map((l) => approxTextWidth(l))) + 14)
  const left = MARGIN.left
  const right = Math.max(left + 40, width - gutter)
  const top = MARGIN.top
  const bottom = Math.max(top + 40, height - MARGIN.bottom)
  const ys = linearScale([0, ticks[ticks.length - 1] ?? 1], [bottom, top])
  const n = data.length
  const band = bandLayout(n, right - left, {
    offset: left,
    maxBandwidth: n <= 10 ? 26 : n <= 20 ? 16 : 10,
    paddingInner: n <= 10 ? 0.4 : 0.3,
  })
  const radius = Math.min(7, band.bandwidth / 2)

  const highlightIndex = highlight ? data.findIndex((d) => d.date === highlight) : -1
  const emphasized = active ?? (highlightIndex >= 0 ? highlightIndex : null)
  const dim = (i: number) => {
    if (emphasized === null) return false
    if (active !== null) return i !== active
    return !stacked && dimOthers && i !== emphasized
  }

  // --- Etiketter på x-axeln ------------------------------------------------
  const mode: BarLabelMode = labels === 'auto' ? (n <= 10 ? 'weekday' : 'day') : labels
  const labelFor = (d: ISODate, i: number) => {
    if (typeof mode === 'function') return mode(d, i)
    if (mode === 'weekday') return WEEKDAYS_SHORT[weekdayIndex(d)]
    return String(fromISODate(d).getDate())
  }
  const every = mode === 'day' ? Math.max(1, Math.ceil(26 / Math.max(1, band.step))) : 1
  const showLabel = (i: number) => i === highlightIndex || (every === 1 ? true : (n - 1 - i) % every === 0)

  // --- Tooltip -----------------------------------------------------------------
  const activeDatum = active !== null ? data[active] : undefined
  const activeTotal = active !== null ? totals[active] : undefined
  const activeTarget = activeDatum?.target ?? target
  const diffText = (() => {
    if (activeTotal === undefined || activeTarget === undefined || activeTarget <= 0) return null
    const diff = activeTotal - activeTarget
    if (Math.abs(diff) < activeTarget * 0.01) return 'Precis på målet'
    return diff < 0 ? `${fmt(-diff)} under målet` : `${fmt(diff)} över målet`
  })()
  const readout =
    activeDatum !== undefined
      ? `${formatDayLong(activeDatum.date)}: ${activeTotal === undefined ? 'ingen data' : fmt(activeTotal)}${
          activeTarget !== undefined ? `, ${targetLabel.toLowerCase()} ${fmt(activeTarget)}` : ''
        }${diffText ? `, ${diffText.toLowerCase()}` : ''}`
      : ''

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (n === 0) return
    let next: number | null = null
    const start = active ?? (highlightIndex >= 0 ? highlightIndex : n - 1)
    if (e.key === 'ArrowRight') next = active === null ? start : Math.min(n - 1, active + 1)
    else if (e.key === 'ArrowLeft') next = active === null ? start : Math.max(0, active - 1)
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = n - 1
    else if (e.key === 'Escape') {
      setActive(null)
      return
    } else if ((e.key === 'Enter' || e.key === ' ') && active !== null && onSelect) {
      e.preventDefault()
      onSelect(data[active].date)
      return
    }
    if (next !== null) {
      e.preventDefault()
      setActive(next)
      setViaKeyboard(true)
    }
  }

  const autoSummary = (() => {
    if (summary) return summary
    const known = totals.map((t, i) => ({ t, d: data[i] })).filter((x): x is { t: number; d: BarDatum } => x.t !== undefined)
    if (known.length === 0) return `${title}: ${emptyText}`
    const avg = known.reduce((s, x) => s + x.t, 0) / known.length
    const top1 = known.reduce((a, b) => (b.t > a.t ? b : a))
    return `${title}. ${known.length} av ${n} dagar har data. Snitt ${fmt(avg)}, högst ${fmt(top1.t)} (${formatDayShort(top1.d.date)}).${
      target !== undefined ? ` ${targetLabel} ${fmt(target)}.` : ''
    }`
  })()

  const showLegend = legend ?? (stacked || target !== undefined)

  if (n === 0 || !hasAny) {
    return (
      <div
        ref={ref}
        className={`grid place-items-center rounded-2xl bg-surface-2/60 text-sm text-ink-3 ${className}`}
        style={{ height }}
        role="img"
        aria-label={`${title}: ${emptyText}`}
      >
        {emptyText}
      </div>
    )
  }

  const targetY = target !== undefined && Number.isFinite(target) ? ys(target) : null
  const place = active !== null ? tooltipPlacement(band.center(active), width) : null
  const activeTop = active !== null && activeTotal !== undefined ? ys(activeTotal) : bottom
  const estHeight = tooltipSize?.height ?? 56 + (stacked ? keys.length * 20 : 0) + (activeTarget !== undefined ? 36 : 0)
  // Får tooltipen inte plats ovanför stapeln läggs den bredvid, så att stapeln syns.
  const roomAbove = activeTop - estHeight - 12 >= 0
  const tooltipTop = roomAbove ? activeTop - estHeight - 12 : 0
  const tooltipPos = (() => {
    if (active === null || !place) return null
    if (roomAbove) return { left: place.left, translate: place.translate }
    const cx = band.center(active)
    const toRight = cx < width / 2
    return toRight ? { left: cx + band.bandwidth / 2 + 10, translate: '0' } : { left: cx - band.bandwidth / 2 - 10, translate: '-100%' }
  })()

  return (
    <figure className={`relative ${className}`}>
      <div
        ref={ref}
        className="relative select-none"
        tabIndex={0}
        role="group"
        aria-roledescription="diagram"
        aria-label={`${title}. Använd vänster- och högerpil för att läsa av dagarna.`}
        onKeyDown={onKeyDown}
        onBlur={() => viaKeyboard && setActive(null)}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setActive(null)}
      >
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={autoSummary}
          className="block overflow-visible"
        >
          {/* Stödlinjer och y-axel */}
          <g aria-hidden="true">
            {ticks.map((t, i) => {
              const y = ys(t)
              const nearTarget = targetY !== null && Math.abs(targetY - y) < 12
              return (
                <g key={t}>
                  <line x1={left} x2={right} y1={y} y2={y} stroke="var(--lg-line)" strokeWidth={1} shapeRendering="crispEdges" />
                  {!nearTarget && (
                    <text x={right + 8} y={y} dy="0.32em" className="fill-ink-3 text-[11px] tabular-nums">
                      {tickLabels[i]}
                    </text>
                  )}
                </g>
              )
            })}
          </g>

          {/* Staplar */}
          {data.map((d, i) => {
            const total = totals[i]
            const x = band.x(i)
            const bw = band.bandwidth
            // 0,65 ger minst 3:1 mot kortet för standardfärgen (gran) i båda teman (WCAG 1.4.11).
            const opacity = dim(i) ? 0.65 : 1
            if (total === undefined || total <= 0) {
              return (
                <circle
                  key={d.date}
                  cx={band.center(i)}
                  cy={bottom - 3}
                  r={2.5}
                  fill="var(--lg-ink-3)"
                  fillOpacity={total === undefined ? 0.35 : 0.6}
                  aria-hidden="true"
                />
              )
            }
            let body: ReactNode
            if (stacked) {
              const parts: Array<{ key: string; color: string; v: number }> = []
              for (const s of keys) {
                const v = d.segments?.[s.key]
                if (v !== undefined && Number.isFinite(v) && v > 0) parts.push({ key: s.key, color: s.color, v })
              }
              let cum = 0
              body = parts.map((p, k) => {
                const y0 = ys(cum)
                cum += p.v
                const y1 = ys(cum)
                const isTop = k === parts.length - 1
                const bottomY = k > 0 && y0 - y1 > GAP + 1 ? y0 - GAP : y0
                const h = Math.max(1, bottomY - y1)
                return <path key={p.key} d={roundedBarPath(x, y1, bw, h, isTop ? radius : 0)} fill={p.color} />
              })
            } else {
              const y = Math.min(ys(total), bottom - 3)
              body = <path d={roundedBarPath(x, y, bw, bottom - y, radius)} fill={color} />
            }
            return (
              <motion.g
                key={d.date}
                aria-hidden="true"
                initial={reduced ? false : { scaleY: 0 }}
                animate={{ scaleY: 1, opacity }}
                style={{ originY: 1 }}
                transition={{
                  scaleY: { type: 'spring', stiffness: 240, damping: 24, delay: Math.min(0.5, i * 0.035) },
                  opacity: { duration: 0.18 },
                }}
              >
                {body}
              </motion.g>
            )
          })}

          {/* Egna mål per dag */}
          <g aria-hidden="true">
            {data.map((d, i) =>
              d.target !== undefined && Number.isFinite(d.target) ? (
                <line
                  key={`t-${d.date}`}
                  x1={band.x(i) - 4}
                  x2={band.x(i) + band.bandwidth + 4}
                  y1={ys(d.target)}
                  y2={ys(d.target)}
                  stroke="var(--lg-ink-2)"
                  strokeOpacity={0.75}
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              ) : null,
            )}
          </g>

          {/* Gemensam mållinje */}
          {targetY !== null && (
            <g aria-hidden="true">
              <line
                x1={left}
                x2={right}
                y1={targetY}
                y2={targetY}
                stroke="var(--lg-ink-2)"
                strokeOpacity={0.6}
                strokeWidth={1.5}
                strokeDasharray="5 5"
                strokeLinecap="round"
              />
              <text x={right + 8} y={targetY} dy="0.32em" className="fill-ink-2 text-[11px] font-semibold tabular-nums">
                {targetText}
              </text>
            </g>
          )}

          {/* Värde över betonad stapel */}
          {valueLabel && emphasized !== null && totals[emphasized] !== undefined && (totals[emphasized] ?? 0) > 0 && (
            <text
              x={band.center(emphasized)}
              y={Math.max(12, ys(totals[emphasized]!) - 8)}
              textAnchor="middle"
              aria-hidden="true"
              className="fill-ink font-display text-[13px] font-semibold tabular-nums"
              style={{ paintOrder: 'stroke', stroke: 'var(--lg-surface)', strokeWidth: 4, strokeLinejoin: 'round' }}
            >
              {formatNumber(totals[emphasized]!, totals[emphasized]! >= 100 ? 0 : 1)}
            </text>
          )}

          {/* x-etiketter */}
          <g aria-hidden="true">
            {data.map((d, i) => {
              if (!showLabel(i)) return null
              const label = labelFor(d.date, i)
              const cx = band.center(i)
              const isHi = i === highlightIndex
              const isSel = d.date === selected
              return (
                <g key={`l-${d.date}`}>
                  {isHi && (
                    <rect
                      x={cx - (approxTextWidth(label) + 14) / 2}
                      y={bottom + 7}
                      width={approxTextWidth(label) + 14}
                      height={18}
                      rx={9}
                      fill="var(--lg-gran-soft)"
                    />
                  )}
                  <text
                    x={cx}
                    y={bottom + 20}
                    textAnchor="middle"
                    className={`text-[11px] ${isHi ? 'fill-gran font-semibold' : isSel ? 'fill-ink font-semibold' : 'fill-ink-3'}`}
                  >
                    {label}
                  </text>
                  {isSel && !isHi && <circle cx={cx} cy={bottom + 28} r={2} fill="var(--lg-ink)" />}
                </g>
              )
            })}
          </g>

          {/* Träffytor – hela kolumnen, större än stapeln */}
          {data.map((d, i) => (
            <rect
              key={`hit-${d.date}`}
              x={band.center(i) - band.step / 2}
              y={0}
              width={band.step}
              height={bottom + MARGIN.bottom}
              fill="transparent"
              style={{ touchAction: 'pan-y', cursor: onSelect ? 'pointer' : 'default' }}
              onPointerEnter={() => {
                setActive(i)
                setViaKeyboard(false)
              }}
              onPointerDown={() => {
                setActive(i)
                setViaKeyboard(false)
              }}
              onClick={() => onSelect?.(d.date)}
            />
          ))}
        </svg>

        {activeDatum && tooltipPos && (
          <div
            ref={tooltipRef}
            className={TOOLTIP_CLASS}
            style={{ left: tooltipPos.left, top: tooltipTop, transform: `translateX(${tooltipPos.translate})` }}
            aria-hidden="true"
          >
            <div className="text-[11px] font-medium text-ink-3">
              {WEEKDAYS_SHORT[weekdayIndex(activeDatum.date)]} {formatDayShort(activeDatum.date)}
            </div>
            <div className="font-display text-[17px] font-semibold leading-tight text-ink tabular-nums">
              {activeTotal === undefined ? 'Ingen data' : fmt(activeTotal)}
            </div>
            {stacked &&
              activeTotal !== undefined &&
              keys.map((s) => (
                <div key={s.key} className="mt-0.5 flex items-center gap-2 text-[12px]">
                  <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: s.color }} />
                  <span className="text-ink-2">{s.label}</span>
                  <span className="ml-auto pl-2 font-semibold text-ink tabular-nums">{fmt(activeDatum.segments?.[s.key] ?? 0)}</span>
                </div>
              ))}
            {activeTarget !== undefined && (
              <div className="mt-1 text-[11px] text-ink-2">
                {targetLabel} {fmt(activeTarget)}
                {diffText && <span className="block text-ink-3">{diffText}</span>}
              </div>
            )}
          </div>
        )}

        <div className="sr-only" aria-live="polite">
          {viaKeyboard ? readout : ''}
        </div>
      </div>

      {showLegend && (
        <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-ink-2">
          {stacked &&
            keys.map((s) => (
              <span key={s.key} className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color }} aria-hidden="true" />
                {s.label}
              </span>
            ))}
          {hasTargets && (
            <span className="inline-flex items-center gap-1.5">
              <svg width="16" height="4" aria-hidden="true">
                <line
                  x1="1"
                  x2="15"
                  y1="2"
                  y2="2"
                  stroke="var(--lg-ink-2)"
                  strokeWidth="2"
                  strokeDasharray={target !== undefined ? '3 3' : undefined}
                  strokeLinecap="round"
                />
              </svg>
              {targetLabel}
            </span>
          )}
        </figcaption>
      )}

      {/* sr-only på en omslutande div – tabeller ignorerar width: 1px och skulle annars ge sidled-scroll */}
      <div className="sr-only">
        <table>
          <caption>{title}</caption>
          <thead>
            <tr>
              <th scope="col">Dag</th>
              {stacked &&
                keys.map((s) => (
                  <th key={s.key} scope="col">
                    {s.label}
                  </th>
                ))}
              <th scope="col">{stacked ? 'Totalt' : 'Värde'}</th>
              {hasTargets && <th scope="col">{targetLabel}</th>}
            </tr>
          </thead>
          <tbody>
            {data.map((d, i) => (
              <tr key={d.date}>
                <th scope="row">{formatDayLong(d.date)}</th>
                {stacked &&
                  keys.map((s) => {
                    const v = d.segments?.[s.key]
                    return <td key={s.key}>{v === undefined ? '–' : fmt(v)}</td>
                  })}
                <td>{totals[i] === undefined ? '–' : fmt(totals[i]!)}</td>
                {hasTargets && <td>{fmtMaybe(d.target ?? target, fmt)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  )
}

function fmtMaybe(v: number | undefined, fmt: (v: number) => string): string {
  return v === undefined || !Number.isFinite(v) ? '–' : fmt(v)
}

/**
 * Etikett för mållinjen: minst axelns decimaler, men med målets egen precision – en linje på
 * 1,6 med heltalsaxel ska heta "1,6", inte "2". Stora tal avrundas som vanligt (2 000).
 */
export function targetLabelFor(value: number, ticks: readonly number[]): string {
  const step = ticks.length > 1 ? Math.abs(ticks[1] - ticks[0]) : 1
  const axis = decimalsForStep(step)
  const own = Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 10 ? 1 : 2
  return formatNumber(value, Math.max(axis, own))
}
