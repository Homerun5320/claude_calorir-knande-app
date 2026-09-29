/**
 * Firar milstolparna (se `lib/milestones.ts`): en varm notis och konfetti första gången en
 * milstolpe nås – en gång per milstolpe, aldrig för exempeldata och aldrig när de är dolda.
 *
 * Monteras en gång i AppShell:
 *
 * ```tsx
 * const milestoneBurst = useMilestoneCelebration()
 * …
 * <ToastViewport />
 * <Confetti fire={milestoneBurst} fullscreen />
 * ```
 *
 * Kroken prenumererar på butikerna utan att rita om AppShell: den kontrollerar en kort stund efter
 * senaste ändringen (så att en loggning, en återställning eller en inläsning från en annan flik hinner
 * bli klar) och ritar bara om när något firas. Kontrollen görs inte medan
 * - appen visar exempeldata (`useAccess().demo` – samma markering som `isDemoData()`),
 * - profilen saknas eller välkomstflödet inte är klart,
 * - data inte kan sparas eller inte har lästs in (`isMemoryOnlyStorage()`, `hasNewerData()`) –
 *   annars kunde samma milstolpe firas igen vid nästa start, eller en sent inläst dagbok se ny ut,
 * - fliken är dold.
 *
 * Här finns också `useMilestones(today)` – samma beräkning som hook för sidan Milstolpar och Mer.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from '../../components/ui/toast'
import { todayISO } from '../../lib/dates'
import { isDemoData, subscribeDemoFlag } from '../../lib/demoFlag'
import { logError } from '../../lib/errorLog'
import {
  achievedIds,
  celebrationText,
  computeMilestones,
  milestoneOverview,
  planCelebration,
  waterGoalMl,
  type MilestoneDef,
  type MilestoneInput,
  type MilestoneOverview,
} from '../../lib/milestones'
import { useDiaryStore } from '../../stores/diaryStore'
import { useFoodStore } from '../../stores/foodStore'
import { usePlanStore } from '../../stores/planStore'
import { useProfileStore } from '../../stores/profileStore'
import { hasNewerData, isMemoryOnlyStorage, subscribeStorageStatus } from '../../stores/storage'
import type { ISODate } from '../../types'

/** Sökvägen till sidan Milstolpar. */
export const MILESTONES_PATH = '/mer/milstolpar'

/** Hur länge kroken väntar efter senaste ändringen innan den kontrollerar (ms). */
export const MILESTONE_CHECK_DELAY_MS = 1200

/** Underlaget för milstolparna ur butikerna just nu. */
function inputFromStores(): MilestoneInput {
  const diary = useDiaryStore.getState()
  const food = useFoodStore.getState()
  const { profile, settings } = useProfileStore.getState()
  return {
    entries: diary.entries,
    water: diary.water,
    exercise: diary.exercise,
    days: diary.days,
    recipes: food.recipes,
    customFoods: food.customFoods,
    templates: food.templates,
    planItems: usePlanStore.getState().items,
    waterGoalMl: waterGoalMl(profile, settings.targetOverrides),
  }
}

/**
 * Kontrollera milstolparna nu: spara nya som sedda och returnera dem som ska firas (tom lista om
 * inget ska firas). Sparar och firar ingenting för exempeldata, utan profil eller när data inte kan
 * sparas. Används av `useMilestoneCelebration` (exporteras för testerna).
 */
export function checkMilestones(today: ISODate = todayISO()): MilestoneDef[] {
  if (isDemoData() || hasNewerData() || isMemoryOnlyStorage()) return []
  const { profile, settings, updateSettings } = useProfileStore.getState()
  if (!profile || !settings.onboardingDone) return []
  const achieved = achievedIds(computeMilestones(inputFromStores(), today))
  const plan = planCelebration(achieved, settings.milestonesSeen, { hidden: settings.hideMilestones === true })
  if (plan.seen) updateSettings({ milestonesSeen: plan.seen })
  return plan.celebrate
}

/**
 * Firar nya milstolpar med en notis ("Visa" öppnar sidan Milstolpar). Returnerar en räknare som ökar
 * vid varje firande – ge den till `<Confetti fire={…} fullscreen />` (som respekterar reducerad rörelse).
 * `delayMs` finns för testerna.
 */
export function useMilestoneCelebration(delayMs: number = MILESTONE_CHECK_DELAY_MS): number {
  const [burst, setBurst] = useState(0)
  const navigate = useNavigate()
  const navigateRef = useRef(navigate)
  useEffect(() => {
    navigateRef.current = navigate
  })

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let disposed = false

    const run = () => {
      timer = undefined
      if (disposed || document.visibilityState === 'hidden') return
      try {
        const celebrate = checkMilestones()
        if (celebrate.length === 0) return
        toast(celebrationText(celebrate), {
          tone: 'success',
          action: { label: 'Visa', onClick: () => navigateRef.current(MILESTONES_PATH) },
        })
        setBurst((n) => n + 1)
      } catch (error) {
        logError(error, 'milstolpar')
      }
    }
    const schedule = () => {
      if (disposed) return
      if (timer !== undefined) clearTimeout(timer)
      timer = setTimeout(run, delayMs)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') schedule()
    }

    const unsubscribe = [
      useProfileStore.subscribe(schedule),
      useDiaryStore.subscribe(schedule),
      useFoodStore.subscribe(schedule),
      usePlanStore.subscribe(schedule),
      subscribeDemoFlag(schedule),
      subscribeStorageStatus(schedule),
    ]
    document.addEventListener('visibilitychange', onVisibility)
    schedule()
    return () => {
      disposed = true
      if (timer !== undefined) clearTimeout(timer)
      unsubscribe.forEach((u) => u())
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [delayMs])

  return burst
}

/**
 * Uppnådda och kommande milstolpar för sidan Milstolpar och kortet i Mer. Väljer fälten var för
 * sig (inga nya objekt i selektorerna) och räknar bara om när underlaget ändras.
 */
export function useMilestones(today: ISODate): MilestoneOverview {
  const entries = useDiaryStore((s) => s.entries)
  const water = useDiaryStore((s) => s.water)
  const exercise = useDiaryStore((s) => s.exercise)
  const days = useDiaryStore((s) => s.days)
  const recipes = useFoodStore((s) => s.recipes)
  const customFoods = useFoodStore((s) => s.customFoods)
  const templates = useFoodStore((s) => s.templates)
  const planItems = usePlanStore((s) => s.items)
  const sex = useProfileStore((s) => s.profile?.sex)
  const lifeStage = useProfileStore((s) => s.profile?.lifeStage)
  const waterOverride = useProfileStore((s) => s.settings.targetOverrides.waterMl)
  const seen = useProfileStore((s) => s.settings.milestonesSeen)
  const meals = useProfileStore((s) => s.settings.meals)

  return useMemo(() => {
    const goal = waterGoalMl(sex && lifeStage ? { sex, lifeStage } : null, { waterMl: waterOverride })
    const statuses = computeMilestones(
      { entries, water, exercise, days, recipes, customFoods, templates, planItems, waterGoalMl: goal },
      today,
    )
    return milestoneOverview(statuses, {
      seen,
      fikaEnabled: !Array.isArray(meals) || meals.some((m) => m.id === 'fika' && m.enabled),
    })
  }, [entries, water, exercise, days, recipes, customFoods, templates, planItems, sex, lifeStage, waterOverride, seen, meals, today])
}
