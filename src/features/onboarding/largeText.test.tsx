/**
 * Stor text (200 %) i målsammanfattningen: etiketterna klipps aldrig med "…", uträkningens rader bryts
 * så att värdet hamnar under etiketten, och makrorutorna byter antal kolumner med en containerfråga
 * (`@max-[…rem]`; rem följer rotens teckenstorlek, så vid normal text ≈ 20 rem gäller reglerna aldrig).
 * jsdom har ingen layout – testet kontrollerar orsakerna i markeringen, se components/domain/largeText.test.tsx.
 */
import { render, screen, within } from '@testing-library/react'
import { TargetsSummary } from './TargetsSummary'
import { computeEnergy, computeTargets } from '../../lib/energy'
import type { Profile } from '../../types'

const PROFILE: Profile = {
  sex: 'kvinna',
  birthYear: 1990,
  heightCm: 168,
  startWeightKg: 70,
  activityLevel: 'latt',
  goal: 'ga_ner',
  weeklyRateKg: 0.5,
  lifeStage: 'ingen',
  diet: 'allatare',
  macroPreset: 'nnr',
  createdAt: 0,
}

describe('stor text – TargetsSummary', () => {
  it('uträkningens rader bryts i stället för att trycka ihop etiketten, och dagsmålet får en egen rad', () => {
    render(<TargetsSummary energy={computeEnergy(PROFILE, 70)} targets={computeTargets(PROFILE, 70)} />)
    const row = screen.getByText('Basalomsättning').closest('dt')?.parentElement as HTMLElement
    expect(row).toHaveClass('flex-wrap')
    // Etiketten har en bas på 8 rem: vid normal text ryms etikett och värde på en rad, vid stor text bryts värdet under.
    expect(row.querySelector('dt')).toHaveClass('min-w-0', 'flex-1', 'basis-32')
    expect(row.querySelector('dd')).toHaveClass('ml-auto', 'shrink-0')
    const total = screen.getByText('Dagsmål').parentElement as HTMLElement
    expect(total).toHaveClass('flex-wrap')
    expect(screen.getByText('Dagsmål')).toHaveClass('break-words')
  })

  it('makrorutorna: etiketterna bryts (ingen "…") och rutnätet blir 2 respektive 1 kolumn när raden är smal', () => {
    const { container } = render(<TargetsSummary energy={computeEnergy(PROFILE, 70)} targets={computeTargets(PROFILE, 70)} />)
    const grid = within(screen.getByRole('group', { name: 'Protein' }).parentElement as HTMLElement)
    expect(grid.getAllByRole('group')).toHaveLength(6)
    const gridEl = screen.getByRole('group', { name: 'Protein' }).parentElement as HTMLElement
    expect(gridEl).toHaveClass('grid-cols-3', '@max-[15rem]:grid-cols-2', '@max-[11rem]:grid-cols-1')
    expect(gridEl.parentElement).toHaveClass('@container')
    for (const tile of grid.getAllByRole('group')) {
      expect(tile.firstElementChild).not.toHaveClass('truncate')
      expect(tile.firstElementChild?.lastElementChild).toHaveClass('min-w-0', 'break-words')
    }
    expect(container.querySelector('.truncate')).toBeNull()
  })
})
