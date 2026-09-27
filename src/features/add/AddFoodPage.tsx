/**
 * Lägg till mat – det viktigaste flödet i Lagom.
 *
 * /lagg-till?maltid=frukost&datum=2026-09-26&flik=senaste&q=gröt
 *
 * - Sök direkt bland 1 000+ svenska livsmedel (lokalt, fungerar offline) och vid behov i Open Food Facts.
 * - Utan sökning: "Brukar du äta till frukost" (ett tryck lägger i korgen), kopiera från igår,
 *   senaste, favoriter, egna livsmedel/recept och sparade måltider.
 * - Tryck på en rad → välj mängd → "Lägg till i Frukost" (eller "Lägg i korgen"). "+" på raden
 *   lägger till direkt med förvald mängd. Håll inne (högerklicka) en rad för detaljer.
 * - Korgen samlar flera livsmedel och läggs till i ett svep – en vanlig frukost tar sekunder.
 *   När korgen har något i sig blir "Lägg i korgen" huvudknappen i portionsarket, så att varje
 *   nytt livsmedel fortfarande bara är ett tryck.
 * - Dator: sök → Enter (första träffen) → skriv mängd → Enter.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  CalendarDays,
  Check,
  ChefHat,
  ChevronDown,
  Copy,
  History,
  Plus,
  ScanBarcode,
  Search,
  ShoppingBasket,
  Sparkles,
  Trash2,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type { DiaryEntry, Food, MealTemplate, UnitKey } from '../../types'
import {
  Button,
  EmptyState,
  IconButton,
  PageHeader,
  SkeletonRow,
  Spinner,
  Tabs,
  TextField,
  confirmDialog,
  cx,
  tabPanelProps,
  toast,
  useMediaQuery,
} from '../../components/ui'
import { CategoryIcon, EnergyValue, MealIcon, describeAmount } from '../../components/domain'
import { initialSelection, isUsableUnit } from '../../components/domain/PortionPicker'
import { useProfileStore } from '../../stores/profileStore'
import { useFoodStore, type FoodUsage } from '../../stores/foodStore'
import { useDiaryStore } from '../../stores/diaryStore'
import { useToday } from '../../hooks/useToday'
import { useFoodResolver } from '../../hooks/useFood'
import { useFavoriteFoods, useFoodSearch, useRecentFoods } from '../../hooks/useFoodSearch'
import { recipeFood } from '../../lib/foodRepo'
import { totals } from '../../lib/diary'
import { addDays, formatDayShort, relativeDayLabel } from '../../lib/dates'
import { mealName } from '../../lib/meals'
import {
  ADD_TABS,
  ADD_TAB_LABELS,
  countLabel,
  foodDetailHref,
  itemTotals,
  mealSuggestions,
  newFoodHref,
  parseAddParams,
  scanHref,
  type AddTab,
} from './addLogic'
import { useAddFood } from './useAddFood'
import { useBasketStore, type BasketItem } from './basketStore'
import { AddRow, MealChips, RowList, useLeave } from './components'
import { PortionSheet, type SheetAction } from './PortionSheet'
import { QuickAddSheet } from './QuickAddSheet'
import { BasketBar, BasketSheet } from './Basket'
import { OnlineSearch } from './OnlineSearch'

const EMPTY_ENTRIES: DiaryEntry[] = []
const TABS_ID = 'lagg-till-flikar'

interface Picked {
  food: Food
  /** Satt när en vara i korgen redigeras. */
  basketKey?: string
  /** Korgen hade innehåll när arket öppnades – då är "Lägg i korgen" huvudknappen. */
  basketFirst?: boolean
  amount?: number
  unit?: UnitKey
}

/** Skärmläsartext för sökresultatet. */
export function searchAnnouncement(q: string, count: number): string {
  if (count === 0) return `Inga träffar för ”${q}”. Prova ett annat ord, sök online eller snabbregistrera.`
  return `${count === 1 ? '1 träff' : `${count} träffar`} för ”${q}”`
}

