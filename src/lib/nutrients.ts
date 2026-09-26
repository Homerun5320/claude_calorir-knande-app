/**
 * Näringsämnen – nycklar, metadata och räknehjälp.
 * Namn och enheter följer Livsmedelsverkets livsmedelsdatabas.
 */

import type { Nutrients } from '../types'

export const NUTRIENT_KEYS = [
  // Energi & makro
  'kcal',
  'protein',
  'carbs',
  'sugars',
  'addedSugar',
  'fiber',
  'wholegrain',
  'fat',
  'satFat',
  'monoFat',
  'polyFat',
  'omega3',
  'cholesterol',
  'salt',
  'alcohol',
  'caffeine',
  // Vitaminer
  'vitA',
  'vitD',
  'vitE',
  'vitK',
  'vitC',
  'thiamin',
  'riboflavin',
  'niacin',
  'vitB6',
  'folate',
  'vitB12',
  // Mineraler
  'calcium',
  'iron',
  'magnesium',
  'potassium',
  'sodium',
  'phosphorus',
  'zinc',
  'selenium',
  'iodine',
] as const

export type NutrientKey = (typeof NUTRIENT_KEYS)[number]

export type NutrientGroup = 'energi' | 'makro' | 'fett' | 'kolhydrat' | 'vitamin' | 'mineral' | 'ovrigt'

export interface NutrientMeta {
  key: NutrientKey
  /** Svenskt namn. */
  name: string
  /** Kort namn för tabeller/diagram. */
  short: string
  unit: 'kcal' | 'g' | 'mg' | 'µg'
  group: NutrientGroup
  /** Antal decimaler vid visning. */
  decimals: number
  /** Livsmedelsverkets förkortning (för import). */
  lmvCode?: string
  /** Hjälptext. */
  info?: string
}

