/**
 * Insikter → Kostråd: rubrikerna ska bilda en ren disposition (h1 → h2 → h3, inget hopp), och råden
 * ligger i en lista som heter "Kostråden".
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import InsightsPage from './InsightsPage'
import { addDays, todayISO } from '../../lib/dates'
import { useBodyStore } from '../../stores/bodyStore'
import { useDiaryStore } from '../../stores/diaryStore'
import { useFastingStore } from '../../stores/fastingStore'
import { useFoodStore } from '../../stores/foodStore'
import { DEFAULT_SETTINGS, useProfileStore } from '../../stores/profileStore'
import type { Profile } from '../../types'
import { makeFood } from './testUtils'

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

const GROT = makeFood('Havregrynsgröt', { kcal: 70, protein: 2.5, carbs: 11, fat: 1.3, fiber: 1.7 }, 'spannmal')
const BROCCOLI = makeFood('Broccoli', { kcal: 35, protein: 3, carbs: 4, fat: 0.4, fiber: 3 }, 'gronsaker')

function seed(days: number) {
  const today = todayISO()
  for (let i = 0; i < days; i++) {
    const date = addDays(today, -i)
    useDiaryStore.getState().addEntries([
      { kind: 'food', food: GROT, amount: 300, unit: 'g', grams: 300, date, meal: 'frukost', time: '07:30' },
      { kind: 'food', food: BROCCOLI, amount: 200, unit: 'g', grams: 200, date, meal: 'middag', time: '18:15' },
    ])
  }
}

beforeAll(async () => {
  await waitFor(() => expect(STORES.every((s) => s.persist.hasHydrated())).toBe(true))
})

beforeEach(() => {
  useDiaryStore.getState().clearDiary()
  useBodyStore.getState().clearBody()
  useProfileStore.setState({ profile: PROFILE, settings: { ...DEFAULT_SETTINGS, onboardingDone: true } })
})

describe('Kostråd – rubriker', () => {
  it('går från h1 via h2 till h3 utan hopp, och listan heter "Kostråden"', async () => {
    seed(7)
    const { container } = render(
      <MemoryRouter initialEntries={['/insikter?flik=kostrad']}>
        <InsightsPage />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Kostrådspoäng')).toBeInTheDocument()

    const headings = Array.from(container.querySelectorAll('h1, h2, h3, h4, h5, h6'))
    expect(headings.length).toBeGreaterThan(3)
    let previous = 0
    for (const h of headings) {
      const level = Number(h.tagName.slice(1))
      expect(level, `"${h.textContent}" (${h.tagName}) kommer efter en h${previous}`).toBeLessThanOrEqual(previous + 1)
      previous = level
    }

    // Rådkorten är h3 under en h2 (osynlig) för listan; poängkortet har en egen h2.
    expect(screen.getByRole('heading', { level: 2, name: 'Kostrådspoäng' })).toBeInTheDocument()
    const listHeading = screen.getByRole('heading', { level: 2, name: 'Kostråden' })
    const list = screen.getByRole('list', { name: 'Kostråden' })
    expect(list).toHaveAttribute('aria-labelledby', listHeading.id)
    expect(within(list).getAllByRole('heading', { level: 3 }).length).toBeGreaterThan(0)
    // Rubriken syns inte (osynlig text) – utseendet är oförändrat.
    expect(listHeading).toHaveClass('sr-only')
  })
})
