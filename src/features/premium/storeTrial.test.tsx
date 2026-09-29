/**
 * iPhone-appen: provperioden startas med det gratis köpet 'prov14' i App Store (riktlinje 3.1.1) –
 * texten före start, knappen på Idag och i spärren, resultaten av köpet och "Återställ köp". Och
 * årslicensen som förnyas i förväg: i App Store läggs det nya året efter det gamla, i Google Play
 * kan den förnyas när den har gått ut.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MotionGlobalConfig } from 'motion/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PLANS, TRIAL_DAYS } from '../../config/commerce'
import { resetLicenseChecks } from '../../hooks/useAccess'
import { clearDemoFlag } from '../../lib/demoFlag'
import { setStorePurchasesForTests, type StoreEntitlement, type StorePurchaseResult } from '../../lib/storePurchases'
import { useLicenseStore } from '../../stores/licenseStore'
import { DEFAULT_SETTINGS, useProfileStore } from '../../stores/profileStore'
import { useToastStore } from '../../components/ui'
import { AccessBlockedPage } from './AccessGate'
import {
  APPSTORE_RENEWAL_NOTE,
  PLAY_RENEWAL_NOTE,
  plansToOffer,
  restoreStorePurchases,
  startStoreTrial,
  statusSummary,
  storeRenewalNote,
  trialBannerLevel,
} from './premiumLogic'
import { TrialBanner } from './TrialBanner'

MotionGlobalConfig.skipAnimations = true

const mocks = vi.hoisted(() => ({ storeTrial: true }))

vi.mock('../../config/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../config/platform')>()),
  trialViaStore: () => mocks.storeTrial,
}))

const DAY = 86_400_000

/** En låtsasbutik: köpet ger `result` och lägger till `onPurchase` bland köpen. */
function fakeStore(opts: { owned?: StoreEntitlement[]; result?: StorePurchaseResult; onPurchase?: StoreEntitlement[] } = {}) {
  let owned = opts.owned ?? []
  const purchase = vi.fn(async () => {
    if (opts.result === 'purchased' || opts.result === undefined) owned = [...owned, ...(opts.onPurchase ?? [])]
    return opts.result ?? 'purchased'
  })
  setStorePurchasesForTests({
    available: () => true,
    getProducts: async () => [],
    purchase,
    restore: async () => owned,
    currentEntitlements: async () => owned,
  })
  return { purchase }
}

const prov = (daysAgo: number): StoreEntitlement => ({ product: 'prov14', purchasedAt: Date.now() - daysAgo * DAY, source: 'appstore' })
const toasts = () => useToastStore.getState().toasts.map((t) => t.message)

beforeAll(async () => {
  await waitFor(() => expect([useLicenseStore, useProfileStore].every((s) => s.persist.hasHydrated())).toBe(true))
})

beforeEach(() => {
  mocks.storeTrial = true
  clearDemoFlag()
  resetLicenseChecks()
  useLicenseStore.getState().resetLicenseState()
  useProfileStore.setState({ profile: null, settings: { ...DEFAULT_SETTINGS, onboardingDone: true } })
  useToastStore.setState({ toasts: [] })
})

afterEach(() => {
  setStorePurchasesForTests(null)
  resetLicenseChecks()
  localStorage.clear()
})

describe('startStoreTrial', () => {
  it('ett genomfört köp startar provperioden', async () => {
    const store = fakeStore({ onPurchase: [prov(0)] })
    await expect(startStoreTrial()).resolves.toBe('started')
    expect(store.purchase).toHaveBeenCalledWith('prov14')
  })

  it('avbrutet och väntande köp startar inget', async () => {
    fakeStore({ result: 'cancelled' })
    await expect(startStoreTrial()).resolves.toBe('cancelled')
    fakeStore({ result: 'pending' })
    await expect(startStoreTrial()).resolves.toBe('pending')
  })

  it('en provperiod som redan har använts med Apple-kontot börjar inte om', async () => {
    fakeStore({ owned: [prov(40)] })
    await expect(startStoreTrial()).resolves.toBe('used')
  })

  it('med en licens är allt redan öppet', async () => {
    fakeStore({ owned: [{ product: 'livstid', purchasedAt: Date.now() - DAY, source: 'appstore' }], onPurchase: [prov(0)] })
    await expect(startStoreTrial()).resolves.toBe('licensed')
  })
})

