/**
 * Steg: logga dagens steg (sparas i dagens DayMeta), se ungefärlig sträcka och nettoförbrukning,
 * och lägg till stegen *utöver* aktivitetsnivåns baslinje som en aktivitet – så att vardagens
 * promenader inte räknas två gånger.
 *
 * Fältet har ett eget utkast så att det går snabbt att skriva: stegen sparas först efter en kort
 * paus (`useDeferredSave`), direkt när fältet lämnas, när dagen byts (på den gamla dagen), när
 * sidan lämnas och när appen göms. Varje sparning skriver om hela dagboken, så tangenttryck och
 * tryck på −/+ i rad blir en enda sparning (docs/LAGRING.md §3).
 */
import { memo, useMemo, useState } from 'react'
import { Footprints, Plus, RefreshCw } from 'lucide-react'
import { Button, Card, NumberField, Stat, toast } from '../../../components/ui'
import { useEnergyUnit } from '../../../components/domain'
import { formatEnergy, formatNumber } from '../../../lib/format'
import { useDeferredSave } from '../../../hooks/useDeferredSave'
import { useDiaryStore, type NewExerciseEntry } from '../../../stores/diaryStore'
import { ACTIVITY_LEVELS, type ExerciseEntry, type ISODate } from '../../../types'
import { estimateSteps, STEPS_ACTIVITY_ID, STEPS_MET } from '../activityLogic'
import type { BodyBasics } from '../hooks'
import { requireAccess } from '../../premium/requireAccess'

export interface StepsCardProps {
  date: ISODate
  isToday: boolean
  exercise: readonly ExerciseEntry[]
  basics: BodyBasics
  mindful: boolean
}

/** Stegen sparas som heltal – tomt fält (eller ett tal utanför gränserna) blir inga steg. */
function roundSteps(v: number | undefined): number | undefined {
  return v === undefined ? undefined : Math.round(v)
}

const readSteps = (date: ISODate) => useDiaryStore.getState().days[date]?.steps

export const StepsCard = memo(function StepsCard({ date, isToday, exercise, basics, mindful }: StepsCardProps) {
  const stored = useDiaryStore((s) => s.days[date]?.steps)
  const unit = useEnergyUnit()

  const saver = useDeferredSave<number | undefined>({
    key: date,
    read: readSteps,
    save: (steps, day) => useDiaryStore.getState().setDayMeta(day, { steps }),
  })

  // Utkastet i fältet. En ny dag visar den dagens steg (ett osparat värde sparas då på den gamla
  // dagen). Ändras stegen utifrån (t.ex. från Apple Hälsa/Health Connect) följer fältet med – om
  // inget väntar på att sparas och det inte bara är vår egen sparning som har landat.
  const [draft, setDraft] = useState(stored)
  const [synced, setSynced] = useState({ date, stored })
  if (synced.date !== date || synced.stored !== stored) {
    if (synced.date !== date || (!saver.pending && roundSteps(draft) !== stored)) setDraft(stored)
    setSynced({ date, stored })
  }

  const steps = draft
  const est = useMemo(
    () => estimateSteps(steps ?? 0, basics.weightKg, basics.activityLevel, basics.heightCm),
    [steps, basics.weightKg, basics.activityLevel, basics.heightCm],
  )
  const existing = exercise.find((x) => x.activityId === STEPS_ACTIVITY_ID)
  const levelLabel = ACTIVITY_LEVELS[basics.activityLevel].label.toLocaleLowerCase('sv-SE')

  const onStepsChange = (v: number | undefined) => {
    setDraft(v)
    saver.schedule(roundSteps(v))
  }

  const addAsActivity = () => {
    // Spara det som står i fältet först – aktiviteten bygger på dagens sparade steg.
    saver.flush()
    const saved = estimateSteps(readSteps(date) ?? 0, basics.weightKg, basics.activityLevel, basics.heightCm)
    if (saved.extraSteps <= 0) return
    const payload: NewExerciseEntry = {
      date,
      activityId: STEPS_ACTIVITY_ID,
      name: 'Extra steg',
      minutes: Math.max(1, saved.extraMinutes),
      kcal: saved.extraKcal,
      met: STEPS_MET,
      distanceKm: Math.round(saved.extraKm * 100) / 100,
      note: `${formatNumber(saved.extraSteps)}\u00a0steg utöver vardagens ${formatNumber(saved.baseline)}`,
    }
    const store = useDiaryStore.getState()
    if (existing) {
      store.updateExercise(date, existing.id, payload)
      toast('Stegaktiviteten är uppdaterad', { tone: 'success' })
    } else {
      if (!requireAccess('traning')) return
      const entry = store.addExercise(payload)
      toast('Stegen är tillagda som aktivitet', {
        tone: 'success',
        action: { label: 'Ångra', onClick: () => useDiaryStore.getState().removeExercise(entry.date, entry.id) },
      })
    }
  }

  const upToDate = existing !== undefined && existing.kcal === est.extraKcal && existing.minutes === Math.max(1, est.extraMinutes)

  return (
    <Card title="Steg" eyebrow={isToday ? 'Från mobilen eller klockan' : undefined}>
      <NumberField
        label={isToday ? 'Steg idag' : 'Steg den här dagen'}
        value={steps}
        onChange={onStepsChange}
        onBlur={saver.flush}
        suffix="steg"
        prefix={Footprints}
        step={500}
        min={0}
        max={100000}
        decimals={0}
        stepper
        placeholder="0"
      />

      {steps !== undefined && steps > 0 ? (
        <>
          <div className={`mt-3 grid gap-2 ${mindful ? 'grid-cols-1' : 'grid-cols-2'}`}>
            <Stat size="sm" label="Sträcka" value={`≈ ${formatNumber(est.km, 1)}`} unit="km" />
            {!mindful && <Stat size="sm" label="Netto" value={`≈ ${formatEnergy(est.kcal, unit, false)}`} unit={unit} />}
          </div>
          <p className="mt-3 text-[0.8125rem] leading-relaxed text-ink-2">
            Din aktivitetsnivå ({levelLabel}) räknar redan med ungefär {formatNumber(est.baseline)}{'\u00a0'}steg om dagen.{' '}
            {est.extraSteps > 0
              ? mindful
                ? `De ${formatNumber(est.extraSteps)} stegen utöver det kan läggas till som extra rörelse.`
                : `De ${formatNumber(est.extraSteps)} stegen utöver det ger ungefär ${formatEnergy(est.extraKcal, unit)} extra.`
              : 'Dagens steg ryms i den – de finns redan med i ditt dagsmål.'}
          </p>
          {est.extraSteps > 0 && (
            <div className="mt-3 flex flex-col gap-2">
              <Button variant="soft" iconLeft={existing ? RefreshCw : Plus} onClick={addAsActivity} disabled={upToDate}>
                {upToDate ? 'Stegen finns med bland aktiviteterna' : existing ? 'Uppdatera stegaktiviteten' : 'Lägg till som aktivitet'}
              </Button>
              <p className="text-xs leading-relaxed text-ink-3">
                Har du redan loggat promenaden som en aktivitet räknas stegen dubbelt – lägg bara till det ena.
              </p>
            </div>
          )}
        </>
      ) : (
        <p className="mt-3 text-[0.8125rem] leading-relaxed text-ink-3">
          Skriv in stegen från din mobil eller klocka. Steg utöver din vanliga vardag kan läggas till som en aktivitet.
        </p>
      )}
    </Card>
  )
})
