/**
 * Tallriken – Livsmedelsverkets Tallriksmodell som en illustration sedd ovanifrån.
 *
 * En keramiktallrik med skuggad kant och en tunn blå dekorlinje (en blinkning åt svenska
 * klassiker som Gustavsbergs "Blå band"), gaffel till vänster och kniv till höger – som man
 * dukar i Sverige. På tallriken ligger tre delar, stora som den faktiska fördelningen:
 * kolhydrater (hjortron), protein (lingon) och grönsaker (mossa), med en diskret textur
 * (gryn, grillränder, blad). Streckade linjer visar idealfördelningen.
 *
 * En tom tallrik är lika vacker: idealdelarna ritas streckade och mjukt tonade, med en vänlig text.
 *
 * Delarna ligger i samma ordning som idealet, medurs från klockan tolv – kolhydrater, protein,
 * grönsaker – så att skillnaden mot de streckade idealgränserna blir lätt att se.
 */
import { useEffect, useId, type ReactNode } from 'react'
import { motion, useReducedMotion, useSpring, useTransform, type MotionValue } from 'motion/react'
import { formatNumber } from '../../lib/format'
import { PLATE_IDEAL, PLATE_PART_LABELS, type PlatePart } from '../../lib/plate'
import type { PlateSplit } from '../../types'

export interface PlateModelProps {
  /** Faktiska andelar (0–1) av grönsaker, kolhydrater och protein. Normaliseras om summan > 1. */
  fractions: PlateSplit
  /** Idealfördelning (standard: Tallriksmodellen "vanlig" – 50/30/20). */
  ideal?: PlateSplit
  /** Bredd i px (standard 280). Höjden följer bildformatet 280 × 220. */
  size?: number
  /** Visa procent på tallriken och en förklaring under (standard true). */
  showLabels?: boolean
  /** Tvinga tomt läge. Blir automatiskt tomt när alla andelar är 0. */
  empty?: boolean
  /** Visa gaffel och kniv (standard true). */
  cutlery?: boolean
  className?: string
}

// ---------------------------------------------------------------------------
// Delar och färger
// ---------------------------------------------------------------------------

/** Ordning medurs från klockan tolv. */
const ORDER: readonly PlatePart[] = ['carb', 'protein', 'veg']

const PART_STYLE: Record<PlatePart, { short: string; color: string; soft: string }> = {
  carb: { short: 'Kolhydrater', color: 'var(--lg-hjortron)', soft: 'var(--lg-hjortron-soft)' },
  protein: { short: 'Protein', color: 'var(--lg-lingon)', soft: 'var(--lg-lingon-soft)' },
  veg: { short: 'Grönsaker', color: 'var(--lg-mossa)', soft: 'var(--lg-mossa-soft)' },
}

// ---------------------------------------------------------------------------
// Geometri (viewBox 300 × 220)
// ---------------------------------------------------------------------------

/** Synlig del av ritytan (x från 10) – gaffel och kniv ligger nära tallriken. */
const VB_X = 10
const VB_W = 280
const VB_H = 220
const CX = 150
const CY = 106
/** Tallrikens ytterkant, dekorlinje, brunn (spegel) och matyta. */
const R_PLATE = 95
const R_BAND = 87.5
const R_WELL = 71
const R_FOOD = 67
/** Luft mellan delarna och rundning av hörnen. */
const GAP = 3.4
const CORNER = 5

type Pt = { x: number; y: number }

/** Punkt runt tallrikens mitt, vinkel i grader medurs från klockan tolv. */
function polar(angle: number, r: number): Pt {
  const a = (angle * Math.PI) / 180
  return { x: CX + r * Math.sin(a), y: CY - r * Math.cos(a) }
}

