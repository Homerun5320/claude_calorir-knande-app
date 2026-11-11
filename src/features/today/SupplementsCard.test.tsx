/**
 * Kosttillskott på Idag: en bock per tillskott. Den obockade cirkeln är det man ser av kryssrutan,
 * så dess ram ska ha minst 3:1 mot raden (WCAG 1.4.11) – `border-ink-3`, inte `border-line` (1,3:1).
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SupplementsCard } from './SupplementsCard'
import { useToastStore } from '../../components/ui'
import { todayISO } from '../../lib/dates'
import { useDiaryStore } from '../../stores/diaryStore'
import { useFoodStore } from '../../stores/foodStore'
import { DEFAULT_SETTINGS, useProfileStore } from '../../stores/profileStore'
import type { Food } from '../../types'

const D3: Food = {
  id: 'custom:d3',
  name: 'D-vitamin 10 µg',
  source: 'custom',
  category: 'kosttillskott',
  nutrients: { kcal: 0, vitD: 10 },
  portions: [{ id: 'tablett', label: '1 tablett', grams: 1 }],
}

beforeAll(async () => {
  await waitFor(() => expect(useFoodStore.persist.hasHydrated() && useDiaryStore.persist.hasHydrated() && useProfileStore.persist.hasHydrated()).toBe(true))
})

beforeEach(() => {
  useDiaryStore.getState().clearDiary()
  useToastStore.setState({ toasts: [] })
  useFoodStore.setState({ customFoods: { [D3.id]: D3 } })
  useProfileStore.setState({ settings: { ...DEFAULT_SETTINGS, onboardingDone: true } })
})

describe('SupplementsCard', () => {
  it('den obockade cirkeln har en ram som syns (border-ink-3) och blir grön när tillskottet är taget', () => {
    render(
      <MemoryRouter>
        <SupplementsCard today={todayISO()} />
      </MemoryRouter>,
    )
    const row = screen.getByRole('checkbox', { name: /D-vitamin 10 µg/ })
    expect(row).toHaveAttribute('aria-checked', 'false')
    const circle = row.querySelector('[aria-hidden="true"]') as HTMLElement
    expect(circle).toHaveClass('border-2', 'border-ink-3')
    expect(circle).not.toHaveClass('border-line')

    fireEvent.click(row)
    const taken = screen.getByRole('checkbox', { name: /D-vitamin 10 µg/ })
    expect(taken).toHaveAttribute('aria-checked', 'true')
    expect(taken.querySelector('[aria-hidden="true"]')).toHaveClass('border-mossa', 'bg-mossa')
    expect(taken).toHaveTextContent('Taget idag')
  })
})
