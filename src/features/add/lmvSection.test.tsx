/**
 * Livsmedelsverkets fullständiga databas blandas inte in bland huvudträffarna: den visas i en egen,
 * hopfälld sektion "Fler från Livsmedelsverket" (utfälld när huvudträffarna är få), och råa poster
 * och specialposter döljs där om inte sökningen själv frågar efter dem. Samlingsvärden hänvisar
 * till streckkoden för ett visst märke.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import type { Food } from '../../types'
import AddFoodPage, { searchAnnouncement } from './AddFoodPage'
import FoodDetailPage from './FoodDetailPage'
import { loadBuiltinCatalog } from '../../lib/foodRepo'
import { isHiddenLmvFood, useFoodSearch } from '../../hooks/useFoodSearch'
import { useFoodStore } from '../../stores/foodStore'
import { useProfileStore } from '../../stores/profileStore'
import { useBasketStore } from './basketStore'

const lmv = (n: number, name: string, category = 'fisk') => ({
  id: `lmv:${n}`,
  name,
  category,
  nutrients: { kcal: 120, protein: 20, carbs: 0, fat: 4.5 },
})

const LMV_DATASET = {
  meta: { source: 'Livsmedelsverket', version: '2026-01-01' },
  foods: [
    lmv(900001, 'Kvastfening grillad'),
    lmv(900002, 'Kvastfening panerad stekt'),
    lmv(900003, 'Kvastfening rå'),
    lmv(900004, 'Barnmat kvastfening m. potatis konserv.', 'fardigratt'),
    lmv(900005, 'Kvastfeninglever stekt'),
    // Många dolda poster före den synliga – de ska inte tränga undan den (receptväljaren visar 8).
    ...Array.from({ length: 20 }, (_, i) => lmv(900100 + i, `Snurrbär ${i + 1} rå`, 'bar')),
    lmv(900200, 'Snurrbär sylt', 'bar'),
  ],
}

/** En post från Livsmedelsverket som den sparas av importen i Inställningar. */
const savedLmv = (n: number, name: string, extra: Partial<Food> = {}): Food => ({
  id: `lmv:${n}`,
  name,
  source: 'livsmedelsverket',
  category: 'fisk',
  nutrients: { kcal: 120, protein: 20, carbs: 0, fat: 4.5 },
  portions: [],
  lmvNumber: n,
  ...extra,
})

const custom = (id: string, name: string, extra: Partial<Food> = {}): Food => ({
  id: `custom:${id}`,
  name,
  source: 'custom',
  category: 'fisk',
  nutrients: { kcal: 110, protein: 20, carbs: 0, fat: 3 },
  portions: [],
  ...extra,
})

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/lagg-till', element: <AddFoodPage /> },
      { path: '/skanna', element: <div>Skanna</div> },
      { path: '/livsmedel/:id', element: <FoodDetailPage /> },
    ],
    { initialEntries: [path] },
  )
  return { router, ...render(<RouterProvider router={router} />) }
}

const search = () => screen.getByPlaceholderText('Sök bland 1 000+ svenska livsmedel')

beforeAll(async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    async () => new Response(JSON.stringify(LMV_DATASET), { status: 200, headers: { 'Content-Type': 'application/json' } }),
  )
  const cat = await loadBuiltinCatalog()
  expect(cat.lmv?.count).toBe(LMV_DATASET.foods.length)
})

beforeEach(() => {
  useFoodStore.setState({ usage: {}, cachedFoods: {}, customFoods: {}, favorites: [], templates: [], recipes: {} })
  useBasketStore.setState({ items: [] })
  useProfileStore.setState((s) => ({ settings: { ...s.settings, mindfulMode: false, energyUnit: 'kcal' } }))
})