/** Sluten polygon med rundade hörn (kvadratiska kurvor), radien begränsas av kantlängderna. */
function roundedPolygon(points: Pt[], radius: number): string {
  const n = points.length
  if (n < 3) return ''
  let d = ''
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n]
    const cur = points[i]
    const next = points[(i + 1) % n]
    const l1 = Math.hypot(cur.x - prev.x, cur.y - prev.y)
    const l2 = Math.hypot(next.x - cur.x, next.y - cur.y)
    const r = Math.min(radius, l1 / 2, l2 / 2)
    const a = { x: cur.x + ((prev.x - cur.x) / (l1 || 1)) * r, y: cur.y + ((prev.y - cur.y) / (l1 || 1)) * r }
    const b = { x: cur.x + ((next.x - cur.x) / (l2 || 1)) * r, y: cur.y + ((next.y - cur.y) / (l2 || 1)) * r }
    d += `${i === 0 ? 'M' : 'L'}${a.x.toFixed(2)} ${a.y.toFixed(2)}Q${cur.x.toFixed(2)} ${cur.y.toFixed(2)} ${b.x.toFixed(2)} ${b.y.toFixed(2)}`
  }
  return `${d}Z`
}

/**
 * Tårtbit från vinkel a0 till a1 (grader), indragen med halva luckan mot grannarna och
 * med rundade hörn. En hel tallrik (≈ 360°) blir en cirkel.
 */
export function wedgePath(a0: number, a1: number, r = R_FOOD, gap = GAP, corner = CORNER): string {
  const span = a1 - a0
  if (!(span > 0.5)) return ''
  if (span >= 359.5) {
    const rr = r - gap / 2
    return `M${CX - rr} ${CY}a${rr} ${rr} 0 1 0 ${rr * 2} 0a${rr} ${rr} 0 1 0 ${-rr * 2} 0Z`
  }
  const h = gap / 2
  const rr = r - h
  // Spetsen flyttas längs bisektrisen så att båda raka kanterna hamnar h från originalkanten.
  const half = (span * Math.PI) / 360
  const apexDist = Math.min(h / Math.max(Math.sin(half), 0.05), rr * 0.6)
  const apex = polar(a0 + span / 2, apexDist)
  // Ytterhörnen: där de förskjutna kanterna möter den indragna bågen.
  const delta = (Math.asin(Math.min(1, h / rr)) * 180) / Math.PI
  const from = a0 + delta
  const to = a1 - delta
  if (!(to - from > 0.5)) return ''
  const pts: Pt[] = [apex]
  const steps = Math.max(2, Math.ceil((to - from) / 6))
  for (let i = 0; i <= steps; i++) pts.push(polar(from + ((to - from) * i) / steps, rr))
  return roundedPolygon(pts, corner)
}

/** Normalisera andelar: negativa/ogiltiga → 0 och summa högst 1. */
export function normalizeFractions(f: PlateSplit): PlateSplit {
  const clean = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0)
  const veg = clean(f.veg)
  const carb = clean(f.carb)
  const protein = clean(f.protein)
  const sum = veg + carb + protein
  if (sum <= 1) return { veg, carb, protein }
  return { veg: veg / sum, carb: carb / sum, protein: protein / sum }
}

/** Vinkelintervall (grader) för varje del i ordningen kolhydrater → protein → grönsaker. */
function ranges(f: PlateSplit): Record<PlatePart, [number, number]> {
  const out = {} as Record<PlatePart, [number, number]>
  let acc = 0
  for (const part of ORDER) {
    const from = acc
    acc += f[part] * 360
    out[part] = [from, acc]
  }
  return out
}

/** "hälften", "en femtedel" … för idealandelar i den vänliga texten. */
export function fractionWords(v: number): string {
  const near = (x: number) => Math.abs(v - x) < 0.015
  if (near(0.5)) return 'hälften'
  if (near(0.4)) return 'två femtedelar'
  if (near(1 / 3)) return 'en tredjedel'
  if (near(0.3)) return 'knappt en tredjedel'
  if (near(0.25)) return 'en fjärdedel'
  if (near(0.2)) return 'en femtedel'
  return `${formatNumber(v * 100)} %`
}

