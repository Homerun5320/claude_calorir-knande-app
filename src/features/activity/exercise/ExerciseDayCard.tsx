/**
 * Dagens aktiviteter: summering (tid, nettoförbrukning, andel till budgeten) och listan med poster.
 * Tryck på en rad för att ändra, papperskorgen tar bort med "Ångra".
 */
import { memo } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Button, Card, EmptyState, IconButton, ListRow, Stat, toast } from '../../../components/ui'
import { EnergyValue } from '../../../components/domain'
import { formatDuration, formatNumber, formatPercent } from '../../../lib/format'
import { useDiaryStore } from '../../../stores/diaryStore'
import type { ExerciseEntry, ISODate } from '../../../types'
import { addBackKcal, entryEmoji, entryIntensity, intensityLabel } from '../activityLogic'
import { restoreExercise } from '../hooks'

export interface ExerciseDayCardProps {
  date: ISODate
  isToday: boolean
  list: readonly ExerciseEntry[]
  mindful: boolean
  /** Andel av träningen som läggs till budgeten (0 när den redan ingår i dagsmålet). */
  addBackPct: number
  /** Adaptiv förbrukning: träningen ingår redan i dagsmålet och läggs inte till. */
  inTarget?: boolean
  onAdd: () => void
  onEdit: (entry: ExerciseEntry) => void
}

export const ExerciseDayCard = memo(function ExerciseDayCard({ date, isToday, list, mindful, addBackPct, inTarget = false, onAdd, onEdit }: ExerciseDayCardProps) {
  const reduce = useReducedMotion() ?? false
  const minutes = list.reduce((s, x) => s + (Number.isFinite(x.minutes) ? x.minutes : 0), 0)
  const kcal = list.reduce((s, x) => s + (x.kcal || 0), 0)
  const added = addBackKcal(kcal, addBackPct)

  const remove = (x: ExerciseEntry) => {
    const removed = useDiaryStore.getState().removeExercise(date, x.id)
    if (removed) toast(`${removed.name} är borttagen`, { action: { label: 'Ångra', onClick: () => restoreExercise(removed) } })
  }

  return (
    <Card
      className="@container"
      title={isToday ? 'Dagens aktiviteter' : 'Aktiviteter'}
      action={
        list.length > 0 ? (
          <Button size="sm" variant="soft" iconLeft={Plus} onClick={onAdd}>
            Lägg till
          </Button>
        ) : undefined
      }
    >
      {list.length === 0 ? (
        <EmptyState
          compact
          illustration="forest"
          title={isToday ? 'Ingen aktivitet ännu idag' : 'Ingen aktivitet loggad'}
          text="En promenad, cykeln till jobbet eller en stund i trädgården – all rörelse räknas."
          action={
            <Button iconLeft={Plus} onClick={onAdd}>
              Lägg till aktivitet
            </Button>
          }
        />
      ) : (
        <>
          {/* @container + @max-[15rem]: vid stor text (200 %) ryms inte tre tal bredvid varandra – de staplas. rem i en containerfråga
              följer rotens teckenstorlek; vid normal text (kortet ≈ 20 rem brett) ändras inget. */}
          <div className={`grid gap-2 rounded-2xl bg-surface-2 p-3 @max-[15rem]:grid-cols-1 ${mindful ? 'grid-cols-2' : 'grid-cols-3'}`}>
            <Stat size="sm" label="Tid" value={formatNumber(minutes)} unit="min" />
            {mindful ? (
              <Stat size="sm" label="Aktiviteter" value={formatNumber(list.length)} />
            ) : (
              <>
                <Stat size="sm" label="Netto" value={<EnergyValue kcal={kcal} />} />
                <Stat size="sm" label="Till budget" value={<EnergyValue kcal={added} />} sublabel={inTarget ? 'ingår i målet' : formatPercent(addBackPct)} />
              </>
            )}
          </div>
          <ul className="-mx-3 mt-2 flex flex-col">
            <AnimatePresence initial={false}>
              {list.map((x) => {
                const intensity = entryIntensity(x)
                // En rad: tid, sträcka eller anteckning, annars intensitet.
                const extra = x.distanceKm ? `${formatNumber(x.distanceKm, 1)}\u00a0km` : (x.note ?? (intensity ? intensityLabel(intensity) : undefined))
                const details = [formatDuration(x.minutes), extra].filter(Boolean).join(' · ')
                return (
                  <motion.li
                    key={x.id}
                    layout={!reduce}
                    initial={reduce ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                  >
                    <ListRow
                      leading={entryEmoji(x)}
                      leadingTone="mossa"
                      title={x.name}
                      subtitle={details}
                      value={mindful ? undefined : <EnergyValue kcal={x.kcal} />}
                      onClick={() => onEdit(x)}
                      aria-label={`Ändra ${x.name}, ${details}`}
                      action={<IconButton icon={Trash2} size="sm" aria-label={`Ta bort ${x.name}`} onClick={() => remove(x)} />}
                    />
                  </motion.li>
                )
              })}
            </AnimatePresence>
          </ul>
        </>
      )}
    </Card>
  )
})
