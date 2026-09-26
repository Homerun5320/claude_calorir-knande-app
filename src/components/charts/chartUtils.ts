/**
 * Gemensamma hjälpfunktioner för Lagoms handgjorda SVG-diagram.
 *
 * Allt här är rena funktioner (förutom `useElementWidth`) och enhetstestas i `chartUtils.test.ts`:
 * - "Snygga" axelsteg (`niceTicks`, `niceDomain`) – 0, 5, 10 … i stället för 3,7, 7,4 …
 * - Skalor (`linearScale`, `bandLayout`).
 * - Kurvor: monoton kubisk interpolation (Steffen/Fritsch–Carlson) som aldrig "svänger över"
 *   mätpunkterna – viktigt för viktkurvor där en översväng skulle visa en vikt som aldrig uppmätts.
 * - Staplar med rundad datatopp och rak bas, ringsegment för munkdiagram.
 * - Tidsaxlar med svenska etiketter och veckonummer (veckan börjar på måndag).
 *
 * Färger anges alltid som CSS-variabler (t.ex. `var(--lg-gran)`) så att mörkt läge fungerar automatiskt.
 */
import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { ISODate } from '../../types'
import { addDays, diffDays, formatDayShort, fromISODate, isoWeek, MONTHS_SHORT, toISODate, weekdayIndex } from '../../lib/dates'
import { formatNumber } from '../../lib/format'

// ---------------------------------------------------------------------------
// Grundläggande
// ---------------------------------------------------------------------------

/** Punkt i pixelkoordinater. */
export interface Point {
  x: number
  y: number
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Minsta och största ändliga värdet, eller `null` om inget finns. */
export function extent(values: Iterable<number | null | undefined>): [number, number] | null {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const v of values) {
    if (v === null || v === undefined || !Number.isFinite(v)) continue
    if (v < min) min = v
    if (v > max) max = v
  }
  return min === Number.POSITIVE_INFINITY ? null : [min, max]
}

/** Avrunda bort flyttalsbrus: 0.30000000000000004 → 0.3. */
function tidy(value: number, step: number): number {
  const decimals = Math.max(0, -Math.floor(Math.log10(Math.abs(step) || 1)) + 1)
  const v = Number(value.toFixed(Math.min(decimals, 12)))
  return Object.is(v, -0) ? 0 : v
}

// ---------------------------------------------------------------------------
// Axelsteg
// ---------------------------------------------------------------------------

/**
 * Ett "snyggt" steg (1, 2, 5 × 10ⁿ) så att intervallet [min, max] delas i ungefär `count` delar.
 * Samma princip som d3:s `tickStep`.
 */
export function tickStep(min: number, max: number, count = 5): number {
  const span = Math.abs(max - min)
  const n = Math.max(1, Math.round(count))
  if (!Number.isFinite(span) || span === 0) return 1
  const raw = span / n
  const power = 10 ** Math.floor(Math.log10(raw))
  const error = raw / power
  const factor = error >= Math.sqrt(50) ? 10 : error >= Math.sqrt(10) ? 5 : error >= Math.sqrt(2) ? 2 : 1
  return factor * power
}

/**
 * Utöka [min, max] till jämna steg. Om min === max skapas ett rimligt intervall runt värdet.
 * Returnerar alltid [lägre, högre].
 */
export function niceDomain(min: number, max: number, count = 5): [number, number] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1]
  let lo = Math.min(min, max)
  let hi = Math.max(min, max)
  if (lo === hi) {
    if (lo === 0) return [0, 1]
    const pad = Math.abs(lo) * 0.1
    lo -= pad
    hi += pad
  }
  // Två varv: steget kan ändras när domänen växer (samma knep som d3.nice).
  for (let i = 0; i < 2; i++) {
    const step = tickStep(lo, hi, count)
    lo = tidy(Math.floor(lo / step) * step, step)
    hi = tidy(Math.ceil(hi / step) * step, step)
  }
  return [lo, hi]
}

/**
 * Jämna axelvärden som täcker [min, max]: första värdet ≤ min och sista ≥ max.
 * `count` är ungefärligt antal intervall. Tomma/ogiltiga indata ger [].
 *
 * @example niceTicks(78.2, 81.5, 4) // [78, 79, 80, 81, 82]
 */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return []
  const [lo, hi] = niceDomain(min, max, count)
  const step = tickStep(lo, hi, count)
  const out: number[] = []
  const n = Math.round((hi - lo) / step)
  for (let i = 0; i <= n; i++) out.push(tidy(lo + i * step, step))
  return out
}

