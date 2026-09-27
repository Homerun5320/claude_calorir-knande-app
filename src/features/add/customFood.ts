/**
 * Formulärlogik för egna livsmedel: utkast ↔ Food, omräkning per portion → per 100 g,
 * kJ → kcal, validering och rimlighetskontroller (Atwater).
 *
 * Allt är rena funktioner – sidan `CustomFoodPage` håller bara tillståndet.
 */
import type { Food, FoodCategory, FoodTag, NutrientKey, Nutrients, Portion } from '../../types'
import { KJ_PER_KCAL, MINERAL_KEYS, NUTRIENT_KEYS, VITAMIN_KEYS, completeNutrients, kcalFromMacros, sodiumMgFromSalt } from '../../lib/nutrients'
import { formatNumber } from '../../lib/format'
import { isValidEan, normalizeBarcode } from '../../lib/openFoodFacts'
import { slugify, uid } from '../../lib/id'

export type InputBasis = 'per100' | 'portion'
export type EnergyInputUnit = 'kcal' | 'kJ'

export interface PortionDraft {
  /** Stabil nyckel för React-listan. */
  key: string
  /** Befintligt portions-id (behålls vid redigering). */
  id?: string
  label: string
  grams: number | undefined
}

export interface CustomFoodDraft {
  name: string
  brand: string
  category: FoodCategory
  /** Värdena anges per 100 g (ml) eller per portion. */
  basis: InputBasis
  /** Portionens vikt i gram när `basis` är 'portion'. */
  basisGrams: number | undefined
  /** Portionens namn, t.ex. "1 bar". */
  basisLabel: string
  energyUnit: EnergyInputUnit
  /** Energi i `energyUnit`, i vald bas. */
  energy: number | undefined
  /** Övriga näringsämnen i vald bas (utan energi). */
  values: Partial<Record<NutrientKey, number>>
  portions: PortionDraft[]
  liquid: boolean
  /** Vikt för 1 dl i gram – ger densitet och gör dl/msk/tsk möjliga. */
  gramsPerDl: number | undefined
  barcode: string
  tags: FoodTag[]
  note: string
}

/**
 * Näringsämnen i huvudformuläret – i samma ordning och med samma ord som på en svensk
 * näringsdeklaration (Energi, Fett, varav mättat fett, Kolhydrat, varav sockerarter, Fiber,
 * Protein, Salt), så att man kan skriva av förpackningen uppifrån och ned. Tillsatt socker står
 * inte på förpackningar och ligger bland de övriga näringsämnena.
 */
export const MAIN_NUTRIENTS = ['fat', 'satFat', 'carbs', 'sugars', 'fiber', 'protein', 'salt'] as const satisfies readonly NutrientKey[]

export const MAIN_LABELS: Record<(typeof MAIN_NUTRIENTS)[number], string> = {
  fat: 'Fett',
  satFat: 'varav mättat fett',
  carbs: 'Kolhydrat',
  sugars: 'varav sockerarter',
  fiber: 'Fiber',
  protein: 'Protein',
  salt: 'Salt',
}

/** "varav"-rader som visas som underrader till raden före. */
export const SUB_NUTRIENTS: ReadonlySet<NutrientKey> = new Set<NutrientKey>(['satFat', 'sugars'])

const MAIN_SET = new Set<NutrientKey>(MAIN_NUTRIENTS)

/** Grupper under "Vitaminer & mineraler". */
export const EXTRA_GROUPS: ReadonlyArray<{ id: string; label: string; keys: readonly NutrientKey[] }> = [
  {
    id: 'ovrigt',
    label: 'Fetter, fullkorn och övrigt',
    keys: NUTRIENT_KEYS.filter((k) => k !== 'kcal' && !MAIN_SET.has(k) && !VITAMIN_KEYS.includes(k) && !MINERAL_KEYS.includes(k)),
  },
  { id: 'vitaminer', label: 'Vitaminer', keys: VITAMIN_KEYS },
  { id: 'mineraler', label: 'Mineraler', keys: MINERAL_KEYS },
]

export const EXTRA_KEYS: readonly NutrientKey[] = EXTRA_GROUPS.flatMap((g) => g.keys)

