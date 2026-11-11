/**
 * Korglisten: visas bara med innehåll, och så länge den finns håller den fokuserade livsmedel
 * ovanför sig med scroll-padding på <html> (WCAG 2.4.11 – annars skymmer den fokus).
 */
import { act, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MotionGlobalConfig } from 'motion/react'
import { BasketBar } from './Basket'
import { useBasketStore } from './basketStore'
import { useProfileStore } from '../../stores/profileStore'
import { bulle } from './testFoods'

MotionGlobalConfig.skipAnimations = true

const html = document.documentElement

function renderBar() {
  return render(
    <MemoryRouter>
      <BasketBar meal="frukost" onOpen={() => {}} onCommit={() => {}} />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useBasketStore.setState({ items: [] })
  useProfileStore.setState((s) => ({ settings: { ...s.settings, mindfulMode: false, energyUnit: 'kcal' } }))
  html.style.scrollPaddingBottom = ''
  // jsdom har ingen layout – den fasta korglisten (76 px hög i verkligheten) får en höjd här.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const height = this.classList.contains('fixed') ? 76 : 0
    return { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: height, width: 0, height, toJSON: () => ({}) }
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  html.style.scrollPaddingBottom = ''
})

describe('BasketBar', () => {
  it('visas inte och rör inte scroll-padding när korgen är tom', () => {
    renderBar()
    expect(screen.queryByRole('button', { name: /^Visa korgen/ })).not.toBeInTheDocument()
    expect(html.style.scrollPaddingBottom).toBe('')
  })

  it('håller fokus ovanför listan så länge korgen har något i sig, och släpper det när korgen töms', async () => {
    useBasketStore.getState().add(bulle, 1, 'portion:st', 'search')
    renderBar()
    expect(await screen.findByRole('button', { name: /^Visa korgen/ })).toBeInTheDocument()
    // 76 px lista (fast, längst ned) + 8 px luft för fokusramen.
    expect(html.style.scrollPaddingBottom).toBe('84px')

    act(() => useBasketStore.getState().clear())
    // Listan glider ut innan den tas bort – först då släpps scroll-paddingen.
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Visa korgen/ })).not.toBeInTheDocument())
    expect(html.style.scrollPaddingBottom).toBe('')
  })

  it('återställer scroll-padding när sidan lämnas med full korg', async () => {
    useBasketStore.getState().add(bulle, 1, 'portion:st', 'search')
    const { unmount } = renderBar()
    await screen.findByRole('button', { name: /^Visa korgen/ })
    expect(html.style.scrollPaddingBottom).toBe('84px')
    unmount()
    expect(html.style.scrollPaddingBottom).toBe('')
  })
})
