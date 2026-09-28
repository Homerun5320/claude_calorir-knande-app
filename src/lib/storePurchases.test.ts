/**
 * Köp i appen: webbversionen erbjuder inga köp och ger tomma listor (appen beter sig som förut),
 * och testerna kan byta ut butiken.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { getStorePurchases, setStorePurchasesForTests, type StorePurchases } from './storePurchases'

afterEach(() => {
  setStorePurchasesForTests(null)
})

describe('köp i appen', () => {
  it('webbversionen: inte tillgängligt, tomma listor och köp misslyckas', async () => {
    const store = getStorePurchases()
    expect(store.available()).toBe(false)
    await expect(store.getProducts()).resolves.toEqual([])
    await expect(store.purchase('livstid')).resolves.toBe('failed')
    await expect(store.restore()).resolves.toEqual([])
    await expect(store.currentEntitlements()).resolves.toEqual([])
  })

  it('testerna kan byta ut butiken och återställa den', async () => {
    const fake: StorePurchases = {
      available: () => true,
      getProducts: async () => [{ id: 'livstid', title: 'Livstidslicens', displayPrice: '699,00 kr' }],
      purchase: async () => 'purchased',
      restore: async () => [{ product: 'livstid', purchasedAt: 1, source: 'appstore' }],
      currentEntitlements: async () => [{ product: 'livstid', purchasedAt: 1, source: 'appstore' }],
    }
    setStorePurchasesForTests(fake)
    expect(getStorePurchases()).toBe(fake)
    expect(getStorePurchases().available()).toBe(true)
    await expect(getStorePurchases().purchase('ar')).resolves.toBe('purchased')
    setStorePurchasesForTests(null)
    expect(getStorePurchases().available()).toBe(false)
  })
})
