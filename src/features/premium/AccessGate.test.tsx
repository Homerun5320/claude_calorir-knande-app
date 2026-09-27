/**
 * Spärren efter provperioden: ny loggning stoppas lugnt (med vägar till priser och export),
 * men att titta, ändra och ta bort fungerar alltid. Under provperioden och med licens är allt öppet.
 */
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { MotionGlobalConfig } from 'motion/react'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppShell } from '../../components/layout/AppShell'
import { currentAccess, resetLicenseChecks, useAccess } from '../../hooks/useAccess'
import { todayISO } from '../../lib/dates'
import { createTestLicense } from '../../lib/license'
import { useBodyStore } from '../../stores/bodyStore'
import { useDiaryStore } from '../../stores/diaryStore'
import { useFastingStore } from '../../stores/fastingStore'
import { useFoodStore } from '../../stores/foodStore'
import { useLicenseStore } from '../../stores/licenseStore'
import { DEFAULT_SETTINGS, useProfileStore } from '../../stores/profileStore'
import { useAddFood } from '../add/useAddFood'
import { havregryn } from '../add/testFoods'
import { WaterCard } from '../today/WaterCard'
import { copyPreviousDay } from '../diary/DayCards'
import { StartFastCard } from '../activity/fasting/StartFastCard'
import { addDays } from '../../lib/dates'
import { MemoryRouter } from 'react-router-dom'
import { AccessGate } from './AccessGate'
import { activateLicense } from './premiumLogic'
import { hasLoggingAccess, requireAccess, useAccessGateStore } from './requireAccess'

MotionGlobalConfig.skipAnimations = true

const DAY = 86_400_000
const STORES = [useProfileStore, useDiaryStore, useFoodStore, useBodyStore, useFastingStore, useLicenseStore]
const today = todayISO()

const originalMatchMedia = window.matchMedia
beforeAll(async () => {
  // useTheme i AppShell lyssnar på systemets tema.
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  }))
  await waitFor(() => expect(STORES.every((s) => s.persist.hasHydrated())).toBe(true))
})

afterAll(() => {
  window.matchMedia = originalMatchMedia
})

function expireTrial() {
  useLicenseStore.setState({ trialStartedAt: Date.now() - 20 * DAY, licenseKey: null, activatedAt: null })
}

beforeEach(() => {
  resetLicenseChecks()
  useLicenseStore.getState().resetLicenseState()
  useAccessGateStore.setState({ blocked: null })
  useDiaryStore.getState().clearDiary()
  useProfileStore.setState({
    profile: {
      sex: 'kvinna',
      birthYear: 1990,
      heightCm: 168,
      startWeightKg: 68,
      activityLevel: 'latt',
      goal: 'behalla',
      weeklyRateKg: 0.25,
      lifeStage: 'ingen',
      diet: 'allatare',
      macroPreset: 'nnr',
      createdAt: Date.now(),
    },
    settings: { ...DEFAULT_SETTINGS, onboardingDone: true },
  })
})

describe('requireAccess', () => {
  it('släpper igenom under provperioden och före profilen', () => {
    useLicenseStore.setState({ trialStartedAt: Date.now() - 3 * DAY })
    expect(requireAccess('mat')).toBe(true)
    expect(useAccessGateStore.getState().blocked).toBeNull()

    useLicenseStore.setState({ trialStartedAt: null })
    useProfileStore.setState({ settings: { ...DEFAULT_SETTINGS, onboardingDone: false } })
    expect(currentAccess().status.kind).toBe('ny')
    expect(hasLoggingAccess()).toBe(true)
  })

  it('stoppar ny loggning efter provperioden och förklarar varför', () => {
    expireTrial()
    expect(requireAccess('vatten')).toBe(false)
    expect(useAccessGateStore.getState().blocked).toEqual({ action: 'vatten' })
  })

  it('en licens öppnar allt igen', async () => {
    expireTrial()
    expect(hasLoggingAccess()).toBe(false)
    await activateLicense(createTestLicense('livstid', undefined))
    expect(requireAccess('mat')).toBe(true)
  })
})

