/**
 * DonutChart i medvetet läge: inga siffror i teckenförklaringen, vid tryck på ett segment eller
 * i skärmläsartexten – och oförändrat utan `hideNumbers`.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MotionGlobalConfig } from 'motion/react'
import { DonutChart, type DonutSegment } from './DonutChart'

MotionGlobalConfig.skipAnimations = true

const SEGMENTS: DonutSegment[] = [
  { key: 'protein', label: 'Protein', value: 20, color: 'var(--lg-lingon)' },
  { key: 'carbs', label: 'Kolhydrater', value: 50, color: 'var(--lg-hjortron)' },
  { key: 'fat', label: 'Fett', value: 30, color: 'var(--lg-blabar)' },
]

describe('DonutChart', () => {
  it('visar och läser upp värden och procent som vanligt', () => {
    const { container } = render(<DonutChart segments={SEGMENTS} unit="E%" />)
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/Protein.*20.*\(20\s*%\)/)
    expect(container.textContent).toMatch(/50/)
  })

  it('hideNumbers: inga siffror i teckenförklaringen eller i skärmläsartexten', () => {
    const { container } = render(
      <DonutChart segments={SEGMENTS} unit="E%" hideNumbers summary="Energifördelning: protein 20 procent, fett 30 procent">
        <span>🍽️</span>
      </DonutChart>,
    )
    // En egen summary med siffror ignoreras.
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('Fördelning: protein, kolhydrater, fett.')
    expect(container.textContent).not.toMatch(/\d|%/)
    expect(screen.getByText('Kolhydrater')).toBeInTheDocument()
  })

  it('hideNumbers: tryck på ett segment visar bara etiketten', () => {
    const { container } = render(<DonutChart segments={SEGMENTS} unit="E%" hideNumbers legend="none" />)
    const arc = container.querySelector('path[stroke="var(--lg-hjortron)"]')
    expect(arc).not.toBeNull()
    fireEvent.pointerDown(arc!)
    expect(screen.getByText('Kolhydrater')).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/\d|%/)
  })

  it('utan data säger den det, även i medvetet läge', () => {
    render(<DonutChart segments={[]} hideNumbers />)
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('Fördelning: ingen data ännu.')
  })
})
