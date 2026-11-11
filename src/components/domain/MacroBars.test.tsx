/**
 * MacroBars: okända värden är "–" (aldrig 0) och medvetet läge har inga siffror – varken synliga
 * eller för skärmläsare (aria-valuenow/aria-valuetext/aria-label).
 */
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MotionGlobalConfig } from 'motion/react'
import { MacroBars, mindfulMacroWord } from './MacroBars'

MotionGlobalConfig.skipAnimations = true

const TARGETS = { proteinG: 90, carbsG: 240, fatG: 70, fiberG: 25 }
const FULL = { kcal: 1200, protein: 60, carbs: 150, fat: 40 }

describe('MacroBars – okända värden', () => {
  it.each(['compact', 'detailed'] as const)('visar "–" i stället för 0 g när posterna saknar makron (%s)', (variant) => {
    // Snabbregistrering med bara energi: protein, kolhydrater och fett är okända.
    const { container } = render(<MacroBars totals={{ kcal: 300 }} targets={TARGETS} variant={variant} />)
    const items = within(container).getAllByRole('listitem')
    expect(items).toHaveLength(4)
    for (const li of items) {
      expect(within(li).getByText('–')).toBeInTheDocument()
      expect(li.textContent).not.toMatch(/kvar|över|Målet nått/)
    }
    expect(container.textContent).not.toMatch(/(^|\D)0\s*\/\s*\d+\s*g/)
    // Stapeln heter "okänt" och är inte en mätare med värdet 0.
    expect(screen.getByRole('img', { name: 'Protein: okänt, mål 90 g' })).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('en tom dag visar 0 som vanligt', () => {
    const { container } = render(<MacroBars totals={{}} targets={TARGETS} variant="compact" />)
    expect(container.textContent).toContain('0/90 g')
    expect(container.textContent).toContain('90 g kvar')
    expect(screen.getAllByRole('progressbar')).toHaveLength(4)
  })

  it('hasEntries avgör: poster utan några kända värden är okända, inga poster är 0', () => {
    const { container, rerender } = render(<MacroBars totals={{}} targets={TARGETS} hasEntries variant="compact" />)
    expect(container.textContent).not.toContain('kvar')
    expect(within(container).getAllByText('–')).toHaveLength(4)
    rerender(<MacroBars totals={{}} targets={TARGETS} hasEntries={false} variant="compact" />)
    expect(container.textContent).toContain('90 g kvar')
  })

  it('blandat: kända makron visas som vanligt, okända som "–"', () => {
    const { container } = render(<MacroBars totals={{ kcal: 500, protein: 30 }} targets={TARGETS} variant="detailed" />)
    const [protein, carbs] = within(container).getAllByRole('listitem')
    expect(protein.textContent).toContain('30')
    expect(protein.textContent).toContain('60 g kvar')
    // Energiprocenten säger inget när kolhydrater och fett är okända.
    expect(protein.textContent).not.toContain('E%')
    expect(within(carbs).getByText('–')).toBeInTheDocument()
    expect(carbs.textContent).not.toContain('kvar')
  })

  it('kända värden ger en progressbar med gram som förut', () => {
    render(<MacroBars totals={FULL} targets={TARGETS} variant="compact" />)
    const bar = screen.getByRole('progressbar', { name: 'Protein' })
    expect(bar).toHaveAttribute('aria-valuenow', '60')
    expect(bar).toHaveAttribute('aria-valuemax', '90')
    expect(bar.getAttribute('aria-valuetext')).toBe('Protein: 60 av 90 g, 30 g kvar')
  })
})

describe('MacroBars – medvetet läge', () => {
  it.each(['compact', 'detailed'] as const)('exponerar inga siffror för skärmläsare (%s)', (variant) => {
    const { container } = render(<MacroBars totals={FULL} targets={TARGETS} hideNumbers variant={variant} />)
    // Inga mätare med gram/procent – bara bilder med ett ord.
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(container.querySelector('[aria-valuenow], [aria-valuemax], [aria-valuemin], [aria-valuetext]')).toBeNull()
    const bars = screen.getAllByRole('img')
    expect(bars).toHaveLength(4)
    for (const bar of bars) expect(bar.getAttribute('aria-label')).not.toMatch(/\d|%/)
    expect(screen.getByRole('img', { name: 'Protein: på god väg' })).toBeInTheDocument()
    // Och inga synliga siffror heller.
    expect(container.textContent).not.toMatch(/\d/)
  })

  it('okänt i medvetet läge heter okänt – utan mål', () => {
    render(<MacroBars totals={{ kcal: 300 }} targets={TARGETS} hideNumbers />)
    expect(screen.getByRole('img', { name: 'Protein: okänt' })).toBeInTheDocument()
  })

  it('orden är neutrala och utan siffror', () => {
    expect(mindfulMacroWord(0, 90)).toBe('ännu inget')
    expect(mindfulMacroWord(10, 90)).toBe('lite hittills')
    expect(mindfulMacroWord(45, 90)).toBe('på god väg')
    expect(mindfulMacroWord(80, 90)).toBe('nästan där')
    expect(mindfulMacroWord(90, 90)).toBe('lagom')
    expect(mindfulMacroWord(130, 90)).toBe('mer än målet – helt okej')
    expect(mindfulMacroWord(50, 0)).toBe('inget mål')
    for (const w of [0, 10, 45, 80, 90, 130].map((e) => mindfulMacroWord(e, 90))) expect(w).not.toMatch(/\d|%/)
  })
})
