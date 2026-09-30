/**
 * Konfetti – en liten, glad skur av skogens färger när ett mål nås eller dagen är klar.
 *
 * I stället för vanliga pappersremsor: lingon och blåbär, mossgröna blad, solgula remsor
 * och små gnistor. Allt är några dussin små element som animeras med motion och tas bort
 * automatiskt när skuren är klar.
 *
 * Vid reducerad rörelse flyger ingenting: några få former tonas i stället in och ut på plats.
 *
 * ```tsx
 * const [burst, setBurst] = useState(0)
 * <div className="relative">
 *   <CalorieRing … />
 *   <Confetti fire={burst} />
 * </div>
 * <Button onClick={() => setBurst((n) => n + 1)}>Klar för dagen</Button>
 * ```
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'

export interface ConfettiProps {
  /**
   * Utlösare. Varje gång värdet ändras till något nytt och sant (t.ex. en räknare som ökar,
   * eller `false` → `true`) skjuts en ny skur. Första renderingen skjuter om värdet redan är sant.
   */
  fire: number | string | boolean | null | undefined
  /** Antal bitar (standard 40; 12 vid reducerad rörelse). */
  count?: number
  /** Utgångspunkt som andel av ytan (standard { x: 0.5, y: 0.4 }). */
  origin?: { x: number; y: number }
  /** Täck hela fönstret (position: fixed) i stället för närmaste positionerade förälder. */
  fullscreen?: boolean
  /** Anropas när skuren är klar och bitarna har städats bort. */
  onComplete?: () => void
  className?: string
}

type Shape = 'berry' | 'leaf' | 'strip' | 'sparkle'

export interface ConfettiPiece {
  id: number
  shape: Shape
  color: string
  size: number
  /** Förflyttning i px: x-slut, y-topp (negativ = uppåt) och y-slut. */
  dx: number
  peak: number
  dy: number
  rotate: number
  flip: number
  duration: number
  delay: number
}

const COLORS: Record<Shape, readonly string[]> = {
  berry: ['var(--lg-lingon)', 'var(--lg-blabar)'],
  leaf: ['var(--lg-mossa)'],
  strip: ['var(--lg-sol)', 'var(--lg-lingon)', 'var(--lg-blabar)', 'var(--lg-mossa)'],
  sparkle: ['var(--lg-sol)'],
}
const SHAPES: readonly Shape[] = ['berry', 'berry', 'leaf', 'leaf', 'strip', 'strip', 'strip', 'sparkle']

/** Deterministisk slump så att samma skur ser likadan ut (och går att testa). */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Skapa bitarna för en skur: en uppåtriktad solfjäder som sedan faller med tyngdkraften. */
export function makeConfetti(count: number, seed: number): ConfettiPiece[] {
  const r = rng(seed * 9973 + 17)
  return Array.from({ length: Math.max(0, Math.round(count)) }, (_, id) => {
    const shape = SHAPES[Math.floor(r() * SHAPES.length)]
    const palette = COLORS[shape]
    const angle = ((-90 + (r() * 2 - 1) * 68) * Math.PI) / 180
    const speed = 150 + r() * 190
    return {
      id,
      shape,
      color: palette[Math.floor(r() * palette.length)],
      size: shape === 'strip' ? 9 + r() * 4 : 7 + r() * 5,
      dx: Math.cos(angle) * speed * 0.95,
      peak: Math.sin(angle) * speed * 0.62,
      dy: Math.sin(angle) * speed * 0.62 + 170 + r() * 150,
      rotate: (r() > 0.5 ? 1 : -1) * (160 + r() * 520),
      flip: shape === 'strip' || shape === 'leaf' ? 360 * (1 + Math.floor(r() * 3)) : 0,
      duration: 1.35 + r() * 0.8,
      delay: r() * 0.12,
    }
  })
}

/** Längsta tiden (ms) en skur pågår. */
function burstLength(pieces: readonly ConfettiPiece[]): number {
  return Math.max(900, ...pieces.map((p) => (p.duration + p.delay) * 1000)) + 150
}

function PieceShape({ shape, color, size }: { shape: Shape; color: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" style={{ display: 'block', overflow: 'visible' }}>
      {shape === 'berry' && (
        <>
          <circle cx="6" cy="6.4" r="4.4" style={{ fill: color }} />
          <circle cx="4.5" cy="4.8" r="1.2" style={{ fill: 'var(--lg-surface)', opacity: 0.5 }} />
          <path d="M6 2.2 L6.8 0.8" strokeWidth="0.9" strokeLinecap="round" style={{ stroke: 'var(--lg-mossa)' }} />
        </>
      )}
      {shape === 'leaf' && (
        <>
          <path d="M6 0.8C10.2 3.2 10.2 8.4 6 11.2C1.8 8.4 1.8 3.2 6 0.8Z" style={{ fill: color }} />
          <path d="M6 2V10.4" strokeWidth="0.7" strokeLinecap="round" style={{ stroke: 'var(--lg-surface)', opacity: 0.45 }} />
        </>
      )}
      {shape === 'strip' && <rect x="4.2" y="0.6" width="3.6" height="10.8" rx="1.3" style={{ fill: color }} />}
      {shape === 'sparkle' && <path d="M6 0L7.3 4.7L12 6L7.3 7.3L6 12L4.7 7.3L0 6L4.7 4.7Z" style={{ fill: color }} />}
    </svg>
  )
}

