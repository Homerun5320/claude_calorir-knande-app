/**
 * Köpsidan i skarpt läge: köpknappen skapar en Stripe Checkout-session och skickar köparen dit.
 * Fel och avbrott visas lugnt på svenska och köpet kan göras om.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { MotionGlobalConfig } from 'motion/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetLicenseChecks } from '../../hooks/useAccess'
import { useLicenseStore } from '../../stores/licenseStore'
import { DEFAULT_SETTINGS, useProfileStore } from '../../stores/profileStore'
import PremiumPage from './PremiumPage'
import { redirectTo } from './premiumLogic'

vi.mock('../../config/commerce', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../config/commerce')>()),
  COMMERCE_MODE: 'live',
  API_BASE: 'https://lagom.example',
}))

vi.mock('./premiumLogic', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./premiumLogic')>()),
  redirectTo: vi.fn(),
}))

MotionGlobalConfig.skipAnimations = true

function renderPage() {
  const router = createMemoryRouter([{ path: '/premium', element: <PremiumPage /> }], { initialEntries: ['/premium'] })
  render(<RouterProvider router={router} />)
}

async function openCheckout() {
  fireEvent.click(screen.getByRole('button', { name: 'Välj årslicens' }))
  const sheet = await screen.findByRole('dialog', { name: 'Köp årslicens' })
  fireEvent.click(within(sheet).getByRole('checkbox'))
  return sheet
}

beforeAll(async () => {
  await waitFor(() => expect([useLicenseStore, useProfileStore].every((s) => s.persist.hasHydrated())).toBe(true))
})

beforeEach(() => {
  resetLicenseChecks()
  useLicenseStore.setState({ trialStartedAt: Date.now(), licenseKey: null, activatedAt: null })
  useProfileStore.setState({ profile: null, settings: { ...DEFAULT_SETTINGS, onboardingDone: true } })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.mocked(redirectTo).mockClear()
})

describe('PremiumPage i skarpt läge', () => {
  it('visar inget testläge och skickar köparen till Stripe', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ url: 'https://checkout.stripe.com/c/pay/cs_live_1' }), { status: 200 }))
    renderPage()
    expect(screen.queryByText(/Testläge/)).not.toBeInTheDocument()
    const sheet = await openCheckout()
    fireEvent.click(within(sheet).getByRole('button', { name: /Gå till betalning · 349\skr/ }))
    await waitFor(() => expect(redirectTo).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_live_1'))
    expect(fetchMock).toHaveBeenCalledWith('https://lagom.example/api/create-checkout', expect.objectContaining({ method: 'POST', body: JSON.stringify({ plan: 'ar', consent: true }) }))
    // Ingen licens förrän betalningen är bekräftad på tacksidan.
    expect(useLicenseStore.getState().licenseKey).toBeNull()
  })

  it('utan samtycke om ångerrätten anropas inte betaltjänsten', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Välj årslicens' }))
    const sheet = await screen.findByRole('dialog', { name: 'Köp årslicens' })
    fireEvent.click(within(sheet).getByRole('button', { name: /Gå till betalning · 349\skr/ }))
    expect(await within(sheet).findByText(/Kryssa i rutan för att fortsätta/)).toBeInTheDocument()
    expect(within(sheet).getByText(/varav moms 25/)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(redirectTo).not.toHaveBeenCalled()
  })

  it('serverfel visas i arket och köpet kan göras om', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('{}', { status: 500 }))
    renderPage()
    const sheet = await openCheckout()
    const buy = within(sheet).getByRole('button', { name: /Gå till betalning · 349\skr/ })
    fireEvent.click(buy)
    expect(await within(sheet).findByRole('alert')).toHaveTextContent('Det gick inte att nå betaltjänsten just nu')
    expect(redirectTo).not.toHaveBeenCalled()
    expect(buy).not.toHaveAttribute('aria-busy', 'true')
  })

  it('offline: säger det rakt ut', async () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    renderPage()
    const sheet = await openCheckout()
    fireEvent.click(within(sheet).getByRole('button', { name: /Gå till betalning · 349\skr/ }))
    expect(await within(sheet).findByRole('alert')).toHaveTextContent('Du verkar vara offline')
    onLine.mockRestore()
  })
})