const round = (v: number, decimals = 3) => {
  const f = 10 ** decimals
  return Math.round(v * f) / f
}

export function newPortionDraft(label = '', grams?: number, id?: string): PortionDraft {
  return { key: uid('p_'), id, label, grams }
}

/** Ett tomt formulär – ev. förifyllt med streckkod och namn (t.ex. från skanning eller sökning). */
export function emptyDraft(opts: { name?: string; barcode?: string; energyUnit?: EnergyInputUnit } = {}): CustomFoodDraft {
  return {
    name: opts.name?.trim() ?? '',
    brand: '',
    category: 'ovrigt',
    basis: 'per100',
    basisGrams: undefined,
    basisLabel: '',
    energyUnit: opts.energyUnit ?? 'kcal',
    energy: undefined,
    values: {},
    portions: [],
    liquid: false,
    gramsPerDl: undefined,
    barcode: opts.barcode ? normalizeBarcode(opts.barcode) : '',
    tags: [],
    note: '',
  }
}

/**
 * true om natriumvärdet bara är saltet omräknat (salt = natrium × 2,5) – då är det härlett och
 * ska räknas om när saltet ändras, inte ligga kvar som ett eget inmatat värde.
 */
export function isDerivedSodium(salt: number | undefined, sodiumMg: number | undefined): boolean {
  if (salt === undefined || sodiumMg === undefined) return false
  const expected = sodiumMgFromSalt(salt)
  return Math.abs(sodiumMg - expected) <= Math.max(0.5, expected * 0.01)
}

/** Formulär från ett befintligt livsmedel (värden per 100 g). */
export function draftFromFood(food: Food, energyUnit: EnergyInputUnit = 'kcal'): CustomFoodDraft {
  const values: Partial<Record<NutrientKey, number>> = {}
  for (const key of NUTRIENT_KEYS) {
    if (key === 'kcal') continue
    const v = food.nutrients[key]
    if (v !== undefined && Number.isFinite(v)) values[key] = round(v)
  }
  // Natrium som bara är saltet omräknat fylls inte i – annars blir det kvar med det gamla värdet
  // när saltet ändras. `draftNutrients` räknar fram det igen när livsmedlet sparas.
  if (isDerivedSodium(food.nutrients.salt, food.nutrients.sodium)) delete values.sodium
  const kcal = food.nutrients.kcal
  return {
    name: food.name,
    brand: food.brand ?? '',
    category: food.category,
    basis: 'per100',
    basisGrams: undefined,
    basisLabel: '',
    energyUnit,
    energy: kcal === undefined ? undefined : energyUnit === 'kJ' ? Math.round(kcal * KJ_PER_KCAL) : round(kcal, 1),
    values,
    portions: food.portions.map((p) => newPortionDraft(p.label, p.grams, p.id)),
    liquid: food.liquid === true,
    gramsPerDl: food.density !== undefined ? round(food.density * 100, 1) : undefined,
    barcode: food.barcode ?? '',
    tags: food.tags ? [...food.tags] : [],
    note: food.note ?? '',
  }
}

/** Faktor från vald bas till per 100 g. NaN om portionsvikten saknas. */
export function basisFactor(basis: InputBasis, basisGrams: number | undefined): number {
  if (basis === 'per100') return 1
  return basisGrams !== undefined && Number.isFinite(basisGrams) && basisGrams > 0 ? 100 / basisGrams : Number.NaN
}

/**
 * Räkna om ett värde till per 100 g. Per portion: värde × 100 / portionsvikt.
 * `undefined` (okänt) förblir okänt.
 */
export function toPer100(value: number | undefined, basis: InputBasis, basisGrams?: number): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined
  const f = basisFactor(basis, basisGrams)
  return Number.isFinite(f) ? round(value * f) : undefined
}

/** Energi i kcal från inmatat värde. */
export function energyToKcal(value: number | undefined, unit: EnergyInputUnit): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined
  return unit === 'kJ' ? value / KJ_PER_KCAL : value
}