export default function AddFoodPage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const leave = useLeave()
  const today = useToday()
  const desktop = useMediaQuery('(hover: hover) and (pointer: fine)')
  const meals = useProfileStore((s) => s.settings.meals)
  const mindful = useProfileStore((s) => s.settings.mindfulMode)
  const usage = useFoodStore((s) => s.usage)

  const { date, meal, tab } = useMemo(() => parseAddParams(params, meals, today), [params, meals, today])
  const mealLabel = mealName(meals, meal)
  const exitTo = date === today ? '/' : `/dagbok/${date}`

  const setParam = useCallback(
    (key: string, value: string | null) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (value === null || value === '') next.delete(key)
          else next.set(key, value)
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )

  // Lås måltid och datum i adressen så att de inte ändras om klockan passerar en måltidsgräns.
  useEffect(() => {
    if (params.get('maltid') !== meal || params.get('datum') !== date) {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.set('maltid', meal)
          next.set('datum', date)
          return next
        },
        { replace: true },
      )
    }
  }, [params, meal, date, setParams])

  // --- Sökning ---------------------------------------------------------------
  const [query, setQuery] = useState(() => params.get('q') ?? '')
  const q = query.trim()
  const searchRef = useRef<HTMLInputElement>(null)
  const { results, loading, pending } = useFoodSearch(q, { meal, limit: 40 })

  // Spara söktexten i adressen (fördröjt) så att den finns kvar efter ett besök på detaljsidan.
  const urlQuery = params.get('q') ?? ''
  useEffect(() => {
    if (urlQuery === q) return
    const t = window.setTimeout(() => setParam('q', q || null), 400)
    return () => window.clearTimeout(t)
  }, [q, urlQuery, setParam])

  // --- Korg ---------------------------------------------------------------
  const basketItems = useBasketStore((s) => s.items)
  const basketAdd = useBasketStore((s) => s.add)
  const basketUpdate = useBasketStore((s) => s.update)
  const basketRemove = useBasketStore((s) => s.remove)
  const basketClear = useBasketStore((s) => s.clear)
  const basketCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const i of basketItems) m.set(i.food.id, (m.get(i.food.id) ?? 0) + 1)
    return m
  }, [basketItems])
  const basketCount = useCallback((id: string) => basketCounts.get(id) ?? 0, [basketCounts])
  const [basketOpen, setBasketOpen] = useState(false)

  // --- Åtgärder -------------------------------------------------------------
  const { addFood, addMany, addTemplate } = useAddFood()
  const [picked, setPicked] = useState<Picked | null>(null)
  const [quickOpen, setQuickOpen] = useState(false)

  const pick = useCallback((food: Food) => setPicked({ food, basketFirst: useBasketStore.getState().items.length > 0 }), [])
  const details = useCallback(
    (food: Food) => navigate(foodDetailHref(food.id, { meal, date }), { state: { from: 'lagg-till' } }),
    [navigate, meal, date],
  )
  const quickAdd = useCallback(
    (food: Food) => {
      const sel = initialSelection(food, { usage: useFoodStore.getState().usage[food.id] })
      addFood(food, sel.amount, sel.unit, { date, meal })
    },
    [addFood, date, meal],
  )
  const goScan = () => navigate(scanHref({ meal, date }), { state: { from: 'lagg-till' } })

  const commitBasket = () => {
    const items = useBasketStore.getState().items
    if (items.length === 0) return
    const entries = addMany(items, { date, meal })
    if (entries.length === 0) return
    basketClear()
    setBasketOpen(false)
    leave(exitTo)
  }

  const close = async () => {
    const n = useBasketStore.getState().items.length
    if (n > 0) {
      const ok = await confirmDialog({
        title: 'Lämna utan att lägga till?',
        message: `Korgen innehåller ${countLabel(n)} som inte har lagts till i dagboken ännu.`,
        confirmLabel: 'Släng korgen',
        cancelLabel: 'Stanna kvar',
        tone: 'danger',
      })
      if (!ok) return
      basketClear()
    }
    leave(exitTo)
  }

  // Skärmläsare: berätta hur många träffar det blev när sökningen har landat.
  const settled = q !== '' && !loading && !pending
  const announcement = settled ? searchAnnouncement(q, results.length) : ''
  const [announced, setAnnounced] = useState('')
  useEffect(() => {
    const t = window.setTimeout(() => setAnnounced(announcement), 500)
    return () => window.clearTimeout(t)
  }, [announcement])

  // På dator: markera söktexten när arket stängts så att nästa livsmedel kan skrivas direkt.
  const refocusSearch = () => {
    if (desktop) window.setTimeout(() => searchRef.current?.select(), 250)
  }
  const toBasket: SheetAction = {
    label: 'Lägg i korgen',
    icon: ShoppingBasket,
    onClick: (amount, unit) => {
      if (picked) basketAdd(picked.food, amount, unit, 'search')
      setPicked(null)
      refocusSearch()
    },
  }
  const addDirect = (label: string): SheetAction => ({
    label,
    icon: Plus,
    onClick: (amount, unit) => {
      if (!picked || !addFood(picked.food, amount, unit, { date, meal })) return
      setPicked(null)
      refocusSearch()
    },
  })
  const saveEdit: SheetAction = {
    label: 'Spara ändring',
    icon: Check,
    onClick: (amount, unit) => {
      if (picked?.basketKey) basketUpdate(picked.basketKey, amount, unit)
      setPicked(null)
      setBasketOpen(true)
    },
  }
  // Behåll knapparna medan arket animeras ut (annars byter de etikett under utgången).
  const [lastPicked, setLastPicked] = useState<Picked | null>(null)
  if (picked && picked !== lastPicked) setLastPicked(picked)
  const sheetMode = picked ?? lastPicked
  const [sheetPrimary, sheetSecondary]: [SheetAction, SheetAction | undefined] = sheetMode?.basketKey
    ? [saveEdit, undefined]
    : sheetMode?.basketFirst
      ? [toBasket, { ...addDirect('Lägg till direkt'), icon: undefined }]
      : [addDirect(`Lägg till i ${mealLabel}`), toBasket]

  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && results[0]) {
      e.preventDefault()
      pick(results[0].food)
    } else if (e.key === 'Escape' && query) {
      e.preventDefault()
      setQuery('')
    }
  }

  return (
    <div className="px-4 pb-40">
      <PageHeader
        eyebrow={<DateButton date={date} today={today} onChange={(d) => setParam('datum', d)} />}
        title="Lägg till"
        compactTitle={`Lägg till i ${mealLabel}`}
        actions={
          <>
            <IconButton icon={ScanBarcode} aria-label="Skanna streckkod" onClick={goScan} />
            <IconButton icon={X} aria-label="Stäng" onClick={close} />
          </>
        }
      >
        <MealChips value={meal} onChange={(m) => setParam('maltid', m)} />
      </PageHeader>

      <div className="sticky top-[calc(3.5rem_+_env(safe-area-inset-top))] z-20 -mx-4 bg-bg/85 px-4 pb-3 pt-1 backdrop-blur-xl">
        <TextField
          ref={searchRef}
          label="Sök livsmedel"
          labelHidden
          prefix={Search}
          clearable
          value={query}
          onValueChange={setQuery}
          onKeyDown={onSearchKey}
          placeholder="Sök bland 1 000+ svenska livsmedel"
          autoFocus={desktop}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          inputMode="search"
          enterKeyHint="search"
          fieldClassName="h-14! rounded-[1.25rem] bg-surface shadow-card"
        />
      </div>

      {q ? (
        <section aria-label="Sökresultat" className="flex flex-col gap-5">
          {loading && (
            <p className="flex items-center gap-2 px-1 text-sm text-ink-3" role="status">
              <Spinner className="size-4" /> Läser in livsmedelsdatabasen …
            </p>
          )}
          {results.length > 0 ? (
            <div>
              <h2 className="eyebrow mb-2 px-1">Livsmedel</h2>
              <RowList className={cx('transition-opacity', pending && 'opacity-60')}>
                {results.map((r) => (
                  <li key={r.food.id}>
                    <AddRow
                      food={r.food}
                      onPick={pick}
                      onQuickAdd={quickAdd}
                      onDetails={details}
                      inBasket={basketCount(r.food.id)}
                      {...lastAmount(usage, r.food)}
                    />
                  </li>
                ))}
              </RowList>
              <p className="mt-2 px-1 text-xs text-ink-3">
                Lagom = granskad svensk databas · LMV = Livsmedelsverket · {desktop ? 'Högerklicka på' : 'Håll inne'} en rad för detaljer.
              </p>
            </div>
          ) : loading || pending ? (
            <RowList>
              {Array.from({ length: 5 }, (_, i) => (
                <li key={i} className="py-2">
                  <SkeletonRow />
                </li>
              ))}
            </RowList>
          ) : (
            <EmptyState
              compact
              illustration="search"
              title={`Inga träffar för ”${q}”`}
              text="Prova ett annat ord eller en kortare stavning – eller leta bland märkesvaror online."
            />
          )}

          <OnlineSearch query={q} onPick={pick} onQuickAdd={quickAdd} onDetails={details} basketCount={basketCount} />

          <div className="flex flex-col items-center gap-2 pb-2 text-center">
            <p className="text-sm text-ink-2">Hittar du inte det du söker?</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="outline" size="sm" iconLeft={Plus} to={newFoodHref({ name: q, meal, date })}>
                Skapa eget livsmedel
              </Button>
              <Button variant="outline" size="sm" iconLeft={Zap} onClick={() => setQuickOpen(true)}>
                Snabbregistrera
              </Button>
            </div>
          </div>
        </section>
      ) : (
        <Browse
          date={date}
          today={today}
          meal={meal}
          tab={tab}
          mealLabel={mealLabel}
          mindful={mindful}
          onTab={(t) => setParam('flik', t === 'senaste' ? null : t)}
          onPick={pick}
          onQuickAdd={quickAdd}
          onDetails={details}
          onScan={goScan}
          onQuick={() => setQuickOpen(true)}
          basketCount={basketCount}
          onToggleSuggestion={(food) => {
            const existing = useBasketStore.getState().items.find((i) => i.food.id === food.id && i.origin === 'suggestion')
            if (existing) {
              basketRemove(existing.key)
              return
            }
            const sel = initialSelection(food, { usage: useFoodStore.getState().usage[food.id] })
            basketAdd(food, sel.amount, sel.unit, 'suggestion')
          }}
          onAddTemplate={(t) => {
            if (addTemplate(t, { date, meal }).length > 0) leave(exitTo)
          }}
          onTemplateToBasket={(t) => {
            for (const i of t.items) basketAdd(i.food, i.amount, i.unit, 'template')
            toast(`${t.name} ligger i korgen`, { tone: 'success' })
          }}
          onCopied={() => leave(exitTo)}
        />
      )}

      <BasketBar meal={meal} onOpen={() => setBasketOpen(true)} onCommit={commitBasket} />

      <PortionSheet
        food={picked?.food ?? null}
        onClose={() => setPicked(null)}
        initialAmount={picked?.amount}
        initialUnit={picked?.unit}
        detailsTo={picked ? foodDetailHref(picked.food.id, { meal, date }) : undefined}
        primary={sheetPrimary}
        secondary={sheetSecondary}
      />

      <BasketSheet
        open={basketOpen}
        onClose={() => setBasketOpen(false)}
        date={date}
        meal={meal}
        today={today}
        onCommit={commitBasket}
        onEdit={(item: BasketItem) => {
          setBasketOpen(false)
          setPicked({ food: item.food, basketKey: item.key, amount: item.amount, unit: item.unit })
        }}
      />

      <QuickAddSheet open={quickOpen} onClose={() => setQuickOpen(false)} date={date} meal={meal} initialName={q} onAdded={() => setQuery('')} />

      {/* Liten bekräftelse när korgen fylls på (för skärmläsare). */}
      <span className="sr-only" aria-live="polite">
        {basketItems.length > 0 ? `${countLabel(basketItems.length)} i korgen` : ''}
      </span>
      <p role="status" className="sr-only">
        {q ? announced : ''}
      </p>
    </div>
  )
}

