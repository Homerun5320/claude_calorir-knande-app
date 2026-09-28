/**
 * "Logga med tallriken" – en uppskattning för mat som inte går att väga (lunchrestaurangen,
 * middag hos vänner, matlådan på jobbet).
 *
 * Man väljer tallrik, hur stor del av den som är grönsaker, kolhydrater och protein, vad delarna
 * består av, hur mycket som ligger på (lite/normalt/mycket) och ev. sås. Lagom räknar fram gram per
 * del med kurerade livsmedel och visar energin som ett intervall (±25 %) – det är en uppskattning.
 *
 * EGNA ANTAGANDEN (inte från någon myndighet – justera här om de visar sig ligga fel):
 *
 * Referensgram = vikten om HELA tallriken täcktes av en del, lagt som en vanlig portion
 * (fyllnadsgrad "normal"), för ett livsmedel med typisk täthet för delen:
 *
 * | Tallrik                        | Grönsaker | Kolhydrater | Protein |
 * |--------------------------------|-----------|-------------|---------|
 * | Flat tallrik (ca 26 cm)        | 300 g     | 500 g       | 550 g   |
 * | Djup tallrik (pasta, gryta)    | 340 g     | 580 g       | 630 g   |
 * | Matlåda (ca 0,75–1 l)          | 330 g     | 550 g       | 600 g   |
 * | Skål (bowl, ca 0,5–0,75 l)     | 240 g     | 400 g       | 440 g   |
 *
 * Kontroll: en flat tallrik med ½ grönsaker, ⅓ potatis och ¼ kyckling (skalat till en hel tallrik)
 * ger ungefär 140 g kokta grönsaker, 155 g potatis och 125 g kyckling – i nivå med en vanlig svensk
 * middagsportion (ca 400–450 g, knappt 500 kcal).
 *
 * Livsmedlen inom en del väger olika mycket för samma yta – `factor` justerar (sallad är luftig,
 * rotfrukter kompakta, en skiva bröd tunn). Fyllnadsgraden multiplicerar: lite 0,6, normal 1,
 * mycket 1,4. Sås anges i dl ovanpå. Andelar som tillsammans blir mer än en hel tallrik skalas ned
 * till en hel.
 */
import type { Food, PlateSplit } from '../../types'
import { gramsFor } from '../../lib/units'
import { nutrientsForGrams } from '../../lib/nutrients'

/** Anteckningen som följer med delarna till dagboken. */
export const PLATE_NOTE = 'Uppskattat med tallriken'

export type PlateType = 'flat' | 'djup' | 'lada' | 'skal'
export type PlateFill = 'lite' | 'normal' | 'mycket'
export type PlatePartKey = 'veg' | 'carb' | 'protein'

export const PLATE_TYPES: Record<PlateType, { label: string; long: string; refGrams: Record<PlatePartKey, number> }> = {
  flat: { label: 'Flat', long: 'Flat tallrik', refGrams: { veg: 300, carb: 500, protein: 550 } },
  djup: { label: 'Djup', long: 'Djup tallrik', refGrams: { veg: 340, carb: 580, protein: 630 } },
  lada: { label: 'Låda', long: 'Matlåda', refGrams: { veg: 330, carb: 550, protein: 600 } },
  skal: { label: 'Skål', long: 'Skål', refGrams: { veg: 240, carb: 400, protein: 440 } },
}

export const PLATE_FILL: Record<PlateFill, { label: string; factor: number }> = {
  lite: { label: 'Lite', factor: 0.6 },
  normal: { label: 'Normalt', factor: 1 },
  mycket: { label: 'Mycket', factor: 1.4 },
}

/** Andelar av tallriken att välja mellan. */
export const PLATE_SHARES: ReadonlyArray<{ value: number; label: string; long: string }> = [
  { value: 0, label: '0', long: 'Inget' },
  { value: 1 / 6, label: '⅙', long: 'En sjättedel' },
  { value: 1 / 4, label: '¼', long: 'En fjärdedel' },
  { value: 1 / 3, label: '⅓', long: 'En tredjedel' },
  { value: 1 / 2, label: '½', long: 'Hälften' },
]

export interface PlateChoice {
  id: string
  label: string
  /** Kurerat livsmedel i Lagoms databas. */
  foodId: string
  /** Vikt för samma yta jämfört med delens typiska livsmedel (1 = typisk). */
  factor: number
}

export const PLATE_CHOICES: Record<PlatePartKey, readonly PlateChoice[]> = {
  carb: [
    { id: 'potatis', label: 'Potatis', foodId: 'lagom:potatis-kokt-skalad', factor: 1 },
    { id: 'pasta', label: 'Pasta', foodId: 'lagom:pasta-vete-kokt', factor: 0.9 },
    { id: 'ris', label: 'Ris', foodId: 'lagom:ris-langkornigt-kokt', factor: 0.9 },
    { id: 'bulgur', label: 'Bulgur', foodId: 'lagom:bulgur-kokt', factor: 0.85 },
    { id: 'brod', label: 'Bröd', foodId: 'lagom:fullkornsbrod', factor: 0.35 },
  ],
  protein: [
    { id: 'kyckling', label: 'Kyckling', foodId: 'lagom:kycklingfile-stekt', factor: 1 },
    { id: 'kottbullar', label: 'Köttbullar', foodId: 'lagom:kottbullar-fardiga', factor: 1 },
    { id: 'fisk', label: 'Fisk', foodId: 'lagom:torsk-kokt', factor: 0.9 },
    { id: 'bonor', label: 'Bönor', foodId: 'lagom:kidneybonor-kokta', factor: 0.9 },
    { id: 'agg', label: 'Ägg', foodId: 'lagom:agg-ratt', factor: 0.9 },
  ],
  veg: [
    { id: 'sallad', label: 'Sallad', foodId: 'lagom:sallad-blandad', factor: 0.4 },
    { id: 'rotfrukter', label: 'Rotfrukter', foodId: 'lagom:rotfrukter-ugnsrostade', factor: 1.3 },
    // Raden i korgen och dagboken heter "Frysta grönsaker" (Livsmedelsverkets värde för en kokt
    // grönsaksblandning) – valet heter därför också så, så att ingen tror att något blev fel.
    { id: 'kokta', label: 'Kokta eller frysta', foodId: 'lagom:gronsaker-frysta', factor: 1 },
  ],
}

