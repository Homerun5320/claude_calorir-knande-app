/**
 * Stor text (200 %) i Matkalendern och Om Lagom: rubriker och rader får brytas i stället för att sticka
 * ut ur kortet, och kort som är för smala för ikon och text bredvid varandra byter layout med en
 * containerfråga (`@max-[14rem]`; rem följer rotens teckenstorlek, så vid normal text ≈ 20 rem gäller
 * den aldrig). Se ../../components/domain/largeText.test.tsx.
 */
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MotionGlobalConfig } from 'motion/react'
import AboutPage from './AboutPage'
import FoodCalendarPage from './FoodCalendarPage'

MotionGlobalConfig.skipAnimations = true

const inRouter = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe('stor text – Matkalendern', () => {
  it('kommande matdagar: namnblocket får aldrig bli bredare än raden ("Världslivsmedelsdagen")', () => {
    inRouter(<FoodCalendarPage />)
    const section = screen.getByRole('heading', { name: 'Kommande matdagar' }).closest('section') as HTMLElement
    const rows = within(section).getAllByRole('button')
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      const nameBlock = row.querySelector('.line-clamp-2')?.parentElement as HTMLElement
      expect(nameBlock).toHaveClass('max-w-full', 'min-w-0')
    }
    // Datumet är inte längre "nowrap" – ett långt datumintervall får brytas.
    expect(section.querySelector('.whitespace-nowrap')).toBeNull()
  })

  it('dagsljuset: soluppgång och solnedgång hamnar under texten när kortet är smalt', () => {
    inRouter(<FoodCalendarPage />)
    const heading = screen.getByText('Solen är uppe')
    expect(heading.parentElement).toHaveClass('min-w-0')
    expect(heading.parentElement?.parentElement).toHaveClass('flex-wrap')
  })
})

describe('stor text – Om Lagom', () => {
  it('rubriken "Inte en medicinteknisk produkt" får brytas ("medicinteknisk" är längre än kolumnen)', () => {
    inRouter(<AboutPage />)
    expect(screen.getByRole('heading', { name: 'Inte en medicinteknisk produkt' })).toHaveClass('break-words')
  })
})
