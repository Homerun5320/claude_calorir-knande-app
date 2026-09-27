/**
 * Köpsidan i testläge: status, priser inklusive moms, samtycke om ångerrätt före köp, testköp →
 * licensierad → loggning tillåten igen, aktivering av nyckel och borttagning från enheten.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { MotionGlobalConfig } from 'motion/react'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { DialogHost } from '../../components/ui'
import { resetLicenseChecks } from '../../hooks/useAccess'
import { createTestLicense } from '../../lib/license'
import { useLicenseStore } from '../../stores/licenseStore'
import { DEFAULT_SETTINGS, useProfileStore } from '../../stores/profileStore'
import PremiumPage from './PremiumPage'
import { requireAccess } from './requireAccess'

MotionGlobalConfig.skipAnimations = true

const DAY = 86_400_000

function renderPage() {
  const router = createMemoryRouter(
    [
      { path: '/premium', element: <PremiumPage /> },
      { path: '/', element: <p>Idag</p> },
      { path: '/valkommen', element: <p>Välkommen</p> },
      { path: '/installningar/data', element: <p>Data</p> },
    ],
    { initialEntries: ['/premium'] },
  )
  render(
    <>
      <RouterProvider router={router} />
      <DialogHost />
    </>,
  )
  return router
}

beforeAll(async () => {
  await waitFor(() => expect([useLicenseStore, useProfileStore].every((s) => s.persist.hasHydrated())).toBe(true))
})

beforeEach(() => {
  resetLicenseChecks()
  useLicenseStore.getState().resetLicenseState()
  useProfileStore.setState({ profile: null, settings: { ...DEFAULT_SETTINGS, onboardingDone: true } })
})

describe('PremiumPage', () => {
  it('visar provperioden, båda planerna inklusive moms och testläget', async () => {
    useLicenseStore.setState({ trialStartedAt: Date.now() - 3 * DAY })
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'Lagom Premium' })).toBeInTheDocument()
    expect(screen.getByText(/Testläge: betalningar är avstängda/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '11 dagar kvar av provperioden' })).toBeInTheDocument()

    const ar = screen.getByRole('article', { name: 'Årslicens' })
    expect(within(ar).getByText('299')).toBeInTheDocument()
    expect(within(ar).getByText(/inkl\. moms/)).toBeInTheDocument()
    expect(within(ar).getByText(/förnyas inte automatiskt/)).toBeInTheDocument()
    const livstid = screen.getByRole('article', { name: 'Livstidslicens' })
    expect(within(livstid).getByText('599')).toBeInTheDocument()
    expect(within(livstid).getByText('Bäst värde')).toBeInTheDocument()

    // Köpvillkoren finns på sidan: säljare, moms, ingen förnyelse och ångerrätt.
    const villkor = screen.getByRole('region', { name: 'Köpvillkor och integritet' })
    expect(villkor).toHaveTextContent('Säljare')
    expect(villkor).toHaveTextContent('inklusive 25 % moms')
    expect(villkor).toHaveTextContent('Årslicensen förnyas inte')
    expect(villkor).toHaveTextContent('2 kap. 11 § lagen om distansavtal')
    // Inga påståenden om att appen är gratis för alltid.
    expect(screen.queryByText(/inga prenumerationer|utan betalvägg/i)).not.toBeInTheDocument()
  })

  it('kräver samtycke om ångerrätt – sedan testköp, licens och loggning igen', async () => {
    useLicenseStore.setState({ trialStartedAt: Date.now() - 20 * DAY })
    renderPage()
    expect(screen.getByRole('heading', { name: 'Provperioden är slut – din data finns kvar' })).toBeInTheDocument()
    expect(requireAccess('mat')).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Välj livstidslicens' }))
    const sheet = await screen.findByRole('dialog', { name: 'Köp livstidslicens' })
    expect(sheet).toHaveTextContent('599 kr')
    expect(sheet).toHaveTextContent('varav moms 25 %')
    expect(sheet).toHaveTextContent('119,80 kr')

    const buy = within(sheet).getByRole('button', { name: 'Köp (testläge – ingen betalning)' })
    fireEvent.click(buy)
    expect(await within(sheet).findByRole('alert')).toHaveTextContent('Kryssa i rutan för att fortsätta')
    const consent = within(sheet).getByRole('checkbox', { name: /ångerrätt på 14 dagar/ })
    expect(consent).toHaveFocus()
    expect(consent).toHaveAttribute('aria-invalid', 'true')
    expect(useLicenseStore.getState().licenseKey).toBeNull()

    fireEvent.click(consent)
    fireEvent.click(buy)
    expect(await screen.findByRole('heading', { name: 'Tack! Lagom är ditt.' })).toBeInTheDocument()
    const key = useLicenseStore.getState().licenseKey
    expect(key).toMatch(/^LAGOM1\./)
    expect(screen.getByTestId('licensnyckel')).toHaveTextContent(key!)
    expect(screen.getByRole('button', { name: 'Kopiera nyckeln' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Mejla till mig själv' })).toHaveAttribute('href', expect.stringMatching(/^mailto:\?subject=/))

    // Licensierad: ny loggning fungerar igen och inga fler planer erbjuds.
    expect(requireAccess('mat')).toBe(true)
    await waitFor(() => expect(screen.queryByRole('article', { name: 'Livstidslicens' })).not.toBeInTheDocument())
  })

  it('aktiverar en inklistrad nyckel och visar fel på svenska', async () => {
    useLicenseStore.setState({ trialStartedAt: Date.now() - 20 * DAY })
    renderPage()
    const field = screen.getByRole('textbox', { name: 'Licensnyckel' })
    fireEvent.change(field, { target: { value: 'hej hopp' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aktivera licensen' }))
    expect(await screen.findByText(/Det där ser inte ut som en licensnyckel från Lagom/)).toBeInTheDocument()

    const key = createTestLicense('ar', 365)
    fireEvent.change(field, { target: { value: `"${key}"` } })
    fireEvent.click(screen.getByRole('button', { name: 'Aktivera licensen' }))
    await waitFor(() => expect(useLicenseStore.getState().licenseKey).toBe(key))
    expect(await screen.findByRole('heading', { name: /^Giltig till/ })).toBeInTheDocument()
    expect(requireAccess('vatten')).toBe(true)
  })

  it('visar nyckeln och tar bort licensen från enheten efter bekräftelse', async () => {
    const key = createTestLicense('livstid', undefined)
    useLicenseStore.setState({ trialStartedAt: Date.now() - 20 * DAY, licenseKey: key })
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Lagom är ditt – för alltid' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Visa min licensnyckel' }))
    expect(screen.getByTestId('licensnyckel')).toHaveTextContent(key)

    fireEvent.click(screen.getByRole('button', { name: 'Ta bort licens från den här enheten' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Ta bort licensen från enheten?' })
    expect(dialog).toHaveTextContent('Din data påverkas inte')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ta bort licensen' }))
    await waitFor(() => expect(useLicenseStore.getState().licenseKey).toBeNull())
    // Provperiodens start finns kvar – den startar inte om.
    expect(useLicenseStore.getState().trialStartedAt).not.toBeNull()
    expect(await screen.findByRole('heading', { name: 'Provperioden är slut – din data finns kvar' })).toBeInTheDocument()
  })

  it('före profilen: prova gratis och skapa profil', () => {
    useProfileStore.setState({ profile: null, settings: { ...DEFAULT_SETTINGS, onboardingDone: false } })
    renderPage()
    expect(screen.getByRole('heading', { name: 'Prova gratis i 14 dagar' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Skapa min profil' })).toHaveAttribute('href', '/valkommen')
  })
})
