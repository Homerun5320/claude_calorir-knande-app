/**
 * Stor text (200 %) i UI-kitet: knapparna i stegaren har tak i px (annars fördubblas de med rotens
 * teckenstorlek och skjuter ut sidan), och enheten efter ett stort tal får hamna under talet.
 * jsdom har ingen layout – testet kontrollerar markeringen, se components/domain/largeText.test.tsx.
 */
import { render, screen } from '@testing-library/react'
import { Stat } from './Stat'
import { Stepper, StepButton } from './Stepper'

describe('stor text – Stepper och Stat', () => {
  it('stegknapparnas mått och ikoner har tak i px, och tryckytan är kvar (osynlig ram)', () => {
    render(
      <>
        <StepButton direction={1} onStep={() => {}} label="Öka sm" size="sm" />
        <StepButton direction={1} onStep={() => {}} label="Öka md" size="md" />
        <StepButton direction={1} onStep={() => {}} label="Öka lg" size="lg" />
      </>,
    )
    expect(screen.getByRole('button', { name: 'Öka sm' })).toHaveClass('size-[min(2rem,32px)]', 'after:-inset-[min(0.375rem,6px)]')
    expect(screen.getByRole('button', { name: 'Öka md' })).toHaveClass('size-[min(2.5rem,40px)]', 'after:-inset-[min(0.125rem,2px)]')
    expect(screen.getByRole('button', { name: 'Öka lg' })).toHaveClass('size-[min(3.5rem,56px)]')
    for (const name of ['Öka sm', 'Öka md', 'Öka lg']) {
      expect(screen.getByRole('button', { name }).querySelector('svg')?.getAttribute('class')).toMatch(/size-\[min\(/)
    }
  })

  it('Stepper använder samma knappar', () => {
    render(<Stepper label="Portioner" value={2} onChange={() => {}} size="sm" />)
    expect(screen.getByRole('button', { name: 'Minska portioner' })).toHaveClass('size-[min(2rem,32px)]')
  })

  it('Stat: enheten bryts under talet i stället för att skjuta ut kortet', () => {
    render(<Stat label="Trendvikt" value="70,5" unit="kg" />)
    const line = screen.getByText('70,5').parentElement as HTMLElement
    expect(line).toHaveClass('flex-wrap')
    expect(line).toHaveTextContent('70,5 kg')
  })
})