describe('provperiodens start kan inte flyttas fram', () => {
  it('en sparad start i framtiden rättas till nu – att ställa tillbaka klockan förlänger inte provperioden', async () => {
    // Klockan stod ett år fram när profilen skapades och har sedan ställts tillbaka.
    useLicenseStore.setState({ trialStartedAt: Date.now() + 365 * DAY })
    const { result } = renderHook(() => useAccess())
    await waitFor(() => expect(useLicenseStore.getState().trialStartedAt).toBeLessThanOrEqual(Date.now()))
    expect(result.current.status).toMatchObject({ kind: 'prov', daysLeft: 14 })
    // Fjorton dagar senare är provperioden slut, som för alla andra.
    expect(currentAccess(Date.now() + 15 * DAY).status.kind).toBe('utgangen')
  })

  it('att slutföra välkomstflödet igen eller rensa exempeldata startar inte om provperioden', () => {
    const start = Date.now() - 20 * DAY
    useLicenseStore.setState({ trialStartedAt: start })
    useLicenseStore.getState().ensureTrialStarted()
    useLicenseStore.getState().ensureTrialStarted(Date.now() + DAY)
    expect(useLicenseStore.getState().trialStartedAt).toBe(start)
    expect(hasLoggingAccess()).toBe(false)
  })
})

describe('loggning efter provperioden', () => {
  it('mat läggs inte till – men ångra och borttagning fungerar som vanligt', async () => {
    const { result } = renderHook(() => useAddFood())
    const entry = result.current.addFood(havregryn, 40, 'g', { date: today, meal: 'frukost' })
    expect(entry).not.toBeNull()

    expireTrial()
    expect(result.current.addFood(havregryn, 40, 'g', { date: today, meal: 'frukost' })).toBeNull()
    expect(result.current.addQuick('Lunch', { kcal: 500 }, { date: today, meal: 'lunch' })).toBeNull()
    expect(result.current.addMany([{ food: havregryn, amount: 40, unit: 'g' }], { date: today, meal: 'lunch' })).toEqual([])
    expect(useDiaryStore.getState().entries[today]).toHaveLength(1)
    expect(useAccessGateStore.getState().blocked).not.toBeNull()

    // Egen data går alltid att ta bort.
    useDiaryStore.getState().removeEntry(today, entry!.id)
    expect(useDiaryStore.getState().entries[today] ?? []).toHaveLength(0)
  })

  it('vatten kan tas bort men inte fyllas på', () => {
    useDiaryStore.getState().addWater(today, 500)
    expireTrial()
    render(<WaterCard today={today} targetMl={2000} glassMl={250} />)
    fireEvent.click(screen.getAllByRole('button', { name: /^Lägg till ett glas/ })[0])
    expect(useDiaryStore.getState().water[today]).toBe(500)
    expect(useAccessGateStore.getState().blocked).toEqual({ action: 'vatten' })
    fireEvent.click(screen.getByRole('button', { name: /^Ta bort ett glas/ }))
    expect(useDiaryStore.getState().water[today]).toBe(250)
  })

  it('kopiera gårdagen, starta fasta: inget nytt skapas', () => {
    useDiaryStore.getState().addWater(addDays(today, -1), 250)
    useDiaryStore.getState().addEntry({ kind: 'quick', name: 'Gröt', nutrients: { kcal: 300 }, date: addDays(today, -1), meal: 'frukost' })
    expireTrial()
    expect(copyPreviousDay(today)).toBe(0)
    expect(useDiaryStore.getState().entries[today]).toBeUndefined()
    expect(useAccessGateStore.getState().blocked).toEqual({ action: 'kopiera' })

    useFastingStore.getState().clearFasting()
    render(
      <MemoryRouter>
        <StartFastCard protocolId="16:8" onProtocol={() => {}} onStartEarlier={() => {}} today={today} />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: /Starta fastan/ }))
    expect(useFastingStore.getState().active).toBeNull()
    expect(useAccessGateStore.getState().blocked).toEqual({ action: 'fasta' })
  })
})

