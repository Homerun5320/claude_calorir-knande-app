/**
 * Lagoms inbyggda livsmedelsdatabas. Laddas lazy via `loadBuiltinFoods()` i lib/foodRepo.
 */
import type { Food } from '../../types'
import { mejeriAgg } from './mejeri-agg'
import { brodSpannmal } from './brod-spannmal'
import { kottFagelChark } from './kott-fagel-chark'
import { fiskSkaldjur } from './fisk-skaldjur'
import { fruktGronsaker } from './frukt-gronsaker'
import { fikaSotsakerSnacks } from './fika-sotsaker-snacks'
import { drycker } from './drycker'
import { fettSasNotterVego } from './fett-sas-notter-vego'
import { fardigratterSnabbmat } from './fardigratter-snabbmat'
import { restauranger } from './restauranger'

export const BUILTIN_FOODS: Food[] = [
  ...mejeriAgg,
  ...brodSpannmal,
  ...kottFagelChark,
  ...fiskSkaldjur,
  ...fruktGronsaker,
  ...fikaSotsakerSnacks,
  ...drycker,
  ...fettSasNotterVego,
  ...fardigratterSnabbmat,
  // Kedjornas egna produkter sist, efter de generiska raderna.
  ...restauranger,
]

export const BUILTIN_FOOD_FILES = {
  'mejeri-agg': mejeriAgg,
  'brod-spannmal': brodSpannmal,
  'kott-fagel-chark': kottFagelChark,
  'fisk-skaldjur': fiskSkaldjur,
  'frukt-gronsaker': fruktGronsaker,
  'fika-sotsaker-snacks': fikaSotsakerSnacks,
  drycker,
  'fett-sas-notter-vego': fettSasNotterVego,
  'fardigratter-snabbmat': fardigratterSnabbmat,
  restauranger,
} as const
