/**
 * Delade byggstenar för receptsidorna: emojibricka, receptkort, märkningar, måltidsval och
 * arket "Logga en portion".
 */
import { useMemo, useState } from 'react'
import { ChevronRight, Clock, Heart, Plus, Users } from 'lucide-react'
import type { FoodTag, MealId, Recipe } from '../../types'
import { Badge, Card, Chip, Sheet, Skeleton, cx, type Tone } from '../../components/ui'
import { EnergyValue } from '../../components/domain'
import { PortionPicker, mindfulPortionLabel } from '../../components/domain/PortionPicker'
import { useProfileStore } from '../../stores/profileStore'
import { recipeFood } from '../../lib/foodRepo'
import { recipePerServing, recipeTags } from '../../lib/recipes'
import { formatDuration } from '../../lib/format'
import { MEAL_EMOJI, mealForTime, mealName } from '../../lib/meals'
import { relativeDayLabel } from '../../lib/dates'
import { useToday } from '../../hooks/useToday'
import { useAddFood } from '../add/useAddFood'
import { DEFAULT_RECIPE_EMOJI, TAG_LABELS, sortedTags } from './recipeLogic'
import { servingNounFor } from './useRecipes'

// ---------------------------------------------------------------------------
// Emoji och märkningar
// ---------------------------------------------------------------------------

const EMOJI_SIZES = {
  sm: 'size-11 rounded-2xl text-2xl',
  md: 'size-14 rounded-[1.1rem] text-[1.9rem]',
  lg: 'size-20 rounded-[1.6rem] text-[2.75rem]',
  xl: 'size-24 rounded-[1.9rem] text-[3.25rem]',
} as const

/** Receptets emoji på en mjuk, tonad bricka. */
export function RecipeEmoji({ emoji, size = 'md', className }: { emoji?: string; size?: keyof typeof EMOJI_SIZES; className?: string }) {
  return (
    <span
      aria-hidden
      className={cx(
        'grid shrink-0 select-none place-items-center bg-[radial-gradient(120%_120%_at_30%_20%,var(--lg-surface)_0%,var(--lg-surface-2)_70%)] leading-none ring-1 ring-inset ring-line/70',
        EMOJI_SIZES[size],
        className,
      )}
    >
      {emoji || DEFAULT_RECIPE_EMOJI}
    </span>
  )
}

const TAG_TONES: Partial<Record<FoodTag, Tone>> = {
  vegan: 'mossa',
  vegetarisk: 'mossa',
  glutenfri: 'fjall',
  laktosfri: 'blabar',
  fullkorn: 'hjortron',
  nyckelhal: 'gran',
  ekologisk: 'mossa',
  klassiker: 'sol',
}

/**
 * Små märkningar (vegetarisk, glutenfri …). Med en allergiprofil visas inte Glutenfri och Laktosfri:
 * de har ingen källa (receptets ingredienser eller egna märkningar) och laktosfri betyder inte
 * mjölkfri – samma regel som i livsmedelsdetaljen (se lib/allergens.ts).
 */
