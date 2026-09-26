/**
 * Vattenglas för vätskeregistrering. Varje glas fylls med en mjuk vågrörelse.
 *
 * - Tryck på ett tomt glas fyller upp till och med det glaset.
 * - Tryck på det sista fyllda glaset tömmer det.
 * - Knapparna − och + ändrar ett glas i taget. Sammanfattningen visar t.ex. "1,25 l av 2 l".
 */
import { useId } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Minus, Plus } from 'lucide-react'
import { formatNumber } from '../../lib/format'

export interface WaterGlassesProps {
  /** Hittills druckit, ml. */
  ml: number
  /** Dagsmål, ml. */
  targetMl: number
  /** Glasstorlek, ml. Standard 250. */
  glassMl?: number
  onAdd?: (ml: number) => void
  onRemove?: (ml: number) => void
  /** Högst så här många glas ritas (resten syns i summan). Standard 12. */
  maxGlasses?: number
  /** Visa "1,25 l av 2 l" och −/+ knappar. Standard true. */
  showSummary?: boolean
  className?: string
}

/** 1250 → "1,25 l", 2000 → "2 l", 330 → "0,33 l". */
export function formatLiters(ml: number): string {
  return `${formatNumber(Math.max(0, ml) / 1000, 2)}\u00a0l`
}

