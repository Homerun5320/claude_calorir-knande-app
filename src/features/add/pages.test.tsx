/**
 * Röktester för sidorna i flödet "Lägg till mat": de renderar utan fel, visar rätt innehåll och
 * de viktigaste interaktionerna fungerar.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router-dom'
import AddFoodPage, { searchAnnouncement } from './AddFoodPage'
import { BasketSheet } from './Basket'
import { PortionSheet } from './PortionSheet'
import FoodDetailPage from './FoodDetailPage'
import CustomFoodPage from './CustomFoodPage'
import ScanPage from './ScanPage'
import { DialogHost } from '../../components/ui/Dialog'
import { useBasketStore } from './basketStore'
import { useDiaryStore } from '../../stores/diaryStore'
import { useFoodStore } from '../../stores/foodStore'
import { useProfileStore } from '../../stores/profileStore'
import { useToastStore } from '../../components/ui/toast'
import { loadBuiltinCatalog } from '../../lib/foodRepo'
import { bulle, offBar } from './testFoods'
import { NutriScoreBadge, nutriScoreTextClass } from './components'

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/', element: <div>Hem</div> },
      { path: '/lagg-till', element: <AddFoodPage /> },
      { path: '/skanna', element: <ScanPage /> },
      { path: '/livsmedel/:id', element: <FoodDetailPage /> },
      { path: '/livsmedel/:id/redigera', element: <CustomFoodPage /> },
      { path: '/nytt-livsmedel', element: <CustomFoodPage /> },
      { path: '/dagbok/:date', element: <div>Dagbok</div> },
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

beforeAll(async () => {
  // Livsmedelsverkets fil finns inte i testmiljön – katalogen blir Lagoms egna livsmedel.
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'))
  await loadBuiltinCatalog()
})

beforeEach(() => {
  useDiaryStore.setState({ entries: {} })
  useFoodStore.setState({ usage: {}, cachedFoods: {}, customFoods: {}, favorites: [], templates: [], recipes: {} })
  useBasketStore.setState({ items: [] })
  useToastStore.setState({ toasts: [] })
  useProfileStore.setState((s) => ({ settings: { ...s.settings, mindfulMode: false, energyUnit: 'kcal' } }))
})

describe('AddFoodPage', () => {
  it('visar sök, genvägar och tomma listor', () => {
    renderAt('/lagg-till?maltid=frukost&datum=2026-09-26')
    expect(screen.getByRole('heading', { level: 1, name: 'Lägg till' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Sök bland 1 000+ svenska livsmedel')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Frukost' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Skanna streckkod')).toBeInTheDocument()
    expect(screen.getByText('Här hamnar det du äter')).toBeInTheDocument()
  })

  it('söker lokalt, lägger i korgen och lägger till allt', async () => {
    const { router } = renderAt('/lagg-till?maltid=fika&datum=2026-01-15')
    fireEvent.change(screen.getByPlaceholderText('Sök bland 1 000+ svenska livsmedel'), { target: { value: 'kanelbulle' } })
    const row = await screen.findByRole('button', { name: /^Kanelbulle, bageri/ }, { timeout: 3000 })
    fireEvent.click(row)
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lägg i korgen' }))
    await waitFor(() => expect(useBasketStore.getState().items).toHaveLength(1))
    const bar = await screen.findByRole('button', { name: /Visa korgen: 1 livsmedel/ })
    expect(bar).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Lägg till' }))
    await waitFor(() => expect(useDiaryStore.getState().entries['2026-01-15']).toHaveLength(1))
    expect(useBasketStore.getState().items).toHaveLength(0)
    expect(router.state.location.pathname).toBe('/dagbok/2026-01-15')
  })

  it('lägger till ett enskilt livsmedel direkt – och korgen blir huvudvalet när den har innehåll', async () => {
    const { router } = renderAt('/lagg-till?maltid=fika&datum=2026-09-26')
    fireEvent.change(screen.getByPlaceholderText('Sök bland 1 000+ svenska livsmedel'), { target: { value: 'kanelbulle bageri' } })
    fireEvent.click(await screen.findByRole('button', { name: /^Kanelbulle, bageri/ }, { timeout: 3000 }))
    let dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lägg till i Fika' }))
    expect(useDiaryStore.getState().entries['2026-09-26']).toHaveLength(1)
    expect(useToastStore.getState().toasts.at(-1)?.message).toBe('Tillagt i Fika')
    // Man stannar kvar och kan lägga till mer.
    expect(router.state.location.pathname).toBe('/lagg-till')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    useBasketStore.getState().add(bulle, 1, 'portion:st', 'search')
    fireEvent.click(await screen.findByRole('button', { name: /^Kanelbulle, bageri/ }))
    dialog = await screen.findByRole('dialog')
    const buttons = within(dialog).getAllByRole('button').map((b) => b.textContent)
    // Huvudknappen ligger sist i sidfoten.
    expect(buttons.at(-1)).toBe('Lägg i korgen')
    expect(buttons).toContain('Lägg till direkt')
  })

  it('berättar för skärmläsare hur många träffar sökningen gav', async () => {
    renderAt('/lagg-till?maltid=fika&datum=2026-09-26')
    fireEvent.change(screen.getByPlaceholderText('Sök bland 1 000+ svenska livsmedel'), { target: { value: 'kanelbulle bageri' } })
    await waitFor(() => expect(screen.getByText(/träff(ar)? för ”kanelbulle bageri”/)).toHaveAttribute('role', 'status'), { timeout: 3000 })
    // Radens namn nämner inte längre en gest som bara finns på pekskärm.
    const row = screen.getByRole('button', { name: /^Kanelbulle, bageri/ })
    expect(row.getAttribute('aria-label')).not.toMatch(/Håll inne/)
    expect(row.getAttribute('aria-label')).toMatch(/kcal/)
  })

  it('snabbknappen lägger till direkt med förvald mängd', async () => {
    renderAt('/lagg-till?maltid=fika&datum=2026-09-26')
    fireEvent.change(screen.getByPlaceholderText('Sök bland 1 000+ svenska livsmedel'), { target: { value: 'kanelbulle bageri' } })
    const plus = await screen.findByRole('button', { name: /^Lägg till Kanelbulle, bageri direkt/ }, { timeout: 3000 })
    fireEvent.click(plus)
    const [entry] = useDiaryStore.getState().entries['2026-09-26']
    expect(entry).toMatchObject({ kind: 'food', meal: 'fika', amount: 1 })
    expect(useToastStore.getState().toasts.at(-1)?.message).toBe('Tillagt i Fika')
  })

  it('visar senaste och förslag för måltiden', () => {
    useFoodStore.setState({
      usage: { [bulle.id]: { count: 5, lastUsed: Date.now(), lastAmount: 2, lastUnit: 'portion:st', meals: { fika: 5 } } },
      customFoods: { [bulle.id]: bulle },
    })
    renderAt('/lagg-till?maltid=fika&datum=2026-09-26')
    expect(screen.getByText(/Brukar du äta till fika/)).toBeInTheDocument()
    const chip = screen.getByRole('button', { name: /Kanelbulle, 2 st \(medel, 120 g\)\. Lägg i korgen/ })
    fireEvent.click(chip)
    expect(useBasketStore.getState().items[0]).toMatchObject({ amount: 2, unit: 'portion:st', origin: 'suggestion' })
    fireEvent.click(chip)
    expect(useBasketStore.getState().items).toHaveLength(0)
  })

  it('kan kopiera måltiden från igår', () => {
    useDiaryStore.getState().addEntry({ kind: 'quick', name: 'Gröt', nutrients: { kcal: 300 }, date: '2026-09-25', meal: 'frukost' })
    renderAt('/lagg-till?maltid=frukost&datum=2026-09-26')
    fireEvent.click(screen.getByRole('button', { name: /Kopiera frukost från/ }))
    expect(useDiaryStore.getState().entries['2026-09-26']).toHaveLength(1)
  })
})

describe('FoodDetailPage', () => {
  it('visar ursprung, portionsväljare och näringsinnehåll', async () => {
    renderAt('/livsmedel/lagom%3Akanelbulle-bageri?maltid=fika&datum=2026-09-26')
    expect(await screen.findByRole('heading', { level: 1, name: 'Kanelbulle, bageri' }, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.getByText(/Lagoms svenska databas/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Tallriksmodellen' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Klimatavtryck' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Lägg till i Fika' }))
    expect(useDiaryStore.getState().entries['2026-09-26']).toHaveLength(1)
  })

  it('visar Open Food Facts som användarbidrag', async () => {
    useFoodStore.setState({ cachedFoods: { [offBar.id]: { ...offBar, extra: { nutriscore: 'c', nova: 4 } } } })
    renderAt(`/livsmedel/${encodeURIComponent(offBar.id)}`)
    expect(await screen.findByText(/användarbidrag, kontrollera mot förpackningen/)).toBeInTheDocument()
    expect(screen.getByText('Nutri-Score C')).toBeInTheDocument()
    expect(screen.getByText(/NOVA 4/)).toBeInTheDocument()
  })

  it('säger till när livsmedlet inte finns', async () => {
    renderAt('/livsmedel/lagom%3Afinns-inte')
    expect(await screen.findByText('Livsmedlet hittades inte', undefined, { timeout: 3000 })).toBeInTheDocument()
  })
})

describe('CustomFoodPage', () => {
  it('sparar ett nytt livsmedel per portion', async () => {
    const { router } = renderAt('/nytt-livsmedel?streckkod=7310865000637&namn=Proteinbar')
    expect(screen.getByLabelText('Namn')).toHaveValue('Proteinbar')
    expect(screen.getByLabelText(/Streckkod/)).toHaveValue('7310865000637')
    fireEvent.click(screen.getByRole('radio', { name: 'Per portion' }))
    fireEvent.change(screen.getByLabelText('Portionens vikt'), { target: { value: '55' } })
    fireEvent.change(screen.getByLabelText('Energi'), { target: { value: '209' } })
    fireEvent.change(screen.getByLabelText('Protein'), { target: { value: '16,5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Spara livsmedlet' }))
    const saved = Object.values(useFoodStore.getState().customFoods)
    expect(saved).toHaveLength(1)
    expect(saved[0].id).toMatch(/^custom:/)
    expect(saved[0].nutrients.kcal).toBeCloseTo(380, 0)
    expect(saved[0].nutrients.protein).toBeCloseTo(30)
    expect(saved[0].portions[0]).toMatchObject({ grams: 55 })
    await waitFor(() => expect(router.state.location.pathname).toBe(`/livsmedel/${encodeURIComponent(saved[0].id)}`))
  })

  it('kräver namn och energi', () => {
    renderAt('/nytt-livsmedel')
    fireEvent.click(screen.getByRole('button', { name: 'Spara livsmedlet' }))
    expect(screen.getByText('Ge livsmedlet ett namn.')).toBeInTheDocument()
    expect(Object.keys(useFoodStore.getState().customFoods)).toHaveLength(0)
  })

  it('har fälten i samma ordning som en svensk näringsdeklaration', () => {
    renderAt('/nytt-livsmedel')
    const order = ['Energi', 'Fett', 'varav mättat fett', 'Kolhydrat', 'varav sockerarter', 'Fiber', 'Protein', 'Salt']
    const fields = order.map((label) => screen.getByLabelText(label))
    for (let i = 1; i < fields.length; i++) {
      // Varje fält ligger efter det förra i dokumentet (och därmed i tabbordningen).
      expect(fields[i - 1].compareDocumentPosition(fields[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    // Tillsatt socker står inte på förpackningar – det ligger under "Fler näringsämnen".
    expect(screen.queryByLabelText('Tillsatt socker')).not.toBeInTheDocument()
  })

  it('varnar när energin inte stämmer med makronäringsämnena', () => {
    renderAt('/nytt-livsmedel?namn=Test')
    fireEvent.change(screen.getByLabelText('Energi'), { target: { value: '800' } })
    fireEvent.change(screen.getByLabelText('Protein'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText('Kolhydrat'), { target: { value: '20' } })
    fireEvent.change(screen.getByLabelText('Fett'), { target: { value: '5' } })
    expect(screen.getByText(/Energin stämmer inte med makronäringsämnena/)).toBeInTheDocument()
  })

  it('redigerar ett eget livsmedel', async () => {
    const own = { ...bulle, id: 'custom:bulle', source: 'custom' as const, name: 'Mormors bulle' }
    useFoodStore.setState({ customFoods: { [own.id]: own } })
    renderAt(`/livsmedel/${encodeURIComponent(own.id)}/redigera`)
    expect(screen.getByRole('heading', { level: 1, name: 'Redigera livsmedel' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Namn'), { target: { value: 'Mormors kanelbulle' } })
    fireEvent.click(screen.getByRole('button', { name: 'Spara ändringar' }))
    expect(useFoodStore.getState().customFoods[own.id].name).toBe('Mormors kanelbulle')
    expect(useFoodStore.getState().customFoods[own.id].nutrients.kcal).toBeCloseTo(345)
  })
})

describe('ScanPage', () => {
  it('erbjuder manuell inmatning när kameran inte finns', async () => {
    renderAt('/skanna?maltid=frukost&datum=2026-09-26')
    expect(await screen.findByText('Kameran stöds inte här')).toBeInTheDocument()
    const input = screen.getByLabelText(/Streckkod \(EAN\)/)
    fireEvent.change(input, { target: { value: '7310865000632' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sök produkten' }))
    expect(await screen.findByText(/Streckkoden ser inte ut att stämma/)).toBeInTheDocument()
  })

  it('hittar sparade produkter offline via streckkod', async () => {
    useFoodStore.setState({ cachedFoods: { [offBar.id]: offBar } })
    renderAt('/skanna?maltid=frukost&datum=2026-09-26')
    const input = await screen.findByLabelText(/Streckkod \(EAN\)/)
    fireEvent.change(input, { target: { value: '7310865000637' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sök produkten' }))
    })
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Proteinbar')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lägg i korgen' }))
    expect(useBasketStore.getState().items[0]).toMatchObject({ unit: 'portion:serving', origin: 'scan' })
  })
})

describe('searchAnnouncement', () => {
  it('säger antal träffar på svenska', () => {
    expect(searchAnnouncement('mjölk', 1)).toBe('1 träff för ”mjölk”')
    expect(searchAnnouncement('mjölk', 12)).toBe('12 träffar för ”mjölk”')
    expect(searchAnnouncement('xyz', 0)).toMatch(/^Inga träffar för ”xyz”/)
  })
})

describe('PortionSheet', () => {
  it('fokuserar mängden på dator så att Enter lägger till direkt', async () => {
    const onPrimary = vi.fn()
    render(
      <MemoryRouter>
        <PortionSheet food={bulle} onClose={() => {}} autoFocusAmount primary={{ label: 'Lägg till i Fika', onClick: onPrimary }} />
      </MemoryRouter>,
    )
    const amount = await screen.findByRole('spinbutton', { name: 'Mängd' })
    await waitFor(() => expect(amount).toHaveFocus())
    fireEvent.change(amount, { target: { value: '2' } })
    fireEvent.submit(amount.closest('form')!)
    expect(onPrimary).toHaveBeenCalledWith(2, 'portion:st', 120)
  })

  it('fokuserar inte mängden på pekskärm (tangentbordet ska inte fällas upp)', async () => {
    render(
      <MemoryRouter>
        <PortionSheet food={bulle} onClose={() => {}} primary={{ label: 'Lägg till', onClick: () => {} }} />
      </MemoryRouter>,
    )
    const amount = await screen.findByRole('spinbutton', { name: 'Mängd' })
    expect(amount).not.toHaveFocus()
    expect(screen.getByRole('dialog')).toHaveFocus()
  })
})

describe('BasketSheet', () => {
  it('visar okända makron som – och säger att summan är ofullständig', () => {
    useBasketStore.getState().add({ ...offBar, nutrients: { kcal: 380 } }, 1, 'portion:serving', 'search')
    render(<BasketSheet open onClose={() => {}} date="2026-09-26" meal="mellanmal" today="2026-09-26" onCommit={() => {}} onEdit={() => {}} />)
    const total = screen.getByText('Totalt').closest('div')!.parentElement!
    expect(within(total).getAllByText('–')).toHaveLength(3)
    expect(within(total).queryByText(/0 g/)).not.toBeInTheDocument()
    expect(screen.getByText(/Vissa näringsvärden saknas för 1 livsmedel/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Spara som måltid' }))
    expect(screen.getByLabelText('Namn på måltiden')).toHaveAttribute('placeholder', 'Mitt mellanmål')
  })
})

describe('NutriScoreBadge', () => {
  it('har mörk text på gult och orange, vit text på grönt och rött (kontrast i ljust läge)', () => {
    const { rerender } = render(<NutriScoreBadge score={{ grade: 'C', tone: 'sol' }} />)
    expect(screen.getByText('Nutri-Score C')).toHaveClass('text-ink')
    rerender(<NutriScoreBadge score={{ grade: 'D', tone: 'hjortron' }} />)
    expect(screen.getByText('Nutri-Score D')).toHaveClass('text-ink')
    rerender(<NutriScoreBadge score={{ grade: 'A', tone: 'mossa' }} />)
    expect(screen.getByText('Nutri-Score A')).toHaveClass('text-on-gran')
    expect(nutriScoreTextClass('lingon')).toBe('text-on-gran')
  })
})
