/**
 * Makronäringsämnen mot dagsmål: protein, kolhydrater, fett (och valfritt fibrer).
 *
 * - `compact`: tre/fyra kolumner bredvid varandra – för dagens översikt.
 * - `detailed`: en rad per makro med gram, mål, energiprocent (E%) och vad som är kvar.
 *
 * Över målet visas neutralt: stapeln fylls förbi målmarkeringen med en randig del och texten säger
 * "5 g över" – aldrig rött eller dömande.
 */
import { motion, useReducedMotion } from 'motion/react'
import type { Nutrients } from '../../types'
import { energyDistribution } from '../../lib/nutrients'
import { formatNumber } from '../../lib/format'

export type MacroKey = 'protein' | 'carbs' | 'fat' | 'fiber'

/** Mål i gram. `Targets` från typerna passar direkt. */
export interface MacroTargets {
  proteinG: number
  carbsG: number
  fatG: number
  fiberG?: number
}

export interface MacroMeta {
  key: MacroKey
  label: string
  /** Kort etikett för smala kolumner. */
  short: string
  targetKey: keyof MacroTargets
  /** CSS-färg (token). */
  color: string
  /** Tailwind-klass för färgprick. */
  dot: string
}

/** Makronas etiketter och färger – protein = lingon, kolhydrater = hjortron, fett = blåbär, fibrer = mossa. */
export const MACRO_META: Record<MacroKey, MacroMeta> = {
  protein: { key: 'protein', label: 'Protein', short: 'Protein', targetKey: 'proteinG', color: 'var(--lg-lingon)', dot: 'bg-protein' },
  carbs: { key: 'carbs', label: 'Kolhydrater', short: 'Kolhydr.', targetKey: 'carbsG', color: 'var(--lg-hjortron)', dot: 'bg-carbs' },
  fat: { key: 'fat', label: 'Fett', short: 'Fett', targetKey: 'fatG', color: 'var(--lg-blabar)', dot: 'bg-fat' },
  fiber: { key: 'fiber', label: 'Fibrer', short: 'Fibrer', targetKey: 'fiberG', color: 'var(--lg-mossa)', dot: 'bg-fiber' },
}

/** "32 g kvar", "5 g över" eller "Målet nått". */
export function remainingText(eaten: number, target: number): string {
  if (!(target > 0)) return ''
  const diff = Math.round(target - eaten)
  if (diff === 0) return 'Målet nått'
  return diff > 0 ? `${formatNumber(diff)} g kvar` : `${formatNumber(-diff)} g över`
}

export interface MacroBarsProps {
  /** Dagens (eller måltidens) summerade näringsvärden. */
  totals: Nutrients
  targets: MacroTargets
  /** Visa fibrer. Standard: om `targets.fiberG` finns. */
  showFiber?: boolean
  variant?: 'compact' | 'detailed'
  /** Medvetet läge: visa bara staplar, inga siffror. */
  hideNumbers?: boolean
  className?: string
}

