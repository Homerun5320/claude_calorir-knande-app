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
import { exerciseRemoveButton, focusAfterRender, lastAddFoodLink, LOG_EXERCISE_ID } from './focus'

/** Lägg tillbaka en borttagen träningspost med samma id och ordning (ångra). */
export function restoreExercise(entry: ExerciseEntry): void {
  useDiaryStore.getState().restoreExercise(entry)
}

export interface ExerciseSectionProps {
  date: ISODate
  exercise: readonly ExerciseEntry[]
  mindful: boolean
  energyUnit: 'kcal' | 'kJ'
  /** Andel av träningen som läggs till budgeten (0–100). */
  addBackPct: number
  /** Adaptiv förbrukning: den vanliga träningen ingår redan i dagsmålet. */
  exerciseInTarget?: boolean
  /**
   * Visa "Logga". Av för planerade (framtida) dagar – träningssidan loggar bara pass som
   * redan har hänt, så knappen skulle annars lägga passet på idag.
   */
  canLog?: boolean
}

export const ExerciseSection = memo(function ExerciseSection({
  date,
  exercise,
  mindful,
  energyUnit,
  addBackPct,
  exerciseInTarget = false,
  canLog = true,
}: ExerciseSectionProps) {
  const total = exercise.reduce((s, x) => s + (x.kcal || 0), 0)
  const added = (total * Math.max(0, Math.min(100, addBackPct))) / 100

  const remove = (x: ExerciseEntry) => {
    // Knappen försvinner med raden – ge fokus till nästa (eller föregående) pass, annars "Logga".
    const i = exercise.findIndex((e) => e.id === x.id)
    const neighbor = exercise[i + 1]?.id ?? exercise[i - 1]?.id
    const removed = useDiaryStore.getState().removeExercise(date, x.id)
    if (removed) {
      focusAfterRender(() => exerciseRemoveButton(neighbor), () => document.getElementById(LOG_EXERCISE_ID), lastAddFoodLink)
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
        canLog ? (
          <Button id={LOG_EXERCISE_ID} size="sm" variant="soft" iconLeft={Plus} to={`/traning?datum=${date}`}>
            Logga
          </Button>
        ) : undefined
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
            const details = [formatDuration(x.minutes), x.distanceKm ? `${formatNumber(x.distanceKm, 1)}\u00a0km` : undefined]
              .filter(Boolean)
              .join(' · ')
            return (
              <li key={x.id} data-exercise-id={x.id}>
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
            {exerciseInTarget
              ? 'Med adaptiv förbrukning ingår din vanliga träning redan i dagsmålet, så den läggs inte till budgeten en gång till.'
              : addBackPct > 0
                ? `${formatNumber(addBackPct)}\u00a0% av träningen (${formatEnergy(added, energyUnit)}) räknas in i dagens budget. Träningskalorier överskattas ofta, därför räknas bara en del.`
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
