import { useMemo } from 'react'
import { useBodyStore } from '../stores/bodyStore'
import { useDiaryStore } from '../stores/diaryStore'
import { useProfileStore } from '../stores/profileStore'
import {
  CAFFEINE_ADULT_MAX_MG,
  MIN_KCAL,
  adaptiveBlockReasonFor,
  adaptiveIntake,
  computeEnergy,
  computeTargets,
  estimateAdaptiveTdee,
  weightTrend,
  type AdaptiveEstimate,
  type EnergyBreakdown,
} from '../lib/energy'
import { exerciseAddBack, totals, type ExerciseAddBack } from '../lib/diary'
import { todayISO } from '../lib/dates'
import { resolveWeeklyBudget, targetsForDate, type WeeklyPlan } from '../lib/weeklyBudget'
import type { DayMeta, DiaryEntry, ISODate, Targets, WeightEntry } from '../types'

export interface TargetsInfo {
  /**
   * Målen för `date` (andra argumentet till `useTargets`) – med veckobudgetens förskjutning för
   * den veckodagen. Utan `date`: basmålen (samma som `baseTargets`).
   */
  targets: Targets
  /**
   * Dagsmålen utan veckobudget – veckans snittdag. Mål och makron, sammanfattningar ("… per dag")
   * och referensvärden utgår från dem.
   */
  baseTargets: Targets
  /**
   * Målen för ett visst datum: basmålen plus veckobudgetens förskjutning för veckodagen (aldrig
   * under golvet). Samma funktion så länge målen inte ändras – går att skicka till memoiserade
   * komponenter. Utan veckobudget returneras `baseTargets`.
   */
  targetsFor: (date: ISODate) => Targets
  /** Veckobudgeten när den är påslagen och får användas, annars null. */
  weeklyPlan: WeeklyPlan | null
  /**
   * Varför veckobudgeten inte används (graviditet, amning, under 18 år) – oavsett om den är
   * påslagen – annars null.
   */
  weeklyBlocked: string | null
  energy: EnergyBreakdown | null
  adaptive: AdaptiveEstimate | null
  /** Vikten som målen baseras på (senaste vägningen till och med `today`). */
  weightKg: number | null
  /**
   * Trendvikten idag (samma utjämning som under Vikt). Viktmålet – BMI-gränsen och målvikten –
   * bedöms mot den, så att Idag, Vikt och målen visar samma status. BMI-gränsen bedöms dessutom
   * mot senaste vägningen (den lägsta av de två avgör, se `computeEnergy`).
   */
  trendKg: number | null
  /**
   * Varför adaptiv förbrukning inte används just nu, eller null: graviditet, amning, under 18 år –
   * eller lågt BMI när den uppmätta förbrukningen är lägre än formelns (se `computeEnergy`).
   * Då räknas målen från formeln även om inställningen är på.
   */
  adaptiveBlocked: string | null
  /** Hur mycket av träningen som läggs till dagens budget (0 % när den redan ingår i målet). */
  exerciseAddBack: ExerciseAddBack
}

const NO_ENTRIES: Record<ISODate, DiaryEntry[]> = {}
const NO_DAYS: Record<ISODate, DayMeta> = {}

const FALLBACK: Targets = {
  kcal: 2000,
  proteinG: 90,
  carbsG: 250,
  fatG: 70,
  fiberG: 30,
  waterMl: 1800,
  saltMaxG: 6,
  satFatMaxG: 22,
  addedSugarMaxG: 50,
  caffeineMaxMg: 400,
}

const usable = (v: number | undefined): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0

/**
 * Mål utan profil (före introduktionen). Egna mål gäller, men aldrig under det högre
 * säkerhetsgolvet (könet är okänt) och aldrig över vuxnas koffeinriktmärke.
 */
function fallbackTargets(overrides: Partial<Targets>): Targets {
  const out: Targets = { ...FALLBACK }
  for (const key of Object.keys(FALLBACK) as (keyof Targets)[]) {
    const v = overrides[key]
    if (usable(v)) out[key] = v
  }
  out.kcal = Math.max(out.kcal, MIN_KCAL.man)
  out.caffeineMaxMg = Math.min(out.caffeineMaxMg, CAFFEINE_ADULT_MAX_MG)
  return out
}

/**
 * Vägningarna till och med `today`, sorterade på datum. En vägning med ett senare datum (t.ex. från
 * en säkerhetskopia) eller en osorterad lista får aldrig styra dagens mål.
 */