export function MacroBars({ totals, targets, showFiber, variant = 'compact', hideNumbers = false, className = '' }: MacroBarsProps) {
  const keys: MacroKey[] = ['protein', 'carbs', 'fat']
  if (showFiber ?? targets.fiberG !== undefined) keys.push('fiber')
  const ep = energyDistribution(totals)

  if (variant === 'detailed') {
    return (
      <ul className={`space-y-4 ${className}`}>
        {keys.map((k) => {
          const meta = MACRO_META[k]
          const eaten = Math.max(0, totals[k] ?? 0)
          const target = targets[meta.targetKey] ?? 0
          const e = k === 'fiber' ? undefined : ep[k]
          return (
            <li key={k}>
              <div className="mb-1.5 flex items-baseline gap-2">
                <span className={`h-2 w-2 shrink-0 self-center rounded-full ${meta.dot}`} aria-hidden="true" />
                <span className="text-sm font-medium text-ink">{meta.label}</span>
                {!hideNumbers && e !== undefined && eaten > 0 && (
                  <span className="text-xs text-ink-3 tabular-nums">{formatNumber(e)} E%</span>
                )}
                {!hideNumbers && (
                  <span className="ml-auto text-sm tabular-nums">
                    <span className="font-semibold text-ink">{formatNumber(eaten)}</span>
                    <span className="text-ink-3"> / {target > 0 ? formatNumber(target) : '–'} g</span>
                  </span>
                )}
              </div>
              <MacroBar meta={meta} eaten={eaten} target={target} thick hideNumbers={hideNumbers} />
              {!hideNumbers && target > 0 && (
                <div className="mt-1 text-right text-xs text-ink-3 tabular-nums">{remainingText(eaten, target)}</div>
              )}
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <ul className={`grid ${keys.length === 4 ? 'grid-cols-4 gap-2.5' : 'grid-cols-3 gap-3'} ${className}`}>
      {keys.map((k) => {
        const meta = MACRO_META[k]
        const eaten = Math.max(0, totals[k] ?? 0)
        const target = targets[meta.targetKey] ?? 0
        return (
          <li key={k} className="min-w-0">
            <div className="mb-1.5 truncate text-xs font-medium text-ink-2">{keys.length === 4 ? meta.short : meta.label}</div>
            <MacroBar meta={meta} eaten={eaten} target={target} hideNumbers={hideNumbers} />
            {!hideNumbers && (
              <>
                <div className={`mt-1.5 truncate tabular-nums ${keys.length === 4 ? 'text-[13px] tracking-tight' : 'text-sm'}`}>
                  <span className="font-semibold text-ink">{formatNumber(eaten)}</span>
                  <span className="text-ink-3">/{target > 0 ? formatNumber(target) : '–'} g</span>
                </div>
                {target > 0 && <div className="truncate text-[11px] text-ink-3 tabular-nums">{remainingText(eaten, target)}</div>}
              </>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * En enskild stapel. Skalan är max(mål, intag) så att en överskjutande del får plats;
 * målet markeras med en tunn lucka i ytfärg.
 */
function MacroBar({
  meta,
  eaten,
  target,
  thick = false,
  hideNumbers,
}: {
  meta: MacroMeta
  eaten: number
  target: number
  thick?: boolean
  hideNumbers: boolean
}) {
  const reduced = useReducedMotion() ?? false
  const scaleMax = Math.max(target, eaten, 1e-9)
  const fillPct = target > 0 || eaten > 0 ? (eaten / scaleMax) * 100 : 0
  const targetPct = target > 0 ? (target / scaleMax) * 100 : 100
  const over = target > 0 && eaten > target
  const valueText = hideNumbers
    ? `${meta.label}: ${target > 0 ? `${formatNumber((eaten / target) * 100)} % av målet` : 'inget mål'}`
    : `${meta.label}: ${formatNumber(eaten)} av ${target > 0 ? formatNumber(target) : '–'} g${target > 0 ? `, ${remainingText(eaten, target)}` : ''}`
  const transition = reduced ? { duration: 0 } : { type: 'spring' as const, stiffness: 140, damping: 22, delay: 0.1 }

  return (
    <div
      role="progressbar"
      aria-label={meta.label}
      aria-valuemin={0}
      aria-valuemax={Math.round(Math.max(target, eaten))}
      aria-valuenow={Math.round(eaten)}
      aria-valuetext={valueText}
      className={`relative w-full overflow-hidden rounded-full bg-surface-2 ${thick ? 'h-2.5' : 'h-1.5'}`}
    >
      {/* Upp till målet */}
      <motion.div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ background: meta.color }}
        initial={reduced ? false : { width: 0 }}
        animate={{ width: `${Math.min(fillPct, targetPct)}%` }}
        transition={transition}
      />
      {/* Förbi målet – randigt, samma färg */}
      {over && (
        <motion.div
          className="absolute inset-y-0 rounded-r-full"
          style={{
            left: `${targetPct}%`,
            backgroundImage: `repeating-linear-gradient(135deg, ${meta.color} 0 3px, color-mix(in oklab, ${meta.color} 45%, var(--lg-surface-2)) 3px 6px)`,
          }}
          initial={reduced ? false : { width: 0 }}
          animate={{ width: `${fillPct - targetPct}%` }}
          transition={reduced ? transition : { ...transition, delay: 0.35 }}
        />
      )}
      {/* Målmarkering: 2 px lucka i ytfärg */}
      {over && (
        <div className="absolute inset-y-0 w-[2px] -translate-x-1/2 bg-surface" style={{ left: `${targetPct}%` }} aria-hidden="true" />
      )}
    </div>
  )
}
