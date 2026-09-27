/**
 * Provperioden i vardagen (Idag, Mer, Inställningar → Licens) och markeringen för exempeldata.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router-dom'
import { MotionGlobalConfig } from 'motion/react'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { DialogHost } from '../../components/ui'
import { resetLicenseChecks, useAccess } from '../../hooks/useAccess'
import { isDemoData, setDemoFlag } from '../../lib/demoFlag'
import { createTestLicense } from '../../lib/license'
import { useDiaryStore } from '../../stores/diaryStore'
import { useLicenseStore } from '../../stores/licenseStore'
import { DEFAULT_SETTINGS, useProfileStore } from '../../stores/profileStore'
import { DemoBanner } from '../onboarding/DemoBanner'
import SettingsPage from '../settings/SettingsPage'
import { PremiumHubCard, TrialBanner } from './TrialBanner'
import type { Profile } from '../../types'

MotionGlobalConfig.skipAnimations = true

const DAY = 86_400_000

const PROFILE: Profile = {
  sex: 'man',
  birthYear: 1985,
  heightCm: 180,
  startWeightKg: 82,
  activityLevel: 'latt',
  goal: 'behalla',
  weeklyRateKg: 0.25,
  lifeStage: 'ingen',
  diet: 'allatare',
  macroPreset: 'nnr',
  createdAt: Date.now(),
}

const inRouter = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>)

beforeAll(async () => {
  await waitFor(() => expect([useLicenseStore, useProfileStore, useDiaryStore].every((s) => s.persist.hasHydrated())).toBe(true))
})

beforeEach(() => {
  localStorage.clear()
  resetLicenseChecks()
  useLicenseStore.getState().resetLicenseState()
  useProfileStore.setState({ profile: { ...PROFILE }, settings: { ...DEFAULT_SETTINGS, onboardingDone: true } })
})

describe('TrialBanner på Idag', () => {
  it('ett litet chip under provperioden', () => {
    useLicenseStore.setState({ trialStartedAt: Date.now() - 3 * DAY })
    inRouter(<TrialBanner />)
    const link = screen.getByRole('link', { name: /Provperiod: 11 dagar kvar/ })
    expect(link).toHaveAttribute('href', '/premium')
    expect(link).toHaveTextContent('Se priser')
  })

  it('tydligare de sista tre dagarna – utan stress', () => {
    useLicenseStore.setState({ trialStartedAt: Date.now() - 12 * DAY })
    inRouter(<TrialBanner />)
    expect(screen.getByText('2 dagar kvar av provperioden')).toBeInTheDocument()
    expect(screen.getByText(/All din data finns kvar efter provperioden/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Se priser' })).toHaveAttribute('href', '/premium')
  })

  it('ett lugnt kort när provperioden är slut, med export', () => {
    useLicenseStore.setState({ trialStartedAt: Date.now() - 20 * DAY })
    inRouter(<TrialBanner />)
    expect(screen.getByRole('heading', { name: 'Provperioden är slut – din data finns kvar' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Exportera min data' })).toHaveAttribute('href', '/installningar/data')
  })

  it('syns inte med licens', async () => {
    useLicenseStore.setState({ trialStartedAt: Date.now() - 20 * DAY, licenseKey: createTestLicense('livstid', undefined) })
    const { container } = inRouter(<TrialBanner />)
    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })
})

describe('Lagom Premium i Mer och Inställningar', () => {
  it('Mer visar status och länkar till köpsidan', async () => {
    useLicenseStore.setState({ trialStartedAt: Date.now() - 3 * DAY })
    inRouter(<PremiumHubCard />)
    expect(screen.getByRole('link', { name: /Lagom Premium\. Provperiod · 11 dagar kvar/ })).toHaveAttribute('href', '/premium')
  })

  it('Inställningar har en egen sektion för licensen', async () => {
    useLicenseStore.setState({ trialStartedAt: Date.now() - 20 * DAY })
    const router = createMemoryRouter(
      [
        { path: '/installningar', element: <SettingsPage /> },
        { path: '/installningar/:section', element: <SettingsPage /> },
      ],
      { initialEntries: ['/installningar'] },
    )
    render(<RouterProvider router={router} />)
    const row = screen.getByRole('link', { name: /Licens/ })
    expect(row).toHaveTextContent('Provperioden är slut · din data finns kvar')
    fireEvent.click(row)
    expect(await screen.findByRole('heading', { level: 1, name: 'Licens' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Se priser och köp' })).toHaveAttribute('href', '/premium')
    expect(screen.getByRole('link', { name: 'Exportera min data' })).toHaveAttribute('href', '/installningar/data')
    expect(screen.getByRole('textbox', { name: 'Licensnyckel' })).toBeInTheDocument()
  })
})

function TrialProbe() {
  const { status } = useAccess()
  return <p>{status.kind}</p>
}

describe('exempeldata', () => {
  it('visar en tydlig markering och börjar om med en egen profil utan att starta om provperioden', async () => {
    setDemoFlag()
    const start = Date.now() - 2 * DAY
    useLicenseStore.setState({ trialStartedAt: start })
    useDiaryStore.getState().addWater('2026-09-27', 500)
    const router = createMemoryRouter(
      [
        { path: '/', element: <DemoBanner /> },
        { path: '/valkommen', element: <p>Välkommen</p> },
      ],
      { initialEntries: ['/'] },
    )
    render(
      <>
        <RouterProvider router={router} />
        <DialogHost />
      </>,
    )
    const note = screen.getByRole('note', { name: 'Exempeldata' })
    expect(note).toHaveTextContent('Du tittar på exempeldata')
    fireEvent.click(within(note).getByRole('button', { name: 'Börja med min egen profil' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Börja med din egen profil?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Börja' }))
    expect(await screen.findByText('Välkommen')).toBeInTheDocument()
    expect(isDemoData()).toBe(false)
    expect(useDiaryStore.getState().water).toEqual({})
    expect(useProfileStore.getState().profile).toBeNull()
    expect(useLicenseStore.getState().trialStartedAt).toBe(start)
  })

  it('syns inte utan exempeldata', () => {
    const { container } = inRouter(<DemoBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('exempelprofilens bakdaterade start ger ingen utgången provperiod', async () => {
    setDemoFlag()
    useProfileStore.setState({ profile: { ...PROFILE, createdAt: Date.now() - 14 * DAY }, settings: { ...DEFAULT_SETTINGS, onboardingDone: true } })
    inRouter(<TrialProbe />)
    await waitFor(() => expect(useLicenseStore.getState().trialStartedAt).not.toBeNull())
    expect(useLicenseStore.getState().trialStartedAt).toBeGreaterThan(Date.now() - DAY)
    expect(screen.getByText('prov')).toBeInTheDocument()
  })

  it('en profil från en tidigare version räknar provperioden från när profilen skapades', async () => {
    useProfileStore.setState({ profile: { ...PROFILE, createdAt: Date.now() - 30 * DAY }, settings: { ...DEFAULT_SETTINGS, onboardingDone: true } })
    inRouter(<TrialProbe />)
    await waitFor(() => expect(screen.getByText('utgangen')).toBeInTheDocument())
  })
})
