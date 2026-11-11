/**
 * Stor text (200 %) i dagboken: måltidens rubrikrad har inte plats för ikon, namn och två knappar
 * bredvid varandra – då döljs den dekorativa ikonen och namnet får en egen rad ovanför knapparna
 * (containerfråga, `@max-[14rem]`; rem följer rotens teckenstorlek, så vid normal text ≈ 20 rem
 * gäller den aldrig). Se ../../components/domain/largeText.test.tsx.
 */
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MotionGlobalConfig } from 'motion/react'
import { DEFAULT_SETTINGS } from '../../stores/profileStore'
import { MealSection } from './MealSection'

MotionGlobalConfig.skipAnimations = true

describe('stor text – MealSection', () => {
  it.each([false, true])('rubrikraden bryts och ikonen döljs vid smal bredd (tom måltid: %s)', (empty) => {
    const meal = DEFAULT_SETTINGS.meals[0]
    const entries = empty
      ? []
      : [
          {
            id: 'e1',
            kind: 'quick' as const,
            date: '2026-10-03',
            meal: meal.id,
            name: 'Snabbregistrerad',
            nutrients: { kcal: 300 },
            createdAt: 0,
          },
        ]
    const { container } = render(
      <MemoryRouter>
        <MealSection meal={meal} entries={entries} totals={{ kcal: empty ? 0 : 300 }} date="2026-10-03" mindful={false} energyUnit="kcal" onOpenEntry={() => {}} onOpenMenu={() => {}} />
      </MemoryRouter>,
    )
    const section = container.querySelector('section') as HTMLElement
    expect(section).toHaveClass('card', '@container')
    const nameBlock = screen.getByRole('heading', { level: 3 }).parentElement as HTMLElement
    expect(nameBlock).toHaveClass('min-w-0', 'flex-1', '@max-[14rem]:basis-full')
    expect(nameBlock.parentElement).toHaveClass('flex-wrap')
    // Ikonen ligger i ett omslag utan egen ruta (`contents`) som döljs när kortet är smalt.
    expect(nameBlock.previousElementSibling).toHaveClass('contents', '@max-[14rem]:hidden')
    // Plusknappen hamnar till höger på raden under namnet.
    expect(screen.getByRole('link', { name: /^Lägg till i / })).toHaveClass('@max-[14rem]:ml-auto')
  })
})