export const SAUCE_CHOICES: readonly PlateChoice[] = [
  { id: 'graddsas', label: 'Gräddsås', foodId: 'lagom:gradsas-brunsas-tillagad', factor: 1 },
  { id: 'tomatsas', label: 'Tomatsås', foodId: 'lagom:pastasas-tomat-burk', factor: 1 },
]

/** Sås i dl att välja mellan. */
export const SAUCE_DL: readonly number[] = [0.5, 1, 1.5, 2]

export interface PlateInput {
  plate: PlateType
  fill: PlateFill
  /** Andel av tallriken per del, 0–1. */
  shares: Record<PlatePartKey, number>
  /** Vald rad i `PLATE_CHOICES` per del (id). */
  choices: Record<PlatePartKey, string>
  /** Sås (id i `SAUCE_CHOICES`) och mängd i dl – utelämnas utan sås. */
  sauce?: { id: string; dl: number }
}

export interface PlateItem {
  food: Food
  grams: number
  /** Delen av tallriken, eller 'sauce'. */
  part: PlatePartKey | 'sauce'
  /** Såsen anges i dl (om livsmedlet har densitet), annars gram. */
  dl?: number
}

export interface PlateEstimate {
  items: PlateItem[]
  /** Energin −25 %, avrundad till tiotal. */
  kcalLow: number
  /** Energin +25 %, avrundad till tiotal. */
  kcalHigh: number
  /** Energin utan intervall (för tester och beräkningar). */
  kcal: number
}

export const DEFAULT_PLATE: PlateInput = {
  plate: 'flat',
  fill: 'normal',
  shares: { veg: 1 / 3, carb: 1 / 3, protein: 1 / 4 },
  choices: { veg: 'kokta', carb: 'potatis', protein: 'kyckling' },
}

const PARTS: readonly PlatePartKey[] = ['veg', 'carb', 'protein']
const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0)
const roundTo = (v: number, step: number) => Math.round(v / step) * step

/** Andelarna som tallriken faktiskt visar – skalas ned till en hel tallrik om de blir mer. */
export function plateFractions(shares: Record<PlatePartKey, number>): PlateSplit {
  const s = { veg: clamp01(shares.veg), carb: clamp01(shares.carb), protein: clamp01(shares.protein) }
  const sum = s.veg + s.carb + s.protein
  if (sum <= 1) return s
  return { veg: s.veg / sum, carb: s.carb / sum, protein: s.protein / sum }
}

/**
 * Uppskatta tallriken: gram per del och energiintervall (±25 %).
 * `resolve` slår upp livsmedel (t.ex. `useFoodResolver()`); delar vars livsmedel saknas hoppas över.
 */
export function estimatePlate(input: PlateInput, resolve: (id: string) => Food | undefined): PlateEstimate {
  const type = PLATE_TYPES[input.plate] ?? PLATE_TYPES.flat
  const fill = (PLATE_FILL[input.fill] ?? PLATE_FILL.normal).factor
  const fractions = plateFractions(input.shares)
  const items: PlateItem[] = []

  for (const part of PARTS) {
    const share = fractions[part]
    if (!(share > 0)) continue
    const choice = PLATE_CHOICES[part].find((c) => c.id === input.choices[part]) ?? PLATE_CHOICES[part][0]
    const food = resolve(choice.foodId)
    if (!food) continue
    const grams = roundTo(type.refGrams[part] * share * fill * choice.factor, 5)
    if (grams >= 5) items.push({ food, grams, part })
  }

  if (input.sauce && input.sauce.dl > 0) {
    const choice = SAUCE_CHOICES.find((c) => c.id === input.sauce?.id)
    const food = choice ? resolve(choice.foodId) : undefined
    if (food) {
      const byVolume = gramsFor(food, input.sauce.dl, 'dl')
      // Utan densitet: sås väger ungefär som vatten (1 dl ≈ 100 g).
      const grams = Number.isFinite(byVolume) ? byVolume : input.sauce.dl * 100
      items.push({ food, grams: Math.round(grams), part: 'sauce', dl: Number.isFinite(byVolume) ? input.sauce.dl : undefined })
    }
  }

  let kcal = 0
  for (const item of items) kcal += nutrientsForGrams(item.food.nutrients, item.grams).kcal ?? 0
  return { items, kcal, kcalLow: roundTo(kcal * 0.75, 10), kcalHigh: roundTo(kcal * 1.25, 10) }
}
