/**
 * Dagsringen – hjälten på Idag-skärmen.
 *
 * En tjock, rundad ring där dagens ätna energi ritas som på varandra följande bågar,
 * färgade efter makronas energiandel: protein (lingon), kolhydrater (hjortron) och fett (blåbär).
 * Ringen börjar och slutar vid en liten sol högst upp – målet vilar som midnattssolen på
 * horisonten, precis som i Lagoms logotyp. Energi från träning syns som ett mossgrönt parti
 * i slutet av spåret ("intjänat utrymme").
 *
 * Över budget fylls ringen och ett tunnare yttre varv i hjortron visar överskottet – aldrig
 * med larmrött, och texten säger "140 kcal över – helt okej".
 *
 * Medvetet läge döljer alla siffror och visar i stället ett ord ("Lagom", "Lite kvar",
 * "Mätt och belåten" …).
 *
 * Alla färger kommer från designsystemets CSS-variabler, så mörkt läge fungerar automatiskt.
 * Animationer (motion) hoppas över vid reducerad rörelse.
 */
import { useEffect, useId } from 'react'
import { motion, useReducedMotion, useSpring, useTransform, type MotionValue } from 'motion/react'
import { formatEnergy, formatNumber } from '../../lib/format'
import { KCAL_PER_G } from '../../lib/nutrients'

// ---------------------------------------------------------------------------
// Publika typer
// ---------------------------------------------------------------------------

/** Ätna gram av makronäringsämnena. */
export interface CalorieRingMacros {
  protein: number
  carbs: number
  fat: number
}

export interface CalorieRingProps {
  /** Ätit hittills idag, kcal. */
  eatenKcal: number
  /** Dagens energimål i kcal (utan träning). */
  budgetKcal: number
  /**
   * Energi från träning som läggs till budgeten, kcal – redan justerad för användarens
   * återläggningsandel (dvs. `dailyBudget(...) − mål`). Visas som ett grönt parti i spåret.
   */
  exerciseKcal?: number
  /** Ätna gram protein, kolhydrater och fett – ger färgade bågsegment efter energiandel. */
  macros?: CalorieRingMacros
  /** Medvetet läge: inga siffror, bara ett varmt ord. */
  mindful?: boolean
  /** Diameter i px (standard 240). */
  size?: number
  /** Enhet för siffrorna (standard kcal). */
  unit?: 'kcal' | 'kJ'
  className?: string
}

/** 'tom' = inget ätet, 'kvar' = under målet, 'lagom' = inom ±3 %, 'over' = över målet. */
export type RingStatus = 'tom' | 'kvar' | 'lagom' | 'over'

export interface RingSummary {
  /** Mål + träning, kcal (minst 1). */
  total: number
  eaten: number
  /** Kvar till målet (≥ 0). */
  remaining: number
  /** Över målet (≥ 0). */
  over: number
  /** eaten / total */
  ratio: number
  status: RingStatus
}

/** Hur nära målet (andel av budgeten) som räknas som "precis lagom". */
export const LAGOM_TOLERANCE = 0.03

// ---------------------------------------------------------------------------
// Rena hjälpfunktioner (testbara)
// ---------------------------------------------------------------------------

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const finite = (v: number | undefined) => (v !== undefined && Number.isFinite(v) ? v : 0)

/** Sammanfatta dagens läge: kvar, över, andel och status. */
export function summarizeRing(eatenKcal: number, budgetKcal: number, exerciseKcal = 0): RingSummary {
  const eaten = Math.max(0, finite(eatenKcal))
  const total = Math.max(1, Math.max(0, finite(budgetKcal)) + Math.max(0, finite(exerciseKcal)))
  const ratio = eaten / total
  const remaining = Math.max(0, total - eaten)
  const over = Math.max(0, eaten - total)
  let status: RingStatus = 'kvar'
  if (eaten <= 0) status = 'tom'
  else if (Math.abs(ratio - 1) <= LAGOM_TOLERANCE) status = 'lagom'
  else if (ratio > 1) status = 'over'
  return { total, eaten, remaining, over, ratio, status }
}

