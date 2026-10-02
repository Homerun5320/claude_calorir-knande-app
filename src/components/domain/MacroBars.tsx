/**
 * Makronäringsämnen mot dagsmål: protein, kolhydrater, fett (och valfritt fibrer).
 *
 * - `compact`: tre/fyra kolumner bredvid varandra – för dagens översikt.
 * - `detailed`: en rad per makro med gram, mål, energiprocent (E%) och vad som är kvar.
 *
 * Över målet visas neutralt: stapeln fylls förbi målmarkeringen med en randig del och texten säger
 * "5 g över" – aldrig rött eller dömande.
 *
 * Ett saknat värde (`undefined`) är okänt, inte 0: finns det poster för dagen men inget av dem har
 * t.ex. protein visas "–" (ingen "kvar"-rad, tom stapel). En dag helt utan poster visar 0 som vanligt.
 *
 * Medvetet läge (`hideNumbers`): inga siffror syns – och inga siffror hörs heller. Stapeln blir en
 * `img` med ett ord ("Protein: på god väg") i stället för en `progressbar` med gram och procent.
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

/** Är värdet ett riktigt tal? (`undefined` och NaN är okända.) */
const isKnown = (v: number | undefined): v is number => v !== undefined && Number.isFinite(v)

/** Staplarnas ord i medvetet läge – för skärmläsare, utan siffror. Neutrala och varma, aldrig dömande. */
export function mindfulMacroWord(eaten: number, target: number): string {
  if (!(target > 0)) return 'inget mål'
  const ratio = eaten / target
  if (!(ratio > 0)) return 'ännu inget'
  if (ratio < 0.35) return 'lite hittills'
  if (ratio < 0.7) return 'på god väg'
  if (ratio < 0.97) return 'nästan där'
  if (ratio <= 1.03) return 'lagom'
  return 'mer än målet – helt okej'
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
  /** Medvetet läge: visa bara staplar, inga siffror (varken synliga eller för skärmläsare). */
  hideNumbers?: boolean
  /**
   * Finns det poster för dagen/måltiden? Då är ett ämne som saknas i summan okänt ("–"); utan
   * poster är det 0. Utelämnas den räknas det som poster så snart något värde i `totals` är känt.
   */
  hasEntries?: boolean
  className?: string
}

/** Intaget av ett makro: `undefined` = okänt, annars gram (aldrig under 0). */
function macroEaten(totals: Nutrients, key: MacroKey, hasEntries: boolean): number | undefined {
  const v = totals[key]
  if (isKnown(v)) return Math.max(0, v)
  return hasEntries ? undefined : 0
}

export function MacroBars({ totals, targets, showFiber, variant = 'compact', hideNumbers = false, hasEntries, className = '' }: MacroBarsProps) {
  const keys: MacroKey[] = ['protein', 'carbs', 'fat']
  if (showFiber ?? targets.fiberG !== undefined) keys.push('fiber')
  const withEntries = hasEntries ?? Object.values(totals).some(isKnown)
  // Energiprocenten säger bara något när alla energigivande makron är kända.
  const ep = energyDistribution(totals)
  const energyKnown = !withEntries || (isKnown(totals.protein) && isKnown(totals.carbs) && isKnown(totals.fat))

  if (variant === 'detailed') {
    return (
      <ul className={`space-y-4 ${className}`}>
        {keys.map((k) => {
          const meta = MACRO_META[k]
          const known = macroEaten(totals, k, withEntries)
          const eaten = known ?? 0
          const target = targets[meta.targetKey] ?? 0
          const e = k === 'fiber' || !energyKnown ? undefined : ep[k]
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
                    <span className="font-semibold text-ink">{known === undefined ? '–' : formatNumber(eaten)}</span>
                    <span className="text-ink-3"> / {target > 0 ? formatNumber(target) : '–'} g</span>
                  </span>
                )}
              </div>
              <MacroBar meta={meta} eaten={known} target={target} thick hideNumbers={hideNumbers} />
              {!hideNumbers && known !== undefined && target > 0 && (
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
        const known = macroEaten(totals, k, withEntries)
        const eaten = known ?? 0
        const target = targets[meta.targetKey] ?? 0
        return (
          <li key={k} className="min-w-0">
            <div className="mb-1.5 truncate text-xs font-medium text-ink-2">{keys.length === 4 ? meta.short : meta.label}</div>
            <MacroBar meta={meta} eaten={known} target={target} hideNumbers={hideNumbers} />
            {!hideNumbers && (
              <>
                <div className={`mt-1.5 truncate tabular-nums ${keys.length === 4 ? 'text-[13px] tracking-tight' : 'text-sm'}`}>
                  <span className="font-semibold text-ink">{known === undefined ? '–' : formatNumber(eaten)}</span>
                  <span className="text-ink-3">/{target > 0 ? formatNumber(target) : '–'} g</span>
                </div>
                {known !== undefined && target > 0 && (
                  <div className="truncate text-[11px] text-ink-3 tabular-nums">{remainingText(eaten, target)}</div>
                )}
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
 * målet markeras med en tunn lucka i ytfärg. `eaten` är `undefined` när värdet är okänt – då är
 * stapeln tom och heter "okänt" i stället för att låtsas vara 0.
 */
function MacroBar({
  meta,
  eaten: eatenOrUnknown,
  target,
  thick = false,
  hideNumbers,
}: {
  meta: MacroMeta
  eaten: number | undefined
  target: number
  thick?: boolean
  hideNumbers: boolean
}) {
  const reduced = useReducedMotion() ?? false
  const unknown = eatenOrUnknown === undefined
  const eaten = eatenOrUnknown ?? 0
  const scaleMax = Math.max(target, eaten, 1e-9)
  const fillPct = target > 0 || eaten > 0 ? (eaten / scaleMax) * 100 : 0
  const targetPct = target > 0 ? (target / scaleMax) * 100 : 100
  const over = target > 0 && eaten > target
  // Medvetet läge och okända värden: text i stället för en mätare med siffror. En progressbar utan
  // aria-valuenow vore "obestämd" (laddar), så det blir en bild med text i stället.
  const a11y =
    hideNumbers || unknown
      ? {
          role: 'img' as const,
          'aria-label': unknown
            ? `${meta.label}: okänt${!hideNumbers && target > 0 ? `, mål ${formatNumber(target)} g` : ''}`
            : `${meta.label}: ${mindfulMacroWord(eaten, target)}`,
        }
      : {
          role: 'progressbar' as const,
          'aria-label': meta.label,
          'aria-valuemin': 0,
          'aria-valuemax': Math.round(Math.max(target, eaten)),
          'aria-valuenow': Math.round(eaten),
          'aria-valuetext': `${meta.label}: ${formatNumber(eaten)} av ${target > 0 ? formatNumber(target) : '–'} g${target > 0 ? `, ${remainingText(eaten, target)}` : ''}`,
        }
  const transition = reduced ? { duration: 0 } : { type: 'spring' as const, stiffness: 140, damping: 22, delay: 0.1 }

  return (
    <div
      {...a11y}
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
