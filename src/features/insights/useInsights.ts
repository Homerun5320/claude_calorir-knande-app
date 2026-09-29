/**
 * Gemensamt dataunderlag för Insikters flikar. Väljer stabila referenser ur butikerna (aldrig nya
 * objekt i selektorer) och härleder allt med useMemo.
 *
 * Snitten räknas bara på förflutna dagar – och dagens (ofta ofullständiga) registrering bara när
 * dagen är markerad som klar (`withCountedDays`, samma regel som veckokortet på Idag). `period`
 * i datan är därför perioden med de dagar som räknas.
 *
 * Med veckobudget har varje veckodag sitt eget mål: dagarnas budget (`DayStat.budget`) räknas med
 * `targetKcalFor`, medan `targets` är basmålet – veckans snittdag – för sammanfattningar.
 */
import { useMemo } from 'react'
import type { DayMeta, DiaryEntry, DietType, ExerciseEntry, ISODate, LifeStage, MealConfig, Sex, Targets } from '../../types'
import { useTargets } from '../../hooks/useTargets'
import { ageFromBirthYear } from '../../lib/dates'
import { MIN_KCAL } from '../../lib/energy'
import { averageKcalFor, kcalForDate, type WeeklyPlan } from '../../lib/weeklyBudget'
import { periodAverages, referenceIntakes, type PeriodAverages, type ReferenceMap } from '../../lib/nnr'
import type { PlateVariant } from '../../lib/plate'
import { useDiaryStore } from '../../stores/diaryStore'
import { useProfileStore } from '../../stores/profileStore'
import { buildDayStats, lowIntakeAverage, periodEntries, summarizeDays, type DayStat, type DaysSummary } from './aggregate'
import { withCountedDays, type Period } from './period'

export interface RefProfile {
  sex: Sex
  age: number
  lifeStage: LifeStage
  diet: DietType
  weightKg?: number
}

export interface InsightsData {
  today: ISODate
  /**
   * Perioden med de dagar som räknas: `elapsed` saknar idag tills dagen är markerad som klar
   * (då är `todayExcluded` true).
   */
  period: Period
  /** Sista dagen som räknas i snitten (idag, eller igår när idag inte är klar än). */
  countedEnd: ISODate
  entriesByDate: Record<ISODate, DiaryEntry[]>
  exerciseByDate: Record<ISODate, ExerciseEntry[]>
  metaByDate: Record<ISODate, DayMeta>
  /** En post per dag i hela perioden (även idag och framtida dagar i innevarande vecka). */
  chartDays: DayStat[]
  /** Dagarna som räknas i snitten (förflutna, idag bara när den är klar). */
  days: DayStat[]
  summary: DaysSummary
  /** Snitt per loggad dag och täckningsgrad. */
  avg: PeriodAverages
  /** Alla poster under de dagar som räknas. */
  entries: DiaryEntry[]
  /** Dagsmålen utan veckobudget – veckans snittdag. */
  targets: Targets
  /** Dagsmålets energi (kcal, utan träning) för ett datum – med veckobudgetens förskjutning. */
  targetKcalFor: (date: ISODate) => number
  /**
   * Energimålet för sammanfattningar och linjen i diagrammen: dagsmålet, eller veckans snittmål med
   * veckobudget (högre än basmålet om någon dag har höjts till golvet).
   */
  goalKcal: number
  /** Veckobudgeten, eller null (då är målet detsamma alla dagar). */
  weeklyPlan: WeeklyPlan | null
  refs: ReferenceMap
  refProfile: RefProfile
  mindful: boolean
  unit: 'kcal' | 'kJ'
  meals: MealConfig[]
  plateVariant: PlateVariant
  /** Andel av träningen som läggs till budgeten – 0 när den redan ingår i ett adaptivt dagsmål. */
  addBackPct: number
  /** Adaptiv förbrukning: träningen ingår redan i dagsmålet. */
  exerciseInTarget: boolean
  /** Energigolvet (1 200/1 500 kcal) som notisen om lågt intag jämför med. */
  floorKcal: number
  /** Snittintag de klara dagarna när det ligger under golvet (minst tre dagar), annars undefined. */
  lowIntakeKcal?: number
}

export function useInsights(basePeriod: Period, today: ISODate): InsightsData {
  const entriesByDate = useDiaryStore((s) => s.entries)
  const exerciseByDate = useDiaryStore((s) => s.exercise)
  const metaByDate = useDiaryStore((s) => s.days)
  const profile = useProfileStore((s) => s.profile)
  const mindful = useProfileStore((s) => s.settings.mindfulMode)
  const unit = useProfileStore((s) => s.settings.energyUnit)
  const meals = useProfileStore((s) => s.settings.meals)
  const { targets, weightKg, exerciseAddBack, weeklyPlan } = useTargets(today)
  const targetKcalFor = useMemo(() => (d: ISODate) => kcalForDate(targets.kcal, weeklyPlan, d), [targets.kcal, weeklyPlan])
  // Samma regel som Idag och Dagbok: med adaptiv förbrukning läggs träningen inte till igen.
  const addBackPct = exerciseAddBack.pct
  const todayComplete = metaByDate[today]?.complete === true

  const period = useMemo(
    () => withCountedDays(basePeriod, today, todayComplete, (d) => (entriesByDate[d]?.length ?? 0) > 0),
    [basePeriod, today, todayComplete, entriesByDate],
  )
  const countedEnd = period.elapsed.length > 0 ? period.elapsed[period.elapsed.length - 1] : period.start

  const chartDays = useMemo(
    () => buildDayStats(period.dates, entriesByDate, exerciseByDate, targetKcalFor, addBackPct),
    [period.dates, entriesByDate, exerciseByDate, targetKcalFor, addBackPct],
  )
  const days = useMemo(() => {
    const counted = new Set(period.elapsed)
    return chartDays.filter((d) => counted.has(d.date))
  }, [chartDays, period.elapsed])
  const summary = useMemo(() => summarizeDays(days), [days])
  const avg = useMemo(() => periodAverages(entriesByDate, period.elapsed), [entriesByDate, period.elapsed])
  const entries = useMemo(() => periodEntries(entriesByDate, period.elapsed), [entriesByDate, period.elapsed])

  const sex = profile?.sex ?? 'kvinna'
  const floorKcal = MIN_KCAL[sex]
  const lowIntakeKcal = useMemo(
    () => lowIntakeAverage(days, (d) => metaByDate[d]?.complete === true, floorKcal),
    [days, metaByDate, floorKcal],
  )

  const refProfile = useMemo<RefProfile>(
    () => ({
      sex,
      age: profile ? ageFromBirthYear(profile.birthYear, today) : 35,
      lifeStage: profile?.lifeStage ?? 'ingen',
      diet: profile?.diet ?? 'allatare',
      weightKg: weightKg ?? profile?.startWeightKg,
    }),
    [profile, sex, today, weightKg],
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
    countedEnd,
    entriesByDate,
    exerciseByDate,
    metaByDate,
    chartDays,
    days,
    summary,
    avg,
    entries,
    targets,
    targetKcalFor,
    goalKcal: averageKcalFor(targets.kcal, weeklyPlan),
    weeklyPlan,
    refs,
    refProfile,
    mindful,
    unit,
    meals,
    plateVariant,
    addBackPct,
    exerciseInTarget: exerciseAddBack.includedInTarget,
    floorKcal,
    lowIntakeKcal,
  }
}