export function TagBadges({ tags, max, hide = [], size = 'sm' }: { tags: readonly FoodTag[]; max?: number; hide?: readonly FoodTag[]; size?: 'sm' | 'md' }) {
  const allergyProfile = useProfileStore((s) => (s.settings.allergens?.length ?? 0) > 0)
  const list = sortedTags(tags).filter((t) => !hide.includes(t) && !(allergyProfile && (t === 'glutenfri' || t === 'laktosfri')))
  const shown = max !== undefined ? list.slice(0, max) : list
  if (shown.length === 0) return null
  return (
    <span className="flex flex-wrap gap-1.5">
      {shown.map((t) => (
        <Badge key={t} tone={TAG_TONES[t] ?? 'neutral'} size={size}>
          {TAG_LABELS[t]}
        </Badge>
      ))}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Receptkort
// ---------------------------------------------------------------------------

export interface RecipeCardProps {
  recipe: Recipe
  favorite?: boolean
  /** Märkningar som inte ska visas (t.ex. "klassiker" bland klassikerna). */
  hideTags?: readonly FoodTag[]
}

const DEFAULT_HIDDEN_TAGS: readonly FoodTag[] = ['svensk']

export function RecipeCard({ recipe, favorite, hideTags = DEFAULT_HIDDEN_TAGS }: RecipeCardProps) {
  const mindful = useProfileStore((s) => s.settings.mindfulMode)
  const kcal = useMemo(() => recipePerServing(recipe).kcal, [recipe])
  const tags = useMemo(() => recipeTags(recipe).filter((t) => !hideTags.includes(t)), [recipe, hideTags])
  const noun = servingNounFor(recipe)
  return (
    <Card to={`/recept/${encodeURIComponent(recipe.id)}`} padding="none" className="h-full">
      <span className="flex h-full items-center gap-3.5 p-3.5 sm:p-4">
        <RecipeEmoji emoji={recipe.emoji} size="md" />
        <span className="block min-w-0 flex-1">
          <span className="flex items-start gap-1.5">
            <span className="line-clamp-2 font-display text-[1.0625rem] font-semibold leading-snug tracking-tight text-ink [hyphens:auto]" lang="sv">
              {recipe.name}
            </span>
            {favorite && (
              <>
                <Heart aria-hidden className="mt-1 size-3.5 shrink-0 fill-lingon text-lingon" />
                <span className="sr-only">Favorit</span>
              </>
            )}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[0.8125rem] text-ink-2">
            <span className="tabular-nums">
              {mindful ? (
                mindfulPortionLabel(kcal)
              ) : (
                <>
                  <EnergyValue kcal={kcal} className="font-semibold text-ink" />
                  <span className="text-ink-3"> / {noun[0]}</span>
                </>
              )}
            </span>
            {recipe.prepMinutes !== undefined && recipe.prepMinutes > 0 && (
              <span className="inline-flex items-center gap-1 text-ink-3">
                <Clock aria-hidden className="size-3.5" />
                <span className="sr-only">Tid:</span>
                {formatDuration(recipe.prepMinutes)}
              </span>
            )}
            {noun[0] === 'portion' ? (
              <span className="inline-flex items-center gap-1 text-ink-3">
                <Users aria-hidden className="size-3.5" />
                <span className="sr-only">Portioner:</span>
                {recipe.servings}
              </span>
            ) : null}
          </span>
          {tags.length > 0 && (
            <span className="mt-2 block">
              <TagBadges tags={tags} max={3} />
            </span>
          )}
        </span>
        <ChevronRight aria-hidden className="size-5 shrink-0 text-ink-3" />
      </span>
    </Card>
  )
}

/** Platshållare med samma form som ett receptkort. */
export function RecipeCardSkeleton() {
  return (
    <div className="card flex items-center gap-3.5 p-3.5 sm:p-4" aria-hidden>
      <Skeleton className="size-14 rounded-[1.1rem]" />
      <span className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="h-3 w-2/5" />
        <Skeleton className="h-4 w-1/3 rounded-full" />
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Måltidsval
// ---------------------------------------------------------------------------

export function MealChips({ value, onChange }: { value: MealId; onChange: (meal: MealId) => void }) {
  const meals = useProfileStore((s) => s.settings.meals)
  const enabled = meals.filter((m) => m.enabled)
  return (
    <div role="radiogroup" aria-label="Måltid" className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 py-1.5">
      {enabled.map((m) => (
        <Chip
          key={m.id}
          role="radio"
          aria-checked={value === m.id}
          aria-pressed={undefined}
          selected={value === m.id}
          icon={<span aria-hidden>{MEAL_EMOJI[m.id]}</span>}
          onClick={() => onChange(m.id)}
        >
          {m.name}
        </Chip>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Logga en portion
// ---------------------------------------------------------------------------

export interface LogRecipeSheetProps {
  recipe: Recipe
  open: boolean
  onClose: () => void
}

/** Ark med måltidsval och portionsväljare. Loggar en ögonblicksbild av receptet i dagboken. */
export function LogRecipeSheet({ recipe, open, onClose }: LogRecipeSheetProps) {
  const today = useToday()
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Logga i dagboken"
      description={`${recipe.name} · loggas ${relativeDayLabel(today, today).toLocaleLowerCase('sv-SE')}`}
    >
      <LogRecipeContent recipe={recipe} date={today} onDone={onClose} />
    </Sheet>
  )
}

function LogRecipeContent({ recipe, date, onDone }: { recipe: Recipe; date: string; onDone: () => void }) {
  const meals = useProfileStore((s) => s.settings.meals)
  const [meal, setMeal] = useState<MealId>(() => mealForTime(meals))
  const food = useMemo(() => recipeFood(recipe), [recipe])
  const { addFood } = useAddFood()
  const noun = servingNounFor(recipe)
  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="eyebrow mb-1.5">Måltid</div>
        <MealChips value={meal} onChange={setMeal} />
      </div>
      <PortionPicker
        key={food.id}
        food={food}
        initialAmount={1}
        initialUnit={food.portions.length > 0 ? 'portion:portion' : 'g'}
        confirmLabel={`Lägg till i ${mealName(meals, meal).toLocaleLowerCase('sv-SE')}`}
        confirmIcon={Plus}
        onConfirm={(amount, unit) => {
          const entry = addFood(food, amount, unit, { date, meal })
          if (entry) onDone()
        }}
      >
        {noun[0] !== 'portion' && <p className="-mt-2 text-center text-xs text-ink-3">1 portion = 1 {noun[0]}</p>}
      </PortionPicker>
    </div>
  )
}