export const NUTRIENTS: Record<NutrientKey, NutrientMeta> = {
  kcal: { key: 'kcal', name: 'Energi', short: 'Energi', unit: 'kcal', group: 'energi', decimals: 0, lmvCode: 'ENERC_KCAL' },
  protein: { key: 'protein', name: 'Protein', short: 'Protein', unit: 'g', group: 'makro', decimals: 1, lmvCode: 'PROT', info: 'Bygger och underhåller muskler. Mättar bra.' },
  carbs: { key: 'carbs', name: 'Kolhydrater', short: 'Kolh.', unit: 'g', group: 'makro', decimals: 1, lmvCode: 'CHO', info: 'Tillgängliga kolhydrater – kroppens främsta bränsle.' },
  sugars: { key: 'sugars', name: 'Sockerarter', short: 'Socker', unit: 'g', group: 'kolhydrat', decimals: 1, lmvCode: 'SUGAR', info: 'Totala sockerarter, inklusive naturligt socker i frukt och mjölk.' },
  addedSugar: { key: 'addedSugar', name: 'Tillsatt socker', short: 'Tills. socker', unit: 'g', group: 'kolhydrat', decimals: 1, lmvCode: 'SUGAR_ADDED', info: 'Socker som tillsatts vid tillverkning eller tillagning. Bör vara under 10 E%.' },
  fiber: { key: 'fiber', name: 'Fibrer', short: 'Fibrer', unit: 'g', group: 'kolhydrat', decimals: 1, lmvCode: 'FIBT', info: 'Kostfiber – bra för magen, mättnaden och blodsockret.' },
  wholegrain: { key: 'wholegrain', name: 'Fullkorn', short: 'Fullkorn', unit: 'g', group: 'kolhydrat', decimals: 1, lmvCode: 'WHOLEGRAIN', info: 'Livsmedelsverket rekommenderar 70 g/dag för kvinnor och 90 g/dag för män.' },
  fat: { key: 'fat', name: 'Fett', short: 'Fett', unit: 'g', group: 'makro', decimals: 1, lmvCode: 'FAT' },
  satFat: { key: 'satFat', name: 'Mättat fett', short: 'Mättat', unit: 'g', group: 'fett', decimals: 1, lmvCode: 'FASAT', info: 'Bör vara under 10 E%. Byt gärna mot omättat fett.' },
  monoFat: { key: 'monoFat', name: 'Enkelomättat fett', short: 'Enkelomätt.', unit: 'g', group: 'fett', decimals: 1, lmvCode: 'FAMS' },
  polyFat: { key: 'polyFat', name: 'Fleromättat fett', short: 'Fleromätt.', unit: 'g', group: 'fett', decimals: 1, lmvCode: 'FAPU' },
  omega3: { key: 'omega3', name: 'Omega-3', short: 'Omega-3', unit: 'g', group: 'fett', decimals: 2, info: 'Summa omega-3-fettsyror (ALA, EPA, DHA). Finns i fet fisk, rapsolja och valnötter.' },
  cholesterol: { key: 'cholesterol', name: 'Kolesterol', short: 'Kolesterol', unit: 'mg', group: 'fett', decimals: 0, lmvCode: 'CHORL' },
  salt: { key: 'salt', name: 'Salt', short: 'Salt', unit: 'g', group: 'ovrigt', decimals: 2, lmvCode: 'NACL', info: 'Rekommendationen är högst 6 g salt per dag för vuxna.' },
  alcohol: { key: 'alcohol', name: 'Alkohol', short: 'Alkohol', unit: 'g', group: 'ovrigt', decimals: 1, lmvCode: 'ALC', info: 'Ett standardglas innehåller 12 g alkohol.' },
  caffeine: { key: 'caffeine', name: 'Koffein', short: 'Koffein', unit: 'mg', group: 'ovrigt', decimals: 0, info: 'Upp till 400 mg per dag bedöms säkert för friska vuxna (EFSA), 200 mg vid graviditet.' },
  vitA: { key: 'vitA', name: 'Vitamin A', short: 'Vit A', unit: 'µg', group: 'vitamin', decimals: 0, lmvCode: 'VITA', info: 'Retinolekvivalenter. Syn, immunförsvar och hud.' },
  vitD: { key: 'vitD', name: 'Vitamin D', short: 'Vit D', unit: 'µg', group: 'vitamin', decimals: 1, lmvCode: 'VITD', info: 'Viktigt i Sverige under mörka månader. Finns i fisk, berikade mejeriprodukter och matfett.' },
  vitE: { key: 'vitE', name: 'Vitamin E', short: 'Vit E', unit: 'mg', group: 'vitamin', decimals: 1, lmvCode: 'VITE' },
  vitK: { key: 'vitK', name: 'Vitamin K', short: 'Vit K', unit: 'µg', group: 'vitamin', decimals: 0, lmvCode: 'VITK' },
  vitC: { key: 'vitC', name: 'Vitamin C', short: 'Vit C', unit: 'mg', group: 'vitamin', decimals: 0, lmvCode: 'VITC' },
  thiamin: { key: 'thiamin', name: 'Tiamin (B1)', short: 'B1', unit: 'mg', group: 'vitamin', decimals: 2, lmvCode: 'THIA' },
  riboflavin: { key: 'riboflavin', name: 'Riboflavin (B2)', short: 'B2', unit: 'mg', group: 'vitamin', decimals: 2, lmvCode: 'RIBF' },
  niacin: { key: 'niacin', name: 'Niacin (B3)', short: 'B3', unit: 'mg', group: 'vitamin', decimals: 1, lmvCode: 'NIA' },
  vitB6: { key: 'vitB6', name: 'Vitamin B6', short: 'B6', unit: 'mg', group: 'vitamin', decimals: 2, lmvCode: 'VITB6' },
  folate: { key: 'folate', name: 'Folat', short: 'Folat', unit: 'µg', group: 'vitamin', decimals: 0, lmvCode: 'FOL', info: 'Extra viktigt för den som kan bli gravid.' },
  vitB12: { key: 'vitB12', name: 'Vitamin B12', short: 'B12', unit: 'µg', group: 'vitamin', decimals: 2, lmvCode: 'VITB12', info: 'Finns nästan bara i animaliska livsmedel – veganer behöver tillskott eller berikade produkter.' },
  calcium: { key: 'calcium', name: 'Kalcium', short: 'Kalcium', unit: 'mg', group: 'mineral', decimals: 0, lmvCode: 'CA' },
  iron: { key: 'iron', name: 'Järn', short: 'Järn', unit: 'mg', group: 'mineral', decimals: 1, lmvCode: 'FE', info: 'Många kvinnor i fertil ålder får i sig för lite järn.' },
  magnesium: { key: 'magnesium', name: 'Magnesium', short: 'Magnesium', unit: 'mg', group: 'mineral', decimals: 0, lmvCode: 'MG' },
  potassium: { key: 'potassium', name: 'Kalium', short: 'Kalium', unit: 'mg', group: 'mineral', decimals: 0, lmvCode: 'K' },
  sodium: { key: 'sodium', name: 'Natrium', short: 'Natrium', unit: 'mg', group: 'mineral', decimals: 0, lmvCode: 'NA' },
  phosphorus: { key: 'phosphorus', name: 'Fosfor', short: 'Fosfor', unit: 'mg', group: 'mineral', decimals: 0, lmvCode: 'P' },
  zinc: { key: 'zinc', name: 'Zink', short: 'Zink', unit: 'mg', group: 'mineral', decimals: 1, lmvCode: 'ZN' },
  selenium: { key: 'selenium', name: 'Selen', short: 'Selen', unit: 'µg', group: 'mineral', decimals: 1, lmvCode: 'SE' },
  iodine: { key: 'iodine', name: 'Jod', short: 'Jod', unit: 'µg', group: 'mineral', decimals: 0, lmvCode: 'ID', info: 'Välj jodberikat salt. Finns även i fisk, mejeri och ägg.' },
}

