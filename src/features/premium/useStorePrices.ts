/**
 * Priserna i en mening, med butikens priser när de har hämtats (köp i appen). Komponenten ritas om
 * när priserna kommer – t.ex. i välkomststeget och sammanfattningen före provperioden.
 */
import { useEffect, useSyncExternalStore } from 'react'
import { loadStorePrices, priceSummaryText, storePricesVersion, subscribeStorePrices } from './premiumLogic'

export function usePriceSummaryText(): string {
  useSyncExternalStore(subscribeStorePrices, storePricesVersion, storePricesVersion)
  useEffect(() => {
    void loadStorePrices()
  }, [])
  return priceSummaryText()
}
