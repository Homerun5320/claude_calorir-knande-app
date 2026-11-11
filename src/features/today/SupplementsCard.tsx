/**
 * Kosttillskott – en bock per tillskott som användaren har lagt till (Inställningar → Mål →
 * "Lägg till kosttillskott"). En bock loggar en tablett i dagboken; bockade tillskott visas som
 * "Taget idag", och en ny tryckning tar bort dagens tablett igen.
 *
 * Visas bara när användaren har egna livsmedel i kategorin 'kosttillskott'. Passerar dagens
 * tillskott den övre gränsen i NNR visas en lugn rad – ingen röd färg.
 */
import { memo, useMemo } from 'react'
import { Check, Pill } from 'lucide-react'
import { Card, cx, toast } from '../../components/ui'
import { isSupplementFood, nutrientListText, overUpperLimit, SUPPLEMENT_LIMIT_NOTE } from '../../data/supplements'
import { mealForTime } from '../../lib/meals'
import { nutrientsForGrams } from '../../lib/nutrients'
import { useDiaryStore } from '../../stores/diaryStore'
import { useFoodStore } from '../../stores/foodStore'
import { useProfileStore } from '../../stores/profileStore'
import type { DiaryEntry, Food, ISODate, Nutrients } from '../../types'
import { useAddFood } from '../add/useAddFood'
import { SectionLink } from './SectionLink'

const EMPTY_ENTRIES: readonly DiaryEntry[] = []

/** Dagens poster för ett visst tillskott. */
function takenEntries(entries: readonly DiaryEntry[], food: Food): DiaryEntry[] {
  return entries.filter((e) => e.kind === 'food' && e.food.id === food.id)
}

/** Summan av dagens tillskott (bara tillskotten – maten räknas inte in i gränserna här). */
function supplementTotals(entries: readonly DiaryEntry[], supplements: readonly Food[]): Nutrients {
  const ids = new Set(supplements.map((f) => f.id))
  const sum: Nutrients = {}
  for (const e of entries) {
    if (e.kind !== 'food' || !ids.has(e.food.id)) continue
    for (const [k, v] of Object.entries(nutrientsForGrams(e.food.nutrients, e.grams)) as Array<[keyof Nutrients, number | undefined]>) {
      if (v !== undefined && Number.isFinite(v)) sum[k] = (sum[k] ?? 0) + v
    }
  }
  return sum
}

export const SupplementsCard = memo(function SupplementsCard({ today }: { today: ISODate }) {
  const customFoods = useFoodStore((s) => s.customFoods)
  const entries = useDiaryStore((s) => s.entries[today] ?? EMPTY_ENTRIES)
  const meals = useProfileStore((s) => s.settings.meals)
  const { addFood } = useAddFood()

  const supplements = useMemo(
    () => Object.values(customFoods).filter(isSupplementFood).sort((a, b) => a.name.localeCompare(b.name, 'sv')),
    [customFoods],
  )
  const over = useMemo(() => overUpperLimit(supplementTotals(entries, supplements)), [entries, supplements])

  if (supplements.length === 0) return null

  const toggle = (food: Food) => {
    const taken = takenEntries(entries, food)
    if (taken.length > 0) {
      // Ta bort dagens tablett(er) – med Ångra.
      const removed = useDiaryStore.getState().removeEntries(taken)
      toast(`${food.name} är avbockat`, {
        action: { label: 'Ångra', onClick: () => useDiaryStore.getState().restoreEntries(removed) },
      })
      return
    }
    const portion = food.portions[0]
    if (portion) addFood(food, 1, `portion:${portion.id}`, { date: today, meal: mealForTime(meals) }, { message: `${food.name} – taget idag` })
    else addFood(food, 1, 'g', { date: today, meal: mealForTime(meals) }, { message: `${food.name} – taget idag` })
  }

  return (
    <Card
      title="Kosttillskott"
      eyebrow="Idag"
      action={
        <SectionLink to="/installningar/mal" label="Hantera kosttillskott">
          Ändra
        </SectionLink>
      }
    >
      <ul className="flex flex-col gap-1.5" aria-label="Dagens kosttillskott">
        {supplements.map((food) => {
          const taken = takenEntries(entries, food).length > 0
          return (
            <li key={food.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={taken}
                onClick={() => toggle(food)}
                className={cx(
                  'flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors',
                  taken ? 'bg-mossa-soft' : 'bg-surface-2/70 hover:bg-surface-2',
                )}
              >
                {/* Obockad ram: border-ink-3 (minst 3:1 mot raden, WCAG 1.4.11) – border-line är bara 1,3:1. */}
                <span
                  aria-hidden="true"
                  className={cx(
                    'grid size-7 shrink-0 place-items-center rounded-full border-2 transition-colors',
                    taken ? 'border-mossa bg-mossa text-on-gran' : 'border-ink-3 bg-surface',
                  )}
                >
                  {taken ? <Check className="size-4" strokeWidth={3} /> : <Pill className="size-3.5 text-ink-3" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block line-clamp-2 break-words text-[0.9375rem] font-medium text-ink">{food.name}</span>
                  <span className={cx('block text-xs', taken ? 'font-semibold text-good' : 'text-ink-3')}>
                    {taken ? 'Taget idag' : (food.portions[0]?.label ?? '1 tablett')}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {over.length > 0 && (
        <p className="mt-3 rounded-2xl bg-surface-2 px-3.5 py-2.5 text-[0.8125rem] leading-relaxed text-ink-2" role="note">
          Dagens tillskott ger mer {nutrientListText(over)} än den övre gränsen i NNR. {SUPPLEMENT_LIMIT_NOTE}
        </p>
      )}
    </Card>
  )
})
