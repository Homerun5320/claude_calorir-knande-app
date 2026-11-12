/**
 * Idag – första skärmen. Lugn, vacker och användbar i ett ögonkast.
 *
 * Ordning på mobil (uppifrån och ned):
 *  1. Säsongshuvud med hälsning, datum och matdag
 *  2. Dagsringen med makron
 *  3. Måltiderna
 *  4. Vatten
 *  5. Kosttillskott (bara när användaren har lagt till tillskott)
 *  6. Veckans fokus (bara när ett fokus är valt)
 *  7. Kvällsreflektion (med veckans fokus summerat på söndagar)
 *  8. "Mer om din dag" – en hopfälld rad med dagens tallrik, veckan, vikt, kostråd, dagens tips och
 *     sammanhangskort (fasta, träning, koffein, alkohol), så att sidan förblir lugn och kort
 *
 * Överst (när det behövs): markeringen för exempeldata och provperioden – diskret som ett chip,
 * tydligare de sista dagarna och som ett lugnt kort när den är slut.
 *
 * På bredare skärmar (≥ 768 px) ligger Dagsringen över två kolumner och "Mer om din dag" under dem.
 *
 * Varje sektion prenumererar själv på det den behöver ur butikerna och är memoiserad, så att
 * t.ex. ett glas vatten inte renderar om hela sidan.
 */
import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'
import { Skeleton, useMediaQuery } from '../../components/ui'
import { useTargets } from '../../hooks/useTargets'
import { useToday } from '../../hooks/useToday'
import type { PlateVariant } from '../../lib/plate'
import type { Food } from '../../types'
import { isSupplementFood } from '../../data/supplements'
import { focusGoal } from '../../lib/focusGoals'
import { weeklyDayNote } from '../../lib/weeklyBudget'
import { useDiaryStore } from '../../stores/diaryStore'
import { useFoodStore } from '../../stores/foodStore'
import { useHydrated } from '../../stores/hydration'
import { useProfileStore } from '../../stores/profileStore'
import { ContextCards } from './ContextCards'
import { DayRingCard } from './DayRingCard'
import { EveningCheckIn } from './EveningCheckIn'
import { FocusCard } from './FocusCard'
import { KostradCard } from './KostradCard'
import { MealsOverview } from './MealsOverview'
import { PlateCard } from './PlateCard'
import { Reveal } from './Reveal'
import { SupplementsCard } from './SupplementsCard'
import { TipCard } from './TipCard'
import { TodayHeader } from './TodayHeader'
import { WaterCard } from './WaterCard'
import { WeekCard } from './WeekCard'
import { MindfulCareCard, WeightCard } from './WeightCard'
import { WelcomeCard } from './WelcomeCard'
import { isDiaryEmpty } from './todayLogic'
import { TrialBanner } from '../premium/TrialBanner'
import { DemoBanner } from '../onboarding/DemoBanner'
import InstallHintCard from './InstallHintCard'

type SectionId =
  | 'welcome'
  | 'ring'
  | 'meals'
  | 'water'
  | 'supplements'
  | 'plate'
  | 'focus'
  | 'week'
  | 'weight'
  | 'kostrad'
  | 'tip'
  | 'context'
  | 'evening'

/** Det man använder varje dag – alltid synligt. */
const MOBILE_ORDER: readonly SectionId[] = ['welcome', 'ring', 'meals', 'water', 'supplements', 'focus', 'evening']
/** Resten ligger samlat under raden "Mer om din dag" (se MoreOfDay). */
const MORE_ORDER: readonly SectionId[] = ['plate', 'week', 'weight', 'kostrad', 'tip', 'context']
const WIDE_TOP: readonly SectionId[] = ['welcome', 'ring']
const WIDE_LEFT: readonly SectionId[] = ['meals', 'supplements', 'evening']
const WIDE_RIGHT: readonly SectionId[] = ['water', 'focus']

/** Har användaren lagt till kosttillskott? (Boolean – stabilt värde för selektorn.) */
function hasSupplementFoods(customFoods: Record<string, Food>): boolean {
  for (const id in customFoods) if (isSupplementFood(customFoods[id])) return true
  return false
}

/**
 * "Mer om din dag": tallrik, vecka, vikt, kostråd, tips och sammanhangskort bakom en enda lugn rad,
 * så att Idag är kort och går att ta in i ett ögonkast. Ett vanligt <details>: tangentbord och
 * skärmläsare fungerar utan egen kod, och innehållet ligger kvar i sidan (utskrift och sökning på sidan).
 */