export const MACRO_KEYS = ['protein', 'carbs', 'fat'] as const satisfies readonly NutrientKey[]
export const VITAMIN_KEYS = NUTRIENT_KEYS.filter((k) => NUTRIENTS[k].group === 'vitamin')
export const MINERAL_KEYS = NUTRIENT_KEYS.filter((k) => NUTRIENTS[k].group === 'mineral')

/** Energi per gram (Atwater, som i EU-förordning 1169/2011). */
export const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9, fiber: 2, alcohol: 7 } as const

export const KJ_PER_KCAL = 4.184

/** Gram alkohol i ett svenskt standardglas. */
export const STANDARD_DRINK_G = 12

/** Multiplicera alla värden med en faktor. Okända värden förblir okända. */
export function scaleNutrients(n: Nutrients, factor: number): Nutrients {
  const out: Nutrients = {}
  for (const key in n) {
    const v = n[key as NutrientKey]
    if (v !== undefined && Number.isFinite(v)) out[key as NutrientKey] = v * factor
  }
  return out
}

/** Näringsvärden för `grams` gram av ett livsmedel med värden per 100 g. */
export function nutrientsForGrams(per100: Nutrients, grams: number): Nutrients {
  return scaleNutrients(per100, grams / 100)
}

/** Summera flera näringsuppsättningar. Ett ämne är okänt i summan bara om det saknas i alla delar. */
export function sumNutrients(list: Nutrients[]): Nutrients {
  const out: Nutrients = {}
  for (const n of list) {
    for (const key in n) {
      const v = n[key as NutrientKey]
      if (v === undefined || !Number.isFinite(v)) continue
      out[key as NutrientKey] = (out[key as NutrientKey] ?? 0) + v
    }
  }
  return out
}

/** Energi i kcal beräknad från makronäringsämnen (Atwater). */
export function kcalFromMacros(n: Nutrients): number {
  return (
    (n.protein ?? 0) * KCAL_PER_G.protein +
    (n.carbs ?? 0) * KCAL_PER_G.carbs +
    (n.fat ?? 0) * KCAL_PER_G.fat +
    (n.fiber ?? 0) * KCAL_PER_G.fiber +
    (n.alcohol ?? 0) * KCAL_PER_G.alcohol
  )
}

/** Energifördelning (E%) för protein, kolhydrater, fett och alkohol. */
export function energyDistribution(n: Nutrients): { protein: number; carbs: number; fat: number; alcohol: number } {
  const p = (n.protein ?? 0) * KCAL_PER_G.protein
  const c = (n.carbs ?? 0) * KCAL_PER_G.carbs + (n.fiber ?? 0) * KCAL_PER_G.fiber
  const f = (n.fat ?? 0) * KCAL_PER_G.fat
  const a = (n.alcohol ?? 0) * KCAL_PER_G.alcohol
  const total = p + c + f + a
  if (total <= 0) return { protein: 0, carbs: 0, fat: 0, alcohol: 0 }
  return { protein: (p / total) * 100, carbs: (c / total) * 100, fat: (f / total) * 100, alcohol: (a / total) * 100 }
}

/** Salt (g) från natrium (mg) och tvärtom. */
export const saltFromSodiumMg = (mg: number) => (mg * 2.5) / 1000
export const sodiumMgFromSalt = (g: number) => (g * 1000) / 2.5

/**
 * Fyll i härledda värden: salt ↔ natrium och kcal från makron om energi saknas.
 * Returnerar ett nytt objekt.
 */
export function completeNutrients(n: Nutrients): Nutrients {
  const out = { ...n }
  if (out.salt === undefined && out.sodium !== undefined) out.salt = saltFromSodiumMg(out.sodium)
  if (out.sodium === undefined && out.salt !== undefined) out.sodium = sodiumMgFromSalt(out.salt)
  if (out.kcal === undefined && (out.protein !== undefined || out.carbs !== undefined || out.fat !== undefined)) {
    out.kcal = kcalFromMacros(out)
  }
  return out
}

/** Andel (0–1) av de listade nycklarna som har kända värden. */
export function completeness(n: Nutrients, keys: readonly NutrientKey[] = NUTRIENT_KEYS): number {
  if (keys.length === 0) return 1
  let known = 0
  for (const k of keys) if (n[k] !== undefined) known++
  return known / keys.length
}

/** Antal standardglas (12 g alkohol). */
export function standardDrinks(n: Nutrients): number {
  return (n.alcohol ?? 0) / STANDARD_DRINK_G
}
