import { useMemo } from 'react'
import { useBodyStore } from '../stores/bodyStore'
import { useDiaryStore } from '../stores/diaryStore'
import { useProfileStore } from '../stores/profileStore'
import { todayISO } from '../lib/dates'
import { computeTargetsInfo, usesAdaptiveTargets, type TargetsInfo } from '../lib/targetsInfo'
import type { DayMeta, DiaryEntry, ISODate } from '../types'

export type { TargetsInfo } from '../lib/targetsInfo'

const NO_ENTRIES: Record<ISODate, DiaryEntry[]> = {}
const NO_DAYS: Record<ISODate, DayMeta> = {}

/**
 * Beräknade dagsmål (med användarens egna överskrivningar och ev. adaptiv förbrukning).
 * Beräkningen finns i `computeTargetsInfo` (src/lib/targetsInfo.ts), som hemskärmswidgeten också
 * använder – kroken väljer tillståndet ur butikerna och memoiserar.
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
  const exerciseAddBackPct = useProfileStore((s) => s.settings.exerciseAddBackPct)
  const weeklyBudget = useProfileStore((s) => s.settings.weeklyBudget)
  const weights = useBodyStore((s) => s.weights)
  // Hela dagboken behövs bara för adaptiv förbrukning – annars prenumererar vi inte på den
  // (varje ny post skulle annars räkna om målen och rendera om alla som använder kroken).
  const useAdaptive = usesAdaptiveTargets(profile, adaptiveTargets, today)
  const entries = useDiaryStore((s) => (useAdaptive ? s.entries : NO_ENTRIES))
  const days = useDiaryStore((s) => (useAdaptive ? s.days : NO_DAYS))

  const info = useMemo<TargetsInfo>(
    () => computeTargetsInfo({ profile, settings: { targetOverrides, adaptiveTargets, exerciseAddBackPct, weeklyBudget }, weights, entries, days }, today),
    [profile, targetOverrides, adaptiveTargets, exerciseAddBackPct, weeklyBudget, weights, entries, days, today],
  )

  return useMemo(() => {
    if (date === undefined) return info
    const targets = info.targetsFor(date)
    return targets === info.targets ? info : { ...info, targets }
  }, [info, date])
}