/** Senast använda mängd för raden – bara om enheten fortfarande går att använda. */
function lastAmount(usage: Readonly<Record<string, FoodUsage>>, food: Food): { amount?: number; unit?: UnitKey } {
  const u = usage[food.id]
  if (!u || !isUsableUnit(food, u.lastUnit)) return {}
  return { amount: u.lastAmount, unit: u.lastUnit }
}

// ---------------------------------------------------------------------------
// Datumväljare
// ---------------------------------------------------------------------------

function DateButton({ date, today, onChange }: { date: string; today: string; onChange: (date: string) => void }) {
  return (
    <label className="relative -ml-1 inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-ink-2 transition-colors focus-within:ring-2 focus-within:ring-gran hover:bg-surface-3 hover:text-ink">
      <CalendarDays className="size-3.5" aria-hidden />
      <span>{relativeDayLabel(date, today)}</span>
      <ChevronDown className="size-3.5" aria-hidden />
      <input
        type="date"
        value={date}
        onChange={(e) => {
          if (e.target.value) onChange(e.target.value)
        }}
        onClick={(e) => {
          try {
            e.currentTarget.showPicker?.()
          } catch {
            /* stöds inte – webbläsarens egen väljare öppnas ändå */
          }
        }}
        aria-label={`Dag: ${relativeDayLabel(date, today)}. Byt dag`}
        // Osynligt fält över chippen – 6 px extra upp och ned ger 44 px tryckyta.
        className="absolute inset-x-0 -inset-y-1.5 cursor-pointer opacity-0"
      />
    </label>
  )
}

