/**
 * Alias för livsmedel som tagits bort eller slagits ihop i Lagoms inbyggda databas.
 *
 * När databasen fick grövre linjer (en rad per vardagsbegrepp, tillagat som standard och
 * samlingsvärden för produkttyper med många märken) försvann många id:n. Användares favoriter,
 * Senaste, sparade måltider och de inbyggda recepten kan fortfarande peka på dem – aliasen visar
 * vägen till ersättaren.
 *
 * Modulen är liten och importerar ingen livsmedelsdata, så att den kan laddas synkront (t.ex. av
 * `useFoodStore` när sparad data läses in).
 */
import type { FoodAlias, UnitKey } from '../../../types'
import { VOLUME_ML, isPortionUnit, isVolumeUnit } from '../../../lib/units'
import { LEGACY_ALIAS_PORTIONS } from './legacy-portions'
import { mejeriAggAliases } from './mejeri-agg'
import { brodSpannmalAliases } from './brod-spannmal'
import { kottFagelCharkAliases } from './kott-fagel-chark'
import { fiskSkaldjurAliases } from './fisk-skaldjur'
import { fruktGronsakerAliases } from './frukt-gronsaker'
import { fikaSotsakerSnacksAliases } from './fika-sotsaker-snacks'
import { dryckerAliases } from './drycker'
import { fettSasNotterVegoAliases } from './fett-sas-notter-vego'
import { fardigratterSnabbmatAliases } from './fardigratter-snabbmat'

/** Aliasen per datafil (samma nycklar som `BUILTIN_FOOD_FILES`). */
export const FOOD_ALIAS_FILES = {
  'mejeri-agg': mejeriAggAliases,
  'brod-spannmal': brodSpannmalAliases,
  'kott-fagel-chark': kottFagelCharkAliases,
  'fisk-skaldjur': fiskSkaldjurAliases,
  'frukt-gronsaker': fruktGronsakerAliases,
  'fika-sotsaker-snacks': fikaSotsakerSnacksAliases,
  drycker: dryckerAliases,
  'fett-sas-notter-vego': fettSasNotterVegoAliases,
  'fardigratter-snabbmat': fardigratterSnabbmatAliases,
} as const satisfies Record<string, readonly FoodAlias[]>

/** Alla alias som en lista, med de gamla portionerna (`legacy-portions.ts`) där sådana finns. */
export const FOOD_ALIAS_LIST: readonly FoodAlias[] = Object.values(FOOD_ALIAS_FILES)
  .flat()
  .map((a: FoodAlias) => (!a.portions && Object.hasOwn(LEGACY_ALIAS_PORTIONS, a.from) ? { ...a, portions: LEGACY_ALIAS_PORTIONS[a.from] } : a))

/** Alla alias per gammalt id ('lagom:kycklingfile-ra' → alias). */
export const FOOD_ALIASES: ReadonlyMap<string, FoodAlias> = new Map(FOOD_ALIAS_LIST.map((a) => [a.from, a]))

/**
 * Aliaset för ett gammalt livsmedels-id, eller undefined om id:t inte är ett alias. Bara Lagoms
 * egna id:n ('lagom:…') kan ha alias.
 */
export function resolveFoodAlias(id: string, aliases: ReadonlyMap<string, FoodAlias> = FOOD_ALIASES): FoodAlias | undefined {
  return id.startsWith('lagom:') ? aliases.get(id) : undefined
}

/** Id:t som gäller i dag: ersättarens id för ett alias, annars id:t självt. */
export function canonicalFoodId(id: string, aliases: ReadonlyMap<string, FoodAlias> = FOOD_ALIASES): string {
  return resolveFoodAlias(id, aliases)?.to ?? id
}

/**
 * En mängd för det gamla livsmedlet uttryckt för ersättaren.
 *
 * För alias med `unit: 'g-ra'` (en rå eller okokt rad som ersatts av den tillagade) är gamla
 * mängder rå/okokt vara:
 * - gram blir rå vikt: 150 g → 150 g rå, 0,5 kg → 500 g rå,
 * - volym blir dl okokt: 3 dl → 3 dl okokt, 2 msk → 0,3 dl okokt (ersättaren har då
 *   `rawWeight.density`, se testet i aliases.test.ts) – eller, när aliaset anger det gamla
 *   livsmedlets `density`, gram rå vikt: 1 dl torr pärlcouscous (0,75 g/ml) → 75 g okokt,
 * - portionen "dl" (torkade baljväxter: "1 dl" torkade ärtor) blir dl okokt/torkad.
 *
 * För alias med `scale` räknas gram (och kg, samt volym när `density` anges) om till ersättarens
 * gram: 300 g tillagade snabbnudlar × 85/485 → 52,6 g torra nudlar (samma energi).
 *
 * En gammal portion som ersättaren saknar eller som väger annorlunda där (`alias.portions`) blir
 * ersättarens motsvarande portion eller gram (rå vikt för 'g-ra', × `scale`): "1 förpackning" rå
 * kycklingfilé → 900 g rå. Övriga portioner behålls – ersättaren har samma portion.
 */
export function aliasAmount(alias: FoodAlias | undefined, amount: number, unit: UnitKey): { amount: number; unit: UnitKey } {
  if (!alias) return { amount, unit }
  const raw = alias.unit === 'g-ra'
  const scale = !raw && positive(alias.scale) ? alias.scale : 1
  const density = positive(alias.density) ? alias.density : undefined
  if (raw) {
    if (unit === 'g') return { amount, unit: 'g-ra' }
    if (unit === 'kg') return { amount: amount * 1000, unit: 'g-ra' }
    if (isVolumeUnit(unit)) {
      if (density !== undefined) return { amount: round2(amount * VOLUME_ML[unit] * density), unit: 'g-ra' }
      return { amount: (amount * VOLUME_ML[unit]) / VOLUME_ML.dl, unit: 'dl-ra' }
    }
    if (unit === 'portion:dl') return { amount, unit: 'dl-ra' }
  } else {
    if (scale !== 1 && (unit === 'g' || unit === 'kg')) return { amount: round2(amount * scale), unit }
    if (density !== undefined && isVolumeUnit(unit)) return { amount: round2(amount * VOLUME_ML[unit] * density * scale), unit: 'g' }
  }
  if (isPortionUnit(unit) && alias.portions) {
    const id = unit.slice('portion:'.length)
    const to = Object.hasOwn(alias.portions, id) ? alias.portions[id] : undefined
    if (typeof to === 'string') return { amount, unit: `portion:${to}` }
    if (typeof to === 'number' && Number.isFinite(to) && to > 0) {
      return { amount: round2(amount * to * scale), unit: raw ? 'g-ra' : 'g' }
    }
  }
  return { amount, unit }
}

function positive(v: number | undefined): v is number {
  return v !== undefined && Number.isFinite(v) && v > 0
}

/** Avrunda omräknade mängder till två decimaler (inga flyttalsrester som 52,57731958…). */
function round2(v: number): number {
  return Math.round(v * 100) / 100
}
