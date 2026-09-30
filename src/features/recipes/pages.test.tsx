/**
 * Röktester för receptsidorna: listan, en klassiker, kopiering, loggning och redigeraren.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import RecipesPage from './RecipesPage'
import RecipeDetailPage from './RecipeDetailPage'
import RecipeEditorPage from './RecipeEditorPage'
import RecipeImportPage from './RecipeImportPage'
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
      { path: '/recept/importera', element: <RecipeImportPage /> },
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
    // Delade recept öppnas här (i apparna öppnas delningslänkar i webbläsaren).
    expect(screen.getByRole('link', { name: 'Öppna delat recept' })).toHaveAttribute('href', '/dela')
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

  it('har en knapp för att importera recept från en länk', () => {
    renderAt('/recept')
    expect(screen.getByRole('link', { name: 'Importera recept' })).toHaveAttribute('href', '/recept/importera')
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

  it('visar källan med länk för importerade recept', async () => {
    const imported: Recipe = { ...ownRecipe, instructions: undefined, sourceUrl: 'https://www.recept.example.se/kladdkaka' }
    useFoodStore.setState({ recipes: { [imported.id]: imported } })
    renderAt('/recept/r_test1')
    expect(await screen.findByText('Källa')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /recept\.example\.se/ })
    expect(link).toHaveAttribute('href', 'https://www.recept.example.se/kladdkaka')
    expect(link).toHaveAttribute('target', '_blank')
    expect(screen.getByText('Instruktionerna finns hos källan.')).toBeInTheDocument()
  })

  it('med en allergiprofil visas inte märkena Glutenfri och Laktosfri – de saknar källa', async () => {
    const tagged: Recipe = { ...ownRecipe, tags: ['glutenfri', 'laktosfri', 'vegetarisk'] }
    useFoodStore.setState({ recipes: { [tagged.id]: tagged } })
    const first = renderAt('/recept/r_test1')
    await screen.findByRole('heading', { level: 1, name: 'Mormors gröt' })
    expect(screen.getByText('Glutenfri')).toBeInTheDocument()
    first.unmount()
    useProfileStore.setState((s) => ({ settings: { ...s.settings, allergens: ['gluten'] } }))
    try {
      renderAt('/recept/r_test1')
      await screen.findByRole('heading', { level: 1, name: 'Mormors gröt' })
      expect(screen.queryByText('Glutenfri')).not.toBeInTheDocument()
      expect(screen.queryByText('Laktosfri')).not.toBeInTheDocument()
      expect(screen.getByText('Vegetarisk')).toBeInTheDocument()
    } finally {
      useProfileStore.setState((s) => ({ settings: { ...s.settings, allergens: undefined } }))
    }
  })

  it('visar ingen källa för recept utan länk', async () => {
    useFoodStore.setState({ recipes: { [ownRecipe.id]: ownRecipe } })
    renderAt('/recept/r_test1')
    await screen.findByRole('heading', { level: 1, name: 'Mormors gröt' })
    expect(screen.queryByText('Källa')).not.toBeInTheDocument()
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

  it('föreslår rå/okokt vikt för ingredienser som anges tillagade', async () => {
    renderAt('/recept/nytt')
    fireEvent.change(screen.getByRole('searchbox', { name: 'Lägg till ingrediens' }), { target: { value: 'pasta' } })
    const results = await screen.findByRole('list', { name: 'Sökträffar' }, { timeout: 3000 })
    const hit = await waitFor(() => {
      const b = within(results)
        .getAllByRole('button')
        .find((x) => x.querySelector('.line-clamp-2')?.textContent === 'Pasta')
      expect(b).toBeDefined()
      return b!
    })
    // Träffraden visar samma utgångsläge som arket: okokt vikt med den kokta vikten.
    expect(hit).toHaveTextContent('100 g okokt · 250 g tillagat')
    fireEvent.click(hit)
    const sheet = await screen.findByRole('dialog', { name: 'Pasta' })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Lägg till i receptet' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Pasta' })).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: /Ändra mängd: Pasta, 100 g okokt · 250 g tillagat/ })).toBeInTheDocument()
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

describe('Klistra in ingredienser', () => {
  it('matchar rader mot livsmedel, låter användaren ta bort rader och lägger till resten', async () => {
    renderAt('/recept/nytt')
    fireEvent.click(screen.getByRole('button', { name: 'Klistra in ingredienser' }))
    const sheet = await screen.findByRole('dialog', { name: 'Klistra in ingredienser' })
    fireEvent.change(within(sheet).getByRole('textbox', { name: 'Ingredienser' }), {
      target: { value: '2 dl havregryn\nsmör till formen\n1 tsk salt' },
    })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Matcha 3 rader' }))

    const list = await within(sheet).findByRole('list', { name: 'Ingredienser att kontrollera' })
    // Havregryn med mängden omräknad från "2 dl".
    await waitFor(() => expect(within(list).getByRole('button', { name: /^Havregryn: 2 dl · \d+ g$/ })).toBeInTheDocument(), { timeout: 3000 })
    // Raden utan mängd ska kontrolleras.
    await waitFor(() => expect(within(list).getAllByText('Kontrollera mängden').length).toBeGreaterThan(0), { timeout: 3000 })
    fireEvent.click(within(list).getByRole('button', { name: 'Ta bort smör till formen' }))
    await waitFor(() => expect(within(list).queryByText('smör till formen')).not.toBeInTheDocument())

    const add = await within(sheet).findByRole('button', { name: 'Lägg till 2 ingredienser' }, { timeout: 3000 })
    fireEvent.click(add)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Klistra in ingredienser' })).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: /Ändra mängd: Havregryn/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Ändra mängd: Salt/ })).toBeInTheDocument()
  })

  it('byter livsmedel för en rad', async () => {
    renderAt('/recept/nytt')
    fireEvent.click(screen.getByRole('button', { name: 'Klistra in ingredienser' }))
    const sheet = await screen.findByRole('dialog', { name: 'Klistra in ingredienser' })
    fireEvent.change(within(sheet).getByRole('textbox', { name: 'Ingredienser' }), { target: { value: '3 dl havregryn' } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Matcha 1 rad' }))
    const list = await within(sheet).findByRole('list', { name: 'Ingredienser att kontrollera' })
    await within(list).findByRole('button', { name: /^Havregryn: 3 dl/ }, { timeout: 3000 })

    fireEvent.click(within(list).getByRole('button', { name: 'Byt livsmedel för 3 dl havregryn' }))
    const search = within(list).getByRole('searchbox', { name: 'Sök livsmedel för 3 dl havregryn' })
    fireEvent.change(search, { target: { value: 'vetemjöl' } })
    const hits = await within(list).findByRole('list', { name: 'Sökträffar' }, { timeout: 3000 })
    const hit = await waitFor(() => {
      const b = within(hits)
        .getAllByRole('button')
        .find((x) => x.querySelector('.line-clamp-2')?.textContent === 'Vetemjöl')
      expect(b).toBeDefined()
      return b!
    })
    fireEvent.click(hit)
    expect(await within(list).findByRole('button', { name: /^Vetemjöl: 3 dl/ })).toBeInTheDocument()
  })
})

const RECIPE_HTML = `<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage","name":"Gröt"},{"@type":"Recipe","name":"Havregrynsgröt med äpple","recipeYield":"2 portioner","totalTime":"PT10M","recipeIngredient":["2 dl havregryn","1 krm salt","Äpple till servering"],"recipeInstructions":"Koka upp."}]}</script>`

function mockRecipeFetch(respond: (url: string) => Response | Promise<Response>) {
  const spy = vi.mocked(globalThis.fetch)
  spy.mockImplementation(async (input, init) => {
    const target = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (!target.endsWith('/api/recipe-fetch')) throw new TypeError('offline')
    const body = JSON.parse(String(init?.body ?? '{}')) as { url: string }
    return respond(body.url)
  })
  return spy
}

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

describe('RecipeImportPage', () => {
  afterEach(() => {
    vi.mocked(globalThis.fetch).mockReset()
    vi.mocked(globalThis.fetch).mockRejectedValue(new TypeError('offline'))
  })

  it('hämtar ett recept från en länk, visar det för kontroll och sparar det med källan', async () => {
    const spy = mockRecipeFetch(() => json({ html: RECIPE_HTML }))
    const { router } = renderAt('/recept/importera')
    expect(screen.getByRole('heading', { level: 1, name: 'Importera recept' })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: 'Länk till receptet' }), { target: { value: 'https://recept.example.se/grot' } })
    fireEvent.click(screen.getByRole('button', { name: 'Hämta recept' }))

    expect(await screen.findByRole('textbox', { name: 'Namn' })).toHaveValue('Havregrynsgröt med äpple')
    const call = spy.mock.calls.find(([input]) => String(input).endsWith('/api/recipe-fetch'))
    expect(call?.[1]).toMatchObject({ method: 'POST', body: JSON.stringify({ url: 'https://recept.example.se/grot' }) })
    expect(screen.getByRole('spinbutton', { name: /Tid/ })).toHaveValue('10')
    expect(screen.getByText('Från recept.example.se')).toBeInTheDocument()

    const list = screen.getByRole('list', { name: 'Ingredienser att kontrollera' })
    await within(list).findByRole('button', { name: /^Havregryn: 2 dl/ }, { timeout: 3000 })
    await waitFor(() => expect(within(list).getAllByText('Kontrollera mängden').length).toBeGreaterThan(0), { timeout: 3000 })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Skapa receptet' }))
    })
    const saved = Object.values(useFoodStore.getState().recipes)
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ name: 'Havregrynsgröt med äpple', servings: 2, prepMinutes: 10, sourceUrl: 'https://recept.example.se/grot' })
    // Instruktionerna importeras inte – bara länken.
    expect(saved[0].instructions).toBeUndefined()
    expect(saved[0].ingredients.map((i) => i.food.id)).toContain('lagom:havregryn')
    await waitFor(() => expect(router.state.location.pathname).toBe(`/recept/${saved[0].id}`))
    expect(await screen.findByText('Källa')).toBeInTheDocument()
  })

  it('säger till när sidan saknar recept', async () => {
    mockRecipeFetch(() => json({ html: '<script type="application/ld+json">{"@type":"Organization","name":"X"}</script>' }))
    renderAt('/recept/importera')
    fireEvent.change(screen.getByRole('textbox', { name: 'Länk till receptet' }), { target: { value: 'https://example.se/om-oss' } })
    fireEvent.click(screen.getByRole('button', { name: 'Hämta recept' }))
    expect(await screen.findByText('Hittade inget recept på sidan')).toBeInTheDocument()
  })

  it('tolkar serverns svar "no-recipe" som att receptet saknas', async () => {
    mockRecipeFetch(() => json({ error: 'no-recipe' }, 422))
    renderAt('/recept/importera')
    fireEvent.change(screen.getByRole('textbox', { name: 'Länk till receptet' }), { target: { value: 'https://example.se/blogg' } })
    fireEvent.click(screen.getByRole('button', { name: 'Hämta recept' }))
    expect(await screen.findByText('Hittade inget recept på sidan')).toBeInTheDocument()
  })

  it('låter användaren klistra in ingredienserna när sidan inte angav några', async () => {
    mockRecipeFetch(() => json({ html: '<script type="application/ld+json">{"@type":"Recipe","name":"Soppa","recipeYield":"4"}</script>' }))
    renderAt('/recept/importera')
    fireEvent.change(screen.getByRole('textbox', { name: 'Länk till receptet' }), { target: { value: 'https://recept.example.se/soppa' } })
    fireEvent.click(screen.getByRole('button', { name: 'Hämta recept' }))
    expect(await screen.findByText(/Sidan angav inga ingredienser/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Matcha ingredienser' })).toBeDisabled()
    fireEvent.change(screen.getByRole('textbox', { name: 'Ingredienser' }), { target: { value: '2 dl havregryn' } })
    fireEvent.click(screen.getByRole('button', { name: 'Matcha ingredienser' }))
    const list = await screen.findByRole('list', { name: 'Ingredienser att kontrollera' })
    await within(list).findByRole('button', { name: /^Havregryn: 2 dl/ }, { timeout: 3000 })
  })

  it('säger till när sidan inte kunde hämtas', async () => {
    mockRecipeFetch(() => json({ error: 'fetch_failed' }, 502))
    renderAt('/recept/importera')
    fireEvent.change(screen.getByRole('textbox', { name: 'Länk till receptet' }), { target: { value: 'https://example.se/recept' } })
    fireEvent.click(screen.getByRole('button', { name: 'Hämta recept' }))
    expect(await screen.findByText('Kunde inte hämta sidan – kontrollera länken')).toBeInTheDocument()
  })

  it('låter användaren klistra in ingredienserna när sidan inte gick att läsa – länken sparas som källa', async () => {
    mockRecipeFetch(() => json({ code: 'inget-recept', error: 'Hittade inget recept på sidan.' }, 422))
    const { router } = renderAt('/recept/importera')
    fireEvent.change(screen.getByRole('textbox', { name: 'Länk till receptet' }), { target: { value: 'https://recept.example.se/linssoppa/' } })
    fireEvent.click(screen.getByRole('button', { name: 'Hämta recept' }))
    expect(await screen.findByText('Hittade inget recept på sidan')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Klistra in ingredienserna' }))

    expect(await screen.findByText(/Kopiera ingredienslistan från receptet/)).toBeInTheDocument()
    expect(screen.getByText('Från recept.example.se')).toBeInTheDocument()
    // Ett helt inklistrat recept: rubriker och instruktioner hoppas över.
    fireEvent.change(screen.getByRole('textbox', { name: 'Ingredienser' }), { target: { value: 'Ingredienser\n2 dl havregryn\nGör så här\nKoka upp vatten och rör ner grynen.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Matcha ingredienser' }))
    const list = await screen.findByRole('list', { name: 'Ingredienser att kontrollera' })
    await within(list).findByRole('button', { name: /^Havregryn: 2 dl/ }, { timeout: 3000 })
    expect(within(list).getAllByRole('listitem')).toHaveLength(1)

    // Texten går att ändra igen.
    fireEvent.click(screen.getByRole('button', { name: 'Ändra inklistrad text' }))
    expect(screen.getByRole('textbox', { name: 'Ingredienser' })).toHaveValue('Ingredienser\n2 dl havregryn\nGör så här\nKoka upp vatten och rör ner grynen.')
    fireEvent.click(screen.getByRole('button', { name: 'Matcha ingredienser' }))
    await within(await screen.findByRole('list', { name: 'Ingredienser att kontrollera' })).findByRole('button', { name: /^Havregryn: 2 dl/ }, { timeout: 3000 })

    fireEvent.change(screen.getByRole('textbox', { name: 'Namn' }), { target: { value: 'Linssoppa' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Skapa receptet' }))
    })
    const saved = Object.values(useFoodStore.getState().recipes)
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ name: 'Linssoppa', servings: 4, sourceUrl: 'https://recept.example.se/linssoppa/' })
    expect(saved[0].ingredients.map((i) => i.food.id)).toEqual(['lagom:havregryn'])
    await waitFor(() => expect(router.state.location.pathname).toBe(`/recept/${saved[0].id}`))
  })

  it('erbjuder inklistring även när sidan inte kunde hämtas – men inte för en ogiltig länk', async () => {
    mockRecipeFetch(() => json({ code: 'hamtning' }, 502))
    renderAt('/recept/importera')
    const field = screen.getByRole('textbox', { name: 'Länk till receptet' })
    fireEvent.change(field, { target: { value: 'kladdkaka' } })
    fireEvent.click(screen.getByRole('button', { name: 'Hämta recept' }))
    expect(await screen.findByText('Klistra in hela länken till receptet – den börjar med https://')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Klistra in ingredienserna' })).not.toBeInTheDocument()

    fireEvent.change(field, { target: { value: 'https://recept.example.se/kladdkaka' } })
    fireEvent.click(screen.getByRole('button', { name: 'Hämta recept' }))
    expect(await screen.findByRole('button', { name: 'Klistra in ingredienserna' })).toBeInTheDocument()
    // En ny länk döljer erbjudandet.
    fireEvent.change(field, { target: { value: 'https://recept.example.se/annan' } })
    expect(screen.queryByRole('button', { name: 'Klistra in ingredienserna' })).not.toBeInTheDocument()
  })

  it('tolkar serverns riktiga felsvar (422 inget-recept, 400 ogiltig)', async () => {
    mockRecipeFetch(() => json({ code: 'inget-recept', error: 'Hittade inget recept på sidan.' }, 422))
    const first = renderAt('/recept/importera')
    fireEvent.change(screen.getByRole('textbox', { name: 'Länk till receptet' }), { target: { value: 'https://example.se/blogg' } })
    fireEvent.click(screen.getByRole('button', { name: 'Hämta recept' }))
    expect(await screen.findByText('Hittade inget recept på sidan')).toBeInTheDocument()
    first.unmount()

    mockRecipeFetch(() => json({ code: 'ogiltig', error: 'Länken går inte att hämta.' }, 400))
    renderAt('/recept/importera')
    fireEvent.change(screen.getByRole('textbox', { name: 'Länk till receptet' }), { target: { value: 'https://example.se:8443/recept' } })
    fireEvent.click(screen.getByRole('button', { name: 'Hämta recept' }))
    expect(await screen.findByText(/Klistra in hela länken till receptet/)).toBeInTheDocument()
  })

  it('lägger till https:// på länkar utan protokoll och byter http mot https', async () => {
    const sent: string[] = []
    mockRecipeFetch((url) => {
      sent.push(url)
      return json({ html: RECIPE_HTML })
    })
    renderAt('/recept/importera')
    const field = screen.getByRole('textbox', { name: 'Länk till receptet' })
    fireEvent.change(field, { target: { value: 'recept.example.se/grot' } })
    fireEvent.click(screen.getByRole('button', { name: 'Hämta recept' }))
    expect(await screen.findByRole('textbox', { name: 'Namn' })).toHaveValue('Havregrynsgröt med äpple')
    fireEvent.change(field, { target: { value: 'http://recept.example.se/grot' } })
    fireEvent.click(screen.getByRole('button', { name: 'Hämta recept' }))
    await waitFor(() => expect(sent).toEqual(['https://recept.example.se/grot', 'https://recept.example.se/grot']))
  })

  it('kontrollerar länken innan något skickas', async () => {
    const spy = mockRecipeFetch(() => json({ html: RECIPE_HTML }))
    renderAt('/recept/importera')
    fireEvent.change(screen.getByRole('textbox', { name: 'Länk till receptet' }), { target: { value: 'kladdkaka' } })
    fireEvent.click(screen.getByRole('button', { name: 'Hämta recept' }))
    expect(await screen.findByText(/Klistra in hela länken till receptet/)).toBeInTheDocument()
    expect(spy.mock.calls.some(([input]) => String(input).endsWith('/api/recipe-fetch'))).toBe(false)
  })
})