// ---------------------------------------------------------------------------
// Bläddra (tom sökning)
// ---------------------------------------------------------------------------

interface BrowseProps {
  date: string
  today: string
  meal: DiaryEntry['meal']
  tab: AddTab
  mealLabel: string
  mindful: boolean
  onTab: (tab: AddTab) => void
  onPick: (food: Food) => void
  onQuickAdd: (food: Food) => void
  onDetails: (food: Food) => void
  onScan: () => void
  onQuick: () => void
  basketCount: (id: string) => number
  onToggleSuggestion: (food: Food) => void
  onAddTemplate: (t: MealTemplate) => void
  onTemplateToBasket: (t: MealTemplate) => void
  onCopied: () => void
}

function Browse(props: BrowseProps) {
  const { date, today, meal, tab, mealLabel, mindful, onTab, onPick, onQuickAdd, onDetails, basketCount } = props
  const usage = useFoodStore((s) => s.usage)
  const customFoods = useFoodStore((s) => s.customFoods)
  const recipes = useFoodStore((s) => s.recipes)
  const templates = useFoodStore((s) => s.templates)
  const resolve = useFoodResolver()
  const recent = useRecentFoods(24, meal)
  const favorites = useFavoriteFoods()
  const basketItems = useBasketStore((s) => s.items)

  const suggestions = useMemo(() => {
    const out: Food[] = []
    for (const id of mealSuggestions(usage, meal, 8)) {
      const f = resolve(id)
      if (f) out.push(f)
    }
    return out
  }, [usage, meal, resolve])

  const mine = useMemo(() => {
    const custom = Object.values(customFoods).sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    const recs = Object.values(recipes)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(recipeFood)
    return [...custom, ...recs]
  }, [customFoods, recipes])

  const counts: Record<AddTab, number | undefined> = {
    senaste: undefined,
    favoriter: favorites.length || undefined,
    mina: mine.length || undefined,
    maltider: templates.length || undefined,
  }

  const inSuggestionBasket = (id: string) => basketItems.some((i) => i.food.id === id && i.origin === 'suggestion')
  const reduce = useReducedMotion()

  return (
    <div className="flex flex-col gap-6">
      {/* Stora genvägar */}
      <div className="grid grid-cols-2 gap-3">
        {/* Mjuka bindestreck (\u00AD) låter de långa orden brytas snyggt i smala rutor (320–390 px). */}
        <ActionTile icon={ScanBarcode} title="Skanna streckkod" text={'Snabbast för förpack\u00ADningar'} tone="gran" onClick={props.onScan} />
        <ActionTile icon={Zap} title={'Snabb\u00ADregistrera'} text="Bara energin, ungefär" tone="sol" onClick={props.onQuick} />
      </div>

      <CopyYesterday date={date} today={today} meal={meal} mealLabel={mealLabel} mindful={mindful} onCopied={props.onCopied} />

      {suggestions.length > 0 && (
        <section aria-labelledby="forslag-rubrik">
          <h2 id="forslag-rubrik" className="mb-2 flex items-center gap-1.5 px-1 text-sm font-semibold text-ink">
            <Sparkles className="size-4 text-sol" aria-hidden />
            Brukar du äta till {mealLabel.toLocaleLowerCase('sv-SE')}
          </h2>
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {suggestions.map((food) => (
              <SuggestionChip
                key={food.id}
                food={food}
                usageAmount={usage[food.id]}
                selected={inSuggestionBasket(food.id)}
                onToggle={() => props.onToggleSuggestion(food)}
              />
            ))}
          </div>
          <p className="mt-1.5 px-1 text-xs text-ink-3">Ett tryck lägger i korgen med din vanliga mängd.</p>
        </section>
      )}

      <div>
        <Tabs id={TABS_ID} value={tab} onChange={onTab} variant="pill" aria-label="Välj lista" tabs={ADD_TABS.map((v) => ({ value: v, label: ADD_TAB_LABELS[v], count: counts[v] }))} />
        <div {...tabPanelProps(TABS_ID, tab)} className="mt-3 outline-none">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={tab}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0.12 : 0.18 }}
            >
              {tab === 'senaste' &&
                (recent.length === 0 ? (
                  <EmptyState
                    compact
                    illustration="plate"
                    title="Här hamnar det du äter"
                    text="Sök eller skanna ditt första livsmedel – nästa gång ligger det här och väntar, med samma mängd."
                  />
                ) : (
                  <RowList>
                    {recent.map((food) => (
                      <li key={food.id}>
                        <AddRow
                          food={food}
                          onPick={onPick}
                          onQuickAdd={onQuickAdd}
                          onDetails={onDetails}
                          inBasket={basketCount(food.id)}
                          showSource={food.source !== 'lagom'}
                          {...lastAmount(usage, food)}
                        />
                      </li>
                    ))}
                  </RowList>
                ))}

              {tab === 'favoriter' &&
                (favorites.length === 0 ? (
                  <EmptyState
                    compact
                    illustration="forest"
                    title="Inga favoriter än"
                    text="Tryck på hjärtat på ett livsmedels detaljsida så hittar du det snabbt här."
                  />
                ) : (
                  <RowList>
                    {favorites.map((food) => (
                      <li key={food.id}>
                        <AddRow
                          food={food}
                          onPick={onPick}
                          onQuickAdd={onQuickAdd}
                          onDetails={onDetails}
                          inBasket={basketCount(food.id)}
                          showSource={food.source !== 'lagom'}
                          {...lastAmount(usage, food)}
                        />
                      </li>
                    ))}
                  </RowList>
                ))}

              {tab === 'mina' && (
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" iconLeft={Plus} to={newFoodHref({ meal, date })}>
                      Nytt livsmedel
                    </Button>
                    <Button variant="outline" iconLeft={ChefHat} to="/recept/nytt">
                      Nytt recept
                    </Button>
                  </div>
                  {mine.length === 0 ? (
                    <EmptyState
                      compact
                      illustration="forest"
                      title="Dina egna livsmedel och recept"
                      text="Lägg in mormors köttbullar eller favoritbaren från förpackningen – de sparas bara på din enhet."
                    />
                  ) : (
                    <RowList>
                      {mine.map((food) => (
                        <li key={food.id}>
                          <AddRow
                            food={food}
                            onPick={onPick}
                            onQuickAdd={onQuickAdd}
                            onDetails={onDetails}
                            inBasket={basketCount(food.id)}
                            {...lastAmount(usage, food)}
                          />
                        </li>
                      ))}
                    </RowList>
                  )}
                </div>
              )}

              {tab === 'maltider' &&
                (templates.length === 0 ? (
                  <EmptyState
                    compact
                    illustration="plate"
                    title="Spara måltider du äter ofta"
                    text="Lägg din vanliga frukost i korgen och välj ”Spara som måltid” – sedan loggar du allt med ett tryck."
                  />
                ) : (
                  <ul className="flex flex-col gap-3">
                    {templates.map((t) => (
                      <TemplateCard key={t.id} template={t} mindful={mindful} onAdd={() => props.onAddTemplate(t)} onToBasket={() => props.onTemplateToBasket(t)} />
                    ))}
                  </ul>
                ))}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