/** Näringsvärden per 100 g från formuläret (salt ↔ natrium kompletteras). */
export function draftNutrients(draft: Pick<CustomFoodDraft, 'basis' | 'basisGrams' | 'energy' | 'energyUnit' | 'values'>): Nutrients {
  const out: Nutrients = {}
  const kcal = toPer100(energyToKcal(draft.energy, draft.energyUnit), draft.basis, draft.basisGrams)
  if (kcal !== undefined) out.kcal = round(kcal, 1)
  for (const [k, v] of Object.entries(draft.values)) {
    const per100 = toPer100(v, draft.basis, draft.basisGrams)
    if (per100 !== undefined && per100 >= 0) out[k as NutrientKey] = per100
  }
  return completeNutrients(out)
}

export interface AtwaterResult {
  /** Energi beräknad från makronäringsämnena (kcal). */
  expected: number
  /** Skillnad angiven − beräknad (kcal). */
  diff: number
  mismatch: boolean
}

/**
 * Stämmer energin med makronäringsämnena? Protein och kolhydrater 4 kcal/g, fett 9, fiber 2,
 * alkohol 7. Tolerans: 15 % eller 20 kcal (avrundning på förpackningar). Kräver energi,
 * protein, kolhydrater och fett.
 */
export function atwaterCheck(n: Nutrients): AtwaterResult | null {
  if (n.kcal === undefined || n.protein === undefined || n.carbs === undefined || n.fat === undefined) return null
  const expected = kcalFromMacros(n)
  const diff = n.kcal - expected
  const tolerance = Math.max(20, 0.15 * Math.max(n.kcal, expected))
  return { expected, diff, mismatch: Math.abs(diff) > tolerance }
}

export type DraftField = 'name' | 'energy' | 'basisGrams' | 'barcode' | 'gramsPerDl' | 'portions'
export type DraftErrors = Partial<Record<DraftField, string>>

/** Fel som hindrar att livsmedlet sparas. */
export function validateDraft(draft: CustomFoodDraft): DraftErrors {
  const errors: DraftErrors = {}
  const name = draft.name.trim()
  if (!name) errors.name = 'Ge livsmedlet ett namn.'
  else if (name.length > 120) errors.name = 'Namnet får vara högst 120 tecken.'

  if (draft.basis === 'portion' && !(draft.basisGrams !== undefined && draft.basisGrams > 0)) {
    errors.basisGrams = 'Ange hur mycket en portion väger.'
  }

  if (draft.energy === undefined) errors.energy = 'Ange energin – den står överst i näringsdeklarationen.'
  else if (draft.energy < 0) errors.energy = 'Energin kan inte vara negativ.'
  else if (!errors.basisGrams) {
    const kcal100 = toPer100(energyToKcal(draft.energy, draft.energyUnit), draft.basis, draft.basisGrams)
    if (kcal100 !== undefined && kcal100 > 950) {
      errors.energy =
        draft.basis === 'portion'
          ? 'Det blir mer än 900\u00a0kcal per 100\u00a0g – kontrollera portionsvikten.'
          : 'Mer än 900\u00a0kcal per 100\u00a0g går inte (rent fett ger 900). Har du skrivit kJ som kcal?'
    }
  }

  const code = normalizeBarcode(draft.barcode)
  if (code && !isValidEan(code)) errors.barcode = 'Streckkoden ser inte ut att stämma – kontrollera siffrorna.'

  if (draft.gramsPerDl !== undefined && !(draft.gramsPerDl > 0 && draft.gramsPerDl <= 300)) {
    errors.gramsPerDl = 'Ange en vikt mellan 1 och 300\u00a0g per dl.'
  }

  const halfFilled = draft.portions.some((p) => {
    const hasLabel = p.label.trim() !== ''
    const hasGrams = p.grams !== undefined && p.grams > 0
    return hasLabel !== hasGrams
  })
  if (halfFilled) errors.portions = 'Fyll i både namn och vikt för varje portion (eller ta bort raden).'
  return errors
}