const pct = (v: number) => `${formatNumber(v * 100)} %`

/** Uppläst beskrivning av tallriken. */
export function describePlate(fractions: PlateSplit, ideal: PlateSplit, empty: boolean): string {
  if (empty) {
    return `Tallriksmodellen: tallriken är tom. Idealet är ${pct(ideal.veg)} grönsaker, ${pct(ideal.carb)} kolhydrater och ${pct(ideal.protein)} protein.`
  }
  const parts = (['veg', 'carb', 'protein'] as const).map(
    (p) => `${PART_STYLE[p].short.toLowerCase()} ${pct(fractions[p])} (mål ${pct(ideal[p])})`,
  )
  return `Tallriksmodellen: ${parts.join(', ')}.`
}

// ---------------------------------------------------------------------------
// Delkomponenter
// ---------------------------------------------------------------------------

/** Gaffel till vänster och kniv till höger – borstat stål i tokenfärger. */
function Cutlery({ metalId, shadowId }: { metalId: string; shadowId: string }) {
  return (
    <g aria-hidden="true">
      <g filter={`url(#${shadowId})`} style={{ opacity: 0.55 }}>
        <rect x={27.5} y={40} width={10} height={146} rx={5} style={{ fill: 'var(--lg-shadow-b)' }} />
        <rect x={263} y={36} width={10} height={150} rx={5} style={{ fill: 'var(--lg-shadow-b)' }} />
      </g>
      {/* Gaffel: fyra pinnar, ett mjukt "skaft-huvud", smal hals och rundat handtag. */}
      <g fill={`url(#${metalId})`} transform="translate(8 0)">
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} x={16.4 + i * 3.75} y={34} width={2.3} height={40} rx={1.15} />
        ))}
        <path d="M16.4 68 L31.7 68 Q31.7 84 26.6 89 L22.5 89 Q16.4 84 16.4 68 Z" />
        <rect x={22.3} y={86} width={4.4} height={26} rx={1.6} />
        <path d="M24.5 108 C29.4 108 29.6 112 29.6 118 L29.6 178 Q29.6 184 24.5 184 Q19.4 184 19.4 178 L19.4 118 C19.4 112 19.6 108 24.5 108 Z" />
      </g>
      {/* Kniv: rak rygg, rundad egg och spets, liten bolster och handtag. */}
      <g fill={`url(#${metalId})`} transform="translate(-8 0)">
        <path d="M271.8 108 L271.8 44 Q271.8 31 278 31 Q281.6 32 281.2 50 L280.4 108 Z" />
        <rect x={271.2} y={106} width={9.6} height={5} rx={1.4} />
        <path d="M276 110 C280.6 110 280.8 114 280.8 119 L280.8 178 Q280.8 184 276 184 Q271.2 184 271.2 178 L271.2 119 C271.2 114 271.4 110 276 110 Z" />
      </g>
      {/* Blänk längs stålet. */}
      <path d="M29 116 L29 176" strokeWidth={0.9} strokeLinecap="round" style={{ stroke: 'var(--lg-surface)', opacity: 0.45 }} />
      <path d="M265.4 118 L265.4 176 M265.6 46 L265.6 104" strokeWidth={0.9} strokeLinecap="round" style={{ stroke: 'var(--lg-surface)', opacity: 0.45 }} />
    </g>
  )
}

/** En animerad del av tallriken: grundfärg + diskret textur. */
function Portion({ d, color, patternId }: { d: MotionValue<string>; color: string; patternId: string }) {
  return (
    <>
      <motion.path d={d} style={{ fill: color }} />
      <motion.path d={d} fill={`url(#${patternId})`} style={{ opacity: 0.38 }} />
    </>
  )
}

// ---------------------------------------------------------------------------
// Komponent
// ---------------------------------------------------------------------------

const SPRING = { stiffness: 80, damping: 20, mass: 1 }

/**
 * ```tsx
 * const plate = mealPlate(entries)
 * <PlateModel fractions={plate.fractions} ideal={plate.ideal} empty={!plate.hasPlate} />
 * ```
 */