function ActionTile({ icon: Icon, title, text, tone, onClick }: { icon: LucideIcon; title: string; text: string; tone: 'gran' | 'sol'; onClick: () => void }) {
  const reduce = useReducedMotion()
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={reduce ? undefined : { scale: 0.97 }}
      // Under 360 px blir textkolumnen bredvid ikonen för smal – då står ikonen ovanför texten.
      className="card flex min-h-[4.5rem] min-w-0 items-center gap-3 p-3 text-left transition-colors hover:bg-surface-2 max-[359px]:flex-col max-[359px]:items-start max-[359px]:gap-2"
    >
      <span className={cx('grid size-11 shrink-0 place-items-center rounded-2xl', tone === 'gran' ? 'bg-gran-soft text-gran' : 'bg-sol-soft text-hjortron')}>
        <Icon className="size-5" strokeWidth={2.2} aria-hidden />
      </span>
      <span className="min-w-0 flex-1 break-words [hyphens:manual]" lang="sv">
        <span className="block text-[0.9rem] font-semibold leading-tight text-ink">{title}</span>
        <span className="mt-0.5 block text-xs leading-snug text-ink-3">{text}</span>
      </span>
    </motion.button>
  )
}

function SuggestionChip({
  food,
  usageAmount,
  selected,
  onToggle,
}: {
  food: Food
  usageAmount: { lastAmount: number; lastUnit: UnitKey } | undefined
  selected: boolean
  onToggle: () => void
}) {
  const reduce = useReducedMotion()
  const sel = initialSelection(food, { usage: usageAmount })
  const amountText = describeAmount(food, sel.amount, sel.unit)
  return (
    <motion.button
      type="button"
      onClick={onToggle}
      whileTap={reduce ? undefined : { scale: 0.95 }}
      aria-pressed={selected}
      aria-label={`${food.name}, ${amountText}. ${selected ? 'I korgen – tryck för att ta bort' : 'Lägg i korgen'}`}
      className={cx(
        'flex min-h-14 max-w-[15rem] shrink-0 items-center gap-2.5 rounded-2xl py-2 pl-2 pr-3 text-left ring-1 ring-inset transition-colors',
        selected ? 'bg-gran-soft ring-gran/40' : 'bg-surface ring-line hover:bg-surface-2',
      )}
    >
      <CategoryIcon category={food.category} size="sm" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-ink">{food.name}</span>
        <span className="block truncate text-xs text-ink-3">{amountText}</span>
      </span>
      <span className={cx('grid size-6 shrink-0 place-items-center rounded-full', selected ? 'bg-gran text-on-gran' : 'bg-surface-2 text-ink-2')} aria-hidden>
        {selected ? <Check className="size-3.5" strokeWidth={3} /> : <Plus className="size-3.5" strokeWidth={3} />}
      </span>
    </motion.button>
  )
}

