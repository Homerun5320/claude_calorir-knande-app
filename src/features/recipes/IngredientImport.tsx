/**
 * Kontroll av inklistrade eller importerade ingredienser: varje rad matchas mot livsmedel med samma
 * sökning som ingredienssöket (`useFoodSearch`) och visas med föreslagen mängd. Användaren kan byta
 * livsmedel, ändra mängd eller ta bort raden innan ingredienserna läggs till i receptet.
 *
 * - `useIngredientReview` + `IngredientReview` – tillståndet och listan (används i "Klistra in
 *   ingredienser" och på importsidan). Resultatet räknas ur samma tillstånd som visas.
 * - `PasteIngredientsSheet` – arket i receptredigeraren: textruta → kontroll → "Lägg till".
 *
 * Rader utan mängd ("smör till formen") eller utan träff markeras "Kontrollera" och läggs inte till
 * förrän de har en mängd – de hoppas över annars.
 */
import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { ArrowLeft, Check, ClipboardPaste, Repeat, Scale, Trash2, X } from 'lucide-react'
import type { Food, RecipeIngredient, UnitKey } from '../../types'
import { Badge, Button, IconButton, Sheet, TextField, cx } from '../../components/ui'
import { CategoryIcon } from '../../components/domain'
import { useFoodSearch } from '../../hooks/useFoodSearch'
import { ingredientAmount, parseIngredientLines, type IngredientAmount, type ParsedIngredientLine } from './importRecipe'
import { AmountSheet, IngredientSearch, type PickerState } from './IngredientPicker'
import { formatIngredientAmount, makeIngredient } from './recipeLogic'

// ---------------------------------------------------------------------------
// Kontrollistan
// ---------------------------------------------------------------------------

export interface Override {
  food: Food
  amount?: IngredientAmount
}

export interface ReviewResult {
  /** Rader med livsmedel och mängd, klara att läggas till. */
  ingredients: RecipeIngredient[]
  /** Rader som behöver kontrolleras (saknar livsmedel eller mängd) och hoppas över. */
  unresolved: number
  /** Antal rader kvar i listan. */
  total: number
}

export interface Row {
  key: string
  line: ParsedIngredientLine
}

function amountText(food: Food, a: IngredientAmount): string {
  const d = formatIngredientAmount(food, a.amount, a.unit)
  return d.grams ? `${d.text} · ${d.grams}` : d.text
}

/** Första träffen för en rad – samma sökning och ordning som i ingredienssöket. */
function useTopMatch(query: string, excludeId?: string): { food: Food | undefined; settled: boolean } {
  const search = useFoodSearch(query, { limit: 8 })
  const allowed = (r: { food: Food }) => r.food.id !== excludeId
  const top = search.results.find(allowed)?.food ?? search.lmvResults.find(allowed)?.food
  return { food: top, settled: !search.loading && !search.pending }
}