/** Antal decimaler som behövs för att visa axelvärden med ett visst steg. */
export function decimalsForStep(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 0
  return Math.max(0, Math.min(4, -Math.floor(Math.log10(step) + 1e-9)))
}

/** Formatera axelvärden på svenska med lagom många decimaler: [0, 0.5, 1] → "0", "0,5", "1". */
export function formatTicks(ticks: readonly number[]): string[] {
  const step = ticks.length > 1 ? Math.abs(ticks[1] - ticks[0]) : 1
  const d = decimalsForStep(step)
  return ticks.map((t) => formatNumber(t, d))
}

// ---------------------------------------------------------------------------
// Skalor
// ---------------------------------------------------------------------------

export interface LinearScale {
  (value: number): number
  /** Pixel → värde. */
  invert(px: number): number
  domain: readonly [number, number]
  range: readonly [number, number]
}

/** Linjär skala. Om domänen är ett enda värde hamnar allt mitt i intervallet. */
export function linearScale(domain: readonly [number, number], range: readonly [number, number]): LinearScale {
  const [d0, d1] = domain
  const [r0, r1] = range
  const dd = d1 - d0
  const rr = r1 - r0
  const scale = ((v: number) => (dd === 0 ? r0 + rr / 2 : r0 + ((v - d0) / dd) * rr)) as LinearScale
  scale.invert = (px: number) => (rr === 0 ? d0 : d0 + ((px - r0) / rr) * dd)
  scale.domain = [d0, d1]
  scale.range = [r0, r1]
  return scale
}

export interface BandLayout {
  /** Avstånd mellan bandens början. */
  step: number
  /** Stapelns bredd (begränsad av `maxBandwidth`). */
  bandwidth: number
  /** Vänsterkant för stapel `i`. */
  x(i: number): number
  /** Mittpunkt för band `i`. */
  center(i: number): number
  /** Index för bandet som innehåller pixeln (klämt till giltigt intervall). */
  indexAt(px: number): number
}

/**
 * Lägg ut `count` lika breda band över `width` pixlar (för stapeldiagram).
 * Staplar blir aldrig bredare än `maxBandwidth` – resten blir luft, vilket ger ett lugnare intryck.
 */
export function bandLayout(
  count: number,
  width: number,
  opts: { paddingInner?: number; paddingOuter?: number; maxBandwidth?: number; offset?: number } = {},
): BandLayout {
  const { paddingInner = 0.35, paddingOuter = 0.15, maxBandwidth = Number.POSITIVE_INFINITY, offset = 0 } = opts
  const n = Math.max(0, Math.floor(count))
  const step = n === 0 ? 0 : width / Math.max(1, n - paddingInner + paddingOuter * 2)
  const start = offset + step * paddingOuter
  const band = Math.max(0, Math.min(step * (1 - paddingInner), maxBandwidth))
  const inner = step * (1 - paddingInner)
  return {
    step,
    bandwidth: band,
    x: (i) => start + i * step + (inner - band) / 2,
    center: (i) => start + i * step + inner / 2,
    indexAt: (px) => (n === 0 ? -1 : clamp(Math.floor((px - offset - step * paddingOuter + (step * paddingInner) / 2) / step), 0, n - 1)),
  }
}

/** Index för värdet i en sorterad lista som ligger närmast `x` (binärsökning). -1 om listan är tom. */
export function nearestIndex(sorted: readonly number[], x: number): number {
  if (sorted.length === 0) return -1
  let lo = 0
  let hi = sorted.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (sorted[mid] <= x) lo = mid
    else hi = mid
  }
  return Math.abs(sorted[lo] - x) <= Math.abs(sorted[hi] - x) ? lo : hi
}

// ---------------------------------------------------------------------------
// Kurvor och former
// ---------------------------------------------------------------------------

const r2 = (v: number) => Math.round(v * 100) / 100
const pt = (p: Point) => `${r2(p.x)},${r2(p.y)}`

/**
 * Tangenter för monoton kubisk Hermite-interpolation (Steffen 1990 för inre punkter,
 * ensidiga uppskattningar i ändarna, begränsade enligt Fritsch–Carlson).
 * Punkterna måste vara sorterade på x.
 */
