/**
 * Svensk sifferformatering: decimalkomma och fast mellanslag som tusentalsavgränsare.
 */
import { KJ_PER_KCAL, NUTRIENTS, type NutrientKey } from './nutrients'

const nfCache = new Map<number, Intl.NumberFormat>()
function nf(decimals: number): Intl.NumberFormat {
  let f = nfCache.get(decimals)
  if (!f) {
    f = new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 0, maximumFractionDigits: decimals })
    nfCache.set(decimals, f)
  }
  return f
}

/** 1234.5 → "1 234,5" */
export function formatNumber(value: number | undefined | null, decimals = 0): string {
  if (value === undefined || value === null || !Number.isFinite(value)) return '–'
  const rounded = Number(value.toFixed(decimals))
  return nf(decimals).format(Object.is(rounded, -0) ? 0 : rounded)
}

/** Formatera ett näringsvärde med rätt antal decimaler (smart: färre decimaler för stora tal). */
export function formatNutrient(key: NutrientKey, value: number | undefined, withUnit = true): string {
  if (value === undefined || !Number.isFinite(value)) return '–'
  const meta = NUTRIENTS[key]
  let decimals = meta.decimals
  if (Math.abs(value) >= 100) decimals = 0
  else if (Math.abs(value) >= 10) decimals = Math.min(decimals, 1)
  const s = formatNumber(value, decimals)
  return withUnit ? `${s} ${meta.unit}` : s
}

/** Energi i vald enhet. */
export function formatEnergy(kcal: number | undefined, unit: 'kcal' | 'kJ' = 'kcal', withUnit = true): string {
  if (kcal === undefined || !Number.isFinite(kcal)) return '–'
  const v = unit === 'kJ' ? kcal * KJ_PER_KCAL : kcal
  const s = formatNumber(Math.round(v), 0)
  return withUnit ? `${s} ${unit}` : s
}

export function formatGrams(g: number | undefined, decimals = 0): string {
  if (g === undefined || !Number.isFinite(g)) return '–'
  if (g >= 1000) return `${formatNumber(g / 1000, 2)} kg`
  return `${formatNumber(g, decimals)} g`
}

export function formatKg(kg: number | undefined, decimals = 1): string {
  return kg === undefined ? '–' : `${formatNumber(kg, decimals)} kg`
}

export function formatPercent(v: number | undefined, decimals = 0): string {
  return v === undefined || !Number.isFinite(v) ? '–' : `${formatNumber(v, decimals)} %`
}

/**
 * Tolka ett tal skrivet på svenska: "1,5", "1.5", "1 234,5", "½".
 * Returnerar NaN om det inte går.
 */
export function parseSwedishNumber(input: string): number {
  const s = input
    .trim()
    .replace(/\s| | /g, '')
    .replace('½', '.5')
    .replace('¼', '.25')
    .replace('¾', '.75')
    .replace(',', '.')
  if (s === '' || s === '.' || s === '-') return Number.NaN
  if (/^\d*\.\d*$|^\d+$/.test(s)) return Number(s.startsWith('.') ? `0${s}` : s)
  // Bråk: "1/2"
  const frac = s.match(/^(\d+)\/(\d+)$/)
  if (frac) return Number(frac[1]) / Number(frac[2])
  return Number.NaN
}

/** Minuter → "1 h 25 min" */
export function formatDuration(minutes: number): string {
  const m = Math.round(minutes)
  const h = Math.floor(m / 60)
  const rest = m % 60
  if (h === 0) return `${rest} min`
  if (rest === 0) return `${h} h`
  return `${h} h ${rest} min`
}

/** Svensk pluralform för enkla fall: plural(2, 'dag', 'dagar'). */
export function plural(n: number, one: string, many: string): string {
  return `${formatNumber(n)} ${Math.abs(n) === 1 ? one : many}`
}
