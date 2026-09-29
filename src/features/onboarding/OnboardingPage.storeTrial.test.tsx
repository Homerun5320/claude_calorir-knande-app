/**
 * Välkomstflödet i iPhone-appen: provperioden startas med det gratis köpet 'prov14' i App Store
 * (riktlinje 3.1.1). Sista steget säger före köpet hur länge provperioden gäller, vad som sedan
 * kräver köp och vad det kostar; knappen heter "Starta 14 dagar gratis". Ingen lokal provstart.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { MotionGlobalConfig } from 'motion/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DialogHost, useToastStore } from '../../components/ui'
import { TRIAL_DAYS } from '../../config/commerce'
import { resetLicenseChecks } from '../../hooks/useAccess'
import { setStorePurchasesForTests, type StoreEntitlement, type StorePurchaseResult } from '../../lib/storePurchases'
import { useBodyStore } from '../../stores/bodyStore'
import { useLicenseStore } from '../../stores/licenseStore'
import { DEFAULT_SETTINGS, useProfileStore } from '../../stores/profileStore'
import OnboardingPage from './OnboardingPage'

MotionGlobalConfig.skipAnimations = true

vi.mock('../../config/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../config/platform')>()),
  trialViaStore: () => true,
}))

function fakeStore(result: StorePurchaseResult) {
  let owned: StoreEntitlement[] = []
  const purchase = vi.fn(async () => {
    if (result === 'purchased') owned = [{ product: 'prov14', purchasedAt: Date.now(), source: 'appstore' }]
    return result
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

function renderFlow() {
  const router = createMemoryRouter(
    [
      { path: '/valkommen', element: <OnboardingPage /> },
      { path: '/', element: <p>Startsidan</p> },
    ],
    { initialEntries: ['/valkommen'] },
  )
  render(
    <>
      <RouterProvider router={router} />
      <DialogHost />
    </>,
  )
}

const next = () => fireEvent.click(screen.getByRole('button', { name: /Fortsätt/ }))
const toasts = () => useToastStore.getState().toasts.map((t) => t.message)

/** Välkomst → mål → om dig → vardag → kost → sammanfattning (kortaste vägen). */
async function toSummary() {
  fireEvent.click(screen.getByRole('button', { name: /Kom igång/ }))
  fireEvent.click(await screen.findByRole('radio', { name: /Behålla min vikt/ }))
  next()
  await screen.findByRole('heading', { name: 'Lite om dig' })
  fireEvent.click(screen.getByRole('radio', { name: 'Kvinna' }))
  fireEvent.change(screen.getByRole('spinbutton', { name: /Födelseår/ }), { target: { value: '1990' } })
  fireEvent.change(screen.getByRole('spinbutton', { name: /Längd/ }), { target: { value: '168' } })
  fireEvent.change(screen.getByRole('spinbutton', { name: /Vikt idag/ }), { target: { value: '70' } })
  next()
  fireEvent.click(await screen.findByRole('radio', { name: /Lätt aktiv/ }))
  next()
  await screen.findByRole('heading', { name: 'Hur äter du?' })
  next()
  await screen.findByRole('heading', { name: 'Välkommen till Lagom!' })
}

beforeAll(async () => {
  await waitFor(() => expect([useProfileStore, useLicenseStore, useBodyStore].every((s) => s.persist.hasHydrated())).toBe(true))
})

beforeEach(() => {
  sessionStorage.clear()
  resetLicenseChecks()
  useBodyStore.getState().clearBody()
  useProfileStore.setState({ profile: null, settings: { ...DEFAULT_SETTINGS } })
  useLicenseStore.getState().resetLicenseState()
  useToastStore.setState({ toasts: [] })
})

afterEach(() => {
  setStorePurchasesForTests(null)
  resetLicenseChecks()
  localStorage.clear()
})

describe('välkomstflödet i iPhone-appen', () => {
  it('säger före köpet vad provperioden är och startar den med köpet prov14', async () => {
    const store = fakeStore('purchased')
    renderFlow()
    expect(screen.getByText(`Prova gratis i ${TRIAL_DAYS} dagar – inget dras`)).toBeInTheDocument()
    await toSummary()
    expect(screen.getByText(/ett gratis köp i App Store som gäller en gång per Apple-konto/)).toBeInTheDocument()
    expect(screen.getByText(/att logga nytt kräver ett köp/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: `Starta ${TRIAL_DAYS} dagar gratis` }))
    expect(await screen.findByText('Startsidan')).toBeInTheDocument()
    expect(store.purchase).toHaveBeenCalledWith('prov14')
    expect(useProfileStore.getState().settings.onboardingDone).toBe(true)
    // Provperioden räknas från köpet – ingen lokal start.
    expect(useLicenseStore.getState().trialStartedAt).toBeNull()
    expect(toasts()).toContain(`Provperioden har startat – allt i Lagom är öppet i ${TRIAL_DAYS} dagar.`)
  })

  it('ett avbrutet köp skapar ändå profilen – provperioden kan startas senare', async () => {
    fakeStore('cancelled')
    renderFlow()
    await toSummary()
    fireEvent.click(screen.getByRole('button', { name: `Starta ${TRIAL_DAYS} dagar gratis` }))
    expect(await screen.findByText('Startsidan')).toBeInTheDocument()
    expect(useProfileStore.getState().profile).not.toBeNull()
    expect(useLicenseStore.getState().trialStartedAt).toBeNull()
    expect(toasts().join(' ')).toContain('Provperioden har inte startat')
  })
})
