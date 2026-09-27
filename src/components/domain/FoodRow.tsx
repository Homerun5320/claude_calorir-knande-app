/**
 * Rad för ett livsmedel eller en dagbokspost: ikon (eller bild), namn, märke/mängd, energi till
 * höger och små makroprickar. Långa svenska namn ("Mjölk mellan 1,5 % fett, laktosfri") bryts
 * på högst två rader.
 *
 * Använd `entryToRow(entry)` eller `foodToRow(food, …)` för att få fram props från domändata.
 */
import { useState, type ReactNode } from 'react'
import type { DiaryEntry, Food, FoodCategory, UnitKey } from '../../types'
import { entryNutrients } from '../../lib/diary'
import { nutrientsForGrams } from '../../lib/nutrients'
import { formatNumber } from '../../lib/format'
import { defaultAmount, defaultUnit, formatAmount, gramsFor, isPortionUnit, isVolumeUnit } from '../../lib/units'
import { CategoryIcon } from './CategoryIcon'
import { EnergyValue, useEnergyFormatter } from './EnergyValue'

export interface FoodRowMacros {
  protein?: number
  carbs?: number
  fat?: number
}

/** Allt en rad behöver visa. */
export interface FoodRowData {
  name: string
  brand?: string
  /** Mängd, t.ex. "2 dl (76 g)". */
  amountText?: string
  category?: FoodCategory
  imageUrl?: string
  /** Egen emoji (t.ex. recept) i stället för kategorins. */
  emoji?: string
  kcal?: number
  macros?: FoodRowMacros
}

export interface FoodRowProps extends FoodRowData {
  onClick?: () => void
  /** Etikett för skärmläsare när raden är klickbar. Standard: namn + mängd + energi. */
  actionLabel?: string
  /** Innehåll längst till höger, t.ex. en "+"-knapp. Ligger utanför radens klickyta. */
  trailing?: ReactNode
  /** Liten etikett under namnet (före märke/mängd), t.ex. ett Nyckelhålet-märke eller "Recept". */
  badge?: ReactNode
  /** Visa makroprickar. Standard true. */
  showMacros?: boolean
  /** Tätare rad (mindre ikon). */
  compact?: boolean
  /** Dölj energi- och makrokolumnen helt (medvetet läge). */
  hideEnergy?: boolean
  className?: string
}

/**
 * Läsbar mängd med vikten för portioner och volymer: "2 dl (76 g)", "1 glas (2 dl, 206 g)",
 * "2 smörgåsar (124 g)". Gramvikten upprepas aldrig om etiketten redan anger den.
 */
export function describeAmount(food: Pick<Food, 'portions' | 'density' | 'liquid'>, amount: number, unit: UnitKey): string {
  return formatAmount(food, amount, unit, isPortionUnit(unit) || isVolumeUnit(unit))
}

/** Props för en dagbokspost. */
export function entryToRow(entry: DiaryEntry): FoodRowData {
  const n = entryNutrients(entry)
  const macros = { protein: n.protein, carbs: n.carbs, fat: n.fat }
  if (entry.kind === 'quick') {
    return { name: entry.name, amountText: 'Snabbregistrering', category: entry.category ?? 'ovrigt', kcal: n.kcal, macros }
  }
  return {
    name: entry.food.name,
    brand: entry.food.brand,
    amountText: describeAmount(entry.food, entry.amount, entry.unit),
    category: entry.food.category,
    imageUrl: entry.food.imageUrl,
    kcal: n.kcal,
    macros,
  }
}

/**
 * Props för ett livsmedel i en söklista. Utan mängd används livsmedlets förvalda portion
 * (t.ex. "1 st (60 g)"), annars 100 g.
 */
export function foodToRow(food: Food, opts: { amount?: number; unit?: UnitKey; emoji?: string } = {}): FoodRowData {
  const unit = opts.unit ?? defaultUnit(food)
  const amount = opts.amount ?? defaultAmount(unit)
  let grams = gramsFor(food, amount, unit)
  let amountText = describeAmount(food, amount, unit)
  if (!Number.isFinite(grams)) {
    grams = 100
    amountText = '100 g'
  }
  const n = nutrientsForGrams(food.nutrients, grams)
  return {
    name: food.name,
    brand: food.brand,
    amountText,
    category: food.category,
    imageUrl: food.imageUrl,
    emoji: opts.emoji,
    kcal: n.kcal,
    macros: { protein: n.protein, carbs: n.carbs, fat: n.fat },
  }
}

