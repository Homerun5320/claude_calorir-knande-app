/**
 * Snabbval för vanliga svenska drycker (kaffe, te, öl, vin …) ur Lagoms livsmedelsdatabas.
 * Ett tryck lägger till en portion i måltiden som passar klockslaget, med klockslaget sparat
 * (så att koffeinkurvan blir rätt) och "Ångra" i notisen.
 */
import { memo, useMemo } from 'react'
import { Plus } from 'lucide-react'
import { Skeleton, cx } from '../../../components/ui'
import { useBuiltinCatalog, useFoodResolver } from '../../../hooks/useFood'
import { nowTime } from '../../../lib/dates'
import { formatNumber, formatNutrient } from '../../../lib/format'
import { mealForTime, mealName } from '../../../lib/meals'
import { nutrientsForGrams, standardDrinks } from '../../../lib/nutrients'
import { gramsFor } from '../../../lib/units'
import { useProfileStore } from '../../../stores/profileStore'
import type { Food, ISODate, UnitKey } from '../../../types'
import { useAddFood } from '../../add/useAddFood'

export interface QuickDrinkOption {
  /** Slug i Lagoms databas (utan 'lagom:'). */
  slug: string
  /** Portion-id i livsmedlet, t.ex. 'kopp'. */
  portion: string
  label: string
  emoji: string
}

export const COFFEE_OPTIONS: readonly QuickDrinkOption[] = [
  { slug: 'kaffe-bryggt', portion: 'kopp', label: 'Bryggkaffe', emoji: '☕' },
  { slug: 'caffe-latte-mellanmjolk', portion: 'glas', label: 'Caffè latte', emoji: '🥛' },
  { slug: 'cappuccino-mellanmjolk', portion: 'kopp', label: 'Cappuccino', emoji: '☕' },
  { slug: 'espresso', portion: 'shot', label: 'Espresso', emoji: '☕' },
  { slug: 'te-svart-bryggt', portion: 'kopp', label: 'Te', emoji: '🫖' },
  { slug: 'kaffe-koffeinfritt', portion: 'kopp', label: 'Koffeinfritt', emoji: '🌙' },
]

export const ALCOHOL_OPTIONS: readonly QuickDrinkOption[] = [
  { slug: 'ol-starkol-lager-5', portion: 'burk', label: 'Starköl 33\u00a0cl', emoji: '🍺' },
  { slug: 'ol-folkol-3-5', portion: 'burk', label: 'Folköl 33\u00a0cl', emoji: '🍺' },
  { slug: 'vin-rott', portion: 'glas', label: 'Rött vin 15\u00a0cl', emoji: '🍷' },
  { slug: 'vin-vitt-torrt', portion: 'glas', label: 'Vitt vin 15\u00a0cl', emoji: '🥂' },
  { slug: 'cider-sot-4-5', portion: 'flaska', label: 'Cider 33\u00a0cl', emoji: '🍏' },
  { slug: 'akvavit-snaps', portion: 'snaps', label: 'Snaps 4\u00a0cl', emoji: '🥃' },
  { slug: 'ol-alkoholfri', portion: 'burk', label: 'Alkoholfri öl', emoji: '🌾' },
]

interface ResolvedOption {
  option: QuickDrinkOption
  food: Food
  unit: UnitKey
  /** Koffein (mg) eller standardglas för en portion. */
  amount: number | undefined
}

function unitFor(food: Food, portion: string): UnitKey {
  if (food.portions.some((p) => p.id === portion)) return `portion:${portion}`
  return food.portions[0] ? `portion:${food.portions[0].id}` : 'g'
}

export interface QuickDrinksProps {
  options: readonly QuickDrinkOption[]
  kind: 'caffeine' | 'alcohol'
  date: ISODate
  mindful: boolean
  /** Tillgänglig rubrik för gruppen. */
  label: string
}

export const QuickDrinks = memo(function QuickDrinks({ options, kind, date, mindful, label }: QuickDrinksProps) {
  const catalog = useBuiltinCatalog()
  const resolve = useFoodResolver()
  const meals = useProfileStore((s) => s.settings.meals)
  const { addFood } = useAddFood()

  const items = useMemo<ResolvedOption[]>(() => {
    const out: ResolvedOption[] = []
    for (const option of options) {
      const food = resolve(`lagom:${option.slug}`)
      if (!food) continue
      const unit = unitFor(food, option.portion)
      const grams = gramsFor(food, 1, unit)
      const n = Number.isFinite(grams) ? nutrientsForGrams(food.nutrients, grams) : {}
      out.push({ option, food, unit, amount: kind === 'caffeine' ? n.caffeine : standardDrinks(n) })
    }
    return out
  }, [options, resolve, kind])

  const add = (item: ResolvedOption) => {
    const meal = mealForTime(meals)
    addFood(item.food, 1, item.unit, { date, meal, time: nowTime() }, { message: `${item.option.label} – tillagt i ${mealName(meals, meal)}` })
  }

  if (!catalog) {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-busy="true" aria-label="Laddar snabbval">
        {options.slice(0, 4).map((o) => (
          <Skeleton key={o.slug} className="h-16 rounded-2xl" />
        ))}
      </div>
    )
  }

  if (items.length === 0) return null

  return (
    <div role="group" aria-label={label} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {items.map((item) => {
        const info =
          mindful || item.amount === undefined
            ? undefined
            : kind === 'caffeine'
              ? formatNutrient('caffeine', item.amount)
              : `${formatNumber(item.amount, 1)}\u00a0glas`
        return (
          <button
            key={item.option.slug}
            type="button"
            onClick={() => add(item)}
            aria-label={`Lägg till ${item.option.label}${info ? `, ${info}` : ''}`}
            className={cx(
              'group relative flex min-h-16 items-start gap-2.5 rounded-2xl bg-surface/80 py-2.5 pl-3 pr-7 text-left ring-1 ring-inset ring-line/80',
              'transition-[background-color,transform] duration-150 hover:bg-surface active:scale-[0.98]',
            )}
          >
            <span aria-hidden className="mt-0.5 text-xl leading-none">
              {item.option.emoji}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[0.8125rem] font-semibold leading-tight text-ink [overflow-wrap:anywhere]">{item.option.label}</span>
              {info && <span className="mt-0.5 block text-xs leading-tight tabular-nums text-ink-3">{info}</span>}
            </span>
            <Plus aria-hidden className="absolute right-2.5 top-3 size-3.5 text-ink-3 transition-colors group-hover:text-ink" strokeWidth={2.6} />
          </button>
        )
      })}
    </div>
  )
})