/** Makronas andel av energin (0–1, summa 1) – eller null om inget är känt. */
export function macroEnergyShares(macros?: CalorieRingMacros): CalorieRingMacros | null {
  if (!macros) return null
  const p = Math.max(0, finite(macros.protein)) * KCAL_PER_G.protein
  const c = Math.max(0, finite(macros.carbs)) * KCAL_PER_G.carbs
  const f = Math.max(0, finite(macros.fat)) * KCAL_PER_G.fat
  const sum = p + c + f
  if (sum <= 0) return null
  return { protein: p / sum, carbs: c / sum, fat: f / sum }
}

/** Ord för medvetet läge – varma, icke-dömande och utan siffror. */
export function mindfulLabel(ratio: number): { title: string; hint: string } {
  if (!(ratio > 0)) return { title: 'Redo för dagen', hint: 'Ät när hungern säger till' }
  if (ratio < 0.35) return { title: 'Gott om utrymme', hint: 'Dagen har precis börjat' }
  if (ratio < 0.7) return { title: 'På god väg', hint: 'Lyssna på hungern' }
  if (ratio < 1 - LAGOM_TOLERANCE) return { title: 'Lite kvar', hint: 'Något gott och lagom räcker' }
  if (ratio <= 1 + LAGOM_TOLERANCE) return { title: 'Lagom', hint: 'Precis lagom idag' }
  if (ratio <= 1.25) return { title: 'Mätt och belåten', hint: 'Helt okej – det jämnar ut sig' }
  return { title: 'Riktigt mätt', hint: 'Helt okej – imorgon är en ny dag' }
}

/** Uppläst beskrivning av ringen (aria-label). */
export function describeRing(summary: RingSummary, opts: { shares?: CalorieRingMacros | null; exerciseKcal?: number; mindful?: boolean; unit?: 'kcal' | 'kJ' } = {}): string {
  const unit = opts.unit ?? 'kcal'
  const e = (kcal: number) => formatEnergy(kcal, unit)
  if (opts.mindful) {
    const m = mindfulLabel(summary.ratio)
    return `Dagsringen: ${m.title}. ${m.hint}.`
  }
  const parts: string[] = []
  if (summary.over > 0 && summary.status !== 'lagom') {
    parts.push(`Dagsringen: ${e(summary.over)} över budgeten på ${e(summary.total)} – helt okej.`)
  } else if (summary.status === 'lagom') {
    parts.push(`Dagsringen: precis lagom – ${e(summary.eaten)} av ${e(summary.total)}.`)
  } else {
    parts.push(`Dagsringen: ${e(summary.remaining)} kvar av ${e(summary.total)}.`)
  }
  parts.push(`Ätit ${e(summary.eaten)}.`)
  const s = opts.shares
  if (s && summary.eaten > 0) {
    const pct = (v: number) => `${formatNumber(v * 100)} %`
    parts.push(`Energin kommer till ${pct(s.protein)} från protein, ${pct(s.carbs)} från kolhydrater och ${pct(s.fat)} från fett.`)
  }
  const ex = Math.max(0, finite(opts.exerciseKcal))
  if (ex > 0) parts.push(`Budgeten inkluderar ${e(ex)} från träning.`)
  return parts.join(' ')
}

// ---------------------------------------------------------------------------
// Geometri (viewBox 200 × 200)
// ---------------------------------------------------------------------------

const C = 100
/** Huvudringens radie och tjocklek. */
const R = 80
const T = 15
/** Solen i toppen. */
const SUN_R = 5.4
const SUN_Y = C - R
/** Överskottsvarvet – tunnare, utanför huvudringen. */
const OT = 4.5
const OR = R + T / 2 + 3.5 + OT / 2
/** Halva luckan runt solen i grader: solens radie + luft + halva linjetjockleken (rundade ändar). */
const HALF_GAP = ((SUN_R + 2.8 + T / 2) / R) * (180 / Math.PI)
const START = HALF_GAP
const END = 360 - HALF_GAP
const SPAN = END - START
/** Tunn fog mellan makrosegmenten (grader). */
const SEAM = 1.3