function ReviewRow({
  row,
  review,
  resultsId,
  excludeId,
}: {
  row: Row
  review: IngredientReviewState
  resultsId: string
  excludeId?: string
}) {
  const { food: auto, settled } = useTopMatch(row.line.name, excludeId)
  const { key } = row
  const { onAuto } = review
  useEffect(() => {
    // `onAuto` ändrar ingenting när träffen är samma livsmedel som förut.
    if (settled) onAuto(key, auto)
  }, [key, auto, settled, onAuto])

  // Visningen bygger på samma tillstånd som resultatet, så att det som syns är det som läggs till.
  const override = review.overrides[key]
  const matched = key in review.autos
  const food = override?.food ?? review.autos[key]
  const amount = override ? override.amount : food ? ingredientAmount(food, row.line) : undefined
  const swapping = review.swapKey === key

  return (
    <li className="py-3">
      <p className="text-xs text-ink-3">
        <span className="sr-only">Rad: </span>
        {row.line.raw}
      </p>
      <div className="mt-1.5 flex items-center gap-2">
        {food ? (
          <button
            type="button"
            onClick={() => review.openAmount(key, food, amount)}
            aria-label={`${food.name}: ${amount ? amountText(food, amount) : 'välj mängd'}`}
            className="-ml-2 flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-2xl px-2 py-1.5 text-left transition-colors hover:bg-surface-2/70 active:bg-surface-2"
          >
            <CategoryIcon category={food.category} name={food.name} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2 text-[0.9375rem] leading-snug font-medium text-ink">{food.name}</span>
              {amount ? (
                <span className="mt-0.5 block truncate text-xs text-ink-3 tabular-nums">{amountText(food, amount)}</span>
              ) : (
                <span className="mt-1 block">
                  <Badge tone="hjortron" icon={Scale}>
                    Kontrollera mängden
                  </Badge>
                </span>
              )}
            </span>
          </button>
        ) : (
          <div className="flex min-h-12 min-w-0 flex-1 items-center">
            {matched ? (
              <Badge tone="hjortron">Kontrollera – inget livsmedel hittades</Badge>
            ) : (
              <span className="text-sm text-ink-3">Söker …</span>
            )}
          </div>
        )}
        <Button
          size="sm"
          variant={swapping ? 'secondary' : 'soft'}
          iconLeft={swapping ? X : Repeat}
          onClick={() => review.setSwapKey(swapping ? null : key)}
          aria-expanded={swapping}
          aria-label={swapping ? `Avbryt byte för ${row.line.raw}` : `Byt livsmedel för ${row.line.raw}`}
        >
          {swapping ? 'Avbryt' : 'Byt'}
        </Button>
        <IconButton icon={Trash2} size="sm" variant="ghost" aria-label={`Ta bort ${row.line.raw}`} onClick={() => review.remove(key)} noTooltip />
      </div>
      {food && amount && !override && row.line.check && <p className="mt-1 text-xs text-ink-3">Mängden saknades på raden – kontrollera den.</p>}
      {swapping && (
        <div className="mt-2 rounded-2xl bg-surface-2/60 p-3">
          <IngredientSearch
            label={`Sök livsmedel för ${row.line.raw}`}
            initialQuery={row.line.name}
            resultsId={resultsId}
            excludeId={excludeId}
            autoFocus
            onPick={(f) => review.pick(key, f)}
          />
        </div>
      )}
    </li>
  )
}

export interface IngredientReviewState {
  rows: readonly Row[]
  autos: Readonly<Record<string, Food | undefined>>
  overrides: Readonly<Record<string, Override>>
  swapKey: string | null
  setSwapKey: (key: string | null) => void
  onAuto: (key: string, food: Food | undefined) => void
  openAmount: (key: string, food: Food, current?: IngredientAmount) => void
  pick: (key: string, food: Food) => void
  remove: (key: string) => void
  /** Ingredienserna som är klara att läggas till – räknas ur samma tillstånd som visas. */
  result: ReviewResult
  /** Arket för mängd (renderas av `IngredientReview`). */
  amountSheet: {
    state: PickerState | null
    open: boolean
    close: () => void
    exited: () => void
    confirm: (food: Food, amount: number, unit: UnitKey, grams: number) => void
  }
}

interface ReviewData {
  lines: readonly ParsedIngredientLine[]
  rows: Row[]
  autos: Record<string, Food | undefined>
  overrides: Record<string, Override>
}

const initialData = (lines: readonly ParsedIngredientLine[]): ReviewData => ({
  lines,
  rows: lines.map((line, i) => ({ key: `rad-${i}`, line })),
  autos: {},
  overrides: {},
})

/**
 * Tillståndet för kontrollistan: träffar, byten, mängder och borttagna rader. Börjar om när
 * `lines` byts ut (ny inklistring eller ny import).
 */
