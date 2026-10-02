/**
 * Inställningar → Måltider: en dold måltid ser avstängd ut på reglaget och ikonen, men fältet och
 * hjälptexten ligger kvar i full färg – de går fortfarande att redigera och ska nå 4,5:1 (WCAG 1.4.3).
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_MEALS, DEFAULT_SETTINGS, useProfileStore } from '../../../stores/profileStore'
import { MealsSection } from './MealsSection'

beforeEach(() => {
  useProfileStore.setState({ settings: { ...DEFAULT_SETTINGS, meals: DEFAULT_MEALS.map((m) => ({ ...m })), onboardingDone: true } })
})

/** Alla element från fältet upp till raden – ingen av dem får vara genomskinlig. */
function ancestorsUpToRow(el: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = []
  for (let node: HTMLElement | null = el; node && node.tagName !== 'LI'; node = node.parentElement) out.push(node)
  return out
}

describe('MealsSection – dolda måltider', () => {
  it('Kvällsmat är avstängd från start: reglaget är av, men fältet och hjälptexten är inte tonade', () => {
    render(<MealsSection />)
    const toggle = screen.getByRole('switch', { name: 'Visa Kvällsmat i dagboken' })
    expect(toggle).not.toBeChecked()

    const input = screen.getByRole('textbox', { name: 'Namn på måltiden Kvällsmat' })
    expect(input).toBeEnabled()
    const hint = screen.getByText(/^Föreslås ca 20:00/)
    for (const el of [...ancestorsUpToRow(input), ...ancestorsUpToRow(hint)]) {
      expect(el.className, `${el.tagName}.${el.className}`).not.toMatch(/(^|\s)opacity-/)
    }
    // Hjälptexten har den lästa sekundärfärgen (text-ink-3 klarar 4,5:1 mot alla ytor).
    expect(hint).toHaveClass('text-ink-3')
  })

  it('en dold måltid går fortfarande att byta namn på', () => {
    render(<MealsSection />)
    const input = screen.getByRole('textbox', { name: 'Namn på måltiden Kvällsmat' })
    fireEvent.change(input, { target: { value: 'Sen mat' } })
    fireEvent.blur(input)
    expect(useProfileStore.getState().settings.meals.find((m) => m.id === 'kvallsmat')?.name).toBe('Sen mat')
  })

  it('den avstängda ikonen är fortfarande gråtonad (läget syns utan att texten tonas)', () => {
    const { container } = render(<MealsSection />)
    const rows = container.querySelectorAll('li')
    const off = Array.from(rows).find((li) => li.querySelector('[role="switch"][aria-label="Visa Kvällsmat i dagboken"]'))!
    expect(off.querySelector('.grayscale')).not.toBeNull()
    const on = Array.from(rows).find((li) => li.querySelector('[role="switch"][aria-label="Visa Frukost i dagboken"]'))!
    expect(on.querySelector('.grayscale')).toBeNull()
  })
})