export function monotoneTangents(points: readonly Point[]): number[] {
  const n = points.length
  if (n < 2) return n === 1 ? [0] : []
  const h: number[] = []
  const s: number[] = []
  for (let i = 0; i < n - 1; i++) {
    const dx = points[i + 1].x - points[i].x
    h.push(dx)
    s.push(dx === 0 ? 0 : (points[i + 1].y - points[i].y) / dx)
  }
  const m = new Array<number>(n).fill(0)
  for (let i = 1; i < n - 1; i++) {
    const s0 = s[i - 1]
    const s1 = s[i]
    if (s0 * s1 <= 0) {
      m[i] = 0 // lokalt extremvärde → platt tangent, ingen översväng
      continue
    }
    const p = (s0 * h[i] + s1 * h[i - 1]) / (h[i - 1] + h[i])
    m[i] = (Math.sign(s0) + Math.sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p))
  }
  const endTangent = (secant: number, neighbour: number) => {
    if (n === 2) return secant
    let t = (3 * secant - neighbour) / 2
    if (Math.sign(t) !== Math.sign(secant) || secant === 0) t = 0
    else if (Math.abs(t) > 3 * Math.abs(secant)) t = 3 * secant
    return t
  }
  m[0] = endTangent(s[0], m[1])
  m[n - 1] = endTangent(s[n - 2], m[n - 2])
  return m
}

/**
 * SVG-sökväg ("d") för en mjuk monoton kurva genom punkterna. Kurvan passerar exakt genom varje
 * punkt och går aldrig över/under intervallet mellan två grannpunkter.
 */
export function monotonePath(points: readonly Point[]): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M${pt(points[0])}`
  const m = monotoneTangents(points)
  let d = `M${pt(points[0])}`
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    const dx = (b.x - a.x) / 3
    if (dx === 0) {
      d += `L${pt(b)}`
      continue
    }
    d += `C${pt({ x: a.x + dx, y: a.y + dx * m[i] })} ${pt({ x: b.x - dx, y: b.y - dx * m[i + 1] })} ${pt(b)}`
  }
  return d
}

/** Rak linje genom punkterna. */
export function linearPath(points: readonly Point[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${pt(p)}`).join('')
}

/** Trappstegslinje – värdet gäller tills nästa punkt (t.ex. mål som ändras). */
export function stepPath(points: readonly Point[]): string {
  if (points.length === 0) return ''
  let d = `M${pt(points[0])}`
  for (let i = 1; i < points.length; i++) d += `H${r2(points[i].x)}V${r2(points[i].y)}`
  return d
}

export type CurveType = 'monotone' | 'linear' | 'step'

export function curvePath(points: readonly Point[], curve: CurveType = 'monotone'): string {
  if (curve === 'linear') return linearPath(points)
  if (curve === 'step') return stepPath(points)
  return monotonePath(points)
}

/** Stängd yta mellan kurvan och en horisontell baslinje (för tonade ytor under linjer). */
export function areaPath(points: readonly Point[], baselineY: number, curve: CurveType = 'monotone'): string {
  if (points.length === 0) return ''
  const first = points[0]
  const last = points[points.length - 1]
  return `${curvePath(points, curve)}L${r2(last.x)},${r2(baselineY)}L${r2(first.x)},${r2(baselineY)}Z`
}

/**
 * Stängd yta mellan två kurvor (t.ex. ett målintervall eller osäkerhetsband).
 * `upper` och `lower` ska vara sorterade på x.
 */
export function bandPath(upper: readonly Point[], lower: readonly Point[], curve: CurveType = 'monotone'): string {
  if (upper.length === 0 || lower.length === 0) return ''
  const top = curvePath(upper, curve)
  const reversed = [...lower].reverse()
  // Den nedre kurvan ritas baklänges; en monoton kurva är symmetrisk så resultatet blir identiskt.
  const bottom = curvePath(reversed, curve).replace(/^M/, 'L')
  return `${top}${bottom}Z`
}

/**
 * Stapel med rundad topp (datänden) och rak bas. `y` är toppen, `height` går nedåt.
 * Radien krymps automatiskt för låga eller smala staplar.
 */
export function roundedBarPath(x: number, y: number, width: number, height: number, radius: number): string {
  if (width <= 0 || height <= 0) return ''
  const r = Math.max(0, Math.min(radius, width / 2, height))
  const x1 = x + width
  const yb = y + height
  if (r === 0) return `M${r2(x)},${r2(yb)}V${r2(y)}H${r2(x1)}V${r2(yb)}Z`
  return (
    `M${r2(x)},${r2(yb)}` +
    `V${r2(y + r)}` +
    `A${r2(r)},${r2(r)} 0 0 1 ${r2(x + r)},${r2(y)}` +
    `H${r2(x1 - r)}` +
    `A${r2(r)},${r2(r)} 0 0 1 ${r2(x1)},${r2(y + r)}` +
    `V${r2(yb)}Z`
  )
}