/** Punkt på en cirkel, vinkel i grader medurs från klockan tolv. */
function polar(angle: number, r: number): { x: number; y: number } {
  const a = (angle * Math.PI) / 180
  return { x: C + r * Math.sin(a), y: C - r * Math.cos(a) }
}

/** SVG-båge medurs från a0 till a1 (grader). Tom sträng om bågen är försumbar. */
export function arcPath(r: number, a0: number, a1: number): string {
  if (!(a1 - a0 > 0.05)) return ''
  const end = Math.min(a1, a0 + 359.99)
  const p0 = polar(a0, r)
  const p1 = polar(end, r)
  const large = end - a0 > 180 ? 1 : 0
  return `M${p0.x.toFixed(3)} ${p0.y.toFixed(3)}A${r} ${r} 0 ${large} 1 ${p1.x.toFixed(3)} ${p1.y.toFixed(3)}`
}

/** Vinklar för segment i (0–2) givet animerad fyllnad q (0–1) och andelar. */
function segmentRange(i: number, q: number, shares: readonly number[]): [number, number] | null {
  const fill = clamp(q, 0, 1)
  const b = [0, shares[0], shares[0] + shares[1], 1]
  let from = START + b[i] * fill * SPAN
  let to = START + b[i + 1] * fill * SPAN
  if (i > 0 && shares[i - 1] > 0.001) from += SEAM / 2
  if (i < 2 && shares[i + 1] > 0.001) to -= SEAM / 2
  return to - from > 0.15 ? [from, to] : null
}

const SEGMENT_COLORS = ['var(--lg-lingon)', 'var(--lg-hjortron)', 'var(--lg-blabar)'] as const
const MONO_COLOR = 'var(--lg-gran)'
const TRACK = 'color-mix(in oklab, var(--lg-surface-3) 70%, var(--lg-surface-2))'
const EXERCISE_TRACK = 'color-mix(in oklab, var(--lg-mossa) 30%, var(--lg-surface-2))'

// Överdämpad fjäder: mjuk men utan överslag (så att överskottsvarvet inte blinkar till).
const RING_SPRING = { stiffness: 70, damping: 20, mass: 1 }
const NUM_SPRING = { stiffness: 90, damping: 24, mass: 1 }

// ---------------------------------------------------------------------------
// Komponent
// ---------------------------------------------------------------------------

/**
 * ```tsx
 * <CalorieRing eatenKcal={860} budgetKcal={2100} exerciseKcal={180}
 *   macros={{ protein: 52, carbs: 96, fat: 30 }} />
 * ```
 */
