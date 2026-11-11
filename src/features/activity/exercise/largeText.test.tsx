/**
 * Stor text (200 %) på Träning: kortens rader får brytas (`min-w-0`, `break-words`) och raderna som är för
 * smala för sina kolumner byter layout med en containerfråga (`@container` + `@max-[15rem]`). rem i en
 * containerfråga följer rotens teckenstorlek – vid normal text (korten ≈ 20 rem breda) gäller reglerna
 * aldrig. Se ../../../components/domain/largeText.test.tsx för resonemanget.
 */
import { render, screen } from '@testing-library/react'
import { MotionGlobalConfig } from 'motion/react'
import type { ExerciseEntry } from '../../../types'
import { ExerciseDayCard } from './ExerciseDayCard'
import { ExerciseInfoCard } from './ExerciseInfoCard'
import { WeeklyMovementCard } from './WeeklyMovementCard'

MotionGlobalConfig.skipAnimations = true

const RUN: ExerciseEntry = { id: 'x1', date: '2026-10-03', activityId: 'running', name: 'Löpning', minutes: 35, kcal: 340, createdAt: 0 }

describe('stor text – Träning', () => {
  it('förklaringsstyckena får brytas ("nettoförbrukningen" är längre än kolumnen bredvid ikonen)', () => {
    render(<ExerciseInfoCard dayKcal={0} mindful={false} />)
    for (const lead of ['Bara det som kommer utöver vila.', 'Försiktigt med budgeten.', 'Öppna källor.']) {
      const p = screen.getByText(lead).closest('p') as HTMLElement
      expect(p).toHaveClass('min-w-0', 'break-words')
    }
  })

  it('dagens summering (tid, netto, till budget) staplas när kortet är för smalt', () => {
    const { container } = render(
      <ExerciseDayCard date="2026-10-03" isToday list={[RUN]} mindful={false} addBackPct={50} onAdd={() => {}} onEdit={() => {}} />,
    )
    expect(container.firstElementChild).toHaveClass('@container')
    const stats = screen.getByText('Tid').closest('.grid') as HTMLElement
    expect(stats).toHaveClass('grid-cols-3', '@max-[15rem]:grid-cols-1')
  })

  it('veckans rörelse lägger texten under ringen när kortet är för smalt', () => {
    const { container } = render(<WeeklyMovementCard date="2026-10-03" today="2026-10-03" />)
    expect(container.firstElementChild).toHaveClass('@container')
    const row = screen.getByRole('progressbar', { name: 'Aktiva minuter i veckan' }).parentElement as HTMLElement
    expect(row.closest('.flex')).toHaveClass('@max-[15rem]:flex-col')
  })
})
