/**
 * Ren logik för Inställningar: makrofördelning, egna mål, måltider, lagring och cache.
 */
import type { Food, ISODate, MealConfig, MealId, NutrientKey, Profile, Targets } from '../../types'
import { DEFAULT_MEALS } from '../../stores/profileStore'
import { MIN_KCAL, type EnergyBreakdown } from '../../lib/energy'
import { todayISO } from '../../lib/dates'
import { formatEnergy, formatNumber } from '../../lib/format'
import { minimumAge } from '../onboarding/profileLogic'

// ---------------------------------------------------------------------------
// Makrofördelning (energiprocent)
// ---------------------------------------------------------------------------

export interface MacroPct {
  protein: number
  carbs: number
  fat: number
}
export type MacroKey = keyof MacroPct

export const MACRO_KEYS: readonly MacroKey[] = ['protein', 'carbs', 'fat']

/** Tillåtna intervall för egna fördelningar (E%). Ryms alla förinställningar, inklusive LCHF. */
export const MACRO_BOUNDS: Record<MacroKey, readonly [number, number]> = {
  protein: [10, 40],
  carbs: [5, 70],
  fat: [15, 75],
}

/** NNR 2023:s rekommenderade intervall för vuxna (E%). */
export const NNR_RANGES: Record<MacroKey, readonly [number, number]> = {
  protein: [10, 20],
  carbs: [45, 60],
  fat: [25, 40],
}

export const MACRO_LABELS: Record<MacroKey, string> = { protein: 'Protein', carbs: 'Kolhydrater', fat: 'Fett' }

const NNR_DEFAULT: MacroPct = { protein: 18, carbs: 50, fat: 32 }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * Skala godtyckliga värden till heltal som summerar till exakt 100 (största rest-metoden).
 * Ogiltiga eller bara nollor ger NNR:s fördelning.
 */
export function normalizeMacroPct(p: Partial<MacroPct> | undefined): MacroPct {
  const raw = MACRO_KEYS.map((k) => {
    const v = p?.[k]
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0
  })
  const sum = raw.reduce((a, b) => a + b, 0)
  if (sum <= 0) return { ...NNR_DEFAULT }
  const scaled = raw.map((v) => (v * 100) / sum)
  const out = scaled.map(Math.floor)
  let rest = 100 - out.reduce((a, b) => a + b, 0)
  const order = scaled.map((v, i) => ({ frac: v - Math.floor(v), i })).sort((a, b) => b.frac - a.frac)
  for (const { i } of order) {
    if (rest <= 0) break
    out[i]++
    rest--
  }
  return { protein: out[0], carbs: out[1], fat: out[2] }
}

/**
 * Sätt ett makro till `value` och fördela resten på de två andra i proportion till deras
 * nuvarande andelar, inom `bounds`. Resultatet är heltal som summerar till 100.
 */
export function rebalanceMacros(pct: MacroPct, key: MacroKey, value: number, bounds: Record<MacroKey, readonly [number, number]> = MACRO_BOUNDS): MacroPct {
  const [a, b] = MACRO_KEYS.filter((k) => k !== key) as [MacroKey, MacroKey]
  // Värdet måste lämna utrymme åt de andra två inom deras gränser.
  const lo = Math.max(bounds[key][0], 100 - bounds[a][1] - bounds[b][1])
  const hi = Math.min(bounds[key][1], 100 - bounds[a][0] - bounds[b][0])
  const v = Math.round(clamp(Number.isFinite(value) ? value : pct[key], lo, hi))
  const rest = 100 - v
  const curA = Math.max(0, pct[a])
  const curB = Math.max(0, pct[b])
  const shareA = curA + curB > 0 ? curA / (curA + curB) : 0.5
  let va = clamp(Math.round(rest * shareA), bounds[a][0], bounds[a][1])
  let vb = rest - va
  if (vb < bounds[b][0]) {
    vb = bounds[b][0]
    va = rest - vb
  } else if (vb > bounds[b][1]) {
    vb = bounds[b][1]
    va = rest - vb
  }
  const out = { protein: 0, carbs: 0, fat: 0 } as MacroPct
  out[key] = v
  out[a] = va
  out[b] = vb
  return out
}

/** Gram per dag för en fördelning vid ett energimål (protein och kolhydrater 4 kcal/g, fett 9 kcal/g). */
export function macroGrams(kcal: number, pct: MacroPct): MacroPct {
  return {
    protein: Math.round((kcal * pct.protein) / 100 / 4),
    carbs: Math.round((kcal * pct.carbs) / 100 / 4),
    fat: Math.round((kcal * pct.fat) / 100 / 9),
  }
}

/** Makron som ligger utanför NNR 2023:s intervall. */
export function outsideNnr(pct: MacroPct): MacroKey[] {
  return MACRO_KEYS.filter((k) => pct[k] < NNR_RANGES[k][0] || pct[k] > NNR_RANGES[k][1])
}