/** Rimlighetskontroller som inte hindrar att man sparar. */
export function draftWarnings(draft: CustomFoodDraft): string[] {
  const n = draftNutrients(draft)
  const out: string[] = []
  const at = atwaterCheck(n)
  if (at?.mismatch) {
    out.push(
      `Energin stämmer inte med makronäringsämnena – kontrollera värdena. Utifrån protein, kolhydrater och fett blir det ungefär ${formatNumber(at.expected)}\u00a0kcal per 100\u00a0g.`,
    )
  }
  if (n.sugars !== undefined && n.carbs !== undefined && n.sugars > n.carbs + 0.05) out.push('Sockerarterna är fler än kolhydraterna – de ingår i kolhydraterna.')
  if (n.addedSugar !== undefined && n.sugars !== undefined && n.addedSugar > n.sugars + 0.05) out.push('Tillsatt socker är mer än sockerarterna totalt.')
  if (n.satFat !== undefined && n.fat !== undefined && n.satFat > n.fat + 0.05) out.push('Mättat fett är mer än fettet totalt.')
  const mass = (n.protein ?? 0) + (n.carbs ?? 0) + (n.fat ?? 0) + (n.fiber ?? 0) + (n.salt ?? 0) + (n.alcohol ?? 0)
  if (mass > 101) out.push(`Näringsämnena blir tillsammans ${formatNumber(mass)}\u00a0g per 100\u00a0g – mer än hela vikten.`)
  return out
}

function uniqueId(base: string, used: Set<string>): string {
  const clean = base || 'portion'
  let id = clean
  for (let i = 2; used.has(id); i++) id = `${clean}-${i}`
  used.add(id)
  return id
}

/** Fält som följer med från ett kopierat/redigerat livsmedel (bild, OFF-info, klimatvärde …). */
function inherited(from: Food | undefined, category: FoodCategory): Partial<Food> {
  if (!from) return {}
  const keep: Partial<Food> = {
    imageUrl: from.imageUrl,
    extra: from.extra,
    co2e: from.co2e,
    synonyms: from.synonyms,
  }
  // Tallriks- och kostrådsfördelningen hör ihop med kategorin.
  if (from.category === category) {
    keep.plate = from.plate
    keep.kostrad = from.kostrad
  }
  return keep
}

/** Nytt id för ett eget livsmedel. */
export function newCustomFoodId(): string {
  return `custom:${uid()}`
}

/** Bygg livsmedlet som sparas (värden per 100 g, source 'custom'). */
export function draftToFood(draft: CustomFoodDraft, base: { id: string; createdAt?: number; from?: Food; now?: number }): Food {
  const used = new Set<string>()
  const portions: Portion[] = []
  for (const p of draft.portions) {
    const label = p.label.trim()
    if (!label || !(p.grams !== undefined && p.grams > 0)) continue
    portions.push({ id: uniqueId(p.id ?? slugify(label), used), label, grams: round(p.grams, 2) })
  }
  if (draft.basis === 'portion' && draft.basisGrams !== undefined && draft.basisGrams > 0) {
    const grams = round(draft.basisGrams, 2)
    if (!portions.some((p) => Math.abs(p.grams - grams) < 0.01)) {
      portions.unshift({ id: uniqueId('portion', used), label: draft.basisLabel.trim() || '1 portion', grams })
    }
  }
  const barcode = normalizeBarcode(draft.barcode)
  const now = base.now ?? Date.now()
  return {
    ...inherited(base.from, draft.category),
    id: base.id,
    name: draft.name.trim(),
    brand: draft.brand.trim() || undefined,
    source: 'custom',
    category: draft.category,
    nutrients: draftNutrients(draft),
    portions,
    density: draft.gramsPerDl !== undefined && draft.gramsPerDl > 0 ? round(draft.gramsPerDl / 100, 4) : undefined,
    liquid: draft.liquid || undefined,
    barcode: barcode || undefined,
    tags: draft.tags.length > 0 ? [...draft.tags] : undefined,
    note: draft.note.trim() || undefined,
    createdAt: base.createdAt ?? now,
    updatedAt: now,
  }
}

/** Har formuläret ändrats sedan start? (Portionernas interna nycklar räknas inte.) */
export function draftSignature(draft: CustomFoodDraft): string {
  return JSON.stringify({ ...draft, portions: draft.portions.map(({ key: _k, ...p }) => p) })
}
