/**
 * Firandet av milstolpar: tyst start för den som redan har historik, en notis och konfetti en gång
 * per milstolpe, aldrig för exempeldata, aldrig när milstolparna är dolda och aldrig utan profil.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { MotionGlobalConfig } from 'motion/react'
import { Confetti } from '../../components/signature'
import { ToastViewport, useToastStore } from '../../components/ui'
import { addDays, todayISO } from '../../lib/dates'
import { clearDemoFlag, setDemoFlag } from '../../lib/demoFlag'
import { useDiaryStore } from '../../stores/diaryStore'
import { useFastingStore } from '../../stores/fastingStore'
import { useFoodStore } from '../../stores/foodStore'
import { usePlanStore } from '../../stores/planStore'
import { DEFAULT_SETTINGS, useProfileStore } from '../../stores/profileStore'
import type { Profile } from '../../types'
import { MILESTONES_PATH, checkMilestones, useMilestoneCelebration } from './useMilestoneCelebration'

MotionGlobalConfig.skipAnimations = true

const STORES = [useProfileStore, useDiaryStore, useFoodStore, usePlanStore, useFastingStore]

const PROFILE: Profile = {
  sex: 'kvinna',
  birthYear: 1990,
  heightCm: 168,
  startWeightKg: 70,
  activityLevel: 'latt',
  goal: 'behalla',
  weeklyRateKg: 0.5,
  lifeStage: 'ingen',
  diet: 'allatare',
  macroPreset: 'nnr',
  createdAt: Date.now() - 30 * 86_400_000,
}

const today = todayISO()

function logMeal(date = today, meal: 'lunch' | 'fika' = 'lunch') {
  useDiaryStore.getState().addEntry({ kind: 'quick', date, meal, name: 'Smörgås', nutrients: {} })
}

const seen = () => useProfileStore.getState().settings.milestonesSeen
const toasts = () => useToastStore.getState().toasts

beforeAll(async () => {
  await waitFor(() => expect(STORES.every((s) => s.persist.hasHydrated())).toBe(true))
})

beforeEach(() => {
  localStorage.clear()
  clearDemoFlag()
  useDiaryStore.getState().clearDiary()
  useFoodStore.getState().clearFoods()
  useFastingStore.getState().clearFasting()
  usePlanStore.getState().clearPlan()
  useToastStore.setState({ toasts: [] })
  useProfileStore.setState({ profile: { ...PROFILE }, settings: { ...DEFAULT_SETTINGS, onboardingDone: true } })
})

describe('checkMilestones', () => {
  it('den som redan har historik (efter en uppdatering) får inga firanden – allt markeras som sett', () => {
    for (let i = 0; i < 12; i++) logMeal(addDays(today, -i * 2))
    useFoodStore.getState().saveRecipe({ id: 'r_1', name: 'Gryta', servings: 4, ingredients: [], createdAt: Date.now(), updatedAt: Date.now() })
    expect(seen()).toBeUndefined()
    expect(checkMilestones(today)).toEqual([])
    expect(seen()).toEqual(expect.arrayContaining(['forsta-maltiden', 'dagar-10', 'forsta-receptet']))
    // Och ingenting firas i efterhand.
    expect(checkMilestones(today)).toEqual([])
  })

  it('en ny användare: första måltiden firas en gång', () => {
    expect(checkMilestones(today)).toEqual([])
    expect(seen()).toEqual([])
    logMeal()
    expect(checkMilestones(today).map((m) => m.id)).toEqual(['forsta-maltiden'])
    expect(seen()).toEqual(['forsta-maltiden'])
    logMeal()
    expect(checkMilestones(today)).toEqual([])
    // Tas posten bort och läggs till igen firas den inte på nytt.
    useDiaryStore.getState().clearDiary()
    expect(checkMilestones(today)).toEqual([])
    logMeal()
    expect(checkMilestones(today)).toEqual([])
    expect(seen()).toEqual(['forsta-maltiden'])
  })

  it('aldrig för exempeldata – och inget sparas medan den visas', () => {
    useProfileStore.getState().updateSettings({ milestonesSeen: [] })
    setDemoFlag()
    logMeal()
    expect(checkMilestones(today)).toEqual([])
    expect(seen()).toEqual([])
    clearDemoFlag()
  })

  it('dolda milstolpar firas inte, men markeras som sedda så att inget firas i efterhand', () => {
    useProfileStore.getState().updateSettings({ milestonesSeen: [], hideMilestones: true })
    logMeal()
    expect(checkMilestones(today)).toEqual([])
    expect(seen()).toEqual(['forsta-maltiden'])
    useProfileStore.getState().updateSettings({ hideMilestones: false })
    expect(checkMilestones(today)).toEqual([])
  })

  it('inget utan profil eller innan välkomstflödet är klart', () => {
    logMeal()
    useProfileStore.setState({ profile: null })
    expect(checkMilestones(today)).toEqual([])
    expect(seen()).toBeUndefined()
    useProfileStore.setState({ profile: { ...PROFILE }, settings: { ...DEFAULT_SETTINGS, onboardingDone: false } })
    expect(checkMilestones(today)).toEqual([])
    expect(seen()).toBeUndefined()
  })

  it('vattenmålet följer det egna målet', () => {
    useProfileStore.getState().updateSettings({ milestonesSeen: [], targetOverrides: { waterMl: 1000 } })
    useDiaryStore.getState().addWater(today, 1000)
    expect(checkMilestones(today).map((m) => m.id)).toEqual(['forsta-vattenmalet'])
  })
})

function Harness() {
  const burst = useMilestoneCelebration(5)
  const { pathname } = useLocation()
  return (
    <>
      <p data-testid="path">{pathname}</p>
      <p data-testid="burst">{burst}</p>
      <ToastViewport />
      <Confetti fire={burst} fullscreen />
    </>
  )
}

function mount() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="*" element={<Harness />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('useMilestoneCelebration', () => {
  it('firar en ny milstolpe med notis och konfetti – en gång', async () => {
    useProfileStore.getState().updateSettings({ milestonesSeen: [] })
    mount()
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30))
    })
    expect(screen.getByTestId('burst')).toHaveTextContent('0')
    expect(screen.queryByTestId('confetti')).not.toBeInTheDocument()

    act(() => logMeal())
    await waitFor(() => expect(screen.getByTestId('burst')).toHaveTextContent('1'))
    expect(screen.getByTestId('confetti')).toBeInTheDocument()
    expect(toasts().map((t) => t.message)).toEqual(['Ny milstolpe: Första måltiden loggad. Välkommen igång!'])

    // "Visa" öppnar sidan Milstolpar.
    const status = screen.getByText(/Ny milstolpe: Första måltiden loggad/).closest('[data-toast-id]') as HTMLElement
    fireEvent.click(within(status).getByRole('button', { name: 'Visa' }))
    expect(screen.getByTestId('path')).toHaveTextContent(MILESTONES_PATH)

    // Fler måltider firas inte.
    useToastStore.setState({ toasts: [] })
    act(() => logMeal())
    await act(async () => {
      await new Promise((r) => setTimeout(r, 40))
    })
    expect(screen.getByTestId('burst')).toHaveTextContent('1')
    expect(toasts()).toEqual([])
  })

  it('tyst start med befintlig historik – ingen ström av notiser', async () => {
    for (let i = 0; i < 11; i++) logMeal(addDays(today, -i))
    logMeal(today, 'fika')
    useDiaryStore.getState().addWater(today, 3000)
    mount()
    await waitFor(() => expect(seen()).toEqual(expect.arrayContaining(['forsta-maltiden', 'dagar-10', 'forsta-fikan', 'forsta-vattenmalet'])))
    expect(screen.getByTestId('burst')).toHaveTextContent('0')
    expect(toasts()).toEqual([])
  })

  it('aldrig för exempeldata', async () => {
    useProfileStore.getState().updateSettings({ milestonesSeen: [] })
    setDemoFlag()
    mount()
    act(() => logMeal())
    await act(async () => {
      await new Promise((r) => setTimeout(r, 40))
    })
    expect(screen.getByTestId('burst')).toHaveTextContent('0')
    expect(toasts()).toEqual([])
    expect(seen()).toEqual([])
    clearDemoFlag()
  })

  it('inget firande när milstolparna är dolda', async () => {
    useProfileStore.getState().updateSettings({ milestonesSeen: [], hideMilestones: true })
    mount()
    act(() => logMeal())
    await waitFor(() => expect(seen()).toEqual(['forsta-maltiden']))
    expect(screen.getByTestId('burst')).toHaveTextContent('0')
    expect(toasts()).toEqual([])
  })
})
