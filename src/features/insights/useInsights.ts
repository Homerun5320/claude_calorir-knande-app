/**
 * Gemensamt dataunderlag för Insikters flikar. Väljer stabila referenser ur butikerna (aldrig nya
 * objekt i selektorer) och härleder allt med useMemo.
 */
import { useMemo } from 'react'
import type { DayMeta, DiaryEntry, DietType, ExerciseEntry, ISODate, LifeStage, MealConfig, Sex, Targets } from '../../types'
import { useTargets } from '../../hooks/useTargets'
import { ageFromBirthYear } from '../../lib/dates'
import { periodAverages, referenceIntakes, type PeriodAverages, type ReferenceMap } from '../../lib/nnr'
import type { PlateVariant } from '../../lib/plate'
import { useDiaryStore } from '../../stores/diaryStore'
import { useProfileStore } from '../../stores/profileStore'
import { buildDayStats, periodEntries, summarizeDays, type DayStat, type DaysSummary } from './aggregate'
import type { Period } from './period'

export interface RefProfile {
  sex: Sex
  age: number
  lifeStage: LifeStage
  diet: DietType
  weightKg?: number
}

export interface InsightsData {
  today: ISODate
  period: Period
  entriesByDate: Record<ISODate, DiaryEntry[]>
  exerciseByDate: Record<ISODate, ExerciseEntry[]>
  metaByDate: Record<ISODate, DayMeta>
  /** En post per dag i hela perioden (även framtida dagar i innevarande vecka). */
  chartDays: DayStat[]
  /** Förflutna dagar. */
  days: DayStat[]
  summary: DaysSummary
  /** Snitt per loggad dag och täckningsgrad. */
  avg: PeriodAverages
  /** Alla poster i perioden. */
  entries: DiaryEntry[]
  targets: Targets
  refs: ReferenceMap
  refProfile: RefProfile
  mindful: boolean
  unit: 'kcal' | 'kJ'
  meals: MealConfig[]
  plateVariant: PlateVariant
  addBackPct: number
}

export function useInsights(period: Period, today: ISODate): InsightsData {
  const entriesByDate = useDiaryStore((s) => s.entries)
  const exerciseByDate = useDiaryStore((s) => s.exercise)
  const metaByDate = useDiaryStore((s) => s.days)
  const profile = useProfileStore((s) => s.profile)
  const mindful = useProfileStore((s) => s.settings.mindfulMode)
  const unit = useProfileStore((s) => s.settings.energyUnit)
  const meals = useProfileStore((s) => s.settings.meals)
  const addBackPct = useProfileStore((s) => s.settings.exerciseAddBackPct)
  const { targets, weightKg } = useTargets(today)

  const chartDays = useMemo(
    () => buildDayStats(period.dates, entriesByDate, exerciseByDate, targets.kcal, addBackPct),
    [period.dates, entriesByDate, exerciseByDate, targets.kcal, addBackPct],
  )
  const days = useMemo(() => chartDays.filter((d) => d.date <= today), [chartDays, today])
  const summary = useMemo(() => summarizeDays(days), [days])
  const avg = useMemo(() => periodAverages(entriesByDate, period.elapsed), [entriesByDate, period.elapsed])
  const entries = useMemo(() => periodEntries(entriesByDate, period.elapsed), [entriesByDate, period.elapsed])

  const refProfile = useMemo<RefProfile>(
    () => ({
      sex: profile?.sex ?? 'kvinna',
      age: profile ? ageFromBirthYear(profile.birthYear, today) : 35,
      lifeStage: profile?.lifeStage ?? 'ingen',
      diet: profile?.diet ?? 'allatare',
      weightKg: weightKg ?? profile?.startWeightKg,
    }),
    [profile, today, weightKg],
  )

  // Energiprocent (t.ex. mättat fett < 10 E%) räknas på faktiskt intag när det finns, annars på målet.
  const refKcal = summary.avgKcal !== undefined && summary.avgKcal > 0 ? summary.avgKcal : targets.kcal
  const refs = useMemo(
    () =>
      referenceIntakes({
        sex: refProfile.sex,
        age: refProfile.age,
        lifeStage: refProfile.lifeStage,
        weightKg: refProfile.weightKg,
        kcal: Math.round(refKcal),
      }),
    [refProfile, refKcal],
  )

  const activityLevel = profile?.activityLevel
  const plateVariant: PlateVariant = activityLevel === 'aktiv' || activityLevel === 'mycket_aktiv' ? 'aktiv' : 'vanlig'

  return {
    today,
    period,
    entriesByDate,
    exerciseByDate,
    metaByDate,
    chartDays,
    days,
    summary,
    avg,
    entries,
    targets,
    refs,
    refProfile,
    mindful,
    unit,
    meals,
    plateVariant,
    addBackPct,
  }
}
