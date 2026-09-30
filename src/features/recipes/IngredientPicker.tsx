/**
 * Ingredienser i receptredigeraren: sök bland alla livsmedel (egna, recept och Lagoms databas),
 * välj mängd med portionsväljaren och redigera eller ta bort rader.
 */
import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Check, History, Minus, Search } from 'lucide-react'
import type { Food, RecipeIngredient, UnitKey } from '../../types'
import { Chip, IconButton, Sheet, SkeletonRow, TextField, cx } from '../../components/ui'
import { CategoryIcon, EnergyValue } from '../../components/domain'
import { PortionPicker } from '../../components/domain/PortionPicker'
import { useFoodSearch, useRecentFoods } from '../../hooks/useFoodSearch'
import { useProfileStore } from '../../stores/profileStore'
import { nutrientsForGrams } from '../../lib/nutrients'
import { defaultAmount, defaultUnit, gramsFor } from '../../lib/units'
import { HIDE_NATIVE_CLEAR, formatIngredientAmount } from './recipeLogic'

// ---------------------------------------------------------------------------
// Rad för en ingrediens eller en sökträff
// ---------------------------------------------------------------------------

function amountLine(food: Food, amount: number, unit: UnitKey): string {
  const a = formatIngredientAmount(food, amount, unit)
  return a.grams ? `${a.text} · ${a.grams}` : a.text
}

