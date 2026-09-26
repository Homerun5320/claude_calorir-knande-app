/**
 * Röktester för Idag-skärmen: sidan renderas med riktiga butiker (fake-indexeddb) utan
 * renderingsloopar, välkomstläget visas första dagen och snabbåtgärderna fungerar.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import TodayPage from './TodayPage'
import { useToastStore } from '../../components/ui'
import { addDays, todayISO } from '../../lib/dates'
import { useBodyStore } from '../../stores/bodyStore'
import { useDiaryStore } from '../../stores/diaryStore'
import { useFastingStore } from '../../stores/fastingStore'
import { useFoodStore } from '../../stores/foodStore'
import { DEFAULT_SETTINGS, useProfileStore } from '../../stores/profileStore'
import type { Food, Profile } from '../../types'

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

const GROT: Food = {
  id: 'lagom:havregrynsgrot',
  name: 'Havregrynsgröt',
  source: 'lagom',
  category: 'spannmal',
  nutrients: { kcal: 70, protein: 2.5, carbs: 11, fat: 1.3, fiber: 1.7 },
  portions: [],
}

const LAX: Food = {
  id: 'lagom:lax',
  name: 'Lax, ugnsbakad',
  source: 'lagom',
  category: 'fisk',
  nutrients: { kcal: 210, protein: 22, fat: 13 },
  portions: [],
}

function renderPage() {
  return render(
    <MemoryRouter>
      <TodayPage />
    </MemoryRouter>,
  )
}

beforeAll(async () => {
  await waitFor(() => expect(STORES.every((s) => s.persist.hasHydrated())).toBe(true))
})

beforeEach(() => {
  useDiaryStore.getState().clearDiary()
  useBodyStore.getState().clearBody()
  useFastingStore.getState().clearFasting()
  useToastStore.setState({ toasts: [] })
  useProfileStore.setState({ profile: PROFILE, settings: { ...DEFAULT_SETTINGS, onboardingDone: true } })
  try {
    window.localStorage.clear()
  } catch {
    /* ignoreras */
  }
})

describe('TodayPage', () => {
  it('välkomnar första dagen med en tydlig väg till första måltiden', async () => {
    renderPage()
    expect(await screen.findByText('Din första dag med Lagom')).toBeInTheDocument()
    const cta = screen.getByRole('link', { name: /Lägg till din första måltid/ })
    expect(cta.getAttribute('href')).toMatch(/\/lagg-till\?maltid=\w+&datum=\d{4}-\d{2}-\d{2}/)
    expect(screen.getByRole('link', { name: /Skanna en streckkod/ })).toHaveAttribute('href', '/skanna')
    expect(screen.getByRole('link', { name: /Utforska svenska klassiker/ })).toHaveAttribute('href', '/recept')
    // Hälsningen använder namnet.
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/, Anna$/)
    // Veckan och kostråden väntar tills det finns något att visa.
    expect(screen.queryByText('Veckan')).not.toBeInTheDocument()
    expect(screen.queryByText('Kostråden i veckan')).not.toBeInTheDocument()
  })

  it('visar måltider med namn och en "+" per måltid', async () => {
    const today = todayISO()
    useDiaryStore.getState().addEntry({ kind: 'food', food: GROT, amount: 300, unit: 'g', grams: 300, date: today, meal: 'frukost' })
    renderPage()
    expect(await screen.findByText('Havregrynsgröt')).toBeInTheDocument()
    expect(screen.queryByText('Din första dag med Lagom')).not.toBeInTheDocument()
    const add = screen.getByRole('link', { name: 'Lägg till i frukost' })
    expect(add).toHaveAttribute('href', `/lagg-till?maltid=frukost&datum=${today}`)
    // Kvällsmat är avstängd som standard.
    expect(screen.queryByRole('link', { name: 'Lägg till i kvällsmat' })).not.toBeInTheDocument()
    expect(screen.getByText('Veckan')).toBeInTheDocument()
  })

  it('kopierar gårdagens måltid och kan ångra', async () => {
    const today = todayISO()
    const yesterday = addDays(today, -1)
    useDiaryStore.getState().addEntry({ kind: 'food', food: LAX, amount: 150, unit: 'g', grams: 150, date: yesterday, meal: 'lunch' })
    renderPage()
    const chip = await screen.findByRole('button', { name: /Kopiera gårdagens lunch/ })
    fireEvent.click(chip)
    await waitFor(() => expect(useDiaryStore.getState().entries[today]?.length).toBe(1))
    expect(useDiaryStore.getState().entries[today]?.[0].meal).toBe('lunch')

    const t = useToastStore.getState().toasts.at(-1)
    expect(t?.message).toMatch(/Gårdagens lunch är kopierad/)
    act(() => t?.action?.onClick())
    expect(useDiaryStore.getState().entries[today]).toBeUndefined()
    // Gårdagen är orörd.
    expect(useDiaryStore.getState().entries[yesterday]?.length).toBe(1)
  })

  it('fyller på vatten med ett tryck', async () => {
    renderPage()
    const today = todayISO()
    const card = (await screen.findByRole('heading', { name: 'Vatten' })).closest('section')!
    fireEvent.click(within(card).getAllByRole('button', { name: 'Lägg till ett glas (250 ml)' }).at(-1)!)
    expect(useDiaryStore.getState().water[today]).toBe(250)
  })

  it('döljer siffror och vikt i medvetet läge men visar kvällsreflektionen', async () => {
    const today = todayISO()
    useDiaryStore.getState().addEntry({ kind: 'food', food: GROT, amount: 300, unit: 'g', grams: 300, date: today, meal: 'frukost' })
    useBodyStore.getState().logWeight(today, 68)
    useProfileStore.setState({ settings: { ...DEFAULT_SETTINGS, onboardingDone: true, mindfulMode: true } })
    renderPage()
    expect(await screen.findByText('Hur har dagen varit?')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Väg dig/ })).not.toBeInTheDocument()
    // Ingen energisiffra i måltidskortet.
    expect(screen.queryByText(/210/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Humör: Bra' }))
    expect(useDiaryStore.getState().days[today]?.mood).toBe(4)
    fireEvent.click(screen.getByRole('button', { name: /Markera dagen som klar/ }))
    expect(useDiaryStore.getState().days[today]?.complete).toBe(true)
    expect(await screen.findByText('Dagen är markerad som klar')).toBeInTheDocument()
  })

  it('visar pågående fasta och träning som sammanhangskort', async () => {
    const today = todayISO()
    useFastingStore.getState().startFast(16, '16:8', Date.now() - 2 * 3_600_000)
    useDiaryStore.getState().addExercise({ date: today, activityId: 'promenad', name: 'Promenad', minutes: 40, kcal: 160 })
    renderPage()
    expect(await screen.findByText('Fasta · 16:8')).toBeInTheDocument()
    expect(screen.getByText('Träning idag')).toBeInTheDocument()
    expect(screen.getByText('Promenad')).toBeInTheDocument()
  })
})
