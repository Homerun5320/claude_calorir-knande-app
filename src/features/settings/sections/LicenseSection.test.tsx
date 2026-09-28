/**
 * Inställningar → Licens: på webben klistrar man in sin licensnyckel (och kan hämta en tappad
 * nyckel). I App Store-bygget följer köpet Apple-kontot – där finns "Återställ köp" och ingen
 * inklistring av licensnycklar.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MotionGlobalConfig } from 'motion/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetLicenseChecks } from '../../../hooks/useAccess'
import { createTestLicense } from '../../../lib/license'
import { useLicenseStore } from '../../../stores/licenseStore'
import { DEFAULT_SETTINGS, useProfileStore } from '../../../stores/profileStore'
import { LicenseSection } from './LicenseSection'

MotionGlobalConfig.skipAnimations = true

const DAY = 86_400_000

beforeAll(async () => {
  await waitFor(() => expect([useLicenseStore, useProfileStore].every((s) => s.persist.hasHydrated())).toBe(true))
})

beforeEach(() => {
  resetLicenseChecks()
  useLicenseStore.setState({ trialStartedAt: Date.now() - 20 * DAY, licenseKey: null, activatedAt: null })
  useProfileStore.setState({ profile: null, settings: { ...DEFAULT_SETTINGS, onboardingDone: true } })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('LicenseSection på webben', () => {
  it('visar aktiveringen av licensnycklar och "Tappat nyckeln?" – inga köp i appen', async () => {
    render(
      <MemoryRouter>
        <LicenseSection />
      </MemoryRouter>,
    )
    expect(screen.getByRole('textbox', { name: 'Licensnyckel' })).toBeInTheDocument()
    expect(screen.getByText(/Klistra in nyckeln du fick vid köpet/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tappat nyckeln?' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Återställ köp' })).not.toBeInTheDocument()

    const key = createTestLicense('ar', 365)
    fireEvent.change(screen.getByRole('textbox', { name: 'Licensnyckel' }), { target: { value: key } })
    fireEvent.click(screen.getByRole('button', { name: 'Aktivera licensen' }))
    await waitFor(() => expect(useLicenseStore.getState().licenseKey).toBe(key))
    // Med en nyckel: texten om att klistra in den på en ny enhet.
    expect(await screen.findByText(/Klistra in den på en ny enhet för att flytta Lagom dit/)).toBeInTheDocument()
  })
})

describe('LicenseSection i App Store-bygget', () => {
  async function renderFresh() {
    vi.resetModules()
    const [{ LicenseSection: Fresh }, license, profile, ui, store] = await Promise.all([
      import('./LicenseSection'),
      import('../../../stores/licenseStore'),
      import('../../../stores/profileStore'),
      import('../../../components/ui'),
      import('../../../lib/storePurchases'),
    ])
    await waitFor(() => expect(license.useLicenseStore.persist.hasHydrated() && profile.useProfileStore.persist.hasHydrated()).toBe(true))
    license.useLicenseStore.setState({ trialStartedAt: Date.now() - 20 * DAY, licenseKey: null, activatedAt: null })
    profile.useProfileStore.setState({ profile: null, settings: { ...profile.DEFAULT_SETTINGS, onboardingDone: true } })
    return { Fresh, toasts: () => ui.useToastStore.getState().toasts.map((t) => t.message), store }
  }

  it('visar Återställ köp och ingen inklistring av licensnycklar', async () => {
    vi.stubEnv('VITE_DISTRIBUTION', 'appstore')
    const { Fresh, toasts } = await renderFresh()
    render(
      <MemoryRouter>
        <Fresh />
      </MemoryRouter>,
    )
    expect(screen.getByText('Köpet följer ditt Apple-konto. Tryck på Återställ köp på en ny enhet.')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Licensnyckel' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Klistra in/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tappat nyckeln?' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Testläge/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Återställ köp' }))
    await waitFor(() => expect(toasts()).toContain('Inga köp att återställa'))
  })

  it('Återställ köp hittar ett köp i appen och låser upp Lagom', async () => {
    vi.stubEnv('VITE_DISTRIBUTION', 'appstore')
    const { Fresh, toasts, store } = await renderFresh()
    let restored = false
    const entitlement = { product: 'livstid' as const, purchasedAt: Date.now() - 100 * DAY, source: 'appstore' as const }
    store.setStorePurchasesForTests({
      available: () => true,
      getProducts: async () => [],
      purchase: async () => 'failed',
      restore: async () => {
        restored = true
        return [entitlement]
      },
      currentEntitlements: async () => (restored ? [entitlement] : []),
    })
    try {
      render(
        <MemoryRouter>
          <Fresh />
        </MemoryRouter>,
      )
      expect(await screen.findByRole('heading', { name: 'Provperioden är slut – din data finns kvar' })).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Återställ köp' }))
      await waitFor(() => expect(toasts()).toContain('Dina köp är återställda – tack!'))
      expect(await screen.findByRole('heading', { name: 'Lagom är ditt – för alltid' })).toBeInTheDocument()
    } finally {
      store.setStorePurchasesForTests(null)
    }
  })
})
