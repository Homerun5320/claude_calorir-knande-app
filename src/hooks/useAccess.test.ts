/**
 * Tillgången med köp i appen: ett gällande köp (livstid, eller ett år som inte har gått ut) ger
 * licens med källan 'store', en provperiod köpt i butiken ('prov14') räknas från det tidigaste
 * av den lokala starten och köpet. Webbversionen ger inga köp – då är allt som förut.
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestLicense } from '../lib/license'
import { getStorePurchases, setStorePurchasesForTests, type StoreEntitlement } from '../lib/storePurchases'
import { clearDemoFlag } from '../lib/demoFlag'
import { useLicenseStore } from '../stores/licenseStore'
import { DEFAULT_SETTINGS, useProfileStore } from '../stores/profileStore'
import { accessStatus, currentAccess, currentStoreEntitlements, refreshStoreEntitlements, resetLicenseChecks, useAccess } from './useAccess'

const DAY = 86_400_000
const NOW = Date.UTC(2026, 8, 28, 10)

function fakeStore(entitlements: () => StoreEntitlement[]) {
  let calls = 0
  setStorePurchasesForTests({
    available: () => true,
    getProducts: async () => [],
    purchase: async () => 'purchased',
    restore: async () => entitlements(),
    currentEntitlements: async () => {
      calls++
      return entitlements()
    },
  })
  return { calls: () => calls }
}

beforeAll(async () => {
  await waitFor(() => expect([useLicenseStore, useProfileStore].every((s) => s.persist.hasHydrated())).toBe(true))
})

beforeEach(() => {
  clearDemoFlag()
  resetLicenseChecks()
  useLicenseStore.getState().resetLicenseState()
  useProfileStore.setState({ profile: null, settings: { ...DEFAULT_SETTINGS, onboardingDone: true } })
})

afterEach(() => {
  setStorePurchasesForTests(null)
  vi.unstubAllEnvs()
})

describe('accessStatus med köp i appen', () => {
  it('livstid i butiken ger licens med källan store', () => {
    const s = accessStatus({
      trialStartedAt: NOW - 30 * DAY,
      license: null,
      now: NOW,
      store: [{ product: 'livstid', purchasedAt: NOW - 5 * DAY, source: 'appstore' }],
    })
    expect(s).toMatchObject({ kind: 'licensierad', source: 'store', expiresAt: undefined, test: false })
    if (s.kind === 'licensierad') expect(s.plan?.id).toBe('livstid')
  })

  it('ett år i butiken gäller till utgångsdatumet', () => {
    const ar = { product: 'ar' as const, purchasedAt: NOW - 100 * DAY, expiresAt: NOW + 265 * DAY, source: 'play' as const }
    expect(accessStatus({ trialStartedAt: NOW - 200 * DAY, license: null, now: NOW, store: [ar] })).toMatchObject({
      kind: 'licensierad',
      source: 'store',
      daysLeft: 265,
    })
    // Utgånget år: provperioden (som är slut) gäller.
    expect(accessStatus({ trialStartedAt: NOW - 400 * DAY, license: null, now: NOW, store: [{ ...ar, expiresAt: NOW - DAY }] }).kind).toBe('utgangen')
  })

  it('livstid går före ett år, och en licensnyckel med livstid går före ett butiksår', () => {
    const ar = { product: 'ar' as const, purchasedAt: NOW - DAY, expiresAt: NOW + 300 * DAY, source: 'appstore' as const }
    const livstid = { product: 'livstid' as const, purchasedAt: NOW - 2 * DAY, source: 'appstore' as const }
    expect(accessStatus({ trialStartedAt: null, license: null, now: NOW, store: [ar, livstid] })).toMatchObject({ source: 'store', expiresAt: undefined })
    const keyLicense = { ok: true as const, payload: { v: 1 as const, id: 'cs_1', plan: 'livstid' as const, iat: 1 } }
    const s = accessStatus({ trialStartedAt: null, license: keyLicense, now: NOW, store: [ar] })
    expect(s).toMatchObject({ kind: 'licensierad', expiresAt: undefined })
    expect(s.kind === 'licensierad' && s.source).toBeFalsy()
  })

  it("provperiod köpt i butiken ('prov14') räknas från det tidigaste av den lokala starten och köpet", () => {
    const prov = { product: 'prov14' as const, purchasedAt: NOW - 10 * DAY, source: 'appstore' as const }
    expect(accessStatus({ trialStartedAt: null, license: null, now: NOW, store: [prov] })).toMatchObject({ kind: 'prov', daysLeft: 4 })
    expect(accessStatus({ trialStartedAt: NOW - DAY, license: null, now: NOW, store: [prov] })).toMatchObject({ kind: 'prov', daysLeft: 4 })
    expect(accessStatus({ trialStartedAt: NOW - 12 * DAY, license: null, now: NOW, store: [prov] })).toMatchObject({ kind: 'prov', daysLeft: 2 })
    expect(accessStatus({ trialStartedAt: null, license: null, now: NOW, store: [{ ...prov, purchasedAt: NOW - 20 * DAY }] }).kind).toBe('utgangen')
  })

  it('utan köp i appen är allt som förut', () => {
    expect(accessStatus({ trialStartedAt: NOW - 3 * DAY, license: null, now: NOW, store: [] })).toEqual(
      accessStatus({ trialStartedAt: NOW - 3 * DAY, license: null, now: NOW }),
    )
  })
})

describe('årslicens köpt i appen', () => {
  it('utan slutdatum från butiken gäller året från köpet – aldrig för alltid', () => {
    const ar = { product: 'ar' as const, purchasedAt: NOW - 100 * DAY, source: 'appstore' as const }
    expect(accessStatus({ trialStartedAt: NOW - 200 * DAY, license: null, now: NOW, store: [ar] })).toMatchObject({
      kind: 'licensierad',
      source: 'store',
      expiresAt: NOW + 265 * DAY,
      daysLeft: 265,
    })
    // Efter ett år har den gått ut – och beskrivs som en utgången årslicens, inte som provperioden.
    expect(accessStatus({ trialStartedAt: NOW - 500 * DAY, license: null, now: NOW, store: [{ ...ar, purchasedAt: NOW - 366 * DAY }] })).toMatchObject({
      kind: 'utgangen',
      licenseExpired: true,
    })
  })

  it('ett utgånget år bredvid ett gällande köp spelar ingen roll', () => {
    const old = { product: 'ar' as const, purchasedAt: NOW - 400 * DAY, source: 'play' as const }
    const current = { product: 'ar' as const, purchasedAt: NOW - 10 * DAY, source: 'play' as const }
    expect(accessStatus({ trialStartedAt: NOW - 500 * DAY, license: null, now: NOW, store: [old, current] })).toMatchObject({
      kind: 'licensierad',
      daysLeft: 355,
    })
  })
})

describe('useAccess läser köpen i appen', () => {
  it('webbversionen: inga köp, statusen är oförändrad', async () => {
    expect(getStorePurchases().available()).toBe(false)
    useLicenseStore.setState({ trialStartedAt: Date.now() - 20 * DAY })
    const { result } = renderHook(() => useAccess())
    await act(async () => {
      await refreshStoreEntitlements()
    })
    expect(currentStoreEntitlements()).toEqual([])
    expect(result.current).toMatchObject({ canLog: false, status: { kind: 'utgangen' } })
  })

  it('vid start: ett köp i appen låser upp Lagom', async () => {
    useLicenseStore.setState({ trialStartedAt: Date.now() - 20 * DAY })
    fakeStore(() => [{ product: 'livstid', purchasedAt: Date.now() - DAY, source: 'appstore' }])
    const { result } = renderHook(() => useAccess())
    await waitFor(() => expect(result.current.status).toMatchObject({ kind: 'licensierad', source: 'store' }))
    expect(result.current.canLog).toBe(true)
    expect(currentAccess().canLog).toBe(true)
  })

  it('när appen återfår fokus hämtas köpen igen', async () => {
    useLicenseStore.setState({ trialStartedAt: Date.now() - 20 * DAY })
    let owned: StoreEntitlement[] = []
    const store = fakeStore(() => owned)
    const { result } = renderHook(() => useAccess())
    await waitFor(() => expect(store.calls()).toBeGreaterThan(0))
    expect(result.current.status.kind).toBe('utgangen')
    // Köpt på en annan enhet med samma konto – appen kommer tillbaka i förgrunden.
    owned = [{ product: 'ar', purchasedAt: Date.now(), expiresAt: Date.now() + 365 * DAY, source: 'appstore' }]
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await waitFor(() => expect(result.current.status).toMatchObject({ kind: 'licensierad', source: 'store' }))
  })
})

describe('köp och Återställ köp medan en hämtning pågår', () => {
  it('ett köp som blir klart under en pågående hämtning syns direkt efteråt', async () => {
    useLicenseStore.setState({ trialStartedAt: Date.now() - 20 * DAY })
    let owned: StoreEntitlement[] = []
    let release: () => void = () => {}
    let calls = 0
    setStorePurchasesForTests({
      available: () => true,
      getProducts: async () => [],
      purchase: async () => 'purchased',
      restore: async () => owned,
      currentEntitlements: async () => {
        calls++
        if (calls === 1) {
          // Den första hämtningen (t.ex. när appen återfick fokus) startar före köpet och svarar sent.
          const snapshot = owned
          await new Promise<void>((r) => {
            release = r
          })
          return snapshot
        }
        return owned
      },
    })
    const early = refreshStoreEntitlements()
    // Köpet blir klart medan den första hämtningen pågår.
    owned = [{ product: 'livstid', purchasedAt: Date.now(), source: 'appstore' }]
    const afterPurchase = refreshStoreEntitlements({ fresh: true })
    release()
    await early
    await afterPurchase
    expect(calls).toBe(2)
    expect(currentAccess().status).toMatchObject({ kind: 'licensierad', source: 'store' })
  })
})

describe('App Store-bygget', () => {
  it('en licensnyckel på enheten låser inte upp något – bara köp i appen gäller', async () => {
    vi.stubEnv('VITE_DISTRIBUTION', 'appstore')
    vi.resetModules()
    const [access, license, profile] = await Promise.all([import('./useAccess'), import('../stores/licenseStore'), import('../stores/profileStore')])
    await waitFor(() => expect(license.useLicenseStore.persist.hasHydrated() && profile.useProfileStore.persist.hasHydrated()).toBe(true))
    profile.useProfileStore.setState({ profile: null, settings: { ...profile.DEFAULT_SETTINGS, onboardingDone: true } })
    // Signerad eller inte spelar ingen roll: nyckeln räknas inte ens som "kontrolleras".
    license.useLicenseStore.setState({ trialStartedAt: Date.now() - 20 * DAY, licenseKey: createTestLicense('livstid', undefined), activatedAt: Date.now() })
    expect(access.currentAccess()).toMatchObject({ checking: false, canLog: false, status: { kind: 'utgangen' } })
    const { result } = renderHook(() => access.useAccess())
    expect(result.current).toMatchObject({ checking: false, canLog: false, status: { kind: 'utgangen' } })
    license.useLicenseStore.getState().resetLicenseState()
  })
})

describe('vid start, innan butiken har svarat', () => {
  it('räknas tillgången som "kontrolleras" – ingen ser "Provperioden är slut" i onödan', async () => {
    useLicenseStore.setState({ trialStartedAt: Date.now() - 20 * DAY })
    let release: (list: StoreEntitlement[]) => void = () => {}
    setStorePurchasesForTests({
      available: () => true,
      getProducts: async () => [],
      purchase: async () => 'failed',
      restore: async () => [],
      currentEntitlements: () =>
        new Promise<StoreEntitlement[]>((r) => {
          release = r
        }),
    })
    const { result } = renderHook(() => useAccess())
    expect(result.current).toMatchObject({ checking: true, canLog: true })
    await act(async () => {
      release([])
      await refreshStoreEntitlements()
    })
    // Butiken har svarat: inga köp, provperioden är slut.
    await waitFor(() => expect(result.current).toMatchObject({ checking: false, canLog: false, status: { kind: 'utgangen' } }))
  })

  it('utan köp i appen (webben) påverkas ingenting', () => {
    useLicenseStore.setState({ trialStartedAt: Date.now() - 20 * DAY })
    expect(currentAccess()).toMatchObject({ checking: false, canLog: false })
  })
})
