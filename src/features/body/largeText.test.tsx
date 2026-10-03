/**
 * Stor text (200 %) i Kroppsmått: tabellens rullningsyta är en egen positioneringsyta (`relative`), så att de
 * dolda texterna för skärmläsare (sr-only, absolut placerade) klipps av ytan i stället för att hamna utanför
 * den och skjuta ut hela sidan (document.scrollWidth 488 px i en 390 px bred vy vid 32 px rotstorlek).
 * jsdom har ingen layout – se components/domain/largeText.test.tsx.
 */
import { render, screen, waitFor } from '@testing-library/react'
import { MeasurementsCard } from './MeasurementsCard'
import { useBodyStore } from '../../stores/bodyStore'

beforeAll(async () => {
  await waitFor(() => expect(useBodyStore.persist.hasHydrated()).toBe(true))
})

describe('stor text – Kroppsmått', () => {
  it('rullningsytan runt tabellen är `relative` och klipper därför de dolda texterna', () => {
    useBodyStore.setState({
      weights: [],
      measurements: [
        { id: 'm1', date: '2026-09-01', waistCm: 82, createdAt: 1 },
        { id: 'm2', date: '2026-10-01', waistCm: 80, createdAt: 2 },
      ],
    })
    render(<MeasurementsCard today="2026-10-02" onAdd={() => {}} />)
    const table = screen.getByRole('table', { name: /Kroppsmått per mättillfälle/ })
    const scroller = table.parentElement as HTMLElement
    expect(scroller).toHaveClass('overflow-x-auto', 'relative')
    // De dolda förändringstexterna ligger inne i ytan.
    const hidden = Array.from(table.querySelectorAll('.sr-only')).filter((el) => /sedan förra/.test(el.textContent ?? ''))
    expect(hidden.length).toBeGreaterThan(0)
    for (const el of hidden) expect(scroller.contains(el)).toBe(true)
  })
})
