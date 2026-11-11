/**
 * Veckans fasta – antal fastor och snittlängd, plus en rad med veckans dagar. Inga "streaks" och
 * ingen poängtavla (nådda mål, längsta fastan): en dag utan fasta är lika mycket värd som en dag
 * med, och ett nått mål ska inte räknas eller firas.
 */
import { memo, useMemo } from 'react'
import { Card, Stat, cx } from '../../../components/ui'
import { isoWeek, WEEKDAYS, WEEKDAYS_SHORT } from '../../../lib/dates'
import { formatNumber } from '../../../lib/format'
import type { FastRecord } from '../../../stores/fastingStore'
import type { ISODate } from '../../../types'
import { weekOf } from '../activityLogic'
import { fastingWeek } from '../fastingLogic'

const HOUR_MS = 3_600_000

export const FastingWeekCard = memo(function FastingWeekCard({ history, today }: { history: readonly FastRecord[]; today: ISODate }) {
  const week = useMemo(() => weekOf(today), [today])
  const w = useMemo(() => fastingWeek(history, week), [history, week])

  return (
    <Card eyebrow={`Vecka ${isoWeek(today)}`} title="Veckans fasta">
      <p className="-mt-2 mb-3 text-[0.8125rem] leading-relaxed text-ink-3">En saklig översikt över veckan – antal och snittlängd, inga poäng eller serier.</p>
      {w.count === 0 ? (
        <p className="text-[0.9375rem] leading-relaxed text-ink-2">
          Ingen avslutad fasta den här veckan ännu. Det är helt i sin ordning – fasta är ett val, aldrig ett måste.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Stat size="sm" label="Fastor" value={formatNumber(w.count)} />
          <Stat size="sm" label="Snitt" value={formatNumber(w.averageMs / HOUR_MS, 1)} unit="h" />
        </div>
      )}

      <ol className="mt-4 grid grid-cols-7 gap-1" aria-label="Veckans dagar">
        {w.days.map((d, i) => {
          const isToday = d.date === today
          const status = d.ended ? 'fasta avslutad' : 'ingen fasta'
          return (
            <li key={d.date} className="flex flex-col items-center gap-1.5" aria-label={`${WEEKDAYS[i]}: ${status}`}>
              {/* Storlekarna har tak i px: kolumnen är bara ~37 px bred vid 200 % text, och 7 cirklar i rem (2 rem = 64 px) skulle skjuta ut sidan. */}
              <span
                style={{ fontSize: 'min(0.6875rem, 12px)' }}
                className={cx('font-semibold uppercase tracking-wide', isToday ? 'text-ink' : 'text-ink-3')}
              >
                {WEEKDAYS_SHORT[i]}
              </span>
              <span
                aria-hidden
                className={cx(
                  'grid size-[min(2rem,32px)] place-items-center rounded-full',
                  d.ended ? 'bg-blabar-soft ring-2 ring-inset ring-blabar/50' : 'bg-surface-2',
                  isToday && 'outline outline-2 outline-offset-2 outline-line',
                )}
              />
            </li>
          )
        })}
      </ol>
      {w.count > 0 && <p className="mt-3 text-xs leading-relaxed text-ink-3">Fastor räknas till dagen de avslutades.</p>}
    </Card>
  )
})
