/**
 * Sidan Milstolpar: uppnådda med datum, några kommande utan förlopp eller press, reglaget
 * "Visa milstolpar", medvetet läge – och länken i Mer.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MotionGlobalConfig } from 'motion/react'
import MilestonesPage from './MilestonesPage'
import MorePage from './MorePage'
import { addDays, todayISO } from '../../lib/dates'
import { useBodyStore } from '../../stores/bodyStore'
import { useDiaryStore } from '../../stores/diaryStore'
import { useFastingStore } from '../../stores/fastingStore'
import { useFoodStore } from '../../stores/foodStore'
import { usePlanStore } from '../../stores/planStore'
import { DEFAULT_SETTINGS, useProfileStore } from '../../stores/profileStore'
import { formatMilestoneDate } from '../../lib/milestones'
import type { Profile } from '../../types'

MotionGlobalConfig.skipAnimations = true

const STORES = [useProfileStore, useDiaryStore, useFoodStore, useBodyStore, useFastingStore, usePlanStore]

const PROFILE: Profile = {
  name: 'Anna',
  sex: 'kvinna',
  birthYear: 1990,
  heightCm: 168,
  startWeightKg: 70,
  activityLevel: 'latt',
  goal: 'ga_ner',
  weeklyRateKg: 0.5,
  lifeStage: 'ingen',
  diet: 'allatare',
  macroPreset: 'nnr',
  createdAt: Date.now() - 40 * 86_400_000,
}

const today = todayISO()

const inRouter = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>)

function logMeal(date: string) {
  useDiaryStore.getState().addEntry({ kind: 'quick', date, meal: 'lunch', name: 'Soppa', nutrients: { kcal: 420 } })
}

beforeAll(async () => {
  await waitFor(() => expect(STORES.every((s) => s.persist.hasHydrated())).toBe(true))
})

beforeEach(() => {
  localStorage.clear()
  useDiaryStore.getState().clearDiary()
  useFoodStore.getState().clearFoods()
  useFastingStore.getState().clearFasting()
  usePlanStore.getState().clearPlan()
  useBodyStore.setState({ weights: [{ id: 'w1', date: today, kg: 68.3, createdAt: 0 }], measurements: [] })
  useProfileStore.setState({ profile: { ...PROFILE }, settings: { ...DEFAULT_SETTINGS, onboardingDone: true, milestonesSeen: [] } })
})

describe('MilestonesPage', () => {
  it('ny användare: lugnt tomt läge och några kommande utan förlopp', () => {
    inRouter(<MilestonesPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Milstolpar' })).toBeInTheDocument()
    expect(screen.getByText(/Den första dyker upp när du loggar din första måltid/)).toBeInTheDocument()
    const upcoming = screen.getByRole('region', { name: 'Längre fram' })
    expect(within(upcoming).getAllByRole('listitem')).toHaveLength(3)
    expect(within(upcoming).getByRole('heading', { name: 'Första måltiden loggad' })).toBeInTheDocument()
    expect(screen.getByText('Inget att jaga – de kommer när de kommer.')).toBeInTheDocument()
    // Inga förloppsstaplar, inga "x av 10" och inget om vikt eller kalorier.
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(document.body).not.toHaveTextContent(/\d+ av \d+|kvar till|i rad|streak|kcal|\bkg\b/)
  })

  it('uppnådda med datum, senast uppnådda först', () => {
    const first = addDays(today, -20)
    logMeal(first)
    for (let i = 1; i < 10; i++) logMeal(addDays(today, -i))
    useFoodStore.getState().saveRecipe({ id: 'r_1', name: 'Gryta', servings: 4, ingredients: [], createdAt: Date.now(), updatedAt: Date.now() })
    inRouter(<MilestonesPage />)
    const achieved = screen.getByRole('region', { name: 'Uppnådda' })
    const titles = within(achieved)
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent)
    expect(titles).toEqual(['Första egna receptet', '10 dagar i dagboken', 'Första måltiden loggad'])
    const firstMeal = within(achieved).getByRole('heading', { name: 'Första måltiden loggad' }).closest('li') as HTMLElement
    expect(within(firstMeal).getByText(formatMilestoneDate(first, today))).toHaveAttribute('dateTime', first)
    // De uppnådda föreslås inte igen, men nästa antal dagar gör det – utan antal kvar.
    const upcoming = screen.getByRole('region', { name: 'Längre fram' })
    expect(within(upcoming).queryByText('Första måltiden loggad')).not.toBeInTheDocument()
    expect(screen.getByText(/Dagar räknas totalt och inte i följd/)).toBeInTheDocument()
  })

  it('fastan firas aldrig som milstolpe, inte ens när den används', () => {
    const upcomingTitles = () =>
      within(screen.getByRole('region', { name: 'Längre fram' }))
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent)
    useFastingStore.getState().startFast(16, '16:8')
    inRouter(<MilestonesPage />)
    expect(upcomingTitles().join(' ')).not.toMatch(/fasta/i)
  })

  it('reglaget "Visa milstolpar" döljer dem och slår på dem igen', () => {
    logMeal(today)
    inRouter(<MilestonesPage />)
    const toggle = screen.getByRole('switch', { name: 'Visa milstolpar' })
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(toggle)
    expect(useProfileStore.getState().settings.hideMilestones).toBe(true)
    expect(screen.queryByRole('region', { name: 'Uppnådda' })).not.toBeInTheDocument()
    expect(screen.getByText(/Milstolparna är dolda/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('switch', { name: 'Visa milstolpar' }))
    expect(useProfileStore.getState().settings.hideMilestones).toBe(false)
    expect(screen.getByRole('region', { name: 'Uppnådda' })).toBeInTheDocument()
  })

  it('fungerar i medvetet läge – inga siffror om mat eller vikt', () => {
    useProfileStore.setState((s) => ({ settings: { ...s.settings, mindfulMode: true } }))
    logMeal(today)
    inRouter(<MilestonesPage />)
    expect(screen.getByRole('heading', { name: 'Första måltiden loggad' })).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent(/kcal|kJ|\bkg\b|420|68,3/)
  })

  it('en firad milstolpe finns kvar även om det som gav den tas bort', () => {
    useProfileStore.getState().updateSettings({ milestonesSeen: ['forsta-receptet'] })
    inRouter(<MilestonesPage />)
    const achieved = screen.getByRole('region', { name: 'Uppnådda' })
    expect(within(achieved).getByRole('heading', { name: 'Första egna receptet' })).toBeInTheDocument()
  })
})

describe('Mer → Milstolpar', () => {
  it('länkar till milstolparna med den senast uppnådda', () => {
    logMeal(today)
    inRouter(<MorePage />)
    const link = screen.getByRole('link', { name: /Milstolpar/ })
    expect(link).toHaveAttribute('href', '/mer/milstolpar')
    expect(link).toHaveTextContent('Senast: Första måltiden loggad')
  })

  it('lugn inbjudan när inget är uppnått, och ingen länk när milstolparna är dolda', () => {
    const { unmount } = inRouter(<MorePage />)
    expect(screen.getByRole('link', { name: /Milstolpar/ })).toHaveTextContent('Små glädjeämnen längs vägen')
    unmount()
    useProfileStore.getState().updateSettings({ hideMilestones: true })
    inRouter(<MorePage />)
    expect(screen.queryByRole('link', { name: /Milstolpar/ })).not.toBeInTheDocument()
  })
})
