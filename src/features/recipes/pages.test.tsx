/**
 * Röktester för receptsidorna: listan, en klassiker, kopiering, loggning och redigeraren.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import RecipesPage from './RecipesPage'
import RecipeDetailPage from './RecipeDetailPage'
import RecipeEditorPage from './RecipeEditorPage'
import { DialogHost } from '../../components/ui/Dialog'
import { useToastStore } from '../../components/ui/toast'
import { useDiaryStore } from '../../stores/diaryStore'
import { useFoodStore } from '../../stores/foodStore'
import { useProfileStore } from '../../stores/profileStore'
import { loadBuiltinCatalog } from '../../lib/foodRepo'
import type { Recipe } from '../../types'

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/', element: <div>Hem</div> },
      { path: '/recept', element: <RecipesPage /> },
      { path: '/recept/nytt', element: <RecipeEditorPage /> },
      { path: '/recept/:id', element: <RecipeDetailPage /> },
      { path: '/recept/:id/redigera', element: <RecipeEditorPage /> },
    ],
    { initialEntries: [path] },
  )
  const utils = render(
    <>
      <RouterProvider router={router} />
      <DialogHost />
    </>,
  )
  return { router, ...utils }
}

const ownRecipe: Recipe = {
  id: 'r_test1',
  name: 'Mormors gröt',
  emoji: '🥣',
  servings: 2,
  ingredients: [
    {
      id: 'i_1',
      food: {
        id: 'lagom:havregryn',
        name: 'Havregryn',
        source: 'lagom',
        category: 'spannmal',
        nutrients: { kcal: 372, protein: 13, carbs: 59, fat: 7, fiber: 10 },
        portions: [],
        density: 0.35,
      },
      amount: 2,
      unit: 'dl',
      grams: 70,
    },
  ],
  instructions: 'Koka upp vatten.\nRör ner grynen.',
  createdAt: 1,
  updatedAt: 1,
}

beforeAll(async () => {
  // Livsmedelsverkets fil finns inte i testmiljön – katalogen blir Lagoms egna livsmedel.
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'))
  await loadBuiltinCatalog()
})

beforeEach(() => {
  useDiaryStore.setState({ entries: {} })
  useFoodStore.setState({ usage: {}, cachedFoods: {}, customFoods: {}, favorites: [], templates: [], recipes: {} })
  useToastStore.setState({ toasts: [] })
  useProfileStore.setState((s) => ({ settings: { ...s.settings, mindfulMode: false, energyUnit: 'kcal' } }))
})

describe('RecipesPage', () => {
  it('visar ett uppmuntrande tomt läge för egna recept', () => {
    renderAt('/recept')
    expect(screen.getByRole('heading', { level: 1, name: 'Recept' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Mina recept/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Ditt första recept väntar')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Skapa recept' })).toHaveAttribute('href', '/recept/nytt')
    // Den flytande knappen dubblerar inte tomlägets egen knapp (och täcker inte tipsen).
    expect(screen.queryByRole('link', { name: 'Nytt recept' })).not.toBeInTheDocument()
  })

  it('visar den flytande knappen "Nytt recept" bland klassikerna', async () => {
    renderAt('/recept?flik=klassiker')
    expect(await screen.findByText('Köttbullar')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Nytt recept' })).toHaveAttribute('href', '/recept/nytt')
  })

  it('listar klassikerna och filtrerar med sökning', async () => {
    renderAt('/recept?flik=klassiker')
    expect(await screen.findByText('Köttbullar')).toBeInTheDocument()
    expect(screen.getByText('Janssons frestelse')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Sök recept' }), { target: { value: 'lax' } })
    await waitFor(() => expect(screen.queryByText('Köttbullar')).not.toBeInTheDocument())
    expect(screen.getByText('Laxpudding')).toBeInTheDocument()
  })

  it('visar egna recept med energi per portion', () => {
    useFoodStore.setState({ recipes: { [ownRecipe.id]: ownRecipe } })
    renderAt('/recept')
    const link = screen.getByRole('link', { name: /Mormors gröt/ })
    expect(link).toHaveAttribute('href', '/recept/r_test1')
    // 70 g havregryn à 372 kcal/100 g = 260 kcal, delat på 2 portioner = 130 kcal.
    expect(within(link).getByText('130')).toBeInTheDocument()
  })
})

describe('RecipeDetailPage', () => {
  it('visar en klassiker med ingredienser, steg och skalning', async () => {
    renderAt('/recept/klassiker-pannkakor')
    expect(await screen.findByRole('heading', { level: 1, name: 'Pannkakor' })).toBeInTheDocument()
    expect(screen.getByText('Svensk klassiker')).toBeInTheDocument()
    // Faktarutorna har korta, olika etiketter (inte "Portioner" bredvid "Portion").
    const stats = screen.getByText('Tid').closest('dl') as HTMLElement
    expect(within(stats).getByText('Portioner')).toBeInTheDocument()
    expect(within(stats).getByText('Per portion')).toBeInTheDocument()
    // "Klassiker" upprepas inte som badge under rubriken "Svensk klassiker".
    expect(screen.queryByText('Klassiker')).not.toBeInTheDocument()
    expect(screen.getByText('2½ dl')).toBeInTheDocument()
    // Namn och vikt är skilda åt med ett mellanslag (även för skärmläsare).
    expect(screen.getByText('2½ dl').closest('li')).toHaveTextContent(/Vetemjöl \(\d+ g\)/)
    expect(screen.getByText('3 ägg')).toBeInTheDocument()
    expect(screen.getByText(/Vispa mjöl, salt och hälften av mjölken/)).toBeInTheDocument()

    const increase = screen.getByRole('button', { name: 'Öka portioner' })
    fireEvent.click(increase)
    fireEvent.click(increase)
    fireEvent.click(increase)
    fireEvent.click(increase)
    // 8 portioner = dubbla mängden.
    expect(await screen.findByText('5 dl')).toBeInTheDocument()
    expect(screen.getByText('6 ägg')).toBeInTheDocument()
  })

  it('kopierar en klassiker till mina recept', async () => {
    const { router } = renderAt('/recept/klassiker-kottbullar')
    fireEvent.click(await screen.findByRole('button', { name: 'Kopiera till mina recept' }))
    const recipes = Object.values(useFoodStore.getState().recipes)
    expect(recipes).toHaveLength(1)
    expect(recipes[0].id).toMatch(/^r_/)
    expect(recipes[0].builtin).toBeUndefined()
    expect(recipes[0].name).toBe('Köttbullar')
    await waitFor(() => expect(router.state.location.pathname).toBe(`/recept/${recipes[0].id}`))
    expect(await screen.findByText('Mitt recept')).toBeInTheDocument()
  })

  it('loggar en portion i dagboken', async () => {
    useFoodStore.setState({ recipes: { [ownRecipe.id]: ownRecipe } })
    renderAt('/recept/r_test1')
    fireEvent.click(await screen.findByRole('button', { name: 'Logga en portion' }))
    const dialog = await screen.findByRole('dialog', { name: 'Logga i dagboken' })
    fireEvent.click(within(dialog).getByRole('radio', { name: /Lunch/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: /Lägg till i lunch/ }))
    const entries = Object.values(useDiaryStore.getState().entries).flat()
    expect(entries).toHaveLength(1)
    const entry = entries[0]
    expect(entry.kind).toBe('food')
    expect(entry.meal).toBe('lunch')
    if (entry.kind === 'food') {
      expect(entry.food.id).toBe('recipe:r_test1')
      expect(entry.grams).toBe(35)
    }
  })

  it('tar bort ett eget recept efter bekräftelse', async () => {
    useFoodStore.setState({ recipes: { [ownRecipe.id]: ownRecipe }, favorites: ['recipe:r_test1'] })
    const { router } = renderAt('/recept/r_test1')
    fireEvent.click(await screen.findByRole('button', { name: 'Ta bort receptet' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Ta bort receptet?' })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Ta bort' }))
    await waitFor(() => expect(useFoodStore.getState().recipes).toEqual({}))
    expect(useFoodStore.getState().favorites).toEqual([])
    await waitFor(() => expect(router.state.location.pathname).toBe('/recept'))
  })

  it('visar ett vänligt fel för okända recept', () => {
    renderAt('/recept/r_finnsinte')
    expect(screen.getByRole('heading', { level: 1, name: 'Receptet hittades inte' })).toBeInTheDocument()
  })
})

describe('RecipeEditorPage', () => {
  it('kräver namn och minst en ingrediens', async () => {
    renderAt('/recept/nytt')
    fireEvent.click(screen.getByRole('button', { name: 'Spara recept' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Ge receptet ett namn.')
    expect(screen.getByRole('alert')).toHaveTextContent('Lägg till minst en ingrediens.')
    expect(useFoodStore.getState().recipes).toEqual({})
  })

  it('skapar ett recept med sökta ingredienser och tillagad vikt', async () => {
    const { router } = renderAt('/recept/nytt')
    fireEvent.change(screen.getByRole('textbox', { name: 'Namn' }), { target: { value: 'Min gröt' } })

    fireEvent.change(screen.getByRole('searchbox', { name: 'Lägg till ingrediens' }), { target: { value: 'havregryn' } })
    const results = await screen.findByRole('list', { name: 'Sökträffar' })
    const hit = within(results)
      .getAllByRole('button')
      .find((b) => b.querySelector('.line-clamp-2')?.textContent === 'Havregryn')
    expect(hit).toBeDefined()
    fireEvent.click(hit!)

    const sheet = await screen.findByRole('dialog', { name: 'Havregryn' })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Lägg till i receptet' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Havregryn' })).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: /Ändra mängd: Havregryn/ })).toBeInTheDocument()

    fireEvent.change(screen.getByRole('spinbutton', { name: /Vikt efter tillagning/ }), { target: { value: '400' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Spara recept' }))
    })
    const saved = Object.values(useFoodStore.getState().recipes)
    expect(saved).toHaveLength(1)
    expect(saved[0].id).toMatch(/^r_/)
    expect(saved[0].name).toBe('Min gröt')
    expect(saved[0].ingredients[0].food.id).toBe('lagom:havregryn')
    expect(saved[0].cookedWeightG).toBe(400)
    await waitFor(() => expect(router.state.location.pathname).toBe(`/recept/${saved[0].id}`))
  })

  it('förifyller ett befintligt recept och sparar ändringar', async () => {
    useFoodStore.setState({ recipes: { [ownRecipe.id]: ownRecipe } })
    renderAt('/recept/r_test1/redigera')
    const name = screen.getByRole('textbox', { name: 'Namn' })
    expect(name).toHaveValue('Mormors gröt')
    fireEvent.change(name, { target: { value: 'Farmors gröt' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Spara ändringar' }))
    })
    const saved = useFoodStore.getState().recipes.r_test1
    expect(saved.name).toBe('Farmors gröt')
    expect(saved.createdAt).toBe(1)
  })

  it('går tillbaka till receptsidan efter redigering därifrån', async () => {
    useFoodStore.setState({ recipes: { [ownRecipe.id]: ownRecipe } })
    const { router } = renderAt('/recept')
    await act(async () => {
      await router.navigate('/recept/r_test1')
    })
    fireEvent.click(await screen.findByRole('link', { name: 'Redigera' }))
    const name = await screen.findByRole('textbox', { name: 'Namn' })
    fireEvent.change(name, { target: { value: 'Havregröt' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Spara ändringar' }))
    })
    await waitFor(() => expect(router.state.location.pathname).toBe('/recept/r_test1'))
    expect(await screen.findByRole('heading', { level: 1, name: 'Havregröt' })).toBeInTheDocument()
    expect(router.state.historyAction).toBe('POP')
  })

  it('frågar innan osparade ändringar går förlorade', async () => {
    const { router } = renderAt('/recept')
    await act(async () => {
      await router.navigate('/recept/nytt')
    })
    fireEvent.change(await screen.findByRole('textbox', { name: 'Namn' }), { target: { value: 'Halvfärdig' } })
    fireEvent.click(screen.getByRole('button', { name: 'Avbryt' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Lämna utan att spara?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fortsätt redigera' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(router.state.location.pathname).toBe('/recept/nytt')
    expect(screen.getByRole('textbox', { name: 'Namn' })).toHaveValue('Halvfärdig')

    fireEvent.click(screen.getByRole('button', { name: 'Avbryt' }))
    const again = await screen.findByRole('alertdialog', { name: 'Lämna utan att spara?' })
    fireEvent.click(within(again).getByRole('button', { name: 'Lämna' }))
    // PageHeader går hem när minneshistoriken saknar window.history-index (som i testmiljön).
    await waitFor(() => expect(router.state.location.pathname).not.toBe('/recept/nytt'))
  })

  it('erbjuder kopia i stället för att redigera en klassiker', async () => {
    renderAt('/recept/klassiker-pannkakor/redigera')
    expect(screen.getByText('Klassikerna är skrivskyddade')).toBeInTheDocument()
    const button = await screen.findByRole('button', { name: 'Kopiera till mina recept' })
    await waitFor(() => expect(button).not.toHaveAttribute('aria-busy'))
    fireEvent.click(button)
    expect(Object.values(useFoodStore.getState().recipes)).toHaveLength(1)
  })
})
