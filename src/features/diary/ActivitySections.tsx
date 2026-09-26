/**
 * Träning och vatten för dagen i dagboken.
 */
import { memo } from 'react'
import { Info, Plus, Trash2 } from 'lucide-react'
import { Button, Card, IconButton, ListRow, toast } from '../../components/ui'
import { EnergyValue, WaterGlasses } from '../../components/domain'
import { getActivity } from '../../data/activities'
import { formatDuration, formatEnergy, formatNumber } from '../../lib/format'
import { useDiaryStore } from '../../stores/diaryStore'
import type { ExerciseEntry, ISODate } from '../../types'

/**
 * Lägg tillbaka en borttagen träningspost med samma id och ordning (ångra).
 * Butiken saknar `restoreExercise`, så vi gör det här med `setState`.
 */
export function restoreExercise(entry: ExerciseEntry): void {
  const s = useDiaryStore.getState()
  const list = s.exercise[entry.date] ?? []
  if (list.some((x) => x.id === entry.id)) return
  const next = [...list, entry].sort((a, b) => a.createdAt - b.createdAt)
  useDiaryStore.setState({ exercise: { ...s.exercise, [entry.date]: next } })
}

export interface ExerciseSectionProps {
  date: ISODate
  exercise: readonly ExerciseEntry[]
  mindful: boolean
  energyUnit: 'kcal' | 'kJ'
  /** Andel av träningen som läggs till budgeten (0–100). */
  addBackPct: number
}

export const ExerciseSection = memo(function ExerciseSection({ date, exercise, mindful, energyUnit, addBackPct }: ExerciseSectionProps) {
  const total = exercise.reduce((s, x) => s + (x.kcal || 0), 0)
  const added = (total * Math.max(0, Math.min(100, addBackPct))) / 100

  const remove = (x: ExerciseEntry) => {
    const removed = useDiaryStore.getState().removeExercise(date, x.id)
    if (removed) {
      toast(`${removed.name} är borttagen`, { action: { label: 'Ångra', onClick: () => restoreExercise(removed) } })
    }
  }

  return (
    <Card
      id="dagbok-traning"
      className="scroll-mt-20"
      title="Träning"
      titleAs="h2"
      action={
        <Button size="sm" variant="soft" iconLeft={Plus} to={`/traning?datum=${date}`}>
          Logga
        </Button>
      }
    >
      {exercise.length === 0 ? (
        <p className="text-sm leading-relaxed text-ink-2">
          Ingen träning loggad. En promenad räknas också – all rörelse är bra rörelse.
        </p>
      ) : (
        <ul className="-mx-3 flex flex-col">
          {exercise.map((x) => {
            const emoji = getActivity(x.activityId)?.emoji ?? '🏃'
            const details = [formatDuration(x.minutes), x.distanceKm ? `${formatNumber(x.distanceKm, 1)} km` : undefined]
              .filter(Boolean)
              .join(' · ')
            return (
              <li key={x.id}>
                <ListRow
                  dense
                  leading={emoji}
                  leadingTone="mossa"
                  title={x.name}
                  subtitle={details}
                  value={mindful ? undefined : <EnergyValue kcal={x.kcal} />}
                  action={<IconButton icon={Trash2} size="sm" aria-label={`Ta bort ${x.name}`} onClick={() => remove(x)} />}
                />
              </li>
            )
          })}
        </ul>
      )}
      {!mindful && total > 0 && (
        <p className="mt-3 flex items-start gap-2 rounded-2xl bg-surface-2 px-3.5 py-2.5 text-xs leading-relaxed text-ink-2">
          <Info className="mt-px size-3.5 shrink-0 text-ink-3" aria-hidden />
          <span>
            {addBackPct > 0
              ? `${formatNumber(addBackPct)} % av träningen (${formatEnergy(added, energyUnit)}) räknas in i dagens budget. Träningskalorier överskattas ofta, därför räknas bara en del.`
              : 'Träningen räknas inte in i budgeten enligt dina inställningar.'}
          </span>
        </p>
      )}
    </Card>
  )
})

export interface WaterSectionProps {
  date: ISODate
  waterMl: number
  targetMl: number
  glassMl: number
}

export const WaterSection = memo(function WaterSection({ date, waterMl, targetMl, glassMl }: WaterSectionProps) {
  const addWater = useDiaryStore((s) => s.addWater)
  return (
    <Card id="dagbok-vatten" className="scroll-mt-20" title="Vatten" titleAs="h2" tone="fjall">
      <WaterGlasses
        ml={waterMl}
        targetMl={targetMl}
        glassMl={glassMl}
        onAdd={(ml) => addWater(date, ml)}
        onRemove={(ml) => addWater(date, -ml)}
      />
    </Card>
  )
})