function renderApp(path: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <AppShell />,
        children: [
          { index: true, element: <h1>Idag</h1> },
          { path: 'lagg-till', element: <AccessGate action="mat" browseTabs={['mina', 'maltider']}><h1>Sök mat</h1></AccessGate> },
          { path: 'premium', element: <h1>Priser</h1> },
          { path: 'installningar/data', element: <h1>Data</h1> },
          { path: 'installningar/licens', element: <h1>Licens</h1> },
        ],
      },
    ],
    { initialEntries: [path] },
  )
  render(<RouterProvider router={router} />)
  return router
}

describe('AccessGate och dialogen', () => {
  it('Lägg till fungerar under provperioden', async () => {
    useLicenseStore.setState({ trialStartedAt: Date.now() })
    renderApp('/lagg-till')
    expect(await screen.findByRole('heading', { name: 'Sök mat' })).toBeInTheDocument()
  })

  it('visar en lugn sida i stället för Lägg till när provperioden är slut', async () => {
    expireTrial()
    const router = renderApp('/lagg-till')
    expect(await screen.findByRole('heading', { level: 1, name: 'Provperioden är slut' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Sök mat' })).not.toBeInTheDocument()
    expect(screen.getByText(/Allt du redan har loggat finns kvar/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Exportera min data' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/installningar/data'))
  })

  it('egen data (Mina livsmedel, sparade måltider) går att se även efter provperioden', async () => {
    expireTrial()
    renderApp('/lagg-till?flik=mina')
    expect(await screen.findByRole('heading', { name: 'Sök mat' })).toBeInTheDocument()
    cleanup()
    renderApp('/lagg-till?flik=maltider')
    expect(await screen.findByRole('heading', { name: 'Sök mat' })).toBeInTheDocument()
    cleanup()
    // Andra flikar (sök, senaste) är fortfarande spärrade.
    renderApp('/lagg-till?flik=senaste')
    expect(await screen.findByRole('heading', { level: 1, name: 'Provperioden är slut' })).toBeInTheDocument()
  })

  it('+-knappen öppnar dialogen med vägar till priser och export', async () => {
    expireTrial()
    const router = renderApp('/')
    await screen.findByRole('heading', { name: 'Idag' })
    fireEvent.click(screen.getAllByRole('button', { name: 'Lägg till mat' })[0])
    const dialog = await screen.findByRole('dialog', { name: 'Provperioden är slut' })
    expect(dialog).toHaveTextContent('För att logga mat behöver du en licens')
    expect(dialog).toHaveTextContent('299 kr/år eller 599 kr för alltid')
    expect(router.state.location.pathname).toBe('/')
    fireEvent.click(screen.getByRole('button', { name: 'Se priser' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/premium'))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Provperioden är slut' })).not.toBeInTheDocument())
  })

  it('en utgången årslicens beskrivs som det den är', async () => {
    expireTrial()
    const exp = Math.floor((Date.now() - DAY) / 1000)
    const key = `LAGOM1.${btoa(JSON.stringify({ v: 1, id: 'test_x', plan: 'ar', iat: exp - 365 * 86_400, exp, test: true })).replace(/=+$/, '')}.test`
    useLicenseStore.setState({ licenseKey: key })
    renderApp('/')
    await screen.findByRole('heading', { name: 'Idag' })
    await waitFor(() => expect(currentAccess().checking).toBe(false))
    act(() => {
      requireAccess('traning')
    })
    expect(await screen.findByRole('dialog', { name: 'Årslicensen har gått ut' })).toHaveTextContent('För att logga träning behöver du en licens')
  })
})