export function WaterGlasses({
  ml,
  targetMl,
  glassMl = 250,
  onAdd,
  onRemove,
  maxGlasses = 12,
  showSummary = true,
  className = '',
}: WaterGlassesProps) {
  const size = glassMl > 0 ? glassMl : 250
  const drunk = Math.max(0, ml)
  const needed = Math.max(1, Math.ceil(targetMl / size), Math.ceil(drunk / size))
  const count = Math.min(needed, Math.max(1, maxGlasses))
  const allFull = drunk >= count * size - 0.5
  const reached = targetMl > 0 && drunk >= targetMl
  const filledCount = Math.ceil(drunk / size - 1e-6)
  const lastFilled = filledCount - 1
  const interactive = !!onAdd || !!onRemove

  const levelOf = (i: number) => Math.max(0, Math.min(1, (drunk - i * size) / size))

  const tap = (i: number) => {
    if (i === lastFilled && onRemove) {
      // Töm det sista glaset (bara det som faktiskt finns i det).
      const inLast = drunk - i * size
      onRemove(Math.round(Math.min(size, inLast)))
    } else if (i > lastFilled && onAdd) {
      onAdd(Math.round((i + 1) * size - drunk))
    } else if (i < lastFilled && onRemove) {
      // Tryck på ett tidigare glas: töm ned till och med det glaset.
      onRemove(Math.round(drunk - i * size))
    }
  }

  const glassLabel = (i: number) => {
    const level = levelOf(i)
    const n = `Glas ${i + 1} av ${count}`
    if (i === lastFilled) return `${n}, fyllt. Tryck för att ta bort ${formatNumber(Math.min(size, drunk - i * size))} ml`
    if (level >= 1) return `${n}, fyllt. Tryck för att ta bort ${formatNumber(drunk - i * size)} ml`
    return `${n}, tomt. Tryck för att lägga till ${formatNumber((i + 1) * size - drunk)} ml`
  }

  return (
    <div className={className}>
      <div
        className="flex flex-wrap items-end gap-1"
        role={interactive ? 'group' : 'img'}
        aria-label={`Vatten: ${formatLiters(drunk)} av ${formatLiters(targetMl)}`}
      >
        {Array.from({ length: count }, (_, i) =>
          interactive ? (
            <button
              key={i}
              type="button"
              onClick={() => tap(i)}
              aria-label={glassLabel(i)}
              className="grid h-12 w-8 place-items-center rounded-xl transition-transform hover:-translate-y-0.5 active:scale-90"
            >
              <Glass level={levelOf(i)} />
            </button>
          ) : (
            <span key={i} className="grid h-12 w-8 place-items-center" aria-hidden="true">
              <Glass level={levelOf(i)} />
            </span>
          ),
        )}
        {allFull && onAdd && (
          <button
            type="button"
            onClick={() => onAdd(size)}
            aria-label={`Lägg till ett glas (${formatNumber(size)} ml)`}
            className="grid h-12 w-8 place-items-center rounded-xl text-fjall transition-transform hover:-translate-y-0.5 active:scale-90"
          >
            <GhostGlass />
          </button>
        )}
      </div>

      {showSummary && (
        <div className="mt-3 flex items-center gap-3">
          <p className="min-w-0 flex-1" aria-live="polite">
            <span className="font-display text-xl font-semibold text-ink tabular-nums">{formatLiters(drunk)}</span>
            <span className="text-sm text-ink-3"> av {formatLiters(targetMl)}</span>
            {reached && <span className="ml-2 text-xs font-semibold text-gran">Dagsmålet nått</span>}
          </p>
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(Math.round(Math.min(size, drunk)))}
              disabled={drunk <= 0}
              aria-label={`Ta bort ett glas (${formatNumber(size)} ml)`}
              className="grid h-11 w-11 place-items-center rounded-full bg-surface-2 text-ink-2 transition-transform active:scale-90 disabled:opacity-40"
            >
              <Minus className="h-4 w-4" />
            </button>
          )}
          {onAdd && (
            <button
              type="button"
              onClick={() => onAdd(size)}
              aria-label={`Lägg till ett glas (${formatNumber(size)} ml)`}
              className="grid h-11 w-11 place-items-center rounded-full bg-fjall-soft text-fjall transition-transform active:scale-90"
            >
              <Plus className="h-5 w-5" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

const GLASS_PATH = 'M5 4H27L24.6 35.2A3 3 0 0 1 21.6 38H10.4A3 3 0 0 1 7.4 35.2Z'
const INNER_TOP = 4
const INNER_HEIGHT = 34

/** Ett glas med vattennivå 0–1. Vattnet glider upp med en fjädrande rörelse. */
function Glass({ level }: { level: number }) {
  const reduced = useReducedMotion() ?? false
  const clip = `wg-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const offset = (1 - level) * INNER_HEIGHT + (level > 0 ? 0 : 3)
  return (
    <svg width="28" height="36" viewBox="0 0 32 40" aria-hidden="true" className="overflow-visible">
      <defs>
        <clipPath id={clip}>
          <path d={GLASS_PATH} />
        </clipPath>
      </defs>
      <path d={GLASS_PATH} fill="var(--lg-surface-2)" fillOpacity={0.7} />
      <g clipPath={`url(#${clip})`}>
        <motion.g
          initial={reduced ? false : { y: INNER_HEIGHT + 3 }}
          animate={{ y: offset }}
          transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 170, damping: 18 }}
        >
          {/* Bakre våg (ljusare) och vattenkropp med vågig yta */}
          <path d={`M-4 ${INNER_TOP + 1}q5-3 10 0t10 0t10 0t10 0V44H-4Z`} fill="var(--lg-fjall)" fillOpacity={0.35} />
          <path d={`M-4 ${INNER_TOP + 2.5}q5 2.5 10 0t10 0t10 0t10 0V44H-4Z`} fill="var(--lg-fjall)" fillOpacity={0.9} />
        </motion.g>
      </g>
      <path
        d={GLASS_PATH}
        fill="none"
        stroke={level > 0 ? 'var(--lg-fjall)' : 'var(--lg-ink-3)'}
        strokeOpacity={level > 0 ? 0.9 : 0.45}
        strokeWidth={1.75}
        strokeLinejoin="round"
      />
      {/* Glans */}
      <path d="M9.2 9L10.8 30" stroke="var(--lg-surface)" strokeOpacity={0.55} strokeWidth={1.6} strokeLinecap="round" />
    </svg>
  )
}

/** Streckat glas med plustecken – "lägg till ett glas till". */
function GhostGlass() {
  return (
    <svg width="28" height="36" viewBox="0 0 32 40" aria-hidden="true">
      <path
        d={GLASS_PATH}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.6}
        strokeWidth={1.5}
        strokeDasharray="3 3"
        strokeLinejoin="round"
      />
      <path d="M16 15v12M10 21h12" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </svg>
  )
}
