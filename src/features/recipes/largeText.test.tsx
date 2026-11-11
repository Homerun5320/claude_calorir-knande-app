/**
 * Stor text (200 %) på receptsidan: faktarutorna, makroraderna och ingredienserna får brytas i stället för att
 * skjuta ut sidan. rem i en containerfråga följer rotens teckenstorlek, så vid normal text (≈ 20 rem breda
 * rader) gäller reglerna aldrig. jsdom har ingen layout – se components/domain/largeText.test.tsx.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { MotionGlobalConfig } from 'motion/react'
import RecipeDetailPage from './RecipeDetailPage'
import { loadBuiltinCatalog } from '../../lib/foodRepo'
import { DEFAULT_SETTINGS, useProfileStore } from '../../stores/profileStore'

MotionGlobalConfig.skipAnimations = true

beforeAll(async () => {
  await waitFor(() => expect(useProfileStore.persist.hasHydrated()).toBe(true))
  await loadBuiltinCatalog()
})

beforeEach(() => {
  useProfileStore.setState({ profile: undefined, settings: { ...DEFAULT_SETTINGS, onboardingDone: true } })
})

describe('stor text – receptsidan', () => {
  it('faktarutorna får en kolumn, och makroraderna och ingredienserna bryts', async () => {
    const router = createMemoryRouter([{ path: '/recept/:id', element: <RecipeDetailPage /> }], { initialEntries: ['/recept/klassiker-kottbullar'] })
    render(<RouterProvider router={router} />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Köttbullar' })).toBeInTheDocument()

    const stats = screen.getByText('Tid').closest('dl') as HTMLElement
    expect(stats).toHaveClass('grid-cols-3', '@max-[12rem]:grid-cols-1')
    expect(stats.parentElement).toHaveClass('@container', 'min-w-0', 'flex-1')

    // Makrorader: etiketten får krympa och brytas, värdet har en minsta bredd i stället för en fast.
    const nutrition = screen.getByRole('heading', { name: 'Näring' }).closest('section') as HTMLElement
    const protein = within(nutrition).getByText('Protein').closest('li') as HTMLElement
    expect(protein).toHaveClass('flex-wrap')
    expect(within(nutrition).getByText('Protein')).toHaveClass('min-w-0', 'break-words')
    expect(protein.lastElementChild).toHaveClass('min-w-16', 'ml-auto')
    expect(protein.lastElementChild).not.toHaveClass('w-16')

    // Ingredienser: mängden har ett tak, och gramvikten får brytas när listan är smal.
    const list = screen.getByText('Ingredienser').closest('section')?.querySelector('ul.divide-y') as HTMLElement
    expect(list).toHaveClass('@container')
    const amount = list.querySelector('li > span:first-child') as HTMLElement
    expect(amount).toHaveClass('max-w-[45%]', 'break-words')
    expect(list.querySelector('li span.whitespace-nowrap')).toHaveClass('@max-[14rem]:whitespace-normal')
  })
})
