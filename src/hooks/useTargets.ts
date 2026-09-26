import { useMemo } from 'react'
import { useBodyStore, latestWeight } from '../stores/bodyStore'
import { useDiaryStore } from '../stores/diaryStore'
import { useProfileStore } from '../stores/profileStore'
import { computeEnergy, computeTargets, estimateAdaptiveTdee, type AdaptiveEstimate, type EnergyBreakdown } from '../lib/energy'
import { totals } from '../lib/diary'
import { todayISO } from '../lib/dates'
import type { ISODate, Targets } from '../types'

export interface TargetsInfo {
  targets: Targets
  energy: EnergyBreakdown | null
  adaptive: AdaptiveEstimate | null
  /** Vikten som målen baseras på. */
  weightKg: number | null
}

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
  const settings = useProfileStore((s) => s.settings)
  const weights = useBodyStore((s) => s.weights)
  const entries = useDiaryStore((s) => s.entries)

  return useMemo(() => {
    if (!profile) return { targets: { ...FALLBACK, ...settings.targetOverrides }, energy: null, adaptive: null, weightKg: null }
    const weightKg = latestWeight(weights)?.kg ?? profile.startWeightKg
    let adaptive: AdaptiveEstimate | null = null
    if (settings.adaptiveTargets) {
      const intake: Record<ISODate, number> = {}
      for (const [d, list] of Object.entries(entries)) intake[d] = totals(list).kcal ?? 0
      adaptive = estimateAdaptiveTdee(intake, weights, today)
    }
    const opts = { today, adaptiveTdee: adaptive?.tdee }
    return {
      targets: computeTargets(profile, weightKg, settings.targetOverrides, opts),
      energy: computeEnergy(profile, weightKg, opts),
      adaptive,
      weightKg,
    }
  }, [profile, settings.targetOverrides, settings.adaptiveTargets, weights, entries, today])
}
