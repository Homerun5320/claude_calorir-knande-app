/**
 * Köpen i appen i vardagen: provperioden som startas med ett gratis köp i iPhone-appen
 * ('prov14', riktlinje 3.1.1), de senast kända köpen som sparas på telefonen (så att den som har
 * betalat inte stängs ute när butiken inte svarar) och nya försök när butiken inte svarar.
 */
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearDemoFlag, setDemoFlag } from '../lib/demoFlag'
import { setStorePurchasesForTests, type StoreEntitlement } from '../lib/storePurchases'
import { useLicenseStore } from '../stores/licenseStore'
import { DEFAULT_SETTINGS, useProfileStore } from '../stores/profileStore'
import {
  STORE_CACHE_KEY,
  STORE_RETRY_DELAYS_MS,
  accessStatus,
  canLog,
  currentAccess,
  currentStoreEntitlements,
  loadStoreCacheForTests,
  parseStoreCache,
  refreshStoreEntitlements,
  resetLicenseChecks,
  useAccess,
} from './useAccess'

const mocks = vi.hoisted(() => ({ storeTrial: false }))

vi.mock('../config/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../config/platform')>()),
  trialViaStore: () => mocks.storeTrial,
}))

const DAY = 86_400_000
const NOW = Date.UTC(2026, 8, 28, 10)

/** En låtsasbutik: `answer` avgör vad `currentEntitlements` svarar (en lista eller ett fel). */
function fakeStore(answer: () => StoreEntitlement[] | Error) {
  let calls = 0
  setStorePurchasesForTests({
    available: () => true,
    getProducts: async () => [],
    purchase: async () => 'purchased',
    restore: async () => [],
    currentEntitlements: async () => {
      calls++
      const result = answer()
      if (result instanceof Error) throw result
      return result
    },
  })
  return { calls: () => calls }
}

const stored = () => {
  const raw = localStorage.getItem(STORE_CACHE_KEY)
  return raw === null ? null : parseStoreCache(JSON.parse(raw))
}

beforeAll(async () => {
  await waitFor(() => expect([useLicenseStore, useProfileStore].every((s) => s.persist.hasHydrated())).toBe(true))
})

beforeEach(() => {
  mocks.storeTrial = false
  clearDemoFlag()
  localStorage.removeItem(STORE_CACHE_KEY)
  resetLicenseChecks()
  useLicenseStore.getState().resetLicenseState()
  useProfileStore.setState({ profile: null, settings: { ...DEFAULT_SETTINGS, onboardingDone: true } })
})

afterEach(() => {
  vi.useRealTimers()
  setStorePurchasesForTests(null)
  resetLicenseChecks()
  localStorage.removeItem(STORE_CACHE_KEY)
})

