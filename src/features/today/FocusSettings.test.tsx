/**
 * Inställningar → Mål: valet "Veckans fokus" och "Lägg till kosttillskott" (som sedan syns på Idag).
 *
 * Testerna ligger här eftersom de hör ihop med korten på Idag (FocusCard och SupplementsCard).
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { GoalsSection } from '../settings/sections/GoalsSection'
import { useToastStore } from '../../components/ui'
import { startOfWeek, todayISO } from '../../lib/dates'
import { useBodyStore } from '../../stores/bodyStore'
import { useDiaryStore } from '../../stores/diaryStore'
import { useFastingStore } from '../../stores/fastingStore'
import { useFoodStore } from '../../stores/foodStore'
import { DEFAULT_SETTINGS, useProfileStore } from '../../stores/profileStore'
import type { Profile } from '../../types'

const STORES = [useProfileStore, useDiaryStore, useFoodStore, useBodyStore, useFastingStore]

const PROFILE: Profile = {
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

function renderGoals() {
  return render(
    <MemoryRouter>
      <GoalsSection />
    </MemoryRouter>,
  )
}

beforeAll(async () => {
  await waitFor(() => expect(STORES.every((s) => s.persist.hasHydrated())).toBe(true))
})

beforeEach(() => {
  useFoodStore.setState({ customFoods: {} })
  useToastStore.setState({ toasts: [] })
  useProfileStore.setState({ profile: PROFILE, settings: { ...DEFAULT_SETTINGS, onboardingDone: true } })
})

describe('Veckans fokus i målen', () => {
  it('sätter fokus med veckans måndag och tar bort det med "Inget fokus"', () => {
    renderGoals()
    const select = screen.getByRole('combobox', { name: 'Veckans fokus' })
    expect(select).toHaveValue('inget')
    fireEvent.change(select, { target: { value: 'mer-gronsaker' } })
    expect(useProfileStore.getState().settings.weeklyFocus).toEqual({ id: 'mer-gronsaker', since: startOfWeek(todayISO()) })
    expect(screen.getByText(/Sikta på 500 gram grönsaker, frukt och bär om dagen/)).toBeInTheDocument()

    fireEvent.change(select, { target: { value: 'inget' } })
    expect(useProfileStore.getState().settings.weeklyFocus).toBeUndefined()
  })

  it('visar ett okänt fokus (t.ex. från en nyare version) som "Inget fokus"', () => {
    useProfileStore.setState({ settings: { ...DEFAULT_SETTINGS, onboardingDone: true, weeklyFocus: { id: 'framtida-fokus', since: '2026-09-21' } } })
    renderGoals()
    expect(screen.getByRole('combobox', { name: 'Veckans fokus' })).toHaveValue('inget')
  })
})

describe('Kosttillskott i målen', () => {
  it('lägger till ett tillskott från en mall med egen styrka', async () => {
    renderGoals()
    fireEvent.click(screen.getByRole('button', { name: 'Lägg till kosttillskott' }))
    const sheet = await screen.findByRole('dialog', { name: 'Lägg till kosttillskott' })
    fireEvent.change(within(sheet).getByRole('combobox', { name: 'Tillskott' }), { target: { value: 'b12' } })
    expect(within(sheet).getByText(/För dig som äter veganskt: minst 4 µg per dag enligt Livsmedelsverket/)).toBeInTheDocument()
    const field = within(sheet).getByRole('spinbutton', { name: /Vitamin B12 per tablett/ })
    expect(field).toHaveValue('25')
    fireEvent.change(field, { target: { value: '50' } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Lägg till Vitamin B12 50 µg' }))

    const foods = Object.values(useFoodStore.getState().customFoods)
    expect(foods).toHaveLength(1)
    expect(foods[0]).toMatchObject({ name: 'Vitamin B12 50 µg', category: 'kosttillskott', source: 'custom' })
    expect(foods[0].nutrients.kcal).toBe(0)
    expect(foods[0].portions[0].label).toBe('1 tablett')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Lägg till kosttillskott' })).not.toBeInTheDocument())
    expect(screen.getByRole('list', { name: 'Dina kosttillskott' })).toHaveTextContent('Vitamin B12 50 µg')
  })

  it('säger lugnt till när styrkan passerar den övre gränsen', async () => {
    renderGoals()
    fireEvent.click(screen.getByRole('button', { name: 'Lägg till kosttillskott' }))
    const sheet = await screen.findByRole('dialog', { name: 'Lägg till kosttillskott' })
    fireEvent.change(within(sheet).getByRole('combobox', { name: 'Tillskott' }), { target: { value: 'jarn' } })
    expect(within(sheet).queryByText(/Stäm av doseringen/)).not.toBeInTheDocument()
    fireEvent.click(within(sheet).getByRole('button', { name: /^100 mg$/ }))
    expect(within(sheet).getByText(/Stäm av doseringen med apoteket eller vården\./)).toBeInTheDocument()
  })

  it('tar bort ett tillskott med möjlighet att ångra', async () => {
    renderGoals()
    fireEvent.click(screen.getByRole('button', { name: 'Lägg till kosttillskott' }))
    const sheet = await screen.findByRole('dialog', { name: 'Lägg till kosttillskott' })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Lägg till D-vitamin 10 µg' }))
    await waitFor(() => expect(Object.values(useFoodStore.getState().customFoods)).toHaveLength(1))
    fireEvent.click(await screen.findByRole('button', { name: 'Ta bort D-vitamin 10 µg' }))
    expect(useFoodStore.getState().customFoods).toEqual({})
    useToastStore.getState().toasts.at(-1)?.action?.onClick()
    expect(Object.values(useFoodStore.getState().customFoods)).toHaveLength(1)
  })
})
