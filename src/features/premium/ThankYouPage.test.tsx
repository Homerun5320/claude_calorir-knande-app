/**
 * Tacksidan efter Stripe Checkout (#/tack?session_id=…): hämtar och sparar licensen, visar
 * nyckeln och klarar pågående betalning, fel och offline med "Försök igen".
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { MotionGlobalConfig } from 'motion/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetLicenseChecks } from '../../hooks/useAccess'
import { createTestLicense } from '../../lib/license'
import { useLicenseStore } from '../../stores/licenseStore'
import { DEFAULT_SETTINGS, useProfileStore } from '../../stores/profileStore'
import ThankYouPage from './ThankYouPage'
import { requireAccess } from './requireAccess'

MotionGlobalConfig.skipAnimations = true

const DAY = 86_400_000

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/tack', element: <ThankYouPage /> },
      { path: '/', element: <p>Idag</p> },
      { path: '/valkommen', element: <p>Välkommen</p> },
      { path: '/premium', element: <p>Köpsidan</p> },
    ],
    { initialEntries: [path] },
  )
  render(<RouterProvider router={router} />)
  return router
}

beforeAll(async () => {
  await waitFor(() => expect([useLicenseStore, useProfileStore].every((s) => s.persist.hasHydrated())).toBe(true))
})

beforeEach(() => {
  resetLicenseChecks()
  useLicenseStore.setState({ trialStartedAt: Date.now() - 20 * DAY, licenseKey: null, activatedAt: null })
  useProfileStore.setState({ profile: null, settings: { ...DEFAULT_SETTINGS, onboardingDone: true } })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('ThankYouPage', () => {
  it('hämtar licensen för betalningen, sparar den och visar nyckeln', async () => {
    const key = createTestLicense('livstid', undefined)
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ licenseKey: key }))
    renderAt('/tack?session_id=cs_test_abc')
    expect(await screen.findByRole('heading', { name: 'Tack! Lagom är ditt.' })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/verify-purchase', expect.objectContaining({ body: JSON.stringify({ sessionId: 'cs_test_abc' }) }))
    expect(useLicenseStore.getState().licenseKey).toBe(key)
    expect(screen.getByTestId('licensnyckel')).toHaveTextContent(key)
    expect(screen.getByText(/lösenordshanterare/)).toBeInTheDocument()
    expect(screen.getByText(/Livstidslicens · aktiverad/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Till Idag' })).toHaveAttribute('href', '/')
    expect(requireAccess('mat')).toBe(true)
    // I webbläsaren (inte hemskärmen): påminnelsen om att hemskärmsappen sparar data för sig.
    expect(screen.getByRole('note')).toHaveTextContent('Har du Lagom på hemskärmen?')
  })

  it('före profilen leder vidare till välkomstflödet', async () => {
    useProfileStore.setState({ settings: { ...DEFAULT_SETTINGS, onboardingDone: false } })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ licenseKey: createTestLicense('ar', 365) }))
    renderAt('/tack?session_id=cs_test_abc')
    expect(await screen.findByRole('link', { name: 'Skapa min profil' })).toHaveAttribute('href', '/valkommen')
  })

  it('betalningen behandlas: visar det lugnt och kan kontrollera igen', async () => {
    const key = createTestLicense('ar', 365)
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ status: 'pending' }, 202)).mockResolvedValue(json({ licenseKey: key }))
    renderAt('/tack?session_id=cs_test_pending')
    expect(await screen.findByRole('heading', { name: 'Betalningen behandlas' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Kontrollera igen' }))
    expect(await screen.findByRole('heading', { name: 'Tack! Lagom är ditt.' })).toBeInTheDocument()
    expect(useLicenseStore.getState().licenseKey).toBe(key)
  })

  it('okänt köp: felmeddelande, supportlänk och försök igen', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ code: 'hittades-inte' }, 404)).mockResolvedValue(json({ licenseKey: createTestLicense('ar', 365) }))
    renderAt('/tack?session_id=cs_test_x')
    expect(await screen.findByRole('heading', { name: 'Licensen kunde inte hämtas' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Vi hittar inget genomfört köp')
    expect(screen.getByRole('link', { name: 'Mejla supporten' })).toHaveAttribute('href', expect.stringContaining('cs_test_x'))
    expect(
      screen.getByText('Har du betalat? Då finns betalningen hos Stripe – försök igen om en stund, eller mejla oss kvittot så skickar vi licensen.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/köpet är registrerat/)).not.toBeInTheDocument()
    expect(useLicenseStore.getState().licenseKey).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Försök igen' }))
    expect(await screen.findByRole('heading', { name: 'Tack! Lagom är ditt.' })).toBeInTheDocument()
  })

  it('offline: säger det och försöker igen när uppkopplingen är tillbaka', async () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ licenseKey: createTestLicense('livstid', undefined) }))
    renderAt('/tack?session_id=cs_test_off')
    expect(await screen.findByRole('heading', { name: 'Ingen uppkoppling' })).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
    onLine.mockReturnValue(true)
    window.dispatchEvent(new Event('online'))
    // Nytt anrop + verifiering med WebCrypto – ge lite marginal när hela testsviten körs parallellt.
    expect(await screen.findByRole('heading', { name: 'Tack! Lagom är ditt.' }, { timeout: 5000 })).toBeInTheDocument()
    // Testets egen tidsgräns måste vara längre än väntan ovan (standard 5 s) – annars kan testet
    // avbrytas precis innan rubriken hinner visas när sviten körs parallellt.
  }, 15_000)

  it('en nyckel som inte går att verifiera sparas inte men visas så att den kan skickas till supporten', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ licenseKey: 'LAGOM1.trasig.nyckel' }))
    renderAt('/tack?session_id=cs_test_bad')
    expect(await screen.findByRole('heading', { name: 'Licensen kunde inte hämtas' })).toBeInTheDocument()
    expect(useLicenseStore.getState().licenseKey).toBeNull()
    expect(screen.getByTestId('licensnyckel')).toHaveTextContent('LAGOM1.trasig.nyckel')
  })

  it('utan session-id: förklarar och länkar till köpsidan (inget råd om en nyckel som inte finns)', () => {
    renderAt('/tack')
    expect(screen.getByRole('heading', { name: 'Vi hittar inget köp i adressen' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Till Lagom Premium' })).toHaveAttribute('href', '/premium')
    expect(screen.queryByText(/lösenordshanterare/)).not.toBeInTheDocument()
  })

  it('installerad på hemskärmen: ingen påminnelse om hemskärmen', async () => {
    const original = window.matchMedia
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({ matches: query === '(display-mode: standalone)', media: query })) as typeof window.matchMedia
    try {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ licenseKey: createTestLicense('ar', 365) }))
      renderAt('/tack?session_id=cs_test_hem')
      expect(await screen.findByRole('heading', { name: 'Tack! Lagom är ditt.' })).toBeInTheDocument()
      expect(screen.queryByText(/Har du Lagom på hemskärmen/)).not.toBeInTheDocument()
    } finally {
      window.matchMedia = original
    }
  })

  it('i butiksappar finns inga webbköp – skickar vidare till köpsidan utan att anropa servern', async () => {
    vi.stubEnv('VITE_DISTRIBUTION', 'appstore')
    vi.resetModules()
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    const { default: FreshThankYou } = await import('./ThankYouPage')
    const router = createMemoryRouter(
      [
        { path: '/tack', element: <FreshThankYou /> },
        { path: '/premium', element: <p>Köpsidan</p> },
      ],
      { initialEntries: ['/tack?session_id=cs_test_app'] },
    )
    render(<RouterProvider router={router} />)
    expect(await screen.findByText('Köpsidan')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/premium')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