/** Punkt på en cirkel. Vinkel i radianer, 0 = klockan 12, medurs. */
export function polarToCartesian(cx: number, cy: number, r: number, angle: number): Point {
  return { x: cx + r * Math.sin(angle), y: cy - r * Math.cos(angle) }
}

/**
 * Cirkelbåge (mittlinje) från `start` till `end` (radianer, 0 = klockan 12, medurs) – ritas med
 * `stroke` och gärna `stroke-linecap="round"`. Hela varv delas i två bågar eftersom SVG inte kan
 * rita en båge med samma start- och slutpunkt.
 */
export function arcPath(cx: number, cy: number, r: number, start: number, end: number): string {
  const sweep = end - start
  if (r <= 0 || sweep <= 0) {
    const p = polarToCartesian(cx, cy, r, start)
    return `M${pt(p)}`
  }
  if (sweep >= Math.PI * 2 - 1e-6) {
    const a = polarToCartesian(cx, cy, r, start)
    const b = polarToCartesian(cx, cy, r, start + Math.PI)
    return `M${pt(a)}A${r2(r)},${r2(r)} 0 1 1 ${pt(b)}A${r2(r)},${r2(r)} 0 1 1 ${pt(a)}`
  }
  const a = polarToCartesian(cx, cy, r, start)
  const b = polarToCartesian(cx, cy, r, end)
  const large = sweep > Math.PI ? 1 : 0
  return `M${pt(a)}A${r2(r)},${r2(r)} 0 ${large} 1 ${pt(b)}`
}

// ---------------------------------------------------------------------------
// Värmekarta
// ---------------------------------------------------------------------------

/**
 * Intensitetsnivå 0…steps−1 för ett värde mot ett maxvärde.
 * 0 = inget (≤ 0), sedan jämnt fördelade nivåer upp till `max`. Värden över max får högsta nivån.
 */
export function heatLevel(value: number, max: number, steps = 5): number {
  const top = Math.max(1, Math.floor(steps)) - 1
  if (!Number.isFinite(value) || value <= 0 || !(max > 0) || top === 0) return 0
  return clamp(Math.ceil((value / max) * top), 1, top)
}

/**
 * CSS-färg som blandar en token-färg med en bas (också token) – fungerar i både ljust och mörkt läge.
 * @example tint('var(--lg-gran)', 40) // "color-mix(in oklab, var(--lg-gran) 40%, var(--lg-surface-2))"
 */
export function tint(color: string, percent: number, base = 'var(--lg-surface-2)'): string {
  const p = clamp(Math.round(percent), 0, 100)
  if (p >= 100) return color
  if (p <= 0) return base
  return `color-mix(in oklab, ${color} ${p}%, ${base})`
}

/** Fem steg från ytfärg till full färg – används av värmekartan och dess teckenförklaring. */
export function heatScale(color = 'var(--lg-gran)', steps = 5, base = 'var(--lg-surface-2)'): string[] {
  const n = Math.max(2, Math.floor(steps))
  return Array.from({ length: n }, (_, i) => (i === 0 ? base : tint(color, 18 + ((100 - 18) * (i - 1)) / (n - 2), base)))
}

// ---------------------------------------------------------------------------
// Tidsaxel
// ---------------------------------------------------------------------------

export interface TimeTick {
  date: ISODate
  label: string
}

/**
 * Svenska etiketter för en tidsaxel från `start` till `end`, högst `maxTicks` stycken.
 * Väljer automatiskt dag-, vecko- (måndagar), månads- eller kvartalssteg.
 * Med `weekNumbers` visas veckosteg som "v. 39" i stället för datum.
 */
