/**
 * Alias för borttagna livsmedel i `../restauranger.ts` (restaurangkedjor och kaféer).
 *
 * Tar en kedja bort eller byter namn på en produkt: behåll raden med kedjans senaste värden, eller
 * lägg ett alias hit till kedjans nya motsvarighet (eller den generiska raden, t.ex.
 * 'lagom:cheeseburgare') så att favoriter, Senaste och sparade måltider fortsätter att fungera.
 * Båda id:na skrivs fullständigt med prefixet 'lagom:'.
 *
 * @example { from: 'lagom:kedjan-gammal-burgare', to: 'lagom:kedjan-ny-burgare' }
 */
import type { FoodAlias } from '../../../types'

export const restaurangerAliases: FoodAlias[] = []
