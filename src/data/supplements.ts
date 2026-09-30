/**
 * Mallar för vanliga kosttillskott – D-vitamin, B12, folsyra, järn, jod, omega-3 och multivitamin.
 *
 * Användaren väljer en mall och anger styrkan från sin egen förpackning (Inställningar → Mål →
 * "Lägg till kosttillskott"). Då skapas ett eget livsmedel i kategorin 'kosttillskott' med
 * portionen "1 tablett" (omega-3: "1 kapsel"), som sedan bockas av på Idag.
 *
 * - Energin är 0 och alla näringsämnen som inte står på förpackningen är okända (undefined), inte 0.
 * - En tablett räknas som 1 gram, så att värdena per 100 g blir styrkan × 100.
 * - Övre gränser (UL) följer NNR 2023 och lib/nnr.ts; för folsyra EFSA:s gräns för syntetisk folsyra.
 *   Passerar ett tillskott gränsen visas en lugn rad: "Stäm av doseringen med apoteket eller vården."
 *
 * Texterna är allmän information, inte medicinska råd.
 */
import type { Food, Nutrients } from '../types'
import { formatNutrient } from '../lib/format'
import { uid } from '../lib/id'
import { NUTRIENTS, type NutrientKey } from '../lib/nutrients'

export type SupplementTemplateId = 'd-vitamin' | 'b12' | 'folsyra' | 'jarn' | 'jod' | 'omega-3' | 'multivitamin'

export interface SupplementNutrient {
  key: NutrientKey
  /** Förvald mängd per tablett – användaren ändrar efter förpackningen. */
  amount: number
}

export interface SupplementTemplate {
  id: SupplementTemplateId
  /** Namnet på tillskottet, t.ex. "D-vitamin". */
  name: string
  emoji: string
  /** Näringsämnen per tablett med förvald styrka. Det första är huvudämnet. */
  nutrients: readonly SupplementNutrient[]
  /** Vanliga styrkor för huvudämnet (snabbval). */
  presets?: readonly number[]
  /** "1 tablett" eller "1 kapsel". */
  portionLabel: string
  /** Kort, försiktig information. */
  note: string
}

/** En tablett (eller kapsel) räknas som 1 gram. */
export const SUPPLEMENT_UNIT_GRAMS = 1

export const SUPPLEMENT_TEMPLATES: readonly SupplementTemplate[] = [
  {
    id: 'd-vitamin',
    name: 'D-vitamin',
    emoji: '☀️',
    nutrients: [{ key: 'vitD', amount: 10 }],
    presets: [10, 20, 25, 50],
    portionLabel: '1 tablett',
    note: 'Livsmedelsverket rekommenderar tillskott för vissa grupper, till exempel den som sällan är ute i dagsljus och alla från 75 år. Fråga vården om vad som passar dig.',
  },
  {
    id: 'b12',
    name: 'Vitamin B12',
    emoji: '🌱',
    nutrients: [{ key: 'vitB12', amount: 25 }],
    presets: [4, 10, 25, 100],
    portionLabel: '1 tablett',
    note: 'För dig som äter veganskt: minst 4 µg per dag enligt Livsmedelsverket. Tabletter innehåller ofta mer eftersom kroppen bara tar upp en del.',
  },
  {
    id: 'folsyra',
    name: 'Folsyra',
    emoji: '🤰',
    nutrients: [{ key: 'folate', amount: 400 }],
    presets: [400],
    portionLabel: '1 tablett',
    note: 'Livsmedelsverket rekommenderar 400 µg folsyra om dagen till den som kan bli gravid – från minst en månad före graviditeten och under de tre första månaderna av graviditeten.',
  },
  {
    id: 'jarn',
    name: 'Järn',
    emoji: '🩸',
    nutrients: [{ key: 'iron', amount: 14 }],
    presets: [7, 14, 50, 100],
    portionLabel: '1 tablett',
    note: 'Ta gärna järntillskott efter råd från vården – för mycket järn kan vara skadligt.',
  },
  {
    id: 'jod',
    name: 'Jod',
    emoji: '🧂',
    nutrients: [{ key: 'iodine', amount: 150 }],
    presets: [100, 150],
    portionLabel: '1 tablett',
    note: 'De flesta får tillräckligt med jod från jodberikat salt, mejeriprodukter, ägg och fisk. Ett tillskott kan vara aktuellt om du äter veganskt.',
  },
  {
    id: 'omega-3',
    name: 'Omega-3',
    emoji: '🐟',
    nutrients: [{ key: 'omega3', amount: 0.3 }],
    presets: [0.25, 0.3, 0.5, 1],
    portionLabel: '1 kapsel',
    note: 'Ange mängden omega-3 (EPA och DHA) per kapsel enligt förpackningen. Fet fisk två gånger i veckan ger också omega-3.',
  },
  {
    id: 'multivitamin',
    name: 'Multivitamin',
    emoji: '💊',
    nutrients: [
      { key: 'vitD', amount: 10 },
      { key: 'vitC', amount: 80 },
      { key: 'thiamin', amount: 1.1 },
      { key: 'riboflavin', amount: 1.4 },
      { key: 'niacin', amount: 16 },
      { key: 'vitB6', amount: 1.4 },
      { key: 'folate', amount: 200 },
      { key: 'vitB12', amount: 2.5 },
      { key: 'iron', amount: 7 },
      { key: 'zinc', amount: 10 },
      { key: 'iodine', amount: 150 },
      { key: 'selenium', amount: 55 },
    ],
    portionLabel: '1 tablett',
    note: 'Typiska värden för en multivitamin – ändra dem efter din förpackning.',
  },
]

