/**
 * Veckobudgeten på Idag och i dagboken: dagens mål följer veckodagen, en diskret rad berättar
 * det ("Veckobudget: +300 kcal idag"), veckokortet visar veckans budget i neutral ton och medvetet
 * läge visar inga siffror. Vid graviditet används ingen veckobudget.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, createMemoryRouter, RouterProvider } from 'react-router-dom'
import { MotionGlobalConfig } from 'motion/react'
import TodayPage from './TodayPage'
import DiaryPage from '../diary/DiaryPage'
import { addDays, todayISO, weekdayIndex } from '../../lib/dates'
import { computeTargets } from '../../lib/energy'
import { formatEnergy, formatNumber } from '../../lib/format'
import { useBodyStore } from '../../stores/bodyStore'
import { useDiaryStore } from '../../stores/diaryStore'
import { useFastingStore } from '../../stores/fastingStore'
import { useFoodStore } from '../../stores/foodStore'
import { DEFAULT_SETTINGS, useProfileStore } from '../../stores/profileStore'
import type { Profile } from '../../types'

MotionGlobalConfig.skipAnimations = true

const STORES = [useProfileStore, useDiaryStore, useFoodStore, useBodyStore, useFastingStore]

const PROFILE: Profile = {
  name: 'Anna',
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
  createdAt: 0,
}

/** +300 kcal på datumets veckodag och 50 kcal mindre de andra sex dagarna (summa 0). */
function extraOn(date: string): number[] {
  const w = weekdayIndex(date)
  return Array.from({ length: 7 }, (_, i) => (i === w ? 300 : -50))
}

function setBudget(date: string, extra: Partial<Profile> = {}, mindful = false, since?: string) {
  useProfileStore.setState({
    profile: { ...PROFILE, ...extra },
    settings: {
      ...DEFAULT_SETTINGS,
      onboardingDone: true,
      adaptiveTargets: false,
      mindfulMode: mindful,
      weeklyBudget: { enabled: true, shift: extraOn(date), ...(since ? { since } : {}) },
    },
  })
}

function renderToday() {
  return render(
    <MemoryRouter>
      <TodayPage />
    </MemoryRouter>,
  )
}

function renderDiary(date: string) {
  const router = createMemoryRouter([{ path: '/dagbok/:date', element: <DiaryPage /> }], { initialEntries: [`/dagbok/${date}`] })
  return render(<RouterProvider router={router} />)
}

beforeAll(async () => {
  await waitFor(() => expect(STORES.every((s) => s.persist.hasHydrated())).toBe(true))
})

beforeEach(() => {
  useDiaryStore.getState().clearDiary()
  useBodyStore.getState().clearBody()
  useFastingStore.getState().clearFasting()
  try {
    window.localStorage.clear()
  } catch {
    /* ignoreras */
  }
})

describe('veckobudgeten på Idag', () => {
  it('visar dagens förskjutning som en diskret rad och veckans budget i veckokortet', async () => {
    const today = todayISO()
    setBudget(today)
    // Något loggat igår så att veckokortet visas.
    useDiaryStore.getState().addEntry({ kind: 'quick', name: 'Middag', nutrients: { kcal: 600 }, date: addDays(today, -1), meal: 'middag' })
    renderToday()
    expect(await screen.findByText(`Veckobudget: +${formatEnergy(300)} idag`)).toBeInTheDocument()
    expect(screen.getByText(/^Veckobudget .* – med extra på \p{L}+\. Samma energi över veckan, bara fördelad annorlunda\.$/u)).toBeInTheDocument()
    // Linjen är snittmålet, men varje dags eget mål heter "Dagsmål" i tabellen för skärmläsare.
    const table = screen.getByRole('table', { name: 'Energi per dag de senaste sju dagarna' })
    expect(within(table).getByRole('columnheader', { name: 'Dagsmål' })).toBeInTheDocument()
    expect(within(table).queryByRole('columnheader', { name: 'Snittmål' })).not.toBeInTheDocument()
    const base = computeTargets(PROFILE, PROFILE.startWeightKg, {}, { today }).kcal
    expect(within(table).getAllByRole('cell').some((c) => c.textContent?.startsWith(formatNumber(base + 300)))).toBe(true)
  })

  it('en lättare dag beskrivs neutralt – utan skuld', async () => {
    const today = todayISO()
    setBudget(addDays(today, 1))
    renderToday()
    const note = await screen.findByText(/^Veckobudget: .* mindre idag – sparat till dagarna med extra$/)
    expect(note.textContent).toContain(formatEnergy(50))
  })

  it('medvetet läge: inga siffror i raden och ingen veckobudget i veckokortet', async () => {
    const today = todayISO()
    setBudget(today, {}, true)
    useDiaryStore.getState().addEntry({ kind: 'quick', name: 'Middag', nutrients: { kcal: 600 }, date: addDays(today, -1), meal: 'middag' })
    renderToday()
    expect(await screen.findByText('Veckobudget idag – lite extra utrymme i dagsmålet.')).toBeInTheDocument()
    expect(screen.queryByText(/kcal idag/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Veckobudget \d/)).not.toBeInTheDocument()
  })

  it('ingen veckobudget vid graviditet', async () => {
    const today = todayISO()
    setBudget(today, { lifeStage: 'gravid' })
    renderToday()
    await screen.findByRole('region', { name: 'Dagsringen' })
    expect(screen.queryByText(/Veckobudget/)).not.toBeInTheDocument()
  })
})

describe('veckobudgeten i dagboken', () => {
  it('en tidigare dag får sin egen veckodags mål', async () => {
    const today = todayISO()
    const date = addDays(today, -3)
    setBudget(date)
    renderDiary(date)
    expect(await screen.findByText(`Veckobudget: +${formatEnergy(300)} i dagens budget`)).toBeInTheDocument()
    const base = computeTargets(PROFILE, PROFILE.startWeightKg, {}, { today }).kcal
    const bar = screen.getByRole('progressbar', { name: 'Energi mot dagens budget' })
    expect(bar.getAttribute('aria-valuetext')).toBe(`${formatEnergy(0)} av ${formatEnergy(base + 300)}`)
  })

  it('en dag före dagen veckobudgeten slogs på har det jämna dagsmålet', async () => {
    const today = todayISO()
    const date = addDays(today, -3)
    setBudget(date, {}, false, today)
    renderDiary(date)
    const base = computeTargets(PROFILE, PROFILE.startWeightKg, {}, { today }).kcal
    const bar = await screen.findByRole('progressbar', { name: 'Energi mot dagens budget' })
    expect(bar.getAttribute('aria-valuetext')).toBe(`${formatEnergy(0)} av ${formatEnergy(base)}`)
    expect(screen.queryByText(/Veckobudget/)).not.toBeInTheDocument()
  })

  it('de andra dagarna får 50 kcal mindre', async () => {
    const today = todayISO()
    setBudget(addDays(today, 2))
    renderDiary(today)
    const base = computeTargets(PROFILE, PROFILE.startWeightKg, {}, { today }).kcal
    const bar = await screen.findByRole('progressbar', { name: 'Energi mot dagens budget' })
    expect(bar.getAttribute('aria-valuetext')).toBe(`${formatEnergy(0)} av ${formatEnergy(base - 50)}`)
    expect(screen.getByText(/mindre i dagens budget/)).toBeInTheDocument()
  })
})
