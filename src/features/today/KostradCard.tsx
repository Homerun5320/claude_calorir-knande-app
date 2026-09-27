/**
 * Kostråden den här veckan – tre små framstegschips (t.ex. grönt, fisk och fullkorn) enligt
 * Livsmedelsverkets kostråd, utvärderade för veckan hittills (måndag till idag). Dagens halvfärdiga
 * registrering räknas in först när dagen är markerad som klar (se `kostradWeekDates`).
 */
import { memo, useId, useMemo } from 'react'
import { Card, ProgressRing } from '../../components/ui'
import { isoWeek } from '../../lib/dates'
import { evaluateKostrad, type KostradResult, type KostradStatus } from '../../lib/kostrad'
import { useDiaryStore } from '../../stores/diaryStore'
import { useProfileStore } from '../../stores/profileStore'
import type { ISODate } from '../../types'
import { SectionLink } from './SectionLink'
import { KOSTRAD_SHORT_TITLE, kostradProgressText, kostradStatusLabel, kostradWeekDates, pickKostradHighlights } from './todayLogic'

const STATUS_TONE: Record<KostradStatus, 'mossa' | 'sol' | 'gran' | 'hjortron'> = {
  bra: 'mossa',
  nastan: 'sol',
  langt_kvar: 'gran',
  over: 'hjortron',
}

const STATUS_TEXT: Record<KostradStatus, string> = {
  bra: 'text-good',
  nastan: 'text-ink-2',
  langt_kvar: 'text-ink-3',
  over: 'text-ink-2',
}

function KostradChip({ result, mindful }: { result: KostradResult; mindful: boolean }) {
  const title = KOSTRAD_SHORT_TITLE[result.id] ?? result.title
  const progress = kostradProgressText(result)
  const status = kostradStatusLabel(result)
  return (
    <li
      className="flex min-w-0 flex-col items-center rounded-2xl bg-surface-2/70 px-1.5 pt-3 pb-2.5 text-center"
      title={mindful ? result.advice : `${result.title}: ${progress}. ${result.tip}`}
    >
      <ProgressRing
        value={Math.min(1, result.score)}
        max={1}
        size={48}
        thickness={5}
        tone={STATUS_TONE[result.status]}
        trackColor="var(--lg-surface)"
        aria-label={result.title}
        valueText={mindful ? status : `${status}, ${progress}`}
      >
        <span className="text-[1.25rem] leading-none" aria-hidden="true">
          {result.emoji}
        </span>
      </ProgressRing>
      <span className="mt-2 line-clamp-2 text-[0.8125rem] leading-tight font-semibold text-ink">{title}</span>
      <span className={`mt-0.5 text-[0.75rem] font-medium ${STATUS_TEXT[result.status]}`}>{status}</span>
      {!mindful && <span className="mt-0.5 text-[0.6875rem] leading-tight text-ink-3 tabular-nums">{progress}</span>}
    </li>
  )
}

export const KostradCard = memo(function KostradCard({ today, mindful }: { today: ISODate; mindful: boolean }) {
  const hintId = useId()
  const entries = useDiaryStore((s) => s.entries)
  const exercise = useDiaryStore((s) => s.exercise)
  const todayComplete = useDiaryStore((s) => s.days[today]?.complete === true)
  const sex = useProfileStore((s) => s.profile?.sex ?? 'kvinna')

  const { highlights, todayExcluded } = useMemo(() => {
    const week = kostradWeekDates(today, entries, exercise, todayComplete)
    const results = evaluateKostrad({ entriesByDate: entries, exerciseByDate: exercise, dates: week.dates, sex })
    return { highlights: pickKostradHighlights(results, 3), todayExcluded: week.todayExcluded }
  }, [entries, exercise, today, todayComplete, sex])

  return (
    <Card
      title="Kostråden i veckan"
      eyebrow={`Vecka ${isoWeek(today)}`}
      action={
        <SectionLink to="/insikter?flik=kostrad" label="Alla kostråd">
          Alla
        </SectionLink>
      }
    >
      {highlights.length === 0 ? (
        <p className="text-sm leading-relaxed text-ink-2">
          När du har registrerat lite mat den här veckan ser du här hur det går med Livsmedelsverkets kostråd – grönt, fisk,
          fullkorn och mer.
        </p>
      ) : (
        <>
          <ul className="grid grid-cols-3 gap-2" aria-describedby={hintId}>
            {highlights.map((r) => (
              <KostradChip key={r.id} result={r} mindful={mindful} />
            ))}
          </ul>
          <p id={hintId} className="mt-3 text-xs leading-relaxed text-ink-3">
            {todayExcluded
              ? 'Veckan hittills enligt Livsmedelsverkets kostråd – idag räknas in när dagen är klar. Små steg räknas.'
              : 'Veckan hittills, enligt Livsmedelsverkets kostråd. Små steg räknas.'}
          </p>
        </>
      )}
    </Card>
  )
})
