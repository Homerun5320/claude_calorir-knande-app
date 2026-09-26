/**
 * Idag – första skärmen. Lugn, vacker och användbar i ett ögonkast.
 *
 * Ordning på mobil (uppifrån och ned):
 *  1. Säsongshuvud med hälsning, datum och matdag
 *  2. Dagsringen med makron
 *  3. Måltiderna
 *  4. Vatten
 *  5. Dagens tallrik
 *  6. Veckan
 *  7. Vikt
 *  8. Kostråden i veckan
 *  9. Dagens tips
 * 10. Sammanhangskort (fasta, träning, koffein, alkohol)
 * 11. Kvällsreflektion
 *
 * På bredare skärmar (≥ 768 px) ligger Dagsringen över två kolumner.
 *
 * Varje sektion prenumererar själv på det den behöver ur butikerna och är memoiserad, så att
 * t.ex. ett glas vatten inte renderar om hela sidan.
 */
import type { ReactNode } from 'react'
import { Skeleton, useMediaQuery } from '../../components/ui'
import { useTargets } from '../../hooks/useTargets'
import { useToday } from '../../hooks/useToday'
import type { PlateVariant } from '../../lib/plate'
import { useDiaryStore } from '../../stores/diaryStore'
import { useHydrated } from '../../stores/hydration'
import { useProfileStore } from '../../stores/profileStore'
import { ContextCards } from './ContextCards'
import { DayRingCard } from './DayRingCard'
import { EveningCheckIn } from './EveningCheckIn'
import { KostradCard } from './KostradCard'
import { MealsOverview } from './MealsOverview'
import { PlateCard } from './PlateCard'
import { Reveal } from './Reveal'
import { TipCard } from './TipCard'
import { TodayHeader } from './TodayHeader'
import { WaterCard } from './WaterCard'
import { WeekCard } from './WeekCard'
import { WeightCard } from './WeightCard'
import { WelcomeCard } from './WelcomeCard'
import { isDiaryEmpty } from './todayLogic'

type SectionId = 'welcome' | 'ring' | 'meals' | 'water' | 'plate' | 'week' | 'weight' | 'kostrad' | 'tip' | 'context' | 'evening'

const MOBILE_ORDER: readonly SectionId[] = ['welcome', 'ring', 'meals', 'water', 'plate', 'week', 'weight', 'kostrad', 'tip', 'context', 'evening']
const WIDE_TOP: readonly SectionId[] = ['welcome', 'ring']
const WIDE_LEFT: readonly SectionId[] = ['meals', 'plate', 'evening']
const WIDE_RIGHT: readonly SectionId[] = ['context', 'water', 'week', 'weight', 'kostrad', 'tip']

function TodaySkeleton() {
  return (
    <div className="pb-6" aria-busy="true" aria-label="Laddar dagens översikt">
      <div className="lg:px-4 lg:pt-4">
        <Skeleton className="h-[212px] w-full rounded-none lg:rounded-[1.75rem]" />
      </div>
      <div className="space-y-4 px-4 pt-2">
        <div className="card flex flex-col items-center p-5">
          <Skeleton circle className="size-56" />
          <div className="mt-6 grid w-full grid-cols-4 gap-2.5">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        </div>
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-[4.5rem] rounded-card" />
        ))}
      </div>
    </div>
  )
}

export default function TodayPage() {
  const hydrated = useHydrated()
  const today = useToday()
  const wide = useMediaQuery('(min-width: 768px)')
  const { targets } = useTargets(today)

  const mindful = useProfileStore((s) => s.settings.mindfulMode)
  const unit = useProfileStore((s) => s.settings.energyUnit)
  const meals = useProfileStore((s) => s.settings.meals)
  const addBackPct = useProfileStore((s) => s.settings.exerciseAddBackPct)
  const glassMl = useProfileStore((s) => s.settings.waterGlassMl)
  const showFiber = useProfileStore((s) => s.settings.dashboardNutrients.includes('fiber'))
  const activityLevel = useProfileStore((s) => s.profile?.activityLevel)
  const firstDay = useDiaryStore((s) => isDiaryEmpty(s.entries))

  if (!hydrated) return <TodaySkeleton />

  const plateVariant: PlateVariant = activityLevel === 'aktiv' || activityLevel === 'mycket_aktiv' ? 'aktiv' : 'vanlig'

  const sections: Record<SectionId, ReactNode> = {
    welcome: firstDay ? <WelcomeCard today={today} meals={meals} /> : null,
    ring: (
      <DayRingCard
        today={today}
        targets={targets}
        mindful={mindful}
        unit={unit}
        addBackPct={addBackPct}
        showFiber={showFiber}
        wide={wide}
      />
    ),
    meals: <MealsOverview today={today} meals={meals} mindful={mindful} />,
    water: <WaterCard today={today} targetMl={targets.waterMl} glassMl={glassMl} />,
    plate: <PlateCard today={today} variant={plateVariant} />,
    week: firstDay ? null : <WeekCard today={today} targetKcal={targets.kcal} addBackPct={addBackPct} mindful={mindful} unit={unit} />,
    // Vikten är siffror – i medvetet läge får den vila (den finns kvar under Vikt).
    weight: mindful ? null : <WeightCard today={today} />,
    kostrad: firstDay ? null : <KostradCard today={today} mindful={mindful} />,
    tip: <TipCard today={today} />,
    context: <ContextCards today={today} caffeineMaxMg={targets.caffeineMaxMg} addBackPct={addBackPct} mindful={mindful} />,
    evening: <EveningCheckIn today={today} mindful={mindful} />,
  }

  const column = (ids: readonly SectionId[], offset = 0) =>
    ids
      .filter((id) => sections[id] !== null)
      .map((id, i) => (
        <Reveal key={id} index={i + offset}>
          {sections[id]}
        </Reveal>
      ))

  return (
    <div className="pb-6">
      <TodayHeader today={today} />
      <div className="px-4 pt-1">
        {wide ? (
          <div className="flex flex-col gap-4">
            {column(WIDE_TOP)}
            <div className="grid grid-cols-2 items-start gap-4">
              <div className="flex min-w-0 flex-col gap-4">{column(WIDE_LEFT, 2)}</div>
              <div className="flex min-w-0 flex-col gap-4">{column(WIDE_RIGHT, 3)}</div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">{column(MOBILE_ORDER)}</div>
        )}
      </div>
    </div>
  )
}
