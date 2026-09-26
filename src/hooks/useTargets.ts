import { useMemo } from 'react'
import { useBodyStore, latestWeight } from '../stores/bodyStore'
import { useDiaryStore } from '../stores/diaryStore'
import { useProfileStore } from '../stores/profileStore'
import { adaptiveIntake, computeEnergy, computeTargets, estimateAdaptiveTdee, type AdaptiveEstimate, type EnergyBreakdown } from '../lib/energy'
import { totals } from '../lib/diary'
import { todayISO } from '../lib/dates'
import type { DayMeta, DiaryEntry, ISODate, Targets } from '../types'

export interface TargetsInfo {
  targets: Targets
  energy: EnergyBreakdown | null
  adaptive: AdaptiveEstimate | null
  /** Vikten som målen baseras på. */
  weightKg: number | null
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

/** Beräknade dagsmål (med användarens egna överskrivningar och ev. adaptiv förbrukning). */
export function useTargets(today: ISODate = todayISO()): TargetsInfo {
  const profile = useProfileStore((s) => s.profile)
  const targetOverrides = useProfileStore((s) => s.settings.targetOverrides)
  const adaptiveTargets = useProfileStore((s) => s.settings.adaptiveTargets)
  const weights = useBodyStore((s) => s.weights)
  // Hela dagboken behövs bara för adaptiv förbrukning – annars prenumererar vi inte på den
  // (varje ny post skulle annars räkna om målen och rendera om alla som använder kroken).
  const entries = useDiaryStore((s) => (adaptiveTargets ? s.entries : NO_ENTRIES))
  const days = useDiaryStore((s) => (adaptiveTargets ? s.days : NO_DAYS))

  return useMemo(() => {
    if (!profile) return { targets: { ...FALLBACK, ...targetOverrides }, energy: null, adaptive: null, weightKg: null }
    const weightKg = latestWeight(weights)?.kg ?? profile.startWeightKg
    let adaptive: AdaptiveEstimate | null = null
    if (adaptiveTargets) {
      const intake: Record<ISODate, number> = {}
      for (const [d, list] of Object.entries(entries)) intake[d] = totals(list).kcal ?? 0
      adaptive = estimateAdaptiveTdee(adaptiveIntake(intake, (d) => days[d]?.complete === true, today), weights, today)
    }
    const opts = { today, adaptiveTdee: adaptive?.tdee }
    return {
      targets: computeTargets(profile, weightKg, targetOverrides, opts),
      energy: computeEnergy(profile, weightKg, opts),
      adaptive,
      weightKg,
    }
  }, [profile, targetOverrides, adaptiveTargets, weights, entries, days, today])
}