export function IngredientRow({
  ingredient,
  onEdit,
  onRemove,
}: {
  ingredient: RecipeIngredient
  onEdit: () => void
  onRemove: () => void
}) {
  const mindful = useProfileStore((s) => s.settings.mindfulMode)
  const { food, amount, unit, grams } = ingredient
  const kcal = nutrientsForGrams(food.nutrients, grams).kcal
  const line = amountLine(food, amount, unit)
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Ändra mängd: ${food.name}, ${line}`}
        className="-ml-2 flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-2xl px-2 py-2 text-left transition-colors hover:bg-surface-2/70 active:bg-surface-2"
      >
        <CategoryIcon category={food.category} name={food.name} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-[0.95rem] font-medium leading-snug text-ink">{food.name}</span>
          <span className="mt-0.5 block truncate text-xs text-ink-3 tabular-nums">{line}</span>
        </span>
        {!mindful && (
          <span className="shrink-0 text-sm font-semibold text-ink">
            <EnergyValue kcal={kcal} />
          </span>
        )}
      </button>
      <IconButton icon={Minus} size="sm" variant="secondary" aria-label={`Ta bort ${food.name}`} onClick={onRemove} noTooltip />
    </div>
  )
}

/**
 * Enheten som föreslås för en ny ingrediens. Recept anges nästan alltid i rå eller okokt vikt, så
 * livsmedel som anges tillagade (`rawWeight`: kött, fisk, pasta, ris …) startar i "g rå"/"g okokt" –
 * annars skulle "500 g" pasta tolkas som kokt pasta.
 */
export function recipeStartUnit(food: Pick<Food, 'rawWeight'>): UnitKey | undefined {
  return food.rawWeight && food.rawWeight.factor > 0 ? 'g-ra' : undefined
}

function ResultRow({ food, onPick, excluded }: { food: Food; onPick: (food: Food) => void; excluded?: boolean }) {
  const mindful = useProfileStore((s) => s.settings.mindfulMode)
  // Samma utgångsläge som i mängdarket: "100 g okokt · 250 g tillagat" för pasta, annars förvald portion.
  const unit = recipeStartUnit(food) ?? defaultUnit(food)
  const amount = defaultAmount(unit)
  const g = gramsFor(food, amount, unit)
  const kcal = Number.isFinite(g) ? nutrientsForGrams(food.nutrients, g).kcal : undefined
  const line = Number.isFinite(g) ? amountLine(food, amount, unit) : '100\u00a0g'
  return (
    <li>
      <button
        type="button"
        disabled={excluded}
        onClick={() => onPick(food)}
        className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition-colors hover:bg-surface-2/70 active:bg-surface-2 disabled:opacity-50"
      >
        <CategoryIcon category={food.category} name={food.name} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-[0.95rem] font-medium leading-snug text-ink">{food.name}</span>
          <span className="mt-0.5 block truncate text-xs text-ink-3">
            {[food.brand, excluded ? 'Det här receptet' : line].filter(Boolean).join(' · ')}
          </span>
        </span>
        {!mindful && kcal !== undefined && (
          <span className="shrink-0 text-sm text-ink-2">
            <EnergyValue kcal={kcal} />
          </span>
        )}
      </button>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Sökning
// ---------------------------------------------------------------------------

export interface IngredientSearchHandle {
  focus: () => void
}

export interface IngredientSearchProps {
  /** Livsmedels-id som inte får väljas (receptet självt). */
  excludeId?: string
  onPick: (food: Food) => void
  error?: string
  /** Sökfältets (dolda) etikett. Standard "Lägg till ingrediens". */
  label?: string
  /** Sökningen från början, t.ex. ingrediensraden som ska bytas. */
  initialQuery?: string
  /** Id för träfflistan – behövs när flera sökfält finns samtidigt. */
  resultsId?: string
  /** Fokusera sökfältet direkt. */
  autoFocus?: boolean
}

/** Sökfält med träfflista och snabbval bland senast använda livsmedel. */
export const IngredientSearch = forwardRef<IngredientSearchHandle, IngredientSearchProps>(function IngredientSearch(
  { excludeId, onPick, error, label = 'Lägg till ingrediens', initialQuery = '', resultsId = 'ingredient-results', autoFocus },
  ref,
) {
  const [query, setQuery] = useState(initialQuery)
  const inputRef = useRef<HTMLInputElement>(null)
  const search = useFoodSearch(query, { limit: 8 })
  const { loading, pending } = search
  // Livsmedelsverkets övriga poster (ofta råvaror) efter Lagoms egna: fyller upp till åtta träffar,
  // men visar alltid upp till tre från Livsmedelsverket när de finns.
  const results = useMemo(
    () => (search.lmvResults.length === 0 ? search.results : [...search.results, ...search.lmvResults.slice(0, Math.max(3, 8 - search.results.length))]),
    [search.results, search.lmvResults],
  )
  const recent = useRecentFoods(6)
  const recentShown = useMemo(() => recent.filter((f) => f.id !== excludeId), [recent, excludeId])
  const trimmed = query.trim()

  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }), [])

  const pick = (food: Food) => {
    setQuery('')
    onPick(food)
  }

  return (
    <div>
      <TextField
        ref={inputRef}
        label={label}
        labelHidden
        autoFocus={autoFocus}
        type="search"
        fieldClassName={HIDE_NATIVE_CLEAR}
        prefix={Search}
        clearable
        value={query}
        onValueChange={setQuery}
        placeholder="Sök ingrediens, t.ex. vetemjöl"
        autoComplete="off"
        enterKeyHint="search"
        error={error}
        aria-controls={resultsId}
      />

      <div id={resultsId} aria-live="polite" aria-busy={loading || pending || undefined}>
        {trimmed === '' ? (
          recentShown.length > 0 && (
            <div className="mt-3">
              <div className="eyebrow mb-2 flex items-center gap-1.5 px-1">
                <History aria-hidden className="size-3.5" />
                Senast använda
              </div>
              <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-1.5">
                {recentShown.map((f) => (
                  <Chip key={f.id} size="sm" onClick={() => pick(f)} className="max-w-[14rem]">
                    <span className="truncate">{f.name}</span>
                  </Chip>
                ))}
              </div>
            </div>
          )
        ) : loading && results.length === 0 ? (
          <div className="mt-2" aria-label="Söker">
            <SkeletonRow />
            <SkeletonRow />
          </div>
        ) : results.length === 0 ? (
          !pending && (
            <p className="mt-3 rounded-2xl bg-surface-2 px-4 py-3 text-sm text-ink-2">
              Inga träffar på ”{trimmed}”. Prova ett kortare ord eller en synonym – t.ex. ”grädde” i stället för ”vispgrädde 40{'\u00a0'}%”.
            </p>
          )
        ) : (
          <ul className={cx('mt-2 flex flex-col transition-opacity', pending && 'opacity-60')} aria-label="Sökträffar">
            {results.map((r) => (
              <ResultRow key={r.food.id} food={r.food} onPick={pick} excluded={r.food.id === excludeId} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
})

// ---------------------------------------------------------------------------
// Ark för mängd
// ---------------------------------------------------------------------------

export type PickerState = { mode: 'add'; food: Food } | { mode: 'edit'; ingredient: RecipeIngredient }

export function AmountSheet({
  state,
  open,
  onClose,
  onExitComplete,
  onConfirm,
}: {
  state: PickerState | null
  open: boolean
  onClose: () => void
  onExitComplete?: () => void
  onConfirm: (food: Food, amount: number, unit: UnitKey, grams: number) => void
}) {
  const food = state ? (state.mode === 'add' ? state.food : state.ingredient.food) : null
  return (
    <Sheet
      open={open && food !== null}
      onClose={onClose}
      onExitComplete={onExitComplete}
      title={food?.name ?? 'Ingrediens'}
      description={state?.mode === 'edit' ? 'Ändra mängden i receptet' : 'Hur mycket går åt i receptet?'}
    >
      {food && state && (
        <PortionPicker
          key={state.mode === 'edit' ? state.ingredient.id : food.id}
          food={food}
          initialAmount={state.mode === 'edit' ? state.ingredient.amount : undefined}
          initialUnit={state.mode === 'edit' ? state.ingredient.unit : recipeStartUnit(food)}
          confirmLabel={state.mode === 'edit' ? 'Spara mängd' : 'Lägg till i receptet'}
          largeConfirmLabel={state.mode === 'edit' ? 'Ja, spara mängden' : 'Ja, lägg till i receptet'}
          confirmIcon={Check}
          onConfirm={(amount, unit, grams) => onConfirm(food, amount, unit, grams)}
        />
      )}
    </Sheet>
  )
}