export function timeTicks(start: ISODate, end: ISODate, maxTicks = 6, opts: { weekNumbers?: boolean } = {}): TimeTick[] {
  const span = diffDays(start, end)
  const max = Math.max(1, Math.floor(maxTicks))
  if (span <= 0) return [{ date: start, label: formatDayShort(start) }]

  // Dagsteg
  for (const step of [1, 2, 3]) {
    if (Math.floor(span / step) + 1 <= max) {
      const out: TimeTick[] = []
      for (let i = 0; i <= span; i += step) {
        const d = addDays(start, i)
        out.push({ date: d, label: formatDayShort(d) })
      }
      return out
    }
  }

  // Veckosteg – alltid på måndagar
  const firstMonday = addDays(start, (7 - weekdayIndex(start)) % 7)
  for (const weeks of [1, 2]) {
    const count = Math.floor(diffDays(firstMonday, end) / (7 * weeks)) + 1
    if (diffDays(firstMonday, end) >= 0 && count <= max) {
      const out: TimeTick[] = []
      for (let d = firstMonday; diffDays(d, end) >= 0; d = addDays(d, 7 * weeks)) {
        out.push({ date: d, label: opts.weekNumbers ? `v. ${isoWeek(d)}` : formatDayShort(d) })
      }
      return out
    }
  }

  // Månads- och kvartalssteg – den 1:a i månaden
  const s = fromISODate(start)
  const e = fromISODate(end)
  const crossesYear = s.getFullYear() !== e.getFullYear()
  for (const months of [1, 2, 3, 6, 12]) {
    const out: TimeTick[] = []
    const cursor = new Date(s.getFullYear(), s.getMonth() + (s.getDate() === 1 ? 0 : 1), 1)
    // Justera till en månad som är delbar med steget (jan, apr, jul, okt för kvartal).
    while (cursor.getMonth() % months !== 0) cursor.setMonth(cursor.getMonth() + 1)
    while (cursor <= e) {
      const m = cursor.getMonth()
      out.push({
        date: toISODate(cursor),
        label: m === 0 && crossesYear ? String(cursor.getFullYear()) : MONTHS_SHORT[m],
      })
      cursor.setMonth(cursor.getMonth() + months)
    }
    if (out.length <= max) return out
  }
  return [
    { date: start, label: String(s.getFullYear()) },
    { date: end, label: String(e.getFullYear()) },
  ]
}

// ---------------------------------------------------------------------------
// Tooltip och mätning
// ---------------------------------------------------------------------------

/** Tailwind-klasser för diagrammens tooltip – samma utseende överallt. */
export const TOOLTIP_CLASS =
  'pointer-events-none absolute z-10 min-w-[7.5rem] rounded-2xl border border-line/70 bg-surface/95 px-3 py-2 text-left shadow-[var(--shadow-float)] backdrop-blur-md'

/**
 * Horisontell placering av en tooltip så att den inte hamnar utanför diagrammet:
 * centrerad över punkten, men vänster-/högerjusterad nära kanterna.
 */
export function tooltipPlacement(anchorX: number, containerWidth: number, edge = 64): { left: number; translate: string } {
  if (anchorX < edge) return { left: Math.max(0, anchorX - 12), translate: '0' }
  if (anchorX > containerWidth - edge) return { left: Math.min(containerWidth, anchorX + 12), translate: '-100%' }
  return { left: anchorX, translate: '-50%' }
}

/** Ungefärlig textbredd i pixlar för små diagrametiketter (Inter ~11 px, siffror tabulära). */
export function approxTextWidth(text: string, fontSize = 11): number {
  return text.length * fontSize * 0.6
}

/** Standardfärger för serier i fast ordning (färgen följer serien, aldrig dess rang). */
export const SERIES_COLORS = [
  'var(--lg-gran)',
  'var(--lg-blabar)',
  'var(--lg-hjortron)',
  'var(--lg-lingon)',
  'var(--lg-fjall)',
  'var(--lg-vinbar)',
] as const

/**
 * Mät ett elements bredd och följ storleksändringar med ResizeObserver.
 * Returnerar `fallback` tills elementet har mätts (och i testmiljöer utan layout).
 */
export function useElementWidth<T extends HTMLElement = HTMLDivElement>(fallback = 320): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = (w: number) => setWidth((prev) => (Math.abs(prev - w) < 0.5 ? prev : Math.round(w)))
    measure(el.getBoundingClientRect().width)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w !== undefined) measure(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width > 0 ? width : fallback]
}

/**
 * Mät ett element som kan monteras och avmonteras (t.ex. en tooltip) via en callback-ref.
 * Storleken uppdateras före målning, så placeringen blir rätt redan första gången.
 */
export function useMeasuredSize<T extends HTMLElement = HTMLDivElement>(): [
  (el: T | null) => void,
  { width: number; height: number } | null,
] {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const observer = useRef<ResizeObserver | null>(null)
  const update = useCallback((width: number, height: number) => {
    setSize((prev) => (prev && Math.abs(prev.width - width) < 0.5 && Math.abs(prev.height - height) < 0.5 ? prev : { width, height }))
  }, [])
  const ref = useCallback(
    (el: T | null) => {
      observer.current?.disconnect()
      observer.current = null
      if (!el) return
      const r = el.getBoundingClientRect()
      update(r.width, r.height)
      if (typeof ResizeObserver === 'undefined') return
      const ro = new ResizeObserver((entries) => {
        const box = entries[0]?.borderBoxSize?.[0]
        if (box) update(box.inlineSize, box.blockSize)
      })
      ro.observe(el)
      observer.current = ro
    },
    [update],
  )
  return [ref, size]
}
