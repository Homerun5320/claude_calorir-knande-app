/**
 * Små formateringshjälpare för Insikter (bygger på lib/format).
 */
import { formatPercent } from '../../lib/format'

/** "36 %" med hårt mellanslag, så att procenttecknet aldrig hamnar ensamt på en ny rad. */
export function percentText(value: number | undefined, decimals = 0): string {
  return formatPercent(value, decimals).replace(' %', ' %')
}