describe('Återställ köp', () => {
  it('en pågående provperiod kommer tillbaka (och räknas inte som ett betalt köp)', async () => {
    fakeStore({ owned: [prov(2)] })
    await expect(restoreStorePurchases()).resolves.toEqual({ paid: 0, trial: true })
  })
})

describe('texterna före start', () => {
  it('säger hur länge provperioden gäller, vad som sedan kräver köp och att inget dras', () => {
    const summary = statusSummary({ kind: 'ejstartad' })
    expect(summary.title).toBe(`Starta ${TRIAL_DAYS} dagar gratis`)
    expect(summary.text).toContain(`${TRIAL_DAYS} dagar`)
    expect(summary.text).toContain('gratis köp i App Store')
    expect(summary.text).toContain('för att logga nytt behöver du en licens')
    expect(summary.text).toContain('Inget dras automatiskt')
    expect(trialBannerLevel({ kind: 'ejstartad' })).toBe('start')
  })

  it('Idag: kortet startar provperioden med köpet', async () => {
    const store = fakeStore({ onPurchase: [prov(0)] })
    render(
      <MemoryRouter>
        <TrialBanner />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { name: `Starta din provperiod – ${TRIAL_DAYS} dagar gratis` })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: `Starta ${TRIAL_DAYS} dagar gratis` }))
    await waitFor(() => expect(store.purchase).toHaveBeenCalledWith('prov14'))
    await waitFor(() => expect(toasts()).toContain(`Provperioden har startat – allt i Lagom är öppet i ${TRIAL_DAYS} dagar.`))
  })

  it('spärren förklarar och har knappen – och exporten finns kvar', () => {
    fakeStore()
    render(
      <MemoryRouter>
        <AccessBlockedPage status={{ kind: 'ejstartad' }} action="mat" />
      </MemoryRouter>,
    )
    expect(screen.getByText(/startar du först provperioden/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: `Starta ${TRIAL_DAYS} dagar gratis` })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Exportera min data' })).toBeInTheDocument()
  })
})

describe('årslicensen från butiken förnyas i förväg', () => {
  const payload = { v: 1 as const, id: 'appstore:ar', plan: 'ar' as const, iat: 1 }
  const soon = { kind: 'licensierad' as const, plan: PLANS[0], payload, expiresAt: Date.now() + 20 * DAY, daysLeft: 20, test: false, source: 'store' as const }

  it('App Store: erbjuds, och noten säger att inga dagar går förlorade', () => {
    expect(plansToOffer(soon, PLANS, 'appstore')).toHaveLength(2)
    expect(storeRenewalNote(soon, 'appstore')).toBe(APPSTORE_RENEWAL_NOTE)
  })

  it('Google Play: bara livstid tills året har gått ut, med en not om det', () => {
    expect(plansToOffer(soon, PLANS, 'play').map((p) => p.id)).toEqual(['livstid'])
    expect(storeRenewalNote(soon, 'play')).toBe(PLAY_RENEWAL_NOTE)
  })

  it('ingen not långt före slutet, för en licensnyckel eller på webben', () => {
    expect(storeRenewalNote({ ...soon, daysLeft: 200 }, 'appstore')).toBeUndefined()
    expect(storeRenewalNote({ ...soon, source: 'nyckel' }, 'play')).toBeUndefined()
    expect(storeRenewalNote(soon, 'web')).toBeUndefined()
  })
})
