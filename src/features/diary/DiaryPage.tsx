/**
 * Dagbok – /dagbok (idag) och /dagbok/:date.
 *
 * Uppifrån och ned:
 *  1. Rubrik med datumväljare (pilar, svep, "Till idag", veckonummer, hoppa via datumfält)
 *  2. Dagens summering: ätit / budget / kvar, makron, träning och vatten
 *  3. Tom dag: uppmaning att lägga till och "Kopiera gårdagen"
 *  4. Måltiderna (aktiverade, i inställningarnas ordning) med poster som går att ändra
 *  5. Träning, vatten, anteckningar och mående
 *  6. "Markera dagen som klar"
 *
 * Datumet ligger i adressen så att en dag går att länka till och webbläsarens bakåtknapp fungerar.
 * Framtida dagar (planering) är tillåtna och märks "Planerat".
 */
import { useCallback, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { BookmarkPlus, CircleCheck, Copy, CopyPlus, Eraser, MoreHorizontal, Plus, RotateCcw, Share2 } from 'lucide-react'
import { IconButton, PageHeader, Skeleton, confirmDialog, toast } from '../../components/ui'
import { DateNavigator, useSwipe } from '../../components/domain'
import { useDay } from '../../hooks/useDay'
import { useTargets } from '../../hooks/useTargets'
import { useToday } from '../../hooks/useToday'
import { addDays, relativeDayLabel } from '../../lib/dates'
import { dailyBudget } from '../../lib/diary'
import { useDiaryStore } from '../../stores/diaryStore'
import { useHydrated } from '../../stores/hydration'
import { useProfileStore } from '../../stores/profileStore'
import type { DiaryEntry, ISODate, MealId } from '../../types'
import { ActionSheet, type SheetAction } from './ActionSheet'
import { ExerciseSection, WaterSection } from './ActivitySections'
import { CompleteDayCard, EmptyDayCard, toggleDayComplete } from './DayCards'
import { DayNotesCard } from './DayNotesCard'
import { DaySummaryCard } from './DaySummaryCard'
import {
  addFoodHref,
  dayKind,
  dayPhrase,
  daySummaryText,
  defaultMealForDay,
  diaryPath,
  isValidISODate,
  MAX_FUTURE_DAYS,
  mealLabel,
  newEntryIds,
  shareTitle,
  templateItems,
  visibleMeals,
} from './diaryLogic'
import { EntrySheet, type EntryTarget } from './EntrySheet'
import { addFoodLink, firstAddFoodLink, focusAfterClose } from './focus'
import { MealSection } from './MealSection'
import { CopyMealSheet, SaveTemplateDialog, type MealSource } from './MealSheets'
import { shareOrCopy } from './share'

export default function DiaryPage() {
  const { date: param } = useParams<{ date?: string }>()
  const today = useToday()
  if (param !== undefined && !isValidISODate(param)) return <Navigate to="/dagbok" replace />
  return <DiaryView date={param ?? today} today={today} />
}

function DiarySkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Laddar dagboken">
      <div className="card space-y-4 p-5">
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
        <Skeleton className="h-2 w-full" />
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-9" />
          ))}
        </div>
      </div>
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-[4.5rem] rounded-card" />
      ))}
    </div>
  )
}

/** Swipe på innehållet – men inte när man markerar text i ett fält. */
function useContentSwipe(onPrev: () => void, onNext: () => void) {
  const swipedAt = useRef(0)
  const handlers = useSwipe({
    onSwipeLeft: () => {
      swipedAt.current = Date.now()
      onNext()
    },
    onSwipeRight: () => {
      swipedAt.current = Date.now()
      onPrev()
    },
  })
  return {
    ...handlers,
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if ((e.target as Element).closest('input, textarea, select, [data-no-swipe]')) return
      handlers.onPointerDown(e)
    },
    // Ett svep som slutar på en rad ska inte också öppna raden.
    onClickCapture: (e: ReactMouseEvent) => {
      if (Date.now() - swipedAt.current < 400) {
        e.preventDefault()
        e.stopPropagation()
      }
    },
  }
}