/** Mallen med ett visst id. */
export function supplementTemplate(id: string): SupplementTemplate | undefined {
  return SUPPLEMENT_TEMPLATES.find((t) => t.id === id)
}

/**
 * Övre gräns per dag för vuxna (UL) enligt NNR 2023 – samma värden som i lib/nnr.ts där de finns.
 * Vitamin A: gränsen för retinol. Folsyra: EFSA:s gräns för syntetisk folsyra (1 000 µg).
 * Magnesium: gränsen gäller bara tillskott.
 */
export const SUPPLEMENT_UPPER_LIMITS: Partial<Record<NutrientKey, number>> = {
  vitA: 3000,
  vitD: 100,
  vitE: 300,
  vitB6: 12,
  folate: 1000,
  calcium: 2500,
  magnesium: 250,
  iron: 40,
  zinc: 25,
  selenium: 255,
  iodine: 600,
}

/** Den lugna raden när ett tillskott passerar den övre gränsen. */
export const SUPPLEMENT_LIMIT_NOTE = 'Stäm av doseringen med apoteket eller vården.'

/** Styrka per tablett: ett tal för huvudämnet eller mängder per näringsämne. */
export type SupplementStrength = number | Partial<Record<NutrientKey, number>>

/** Mängder per tablett för en mall och en styrka. Ogiltiga värden (negativa, NaN) ger mallens förval. */
export function supplementAmounts(template: SupplementTemplate, strength: SupplementStrength = {}): Partial<Record<NutrientKey, number>> {
  const out: Partial<Record<NutrientKey, number>> = {}
  template.nutrients.forEach((n, i) => {
    const given = typeof strength === 'number' ? (i === 0 ? strength : undefined) : strength[n.key]
    // Tomt eller ogiltigt värde (negativt, NaN) ger mallens förvalda mängd; 0 betyder "finns inte".
    out[n.key] = given !== undefined && Number.isFinite(given) && given >= 0 ? given : n.amount
  })
  return out
}

/** Näringsämnen där mängden per dag passerar den övre gränsen. */
export function overUpperLimit(amounts: Nutrients): NutrientKey[] {
  const out: NutrientKey[] = []
  for (const [key, limit] of Object.entries(SUPPLEMENT_UPPER_LIMITS) as Array<[NutrientKey, number]>) {
    const v = amounts[key]
    if (v !== undefined && v > limit) out.push(key)
  }
  return out
}

/** Näringsämnenas namn som en svensk uppräkning: "vitamin D", "vitamin D och järn", "vitamin D, järn och zink". */
export function nutrientListText(keys: readonly NutrientKey[]): string {
  const names = keys.map((k) => {
    const name = NUTRIENTS[k].name
    return name.charAt(0).toLocaleLowerCase('sv-SE') + name.slice(1)
  })
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} och ${names[names.length - 1]}`
}

/** "D-vitamin 10 µg", "Omega-3 0,3 g" – multivitamin utan styrka i namnet. */
export function supplementName(template: SupplementTemplate, strength: SupplementStrength = {}): string {
  if (template.nutrients.length !== 1) return template.name
  const key = template.nutrients[0].key
  const amount = supplementAmounts(template, strength)[key]
  return amount === undefined ? template.name : `${template.name} ${formatNutrient(key, amount)}`
}

export interface SupplementFoodOptions {
  /** Eget namn (annars t.ex. "D-vitamin 10 µg"). */
  name?: string
  id?: string
  now?: number
}

/**
 * Ett eget livsmedel för ett kosttillskott: kategori 'kosttillskott', portionen "1 tablett"
 * (1 g), energi 0 och övriga näringsämnen okända.
 */
export function supplementFood(template: SupplementTemplate, strength: SupplementStrength = {}, opts: SupplementFoodOptions = {}): Food {
  const amounts = supplementAmounts(template, strength)
  const nutrients: Nutrients = { kcal: 0 }
  for (const [key, amount] of Object.entries(amounts) as Array<[NutrientKey, number]>) {
    nutrients[key] = Number(((amount * 100) / SUPPLEMENT_UNIT_GRAMS).toFixed(4))
  }
  const portionId = template.portionLabel.includes('kapsel') ? 'kapsel' : 'tablett'
  const now = opts.now ?? Date.now()
  const listed = Object.keys(amounts)
    .map((k) => NUTRIENTS[k as NutrientKey].name.toLowerCase())
    .join(', ')
  return {
    id: opts.id ?? `custom:${uid()}`,
    name: opts.name?.trim() || supplementName(template, strength),
    source: 'custom',
    category: 'kosttillskott',
    nutrients,
    portions: [{ id: portionId, label: template.portionLabel, grams: SUPPLEMENT_UNIT_GRAMS }],
    note: `Kosttillskott (${listed}). Mängden per ${portionId} enligt förpackningen – övriga näringsämnen är okända.`,
    createdAt: now,
    updatedAt: now,
  }
}

/** true för egna livsmedel som är kosttillskott (visas med en bock på Idag). */
export function isSupplementFood(food: Pick<Food, 'category' | 'source' | 'id'>): boolean {
  return food.category === 'kosttillskott' && (food.source === 'custom' || food.id.startsWith('custom:'))
}
