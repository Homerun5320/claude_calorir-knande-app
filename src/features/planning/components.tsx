/**
 * Små byggstenar för veckoplaneringen: ikon för en planerad rad och portionsväljaren för recept
 * (portioner att laga och portioner du äter).
 */
import type { MealConfig, MealId, Recipe } from '../../types'
import { Stepper } from '../../components/ui'
import { CategoryIcon, useEnergyFormatter } from '../../components/domain'
import { formatNumber } from '../../lib/format'
import { MAX_COOK_SERVINGS, MAX_EAT_SERVINGS, cookServingsStep, formatCount, type PlanItem, type PlanNutrients, type RecipeResolver } from '../../lib/planning'
import { RecipeEmoji } from '../recipes/components'

/** Ikonen för en planerad rad: receptets emoji eller livsmedlets kategori. */
export function PlanItemIcon({ item, resolve }: { item: PlanItem; resolve: RecipeResolver }) {
  if (item.kind === 'recipe') return <RecipeEmoji emoji={resolve(item.recipeId)?.emoji ?? item.emoji} size="sm" />
  if (item.kind === 'meal') return <CategoryIcon category="fardigratt" emoji="🍱" size="md" />
  return <CategoryIcon category={item.food.category} name={item.food.name} size="md" />
}

/** Förvald måltid när man planerar: middag om den är påslagen, annars första påslagna måltiden. */
export function defaultPlanMeal(meals: readonly MealConfig[]): MealId {
  if (meals.some((m) => m.id === 'middag' && m.enabled)) return 'middag'
  return meals.find((m) => m.enabled)?.id ?? 'middag'
}

/** "Receptet ger 4 portioner" – med receptets eget portionsord när det finns. */
export function recipeYieldText(recipe: Pick<Recipe, 'servings'>): string {
  const n = recipe.servings > 0 ? recipe.servings : 1
  return `Receptet ger ${formatNumber(n, 1)} ${n === 1 ? 'portion' : 'portioner'}`
}

export interface RecipePortionsProps {
  servings: number
  eat: number
  onServings: (v: number) => void
  onEat: (v: number) => void
  /** Energi och protein per portion (visas för dina portioner utom i medvetet läge). */
  perServing?: PlanNutrients
  mindful?: boolean
  /** Hur många portioner receptet ger – styr steget för portioner att laga (halva satser för bak). */
  recipeServings?: number
}

/** Två stegare: portioner att laga (inköpslistan) och portioner du själv äter (energi och loggning). */
export function RecipePortions({ servings, eat, onServings, onEat, perServing, mindful, recipeServings = 1 }: RecipePortionsProps) {
  const fmt = useEnergyFormatter()
  const kcal = perServing?.kcal !== undefined ? perServing.kcal * eat : undefined
  const protein = perServing?.protein !== undefined ? perServing.protein * eat : undefined
  let eatHint = 'Styr energin och loggningen i dagboken'
  if (!mindful && kcal !== undefined) {
    eatHint = `≈ ${fmt(kcal)}${protein !== undefined ? ` · ${formatNumber(protein, 0)} g protein` : ''} för dig`
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium text-ink">Portioner att laga</p>
          <p className="text-[0.8125rem] leading-snug text-ink-3">{servings === 0 ? 'Rester – inget att handla' : 'Styr inköpslistan'}</p>
        </div>
        <Stepper
          label="Portioner att laga"
          value={servings}
          onChange={onServings}
          min={0}
          max={MAX_COOK_SERVINGS}
          step={cookServingsStep(recipeServings)}
          format={(v) => (v === 0 ? 'Rester' : formatNumber(v, 1))}
        />
      </div>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium text-ink">Portioner du äter</p>
          <p className="text-[0.8125rem] leading-snug text-ink-3">{eatHint}</p>
        </div>
        <Stepper label="Portioner du äter" value={eat} onChange={onEat} min={0.5} max={MAX_EAT_SERVINGS} step={0.5} format={formatCount} />
      </div>
    </div>
  )
}