const MACRO_DOTS = [
  { key: 'protein', label: 'Protein', short: 'P', dot: 'bg-protein' },
  { key: 'carbs', label: 'Kolhydrater', short: 'K', dot: 'bg-carbs' },
  { key: 'fat', label: 'Fett', short: 'F', dot: 'bg-fat' },
] as const

export function FoodRow({
  name,
  brand,
  amountText,
  category,
  imageUrl,
  emoji,
  kcal,
  macros,
  onClick,
  actionLabel,
  trailing,
  badge,
  showMacros = true,
  compact = false,
  hideEnergy = false,
  className = '',
}: FoodRowProps) {
  const [imageFailed, setImageFailed] = useState(false)
  const formatKcal = useEnergyFormatter()
  const subtitle = [brand, amountText].filter(Boolean).join(' · ')
  const m3: FoodRowMacros = macros ?? {}
  const knownMacros = MACRO_DOTS.filter((m) => m3[m.key] !== undefined && Number.isFinite(m3[m.key]))
  const hasMacros = !hideEnergy && showMacros && knownMacros.length > 0
  const iconSize = compact ? 'sm' : 'md'
  const imageBox = compact ? 'h-9 w-9 rounded-xl' : 'h-11 w-11 rounded-[0.9rem]'

  const body = (
    <>
      {imageUrl && !imageFailed ? (
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setImageFailed(true)}
          className={`${imageBox} shrink-0 bg-surface-2 object-cover`}
        />
      ) : (
        <CategoryIcon category={category} emoji={emoji} size={iconSize} />
      )}
      <span className="min-w-0 flex-1">
        <span
          className={`line-clamp-2 break-words font-medium leading-snug text-ink [hyphens:auto] ${compact ? 'text-sm' : 'text-[0.95rem]'}`}
          lang="sv"
        >
          {name}
        </span>
        {/* Etiketten ligger på raden under namnet – bredvid namnet blev det för trångt i 375 px. */}
        {badge ? (
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5">
            <span className="shrink-0">{badge}</span>
            {subtitle && <span className="min-w-0 truncate text-xs text-ink-3">{subtitle}</span>}
          </span>
        ) : (
          subtitle && <span className="mt-0.5 block truncate text-xs text-ink-3">{subtitle}</span>
        )}
      </span>
      {!hideEnergy && (
        <span className="flex shrink-0 flex-col items-end self-center pl-1 text-right">
          <span className="text-sm font-semibold text-ink">
            {kcal !== undefined ? <EnergyValue kcal={kcal} /> : <span className="text-ink-3">–</span>}
          </span>
          {hasMacros && (
            <span className="mt-0.5 inline-flex items-center gap-1.5 text-[10.5px] text-ink-3 tabular-nums" aria-hidden="true">
              {knownMacros.map((m) => {
                const v = m3[m.key] ?? 0
                return (
                  <span key={m.key} className="inline-flex items-center gap-[3px]" title={m.label}>
                    <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
                    {formatNumber(v, v < 10 ? 1 : 0)}
                  </span>
                )
              })}
            </span>
          )}
        </span>
      )}
    </>
  )

  const srLabel =
    actionLabel ??
    [
      name,
      subtitle,
      kcal !== undefined && !hideEnergy ? formatKcal(kcal) : undefined,
      hasMacros ? knownMacros.map((m) => `${m.label.toLowerCase()} ${formatNumber(m3[m.key], 1)} g`).join(', ') : undefined,
    ]
      .filter(Boolean)
      .join(', ')

  const rowClass = `flex min-w-0 flex-1 items-center gap-3 text-left ${compact ? 'min-h-12 py-1.5' : 'min-h-14 py-2'}`

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          aria-label={srLabel}
          className={`${rowClass} -mx-2 rounded-2xl px-2 transition-colors hover:bg-surface-2/70 active:bg-surface-2`}
        >
          {body}
        </button>
      ) : (
        <div className={rowClass}>{body}</div>
      )}
      {trailing && <div className="shrink-0">{trailing}</div>}
    </div>
  )
}
