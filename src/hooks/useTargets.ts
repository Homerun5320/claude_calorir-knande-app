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
import type { DayMeta, DiaryEntry, ISODate, Targets, WeightEntry } from '../types'

export interface TargetsInfo {
  targets: Targets
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

/** Beräknade dagsmål (med användarens egna överskrivningar och ev. adaptiv förbrukning). */
export function useTargets(today: ISODate = todayISO()): TargetsInfo {
  const profile = useProfileStore((s) => s.profile)
  const targetOverrides = useProfileStore((s) => s.settings.targetOverrides)
  const adaptiveTargets = useProfileStore((s) => s.settings.adaptiveTargets)
  const addBackSetting = useProfileStore((s) => s.settings.exerciseAddBackPct)
  const allWeights = useBodyStore((s) => s.weights)
  // Graviditet, amning och under 18 år: formeln gäller även om adaptiva mål är påslagna.
  const profileBlocked = profile ? adaptiveBlockReasonFor(profile, today) : null
  const useAdaptive = adaptiveTargets && profileBlocked === null
  // Hela dagboken behövs bara för adaptiv förbrukning – annars prenumererar vi inte på den
  // (varje ny post skulle annars räkna om målen och rendera om alla som använder kroken).
  const entries = useDiaryStore((s) => (useAdaptive ? s.entries : NO_ENTRIES))
  const days = useDiaryStore((s) => (useAdaptive ? s.days : NO_DAYS))

  return useMemo(() => {
    if (!profile) {
      const targets = fallbackTargets(targetOverrides)
      return {
        targets,
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
    return {
      targets,
      energy,
      adaptive,
      weightKg,
      trendKg,
      // Vid lågt BMI kan också en lägre uppmätt förbrukning vara spärrad – samma besked överallt.
      adaptiveBlocked: profileBlocked ?? energy.adaptiveBlocked,
      exerciseAddBack: exerciseAddBack(addBackSetting, energy.tdeeSource, ownKcal),
    }
  }, [profile, targetOverrides, useAdaptive, profileBlocked, addBackSetting, allWeights, entries, days, today])
}