export function PlateModel({
  fractions,
  ideal = PLATE_IDEAL.vanlig,
  size = 280,
  showLabels = true,
  empty: emptyProp = false,
  cutlery = true,
  className = '',
}: PlateModelProps) {
  const reduce = useReducedMotion() ?? false
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const id = (name: string) => `plate-${name}-${uid}`

  const actual = normalizeFractions(fractions)
  const idealN = normalizeFractions(ideal)
  const empty = emptyProp || actual.veg + actual.carb + actual.protein <= 0.001
  const shown = empty ? { veg: 0, carb: 0, protein: 0 } : actual

  // Fjädrande andelar: tallriken "serveras" vid första visning och glider vid ändringar.
  const carb = useSpring(reduce ? shown.carb : 0, SPRING)
  const protein = useSpring(reduce ? shown.protein : 0, SPRING)
  const veg = useSpring(reduce ? shown.veg : 0, SPRING)
  useEffect(() => {
    const apply = (mv: MotionValue<number>, v: number) => (reduce ? mv.jump(v) : mv.set(v))
    apply(carb, shown.carb)
    apply(protein, shown.protein)
    apply(veg, shown.veg)
  }, [carb, protein, veg, shown.carb, shown.protein, shown.veg, reduce])

  const dCarb = useTransform([carb], ([c]: number[]) => wedgePath(0, c * 360))
  const dProtein = useTransform([carb, protein], ([c, p]: number[]) => wedgePath(c * 360, (c + p) * 360))
  const dVeg = useTransform([carb, protein, veg], ([c, p, v]: number[]) => wedgePath((c + p) * 360, (c + p + v) * 360))

  const actualRanges = ranges(shown)
  const idealRanges = ranges(idealN)
  const idealBoundaries = [...new Set([0, idealRanges.protein[0], idealRanges.veg[0], idealRanges.veg[1] % 360])]

  const height = (size * VB_H) / VB_W
  const label = describePlate(actual, idealN, empty)

  return (
    <figure
      className={`m-0 inline-flex flex-col items-center [--plate:var(--lg-surface)] [--plate-edge:color-mix(in_oklab,var(--lg-line)_80%,var(--lg-surface))] dark:[--plate:var(--lg-surface-3)] dark:[--plate-edge:color-mix(in_oklab,var(--lg-ink-3)_28%,var(--lg-surface-3))] ${className}`}
      style={{ width: size }}
    >
      <svg role="img" aria-label={label} viewBox={`${VB_X} 0 ${VB_W} ${VB_H}`} width={size} height={height} className="overflow-visible">
        <defs>
          {/* Tallrikens färg: vitt porslin i ljust tema, mörkt stengods i mörkt (variabler på <figure>). */}
          <radialGradient id={id('rim')} cx="50%" cy="46%" r="52%">
            <stop offset="72%" style={{ stopColor: 'var(--plate)' }} />
            <stop offset="100%" style={{ stopColor: 'color-mix(in oklab, var(--plate) 78%, var(--lg-surface-3))' }} />
          </radialGradient>
          <radialGradient id={id('well')} cx="46%" cy="42%" r="60%">
            <stop offset="0%" style={{ stopColor: 'var(--plate)' }} />
            <stop offset="100%" style={{ stopColor: 'color-mix(in oklab, var(--plate) 88%, var(--lg-surface-2))' }} />
          </radialGradient>
          <linearGradient id={id('metal')} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" style={{ stopColor: 'color-mix(in oklab, var(--lg-ink-3) 62%, var(--lg-surface))' }} />
            <stop offset="45%" style={{ stopColor: 'color-mix(in oklab, var(--lg-ink-3) 34%, var(--lg-surface))' }} />
            <stop offset="100%" style={{ stopColor: 'color-mix(in oklab, var(--lg-ink-3) 70%, var(--lg-surface))' }} />
          </linearGradient>
          <filter id={id('shadow')} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
          <filter id={id('soft')} x="-50%" y="-10%" width="200%" height="120%">
            <feGaussianBlur stdDeviation="1.6" />
          </filter>
          {/* Texturer: gryn/potatis, grillränder och små blad/ärtor. */}
          <pattern id={id('tex-carb')} width="11" height="11" patternUnits="userSpaceOnUse" patternTransform="rotate(18)">
            <ellipse cx="3" cy="3" rx="2.1" ry="1.1" style={{ fill: 'var(--lg-hjortron-soft)' }} />
            <ellipse cx="8.5" cy="8.5" rx="2.1" ry="1.1" style={{ fill: 'var(--lg-hjortron-soft)' }} />
          </pattern>
          <pattern id={id('tex-protein')} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(-38)">
            <rect x="0" y="0" width="9" height="1.6" rx="0.8" style={{ fill: 'color-mix(in oklab, var(--lg-lingon) 55%, black)' }} />
          </pattern>
          <pattern id={id('tex-veg')} width="12" height="12" patternUnits="userSpaceOnUse">
            <circle cx="3" cy="3" r="1.5" style={{ fill: 'var(--lg-mossa-soft)' }} />
            <path d="M8 7 q2.4 -2.2 3.6 0 q-2.4 2.2 -3.6 0Z" style={{ fill: 'color-mix(in oklab, var(--lg-mossa) 60%, var(--lg-gran))' }} />
            <circle cx="9.5" cy="11" r="0.9" style={{ fill: 'var(--lg-mossa-soft)' }} />
          </pattern>
          <clipPath id={id('well-clip')}>
            <circle cx={CX} cy={CY} r={R_WELL} />
          </clipPath>
        </defs>

        {cutlery && <Cutlery metalId={id('metal')} shadowId={id('soft')} />}

        {/* Tallriken: skugga, kant med dekorlinje och en svagt skålad brunn. */}
        <ellipse cx={CX} cy={CY + 7} rx={R_PLATE - 2} ry={R_PLATE - 5} filter={`url(#${id('shadow')})`} style={{ fill: 'var(--lg-shadow-b)' }} />
        <circle cx={CX} cy={CY} r={R_PLATE} fill={`url(#${id('rim')})`} />
        <circle cx={CX} cy={CY} r={R_PLATE - 0.6} fill="none" strokeWidth={1.2} style={{ stroke: 'var(--plate-edge)' }} />
        <circle cx={CX} cy={CY} r={R_BAND} fill="none" strokeWidth={1.3} style={{ stroke: 'var(--lg-fjall)', opacity: 0.5 }} />
        <circle cx={CX} cy={CY} r={R_BAND - 2.4} fill="none" strokeWidth={0.6} style={{ stroke: 'var(--lg-fjall)', opacity: 0.35 }} />
        <circle cx={CX} cy={CY} r={R_WELL} fill={`url(#${id('well')})`} strokeWidth={1.4} style={{ stroke: 'var(--plate-edge)' }} />
        {/* Glasyrens blänk uppe till vänster (syns främst på mörk stengodstallrik). */}
        <path
          d={`M${polar(-80, R_PLATE - 4).x} ${polar(-80, R_PLATE - 4).y}A${R_PLATE - 4} ${R_PLATE - 4} 0 0 1 ${polar(-12, R_PLATE - 4).x} ${polar(-12, R_PLATE - 4).y}`}
          fill="none"
          strokeWidth={2.2}
          strokeLinecap="round"
          style={{ stroke: 'color-mix(in srgb, white 16%, transparent)' }}
        />

        <g clipPath={`url(#${id('well-clip')})`}>
          {empty ? (
            // Tom tallrik: idealdelarna mjukt tonade med streckad kontur.
            ORDER.map((part) => {
              const [a0, a1] = idealRanges[part]
              return (
                <path
                  key={part}
                  data-testid={`plate-ideal-${part}`}
                  d={wedgePath(a0, a1)}
                  strokeWidth={1.3}
                  strokeDasharray="4 3.5"
                  strokeLinejoin="round"
                  style={{ fill: PART_STYLE[part].soft, stroke: PART_STYLE[part].color, opacity: 0.85 }}
                />
              )
            })
          ) : (
            <>
              <Portion d={dCarb} color={PART_STYLE.carb.color} patternId={id('tex-carb')} />
              <Portion d={dProtein} color={PART_STYLE.protein.color} patternId={id('tex-protein')} />
              <Portion d={dVeg} color={PART_STYLE.veg.color} patternId={id('tex-veg')} />
              {/* Idealets gränser som streckade linjer ovanpå maten. */}
              {idealBoundaries.map((a) => {
                const p = polar(a, R_WELL - 1)
                return (
                  <line
                    key={a}
                    data-testid="plate-ideal-line"
                    x1={CX}
                    y1={CY}
                    x2={p.x}
                    y2={p.y}
                    strokeWidth={1.4}
                    strokeDasharray="3.5 3"
                    strokeLinecap="round"
                    style={{ stroke: 'var(--lg-ink)', opacity: 0.45 }}
                  />
                )
              })}
              <circle cx={CX} cy={CY} r={1.6} style={{ fill: 'var(--lg-ink)', opacity: 0.4 }} />
            </>
          )}
        </g>

        {/* Procent på tallriken. */}
        {showLabels &&
          ORDER.map((part) => {
            const share = empty ? idealN[part] : shown[part]
            if (share < 0.1) return null
            const [a0, a1] = empty ? idealRanges[part] : actualRanges[part]
            const mid = (a0 + a1) / 2
            const p = polar(mid, share > 0.45 ? R_FOOD * 0.5 : R_FOOD * 0.6)
            return (
              <motion.text
                key={part}
                x={p.x}
                y={p.y}
                textAnchor="middle"
                dominantBaseline="central"
                className="display-num"
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: reduce ? 0 : 0.45, duration: 0.4 }}
                style={{
                  fontSize: empty ? 13 : 15,
                  fontWeight: 600,
                  fill: empty ? PART_STYLE[part].color : 'var(--lg-on-gran)',
                }}
              >
                {pct(share)}
              </motion.text>
            )
          })}
      </svg>

      {showLabels && (
        <figcaption className="mt-3 w-full">
          {empty ? <EmptyCaption ideal={idealN} /> : <Legend actual={shown} ideal={idealN} />}
        </figcaption>
      )}
    </figure>
  )
}