function weightsUntil(weights: readonly WeightEntry[], today: ISODate): WeightEntry[] {
  return weights.filter((w) => w.date <= today && Number.isFinite(w.kg) && w.kg > 0).sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Beräknade dagsmål (med användarens egna överskrivningar och ev. adaptiv förbrukning).
 *
 * - `today` är dagen som målen räknas utifrån (vikt, ålder, adaptiv förbrukning) – oftast `useToday()`.
 * - `date` (valfritt) är dagen som `targets` gäller: med veckobudget får den veckodagens mål
 *   (t.ex. extra på fredagar). Använd det överallt där ett mål visas eller jämförs för en viss dag
 *   (Idag, dagboken). För flera dagar: `targetsFor(date)`, eller `weeklyPlan` med `kcalForDate`.
 */
export function useTargets(today: ISODate = todayISO(), date?: ISODate): TargetsInfo {
  const profile = useProfileStore((s) => s.profile)
  const targetOverrides = useProfileStore((s) => s.settings.targetOverrides)
  const adaptiveTargets = useProfileStore((s) => s.settings.adaptiveTargets)
  const addBackSetting = useProfileStore((s) => s.settings.exerciseAddBackPct)
  const weeklySetting = useProfileStore((s) => s.settings.weeklyBudget)
  const allWeights = useBodyStore((s) => s.weights)
  // Graviditet, amning och under 18 år: formeln gäller även om adaptiva mål är påslagna.
  const profileBlocked = profile ? adaptiveBlockReasonFor(profile, today) : null
  const useAdaptive = adaptiveTargets && profileBlocked === null
  // Hela dagboken behövs bara för adaptiv förbrukning – annars prenumererar vi inte på den
  // (varje ny post skulle annars räkna om målen och rendera om alla som använder kroken).
  const entries = useDiaryStore((s) => (useAdaptive ? s.entries : NO_ENTRIES))
  const days = useDiaryStore((s) => (useAdaptive ? s.days : NO_DAYS))

  const info = useMemo<TargetsInfo>(() => {
    if (!profile) {
      const targets = fallbackTargets(targetOverrides)
      return {
        targets,
        baseTargets: targets,
        // Utan profil är åldern okänd – ingen veckobudget.
        targetsFor: () => targets,
        weeklyPlan: null,
        weeklyBlocked: null,
        energy: null,
        adaptive: null,
        weightKg: null,
        trendKg: null,
        adaptiveBlocked: null,
        exerciseAddBack: exerciseAddBack(addBackSetting, undefined, usable(targetOverrides.kcal)),
      }
    }
    const weights = weightsUntil(allWeights, today)
    const weightKg = weights.at(-1)?.kg ?? profile.startWeightKg
    const trend = weights.length > 0 ? weightTrend(weights, 0.1, today) : []
    const trendKg = trend.length > 0 ? trend[trend.length - 1].trend : null
    let adaptive: AdaptiveEstimate | null = null
    if (useAdaptive) {
      const intake: Record<ISODate, number> = {}
      for (const [d, list] of Object.entries(entries)) intake[d] = totals(list).kcal ?? 0
      adaptive = estimateAdaptiveTdee(adaptiveIntake(intake, (d) => days[d]?.complete === true, today), weights, today)
    }
    const opts = { today, adaptiveTdee: adaptive?.tdee, trendKg: trendKg ?? undefined }
    const energy = computeEnergy(profile, weightKg, opts)
    const targets = computeTargets(profile, weightKg, targetOverrides, opts)
    // Träningen följer inställningen bara när användarens eget energimål faktiskt används. Ett
    // ogiltigt eget mål (t.ex. NaN från en säkerhetskopia) eller ett som har höjts till golvet
    // (som bygger på den adaptiva förbrukningen) räknas inte – annars kunde träningen räknas två gånger.
    const ownKcal = usable(targetOverrides.kcal) && targets.kcal === targetOverrides.kcal
    // Veckobudgeten läggs ovanpå basmålet (egna mål och adaptiv förbrukning ingår redan), före
    // träningstillägget, och följer golvet varje dag (se lib/weeklyBudget).
    const weekly = resolveWeeklyBudget({ profile, energy, baseKcal: targets.kcal, setting: weeklySetting, today })
    const plan = weekly.plan
    return {
      targets,
      baseTargets: targets,
      targetsFor: plan ? (d: ISODate) => targetsForDate(targets, plan, d, targetOverrides) : () => targets,
      weeklyPlan: plan,
      weeklyBlocked: weekly.blocked,
      energy,
      adaptive,
      weightKg,
      trendKg,
      // Vid lågt BMI kan också en lägre uppmätt förbrukning vara spärrad – samma besked överallt.
      adaptiveBlocked: profileBlocked ?? energy.adaptiveBlocked,
      exerciseAddBack: exerciseAddBack(addBackSetting, energy.tdeeSource, ownKcal),
    }
  }, [profile, targetOverrides, useAdaptive, profileBlocked, addBackSetting, weeklySetting, allWeights, entries, days, today])

  return useMemo(() => {
    if (date === undefined) return info
    const targets = info.targetsFor(date)
    return targets === info.targets ? info : { ...info, targets }
  }, [info, date])
}
