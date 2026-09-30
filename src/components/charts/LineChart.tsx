/**
 * Linjediagram över tid – t.ex. vikt (mätpunkter + mjuk trendlinje + målvikt).
 *
 * - x-axeln är kalenderdagar (`ISODate`) med svenska etiketter och valfria veckonummer.
 * - y-axeln får automatiskt en "snygg" domän (78, 79, 80 …) som går att låsa med `yDomain`.
 * - Serier kan visas som linje, punkter eller båda, med monoton kubisk kurva (ingen översväng).
 * - Valfritt band (t.ex. målintervall) och horisontell mållinje med etikett.
 * - Hårkors + tooltip vid pekare/tryck, piltangenter för tangentbordsanvändare och en dold
 *   datatabell för skärmläsare.
 *
 * Komponenten är rent presentationell: all data kommer via props.
 */
import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import type { ISODate } from '../../types'
import { diffDays, formatDayLong, formatDayShort, isoWeek, WEEKDAYS_SHORT, weekdayIndex } from '../../lib/dates'
import { formatNumber, plural } from '../../lib/format'
import {
  approxTextWidth,
  areaPath,
  bandPath,
  curvePath,
  decimalsForStep,
  extent,
  formatTicks,
  linearScale,
  nearestIndex,
  niceTicks,
  SERIES_COLORS,
  timeTicks,
  TOOLTIP_CLASS,
  tooltipPlacement,
  useElementWidth,
  useMeasuredSize,
  type CurveType,
  type Point,
} from './chartUtils'

export interface LinePoint {
  date: ISODate
  value: number
}

export interface LineSeries {
  /** Stabilt id – färgen följer serien, inte dess ordning. */
  id: string
  /** Svensk etikett, t.ex. "Vikt" eller "Trend". */
  label: string
  points: readonly LinePoint[]
  /** CSS-färg, helst en token: `var(--lg-gran)`. Standard: fast serieordning. */
  color?: string
  /** 'line' (standard), 'dots' (bara mätpunkter) eller 'line+dots'. */
  display?: 'line' | 'dots' | 'line+dots'
  curve?: CurveType
  /** Streckad linje, t.ex. för prognos. */
  dashed?: boolean
  /** Tonad yta under linjen. */
  area?: boolean
  strokeWidth?: number
  /** Visa seriens senaste värde som etikett vid linjens slut (Fraunces). */
  endLabel?: boolean
  /** Dölj serien i tooltip, tabell och teckenförklaring (t.ex. hjälplinjer). */
  hidden?: boolean
}

export interface LineBand {
  upper: readonly LinePoint[]
  lower: readonly LinePoint[]
  label?: string
  color?: string
  curve?: CurveType
}

export interface LineGoal {
  value: number
  /** Etikett vid linjen, t.ex. "Mål 75 kg". Standard: "Mål" + värdet. */
  label?: string
  color?: string
  /** Ta med målet i y-domänen (standard true) så att linjen alltid syns. */
  includeInDomain?: boolean
}

export interface LineChartProps {
  series: readonly LineSeries[]
  band?: LineBand
  goal?: LineGoal
  /** Lås x-axeln, t.ex. senaste 30 dagarna även om data saknas i början. */
  xDomain?: readonly [ISODate, ISODate]
  /** Lås y-axelns under- och/eller övergräns. */
  yDomain?: readonly [number | undefined, number | undefined]
  includeZero?: boolean
  /** Ungefärligt antal y-intervall. Standard 4. */
  yTickCount?: number
  /** Höjd i pixlar. Bredden följer behållaren. Standard 220. */
  height?: number
  /** Enhet för tooltip och sammanfattning, t.ex. "kg". */
  unit?: string
  /** Egen formatering av värden i tooltip/tabell (ersätter `unit`). */
  formatValue?: (value: number) => string
  /** Visa veckonummer ("v. 39") på x-axeln när den har veckosteg. */
  weekNumbers?: boolean
  /** Diagrammets namn för skärmläsare (och tabellrubrik). */
  title?: string
  /** Egen sammanfattning för skärmläsare. Standard: automatiskt genererad. */
  summary?: string
  /** Visa teckenförklaring. Standard: när minst två serier syns. */
  legend?: boolean
  /** Anropas när användaren trycker på en dag. */
  onSelectDate?: (date: ISODate) => void
  emptyText?: string
  className?: string
}

