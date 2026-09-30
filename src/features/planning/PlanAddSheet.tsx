/**
 * Arket "Planera tisdag": välj måltid och sedan ett recept (egna och svenska klassiker), en sparad
 * måltid eller ett livsmedel med mängd. Recept planeras med portioner att laga (inköpslistan) och
 * portioner du äter (energi och loggning).
 */
import { useDeferredValue, useMemo, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react'
import type { Food, ISODate, MealId, MealTemplate, Recipe, UnitKey } from '../../types'
import { Button, EmptyState, SegmentedControl, Sheet, Skeleton, TextField, cx, toast } from '../../components/ui'
import { FoodRow, foodToRow, useEnergyFormatter } from '../../components/domain'
import { PortionPicker } from '../../components/domain/PortionPicker'
import { useFoodStore } from '../../stores/foodStore'
import { useProfileStore } from '../../stores/profileStore'
import { usePlanStore } from '../../stores/planStore'
import { useFoodSearch, useRecentFoods } from '../../hooks/useFoodSearch'
import { WEEKDAYS, formatDayLong, weekdayIndex } from '../../lib/dates'
import { mealName } from '../../lib/meals'
import {
  MAX_COOK_SERVINGS,
  portionsText,
  recipeKey,
  recipePlanNutrients,
  type NewPlanItem,
  type PlanItem,
} from '../../lib/planning'
import { requireAccess } from '../premium/requireAccess'
import { MealChips } from '../add/components'
import { HIDE_NATIVE_CLEAR, filterRecipes, recipeFavoriteId, sortOwnRecipes } from '../recipes/recipeLogic'
import { RecipeEmoji } from '../recipes/components'
import { RecipePortions, defaultPlanMeal, recipeYieldText } from './components'
import type { RecipeLookup } from './usePlanning'

type Source = 'recept' | 'maltider' | 'livsmedel'

type Step = { kind: 'list' } | { kind: 'recipe'; recipe: Recipe } | { kind: 'food'; food: Food }

/** Under så här många huvudträffar fälls "Fler från Livsmedelsverket" ut automatiskt. */
const LMV_AUTO_OPEN_BELOW = 3

const SOURCE_OPTIONS = [
  { value: 'recept', label: 'Recept' },
  { value: 'maltider', label: 'Måltider' },
  { value: 'livsmedel', label: 'Livsmedel' },
] as const

/** "tisdag" för ett datum. */
export function weekdayName(date: ISODate): string {
  return WEEKDAYS[weekdayIndex(date)]
}

/**
 * Lägg till en rad i planen – med notis och "Ångra". Kräver tillgång (provperiod eller licens, och
 * inte exempeldata). Returnerar raden, eller null om inget lades till.
 */
export function addPlanItem(draft: NewPlanItem, label: string, meals: Parameters<typeof mealName>[0]): PlanItem | null {
  if (!requireAccess('planera')) return null
  const item = usePlanStore.getState().addItem(draft)
  if (!item) {
    toast('Dagen är redan full av planerade rader – ta bort något först.', { tone: 'error' })
    return null
  }
  const where = `${mealName(meals, item.meal).toLocaleLowerCase('sv-SE')} ${weekdayName(item.date)}`
  toast(`${label} planerad till ${where}`, {
    tone: 'success',
    action: { label: 'Ångra', onClick: () => usePlanStore.getState().removeItem(item.date, item.id) },
  })
  return item
}

export interface PlanAddSheetProps {
  /** Dagen som planeras – null stänger arket. */
  date: ISODate | null
  onClose: () => void
  lookup: RecipeLookup
}

export function PlanAddSheet({ date, onClose, lookup }: PlanAddSheetProps) {
  // Behåll innehållet medan arket stängs (annars byter rubriken under animationen).
  const [shown, setShown] = useState(date)
  if (date !== null && date !== shown) setShown(date)
  const current = date ?? shown
  const [session, setSession] = useState(0)
  const [lastDate, setLastDate] = useState<ISODate | null>(null)
  // Nytt innehåll (tomt sökfält, första steget) varje gång arket öppnas.
  if (date !== lastDate) {
    setLastDate(date)
    if (date !== null) setSession((n) => n + 1)
  }
  return (
    <Sheet
      open={date !== null}
      onClose={onClose}
      title={current ? `Planera ${weekdayName(current)}` : 'Planera'}
      description={current ? formatDayLong(current) : undefined}
      size="tall"
    >
      {current && <AddContent key={session} date={current} onDone={onClose} lookup={lookup} />}
    </Sheet>
  )
}

function AddContent({ date, onDone, lookup }: { date: ISODate; onDone: () => void; lookup: RecipeLookup }) {
  const meals = useProfileStore((s) => s.settings.meals)
  const mindful = useProfileStore((s) => s.settings.mindfulMode)
  const [meal, setMeal] = useState<MealId>(() => defaultPlanMeal(meals))
  const [source, setSource] = useState<Source>('recept')
  const [query, setQuery] = useState('')
  const [step, setStep] = useState<Step>({ kind: 'list' })

  const addRecipe = (recipe: Recipe, servings: number, eat: number) => {
    const draft: NewPlanItem = {
      kind: 'recipe',
      date,
      meal,
      recipeId: recipe.id,
      name: recipe.name,
      servings,
      eat,
      perServing: recipePlanNutrients(recipe),
    }
    if (recipe.emoji) draft.emoji = recipe.emoji
    if (addPlanItem(draft, recipe.name, meals)) onDone()
  }

  const addTemplate = (t: MealTemplate) => {
    const items = t.items.filter((i) => Number.isFinite(i.grams) && i.grams > 0)
    if (items.length === 0) {
      toast('Måltiden saknar livsmedel med känd vikt.', { tone: 'error' })
      return
    }
    const draft: NewPlanItem = { kind: 'meal', date, meal, templateId: t.id, name: t.name, items }
    if (addPlanItem(draft, t.name, meals)) onDone()
  }

  const addFood = (food: Food, amount: number, unit: UnitKey, grams: number) => {
    if (addPlanItem({ kind: 'food', date, meal, food, amount, unit, grams }, food.name, meals)) onDone()
  }

  /** Ett recept i livsmedelssöken planeras som recept (så att inköpslistan får ingredienserna). */
  const pickFood = (food: Food) => {
    const recipe = food.source === 'recipe' || food.id.startsWith('recipe:') ? lookup.resolve(recipeKey(food.id)) : undefined
    setStep(recipe ? { kind: 'recipe', recipe } : { kind: 'food', food })
  }

  return (
    <div className="flex flex-col gap-4">
      <MealChips value={meal} onChange={setMeal} label="Måltid att planera" />
      {step.kind === 'recipe' ? (
        <RecipeStep recipe={step.recipe} mindful={mindful} onBack={() => setStep({ kind: 'list' })} onAdd={addRecipe} mealLabel={mealName(meals, meal)} />
      ) : step.kind === 'food' ? (
        <div className="flex flex-col gap-3">
          <p className="font-display text-[1.1875rem] font-semibold leading-snug tracking-tight text-ink">{step.food.name}</p>
          <PortionPicker
            key={step.food.id}
            food={step.food}
            confirmLabel={`Planera till ${mealName(meals, meal).toLocaleLowerCase('sv-SE')}`}
            confirmIcon={Plus}
            largeConfirmLabel="Ja, planera"
            onConfirm={(amount, unit, grams) => addFood(step.food, amount, unit, grams)}
          />
          <Button variant="ghost" iconLeft={ChevronLeft} fullWidth onClick={() => setStep({ kind: 'list' })}>
            Tillbaka
          </Button>
        </div>
      ) : (
        <>
          <SegmentedControl aria-label="Vad vill du planera?" value={source} onChange={setSource} options={SOURCE_OPTIONS} fullWidth />
          <TextField
            type="search"
            label="Sök"
            labelHidden
            prefix={Search}
            clearable
            value={query}
            onValueChange={setQuery}
            placeholder={source === 'recept' ? 'Sök recept' : source === 'maltider' ? 'Sök sparade måltider' : 'Sök livsmedel'}
            enterKeyHint="search"
            autoComplete="off"
            className={HIDE_NATIVE_CLEAR}
          />
          {source === 'recept' && <RecipeList query={query} lookup={lookup} mindful={mindful} onPick={(recipe) => setStep({ kind: 'recipe', recipe })} />}
          {source === 'maltider' && <TemplateList query={query} onPick={addTemplate} />}
          {source === 'livsmedel' && <FoodList query={query} meal={meal} mindful={mindful} onPick={pickFood} />}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Recept
// ---------------------------------------------------------------------------

function RecipeStep({
  recipe,
  mindful,
  mealLabel,
  onBack,
  onAdd,
}: {
  recipe: Recipe
  mindful: boolean
  mealLabel: string
  onBack: () => void
  onAdd: (recipe: Recipe, servings: number, eat: number) => void
}) {
  const [servings, setServings] = useState(() => Math.min(MAX_COOK_SERVINGS, Math.max(1, Math.round(recipe.servings > 0 ? recipe.servings : 1))))
  const [eat, setEat] = useState(1)
  const per = useMemo(() => recipePlanNutrients(recipe), [recipe])
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <RecipeEmoji emoji={recipe.emoji} size="md" />
        <div className="min-w-0">
          <p className="font-display text-[1.1875rem] font-semibold leading-snug tracking-tight text-ink">{recipe.name}</p>
          <p className="text-[0.875rem] text-ink-3">{recipeYieldText(recipe)}</p>
        </div>
      </div>
      <RecipePortions
        servings={servings}
        eat={eat}
        onServings={setServings}
        onEat={setEat}
        perServing={per}
        mindful={mindful}
        recipeServings={recipe.servings}
      />
      <div className="flex flex-col gap-2">
        <Button size="lg" fullWidth iconLeft={Plus} onClick={() => onAdd(recipe, servings, eat)}>
          {`Planera till ${mealLabel.toLocaleLowerCase('sv-SE')}`}
        </Button>
        <Button variant="ghost" fullWidth iconLeft={ChevronLeft} onClick={onBack}>
          Tillbaka
        </Button>
      </div>
    </div>
  )
}

function RecipeRow({ recipe, mindful, onPick }: { recipe: Recipe; mindful: boolean; onPick: (r: Recipe) => void }) {
  const fmt = useEnergyFormatter()
  const per = useMemo(() => recipePlanNutrients(recipe), [recipe])
  const servings = recipe.servings > 0 ? recipe.servings : 1
  const detail = !mindful && per.kcal !== undefined ? `${portionsText(servings)} · ${fmt(per.kcal)} per portion` : portionsText(servings)
  return (
    <li>
      <button
        type="button"
        onClick={() => onPick(recipe)}
        className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition-colors hover:bg-surface-2 active:bg-surface-3"
      >
        <RecipeEmoji emoji={recipe.emoji} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block font-medium leading-snug text-ink">{recipe.name}</span>
          <span className="block truncate text-[0.8125rem] text-ink-3">{detail}</span>
        </span>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-3" />
      </button>
    </li>
  )
}

function RecipeList({ query, lookup, mindful, onPick }: { query: string; lookup: RecipeLookup; mindful: boolean; onPick: (r: Recipe) => void }) {
  const deferred = useDeferredValue(query)
  const favorites = useFoodStore((s) => s.favorites)
  const favSet = useMemo(() => new Set(favorites), [favorites])
  const own = useMemo(() => filterRecipes(sortOwnRecipes(lookup.own, favSet), deferred), [lookup.own, favSet, deferred])
  const builtin = useMemo(() => filterRecipes(lookup.builtin, deferred), [lookup.builtin, deferred])
  const favFirst = useMemo(() => [...builtin].sort((a, b) => Number(favSet.has(recipeFavoriteId(b.id))) - Number(favSet.has(recipeFavoriteId(a.id)))), [builtin, favSet])
  const nothing = own.length === 0 && builtin.length === 0 && !lookup.builtinLoading
  return (
    <div className="flex flex-col gap-4">
      {own.length > 0 && (
        <section aria-labelledby="plan-egna-recept">
          <h3 id="plan-egna-recept" className="eyebrow mb-1 px-2">
            Mina recept
          </h3>
          <ul className="flex flex-col">
            {own.map((r) => (
              <RecipeRow key={r.id} recipe={r} mindful={mindful} onPick={onPick} />
            ))}
          </ul>
        </section>
      )}
      <section aria-labelledby="plan-klassiker" aria-busy={lookup.builtinLoading || undefined}>
        {(favFirst.length > 0 || lookup.builtinLoading) && (
          <h3 id="plan-klassiker" className="eyebrow mb-1 px-2">
            Svenska klassiker
          </h3>
        )}
        {lookup.builtinLoading ? (
          <div className="flex flex-col gap-2 px-2" aria-label="Laddar recepten">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-full rounded-2xl" />
            ))}
          </div>
        ) : (
          <ul className="flex flex-col">
            {favFirst.map((r) => (
              <RecipeRow key={r.id} recipe={r} mindful={mindful} onPick={onPick} />
            ))}
          </ul>
        )}
      </section>
      {nothing && (
        <EmptyState
          compact
          illustration="search"
          title={query.trim() ? `Inga recept för ”${query.trim()}”` : 'Inga recept än'}
          text="Prova ett annat ord – eller planera ett livsmedel i stället."
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sparade måltider
// ---------------------------------------------------------------------------

const NO_TEMPLATES: MealTemplate[] = []

function TemplateList({ query, onPick }: { query: string; onPick: (t: MealTemplate) => void }) {
  const templates = useFoodStore((s) => s.templates) ?? NO_TEMPLATES
  const q = query.trim().toLocaleLowerCase('sv-SE')
  const list = useMemo(
    () => (q ? templates.filter((t) => t.name.toLocaleLowerCase('sv-SE').includes(q) || t.items.some((i) => i.food.name.toLocaleLowerCase('sv-SE').includes(q))) : templates),
    [templates, q],
  )
  if (templates.length === 0) {
    return (
      <EmptyState
        compact
        illustration="plate"
        title="Inga sparade måltider än"
        text="Spara en måltid i dagboken (t.ex. din vanliga frukost) så kan du planera den med ett tryck."
      />
    )
  }
  if (list.length === 0) return <EmptyState compact illustration="search" title={`Inga måltider för ”${query.trim()}”`} />
  return (
    <ul className="flex flex-col">
      {list.map((t) => (
        <li key={t.id}>
          <button
            type="button"
            onClick={() => onPick(t)}
            className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition-colors hover:bg-surface-2 active:bg-surface-3"
          >
            <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-2xl bg-surface-2 text-2xl leading-none">
              🍱
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium leading-snug text-ink">{t.name}</span>
              <span className="block truncate text-[0.8125rem] text-ink-3">
                {t.items.map((i) => i.food.name).join(', ')}
              </span>
            </span>
            <Plus aria-hidden className="size-5 shrink-0 text-gran" />
          </button>
        </li>
      ))}
    </ul>
  )
}

// ---------------------------------------------------------------------------
// Livsmedel
// ---------------------------------------------------------------------------

function FoodList({ query, meal, mindful, onPick }: { query: string; meal: MealId; mindful: boolean; onPick: (f: Food) => void }) {
  const q = query.trim()
  const { results, lmvResults, loading, pending } = useFoodSearch(q, { meal })
  const recent = useRecentFoods(12, meal)
  const [lmvToggle, setLmvToggle] = useState<{ q: string; open: boolean } | null>(null)
  const lmvOpen = lmvToggle?.q === q ? lmvToggle.open : results.length < LMV_AUTO_OPEN_BELOW

  const row = (food: Food) => (
    <li key={food.id}>
      <FoodRow {...foodToRow(food)} onClick={() => onPick(food)} hideEnergy={mindful} actionLabel={`Välj ${food.name}`} />
    </li>
  )

  if (!q) {
    if (recent.length === 0) {
      return <EmptyState compact illustration="search" title="Sök bland livsmedlen" text="Skriv t.ex. ”kycklingbröst”, ”havregryn” eller ”banan”." />
    }
    return (
      <section aria-labelledby="plan-senaste">
        <h3 id="plan-senaste" className="eyebrow mb-1 px-2">
          Senaste
        </h3>
        <ul className="flex flex-col">{recent.map(row)}</ul>
      </section>
    )
  }
  if (loading && results.length === 0) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true" aria-label="Söker">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-2xl" />
        ))}
      </div>
    )
  }
  if (results.length === 0 && lmvResults.length === 0) {
    return pending ? null : <EmptyState compact illustration="search" title={`Inga träffar för ”${q}”`} text="Prova ett annat ord eller en kortare sökning." />
  }
  return (
    <div className="flex flex-col gap-3">
      {results.length > 0 && <ul className="flex flex-col">{results.map((r) => row(r.food))}</ul>}
      {lmvResults.length > 0 && (
        <section aria-labelledby="plan-lmv-rubrik">
          <h3 id="plan-lmv-rubrik">
            <button
              type="button"
              aria-expanded={lmvOpen}
              aria-controls="plan-lmv"
              aria-label={`Fler från Livsmedelsverket, ${lmvResults.length === 1 ? '1 träff' : `${lmvResults.length} träffar`}`}
              onClick={() => setLmvToggle({ q, open: !lmvOpen })}
              className="flex min-h-11 w-full items-center justify-between gap-3 rounded-2xl px-2 text-left"
            >
              <span className="eyebrow">Fler från Livsmedelsverket</span>
              <span className="flex items-center gap-1.5 text-sm font-medium text-ink-2">
                <span className="tabular-nums">{lmvResults.length}</span>
                <ChevronDown className={cx('size-4 transition-transform duration-200', lmvOpen && 'rotate-180')} aria-hidden />
              </span>
            </button>
          </h3>
          <div id="plan-lmv" hidden={!lmvOpen}>
            {lmvOpen && <ul className="flex flex-col">{lmvResults.map((r) => row(r.food))}</ul>}
          </div>
        </section>
      )}
    </div>
  )
}
