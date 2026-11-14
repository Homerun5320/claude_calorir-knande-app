/**
 * Dagens måltider – ett kort per aktiverad måltid i användarens ordning. Avstängda måltider
 * som ändå har poster idag visas också (samma regel som i dagboken), så att allt som räknas
 * i Dagsringen går att hitta.
 *
 * Varje måltid är en fyrkant (två per rad) som visar energi och de första livsmedlen, och har en "+" som öppnar Lägg till
 * med rätt måltid och datum. Tomma måltider får en vänlig uppmaning – och om samma måltid
 * finns registrerad igår kan den kopieras med ett tryck (med ångra).
 */
import { memo, useCallback, useId, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Copy, Plus } from 'lucide-react'
import { EnergyValue, MealIcon } from '../../components/domain'
import { Chip, SectionTitle, toast } from '../../components/ui'
import { useDay } from '../../hooks/useDay'
import { addDays } from '../../lib/dates'
import { useDiaryStore } from '../../stores/diaryStore'
import type { DiaryEntry, ISODate, MealConfig, MealId } from '../../types'
import { visibleMeals } from '../diary/diaryLogic'
import { focusAfterRender } from '../diary/focus'
import { copyableCount, EMPTY_MEAL_HINTS, mealNamesText, newEntryIds, summarizeMeal, type MealSummary } from './todayLogic'
import { requireAccess } from '../premium/requireAccess'

const EMPTY_ENTRIES: DiaryEntry[] = []

/**
 * Kopiera gårdagens måltid till idag via butikens `copyMeal` och erbjud ångra. Returnerar true
 * om något kopierades. `copyMeal` returnerar bara antalet, så de nya posterna hittas genom att
 * jämföra före/efter.
 */
function copyYesterdayMeal(today: ISODate, meal: MealId, mealLabel: string): boolean {
  if (!requireAccess('kopiera')) return false
  const store = useDiaryStore.getState()
  const before = store.entries[today]
  const count = store.copyMeal(addDays(today, -1), meal, today, meal)
  if (count === 0) {
    toast('Det fanns inget att kopiera')
    return false
  }
  const ids = newEntryIds(before, useDiaryStore.getState().entries[today])
  toast(`Gårdagens ${mealLabel.toLowerCase()} är kopierad`, {
    tone: 'success',
    action: {
      label: 'Ångra',
      onClick: () => {
        useDiaryStore.getState().removeEntries(ids.map((id) => ({ date: today, id })))
      },
    },
  })
  return true
}

interface MealCardProps {
  meal: MealId
  name: string
  today: ISODate
  summary: MealSummary
  copyCount: number
  mindful: boolean
  onCopy: (meal: MealId, name: string) => boolean
}

const MealCard = memo(function MealCard({ meal, name, today, summary, copyCount, mindful, onCopy }: MealCardProps) {
  const empty = summary.count === 0
  const namesText = empty ? EMPTY_MEAL_HINTS[meal] : mealNamesText(summary)
  const cardLink = useRef<HTMLAnchorElement>(null)
  const copy = () => {
    // Kopieringsknappen försvinner när måltiden fylls – fokus till kortet, som nu visar maten.
    if (onCopy(meal, name)) focusAfterRender(() => cardLink.current)
  }
  return (
    // Fyrkant (två per rad, ca 170 px): ikon och plusknapp överst, namn, energi och innehåll nederst. @min-[19.5rem] är en
    // containerfråga i rem (följer rotens teckenstorlek): vid stor text (rotstorlek ca 24 px eller mer) blir det i stället
    // en kolumn utan fast form, så att inget klipps. Containern är wrappern i MealsOverview.
    <li className="card flex min-h-[10.5rem] flex-col p-3 @min-[19.5rem]:aspect-square">
      <div className="flex items-start justify-between gap-2">
        <span aria-hidden="true" className="contents">
          <MealIcon meal={meal} size="md" variant="emoji" />
        </span>
        <Link
          to={`/lagg-till?maltid=${meal}&datum=${today}`}
          aria-label={`Lägg till i ${name.toLowerCase()}`}
          className="grid size-[44px] shrink-0 place-items-center rounded-full bg-gran-soft text-gran transition-transform active:scale-90"
        >
          <Plus className="size-5" strokeWidth={2.4} aria-hidden="true" />
        </Link>
      </div>
      <Link ref={cardLink} to="/dagbok" className="mt-auto flex min-h-11 min-w-0 flex-col justify-end rounded-2xl pt-2">
        <span className="min-w-0 break-words font-display text-[1.125rem] leading-tight font-semibold tracking-tight text-ink">{name}</span>
        {!empty && !mindful && <EnergyValue kcal={summary.kcal} className="mt-0.5 text-sm font-semibold text-ink-2" />}
        <span className={`mt-0.5 line-clamp-2 text-[0.8125rem] leading-snug ${empty ? 'text-ink-3' : 'text-ink-2'}`}>{namesText}</span>
      </Link>
      {empty && copyCount > 0 && (
        <div className="mt-1.5">
          <Chip size="sm" icon={Copy} onClick={copy}>
            Kopiera gårdagens {name.toLowerCase()}
          </Chip>
        </div>
      )}
    </li>
  )
})

export interface MealsOverviewProps {
  today: ISODate
  meals: MealConfig[]
  mindful: boolean
}

export const MealsOverview = memo(function MealsOverview({ today, meals, mindful }: MealsOverviewProps) {
  const headingId = useId()
  const day = useDay(today)
  const yesterday = useDiaryStore((s) => s.entries[addDays(today, -1)] ?? EMPTY_ENTRIES)
  const shown = useMemo(() => visibleMeals(meals, day.byMeal), [meals, day.byMeal])
  const summaries = useMemo(() => {
    const out = {} as Record<MealId, MealSummary>
    for (const m of shown) out[m.id] = summarizeMeal(day.byMeal[m.id])
    return out
  }, [shown, day.byMeal])
  const onCopy = useCallback((meal: MealId, name: string) => copyYesterdayMeal(today, meal, name), [today])

  if (shown.length === 0) return null

  return (
    <section aria-labelledby={headingId}>
      <SectionTitle id={headingId} actionLabel="Dagbok" actionTo="/dagbok">
        Måltider
      </SectionTitle>
      <div className="@container">
        <ul className="grid grid-cols-1 gap-3 @min-[19.5rem]:grid-cols-2">
          {shown.map((m) => (
            <MealCard
              key={m.id}
              meal={m.id}
              name={m.name}
              today={today}
              summary={summaries[m.id]}
              copyCount={copyableCount(yesterday, m.id)}
              mindful={mindful}
              onCopy={onCopy}
            />
          ))}
        </ul>
      </div>
    </section>
  )
})
