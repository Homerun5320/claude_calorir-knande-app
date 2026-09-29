/**
 * Veckoplanering (/planering) – planera veckans måltider och få inköpslistan på köpet.
 *
 * - En vecka i taget, måndag först. Veckan och fliken sparas i adressen (`?vecka=2026-09-28`,
 *   `?flik=inkop`) så att de finns kvar när man går tillbaka.
 * - Per dag och måltid planeras recept (egna och svenska klassiker), sparade måltider eller
 *   livsmedel med mängd. Planerad energi och protein visas mot dagsmålet i lugn ton.
 * - "Logga" lägger en planerad rad i dagboken för den dagen (spärras efter provperioden och i
 *   exemplet precis som annan loggning).
 * - Inköpslistan sammanställer veckans ingredienser per butiksavdelning, med bockar, egna rader och
 *   delning som text.
 */
import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CalendarDays, ChevronLeft, ChevronRight, ShoppingBasket } from 'lucide-react'
import type { ISODate } from '../../types'
import { Button, IconButton, PageHeader, Skeleton, Tabs, tabPanelProps } from '../../components/ui'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useTargets } from '../../hooks/useTargets'
import { useToday } from '../../hooks/useToday'
import { usePlanStore } from '../../stores/planStore'
import { addDays, isValidISODate } from '../../lib/dates'
import {
  buildShoppingList,
  relativeWeekLabel,
  remainingCount,
  weekItems,
  weekRangeText,
  weekStartOf,
  weekTitle,
  type PlanItem,
  type WeekShopping,
} from '../../lib/planning'
import { PlanAddSheet } from './PlanAddSheet'
import { PlanEditSheet } from './PlanEditSheet'
import { ShoppingListView } from './ShoppingListView'
import { WeekPlan } from './WeekPlan'
import { useDiaryEntries, useLogPlanItem, usePlanHydrated, useRecipeLookup, useWeekItems } from './usePlanning'

type Tab = 'plan' | 'inkop'

const TABS_ID = 'planering'
const EMPTY_WEEK: WeekShopping = { checked: [], extras: [] }

export default function PlanningPage() {
  const today = useToday()
  const [params, setParams] = useSearchParams()
  const currentWeek = weekStartOf(today)
  const weekParam = params.get('vecka')
  const weekStart = isValidISODate(weekParam) ? weekStartOf(weekParam) : currentWeek
  const tab: Tab = params.get('flik') === 'inkop' ? 'inkop' : 'plan'

  const setParam = useCallback(
    (key: string, value: string | null) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (value === null) next.delete(key)
          else next.set(key, value)
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )
  const setWeek = (ws: ISODate) => setParam('vecka', ws === currentWeek ? null : ws)
  const setTab = (t: Tab) => setParam('flik', t === 'inkop' ? 'inkop' : null)

  useDocumentTitle(tab === 'inkop' ? 'Inköpslista' : 'Veckoplanering')

  const hydrated = usePlanHydrated()
  const lookup = useRecipeLookup()
  // Varje dag får sitt eget mål – med veckobudgeten kan helgen ha lite mer än vardagarna.
  const { targetsFor } = useTargets(today)
  const entries = useDiaryEntries()
  const days = useWeekItems(weekStart)
  const allItems = usePlanStore((s) => s.items)
  const week = usePlanStore((s) => s.shopping[weekStart] ?? EMPTY_WEEK)
  const logItem = useLogPlanItem(lookup, today)

  const items = useMemo(() => weekItems(allItems, weekStart), [allItems, weekStart])
  const list = useMemo(() => buildShoppingList(items, lookup.resolve, { food: lookup.food }), [items, lookup.resolve, lookup.food])
  const checked = useMemo(() => new Set(week.checked), [week.checked])
  const remaining = remainingCount(list, week.extras, checked)
  // Listan blir komplett först när livsmedelsdatabasen och klassikerna har laddats: inbyggda recept
  // (även i sparade måltider) löses ut och gamla id:n i äldre recept räknas om till ersättaren.
  const waitingForRecipes = lookup.builtinLoading && items.length > 0

  const [addFor, setAddFor] = useState<ISODate | null>(null)
  const [editing, setEditing] = useState<PlanItem | null>(null)

  const relative = relativeWeekLabel(weekStart, today)

  return (
    <div className="px-4 pb-10">
      <PageHeader back eyebrow={relative ?? weekTitle(weekStart)} title="Veckoplanering" subtitle="Planera veckans måltider – inköpslistan fylls i av sig själv.">
        <div className="flex items-center gap-2">
          <IconButton icon={ChevronLeft} variant="secondary" aria-label="Föregående vecka" onClick={() => setWeek(addDays(weekStart, -7))} />
          <div className="min-w-0 flex-1 text-center" aria-live="polite" aria-atomic="true">
            <p className="font-display text-[1.125rem] font-semibold leading-tight tracking-tight text-ink">{weekTitle(weekStart)}</p>
            <p className="text-[0.8125rem] text-ink-3">{weekRangeText(weekStart, today)}</p>
          </div>
          <IconButton icon={ChevronRight} variant="secondary" aria-label="Nästa vecka" onClick={() => setWeek(addDays(weekStart, 7))} />
        </div>
        {weekStart !== currentWeek && (
          <div className="mt-2 flex justify-center">
            <Button size="sm" variant="ghost" onClick={() => setWeek(currentWeek)}>
              Till denna vecka
            </Button>
          </div>
        )}
        <Tabs
          id={TABS_ID}
          className="mt-4"
          variant="pill"
          aria-label="Planering eller inköpslista"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'plan', label: 'Planering', icon: CalendarDays },
            { value: 'inkop', label: 'Inköpslista', icon: ShoppingBasket, count: hydrated && !waitingForRecipes && remaining > 0 ? remaining : undefined },
          ]}
        />
      </PageHeader>

      <div {...tabPanelProps(TABS_ID, tab)} className="mx-auto max-w-3xl rounded-card">
        {!hydrated ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Laddar planeringen">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-32 w-full rounded-[1.5rem]" />
            ))}
          </div>
        ) : tab === 'plan' ? (
          <WeekPlan
            weekStart={weekStart}
            today={today}
            days={days}
            targetsFor={targetsFor}
            resolve={lookup.resolve}
            entries={entries}
            onAdd={setAddFor}
            onEdit={setEditing}
            onLog={logItem}
          />
        ) : (
          <ShoppingListView
            weekStart={weekStart}
            today={today}
            list={list}
            loading={waitingForRecipes}
            planned={items.length}
            onPlan={() => setTab('plan')}
          />
        )}
      </div>

      <PlanAddSheet date={addFor} onClose={() => setAddFor(null)} lookup={lookup} />
      <PlanEditSheet item={editing} onClose={() => setEditing(null)} lookup={lookup} />
    </div>
  )
}
