/**
 * Kompakt format för att skriva Lagoms inbyggda livsmedelsdatabas.
 *
 * Alla värden per 100 g ätlig del. För drycker: per 100 g (≈ 100 ml) och `liquid: true`.
 * Ange bara värden du vet – utelämnade näringsämnen visas som okända ("–"), aldrig som 0.
 */
import type { Food, FoodCategory, FoodTag, KostradContrib, Nutrients, PlateSplit } from '../../types'
import { completeNutrients } from '../../lib/nutrients'

export interface FoodSeed {
  /** Slug, unik i hela databasen, t.ex. 'kanelbulle'. Blir id 'lagom:kanelbulle'. */
  id: string
  /** Svenskt namn i Livsmedelsverkets stil: "Mjölk mellan 1,5 % fett", "Kanelbulle". */
  name: string
  cat: FoodCategory
  brand?: string
  // Makro per 100 g
  kcal: number
  prot: number
  carb: number
  fat: number
  fiber?: number
  sugar?: number
  addedSugar?: number
  satFat?: number
  salt?: number
  alc?: number
  /** Övriga näringsämnen per 100 g (vitaminer, mineraler, fettsyror, fullkorn, koffein …). */
  n?: Nutrients
  /** Portioner: [id, etikett, gram]. Första är förvald. T.ex. ['st', '1 st (medel)', 60]. */
  portions?: Array<[string, string, number]>
  /** g/ml – krävs för att kunna ange dl/msk/tsk. */
  density?: number
  liquid?: boolean
  tags?: FoodTag[]
  /** Sökord/synonymer, t.ex. ['bulle']. */
  syn?: string[]
  /** kg CO2e per kg, om känt bättre än kategorins schablon. */
  co2e?: number
  plate?: PlateSplit
  kostrad?: KostradContrib
  note?: string
  /**
   * Livsmedelsverkets livsmedelsnummer för SAMMA livsmedel (samma tillagning). Kopplingen används för
   * att fylla i näringsämnen som saknas här och för att inte visa dubbletter i sökningen.
   */
  lmv?: number
}

export function defineFood(s: FoodSeed): Food {
  const nutrients: Nutrients = completeNutrients({
    kcal: s.kcal,
    protein: s.prot,
    carbs: s.carb,
    fat: s.fat,
    ...(s.fiber !== undefined && { fiber: s.fiber }),
    ...(s.sugar !== undefined && { sugars: s.sugar }),
    ...(s.addedSugar !== undefined && { addedSugar: s.addedSugar }),
    ...(s.satFat !== undefined && { satFat: s.satFat }),
    ...(s.salt !== undefined && { salt: s.salt }),
    ...(s.alc !== undefined && { alcohol: s.alc }),
    ...s.n,
  })
  return {
    id: `lagom:${s.id}`,
    name: s.name,
    brand: s.brand,
    source: 'lagom',
    category: s.cat,
    nutrients,
    portions: (s.portions ?? []).map(([id, label, grams]) => ({ id, label, grams })),
    density: s.density,
    liquid: s.liquid,
    tags: s.tags,
    synonyms: s.syn,
    co2e: s.co2e,
    plate: s.plate,
    kostrad: s.kostrad,
    note: s.note,
    lmvNumber: s.lmv,
  }
}

export function defineFoods(seeds: FoodSeed[]): Food[] {
  return seeds.map(defineFood)
}