/** Vänlig text om fördelningen avviker från NNR, annars null. */
export function nnrNote(pct: MacroPct): string | null {
  const keys = outsideNnr(pct)
  if (keys.length === 0) return null
  const parts = keys.map((k) => `${MACRO_LABELS[k].toLocaleLowerCase('sv-SE')} (${NNR_RANGES[k][0]}–${NNR_RANGES[k][1]} %)`)
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} och ${parts[parts.length - 1]}`
  return `Utanför de nordiska rekommendationernas intervall för ${list}. Det är helt okej om det är ett medvetet val – tänk på att få i dig fibrer, grönsaker och omättat fett.`
}

// ---------------------------------------------------------------------------
// Egna mål
// ---------------------------------------------------------------------------

export type OverrideKey = 'kcal' | 'proteinG' | 'carbsG' | 'fatG' | 'fiberG' | 'waterMl' | 'saltMaxG'

export interface OverrideField {
  key: OverrideKey
  label: string
  unit: string
  step: number
  decimals: number
  min: number
  max: number
  hint?: string
}

export const OVERRIDE_FIELDS: readonly OverrideField[] = [
  { key: 'kcal', label: 'Energi per dag', unit: 'kcal', step: 10, decimals: 0, min: 1200, max: 6000 },
  { key: 'proteinG', label: 'Protein', unit: 'g', step: 1, decimals: 0, min: 20, max: 400 },
  { key: 'carbsG', label: 'Kolhydrater', unit: 'g', step: 5, decimals: 0, min: 0, max: 800 },
  { key: 'fatG', label: 'Fett', unit: 'g', step: 1, decimals: 0, min: 20, max: 400 },
  { key: 'fiberG', label: 'Fibrer', unit: 'g', step: 1, decimals: 0, min: 10, max: 100, hint: 'NNR: minst 25 g (kvinnor) och 35 g (män)' },
  { key: 'waterMl', label: 'Dryck', unit: 'ml', step: 100, decimals: 0, min: 500, max: 6000, hint: 'Vatten och annan dryck' },
  { key: 'saltMaxG', label: 'Salt, högst', unit: 'g', step: 0.5, decimals: 1, min: 1, max: 15, hint: 'Rekommendationen är högst 6 g per dag' },
]

export type KcalFloorReason = 'golv' | 'gravid' | 'ammar' | 'ung'

export interface KcalFloor {
  /** Lägsta tillåtna egna energimål i kcal. */
  kcal: number
  reason: KcalFloorReason
}

/**
 * Lägsta egna energimål. Aldrig under säkerhetsgolvet (1 200/1 500 kcal), och vid graviditet,
 * amning eller under 18 år aldrig under förbrukningen – då rekommenderas ingen viktnedgång.
 * Samma regler som `computeEnergy`; åldern räknas försiktigt (se `minimumAge`).
 */
export function kcalOverrideFloor(
  profile: Pick<Profile, 'sex' | 'lifeStage' | 'birthYear'>,
  energy: Pick<EnergyBreakdown, 'tdee' | 'lifeStageKcal'>,
  today: ISODate = todayISO(),
): KcalFloor {
  const base = MIN_KCAL[profile.sex]
  const reason: KcalFloorReason | null =
    profile.lifeStage === 'gravid' ? 'gravid' : profile.lifeStage === 'ammar' ? 'ammar' : minimumAge(profile.birthYear, today) < 18 ? 'ung' : null
  if (reason === null) return { kcal: base, reason: 'golv' }
  const maintenance = Math.ceil((energy.tdee + energy.lifeStageKcal) / 10) * 10
  return maintenance > base ? { kcal: maintenance, reason } : { kcal: base, reason: 'golv' }
}

/** Förklaring till golvet för egna energimål (visas under fältet). */
export function kcalFloorText(floor: KcalFloor, unit: 'kcal' | 'kJ'): string {
  const value = formatEnergy(floor.kcal, unit)
  switch (floor.reason) {
    case 'gravid':
      return `Lägst ${value} – under graviditeten rekommenderas ingen viktnedgång, så målet följer din förbrukning.`
    case 'ammar':
      return `Lägst ${value} – när du ammar rekommenderas ingen viktnedgång, så målet följer din förbrukning.`
    case 'ung':
      return `Lägst ${value} – under 18 år rekommenderas inget kaloriunderskott, så målet följer din förbrukning.`
    default:
      return `Lägst ${value} – så att kroppen får tillräckligt med näring.`
  }
}

/** Egna mål där ett för lågt energimål har höjts till golvet. Samma objekt om inget behövde ändras. */
export function clampKcalOverride(overrides: Partial<Targets>, floorKcal: number): Partial<Targets> {
  if (overrides.kcal === undefined || overrides.kcal >= floorKcal) return overrides
  return { ...overrides, kcal: floorKcal }
}

/**
 * Hur mycket energi makromålen motsvarar tillsammans (protein och kolhydrater 4 kcal/g, fett 9 kcal/g)
 * jämfört med dagsmålet. `null` när de stämmer ungefär (inom 3 %, minst 50 kcal).
 */
export function macroEnergyMismatch(targets: Pick<Targets, 'kcal' | 'proteinG' | 'carbsG' | 'fatG'>): { macroKcal: number; diff: number } | null {
  const macroKcal = Math.round(targets.proteinG * 4 + targets.carbsG * 4 + targets.fatG * 9)
  const diff = macroKcal - targets.kcal
  return Math.abs(diff) >= Math.max(50, targets.kcal * 0.03) ? { macroKcal, diff } : null
}

/** Ny override-karta där `key` är satt – eller borttagen om värdet saknas. */
export function withOverride(overrides: Partial<Targets>, key: keyof Targets, value: number | undefined): Partial<Targets> {
  const next = { ...overrides }
  if (value === undefined || !Number.isFinite(value)) delete next[key]
  else next[key] = value
  return next
}

/** Antal egna mål som skriver över de beräknade. */
export function overrideCount(overrides: Partial<Targets>): number {
  return Object.values(overrides).filter((v) => typeof v === 'number').length
}

/** Lägg till eller ta bort ett näringsämne i Idag-sidans urval (behåller ordningen). */
export function toggleDashboardNutrient(list: readonly NutrientKey[], key: NutrientKey, on: boolean): NutrientKey[] {
  if (on) return list.includes(key) ? [...list] : [...list, key]
  return list.filter((k) => k !== key)
}

// ---------------------------------------------------------------------------
// Måltider
// ---------------------------------------------------------------------------

export const MEAL_NAME_MAX = 24

/** Slå på/av en måltid. Minst en måltid måste vara på – då lämnas listan oförändrad. */
export function setMealEnabled(meals: readonly MealConfig[], id: MealId, enabled: boolean): MealConfig[] {
  if (!enabled && meals.filter((m) => m.enabled && m.id !== id).length === 0) return [...meals]
  return meals.map((m) => (m.id === id ? { ...m, enabled } : m))
}

/** Byt namn på en måltid. Tomt namn ger standardnamnet; för långa namn kortas. */
export function renameMeal(meals: readonly MealConfig[], id: MealId, name: string): MealConfig[] {
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, MEAL_NAME_MAX)
  const fallback = DEFAULT_MEALS.find((m) => m.id === id)?.name ?? id
  return meals.map((m) => (m.id === id ? { ...m, name: clean || fallback } : m))
}

export function mealsAreDefault(meals: readonly MealConfig[]): boolean {
  return (
    meals.length === DEFAULT_MEALS.length &&
    DEFAULT_MEALS.every((d) => {
      const m = meals.find((x) => x.id === d.id)
      return m !== undefined && m.name === d.name && m.enabled === d.enabled
    })
  )
}

// ---------------------------------------------------------------------------
// Vatten
// ---------------------------------------------------------------------------

export const GLASS_SIZES: readonly number[] = [200, 250, 300, 330]

/** 250 → "2,5 dl" */
export function glassLabel(ml: number): string {
  return `${formatNumber(ml / 100, 1)} dl`
}

// ---------------------------------------------------------------------------
// Lagring och sparade livsmedel
// ---------------------------------------------------------------------------

/** 1 234 567 → "1,2 MB" (binära enheter, svensk formatering). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '–'
  if (bytes < 1024) return `${formatNumber(bytes)} byte`
  const units = ['kB', 'MB', 'GB', 'TB']
  let v = bytes / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${formatNumber(v, v < 10 ? 1 : 0)} ${units[i]}`
}