export function CalorieRing({
  eatenKcal,
  budgetKcal,
  exerciseKcal = 0,
  macros,
  mindful = false,
  size = 240,
  unit = 'kcal',
  className = '',
}: CalorieRingProps) {
  const reduce = useReducedMotion() ?? false
  const summary = summarizeRing(eatenKcal, budgetKcal, exerciseKcal)
  const shares = macroEnergyShares(macros)
  const exercise = Math.max(0, finite(exerciseKcal))

  // Andelar för de tre segmenten. Utan makron ritas en enda granfärgad båge.
  const mono = shares === null
  const target = mono ? [1, 0, 0] : [shares.protein, shares.carbs, shares.fat]
  const [t0, t1] = target
  const colors = mono ? [MONO_COLOR, SEGMENT_COLORS[1], SEGMENT_COLORS[2]] : SEGMENT_COLORS

  // Ringens förlopp: 0–1 = huvudringen, 1–2 = överskottsvarvet.
  const progressTarget = clamp(summary.ratio, 0, 2)
  const progress = useSpring(reduce ? progressTarget : 0, RING_SPRING)
  const share0 = useSpring(target[0], RING_SPRING)
  const share1 = useSpring(target[1], RING_SPRING)

  useEffect(() => {
    const apply = (mv: MotionValue<number>, v: number) => (reduce ? mv.jump(v) : mv.set(v))
    apply(progress, progressTarget)
    apply(share0, t0)
    apply(share1, t1)
  }, [progress, share0, share1, progressTarget, t0, t1, reduce])

  const seg = (i: number) => ([q, a, b]: number[]) => {
    const r = segmentRange(i, q, [a, b, Math.max(0, 1 - a - b)])
    return r ? arcPath(R, r[0], r[1]) : ''
  }
  const d0 = useTransform([progress, share0, share1], seg(0))
  const d1 = useTransform([progress, share0, share1], seg(1))
  const d2 = useTransform([progress, share0, share1], seg(2))
  const overD = useTransform(progress, (q) => arcPath(OR, 0, clamp(q - 1, 0, 0.985) * 360))

  // Rundade ändar: cirklar i start- och slutpunkten (segmenten har raka fogar sinsemellan).
  const endX = useTransform(progress, (q) => polar(START + clamp(q, 0, 1) * SPAN, R).x)
  const endY = useTransform(progress, (q) => polar(START + clamp(q, 0, 1) * SPAN, R).y)
  const capOpacity = useTransform(progress, (q) => (q > 0.002 ? 1 : 0))
  const firstColor = colors[target.findIndex((v) => v > 0.001)] ?? MONO_COLOR
  const lastIndex = target.length - 1 - [...target].reverse().findIndex((v) => v > 0.001)
  const lastColor = colors[lastIndex] ?? MONO_COLOR
  const startPoint = polar(START, R)

  // Siffran i mitten räknar mjukt mot nytt värde (kvar eller över).
  const showOver = summary.over > 0 && summary.status !== 'lagom'
  const numTarget = showOver ? summary.over : summary.remaining
  const shown = useSpring(reduce ? numTarget : showOver ? 0 : summary.total, NUM_SPRING)
  useEffect(() => {
    if (reduce) shown.jump(numTarget)
    else shown.set(numTarget)
  }, [shown, numTarget, reduce])
  const numText = useTransform(shown, (v) => formatEnergy(Math.max(0, v), unit, false))
  const targetText = formatEnergy(numTarget, unit, false)

  // Träningens parti i slutet av spåret.
  const baseFraction = exercise > 0 ? clamp((summary.total - exercise) / summary.total, 0, 1) : 1
  const exerciseStart = START + baseFraction * SPAN

  const glowing = summary.status === 'lagom'
  const label = describeRing(summary, { shares, exerciseKcal: exercise, mindful, unit })
  // useId kan innehålla tecken som inte fungerar i url(#…) – behåll bara säkra tecken.
  const glowId = `ring-glow-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`

  const numSize = size * (targetText.length > 5 ? 0.155 : 0.19)
  const small = Math.max(11, size * 0.052)
  const mind = mindfulLabel(summary.ratio)

  return (
    <div
      role="img"
      aria-label={label}
      data-status={summary.status}
      className={`relative inline-grid shrink-0 place-items-center select-none ${className}`}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 200 200" width={size} height={size} className="absolute inset-0 overflow-visible" aria-hidden="true">
        <defs>
          <radialGradient id={glowId}>
            <stop offset="0%" style={{ stopColor: 'var(--lg-sol)', stopOpacity: 0.55 }} />
            <stop offset="100%" style={{ stopColor: 'var(--lg-sol)', stopOpacity: 0 }} />
          </radialGradient>
        </defs>

        {/* Urtavla: fin prickad inre cirkel – en tyst detalj som ger instrumentkänsla. */}
        <circle
          cx={C}
          cy={C}
          r={R - T / 2 - 5}
          fill="none"
          strokeWidth={1.1}
          strokeLinecap="round"
          strokeDasharray={`0 ${((2 * Math.PI * (R - T / 2 - 5)) / 72).toFixed(3)}`}
          style={{ stroke: 'var(--lg-ink-3)', opacity: 0.28 }}
        />

        {/* Spåret, med ett mossgrönt parti för energi från träning. */}
        <path d={arcPath(R, START, exercise > 0 ? exerciseStart - SEAM / 2 : END)} fill="none" strokeWidth={T} strokeLinecap="round" style={{ stroke: TRACK }} />
        {exercise > 0 && (
          <path
            data-testid="ring-exercise"
            d={arcPath(R, exerciseStart + SEAM / 2, END)}
            fill="none"
            strokeWidth={T}
            strokeLinecap="round"
            style={{ stroke: EXERCISE_TRACK }}
          />
        )}

        {/* Ätna bågar – protein, kolhydrater, fett (eller en granfärgad båge utan makron). */}
        <motion.circle cx={startPoint.x} cy={startPoint.y} r={T / 2} style={{ fill: firstColor, opacity: capOpacity }} />
        <motion.path d={d0} fill="none" strokeWidth={T} style={{ stroke: colors[0] }} />
        <motion.path d={d1} fill="none" strokeWidth={T} style={{ stroke: colors[1] }} />
        <motion.path d={d2} fill="none" strokeWidth={T} style={{ stroke: colors[2] }} />
        <motion.circle cx={endX} cy={endY} r={T / 2} style={{ fill: lastColor, opacity: capOpacity }} />

        {/* Överskott: ett tunnare yttre varv i hjortron – mjukt, aldrig larmrött. */}
        <motion.path
          data-testid="ring-over"
          d={overD}
          fill="none"
          strokeWidth={OT}
          strokeLinecap="round"
          style={{ stroke: 'var(--lg-hjortron)', opacity: showOver ? 0.9 : 0 }}
        />

        {/* Solen vid målet – lyser upp när dagen blir precis lagom. */}
        <g aria-hidden="true">
          <motion.circle
            cx={C}
            cy={SUN_Y}
            r={SUN_R * 3.2}
            fill={`url(#${glowId})`}
            initial={false}
            animate={glowing && !reduce ? { opacity: [0.6, 1, 0.6] } : { opacity: glowing ? 0.9 : 0 }}
            transition={glowing && !reduce ? { duration: 4, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.4 }}
          />
          {Array.from({ length: 8 }, (_, i) => {
            const a = i * 45
            const p0 = polar(a, 7.6)
            const p1 = polar(a, 9.6)
            // Strålarna ritas runt solens egen mittpunkt.
            return (
              <line
                key={a}
                x1={p0.x}
                y1={p0.y - R}
                x2={p1.x}
                y2={p1.y - R}
                strokeWidth={1.3}
                strokeLinecap="round"
                style={{ stroke: 'var(--lg-sol)', opacity: glowing ? 1 : 0.7 }}
              />
            )
          })}
          <circle cx={C} cy={SUN_Y} r={SUN_R} style={{ fill: 'var(--lg-sol)' }} />
          <circle cx={C - 1.5} cy={SUN_Y - 1.5} r={SUN_R * 0.38} style={{ fill: 'var(--lg-sol-soft)', opacity: 0.55 }} />
        </g>
      </svg>

      {/* Mitten: kvar/över i stora Fraunces-siffror – eller ett ord i medvetet läge. */}
      <div className="relative flex flex-col items-center justify-center text-center" aria-hidden="true" style={{ maxWidth: size * 0.62 }}>
        {mindful ? (
          <>
            <span className="font-display leading-tight font-medium text-balance text-ink" style={{ fontSize: size * 0.1 }}>
              {mind.title}
            </span>
            <span className="mt-1.5 leading-snug text-balance text-ink-3" style={{ fontSize: small }}>
              {mind.hint}
            </span>
          </>
        ) : (
          <>
            <motion.span className="display-num leading-none font-medium text-ink" style={{ fontSize: numSize }}>
              {numText}
            </motion.span>
            <span className="mt-1.5 leading-tight font-medium text-ink-2" style={{ fontSize: small * 1.08 }}>
              {showOver ? `${unit} över – helt okej` : `${unit} kvar`}
            </span>
            {glowing && (
              <span className="mt-0.5 leading-tight font-semibold text-gran" style={{ fontSize: small }}>
                precis lagom
              </span>
            )}
            <span className="tabular mt-1.5 leading-tight whitespace-nowrap text-ink-3" style={{ fontSize: small }}>
              {formatEnergy(summary.eaten, unit, false)} av {formatEnergy(summary.total, unit, size >= 200)}
            </span>
            {exercise > 0 && size >= 200 && (
              <span className="tabular mt-0.5 leading-tight text-mossa" style={{ fontSize: small * 0.95 }}>
                varav {formatEnergy(exercise, unit, false)} från träning
              </span>
            )}
          </>
        )}
      </div>
    </div>
  )
}