describe('isHiddenLmvFood', () => {
  it('döljer råa poster, barnmat, välling och inälvor som sökningen inte frågar efter', () => {
    expect(isHiddenLmvFood({ name: 'Kyckling filé rå' }, 'kyckling')).toBe(true)
    expect(isHiddenLmvFood({ name: 'Gris blod rått' }, 'gris')).toBe(true)
    expect(isHiddenLmvFood({ name: 'Nöt lever stekt m. salt' }, 'nöt')).toBe(true)
    expect(isHiddenLmvFood({ name: 'Grislever stekt m. salt' }, 'gris')).toBe(true)
    expect(isHiddenLmvFood({ name: 'Nöt oxtunga rimmad kokt' }, 'nöt')).toBe(true)
    expect(isHiddenLmvFood({ name: 'Kyckling mage rå' }, 'kyckling mage')).toBe(true) // "rå" frågas inte efter
    expect(isHiddenLmvFood({ name: 'Havrevälling hemlagad' }, 'havre')).toBe(true)
    expect(isHiddenLmvFood({ name: 'Barnmat fiskgryta konserv.' }, 'fiskgryta')).toBe(true)
    expect(isHiddenLmvFood({ name: 'Modersmjölksersättning' }, 'mjölk')).toBe(true)
  })

  it('visar dem när sökningen innehåller ordet – även utan å/ä/ö', () => {
    expect(isHiddenLmvFood({ name: 'Kyckling filé rå' }, 'kyckling rå')).toBe(false)
    expect(isHiddenLmvFood({ name: 'Kyckling filé rå' }, 'kyckling ra')).toBe(false)
    expect(isHiddenLmvFood({ name: 'Nöt lever stekt m. salt' }, 'lever')).toBe(false)
    expect(isHiddenLmvFood({ name: 'Grislever stekt m. salt' }, 'grislever')).toBe(false)
    expect(isHiddenLmvFood({ name: 'Havrevälling hemlagad' }, 'valling')).toBe(false)
    expect(isHiddenLmvFood({ name: 'Barnmat fiskgryta konserv.' }, 'barnmat')).toBe(false)
    expect(isHiddenLmvFood({ name: 'Kyckling mage rå' }, 'kyckling mage rå')).toBe(false)
  })

  it('döljer okokt pasta och ris och torkade baljväxter – men inte torkad frukt eller kokta baljväxter', () => {
    expect(isHiddenLmvFood({ name: 'Ris jasmin okokt', category: 'pasta_ris' }, 'ris')).toBe(true)
    expect(isHiddenLmvFood({ name: 'Pasta okokt', category: 'pasta_ris' }, 'pasta okokt')).toBe(false)
    expect(isHiddenLmvFood({ name: 'Linser torkade', category: 'baljvaxter' }, 'linser')).toBe(true)
    expect(isHiddenLmvFood({ name: 'Linser torkade', category: 'baljvaxter' }, 'linser torkade')).toBe(false)
    expect(isHiddenLmvFood({ name: 'Röda linser torkade kokta m. salt', category: 'baljvaxter' }, 'linser')).toBe(false)
    expect(isHiddenLmvFood({ name: 'Aprikos torkad', category: 'frukt' }, 'aprikos')).toBe(false)
  })

  it('låter vanlig mat vara – "mager", leverpastej och blodpudding är inga inälvor', () => {
    expect(isHiddenLmvFood({ name: 'Potatisgratäng m. lättmjölk ost mager hemlagad' }, 'potatisgratäng')).toBe(false)
    expect(isHiddenLmvFood({ name: 'Leverpastej bredbar fett ca 10 %' }, 'pastej')).toBe(false)
    expect(isHiddenLmvFood({ name: 'Blodpudding blodkorv stekt fett 8 %' }, 'blodpudding')).toBe(false)
    expect(isHiddenLmvFood({ name: 'Råris' }, 'ris')).toBe(false)
    expect(isHiddenLmvFood({ name: 'Kvastfening grillad' }, 'kvastfening')).toBe(false)
    // "Fromage" slutar på "mage" men är en dessert.
    expect(isHiddenLmvFood({ name: 'Fromage citron' }, 'citron')).toBe(false)
    expect(isHiddenLmvFood({ name: 'Fromage apelsin el. citron hemlagad' }, 'dessert')).toBe(false)
  })
})