export function useIngredientReview(lines: readonly ParsedIngredientLine[]): IngredientReviewState {
  const [data, setData] = useState<ReviewData>(() => initialData(lines))
  const [swapKey, setSwapKey] = useState<string | null>(null)
  const [picker, setPicker] = useState<{ key: string; state: PickerState } | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  // Nya rader → ny lista (härlett tillstånd, återställs under renderingen).
  if (data.lines !== lines) {
    setData(initialData(lines))
    setSwapKey(null)
  }

  const onAuto = useCallback(
    (key: string, food: Food | undefined) =>
      setData((prev) => (key in prev.autos && prev.autos[key]?.id === food?.id ? prev : { ...prev, autos: { ...prev.autos, [key]: food } })),
    [],
  )

  const openAmount = useCallback((key: string, food: Food, current?: IngredientAmount) => {
    const state: PickerState = current
      ? { mode: 'edit', ingredient: { ...makeIngredient(food, current.amount, current.unit, current.grams), id: key } }
      : { mode: 'add', food }
    setPicker({ key, state })
    setPickerOpen(true)
  }, [])

  const pick = (key: string, food: Food) => {
    const row = data.rows.find((r) => r.key === key)
    const amount = row ? ingredientAmount(food, row.line) : undefined
    setData((prev) => ({ ...prev, overrides: { ...prev.overrides, [key]: { food, amount } } }))
    setSwapKey(null)
    // Går mängden inte att räkna om för det nya livsmedlet får användaren välja den direkt.
    if (!amount) openAmount(key, food)
  }

  const remove = (key: string) => {
    setData((prev) => ({ ...prev, rows: prev.rows.filter((r) => r.key !== key) }))
    setSwapKey((k) => (k === key ? null : k))
  }

  const confirm = (food: Food, amount: number, unit: UnitKey, grams: number) => {
    if (picker) {
      const key = picker.key
      setData((prev) => ({ ...prev, overrides: { ...prev.overrides, [key]: { food, amount: { amount, unit, grams: Math.round(grams * 10) / 10 } } } }))
    }
    setPickerOpen(false)
  }

  const result = useMemo<ReviewResult>(() => {
    const ingredients: RecipeIngredient[] = []
    let unresolved = 0
    for (const r of data.rows) {
      const o = data.overrides[r.key]
      const food = o?.food ?? data.autos[r.key]
      const amount = o ? o.amount : food ? ingredientAmount(food, r.line) : undefined
      if (food && amount) ingredients.push(makeIngredient(food, amount.amount, amount.unit, amount.grams))
      else unresolved++
    }
    return { ingredients, unresolved, total: data.rows.length }
  }, [data])

  return {
    rows: data.rows,
    autos: data.autos,
    overrides: data.overrides,
    swapKey,
    setSwapKey,
    onAuto,
    openAmount,
    pick,
    remove,
    result,
    amountSheet: {
      state: picker?.state ?? null,
      open: pickerOpen,
      close: () => setPickerOpen(false),
      exited: () => setPicker(null),
      confirm,
    },
  }
}

export interface IngredientReviewProps {
  review: IngredientReviewState
  /** Livsmedels-id som inte får väljas (receptet självt). */
  excludeId?: string
  className?: string
}

/** Listan med rader att kontrollera (tillståndet kommer från `useIngredientReview`). */
export function IngredientReview({ review, excludeId, className }: IngredientReviewProps) {
  const baseId = useId()
  const sheet = review.amountSheet

  if (review.rows.length === 0) {
    return <p className={cx('rounded-2xl bg-surface-2 px-4 py-3 text-sm text-ink-2', className)}>Inga rader kvar att lägga till.</p>
  }

  return (
    <>
      <ul className={cx('flex flex-col divide-y divide-line', className)} aria-label="Ingredienser att kontrollera">
        {review.rows.map((r) => (
          <ReviewRow key={r.key} row={r} review={review} resultsId={`${baseId}-byt`} excludeId={excludeId} />
        ))}
      </ul>
      <AmountSheet state={sheet.state} open={sheet.open} onClose={sheet.close} onExitComplete={sheet.exited} onConfirm={sheet.confirm} />
    </>
  )
}

