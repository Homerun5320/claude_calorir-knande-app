/**
 * Veckans fokus – ett litet mål för veckan som användaren själv har valt (Inställningar → Mål),
 * t.ex. "Fisk två gånger". Visar hur långt veckan har kommit med en mjuk förloppsstapel och en
 * uppmuntrande rad. Inga streaks och inga skuldtexter – bara framsteg och att det finns dagar kvar.
 *
 * Visas bara när ett fokus är valt. I medvetet läge visas beskedet utan siffror.
 */
import { memo, useMemo } from 'react'
import { Card, ProgressBar } from '../../components/ui'
import { isoWeek } from '../../lib/dates'
import { focusGoal, focusProgress } from '../../lib/focusGoals'
import { useDiaryStore } from '../../stores/diaryStore'
import { useProfileStore } from '../../stores/profileStore'
import type { ISODate } from '../../types'
import { SectionLink } from './SectionLink'

export const FocusCard = memo(function FocusCard({ today, mindful }: { today: ISODate; mindful: boolean }) {
  const focusId = useProfileStore((s) => s.settings.weeklyFocus?.id)
  const entries = useDiaryStore((s) => s.entries)
  const exercise = useDiaryStore((s) => s.exercise)
  const todayComplete = useDiaryStore((s) => s.days[today]?.complete === true)
  const goal = focusGoal(focusId)

  const progress = useMemo(
    () => (goal ? focusProgress(goal.id, { entriesByDate: entries, exerciseByDate: exercise, today, todayComplete }) : undefined),
    [goal, entries, exercise, today, todayComplete],
  )

  if (!goal || !progress) return null
  const line = mindful ? progress.mindfulText : progress.text

  return (
    <Card
      title="Veckans fokus"
      eyebrow={`Vecka ${isoWeek(today)}`}
      action={
        <SectionLink to="/installningar/mal" label="Ändra veckans fokus">
          Ändra
        </SectionLink>
      }
    >
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-surface-2 text-[1.375rem] leading-none" aria-hidden="true">
          {goal.emoji}
        </span>
        <div className="min-w-0">
          <p className="font-display text-[1.125rem] leading-snug font-semibold tracking-tight text-ink">{goal.title}</p>
          <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-ink-3">{goal.description}</p>
        </div>
      </div>
      <ProgressBar
        className="mt-4"
        value={progress.ratio}
        max={1}
        size="md"
        tone={progress.reached ? 'mossa' : 'gran'}
        aria-label={`Veckans fokus: ${goal.title}`}
        valueText={line}
      />
      <p className="mt-2.5 text-sm leading-relaxed font-medium text-ink-2">{line}</p>
      {!mindful && progress.note && <p className="mt-1 text-xs leading-relaxed text-ink-3">{progress.note}</p>}
    </Card>
  )
})
