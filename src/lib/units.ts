/**
 * Svenska köksmått och omräkning till gram.
 *
 * Svenska recept anger ofta torra varor i volym ("2 dl havregryn"). Med livsmedlets
 * densitet (g/ml) kan Lagom räkna om volym till vikt korrekt.
 */
import type { Food, UnitKey, VolumeUnit } from '../types'
import { formatNumber } from './format'

export const VOLUME_ML: Record<VolumeUnit, number> = {
  krm: 1,
  tsk: 5,
  msk: 15,
  ml: 1,
  cl: 10,
  dl: 100,
  l: 1000,
}

export const UNIT_LABELS: Record<Exclude<UnitKey, `portion:${string}`>, { short: string; long: string }> = {
  g: { short: 'g', long: 'gram' },
  kg: { short: 'kg', long: 'kilogram' },
  krm: { short: 'krm', long: 'kryddmått' },
  tsk: { short: 'tsk', long: 'tesked' },
  msk: { short: 'msk', long: 'matsked' },
  ml: { short: 'ml', long: 'milliliter' },
  cl: { short: 'cl', long: 'centiliter' },
  dl: { short: 'dl', long: 'deciliter' },
  l: { short: 'l', long: 'liter' },
}

export function isVolumeUnit(unit: UnitKey): unit is VolumeUnit {
  return unit in VOLUME_ML
}

export function isPortionUnit(unit: UnitKey): unit is `portion:${string}` {
  return unit.startsWith('portion:')
}

/** Densitet i g/ml. Flytande utan angiven densitet antas väga 1 g/ml. */
export function densityOf(food: Pick<Food, 'density' | 'liquid'>): number | undefined {
  if (food.density && food.density > 0) return food.density
  if (food.liquid) return 1
  return undefined
}

/** Vilka enheter som går att använda för ett livsmedel (portioner först). */
export function availableUnits(food: Pick<Food, 'portions' | 'density' | 'liquid'>): UnitKey[] {
  const units: UnitKey[] = food.portions.map((p) => `portion:${p.id}` as const)
  units.push('g')
  if (densityOf(food) !== undefined) {
    if (food.liquid) units.push('dl', 'cl', 'ml', 'msk', 'tsk', 'l')
    else units.push('dl', 'msk', 'tsk', 'krm')
  }
  return units
}

/** Förvald enhet: första portionen, annars dl för drycker, annars gram. */
export function defaultUnit(food: Pick<Food, 'portions' | 'density' | 'liquid'>): UnitKey {
  if (food.portions.length > 0) return `portion:${food.portions[0].id}`
  if (food.liquid) return 'dl'
  return 'g'
}

/** Förvald mängd för en enhet. */
export function defaultAmount(unit: UnitKey): number {
  if (unit === 'g') return 100
  if (unit === 'ml') return 200
  if (unit === 'cl') return 33
  if (unit === 'dl') return 2
  return 1
}

/**
 * Gram för en mängd i en viss enhet. Returnerar NaN om enheten inte kan räknas om
 * (t.ex. volym utan densitet eller okänd portion).
 */
export function gramsFor(food: Pick<Food, 'portions' | 'density' | 'liquid'>, amount: number, unit: UnitKey): number {
  if (!Number.isFinite(amount) || amount < 0) return Number.NaN
  if (unit === 'g') return amount
  if (unit === 'kg') return amount * 1000
  if (isVolumeUnit(unit)) {
    const d = densityOf(food)
    return d === undefined ? Number.NaN : amount * VOLUME_ML[unit] * d
  }
  if (isPortionUnit(unit)) {
    const id = unit.slice('portion:'.length)
    const p = food.portions.find((x) => x.id === id)
    return p ? amount * p.grams : Number.NaN
  }
  return Number.NaN
}

/** Kort etikett för en enhet, t.ex. "dl" eller "skiva". */
export function unitLabel(food: Pick<Food, 'portions'>, unit: UnitKey): string {
  if (isPortionUnit(unit)) {
    const id = unit.slice('portion:'.length)
    return food.portions.find((p) => p.id === id)?.label ?? 'portion'
  }
  return UNIT_LABELS[unit as keyof typeof UNIT_LABELS]?.short ?? unit
}

/**
 * Läsbar mängd: "2 dl", "1 st (medel)", "150 g". För portioner visas gramvikten inom parentes
 * när `withGrams` är satt: "2 skivor (24 g)".
 */
export function formatAmount(
  food: Pick<Food, 'portions' | 'density' | 'liquid'>,
  amount: number,
  unit: UnitKey,
  withGrams = false,
): string {
  const label = unitLabel(food, unit)
  const amt = formatNumber(amount, amount < 10 ? 2 : 0)
  if (unit === 'g') return `${amt} g`
  const grams = gramsFor(food, amount, unit)
  const tail = withGrams && Number.isFinite(grams) ? ` (${formatNumber(grams, 0)} g)` : ''
  return `${amt} ${label}${tail}`
}
