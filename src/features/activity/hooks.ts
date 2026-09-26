/**
 * Hookar och butikshjälpare för aktivitetssidorna (träning, dryck, fasta).
 */
import { useEffect, useMemo, useState } from 'react'
import type { ActivityLevel, ExerciseEntry } from '../../types'
import { latestWeight, useBodyStore } from '../../stores/bodyStore'
import { useDiaryStore } from '../../stores/diaryStore'
import { useFastingStore, type FastRecord } from '../../stores/fastingStore'
import { useProfileStore } from '../../stores/profileStore'
import { FALLBACK_WEIGHT_KG } from './activityLogic'

/**
 * Aktuell tid (epoch ms) som uppdateras med ett intervall – men bara medan sidan syns.
 * När appen ligger i bakgrunden pausas klockan och den hämtar rätt tid direkt när man kommer tillbaka.
 */
export function useNow(intervalMs = 1000, enabled = true): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!enabled) return
    let id: number | undefined
    const tick = () => setNow(Date.now())
    const start = () => {
      if (id !== undefined) return
      tick()
      id = window.setInterval(tick, intervalMs)
    }
    const stop = () => {
      if (id === undefined) return
      window.clearInterval(id)
      id = undefined
    }
    const onVisibility = () => (document.visibilityState === 'hidden' ? stop() : start())
    onVisibility()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [intervalMs, enabled])
  return now
}

export interface BodyBasics {
  /** Senaste loggade vikt, annars startvikt, annars 70 kg. */
  weightKg: number
  /** false när vikten är en uppskattning (ingen profil och ingen loggad vikt). */
  weightKnown: boolean
  heightCm?: number
  activityLevel: ActivityLevel
}

/** Vikt, längd och aktivitetsnivå för energiberäkningar. Väljer primitiva värden – inga nya objekt i selektorer. */
export function useBodyBasics(): BodyBasics {
  const logged = useBodyStore((s) => latestWeight(s.weights)?.kg)
  const startWeight = useProfileStore((s) => s.profile?.startWeightKg)
  const heightCm = useProfileStore((s) => s.profile?.heightCm)
  const activityLevel = useProfileStore((s) => s.profile?.activityLevel) ?? 'latt'
  const known = logged ?? startWeight
  return useMemo(
    () => ({
      weightKg: known !== undefined && known > 0 ? known : FALLBACK_WEIGHT_KG,
      weightKnown: known !== undefined && known > 0,
      heightCm,
      activityLevel,
    }),
    [known, heightCm, activityLevel],
  )
}

/** Lägg tillbaka en borttagen träningspost med samma id och ordning (ångra). */
export function restoreExercise(entry: ExerciseEntry): void {
  useDiaryStore.getState().restoreExercise(entry)
}

/** Lägg tillbaka en borttagen fasta i historiken (ångra). Historiken är sorterad med senaste först. */
export function restoreFast(rec: FastRecord): void {
  const s = useFastingStore.getState()
  if (s.history.some((h) => h.id === rec.id)) return
  const history = [...s.history, rec].sort((a, b) => b.end - a.end)
  useFastingStore.setState({ history })
}