function CopyYesterday({
  date,
  today,
  meal,
  mealLabel,
  mindful,
  onCopied,
}: {
  date: string
  today: string
  meal: DiaryEntry['meal']
  mealLabel: string
  mindful: boolean
  onCopied: () => void
}) {
  const from = addDays(date, -1)
  const entries = useDiaryStore((s) => s.entries[from] ?? EMPTY_ENTRIES)
  const list = useMemo(() => entries.filter((e) => e.meal === meal), [entries, meal])
  const kcal = useMemo(() => totals(list).kcal, [list])
  if (list.length === 0) return null
  const fromLabel = date === today ? 'igår' : formatDayShort(from)

  const copy = () => {
    const store = useDiaryStore.getState()
    const before = new Set((store.entries[date] ?? []).map((e) => e.id))
    const n = store.copyMeal(from, meal, date, meal)
    if (n === 0) return
    const added = (useDiaryStore.getState().entries[date] ?? []).filter((e) => !before.has(e.id))
    toast(`${countLabel(n)} kopierade från ${fromLabel}`, {
      tone: 'success',
      action: {
        label: 'Ångra',
        onClick: () => {
          const { removeEntry } = useDiaryStore.getState()
          for (const e of added) removeEntry(e.date, e.id)
        },
      },
    })
    onCopied()
  }

  const names = list.map((e) => (e.kind === 'food' ? e.food.name : e.name))
  return (
    <button
      type="button"
      onClick={copy}
      className="card flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-surface-2"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-blabar-soft text-blabar">
        {date === today ? <History className="size-5" aria-hidden /> : <Copy className="size-5" aria-hidden />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.9rem] font-semibold text-ink">
          Kopiera {mealLabel.toLocaleLowerCase('sv-SE')} från {fromLabel}
        </span>
        <span className="block truncate text-xs text-ink-3">
          {countLabel(list.length)}
          {!mindful && kcal !== undefined && (
            <>
              {' · '}
              <EnergyValue kcal={kcal} unitClassName="" />
            </>
          )}
          {' · '}
          {names.join(', ')}
        </span>
      </span>
      <MealIcon meal={meal} size="sm" />
    </button>
  )
}

