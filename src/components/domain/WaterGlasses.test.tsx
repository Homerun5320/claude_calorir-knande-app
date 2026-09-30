/**
 * Tester för vattenglasen: tryckytor på minst 44 px, jämna rader på smala skärmar och att tryck
 * fyller och tömmer rätt mängd.
 */
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MotionGlobalConfig } from 'motion/react'
import { describe, expect, it, vi } from 'vitest'
import { WaterGlasses, formatLiters, formatLitersLong } from './WaterGlasses'

MotionGlobalConfig.skipAnimations = true

function glasses() {
  const group = screen.getByRole('group', { name: /^Vatten:/ })
  return { group, buttons: within(group).getAllByRole('button') }
}

describe('WaterGlasses', () => {
  it('ger varje glas en tryckyta på minst 44 × 48 px', () => {
    render(<WaterGlasses ml={500} targetMl={2000} onAdd={() => {}} onRemove={() => {}} />)
    const { buttons } = glasses()
    expect(buttons).toHaveLength(8)
    for (const b of buttons) {
      expect(b).toHaveClass('min-w-11', 'h-12', 'shrink-0')
      expect(b.className).not.toMatch(/\bmin-w-9\b|\bmax-w-11\b/)
    }
  })

  it('delar glasen på två jämna rader när de inte får plats på en', () => {
    render(<WaterGlasses ml={500} targetMl={2000} onAdd={() => {}} onRemove={() => {}} />)
    const { group, buttons } = glasses()
    expect(group).toHaveClass('flex-wrap')
    // 8 glas → en rad om 8 (om 8 × 44 px får plats), annars 4 + 4.
    expect(group.style.getPropertyValue('--wg-n')).toBe('8')
    expect(group.style.getPropertyValue('--wg-half')).toBe('4')
    const basis = buttons[0].style.flexBasis
    expect(basis).toContain('var(--wg-n)')
    expect(basis).toContain('var(--wg-half)')
    expect(basis).toContain('2.75rem')
  })

  it('räknar med "lägg till ett glas" när alla glas är fulla', () => {
    render(<WaterGlasses ml={2000} targetMl={2000} onAdd={() => {}} onRemove={() => {}} />)
    const { group, buttons } = glasses()
    expect(buttons).toHaveLength(9)
    expect(buttons[8]).toHaveAccessibleName('Lägg till ett glas (250 ml)')
    expect(buttons[8]).toHaveClass('min-w-11')
    expect(group.style.getPropertyValue('--wg-n')).toBe('9')
    expect(group.style.getPropertyValue('--wg-half')).toBe('5')
  })

  it('fyller upp till det tryckta glaset och tömmer det sista', () => {
    const onAdd = vi.fn()
    const onRemove = vi.fn()
    render(<WaterGlasses ml={600} targetMl={2000} onAdd={onAdd} onRemove={onRemove} />)
    const { buttons } = glasses()
    // Glas 4 av 8: fyll från 600 ml till 1 000 ml.
    fireEvent.click(buttons[3])
    expect(onAdd).toHaveBeenLastCalledWith(400)
    // Glas 3 är det sista (delvis) fyllda: töm de 100 ml som finns i det.
    expect(buttons[2]).toHaveAccessibleName('Glas 3 av 8, fyllt. Tryck för att ta bort 100 ml')
    fireEvent.click(buttons[2])
    expect(onRemove).toHaveBeenLastCalledWith(100)
  })

  it('är en bild utan tryckytor när den bara visar', () => {
    render(<WaterGlasses ml={1250} targetMl={2000} showSummary={false} />)
    expect(screen.getByRole('img', { name: 'Vatten: 1,25 liter av 2 liter' })).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('formaterar liter med decimalkomma', () => {
    expect(formatLiters(1250)).toBe('1,25 l')
    expect(formatLiters(-5)).toBe('0 l')
    expect(formatLitersLong(2000)).toBe('2 liter')
  })
})