export interface CachedStats {
  openfoodfacts: number
  livsmedelsverket: number
  other: number
  total: number
}

export function cachedFoodStats(cached: Record<string, Food>): CachedStats {
  const s: CachedStats = { openfoodfacts: 0, livsmedelsverket: 0, other: 0, total: 0 }
  for (const f of Object.values(cached)) {
    s.total++
    if (f.source === 'openfoodfacts') s.openfoodfacts++
    else if (f.source === 'livsmedelsverket') s.livsmedelsverket++
    else s.other++
  }
  return s
}

/**
 * Ta bort sparade onlinelivsmedel. Livsmedel i `keep` (t.ex. favoriter) behålls så att de fortsätter
 * fungera. Dagboken påverkas inte – den har egna ögonblicksbilder.
 */
export function pruneCachedFoods(
  cached: Record<string, Food>,
  source: 'openfoodfacts' | 'livsmedelsverket' | 'all',
  keep: ReadonlySet<string> = new Set(),
): Record<string, Food> {
  const out: Record<string, Food> = {}
  for (const [id, f] of Object.entries(cached)) {
    const match = source === 'all' || f.source === source
    if (!match || keep.has(id)) out[id] = f
  }
  return out
}

/** Lägg till importerade livsmedel i cachen (nya värden ersätter gamla med samma id). */
export function mergeImportedFoods(cached: Record<string, Food>, foods: readonly Food[]): Record<string, Food> {
  if (foods.length === 0) return cached
  const out = { ...cached }
  for (const f of foods) out[f.id] = f
  return out
}

// ---------------------------------------------------------------------------
// Radering
// ---------------------------------------------------------------------------

export const DELETE_WORD = 'RADERA'

export function isDeleteConfirmed(input: string): boolean {
  return input.trim().toLocaleUpperCase('sv-SE') === DELETE_WORD
}
