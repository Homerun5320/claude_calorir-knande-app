/**
 * Veckans rörelse – aktiva minuter mot Folkhälsomyndighetens 150 minuter, minuter per dag och
 * muskelstärkande pass. Uppmuntrande och utan "streaks": en vilodag är aldrig ett misslyckande.
 */
import { memo, useMemo } from 'react'
import { Card, ProgressRing } from '../../../components/ui'
import { BarChart, type BarDatum } from '../../../components/charts'
import { isoWeek } from '../../../lib/dates'
import { WEEKLY_ACTIVE_MINUTES_GOAL } from '../../../lib/exercise'
import { formatDuration, formatNumber, plural } from '../../../lib/format'
import { useDiaryStore } from '../../../stores/diaryStore'
import type { ISODate } from '../../../types'
import { movementMessage, weekMovement, weekOf, WEEKLY_STRENGTH_GOAL } from '../activityLogic'

export const WeeklyMovementCard = memo(function WeeklyMovementCard({ date, today }: { date: ISODate; today: ISODate }) {
  const exercise = useDiaryStore((s) => s.exercise)
  const week = useMemo(() => weekOf(date), [date])
  const m = useMemo(() => weekMovement(exercise, week), [exercise, week])
  const bars = useMemo<BarDatum[]>(
    () => m.days.map((d) => ({ date: d.date, value: d.date > today ? undefined : d.minutes })),
    [m.days, today],
  )
  const goal = WEEKLY_ACTIVE_MINUTES_GOAL
  const active = Math.round(m.activeMinutes)

  return (
    <Card eyebrow={`Vecka ${isoWeek(date)}`} title="Veckans rörelse">
      <div className="flex items-center gap-4">
        <ProgressRing
          value={active}
          max={goal}
          size={124}
          thickness={12}
          tone="mossa"
          aria-label="Aktiva minuter i veckan"
          valueText={`${formatNumber(active)} av ${goal} minuter`}
        >
          <span className="display-num text-[2rem] font-semibold leading-none text-ink">{formatNumber(active)}</span>
          <span className="mt-1 text-xs text-ink-3">av {goal} min</span>
        </ProgressRing>
        <div className="min-w-0 flex-1">
          <p className="text-[0.9375rem] leading-snug text-ink">{movementMessage(active, m.totalMinutes)}</p>
          <ul className="mt-2 space-y-1 text-[0.8125rem] leading-snug text-ink-2">
            <li>Aktiv {plural(m.activeDays, 'dag', 'dagar')} av 7</li>
            <li>
              Muskelstärkande: {plural(m.strengthSessions, 'pass', 'pass')}
              <span className="text-ink-3"> (gärna {WEEKLY_STRENGTH_GOAL} i veckan)</span>
            </li>
          </ul>
        </div>
      </div>

      <BarChart
        className="mt-4"
        data={bars}
        highlight={date}
        color="var(--lg-mossa)"
        height={120}
        unit="min"
        formatValue={(v) => formatDuration(v)}
        valueLabel={false}
        dimOthers={false}
        title="Minuter per dag"
        summary={`Totalt ${formatDuration(m.totalMinutes)} rörelse vecka ${isoWeek(date)}, varav ${formatNumber(active)} aktiva minuter.`}
        emptyText="Ingen rörelse loggad ännu"
        legend={false}
      />

      <p className="mt-3 text-xs leading-relaxed text-ink-3">
        Folkhälsomyndigheten rekommenderar minst 150 minuter i veckan med måttlig intensitet – eller 75 minuter med hög – gärna
        fördelat på flera dagar, och muskelstärkande träning minst två gånger i veckan. Här räknas minuter med hög intensitet
        dubbelt och lätt aktivitet som stretching inte alls – men all rörelse är bra för kroppen.
      </p>
    </Card>
  )
})