describe('iPhone-appen: provperioden startas med köpet prov14', () => {
  const prov = { product: 'prov14' as const, purchasedAt: NOW - 3 * DAY, source: 'appstore' as const }

  it('utan köpet väntar provperioden på att startas – den lokala starten räknas aldrig', () => {
    expect(accessStatus({ trialStartedAt: NOW - DAY, license: null, now: NOW, store: [], storeTrial: true, profileReady: true })).toEqual({ kind: 'ejstartad' })
    // Före den egna profilen (välkomstflödet, exempeldata) är den bara ny.
    expect(accessStatus({ trialStartedAt: null, license: null, now: NOW, store: [], storeTrial: true, profileReady: false })).toEqual({ kind: 'ny' })
    expect(canLog({ kind: 'ejstartad' })).toBe(false)
  })

  it('räknas från köpet, och ett gammalt köp ger ingen ny provperiod', () => {
    expect(accessStatus({ trialStartedAt: null, license: null, now: NOW, store: [prov], storeTrial: true, profileReady: true })).toMatchObject({ kind: 'prov', daysLeft: 11 })
    // En tidigare lokal start (t.ex. från en säkerhetskopia) förkortar eller förlänger inget.
    expect(accessStatus({ trialStartedAt: NOW - 13 * DAY, license: null, now: NOW, store: [prov], storeTrial: true, profileReady: true })).toMatchObject({ daysLeft: 11 })
    expect(accessStatus({ trialStartedAt: null, license: null, now: NOW, store: [{ ...prov, purchasedAt: NOW - 30 * DAY }], storeTrial: true, profileReady: true })).toMatchObject({
      kind: 'utgangen',
      licenseExpired: false,
    })
  })

  it('en licens går före, och en utgången årslicens beskrivs som det', () => {
    const livstid = { product: 'livstid' as const, purchasedAt: NOW - DAY, source: 'appstore' as const }
    expect(accessStatus({ trialStartedAt: null, license: null, now: NOW, store: [livstid], storeTrial: true, profileReady: true })).toMatchObject({ kind: 'licensierad' })
    const old = { product: 'ar' as const, purchasedAt: NOW - 400 * DAY, expiresAt: NOW - 35 * DAY, source: 'appstore' as const }
    expect(accessStatus({ trialStartedAt: null, license: null, now: NOW, store: [old], storeTrial: true, profileReady: true })).toMatchObject({
      kind: 'utgangen',
      licenseExpired: true,
    })
  })

  it('useAccess: ingen lokal provstart, och loggning spärras tills provperioden har startats', async () => {
    mocks.storeTrial = true
    let owned: StoreEntitlement[] = []
    fakeStore(() => owned)
    const { result, rerender } = renderHook(() => useAccess())
    await waitFor(() => expect(result.current).toMatchObject({ checking: false, canLog: false, status: { kind: 'ejstartad' } }))
    expect(useLicenseStore.getState().trialStartedAt).toBeNull()

    owned = [{ product: 'prov14', purchasedAt: Date.now(), source: 'appstore' }]
    await refreshStoreEntitlements({ fresh: true })
    rerender()
    expect(result.current).toMatchObject({ canLog: true, status: { kind: 'prov', daysLeft: 14 } })
  })

  it('exempeldata startar ingen provperiod och är skrivskyddad', () => {
    mocks.storeTrial = true
    setDemoFlag()
    expect(currentAccess()).toMatchObject({ demo: true, canLog: false, status: { kind: 'ny' } })
  })

  it('webben och Google Play: provperioden startar lokalt som förut', async () => {
    fakeStore(() => [])
    const { result } = renderHook(() => useAccess())
    await waitFor(() => expect(useLicenseStore.getState().trialStartedAt).not.toBeNull())
    await waitFor(() => expect(result.current).toMatchObject({ canLog: true, status: { kind: 'prov' } }))
  })
})