/** "Lägg till 5 ingredienser" / "2 rader behöver kontrolleras och hoppas över". */
export function reviewSummary(result: ReviewResult): string {
  const n = result.ingredients.length
  if (result.unresolved === 0) return n === 1 ? '1 ingrediens är klar att läggas till.' : `${n} ingredienser är klara att läggas till.`
  const skip = result.unresolved === 1 ? '1 rad behöver kontrolleras' : `${result.unresolved} rader behöver kontrolleras`
  return `${skip} – välj livsmedel och mängd eller ta bort ${result.unresolved === 1 ? 'den' : 'dem'}. Annars hoppas ${result.unresolved === 1 ? 'den' : 'de'} över.`
}

// ---------------------------------------------------------------------------
// "Klistra in ingredienser" i receptredigeraren
// ---------------------------------------------------------------------------

const NO_LINES: readonly ParsedIngredientLine[] = []

export function PasteIngredientsSheet({
  open,
  onClose,
  onAdd,
  excludeId,
}: {
  open: boolean
  onClose: () => void
  onAdd: (ingredients: RecipeIngredient[]) => void
  /** Livsmedels-id som inte får väljas (receptet självt). */
  excludeId?: string
}) {
  const [text, setText] = useState('')
  const [lines, setLines] = useState<readonly ParsedIngredientLine[] | null>(null)
  const review = useIngredientReview(lines ?? NO_LINES)
  const result = review.result
  const parsedCount = useMemo(() => parseIngredientLines(text).length, [text])

  const match = () => {
    const parsed = parseIngredientLines(text)
    if (parsed.length > 0) setLines(parsed)
  }

  const add = () => {
    if (result.ingredients.length === 0) return
    onAdd(result.ingredients)
    setText('')
    setLines(null)
  }

  const reviewing = lines !== null
  const n = result.ingredients.length

  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="tall"
      title="Klistra in ingredienser"
      description={
        reviewing ? 'Kontrollera matchningarna – byt livsmedel, ändra mängd eller ta bort rader.' : 'En ingrediens per rad, till exempel ”2 dl vetemjöl” eller ”1 gul lök”.'
      }
      footer={
        reviewing ? (
          <div className="flex flex-col gap-2">
            <p className="text-center text-xs leading-relaxed text-ink-3" aria-live="polite">
              {reviewSummary(result)}
            </p>
            {/* Staplade på smala skärmar (huvudknappen överst) – annars får "Lägg till 12 ingredienser" inte plats. */}
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button variant="secondary" iconLeft={ArrowLeft} onClick={() => setLines(null)}>
                Ändra text
              </Button>
              <Button className="min-w-0 sm:flex-1" size="lg" iconLeft={Check} onClick={add} disabled={n === 0}>
                {n === 1 ? 'Lägg till 1 ingrediens' : `Lägg till ${n} ingredienser`}
              </Button>
            </div>
          </div>
        ) : (
          <Button fullWidth size="lg" iconLeft={ClipboardPaste} onClick={match} disabled={parsedCount === 0}>
            {parsedCount > 0 ? `Matcha ${parsedCount === 1 ? '1 rad' : `${parsedCount} rader`}` : 'Matcha ingredienser'}
          </Button>
        )
      }
    >
      {reviewing ? (
        <IngredientReview review={review} excludeId={excludeId} />
      ) : (
        <TextField
          multiline
          minRows={8}
          label="Ingredienser"
          value={text}
          onValueChange={setText}
          placeholder={'3 dl vetemjöl\n2 ägg\n5 dl mjölk\n½ tsk salt\nsmör till stekning'}
          hint="Mängder med dl, msk, tsk, krm, g och styck räknas om automatiskt. Rader utan mängd får du kontrollera."
        />
      )}
    </Sheet>
  )
}
