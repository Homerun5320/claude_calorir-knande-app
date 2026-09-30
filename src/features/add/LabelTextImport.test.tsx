/**
 * "Fyll i från förpackningen": panelen i formuläret för eget livsmedel och vägen dit från
 * skanningen när en produkt inte hittas eller saknar näringsvärden.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import CustomFoodPage from './CustomFoodPage'
import ScanPage from './ScanPage'
import { columnDescription, previewRows, scanHintPlatform, summaryText } from './LabelTextImport'
import { DialogHost } from '../../components/ui/Dialog'
import { useFoodStore } from '../../stores/foodStore'
import { useProfileStore } from '../../stores/profileStore'
import { useToastStore } from '../../components/ui/toast'
import { loadBuiltinCatalog } from '../../lib/foodRepo'
import { parseNutritionLabel } from '../../lib/nutritionLabel'
import { offBar } from './testFoods'

const LABEL = `Näringsvärde   per 100 g   per portion (30 g)   %RI*
Energi   1550 kJ / 370 kcal   465 kJ / 111 kcal   6 %
Fett   12 g   3,6 g   5 %
varav mättat fett   3,5 g   1,1 g   5 %
Kolhydrat   55 g   17 g   6 %
varav sockerarter   20 g   6,0 g   7 %
Fiber   6,0 g   1,8 g
Protein   8,0 g   2,4 g   5 %
Salt   0,50 g   0,15 g   3 %
*Referensintag för en genomsnittlig vuxen (8 400 kJ/2 000 kcal)`

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/', element: <div>Hem</div> },
      { path: '/skanna', element: <ScanPage /> },
      { path: '/livsmedel/:id', element: <div>Detaljsidan</div> },
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

const textArea = () => screen.getByLabelText('Näringsdeklarationen som text')

function interpret(text: string) {
  fireEvent.change(textArea(), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Tolka' }))
}

beforeAll(async () => {
  // Nätet är nere i testerna: Open Food Facts svarar inte och katalogen är Lagoms egen.
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'))
  await loadBuiltinCatalog()
})

beforeEach(() => {
  useFoodStore.setState({ usage: {}, cachedFoods: {}, customFoods: {}, favorites: [], templates: [], recipes: {} })
  useToastStore.setState({ toasts: [] })
  useProfileStore.setState((s) => ({ settings: { ...s.settings, mindfulMode: false, energyUnit: 'kcal' } }))
})

describe('Fyll i från förpackningen i formuläret', () => {
  it('tolkar texten, visar förhandsvisningen och fyller i formuläret – användaren sparar själv', async () => {
    const { router } = renderAt('/nytt-livsmedel?streckkod=7310865000637&etikett=1')
    // Öppen direkt med etikett=1, med förklaringen för iPhone och Android.
    expect(screen.getByRole('button', { name: /Fyll i från förpackningen/ })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(/På Android: kopiera texten med kamerans textigenkänning/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tolka' })).toBeDisabled()

    interpret(LABEL)
    // (Testing Library gör om hårda mellanslag till vanliga.)
    const preview = screen.getByLabelText('Tolkade värden')
    expect(within(preview).getByText('1 550 kJ / 370 kcal')).toBeInTheDocument()
    expect(within(preview).getByText('varav mättat fett').nextElementSibling).toHaveTextContent('3,5 g')
    expect(screen.getByText('Lagom hittade 8 värden')).toBeInTheDocument()
    expect(screen.getByText(/· Per 100\sg/)).toBeInTheDocument()

    // Inget är ifyllt förrän man trycker på knappen.
    expect(screen.getByLabelText('Energi')).toHaveValue('')
    fireEvent.click(screen.getByRole('button', { name: 'Fyll i formuläret' }))
    expect(screen.getByLabelText('Energi')).toHaveValue('370')
    expect(screen.getByLabelText('Fett')).toHaveValue('12')
    expect(screen.getByLabelText('varav mättat fett')).toHaveValue('3,5')
    expect(screen.getByLabelText('Salt')).toHaveValue('0,5')
    expect(screen.getByLabelText(/Streckkod/)).toHaveValue('7310865000637')
    expect(useToastStore.getState().toasts.at(-1)?.message).toBe('Värdena är ifyllda – granska dem och spara.')
    expect(Object.keys(useFoodStore.getState().customFoods)).toHaveLength(0)

    fireEvent.change(screen.getByLabelText('Namn'), { target: { value: 'Müslibar' } })
    fireEvent.click(screen.getByRole('button', { name: 'Spara livsmedlet' }))
    const saved = Object.values(useFoodStore.getState().customFoods)
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ name: 'Müslibar', barcode: '7310865000637' })
    expect(saved[0].nutrients).toMatchObject({ kcal: 370, fat: 12, satFat: 3.5, carbs: 55, sugars: 20, fiber: 6, protein: 8, salt: 0.5 })
    // Portionen i kolumnrubriken blev ett mått.
    expect(saved[0].portions).toEqual([expect.objectContaining({ label: '1 portion', grams: 30 })])
    await waitFor(() => expect(router.state.location.pathname).toBe(`/livsmedel/${encodeURIComponent(saved[0].id)}`))
  })

  it('är stängd utan etikett=1 och öppnas med knappen', () => {
    renderAt('/nytt-livsmedel')
    const toggle = screen.getByRole('button', { name: /Fyll i från förpackningen/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByLabelText('Näringsdeklarationen som text')).not.toBeInTheDocument()
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(textArea()).toBeInTheDocument()
  })

  it('säger till när inget hittades', () => {
    renderAt('/nytt-livsmedel?etikett=1')
    interpret('Förvaras torrt. Bäst före se förpackningen.')
    expect(screen.getByText(/Lagom hittade inga näringsvärden i texten/, { selector: 'p:not(.sr-only)' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Fyll i formuläret' })).not.toBeInTheDocument()
  })

  it('visar "–" för okända värden, varningar och det som inte gick att tolka', () => {
    renderAt('/nytt-livsmedel?etikett=1')
    interpret(`Energi 1550 kJ/370 kcal
Fett 30 g
Kolhydrat 55 g
varav laktos 4,7 g
Protein 8 g`)
    const dl = screen.getByLabelText('Tolkade värden')
    expect(within(dl).getByText('Fiber').nextElementSibling).toHaveTextContent('–')
    expect(within(dl).getByText('Salt').nextElementSibling).toHaveTextContent('–')
    expect(screen.getByText(/Texten säger inte om värdena gäller per 100/)).toBeInTheDocument()
    expect(screen.getByText(/Energin stämmer inte med fett, kolhydrater och protein/)).toBeInTheDocument()
    expect(screen.getByText('Kunde inte tolkas')).toBeInTheDocument()
    expect(screen.getByText('varav laktos 4,7 g')).toBeInTheDocument()
    // Okända fält fylls inte i som 0.
    fireEvent.click(screen.getByRole('button', { name: 'Fyll i formuläret' }))
    expect(screen.getByLabelText('Fiber')).toHaveValue('')
    expect(screen.getByLabelText('Salt')).toHaveValue('')
  })

  it('en ny text kräver en ny tolkning, och Rensa lämnar fokus i textrutan', () => {
    renderAt('/nytt-livsmedel?etikett=1')
    interpret(LABEL)
    expect(screen.getByRole('button', { name: 'Fyll i formuläret' })).toBeInTheDocument()
    fireEvent.change(textArea(), { target: { value: `${LABEL}\nmer text` } })
    expect(screen.queryByRole('button', { name: 'Fyll i formuläret' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Rensa' }))
    expect(textArea()).toHaveValue('')
    expect(textArea()).toHaveFocus()
  })

  it('läser upp resultatet igen när samma text tolkas en gång till', async () => {
    const { container } = renderAt('/nytt-livsmedel?etikett=1')
    const live = container.querySelector('[aria-live="polite"].sr-only') as HTMLElement
    interpret(LABEL)
    await waitFor(() => expect(live).toHaveTextContent('Lagom hittade 8 värden'))
    fireEvent.click(screen.getByRole('button', { name: 'Tolka' }))
    // Töms först, så att skärmläsaren läser upp samma text igen.
    expect(live).toHaveTextContent('')
    await waitFor(() => expect(live).toHaveTextContent('Lagom hittade 8 värden'))
  })

  it('per portion med vikt: fylls i som på förpackningen och notisen stängs när man sparar', async () => {
    const { router } = renderAt('/nytt-livsmedel?namn=Bar&etikett=1')
    interpret('Näringsvärde per bar (40 g): Energi 836 kJ / 200 kcal, Fett 8 g, Kolhydrat 18 g, Protein 16 g')
    expect(screen.getByText(/· Per bar \(40\sg\)/)).toBeInTheDocument()
    expect(within(screen.getByLabelText('Tolkade värden')).getByText('Fett').nextElementSibling).toHaveTextContent('8 g')
    fireEvent.click(screen.getByRole('button', { name: 'Fyll i formuläret' }))
    expect(screen.getByRole('radio', { name: 'Per portion' })).toBeChecked()
    expect(screen.getByLabelText('Portionens vikt')).toHaveValue('40')
    expect(screen.getByLabelText(/Portionens namn/)).toHaveValue('1 bar')
    expect(screen.getByLabelText('Fett')).toHaveValue('8')
    expect(useToastStore.getState().toasts.map((t) => t.message)).toContain('Värdena är ifyllda – granska dem och spara.')
    fireEvent.click(screen.getByRole('button', { name: 'Spara livsmedlet' }))
    const saved = Object.values(useFoodStore.getState().customFoods)
    expect(saved[0].nutrients).toMatchObject({ kcal: 500, fat: 20, carbs: 45, protein: 40 })
    expect(saved[0].portions).toEqual([expect.objectContaining({ label: '1 bar', grams: 40 })])
    expect(useToastStore.getState().toasts.map((t) => t.message)).toEqual(['Sparat bland dina livsmedel'])
    await waitFor(() => expect(router.state.location.pathname).toBe(`/livsmedel/${encodeURIComponent(saved[0].id)}`))
  })

  it('det som ska kontrolleras kan döljas', () => {
    renderAt('/nytt-livsmedel?etikett=1')
    interpret('Energi 1550 kJ/370 kcal\nFett 12 g\nProtein 8 g')
    fireEvent.click(screen.getByRole('button', { name: 'Fyll i formuläret' }))
    expect(screen.getByText('Att kontrollera mot förpackningen')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Dölj det som ska kontrolleras' }))
    expect(screen.queryByText('Att kontrollera mot förpackningen')).not.toBeInTheDocument()
  })

  it('per portion utan vikt: formuläret ställs på "Per portion", varningen står kvar och fokus går till vikten', async () => {
    renderAt('/nytt-livsmedel?namn=Proteinbar&etikett=1')
    interpret('Per portion: Energi 200 kcal, Fett 8 g, Kolhydrat 18 g, Protein 16 g')
    expect(screen.getByText(/portionens vikt står inte i texten/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Fyll i formuläret' }))
    expect(screen.getByRole('radio', { name: 'Per portion' })).toBeChecked()
    expect(screen.getByLabelText('Energi')).toHaveValue('200')
    // Varningarna från förhandsvisningen står kvar i formuläret, där man granskar.
    const check = screen.getByText('Att kontrollera mot förpackningen').closest('[role="status"]') as HTMLElement
    expect(within(check).getByText(/portionens vikt står inte i texten/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Portionens vikt')).toHaveFocus())
    fireEvent.click(screen.getByRole('button', { name: 'Spara livsmedlet' }))
    expect(screen.getByText('Ange hur mycket en portion väger.')).toBeInTheDocument()
    expect(Object.keys(useFoodStore.getState().customFoods)).toHaveLength(0)
  })

  it('öppnar övriga näringsämnen när etiketten har vitaminer', () => {
    renderAt('/nytt-livsmedel?etikett=1')
    interpret('Näringsvärde per 100 ml: Energi 197 kJ/47 kcal, Fett 1,5 g, Kolhydrat 6,7 g, Protein 1,0 g, Vitamin D 1,1 µg')
    fireEvent.click(screen.getByRole('button', { name: 'Fyll i formuläret' }))
    expect(screen.getByLabelText('Vitamin D')).toHaveValue('1,1')
    expect(screen.getByRole('switch', { name: /Flytande/ })).toBeChecked()
  })
})

describe('Förhandsvisningens texter', () => {
  it('beskriver kolumnen och sammanfattar för skärmläsare', () => {
    const r = parseNutritionLabel(LABEL)
    expect(columnDescription(r)).toBe('Per 100\u00a0g')
    expect(summaryText(r)).toBe('Lagom hittade 8 värden, per 100\u00a0g.')
    const portion = parseNutritionLabel('Per portion (40 g): Energi 200 kcal, Fett 8 g, Protein 16 g, Kolhydrat 18 g')
    expect(columnDescription(portion)).toBe('Per portion (40\u00a0g)')
    expect(columnDescription(parseNutritionLabel('Per bar: Energi 200 kcal, Fett 8 g'))).toBe('Per bar – portionens vikt saknas')
    expect(columnDescription(parseNutritionLabel('Per 100 g pulver per 100 ml tillagad\nEnergi 1600 kJ/380 kcal 280 kJ/67 kcal'))).toBe('Per 100\u00a0g pulver')
    expect(summaryText(parseNutritionLabel('hej'))).toBe('Lagom hittade inga näringsvärden i texten.')
  })

  it('visar huvudraderna i deklarationens ordning och övriga som hittades', () => {
    const r = parseNutritionLabel('Per 100 g: Energi 1550 kJ, Fett 12 g, varav mättat fett 3 g, varav enkelomättat fett 5 g, Kalcium 120 mg')
    const rows = previewRows(r.per100!)
    expect(rows.map((x) => x.label)).toEqual([
      'Energi',
      'Fett',
      'varav mättat fett',
      'varav enkelomättat fett',
      'Kolhydrat',
      'varav sockerarter',
      'Fiber',
      'Protein',
      'Salt',
      'Kalcium',
    ])
    expect(rows[0].value.replace(/\s/g, ' ')).toBe('1 550 kJ (≈ 370 kcal)')
    expect(rows.find((x) => x.label === 'Kolhydrat')?.value).toBe('–')
    expect(rows.find((x) => x.label === 'Kalcium')?.value).toBe('120 mg')
  })

  it('visar talen som på förpackningen – samma precision som i formuläret', () => {
    const r = parseNutritionLabel('Per 100 ml: Energi 197 kJ/47 kcal, Fett 1,25 g, Vitamin D 0,75 µg')
    const rows = previewRows(r.stated)
    expect(rows.find((x) => x.label === 'Fett')?.value).toBe('1,25 g')
    expect(rows.find((x) => x.label === 'Vitamin D')?.value).toBe('0,75 µg')
  })
})

describe('Från skanningen', () => {
  it('en streckkod som inte hittas leder till formuläret med streckkoden och panelen öppen', async () => {
    const { router } = renderAt('/skanna?maltid=frukost&datum=2026-09-26')
    const input = await screen.findByLabelText(/Streckkod \(EAN\)/)
    fireEvent.change(input, { target: { value: '7310865000637' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sök produkten' }))
    })
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('button', { name: 'Skapa eget livsmedel' })).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fyll i från förpackningen' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/nytt-livsmedel'))
    const params = new URLSearchParams(router.state.location.search)
    expect(params.get('streckkod')).toBe('7310865000637')
    expect(params.get('etikett')).toBe('1')
    expect(params.get('maltid')).toBe('frukost')
    expect(await screen.findByLabelText('Näringsdeklarationen som text')).toBeInTheDocument()
    expect(screen.getByLabelText(/Streckkod/)).toHaveValue('7310865000637')
    // Panelen står först, direkt under rubriken – inte nedanför Grunduppgifter.
    const panel = screen.getByRole('region', { name: 'Fyll i från förpackningen' })
    const basics = screen.getByRole('heading', { name: 'Grunduppgifter' })
    expect(panel.compareDocumentPosition(basics) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('en produkt utan näringsvärden får en länk till samma panel', async () => {
    const empty = { ...offBar, nutrients: {} }
    useFoodStore.setState({ cachedFoods: { [empty.id]: empty } })
    renderAt('/skanna?maltid=frukost&datum=2026-09-26')
    const input = await screen.findByLabelText(/Streckkod \(EAN\)/)
    fireEvent.change(input, { target: { value: '7310865000637' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sök produkten' }))
    })
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Näringsvärden saknas för den här produkten/)).toBeInTheDocument()
    const link = within(dialog).getByRole('link', { name: 'Fyll i från förpackningen' })
    const href = new URL(link.getAttribute('href') ?? '', 'https://lagom.test')
    expect(href.pathname).toBe('/nytt-livsmedel')
    expect(href.searchParams.get('kopia')).toBe(offBar.id)
    expect(href.searchParams.get('streckkod')).toBe('7310865000637')
    expect(href.searchParams.get('etikett')).toBe('1')
    expect(within(dialog).getByRole('link', { name: 'Komplettera värdena' })).toBeInTheDocument()
  })
})

describe('förklaringen för textigenkänningen', () => {
  const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36'
  const DESKTOP_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36'

  it('apparna nämner bara sin egen plattform (App Store-riktlinje 2.3.10)', () => {
    expect(scanHintPlatform('appstore', false, ANDROID_UA)).toBe('ios')
    expect(scanHintPlatform('play', true, DESKTOP_UA)).toBe('android')
  })

  it('webben väljer efter enheten och visar båda på datorn', () => {
    expect(scanHintPlatform('web', true, DESKTOP_UA)).toBe('ios')
    expect(scanHintPlatform('web', false, ANDROID_UA)).toBe('android')
    expect(scanHintPlatform('web', false, DESKTOP_UA)).toBe('both')
  })
})
