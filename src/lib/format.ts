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

/** Unicode-bråk som går att skriva direkt ("1½ dl"). */
const VULGAR_FRACTIONS: Record<string, number> = { '½': 1 / 2, '¼': 1 / 4, '¾': 3 / 4, '⅓': 1 / 3, '⅔': 2 / 3 }

function fraction(whole: number, numerator: string, denominator: string): number {
  const den = Number(denominator)
  return den === 0 ? Number.NaN : whole + Number(numerator) / den
}

/** Tolka ett tal utan tecken (se `parseSwedishNumber`). */
function parseUnsigned(s: string): number {
  // Blandat tal: "1 1/2", "2 3/4" – måste tolkas innan mellanslag tas bort (annars blir det 11/2).
  let m = s.match(/^(\d+) (\d+) ?\/ ?(\d+)$/)
  if (m) return fraction(Number(m[1]), m[2], m[3])
  // Bråk: "1/2"
  m = s.match(/^(\d+) ?\/ ?(\d+)$/)
  if (m) return fraction(0, m[1], m[2])
  // Unicode-bråk, ev. med heltal före: "½", "1½", "1 ½"
  m = s.match(/^(\d+)? ?([½¼¾⅓⅔])$/)
  if (m) return Number(m[1] ?? 0) + VULGAR_FRACTIONS[m[2]]
  // Mellanslag är bara tillåtna som tusentalsavgränsare: "1 234,5", "12 000".
  let d = s
  if (/^\d{1,3}( \d{3})+([.,]\d*)?$/.test(d)) d = d.replace(/ /g, '')
  d = d.replace(',', '.')
  if (/^\d+\.?\d*$|^\.\d+$/.test(d)) return Number(d)
  return Number.NaN
}

/**
 * Tolka ett tal skrivet på svenska: "1,5", "1.5", "1 234,5", "½", "1½", "1/2", "1 1/2", "-2".
 * Mellanslag godtas bara som tusentalsavgränsare eller mellan heltal och bråk.
 * Returnerar NaN om det inte går (även för ofullständig inmatning som "1 1/").
 */
export function parseSwedishNumber(input: string): number {
  let s = input
    .replace(/[\s\u00a0\u202f\u2009]+/g, ' ')
    .trim()
    .replace(/^[−–]/, '-')
  let sign = 1
  if (s.startsWith('-')) {
    sign = -1
    s = s.slice(1).trim()
  }
  if (s === '') return Number.NaN
  const value = parseUnsigned(s)
  return Number.isNaN(value) ? Number.NaN : sign * value
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
