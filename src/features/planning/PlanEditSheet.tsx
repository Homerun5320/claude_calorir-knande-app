/**
 * Ändra en planerad rad: flytta till en annan måltid, ändra portioner (recept) eller mängd
 * (livsmedel) – eller ta bort raden från planen (med "Ångra").
 */
import { useState } from 'react'
import { BookOpen, Trash2 } from 'lucide-react'
import type { MealId } from '../../types'
import { Button, Sheet, toast } from '../../components/ui'
import { describeAmount } from '../../components/domain'
import { PortionPicker } from '../../components/domain/PortionPicker'
import { useProfileStore } from '../../stores/profileStore'
import { usePlanStore } from '../../stores/planStore'
import { capitalize, formatDayShort } from '../../lib/dates'
import { mealName } from '../../lib/meals'
import { planItemName, recipePlanNutrients, type PlanItem, type PlanRecipeItem } from '../../lib/planning'
import { MealChips } from '../add/components'
import { RecipePortions, recipeYieldText } from './components'
import { weekdayName } from './PlanAddSheet'
import type { RecipeLookup } from './usePlanning'

export interface PlanEditSheetProps {
  /** Raden som ändras – null stänger arket. */
  item: PlanItem | null
  onClose: () => void
  lookup: RecipeLookup
}

/** Ta bort en rad ur planen med notis och "Ångra". */
export function removePlanItem(item: Pick<PlanItem, 'date' | 'id'>): void {
  const removed = usePlanStore.getState().removeItem(item.date, item.id)
  if (!removed) return
  toast('Borttagen från planen', { action: { label: 'Ångra', onClick: () => usePlanStore.getState().restoreItems([removed]) } })
}

export function PlanEditSheet({ item, onClose, lookup }: PlanEditSheetProps) {
  const meals = useProfileStore((s) => s.settings.meals)
  // Behåll innehållet medan arket stängs.
  const [shown, setShown] = useState(item)
  if (item !== null && item !== shown) setShown(item)
  const current = item ?? shown
  // Nytt innehåll varje gång arket öppnas (osparade ändringar följer inte med).
  const [session, setSession] = useState(0)
  const [wasOpen, setWasOpen] = useState(false)
  if ((item !== null) !== wasOpen) {
    setWasOpen(item !== null)
    if (item !== null) setSession((n) => n + 1)
  }
  const name = current ? planItemName(current, lookup.resolve) : ''
  const description = current ? `${capitalize(weekdayName(current.date))} ${formatDayShort(current.date)} · ${mealName(meals, current.meal)}` : undefined
  return (
    <Sheet open={item !== null} onClose={onClose} title={name || 'Planerad måltid'} description={description}>
      {current && <EditContent key={`${current.id}-${session}`} item={current} lookup={lookup} onDone={onClose} />}
    </Sheet>
  )
}

function EditContent({ item, lookup, onDone }: { item: PlanItem; lookup: RecipeLookup; onDone: () => void }) {
  const mindful = useProfileStore((s) => s.settings.mindfulMode)
  const [meal, setMeal] = useState<MealId>(item.meal)
  const update = usePlanStore((s) => s.updateItem)

  const remove = () => {
    removePlanItem(item)
    onDone()
  }

  return (
    <div className="flex flex-col gap-5">
      <MealChips value={meal} onChange={setMeal} label="Måltid" />
      {item.kind === 'recipe' ? (
        <RecipeEdit item={item} lookup={lookup} mindful={mindful} onSave={(servings, eat) => {
          update(item.date, item.id, { meal, servings, eat })
          onDone()
        }} />
      ) : item.kind === 'food' ? (
        <PortionPicker
          food={item.food}
          initialAmount={item.amount}
          initialUnit={item.unit}
          confirmLabel="Spara"
          largeConfirmLabel="Ja, spara"
          onConfirm={(amount, unit, grams) => {
            update(item.date, item.id, { meal, amount, unit, grams })
            onDone()
          }}
        />
      ) : (
        <>
          <ul className="flex flex-col gap-1 rounded-2xl bg-surface-2 p-3" aria-label="Innehåll">
            {item.items.map((i, index) => (
              <li key={`${i.food.id}-${index}`} className="flex items-baseline justify-between gap-3 text-[0.9375rem]">
                <span className="min-w-0 text-ink">{i.food.name}</span>
                <span className="shrink-0 text-[0.8125rem] text-ink-3">{describeAmount(i.food, i.amount, i.unit)}</span>
              </li>
            ))}
          </ul>
          <Button
            fullWidth
            size="lg"
            onClick={() => {
              update(item.date, item.id, { meal })
              onDone()
            }}
          >
            Spara
          </Button>
        </>
      )}
      <Button fullWidth variant="ghost" iconLeft={Trash2} onClick={remove}>
        Ta bort från planen
      </Button>
    </div>
  )
}

function RecipeEdit({
  item,
  lookup,
  mindful,
  onSave,
}: {
  item: PlanRecipeItem
  lookup: RecipeLookup
  mindful: boolean
  onSave: (servings: number, eat: number) => void
}) {
  const recipe = lookup.resolve(item.recipeId)
  const [servings, setServings] = useState(item.servings)
  const [eat, setEat] = useState(item.eat)
  const per = recipe ? recipePlanNutrients(recipe) : item.perServing
  return (
    <>
      {recipe ? (
        <p className="-mt-1 text-[0.875rem] text-ink-3">{recipeYieldText(recipe)}</p>
      ) : (
        !lookup.builtinLoading && (
          <p className="rounded-2xl bg-sol-soft p-3 text-[0.875rem] leading-snug text-ink">
            Receptet finns inte längre. Energin bygger på värdet när du planerade, och receptet räknas inte med i inköpslistan.
          </p>
        )
      )}
      <RecipePortions
        servings={servings}
        eat={eat}
        onServings={setServings}
        onEat={setEat}
        perServing={per}
        mindful={mindful}
        recipeServings={recipe?.servings}
      />
      <div className="flex flex-col gap-2">
        <Button fullWidth size="lg" onClick={() => onSave(servings, eat)}>
          Spara
        </Button>
        {recipe && (
          <Button fullWidth variant="soft" iconLeft={BookOpen} to={`/recept/${encodeURIComponent(recipe.id)}`}>
            Visa receptet
          </Button>
        )}
      </div>
    </>
  )
}