describe('de senast kända köpen sparas på telefonen', () => {
  const livstid: StoreEntitlement = { product: 'livstid', purchasedAt: NOW - 30 * DAY, source: 'play' }

  it('sparas när butiken svarar – utan kvitton eller id:n – och tas bort när köpet försvinner', async () => {
    let owned: StoreEntitlement[] = [livstid]
    fakeStore(() => owned)
    await refreshStoreEntitlements()
    expect(stored()).toEqual([livstid])
    expect(Object.keys(JSON.parse(localStorage.getItem(STORE_CACHE_KEY) ?? '{}'))).toEqual(['v', 'entitlements'])

    // Återbetalt: butiken svarar utan köpet.
    owned = []
    await refreshStoreEntitlements()
    expect(localStorage.getItem(STORE_CACHE_KEY)).toBeNull()
  })

  it('svarar butiken inte vid start gäller de sparade köpen – ingen som har betalat stängs ute', async () => {
    localStorage.setItem(STORE_CACHE_KEY, JSON.stringify({ v: 1, entitlements: [livstid] }))
    useLicenseStore.setState({ trialStartedAt: Date.now() - 30 * DAY })
    fakeStore(() => new Error('Billing is not available'))
    loadStoreCacheForTests()
    await refreshStoreEntitlements()
    expect(currentStoreEntitlements()).toEqual([livstid])
    expect(currentAccess()).toMatchObject({ canLog: true, status: { kind: 'licensierad', source: 'store' } })
    // Det sparade finns kvar tills butiken svarar.
    expect(stored()).toEqual([livstid])
  })

  it('en utgången årslicens i det sparade låser inte upp något', () => {
    const ar: StoreEntitlement = { product: 'ar', purchasedAt: NOW - 400 * DAY, expiresAt: Date.now() - DAY, source: 'appstore' }
    localStorage.setItem(STORE_CACHE_KEY, JSON.stringify({ v: 1, entitlements: [ar] }))
    useLicenseStore.setState({ trialStartedAt: Date.now() - 500 * DAY })
    fakeStore(() => new Error('offline'))
    loadStoreCacheForTests()
    expect(currentAccess().status).toMatchObject({ kind: 'utgangen', licenseExpired: true })
  })

  it('på webben sparas och läses inga köp', async () => {
    localStorage.setItem(STORE_CACHE_KEY, JSON.stringify({ v: 1, entitlements: [livstid] }))
    loadStoreCacheForTests()
    expect(currentStoreEntitlements()).toEqual([])
    await refreshStoreEntitlements()
    expect(stored()).toEqual([livstid]) // orört
  })

  it('parseStoreCache: skadade värden blir en tom lista eller hoppas över', () => {
    expect(parseStoreCache(null)).toEqual([])
    expect(parseStoreCache({ v: 2, entitlements: [livstid] })).toEqual([])
    expect(parseStoreCache({ v: 1, entitlements: 'x' })).toEqual([])
    expect(
      parseStoreCache({
        v: 1,
        entitlements: [
          livstid,
          { product: 'okand', purchasedAt: 1, source: 'play' },
          { product: 'ar', purchasedAt: -5, source: 'play' },
          { product: 'ar', purchasedAt: 10, expiresAt: 'snart', source: 'play' },
          { product: 'ar', purchasedAt: 10, expiresAt: 20, source: 'web' },
          { product: 'ar', purchasedAt: 10, expiresAt: 20, source: 'appstore', token: 'hemligt' },
        ],
      }),
    ).toEqual([livstid, { product: 'ar', purchasedAt: 10, expiresAt: 20, source: 'appstore' }])
  })
})

describe('nya försök när butiken inte svarar', () => {
  it('försöker igen efter en stund, och slutar när butiken har svarat', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    let answer: StoreEntitlement[] | Error = new Error('SERVICE_UNAVAILABLE')
    const store = fakeStore(() => answer)
    await refreshStoreEntitlements()
    expect(store.calls()).toBe(1)
    await vi.advanceTimersByTimeAsync(STORE_RETRY_DELAYS_MS[0])
    expect(store.calls()).toBe(2)

    answer = [{ product: 'livstid', purchasedAt: NOW, source: 'play' }]
    await vi.advanceTimersByTimeAsync(STORE_RETRY_DELAYS_MS[1])
    expect(store.calls()).toBe(3)
    expect(currentStoreEntitlements()).toEqual(answer)
    await vi.advanceTimersByTimeAsync(STORE_RETRY_DELAYS_MS[2] * 2)
    expect(store.calls()).toBe(3)
  })

  it('ger upp efter några försök (sedan när appen återfår fokus)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const store = fakeStore(() => new Error('offline'))
    await refreshStoreEntitlements()
    for (const delay of STORE_RETRY_DELAYS_MS) await vi.advanceTimersByTimeAsync(delay)
    expect(store.calls()).toBe(1 + STORE_RETRY_DELAYS_MS.length)
    await vi.advanceTimersByTimeAsync(60 * 60_000)
    expect(store.calls()).toBe(1 + STORE_RETRY_DELAYS_MS.length)
  })
})
