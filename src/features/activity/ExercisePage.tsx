/**
 * Träning – /traning?datum=YYYY-MM-DD (utan datum: idag).
 *
 * Uppifrån och ned:
 *  1. Rubrik med datumväljare (bakåt i tiden, inte framåt)
 *  2. Dagens aktiviteter med summering – lägg till, ändra, ta bort med "Ångra"
 *  3. Steg (loggas på dagen, kan läggas till som aktivitet utöver vardagsnivån)
 *  4. Veckans rörelse mot Folkhälsomyndighetens 150 minuter
 *  5. Så räknar Lagom träning – nettoprincipen och andelen till budgeten (reglage)
 *
 * Energin är alltid netto (utöver vila) och räknas på senaste vikten, se `lib/exercise.ts`.
 */
import { useCallback, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '../../components/ui'
import { DateNavigator } from '../../components/domain'
import { useTargets } from '../../hooks/useTargets'
import { useToday } from '../../hooks/useToday'
import { relativeDayLabel } from '../../lib/dates'
import { useDiaryStore } from '../../stores/diaryStore'
import { useProfileStore } from '../../stores/profileStore'
import type { ExerciseEntry, ISODate } from '../../types'
import { EMPTY_EXERCISE, isValidISODate } from './activityLogic'
import { useBodyBasics } from './hooks'
import { ActivitySheet } from './exercise/ActivitySheet'
import { ExerciseDayCard } from './exercise/ExerciseDayCard'
import { ExerciseInfoCard } from './exercise/ExerciseInfoCard'
import { StepsCard } from './exercise/StepsCard'
import { WeeklyMovementCard } from './exercise/WeeklyMovementCard'
import { requireAccess } from '../premium/requireAccess'

interface SheetState {
  open: boolean
  /** Ny nyckel för varje öppning så att formuläret börjar rent. */
  key: number
  editing: ExerciseEntry | null
}

export default function ExercisePage() {
  const today = useToday()
  const [params, setParams] = useSearchParams()
  const raw = params.get('datum')
  // Framtida dagar och ogiltiga datum visar idag.
  const date: ISODate = isValidISODate(raw) && raw <= today ? raw : today

  const goTo = useCallback(
    (d: ISODate) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (d === today) next.delete('datum')
          else next.set('datum', d)
          return next
        },
        { replace: true },
      )
    },
    [setParams, today],
  )

  const exercise = useDiaryStore((s) => s.exercise[date] ?? EMPTY_EXERCISE)
  const mindful = useProfileStore((s) => s.settings.mindfulMode)
  const energyUnit = useProfileStore((s) => s.settings.energyUnit)
  // Samma regel som Idag och Dagbok: med adaptiv förbrukning ingår träningen redan i dagsmålet.
  const { exerciseAddBack } = useTargets(today)
  const basics = useBodyBasics()
  const dayKcal = exercise.reduce((s, x) => s + (x.kcal || 0), 0)

  const [sheet, setSheet] = useState<SheetState>({ open: false, key: 0, editing: null })
  const openAdd = useCallback(() => {
    if (requireAccess('traning')) setSheet((s) => ({ open: true, key: s.key + 1, editing: null }))
  }, [])
  const openEdit = useCallback((entry: ExerciseEntry) => setSheet((s) => ({ open: true, key: s.key + 1, editing: entry })), [])
  const close = useCallback(() => setSheet((s) => ({ ...s, open: false })), [])

  const isToday = date === today

  return (
    <div className="px-4 pb-8">
      <PageHeader title="Träning" compactTitle={`Träning · ${relativeDayLabel(date, today)}`} subtitle="All rörelse räknas – ärligt räknat, utöver vila.">
        <div className="card rounded-[1.75rem] px-1 py-1.5">
          <DateNavigator date={date} onChange={goTo} today={today} maxFutureDays={0} />
        </div>
      </PageHeader>

      <div className="flex flex-col gap-4">
        <ExerciseDayCard
          date={date}
          isToday={isToday}
          list={exercise}
          mindful={mindful}
          addBackPct={exerciseAddBack.pct}
          inTarget={exerciseAddBack.includedInTarget}
          onAdd={openAdd}
          onEdit={openEdit}
        />
        <StepsCard date={date} isToday={isToday} exercise={exercise} basics={basics} mindful={mindful} />
        <WeeklyMovementCard date={date} today={today} />
        <ExerciseInfoCard dayKcal={dayKcal} mindful={mindful} inTarget={exerciseAddBack.includedInTarget} />
      </div>

      <ActivitySheet
        key={sheet.key}
        open={sheet.open}
        onClose={close}
        date={date}
        editing={sheet.editing}
        weightKg={basics.weightKg}
        weightKnown={basics.weightKnown}
        mindful={mindful}
        energyUnit={energyUnit}
      />
    </div>
  )
}