function MoreOfDay({ children }: { children: ReactNode }) {
  return (
    <details className="group rounded-card border border-line bg-surface/60 print:border-0 print:bg-transparent">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-card px-4 py-2 marker:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gran [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block font-display text-lg text-ink">Mer om din dag</span>
          <span className="block text-sm text-ink-3">Tallrik, veckan, vikt, kostråd och tips</span>
        </span>
        <ChevronDown aria-hidden className="size-5 shrink-0 text-ink-2 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" />
      </summary>
      <div className="flex flex-col gap-4 px-2 pb-3 pt-1 print:px-0">{children}</div>
    </details>
  )
}

function TodaySkeleton() {
  return (
    <div className="pb-6" role="status" aria-busy="true">
      <span className="sr-only">Laddar dagens översikt …</span>
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
  // Dagens mål (med veckobudgetens förskjutning för idag) och basmålet för veckokortets snittlinje.
  const { targets, baseTargets, energy, exerciseAddBack, weeklyPlan } = useTargets(today, today)
  const goalPause = energy?.goalPause ?? null

  const mindful = useProfileStore((s) => s.settings.mindfulMode)
  const unit = useProfileStore((s) => s.settings.energyUnit)
  const meals = useProfileStore((s) => s.settings.meals)
  const glassMl = useProfileStore((s) => s.settings.waterGlassMl)
  const showFiber = useProfileStore((s) => s.settings.dashboardNutrients.includes('fiber'))
  const activityLevel = useProfileStore((s) => s.profile?.activityLevel)
  const firstDay = useDiaryStore((s) => isDiaryEmpty(s.entries))
  const hasFocus = useProfileStore((s) => focusGoal(s.settings.weeklyFocus?.id) !== undefined)
  const hasSupplements = useFoodStore((s) => hasSupplementFoods(s.customFoods))

  if (!hydrated) return <TodaySkeleton />

  // Med adaptiv förbrukning ingår träningen redan i dagsmålet – då läggs den inte till igen.
  const { pct: addBackPct, includedInTarget: exerciseInTarget } = exerciseAddBack

  const plateVariant: PlateVariant = activityLevel === 'aktiv' || activityLevel === 'mycket_aktiv' ? 'aktiv' : 'vanlig'
  const weeklyNote = weeklyDayNote(weeklyPlan, today, { unit, mindful })

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
        weeklyNote={weeklyNote}
      />
    ),
    meals: <MealsOverview today={today} meals={meals} mindful={mindful} />,
    water: <WaterCard today={today} targetMl={targets.waterMl} glassMl={glassMl} />,
    // Korten själva returnerar null när inga tillskott finns eller inget fokus är valt.
    supplements: hasSupplements ? <SupplementsCard today={today} /> : null,
    plate: <PlateCard today={today} variant={plateVariant} />,
    focus: hasFocus ? <FocusCard today={today} mindful={mindful} /> : null,
    week: firstDay ? null : (
      <WeekCard today={today} targetKcal={baseTargets.kcal} weeklyPlan={weeklyPlan} addBackPct={addBackPct} mindful={mindful} unit={unit} />
    ),
    // Vikten är siffror – i medvetet läge får den vila (den finns kvar under Vikt). Är vikten låg,
    // går den ner för fort eller är viktmålet pausat visas ändå en varsam notis, utan siffror –
    // oavsett mål (medvetet läge ger oftast målet "behålla vikten"). Kortet renderar annars inget.
    weight: mindful ? <MindfulCareCard today={today} goalPause={goalPause} /> : <WeightCard today={today} goalPause={goalPause} />,
    kostrad: firstDay ? null : <KostradCard today={today} mindful={mindful} />,
    tip: <TipCard today={today} />,
    context: (
      <ContextCards
        today={today}
        caffeineMaxMg={targets.caffeineMaxMg}
        addBackPct={addBackPct}
        exerciseInTarget={exerciseInTarget}
        mindful={mindful}
      />
    ),
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

  // "Mer om din dag" visas bara när något av korten under den har något att visa.
  const more = MORE_ORDER.some((id) => sections[id] !== null) ? (
    <Reveal index={MOBILE_ORDER.length}>
      <MoreOfDay>{column(MORE_ORDER)}</MoreOfDay>
    </Reveal>
  ) : null

  return (
    <div className="pb-6">
      <TodayHeader today={today} />
      <div className="px-4 pt-1">
        <div className="mb-4 flex flex-col gap-3 empty:hidden">
          <InstallHintCard />
          <DemoBanner />
          <TrialBanner />
        </div>
        {wide ? (
          <div className="flex flex-col gap-4">
            {column(WIDE_TOP)}
            <div className="grid grid-cols-2 items-start gap-4">
              <div className="flex min-w-0 flex-col gap-4">{column(WIDE_LEFT, 2)}</div>
              <div className="flex min-w-0 flex-col gap-4">{column(WIDE_RIGHT, 3)}</div>
            </div>
            {more}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {column(MOBILE_ORDER)}
            {more}
          </div>
        )}
      </div>
    </div>
  )
}
