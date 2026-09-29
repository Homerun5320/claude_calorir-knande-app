/**
 * Allergier och överkänslighet: inställningssidan (kryssrutor med Livsmedelsverkets namn,
 * integritetstexten och länkarna) och de varsamma flaggorna den ger – i produktdetaljen, i
 * skanningens resultat och i online-sökningens träfflista. Aldrig "säker" eller "fri från".
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router-dom'
import { MotionGlobalConfig } from 'motion/react'
import { DialogHost, ToastViewport, useToastStore } from '../../../components/ui'
import { useProfileStore } from '../../../stores/profileStore'
import { useFoodStore } from '../../../stores/foodStore'
import { useDiaryStore } from '../../../stores/diaryStore'
import { useBasketStore } from '../../add/basketStore'
import { loadBuiltinCatalog } from '../../../lib/foodRepo'
import { ALLERGEN_KEYS, type AllergenKey, type Food } from '../../../types'
import { EU_ALLERGENS, LMV_ALLERGY_LABELLING_URL, LMV_ALLERGY_URL, type FoodExtraWithAllergens } from '../../../lib/allergens'
import { offBar, bulle } from '../../add/testFoods'
import { AllergenFlags } from '../../add/AllergenFlags'
import { OnlineSearch } from '../../add/OnlineSearch'
import FoodDetailPage from '../../add/FoodDetailPage'
import ScanPage from '../../add/ScanPage'
import { AllergySection, allergySelectionText } from './AllergySection'

MotionGlobalConfig.skipAnimations = true

const NEVER_PROMISE = /säker|tryggt?\b|ofarlig|fri från|fritt från|allergifri|allergenfri/i

function setAllergens(list: AllergenKey[] | undefined) {
  useProfileStore.setState((s) => ({ settings: { ...s.settings, allergens: list } }))
}

const chocolate: Food & { extra: FoodExtraWithAllergens } = {
  ...offBar,
  id: 'off:7310865000637',
  name: 'Mjölkchoklad',
  extra: { allergens: ['mjölk', 'soja'], allergenKeys: ['soja', 'mjolk'], traceKeys: ['notter'], ingredientsText: 'Socker, kakaosmör, mjölkpulver, sojalecitin.' },
}

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/', element: <div>Hem</div> },
      { path: '/lagg-till', element: <div>Lägg till</div> },
      { path: '/skanna', element: <ScanPage /> },
      { path: '/livsmedel/:id', element: <FoodDetailPage /> },
      { path: '/installningar/allergier', element: <AllergySection /> },
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

const fetchMock = vi.fn<typeof fetch>()

beforeAll(async () => {
  // Livsmedelsverkets fil finns inte i testmiljön – katalogen blir Lagoms egna livsmedel.
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline')))
  await loadBuiltinCatalog()
})

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  fetchMock.mockRejectedValue(new TypeError('offline'))
  useToastStore.setState({ toasts: [] })
  useDiaryStore.setState({ entries: {} })
  useBasketStore.setState({ items: [] })
  useFoodStore.setState({ usage: {}, cachedFoods: {}, customFoods: {}, favorites: [] })
  useProfileStore.setState((s) => ({ settings: { ...s.settings, mindfulMode: false, energyUnit: 'kcal', allergens: undefined } }))
})

afterEach(() => {
  setAllergens(undefined)
})

describe('AllergySection', () => {
  it('visar de 14 allergenerna med Livsmedelsverkets namn och laktos', () => {
    render(
      <MemoryRouter>
        <AllergySection />
      </MemoryRouter>,
    )
    const boxes = screen.getAllByRole('checkbox')
    expect(boxes).toHaveLength(ALLERGEN_KEYS.length)
    for (const name of ['Spannmål som innehåller gluten', 'Kräftdjur', 'Ägg', 'Fisk', 'Jordnötter', 'Sojabönor', 'Mjölk och mjölkprodukter', 'Nötter', 'Selleri', 'Senap', 'Sesamfrön', 'Svaveldioxid och sulfit', 'Lupin', 'Blötdjur', 'Laktos']) {
      expect(screen.getByRole('checkbox', { name })).not.toBeChecked()
    }
    // Förklaringen kopplas till kryssrutan.
    expect(screen.getByRole('checkbox', { name: 'Nötter' })).toHaveAccessibleDescription(/Mandel, hasselnöt/)
    expect(within(screen.getByRole('group', { name: 'Allergier' })).getAllByRole('checkbox')).toHaveLength(EU_ALLERGENS.length)
    expect(screen.getByRole('status')).toHaveTextContent('Inget markerat ännu')
  })

  it('sparar valen i inställningarna i listans ordning', () => {
    render(
      <MemoryRouter>
        <AllergySection />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('checkbox', { name: 'Laktos' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Nötter' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Spannmål som innehåller gluten' }))
    expect(useProfileStore.getState().settings.allergens).toEqual(['gluten', 'notter', 'laktos'])
    expect(screen.getByRole('checkbox', { name: 'Nötter' })).toBeChecked()
    expect(screen.getByRole('status')).toHaveTextContent('Du har markerat gluten, nötter och laktos.')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Nötter' }))
    expect(useProfileStore.getState().settings.allergens).toEqual(['gluten', 'laktos'])
    fireEvent.click(screen.getByRole('checkbox', { name: 'Spannmål som innehåller gluten' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Laktos' }))
    // Inget tomt fält sparas.
    expect(useProfileStore.getState().settings.allergens).toBeUndefined()
  })

  it('nämner den automatiska kopian bara i apparna', async () => {
    const { unmount } = render(
      <MemoryRouter>
        <AllergySection />
      </MemoryRouter>,
    )
    expect(screen.getByText(/sparas bara/).textContent).not.toMatch(/automatiska kopian/)
    unmount()
    vi.stubGlobal('Capacitor', { isNativePlatform: () => true, getPlatform: () => 'ios' })
    vi.resetModules()
    try {
      const { AllergySection: InApp } = await import('./AllergySection')
      render(
        <MemoryRouter>
          <InApp />
        </MemoryRouter>,
      )
      expect(screen.getByText(/sparas bara/).textContent).toMatch(/automatiska kopian i appens mapp på telefonen, som inte lämnar telefonen genom Lagom/)
    } finally {
      vi.unstubAllGlobals()
      vi.stubGlobal('fetch', fetchMock)
      vi.resetModules()
    }
  })

  it('avmarkerar allt och kan ångra', () => {
    setAllergens(['mjolk', 'sesam'])
    render(
      <MemoryRouter>
        <AllergySection />
        <ToastViewport />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Avmarkera allt' }))
    expect(useProfileStore.getState().settings.allergens).toBeUndefined()
    expect(screen.queryByRole('button', { name: 'Avmarkera allt' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ångra' }))
    expect(useProfileStore.getState().settings.allergens).toEqual(['mjolk', 'sesam'])
  })

  it('berättar att uppgifterna bara sparas på enheten och länkar till Livsmedelsverket', () => {
    render(
      <MemoryRouter>
        <AllergySection />
      </MemoryRouter>,
    )
    expect(screen.getByText(/uppgifter om din hälsa\. De sparas bara i den här webbläsaren och skickas aldrig till Open Food Facts eller till oss/)).toBeInTheDocument()
    expect(screen.getByText(/Lagom kan aldrig lova att något är fritt från allergener/)).toBeInTheDocument()
    const lmv = screen.getByRole('link', { name: /Livsmedelsverket: Allergi och överkänslighet/ })
    expect(lmv).toHaveAttribute('href', LMV_ALLERGY_URL)
    expect(lmv).toHaveAttribute('target', '_blank')
    expect(lmv).toHaveAttribute('rel', 'noopener noreferrer')
    expect(lmv).toHaveTextContent('(öppnas i ny flik)')
    expect(screen.getByRole('link', { name: /Livsmedelsverket: Allergimärkning/ })).toHaveAttribute('href', LMV_ALLERGY_LABELLING_URL)
    expect(screen.getByRole('link', { name: /1177 Vårdguiden/ })).toHaveAttribute('href', 'https://www.1177.se')
  })

  it('sammanfattar valen i en mening', () => {
    expect(allergySelectionText(undefined)).toMatch(/^Inget markerat ännu/)
    expect(allergySelectionText(['mjolk'])).toBe('Du har markerat mjölk.')
  })
})

describe('AllergenFlags', () => {
  const renderFlags = (food: Food, variant?: 'detail' | 'compact' | 'row') =>
    render(
      <MemoryRouter>
        <AllergenFlags food={food} variant={variant} />
      </MemoryRouter>,
    )

  it('visar ingenting utan allergiprofil', () => {
    const { container } = renderFlags(chocolate)
    expect(container).toBeEmptyDOMElement()
    expect(renderFlags(bulle, 'compact').container).toBeEmptyDOMElement()
  })

  it('flaggar varsamt med text, ikon och källa – och länkar till inställningarna', () => {
    setAllergens(['mjolk', 'notter'])
    renderFlags(chocolate)
    const region = screen.getByRole('region', { name: 'Allergier och överkänslighet' })
    expect(within(region).getByText('Innehåller mjölk – som du har markerat')).toBeInTheDocument()
    expect(within(region).getByText('Kan innehålla spår av nötter – som du har markerat')).toBeInTheDocument()
    expect(within(region).getByText(/Enligt Open Food Facts.*läs alltid förpackningen/)).toBeInTheDocument()
    // Varningsfärgens token – aldrig röda larm.
    expect(region.className).toContain('bg-hjortron-soft')
    expect(region.innerHTML).not.toMatch(/lingon|text-bad|bg-bad/)
    expect(within(region).getByRole('link', { name: 'Ändra dina allergier' })).toHaveAttribute('href', '/installningar/allergier')
    expect(region.textContent).not.toMatch(NEVER_PROMISE)
  })

  it('laktos: mjölk ger "kan innehålla laktos", märkt laktosfri citeras med källa', () => {
    setAllergens(['laktos'])
    renderFlags(chocolate, 'compact')
    expect(screen.getByText('Innehåller mjölk – kan innehålla laktos')).toBeInTheDocument()
    // Skanningens resultat har ingen länk bort från flödet.
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('laktosfri märkning är en neutral uppgift, inget löfte', () => {
    setAllergens(['laktos'])
    const lactoseFree: Food = { ...chocolate, extra: { ...chocolate.extra, labels: ['Laktosfri'] } }
    renderFlags(lactoseFree, 'compact')
    const region = screen.getByRole('region', { name: 'Allergier och överkänslighet' })
    expect(within(region).getByText('Märkt laktosfri enligt Open Food Facts')).toBeInTheDocument()
    expect(within(region).queryByText(/kan innehålla laktos/)).not.toBeInTheDocument()
    expect(region.className).toContain('bg-surface-2')
    expect(region.textContent).not.toMatch(NEVER_PROMISE)
  })

  it('kurerade livsmedel: "Lagom har inga uppgifter om allergener …" – bara med en profil', () => {
    setAllergens(['gluten'])
    renderFlags(bulle)
    expect(screen.getByText('Lagom har inga uppgifter om allergener för det här livsmedlet – läs alltid förpackningen och ingredienserna.')).toBeInTheDocument()
  })

  it('träfflistan visar bara de varsamma flaggorna, diskret', () => {
    setAllergens(['soja', 'gluten'])
    renderFlags(chocolate, 'row')
    const list = screen.getByRole('list', { name: 'Allergier: Mjölkchoklad' })
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Innehåller soja – som du har markerat'])
    expect(list.className).toContain('text-warn')
  })

  it('träfflistan är tom när inget av det markerade anges', () => {
    setAllergens(['gluten'])
    expect(renderFlags(chocolate, 'row').container).toBeEmptyDOMElement()
  })
})

describe('flaggorna i appen', () => {
  it('produktdetaljen visar flaggorna och "kan innehålla spår av"', async () => {
    setAllergens(['mjolk'])
    useFoodStore.setState({ cachedFoods: { [chocolate.id]: chocolate } })
    renderAt(`/livsmedel/${encodeURIComponent(chocolate.id)}`)
    expect(await screen.findByText('Innehåller mjölk – som du har markerat')).toBeInTheDocument()
    const product = screen.getByRole('heading', { name: 'Kan innehålla spår av' }).parentElement!
    expect(within(product).getByText('nötter')).toBeInTheDocument()
  })

  it('produktdetaljen visar inga flaggor utan profil', async () => {
    useFoodStore.setState({ cachedFoods: { [chocolate.id]: chocolate } })
    renderAt(`/livsmedel/${encodeURIComponent(chocolate.id)}`)
    expect(await screen.findByRole('heading', { level: 1, name: 'Mjölkchoklad' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Allergier och överkänslighet' })).not.toBeInTheDocument()
  })

  it('med en profil visas inte Glutenfri/Laktosfri som egna märken utan källa', async () => {
    const tortilla: Food = { ...bulle, id: 'custom:tortilla', name: 'Majstortilla', source: 'custom', tags: ['vegan', 'glutenfri'] }
    useFoodStore.setState({ customFoods: { [tortilla.id]: tortilla } })
    const first = renderAt(`/livsmedel/${encodeURIComponent(tortilla.id)}`)
    const tags = await screen.findByRole('list', { name: 'Egenskaper' })
    expect(within(tags).getByText('Glutenfri')).toBeInTheDocument()
    first.unmount()

    setAllergens(['gluten'])
    renderAt(`/livsmedel/${encodeURIComponent(tortilla.id)}`)
    expect(await screen.findByText('Lagom har inga uppgifter om allergener för det här livsmedlet – läs alltid förpackningen och ingredienserna.')).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Egenskaper' })).queryByText('Glutenfri')).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Allergier och överkänslighet' }).textContent).not.toMatch(NEVER_PROMISE)
  })

  it('skanningens resultat visar flaggan innan man lägger till', async () => {
    setAllergens(['soja'])
    useFoodStore.setState({ cachedFoods: { [chocolate.id]: chocolate } })
    renderAt('/skanna?maltid=frukost&datum=2026-09-26')
    const input = await screen.findByLabelText(/Streckkod \(EAN\)/)
    fireEvent.change(input, { target: { value: '7310865000637' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sök produkten' }))
    })
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Innehåller soja – som du har markerat')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /Lägg till i/ })).toBeInTheDocument()
  })

  it('online-sökningen flaggar diskret i träfflistan', async () => {
    setAllergens(['mjolk'])
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          count: 2,
          products: [
            {
              code: '7310865000637',
              product_name: 'Mjölkchoklad',
              nutriments: { 'energy-kcal_100g': 540, proteins_100g: 7, carbohydrates_100g: 57, fat_100g: 31 },
              allergens_tags: ['en:milk', 'en:soybeans'],
              traces_tags: ['en:nuts'],
            },
            {
              code: '7350001100999',
              product_name: 'Havredryck',
              nutriments: { 'energy-kcal_100g': 46 },
              allergens_tags: ['en:gluten'],
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    render(
      <MemoryRouter>
        <OnlineSearch query="choklad" onPick={() => {}} onQuickAdd={() => {}} onDetails={() => {}} basketCount={() => 0} />
      </MemoryRouter>,
    )
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sök i Open Food Facts (online)' }))
    })
    const flags = await screen.findByRole('list', { name: 'Allergier: Mjölkchoklad' })
    expect(flags).toHaveTextContent('Innehåller mjölk – som du har markerat')
    expect(screen.queryByRole('list', { name: 'Allergier: Havredryck' })).not.toBeInTheDocument()
    expect(screen.getByText(/Kontrollera värdena och allergenerna mot förpackningen/)).toBeInTheDocument()
    expect(String(fetchMock.mock.calls[0][0])).toContain('traces_tags')
  })
})
