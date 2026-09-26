/**
 * Dagens måltider – ett kort per aktiverad måltid i användarens ordning.
 *
 * Varje kort visar energi och de första livsmedlen, och har en "+" som öppnar Lägg till
 * med rätt måltid och datum. Tomma måltider får en vänlig uppmaning – och om samma måltid
 * finns registrerad igår kan den kopieras med ett tryck (med ångra).
 */
import { memo, useCallback, useId, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Copy, Plus } from 'lucide-react'
import { EnergyValue, MealIcon } from '../../components/domain'
import { Chip, SectionTitle, toast } from '../../components/ui'
import { useDay } from '../../hooks/useDay'
import { addDays } from '../../lib/dates'
import { useDiaryStore } from '../../stores/diaryStore'
import type { DiaryEntry, ISODate, MealConfig, MealId } from '../../types'
import { copyableCount, EMPTY_MEAL_HINTS, mealNamesText, newEntryIds, summarizeMeal, type MealSummary } from './todayLogic'

const EMPTY_ENTRIES: DiaryEntry[] = []

/**
 * Kopiera gårdagens måltid till idag via butikens `copyMeal` och erbjud ångra.
 * `copyMeal` returnerar bara antalet, så de nya posterna hittas genom att jämföra före/efter.
 */
function copyYesterdayMeal(today: ISODate, meal: MealId, mealLabel: string): void {
  const store = useDiaryStore.getState()
  const before = store.entries[today]
  const count = store.copyMeal(addDays(today, -1), meal, today, meal)
  if (count === 0) {
    toast('Det fanns inget att kopiera')
    return
  }
  const ids = newEntryIds(before, useDiaryStore.getState().entries[today])
  toast(`Gårdagens ${mealLabel.toLowerCase()} är kopierad`, {
    tone: 'success',
    action: {
      label: 'Ångra',
      onClick: () => {
        const { removeEntry } = useDiaryStore.getState()
        for (const id of ids) removeEntry(today, id)
      },
    },
  })
}

interface MealCardProps {
  meal: MealId
  name: string
  today: ISODate
  summary: MealSummary
  copyCount: number
  mindful: boolean
  onCopy: (meal: MealId, name: string) => void
}

const MealCard = memo(function MealCard({ meal, name, today, summary, copyCount, mindful, onCopy }: MealCardProps) {
  const empty = summary.count === 0
  const namesText = empty ? EMPTY_MEAL_HINTS[meal] : mealNamesText(summary)
  return (
    <li className="card p-3 pr-2.5">
      <div className="flex items-center gap-3">
        <Link to="/dagbok" className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-2xl">
          <MealIcon meal={meal} size="md" variant="emoji" />
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline gap-2">
              <span className="truncate font-display text-[1.0625rem] leading-tight font-semibold tracking-tight text-ink">{name}</span>
              {!empty && !mindful && <EnergyValue kcal={summary.kcal} className="ml-auto text-sm font-semibold text-ink-2" />}
            </span>
            <span className={`mt-0.5 block truncate text-[0.8125rem] ${empty ? 'text-ink-3 italic' : 'text-ink-2'}`}>{namesText}</span>
          </span>
        </Link>
        <Link
          to={`/lagg-till?maltid=${meal}&datum=${today}`}
          aria-label={`Lägg till i ${name.toLowerCase()}`}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-gran-soft text-gran transition-transform active:scale-90"
        >
          <Plus className="size-5" strokeWidth={2.4} aria-hidden="true" />
        </Link>
      </div>
      {empty && copyCount > 0 && (
        <div className="mt-2 pl-14">
          <Chip size="sm" icon={Copy} onClick={() => onCopy(meal, name)}>
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
  const enabled = useMemo(() => meals.filter((m) => m.enabled), [meals])
  const summaries = useMemo(() => {
    const out = {} as Record<MealId, MealSummary>
    for (const m of enabled) out[m.id] = summarizeMeal(day.byMeal[m.id])
    return out
  }, [enabled, day.byMeal])
  const onCopy = useCallback((meal: MealId, name: string) => copyYesterdayMeal(today, meal, name), [today])

  if (enabled.length === 0) return null

  return (
    <section aria-labelledby={headingId}>
      <SectionTitle id={headingId} actionLabel="Dagbok" actionTo="/dagbok">
        Måltider
      </SectionTitle>
      <ul className="space-y-2.5">
        {enabled.map((m) => (
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
    </section>
  )
})