function TemplateCard({ template, mindful, onAdd, onToBasket }: { template: MealTemplate; mindful: boolean; onAdd: () => void; onToBasket: () => void }) {
  const removeTemplate = useFoodStore((s) => s.removeTemplate)
  const t = useMemo(() => itemTotals(template.items), [template.items])
  const remove = async () => {
    const ok = await confirmDialog({
      title: `Ta bort ${template.name}?`,
      message: 'Den sparade måltiden försvinner. Det du redan har loggat i dagboken påverkas inte.',
      confirmLabel: 'Ta bort',
      tone: 'danger',
    })
    if (ok) removeTemplate(template.id)
  }
  return (
    <li className="card p-4">
      <div className="flex items-start gap-3">
        {template.meal ? <MealIcon meal={template.meal} size="md" /> : <CategoryIcon category="fardigratt" size="md" />}
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-lg font-semibold leading-tight text-ink">{template.name}</h3>
          <p className="mt-0.5 text-xs text-ink-3">
            {countLabel(template.items.length)}
            {!mindful && t.kcal !== undefined && (
              <>
                {' · '}
                <EnergyValue kcal={t.kcal} unitClassName="" />
              </>
            )}
          </p>
          <p className="mt-1.5 line-clamp-2 text-sm text-ink-2">{template.items.map((i) => i.food.name).join(', ')}</p>
        </div>
        <IconButton icon={Trash2} size="sm" aria-label={`Ta bort måltiden ${template.name}`} onClick={remove} noTooltip />
      </div>
      <div className="mt-3 flex gap-2">
        <Button variant="soft" size="sm" iconLeft={ShoppingBasket} onClick={onToBasket} className="flex-1">
          Lägg i korgen
        </Button>
        <Button size="sm" iconLeft={Plus} onClick={onAdd} className="flex-1">
          Lägg till allt
        </Button>
      </div>
    </li>
  )
}