function Legend({ actual, ideal }: { actual: PlateSplit; ideal: PlateSplit }) {
  const items: ReactNode[] = (['veg', 'carb', 'protein'] as const).map((part) => (
    <li key={part} className="flex min-w-0 flex-col items-center gap-0.5 text-center" title={PLATE_PART_LABELS[part].label}>
      <span className="flex items-center gap-1.5 text-xs font-medium text-ink-2">
        <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: PART_STYLE[part].color }} aria-hidden="true" />
        {PART_STYLE[part].short}
      </span>
      <span className="display-num text-lg leading-tight text-ink">{pct(actual[part])}</span>
      <span className="tabular text-[0.6875rem] text-ink-3">mål {pct(ideal[part])}</span>
    </li>
  ))
  return <ul className="m-0 grid list-none grid-cols-3 gap-2 p-0">{items}</ul>
}

function EmptyCaption({ ideal }: { ideal: PlateSplit }) {
  return (
    <div className="text-center">
      <p className="font-display text-base font-medium text-balance text-ink">Tallriken väntar på något gott</p>
      <p className="mx-auto mt-1 max-w-[30ch] text-sm leading-snug text-balance text-ink-3">
        Sikta på {fractionWords(ideal.veg)} grönsaker, {fractionWords(ideal.carb)} potatis, pasta eller gryn och{' '}
        {fractionWords(ideal.protein)} protein.
      </p>
    </div>
  )
}