const MARGIN = { top: 12, bottom: 26, left: 4 }
const EDGE_PAD = 8

interface SeriesModel {
  s: LineSeries
  color: string
  /** Giltiga punkter inom x-domänen, sorterade på datum. */
  data: LinePoint[]
  byDate: Map<ISODate, number>
}

/** Serie med punkter i pixelkoordinater. */
interface PlottedSeries extends SeriesModel {
  pts: Array<Point & LinePoint>
}

/** Städat id som fungerar i `url(#…)`. */
function useSvgId(prefix: string): string {
  return `${prefix}-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
}

function shortDay(date: ISODate, weekNumbers?: boolean): string {
  const base = `${WEEKDAYS_SHORT[weekdayIndex(date)]} ${formatDayShort(date)}`
  return weekNumbers ? `${base} · v. ${isoWeek(date)}` : base
}

export function LineChart({
  series,
  band,
  goal,
  xDomain,
  yDomain,
  includeZero = false,
  yTickCount = 4,
  height = 220,
  unit,
  formatValue,
  weekNumbers = false,
  title = 'Diagram',
  summary,
  legend,
  onSelectDate,
  emptyText = 'Ingen data ännu',
  className = '',
}: LineChartProps) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const reduced = useReducedMotion() ?? false
  const clipId = useSvgId('lc-clip')
  const gradId = useSvgId('lc-grad')
  const [active, setActive] = useState<number | null>(null)
  const [viaKeyboard, setViaKeyboard] = useState(false)
  const [tooltipRef, tooltipSize] = useMeasuredSize<HTMLDivElement>()

  const model = useMemo(() => {
    // --- Datum ---------------------------------------------------------------
    const dateSet = new Set<ISODate>()
    const valid = (p: LinePoint) => typeof p.date === 'string' && Number.isFinite(p.value)
    for (const s of series) for (const p of s.points) if (valid(p)) dateSet.add(p.date)
    if (band) for (const p of [...band.upper, ...band.lower]) if (valid(p)) dateSet.add(p.date)
    const sortedAll = [...dateSet].sort()
    const x0 = xDomain?.[0] ?? sortedAll[0]
    const x1 = xDomain?.[1] ?? sortedAll[sortedAll.length - 1]
    if (!x0 || !x1) return null
    const inRange = (d: ISODate) => d >= x0 && d <= x1

    // --- Serier --------------------------------------------------------------
    const seriesModels: SeriesModel[] = series.map((s, i) => {
      const data = s.points
        .filter((p) => valid(p) && inRange(p.date))
        .slice()
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      return {
        s,
        color: s.color ?? SERIES_COLORS[i % SERIES_COLORS.length],
        data,
        byDate: new Map(data.map((p) => [p.date, p.value])),
      }
    })

    // --- y-domän -------------------------------------------------------------
    const values: number[] = []
    for (const m of seriesModels) for (const p of m.data) values.push(p.value)
    if (band) for (const p of [...band.upper, ...band.lower]) if (valid(p) && inRange(p.date)) values.push(p.value)
    if (goal && goal.includeInDomain !== false && Number.isFinite(goal.value)) values.push(goal.value)
    const ext = extent(values)
    if (!ext) return null
    let [lo, hi] = ext
    if (includeZero) {
      lo = Math.min(lo, 0)
      hi = Math.max(hi, 0)
    }
    if (yDomain?.[0] !== undefined) lo = yDomain[0]
    if (yDomain?.[1] !== undefined) hi = yDomain[1]
    let ticks = niceTicks(lo, hi, yTickCount)
    let domain: [number, number] = [ticks[0], ticks[ticks.length - 1]]
    if (yDomain?.[0] !== undefined || yDomain?.[1] !== undefined) {
      domain = [yDomain?.[0] ?? domain[0], yDomain?.[1] ?? domain[1]]
      ticks = ticks.filter((t) => t >= domain[0] - 1e-9 && t <= domain[1] + 1e-9)
    }
    const step = ticks.length > 1 ? ticks[1] - ticks[0] : 1
    const dateList = sortedAll.filter(inRange)
    return { x0, x1, seriesModels, ticks, domain, step, dateList }
  }, [series, band, goal, xDomain, yDomain, includeZero, yTickCount])

  // Formatering av värden (tooltip, tabell, sammanfattning).
  const fmt = useMemo(() => {
    if (formatValue) return formatValue
    const step = model?.step ?? 1
    const dec = step >= 10 ? 0 : Math.min(2, decimalsForStep(step) + 1)
    return (v: number) => `${formatNumber(v, dec)}${unit ? `\u00a0${unit}` : ''}`
  }, [formatValue, unit, model?.step])

  const layout = useMemo(() => {
    if (!model) return null
    const tickLabels = formatTicks(model.ticks)
    const gutter = Math.max(28, Math.max(...tickLabels.map((l) => approxTextWidth(l))) + 14)
    const left = MARGIN.left
    const right = Math.max(left + 40, width - gutter)
    const top = MARGIN.top
    const bottom = Math.max(top + 40, height - MARGIN.bottom)
    const span = Math.max(0, diffDays(model.x0, model.x1))
    const xs = linearScale([0, span], [left + EDGE_PAD, right - EDGE_PAD])
    const ys = linearScale(model.domain, [bottom, top])
    const xOf = (d: ISODate) => xs(diffDays(model.x0, d))
    const plotted: PlottedSeries[] = model.seriesModels.map((m) => ({
      ...m,
      pts: m.data.map((p) => ({ ...p, x: xOf(p.date), y: ys(p.value) })),
    }))
    const dateXs = model.dateList.map(xOf)
    const xTicks = timeTicks(model.x0, model.x1, Math.max(2, Math.floor((right - left) / 62)), { weekNumbers }).map((t) => ({
      ...t,
      x: xOf(t.date),
    }))
    return { tickLabels, left, right, top, bottom, ys, xOf, dateXs, xTicks, plotted }
  }, [model, width, height, weekNumbers])

  if (!model || !layout) {
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

  const { ticks, dateList } = model
  const { tickLabels, left, right, top, bottom, ys, xOf, dateXs, xTicks, plotted } = layout
  const visible = plotted.filter((m) => !m.s.hidden && m.pts.length > 0)
  const showLegend = legend ?? (visible.length >= 2 || !!band?.label)

  // --- Aktiv dag (hårkors) ---------------------------------------------------
  const activeDate = active !== null ? dateList[active] : undefined
  const activeX = activeDate ? xOf(activeDate) : 0
  const rows = activeDate
    ? visible.map((m) => ({ m, v: m.byDate.get(activeDate) })).filter((r): r is { m: PlottedSeries; v: number } => r.v !== undefined)
    : []
  const bandAt = (d: ISODate) => {
    if (!band) return undefined
    const u = band.upper.find((p) => p.date === d)?.value
    const l = band.lower.find((p) => p.date === d)?.value
    return u !== undefined && l !== undefined ? { u, l } : undefined
  }
  const activeBand = activeDate ? bandAt(activeDate) : undefined
  const activeYs = rows.map((r) => ys(r.v))
  const estHeight = tooltipSize?.height ?? 34 + (rows.length + (activeBand ? 1 : 0)) * 24
  const minY = activeYs.length ? Math.min(...activeYs) : top
  const maxY = activeYs.length ? Math.max(...activeYs) : top
  const tooltipTop = minY - estHeight - 14 >= 0 ? minY - estHeight - 14 : Math.min(height - estHeight, maxY + 14)
  const place = tooltipPlacement(activeX, width)

  const readout = activeDate
    ? `${formatDayLong(activeDate)}: ${[
        ...rows.map((r) => `${r.m.s.label} ${fmt(r.v)}`),
        ...(activeBand && band?.label ? [`${band.label} ${fmt(activeBand.l)}–${fmt(activeBand.u)}`] : []),
      ].join(', ')}`
    : ''

  // --- Händelser ---------------------------------------------------------------
  const pick = (clientX: number, target: Element) => {
    const svg = target.closest('svg')
    if (!svg || dateXs.length === 0) return
    const px = clientX - svg.getBoundingClientRect().left
    setActive(nearestIndex(dateXs, px))
    setViaKeyboard(false)
  }
  const onPointerMove = (e: PointerEvent<SVGRectElement>) => pick(e.clientX, e.currentTarget)
  const onPointerDown = (e: PointerEvent<SVGRectElement>) => pick(e.clientX, e.currentTarget)
  const onPointerLeave = (e: PointerEvent<SVGRectElement>) => {
    if (e.pointerType === 'mouse') setActive(null)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const n = dateList.length
    if (n === 0) return
    let next: number | null = null
    if (e.key === 'ArrowRight') next = active === null ? n - 1 : Math.min(n - 1, active + 1)
    else if (e.key === 'ArrowLeft') next = active === null ? n - 1 : Math.max(0, active - 1)
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = n - 1
    else if (e.key === 'Escape') {
      setActive(null)
      return
    } else if ((e.key === 'Enter' || e.key === ' ') && active !== null && onSelectDate) {
      e.preventDefault()
      onSelectDate(dateList[active])
      return
    }
    if (next !== null) {
      e.preventDefault()
      setActive(next)
      setViaKeyboard(true)
    }
  }

  const autoSummary =
    summary ??
    `${title}. ${visible
      .map((m) => {
        const vals = m.pts.map((p) => p.value)
        const last = m.pts[m.pts.length - 1]
        return `${m.s.label}: ${plural(m.pts.length, 'värde', 'värden')} från ${formatDayShort(m.pts[0].date)} till ${formatDayShort(
          last.date,
        )}, senast ${fmt(last.value)}, lägst ${fmt(Math.min(...vals))}, högst ${fmt(Math.max(...vals))}`
      })
      .join('. ')}${goal ? `. ${goal.label ?? 'Mål'}: ${fmt(goal.value)}` : ''}.`

  const draw = reduced ? false : undefined
  const goalY = goal && Number.isFinite(goal.value) ? ys(goal.value) : null
  const goalVisible = goalY !== null && goalY >= top - 1 && goalY <= bottom + 1

  return (
    <figure className={`relative ${className}`}>
      <div
        ref={ref}
        className="relative select-none"
        tabIndex={0}
        role="group"
        aria-roledescription="diagram"
        aria-label={`${title}. Använd vänster- och högerpil för att läsa av värden.`}
        onKeyDown={onKeyDown}
        onBlur={() => viaKeyboard && setActive(null)}
      >
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={autoSummary}
          className="block overflow-visible"
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={left - 6} y={top - 8} width={right - left + 12} height={bottom - top + 16} />
            </clipPath>
            {visible
              .filter((m) => m.s.area)
              .map((m) => (
                <linearGradient key={m.s.id} id={`${gradId}-${m.s.id}`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={m.color} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={m.color} stopOpacity={0} />
                </linearGradient>
              ))}
          </defs>

          {/* Stödlinjer och y-axel (till höger) */}
          <g aria-hidden="true">
            {ticks.map((t, i) => {
              const y = ys(t)
              return (
                <g key={t}>
                  <line x1={left} x2={right} y1={y} y2={y} stroke="var(--lg-line)" strokeWidth={1} shapeRendering="crispEdges" />
                  <text x={right + 8} y={y} dy="0.32em" className="fill-ink-3 text-[11px] tabular-nums">
                    {tickLabels[i]}
                  </text>
                </g>
              )
            })}
            {xTicks.map((t, i) => {
              const anchor = t.x < left + 18 ? 'start' : t.x > right - 18 ? 'end' : 'middle'
              return (
                <text key={`${t.date}-${i}`} x={t.x} y={bottom + 18} textAnchor={anchor} className="fill-ink-3 text-[11px]">
                  {t.label}
                </text>
              )
            })}
          </g>

          <g clipPath={`url(#${clipId})`}>
            {/* Band, t.ex. målintervall */}
            {band && (
              <motion.path
                d={bandPath(
                  band.upper.filter((p) => Number.isFinite(p.value)).map((p) => ({ x: xOf(p.date), y: ys(p.value) })),
                  band.lower.filter((p) => Number.isFinite(p.value)).map((p) => ({ x: xOf(p.date), y: ys(p.value) })),
                  band.curve ?? 'monotone',
                )}
                fill={band.color ?? 'var(--lg-gran)'}
                fillOpacity={0.1}
                initial={draw ?? { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6 }}
                aria-hidden="true"
              />
            )}

            {/* Tonade ytor under linjer */}
            {visible
              .filter((m) => m.s.area && m.pts.length > 1)
              .map((m) => (
                <motion.path
                  key={`area-${m.s.id}`}
                  d={areaPath(m.pts, bottom, m.s.curve ?? 'monotone')}
                  fill={`url(#${gradId}-${m.s.id})`}
                  initial={draw ?? { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.8, delay: 0.2 }}
                  aria-hidden="true"
                />
              ))}

            {/* Mållinje */}
            {goal && goalVisible && goalY !== null && (
              <g aria-hidden="true">
                <line
                  x1={left}
                  x2={right}
                  y1={goalY}
                  y2={goalY}
                  stroke={goal.color ?? 'var(--lg-ink-2)'}
                  strokeOpacity={0.55}
                  strokeWidth={1.5}
                  strokeDasharray="5 5"
                  strokeLinecap="round"
                />
                <text
                  x={left + 4}
                  y={goalY - 6}
                  className="fill-ink-2 text-[11px] font-semibold"
                  style={{ paintOrder: 'stroke', stroke: 'var(--lg-surface)', strokeWidth: 4, strokeLinejoin: 'round' }}
                >
                  {goal.label ?? `Mål ${fmt(goal.value)}`}
                </text>
              </g>
            )}

            {/* Linjer */}
            {visible
              .filter((m) => (m.s.display ?? 'line') !== 'dots' && m.pts.length > 1)
              .map((m) => (
                <motion.path
                  key={`line-${m.s.id}`}
                  d={curvePath(m.pts, m.s.curve ?? 'monotone')}
                  fill="none"
                  stroke={m.color}
                  strokeWidth={m.s.strokeWidth ?? 2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={m.s.dashed ? '4 6' : undefined}
                  initial={draw ?? (m.s.dashed ? { opacity: 0 } : { pathLength: 0, opacity: 0 })}
                  animate={m.s.dashed ? { opacity: 1 } : { pathLength: 1, opacity: 1 }}
                  transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                  aria-hidden="true"
                />
              ))}

            {/* Mätpunkter */}
            {visible
              .filter((m) => (m.s.display ?? 'line') !== 'line' || m.pts.length === 1)
              .map((m) => {
                const r = m.pts.length > 90 ? 2.5 : m.pts.length > 45 ? 3 : 4
                return (
                  <g key={`dots-${m.s.id}`} aria-hidden="true">
                    {m.pts.map((p, i) => (
                      <motion.circle
                        key={p.date}
                        cx={p.x}
                        cy={p.y}
                        r={r}
                        fill={m.color}
                        stroke="var(--lg-surface)"
                        strokeWidth={2}
                        initial={draw ?? { scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.35, delay: Math.min(0.6, 0.25 + i * 0.012) }}
                      />
                    ))}
                  </g>
                )
              })}
          </g>

          {/* Slutetiketter */}
          {visible
            .filter((m) => m.s.endLabel && m.pts.length > 0)
            .map((m) => {
              const last = m.pts[m.pts.length - 1]
              return (
                <text
                  key={`end-${m.s.id}`}
                  x={Math.min(last.x, right - 4)}
                  y={last.y - 10}
                  textAnchor="end"
                  aria-hidden="true"
                  className="fill-ink font-display text-[13px] font-semibold tabular-nums"
                  style={{ paintOrder: 'stroke', stroke: 'var(--lg-surface)', strokeWidth: 4, strokeLinejoin: 'round' }}
                >
                  {fmt(last.value)}
                </text>
              )
            })}

          {/* Hårkors */}
          {activeDate && (
            <g aria-hidden="true" pointerEvents="none">
              <line x1={activeX} x2={activeX} y1={top - 4} y2={bottom} stroke="var(--lg-ink-3)" strokeOpacity={0.5} strokeWidth={1} />
              {rows.map((r) => (
                <circle key={r.m.s.id} cx={activeX} cy={ys(r.v)} r={5} fill={r.m.color} stroke="var(--lg-surface)" strokeWidth={2.5} />
              ))}
            </g>
          )}

          {/* Träffyta för pekare – vertikal scroll fungerar fortfarande på mobil */}
          <rect
            x={left}
            y={0}
            width={Math.max(0, right - left)}
            height={bottom}
            fill="transparent"
            style={{ touchAction: 'pan-y', cursor: onSelectDate ? 'pointer' : 'crosshair' }}
            onPointerMove={onPointerMove}
            onPointerDown={onPointerDown}
            onPointerLeave={onPointerLeave}
            onClick={() => activeDate && onSelectDate?.(activeDate)}
          />
        </svg>

        {activeDate && (rows.length > 0 || activeBand) && (
          <div
            ref={tooltipRef}
            className={TOOLTIP_CLASS}
            style={{ left: place.left, top: Math.max(0, tooltipTop), transform: `translateX(${place.translate})` }}
            aria-hidden="true"
          >
            <div className="text-[11px] font-medium text-ink-3">{shortDay(activeDate, weekNumbers)}</div>
            {rows.map((r) => (
              <div key={r.m.s.id} className="mt-1 flex items-baseline gap-2">
                <LineKey color={r.m.color} dashed={r.m.s.dashed} dot={r.m.s.display === 'dots'} />
                <span className="font-display text-[15px] font-semibold leading-tight text-ink tabular-nums">{fmt(r.v)}</span>
                <span className="text-[11px] text-ink-2">{r.m.s.label}</span>
              </div>
            ))}
            {activeBand && band?.label && (
              <div className="mt-1 flex items-baseline gap-2">
                <span
                  className="inline-block h-2.5 w-3.5 self-center rounded-[3px] opacity-30"
                  style={{ background: band.color ?? 'var(--lg-gran)' }}
                />
                <span className="text-[12px] font-semibold text-ink tabular-nums">
                  {fmt(activeBand.l)}–{fmt(activeBand.u)}
                </span>
                <span className="text-[11px] text-ink-2">{band.label}</span>
              </div>
            )}
          </div>
        )}

        {/* Uppläsning för skärmläsare vid tangentbordsnavigering */}
        <div className="sr-only" aria-live="polite">
          {viaKeyboard ? readout : ''}
        </div>
      </div>

      {showLegend && (
        <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-ink-2">
          {visible.map((m) => (
            <span key={m.s.id} className="inline-flex items-center gap-1.5">
              <LineKey color={m.color} dashed={m.s.dashed} dot={m.s.display === 'dots'} />
              {m.s.label}
            </span>
          ))}
          {band?.label && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-3.5 rounded-[3px] opacity-30" style={{ background: band.color ?? 'var(--lg-gran)' }} />
              {band.label}
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
              <th scope="col">Datum</th>
              {visible.map((m) => (
                <th key={m.s.id} scope="col">
                  {m.s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dateList.map((d) => (
              <tr key={d}>
                <th scope="row">{formatDayLong(d)}</th>
                {visible.map((m) => {
                  const v = m.byDate.get(d)
                  return <td key={m.s.id}>{v === undefined ? '–' : fmt(v)}</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  )
}

/** Kort linjenyckel (eller punkt) i seriens färg för tooltip och teckenförklaring. */
function LineKey({ color, dashed, dot }: { color: string; dashed?: boolean; dot?: boolean }) {
  if (dot)
    return <span className="inline-block h-2 w-2 shrink-0 self-center rounded-full" style={{ background: color }} aria-hidden="true" />
  return (
    <svg width="14" height="4" viewBox="0 0 14 4" className="shrink-0 self-center" aria-hidden="true">
      <line
        x1="1"
        x2="13"
        y1="2"
        y2="2"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={dashed ? '2 3' : undefined}
      />
    </svg>
  )
}