/**
 * Konfettiskur i skogens färger. Lägg den i en förälder med `position: relative`
 * (eller använd `fullscreen`). Den fångar aldrig klick och döljs för skärmläsare.
 */
export function Confetti({ fire, count, origin = { x: 0.5, y: 0.4 }, fullscreen = false, onComplete, className = '' }: ConfettiProps) {
  const reduce = useReducedMotion() ?? false
  const [burst, setBurst] = useState<number | null>(null)
  const burstSeq = useRef(0)
  const lastFire = useRef<ConfettiProps['fire']>(undefined)
  const completeRef = useRef(onComplete)
  useEffect(() => {
    completeRef.current = onComplete
  })

  // En ny skur varje gång utlösaren ändras till ett nytt, sant värde.
  useEffect(() => {
    const prev = lastFire.current
    lastFire.current = fire
    if (!fire || fire === prev) return
    burstSeq.current += 1
    setBurst(burstSeq.current)
  }, [fire])

  const pieces = useMemo(() => (burst === null ? [] : makeConfetti(count ?? (reduce ? 12 : 40), burst)), [burst, count, reduce])

  // Städa bort bitarna när skuren är klar.
  useEffect(() => {
    if (burst === null) return
    const ms = reduce ? 1400 : burstLength(pieces)
    const id = window.setTimeout(() => {
      setBurst(null)
      completeRef.current?.()
    }, ms)
    return () => window.clearTimeout(id)
  }, [burst, pieces, reduce])

  if (burst === null) return null

  return (
    <div
      aria-hidden="true"
      data-testid="confetti"
      className={`pointer-events-none ${fullscreen ? 'fixed' : 'absolute'} inset-0 z-[60] overflow-visible ${className}`}
    >
      <div className="absolute" style={{ left: `${origin.x * 100}%`, top: `${origin.y * 100}%` }}>
        {/* En mjuk solblomma i mitten. */}
        <motion.span
          key={`bloom-${burst}`}
          className="absolute block rounded-full"
          style={{ width: 120, height: 120, left: -60, top: -60, background: 'radial-gradient(closest-side, var(--lg-sol-soft), transparent)' }}
          initial={{ opacity: 0.9, scale: reduce ? 1 : 0.2 }}
          animate={{ opacity: 0, scale: reduce ? 1 : 1.6 }}
          transition={{ duration: reduce ? 1.2 : 0.9, ease: 'easeOut' }}
        />
        {pieces.map((p) =>
          reduce ? (
            // Reducerad rörelse: formerna tonas in och ut på plats, i en lugn krans.
            <motion.span
              key={`${burst}-${p.id}`}
              className="absolute block"
              style={{
                left: Math.cos((p.id / pieces.length) * Math.PI * 2) * 54 - p.size / 2,
                top: Math.sin((p.id / pieces.length) * Math.PI * 2) * 40 - p.size / 2,
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 1, 0] }}
              transition={{ duration: 1.2, times: [0, 0.2, 0.7, 1] }}
            >
              <PieceShape shape={p.shape} color={p.color} size={p.size} />
            </motion.span>
          ) : (
            <motion.span
              key={`${burst}-${p.id}`}
              className="absolute block"
              style={{ left: -p.size / 2, top: -p.size / 2, transformPerspective: 400 }}
              initial={{ x: 0, y: 0, rotate: 0, rotateY: 0, opacity: 1, scale: 0.5 }}
              animate={{
                x: [0, p.dx * 0.72, p.dx],
                y: [0, p.peak, p.dy],
                rotate: [0, p.rotate * 0.45, p.rotate],
                rotateY: [0, p.flip * 0.5, p.flip],
                scale: [0.5, 1, 0.92],
                opacity: [1, 1, 0],
              }}
              transition={{
                duration: p.duration,
                delay: p.delay,
                times: [0, 0.3, 1],
                ease: ['easeOut', 'easeIn'],
                opacity: { duration: p.duration, delay: p.delay, times: [0, 0.72, 1] },
              }}
            >
              <PieceShape shape={p.shape} color={p.color} size={p.size} />
            </motion.span>
          ),
        )}
      </div>
    </div>
  )
}