describe('useFoodSearch – huvudträffar och Livsmedelsverket', () => {
  const ids = (list: { food: Food }[]) => list.map((r) => r.food.id)

  it('lägger Livsmedelsverkets poster i en egen lista och döljer råa och specialposter', async () => {
    const { result, rerender } = renderHook(({ q }) => useFoodSearch(q), { initialProps: { q: 'kvastfening' } })
    await waitFor(() => expect(result.current.pending).toBe(false))
    expect(ids(result.current.results).some((id) => id.startsWith('lmv:'))).toBe(false)
    expect(ids(result.current.lmvResults).sort()).toEqual(['lmv:900001', 'lmv:900002'])

    rerender({ q: 'kvastfening rå' })
    await waitFor(() => expect(ids(result.current.lmvResults)).toContain('lmv:900003'))
    expect(ids(result.current.lmvResults)).not.toContain('lmv:900004')

    rerender({ q: 'kvastfeninglever' })
    await waitFor(() => expect(ids(result.current.lmvResults)).toContain('lmv:900005'))
  })

  it('låter inte dolda poster tränga undan synliga när bara ett fåtal visas', async () => {
    const { result } = renderHook(() => useFoodSearch('snurrbär', { limit: 8 }))
    await waitFor(() => expect(ids(result.current.lmvResults)).toEqual(['lmv:900200']))
  })

  it('håller sparade poster från Livsmedelsverket (import i Inställningar) utanför huvudträffarna', async () => {
    const saved = [
      savedLmv(900001, 'Kvastfening grillad'),
      savedLmv(900003, 'Kvastfening rå'),
      // Finns inte i datafilen – visas i sektionen, men inte som dubblett av en kurerad rad.
      savedLmv(900300, 'Kvastfening rökt'),
      savedLmv(900301, 'Kvastfening länkad', { lmvNumber: 1317 }),
    ]
    useFoodStore.setState({ cachedFoods: Object.fromEntries(saved.map((f) => [f.id, f])) })
    const { result } = renderHook(() => useFoodSearch('kvastfening'))
    await waitFor(() => expect(result.current.pending).toBe(false))
    await waitFor(() => expect(ids(result.current.lmvResults)).toContain('lmv:900300'))
    expect(ids(result.current.results).some((id) => id.startsWith('lmv:'))).toBe(false)
    expect(ids(result.current.lmvResults).sort()).toEqual(['lmv:900001', 'lmv:900002', 'lmv:900300'])
  })

  it('visar inte en använd post som ett kurerat livsmedel länkar till som dubblett', async () => {
    // Lax (lagom:lax-odlad-ugnsbakad) länkar till Livsmedelsverkets nr 1317.
    const linked = savedLmv(1317, 'Lax kokt m. salt')
    useFoodStore.setState({
      cachedFoods: { [linked.id]: linked },
      favorites: [linked.id],
      usage: { [linked.id]: { count: 3, lastUsed: Date.now(), lastAmount: 100, lastUnit: 'g', meals: { middag: 3 } } },
    })
    const { result } = renderHook(() => useFoodSearch('lax'))
    await waitFor(() => expect(ids(result.current.results)).toContain('lagom:lax-odlad-ugnsbakad'))
    expect(ids(result.current.results)).not.toContain('lmv:1317')
    expect(ids(result.current.lmvResults)).not.toContain('lmv:1317')
  })

  it('hittar Lagoms tillagade rad när man skriver "rå" eller "okokt"', async () => {
    const { result, rerender } = renderHook(({ q }) => useFoodSearch(q), { initialProps: { q: 'nötfärs rå' } })
    await waitFor(() => expect(result.current.pending).toBe(false))
    await waitFor(() => expect(result.current.results[0]?.food.id).toBe('lagom:notfars-12-stekt'))
    // Inga orelaterade rader som bara matchar ordet "rå".
    expect(result.current.results.map((r) => r.food.name)).not.toContain('Råkost')
    rerender({ q: 'pasta okokt' })
    await waitFor(() => expect(result.current.results[0]?.food.id).toBe('lagom:pasta-vete-kokt'))
  })

  it('visar bara huvudträffar när man bläddrar i en kategori', () => {
    const { result } = renderHook(() => useFoodSearch('', { categories: ['fisk'] }))
    expect(result.current.results.length).toBeGreaterThan(0)
    expect(ids(result.current.results).some((id) => id.startsWith('lmv:'))).toBe(false)
    expect(result.current.lmvResults).toEqual([])
  })

  it('räknar en post från Livsmedelsverket som man redan använt till huvudträffarna', async () => {
    useFoodStore.setState({ usage: { 'lmv:900001': { count: 2, lastUsed: Date.now(), lastAmount: 100, lastUnit: 'g', meals: { middag: 2 } } } })
    const { result } = renderHook(() => useFoodSearch('kvastfening'))
    await waitFor(() => expect(result.current.pending).toBe(false))
    expect(ids(result.current.results)).toEqual(['lmv:900001'])
    expect(ids(result.current.lmvResults)).toEqual(['lmv:900002'])
  })
})