function DiaryView({ date, today }: { date: ISODate; today: ISODate }) {
  const navigate = useNavigate()
  const hydrated = useHydrated()
  const reduce = useReducedMotion() ?? false

  const meals = useProfileStore((s) => s.settings.meals)
  const mindful = useProfileStore((s) => s.settings.mindfulMode)
  const energyUnit = useProfileStore((s) => s.settings.energyUnit)
  const glassMl = useProfileStore((s) => s.settings.waterGlassMl)
  const showFiber = useProfileStore((s) => s.settings.dashboardNutrients.includes('fiber'))
  // Samma regel för träningen som Idag, Träning och Inställningar (`useTargets().exerciseAddBack`).
  const { targets, exerciseAddBack: addBack } = useTargets(today)
  const day = useDay(date)

  const kind = dayKind(date, today)
  const budget = dailyBudget(targets.kcal, day.exercise, addBack.pct)
  const enabledMeals = useMemo(() => meals.filter((m) => m.enabled), [meals])
  const shownMeals = useMemo(() => visibleMeals(meals, day.byMeal), [meals, day.byMeal])
  const complete = day.meta.complete === true
  const hasEntries = day.entries.length > 0
  const defaultMeal = defaultMealForDay(meals, date, today)

  // Riktning för innehållets animation när dagen byts.
  const [prevDate, setPrevDate] = useState(date)
  const [direction, setDirection] = useState(0)
  if (prevDate !== date) {
    setDirection(date > prevDate ? 1 : -1)
    setPrevDate(date)
  }

  const maxDate = addDays(today, MAX_FUTURE_DAYS)
  const goTo = useCallback((d: ISODate) => navigate(diaryPath(d, today), { replace: true }), [navigate, today])
  const swipe = useContentSwipe(
    () => goTo(addDays(date, -1)),
    () => {
      if (date < maxDate) goTo(addDays(date, 1))
    },
  )

  // ---- Ark och menyer -------------------------------------------------------
  const [editing, setEditing] = useState<EntryTarget | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [editSession, setEditSession] = useState(0)
  const [menuMeal, setMenuMeal] = useState<MealId | null>(null)
  const [mealMenuOpen, setMealMenuOpen] = useState(false)
  const [copySource, setCopySource] = useState<MealSource | null>(null)
  const [copyOpen, setCopyOpen] = useState(false)
  const [templateSource, setTemplateSource] = useState<MealSource | null>(null)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [dayMenuOpen, setDayMenuOpen] = useState(false)

  const openEntry = useCallback((entry: DiaryEntry) => {
    setEditing({ date: entry.date, id: entry.id })
    setEditSession((n) => n + 1)
    setEditOpen(true)
  }, [])
  const openMealMenu = useCallback((meal: MealId) => {
    setMenuMeal(meal)
    setMealMenuOpen(true)
  }, [])

  const jump = useCallback(
    (section: 'traning' | 'vatten') => {
      document.getElementById(`dagbok-${section}`)?.scrollIntoView?.({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
    },
    [reduce],
  )

  const clearMeal = async (meal: MealId) => {
    setMealMenuOpen(false)
    const list = (useDiaryStore.getState().entries[date] ?? []).filter((e) => e.meal === meal)
    if (list.length === 0) return
    const name = mealLabel(meals, meal)
    const ok = await confirmDialog({
      title: `Töm ${name.toLocaleLowerCase('sv-SE')}?`,
      message: `${list.length === 1 ? '1 post' : `${list.length} poster`} tas bort från ${dayPhrase(date, today)}. Du kan ångra direkt efteråt.`,
      tone: 'danger',
      confirmLabel: 'Töm',
      icon: Eraser,
    })
    if (!ok) return
    const store = useDiaryStore.getState()
    const removed = list.map((e) => store.removeEntry(date, e.id)).filter((e): e is DiaryEntry => e !== undefined)
    // "Fler val"-knappen försvinner med posterna – ge fokus till måltidens "Lägg till i …".
    focusAfterClose(() => addFoodLink(meal), firstAddFoodLink)
    toast(`${name} är tömd`, {
      action: {
        label: 'Ångra',
        onClick: () => {
          const s = useDiaryStore.getState()
          for (const e of removed) s.restoreEntry(e)
        },
      },
    })
  }

  const menuEntries = menuMeal ? (day.byMeal[menuMeal] ?? []) : []
  const mealActions: SheetAction[] = menuMeal
    ? [
        {
          id: 'add',
          label: 'Lägg till mat',
          icon: Plus,
          onSelect: () => {
            setMealMenuOpen(false)
            navigate(addFoodHref(menuMeal, date))
          },
        },
        {
          id: 'copy',
          label: 'Kopiera till …',
          description: 'Till idag, imorgon eller en annan dag',
          icon: Copy,
          chevron: true,
          disabled: menuEntries.length === 0,
          onSelect: () => {
            setMealMenuOpen(false)
            setCopySource({ date, meal: menuMeal })
            setCopyOpen(true)
          },
        },
        {
          id: 'template',
          label: 'Spara som måltid',
          description: 'Lägg till samma mat med ett tryck nästa gång',
          icon: BookmarkPlus,
          chevron: true,
          disabled: templateItems(menuEntries).length === 0,
          onSelect: () => {
            setMealMenuOpen(false)
            setTemplateSource({ date, meal: menuMeal })
            setTemplateOpen(true)
          },
        },
        {
          id: 'clear',
          label: 'Töm måltid',
          icon: Eraser,
          tone: 'danger',
          disabled: menuEntries.length === 0,
          onSelect: () => void clearMeal(menuMeal),
        },
      ]
    : []

  const copyDayToToday = () => {
    setDayMenuOpen(false)
    const store = useDiaryStore.getState()
    const before = store.entries[today]
    const n = store.copyDay(date, today)
    if (n === 0) return
    const ids = newEntryIds(before, useDiaryStore.getState().entries[today])
    toast(n === 1 ? '1 post kopierad till idag' : `${n} poster kopierade till idag`, {
      tone: 'success',
      action: {
        label: 'Ångra',
        onClick: () => {
          const s = useDiaryStore.getState()
          for (const id of ids) s.removeEntry(today, id)
        },
      },
    })
  }

  const shareDay = () => {
    const text = daySummaryText({
      date,
      today,
      meals,
      entries: day.entries,
      exercise: day.exercise,
      waterMl: day.waterMl,
      budgetKcal: budget,
      unit: energyUnit,
      mindful,
      complete,
    })
    // Web Share måste anropas direkt i klicket.
    const pending = shareOrCopy(shareTitle(date, today), text)
    setDayMenuOpen(false)
    void pending.then((outcome) => {
      if (outcome === 'copied') toast('Sammanfattningen är kopierad – klistra in den där du vill')
      else if (outcome === 'failed') toast('Det gick inte att dela just nu', { tone: 'error' })
    })
  }

  const dayActions: SheetAction[] = [
    {
      id: 'add',
      label: 'Lägg till mat',
      icon: Plus,
      onSelect: () => {
        setDayMenuOpen(false)
        navigate(addFoodHref(defaultMeal, date))
      },
    },
    ...(date !== today
      ? [
          {
            id: 'copy-day',
            label: 'Kopiera hela dagen till idag',
            description: hasEntries ? `${day.entries.length === 1 ? '1 post' : `${day.entries.length} poster`} läggs till idag` : 'Dagen är tom',
            icon: CopyPlus,
            disabled: !hasEntries,
            onSelect: copyDayToToday,
          } satisfies SheetAction,
        ]
      : []),
    {
      id: 'complete',
      label: complete ? 'Markera dagen som ej klar' : 'Markera dagen som klar',
      description: complete ? 'Öppna dagen igen' : 'Hjälper Lagom att räkna ut din förbrukning',
      icon: complete ? RotateCcw : CircleCheck,
      tone: complete ? 'default' : 'good',
      onSelect: () => {
        setDayMenuOpen(false)
        toggleDayComplete(date, !complete)
      },
    },
    {
      id: 'share',
      label: 'Dela dagens sammanfattning',
      description: 'Som text – via delning eller urklipp',
      icon: Share2,
      disabled: !hasEntries && day.exercise.length === 0 && day.waterMl <= 0,
      onSelect: shareDay,
    },
  ]

  const offset = reduce ? 0 : 20

  return (
    <div className="px-4 pb-8">
      <PageHeader
        title="Dagbok"
        compactTitle={`Dagbok · ${relativeDayLabel(date, today)}`}
        actions={<IconButton icon={MoreHorizontal} aria-label="Fler val för dagen" onClick={() => setDayMenuOpen(true)} />}
      >
        <div className="card rounded-[1.75rem] px-1 py-1.5">
          <DateNavigator date={date} onChange={goTo} today={today} maxFutureDays={MAX_FUTURE_DAYS} />
        </div>
      </PageHeader>

      {!hydrated ? (
        <DiarySkeleton />
      ) : (
        <div {...swipe}>
          <motion.div
            key={date}
            initial={reduce ? false : { opacity: 0, x: direction * offset }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            className="flex flex-col gap-4"
          >
            <DaySummaryCard
              kind={kind}
              entries={day.entries}
              totals={day.totals}
              exercise={day.exercise}
              waterMl={day.waterMl}
              targets={targets}
              budget={budget}
              mindful={mindful}
              energyUnit={energyUnit}
              showFiber={showFiber}
              complete={complete}
              onJump={jump}
            />

            {!hasEntries && <EmptyDayCard date={date} today={today} kind={kind} defaultMeal={defaultMeal} />}

            <section aria-labelledby="dagbok-maltider-rubrik" className="flex flex-col gap-3">
              <h2 id="dagbok-maltider-rubrik" className="sr-only">
                Måltider
              </h2>
              {shownMeals.map((meal) => (
                <MealSection
                  key={meal.id}
                  meal={meal}
                  entries={day.byMeal[meal.id] ?? []}
                  totals={day.mealTotals[meal.id] ?? {}}
                  date={date}
                  mindful={mindful}
                  energyUnit={energyUnit}
                  onOpenEntry={openEntry}
                  onOpenMenu={openMealMenu}
                />
              ))}
            </section>

            {/* Träning loggas när dagen är här – en planerad dag visar bara redan inlagda pass. */}
            {(kind !== 'future' || day.exercise.length > 0) && (
              <ExerciseSection
                date={date}
                exercise={day.exercise}
                mindful={mindful}
                energyUnit={energyUnit}
                addBackPct={addBack.pct}
                exerciseInTarget={addBack.includedInTarget}
                canLog={kind !== 'future'}
              />
            )}
            {kind !== 'future' && <WaterSection date={date} waterMl={day.waterMl} targetMl={targets.waterMl} glassMl={glassMl} />}
            <DayNotesCard key={date} date={date} planned={kind === 'future'} />
            {kind !== 'future' && hasEntries && <CompleteDayCard date={date} complete={complete} />}
          </motion.div>
        </div>
      )}

      <EntrySheet
        target={editing}
        session={editSession}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        today={today}
        meals={meals}
        mindful={mindful}
        energyUnit={energyUnit}
      />
      <ActionSheet
        open={mealMenuOpen}
        onClose={() => setMealMenuOpen(false)}
        title={menuMeal ? mealLabel(meals, menuMeal) : 'Måltid'}
        description={menuMeal ? `${menuEntries.length === 1 ? '1 post' : `${menuEntries.length} poster`} · ${relativeDayLabel(date, today)}` : undefined}
        actions={mealActions}
      />
      <CopyMealSheet
        source={copySource}
        open={copyOpen}
        onClose={() => setCopyOpen(false)}
        today={today}
        meals={enabledMeals}
        allMeals={meals}
      />
      <SaveTemplateDialog source={templateSource} open={templateOpen} onClose={() => setTemplateOpen(false)} meals={meals} />
      <ActionSheet
        open={dayMenuOpen}
        onClose={() => setDayMenuOpen(false)}
        title={relativeDayLabel(date, today)}
        description={kind === 'future' ? 'Planerad dag' : complete ? 'Dagen är markerad som klar' : undefined}
        actions={dayActions}
      />
    </div>
  )
}