describe('AddFoodPage – "Fler från Livsmedelsverket"', () => {
  it('fäller ut sektionen när huvudträffarna är få', async () => {
    renderAt('/lagg-till?maltid=middag&datum=2026-09-26')
    fireEvent.change(search(), { target: { value: 'kvastfening' } })
    const toggle = await screen.findByRole('button', { name: /Fler från Livsmedelsverket/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(toggle.className).toMatch(/min-h-11/)
    expect(toggle).toHaveAccessibleName('Fler från Livsmedelsverket, 2 träffar')
    expect(screen.getByRole('button', { name: /^Kvastfening grillad/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Kvastfening rå/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/Inga träffar/)).not.toBeInTheDocument()
  })

  it('är hopfälld när det finns många huvudträffar och går att fälla ut', async () => {
    useFoodStore.setState({
      customFoods: Object.fromEntries(
        [custom('a', 'Kvastfening hemmagjord'), custom('b', 'Kvastfening på burk'), custom('c', 'Kvastfening gravad')].map((f) => [f.id, f]),
      ),
    })
    renderAt('/lagg-till?maltid=middag&datum=2026-09-26')
    fireEvent.change(search(), { target: { value: 'kvastfening' } })
    await screen.findByRole('button', { name: /^Kvastfening gravad/ }, { timeout: 3000 })
    const toggle = await screen.findByRole('button', { name: /Fler från Livsmedelsverket/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: /^Kvastfening grillad/ })).not.toBeInTheDocument()
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: /^Kvastfening grillad/ })).toBeInTheDocument()
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('föreslår streckkoden när översta träffen är ett samlingsvärde', async () => {
    const snitt = custom('snitt', 'Kvastfeningdryck', { isAverage: true, category: 'vaxtdryck' })
    useFoodStore.setState({ customFoods: { [snitt.id]: snitt } })
    const { router } = renderAt('/lagg-till?maltid=frukost&datum=2026-09-26')
    fireEvent.change(search(), { target: { value: 'kvastfeningdryck' } })
    const row = await screen.findByRole('button', { name: /^Kvastfeningdryck, samlingsvärde/ }, { timeout: 3000 })
    expect(within(row.closest('li')!).getByText('Snitt')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Letar du efter ett visst märke? Skanna streckkoden' })
    expect(link).toHaveAttribute('href', '/skanna?maltid=frukost&datum=2026-09-26')
    fireEvent.click(link)
    await waitFor(() => expect(router.state.location.pathname).toBe('/skanna'))
    expect(router.state.location.search).toBe('?maltid=frukost&datum=2026-09-26')
  })

  it('visar ingen streckkodsrad för vanliga träffar', async () => {
    renderAt('/lagg-till?maltid=fika&datum=2026-09-26')
    fireEvent.change(search(), { target: { value: 'kanelbulle' } })
    await screen.findByRole('button', { name: /^Kanelbulle, 1 st \(bageri/ }, { timeout: 3000 })
    expect(screen.queryByText(/Letar du efter ett visst märke/)).not.toBeInTheDocument()
  })

  it('berättar om båda grupperna för skärmläsare', () => {
    expect(searchAnnouncement('lax', 2, 5)).toBe('2 träffar för ”lax” och 5 till från Livsmedelsverket')
    expect(searchAnnouncement('kvastfening', 0, 1)).toBe('1 träff från Livsmedelsverket för ”kvastfening”')
    expect(searchAnnouncement('lax', 1)).toBe('1 träff för ”lax”')
  })
})

describe('FoodDetailPage – samlingsvärde och rå vikt', () => {
  it('förklarar samlingsvärdet och länkar till streckkoden', async () => {
    const snitt = custom('havre', 'Havredryck test', {
      isAverage: true,
      category: 'vaxtdryck',
      note: 'Samlingsvärde: genomsnitt av vanliga märken (t.ex. Oatly, Planti, Garant). Skanna streckkoden för exakta värden för ditt märke.',
    })
    useFoodStore.setState({ customFoods: { [snitt.id]: snitt } })
    renderAt(`/livsmedel/${encodeURIComponent(snitt.id)}?maltid=frukost&datum=2026-09-26`)
    const box = await screen.findByRole('note', { name: 'Samlingsvärde' })
    // Rubriken "Samlingsvärde" upprepas inte i texten under den.
    expect(within(box).getByText(/^Genomsnitt av vanliga märken \(t\.ex\. Oatly/)).toBeInTheDocument()
    expect(within(box).queryByText(/Samlingsvärde:/)).not.toBeInTheDocument()
    expect(within(box).getByRole('link', { name: 'Skanna streckkod' })).toHaveAttribute('href', '/skanna?maltid=frukost&datum=2026-09-26')
    // Förklaringen står bara en gång.
    expect(screen.getAllByText(/enomsnitt av vanliga märken \(t\.ex\. Oatly/)).toHaveLength(1)
  })

  it('anger källan rätt för samlingsvärden med och utan Livsmedelsverkets värde', async () => {
    const { unmount } = renderAt('/livsmedel/lagom%3Ahavredryck-berikad-1-5')
    expect(await screen.findByRole('heading', { level: 1, name: 'Havredryck' }, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.getByText(/^Samlingsvärde med Livsmedelsverkets värde för produkttypen \(nr 700\)/)).toBeInTheDocument()
    unmount()
    renderAt('/livsmedel/lagom%3Agranola')
    expect(await screen.findByRole('heading', { level: 1, name: 'Granola' }, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.getByText('Samlingsvärde från Lagom – genomsnitt av vanliga märken i svenska butiker.')).toBeInTheDocument()
    expect(screen.queryByText(/^Värden från Lagoms svenska databas/)).not.toBeInTheDocument()
  })

  it('beskriver ett inbyggt samlingsvärde med länk till Livsmedelsverket som Lagoms genomsnitt', async () => {
    renderAt('/livsmedel/lagom%3Amusli-sotad?maltid=frukost&datum=2026-09-26')
    expect(await screen.findByRole('heading', { level: 1, name: 'Müsli' }, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.getByText(/^Samlingsvärde från Lagom, kompletterat med Livsmedelsverkets livsmedelsdatabas \(nr \d+\)/)).toBeInTheDocument()
    expect(screen.queryByText(/^Värden från Livsmedelsverkets livsmedelsdatabas/)).not.toBeInTheDocument()
    expect(screen.getByRole('note', { name: 'Samlingsvärde' })).toBeInTheDocument()
  })

  it('berättar att man kan väga rått', async () => {
    const kyckling = custom('kyckling', 'Kycklingbröst test', { category: 'fagel', rawWeight: { factor: 0.75, kind: 'ra' } })
    useFoodStore.setState({ customFoods: { [kyckling.id]: kyckling } })
    renderAt(`/livsmedel/${encodeURIComponent(kyckling.id)}`)
    expect(
      await screen.findByText(/Värdena gäller tillagad vara\. Väger du rått kan du välja ”g rå” när du lägger till/),
    ).toHaveTextContent('(1 g rå ≈ 0,75 g tillagat)')
    expect(screen.queryByRole('note', { name: 'Samlingsvärde' })).not.toBeInTheDocument()
  })
})
