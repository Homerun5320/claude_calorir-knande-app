/**
 * Korgen i gränssnittet: en klibbig list längst ned ("3 livsmedel · 540 kcal – Lägg till") och
 * ett ark där man ser över, ändrar och sparar korgen som en måltid.
 */
import { useMemo, useState, type FormEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { BookmarkPlus, Check, ShoppingBasket, Trash2, X } from 'lucide-react'
import type { ISODate, MealId } from '../../types'
import { Button, IconButton, Sheet, TextField, cx, toast } from '../../components/ui'
import { CategoryIcon, EnergyValue, FoodRow, describeAmount, useEnergyFormatter } from '../../components/domain'
import { useProfileStore } from '../../stores/profileStore'
import { mealName } from '../../lib/meals'
import { relativeDayLabel } from '../../lib/dates'
import { formatNumber } from '../../lib/format'
import { nutrientsForGrams } from '../../lib/nutrients'
import { countLabel, itemTotals } from './addLogic'
import { useBasketStore, type BasketItem } from './basketStore'
import { useAddFood } from './useAddFood'

/** Den klibbiga korglisten. Visas bara när korgen innehåller något. */
export function BasketBar({ meal, onOpen, onCommit }: { meal: MealId; onOpen: () => void; onCommit: () => void }) {
  const items = useBasketStore((s) => s.items)
  const meals = useProfileStore((s) => s.settings.meals)
  const mindful = useProfileStore((s) => s.settings.mindfulMode)
  const reduce = useReducedMotion()
  const fmtEnergy = useEnergyFormatter()
  const totals = useMemo(() => itemTotals(items), [items])
  const show = items.length > 0

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="basket-bar"
          initial={reduce ? { opacity: 0 } : { y: 96, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={reduce ? { opacity: 0 } : { y: 96, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 36 }}
          className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        >
          <div className="mx-auto flex max-w-3xl items-center gap-2 rounded-[1.75rem] bg-surface/95 p-2 shadow-[var(--shadow-float)] ring-1 ring-line/70 backdrop-blur-xl">
            <button
              type="button"
              onClick={onOpen}
              className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-[1.4rem] px-2 text-left transition-colors hover:bg-surface-2"
              aria-label={`Visa korgen: ${countLabel(items.length)}${totals.kcal !== undefined && !mindful ? `, ${fmtEnergy(totals.kcal)}` : ''}`}
            >
              <span className="flex shrink-0 -space-x-2.5" aria-hidden>
                {items.slice(-3).map((i) => (
                  <CategoryIcon key={i.key} category={i.food.category} size="sm" className="rounded-full ring-2 ring-surface" />
                ))}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[0.95rem] font-semibold text-ink">
                  <motion.span key={items.length} initial={reduce ? false : { scale: 1.25 }} animate={{ scale: 1 }} className="inline-block tabular-nums">
                    {countLabel(items.length)}
                  </motion.span>
                  {!mindful && totals.kcal !== undefined && (
                    <>
                      {' · '}
                      <EnergyValue kcal={totals.kcal} />
                    </>
                  )}
                </span>
                <span className="block truncate text-xs text-ink-3">Korgen · {mealName(meals, meal)}</span>
              </span>
            </button>
            <Button onClick={onCommit} iconLeft={Check} className="shrink-0">
              Lägg till
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export interface BasketSheetProps {
  open: boolean
  onClose: () => void
  date: ISODate
  meal: MealId
  today: ISODate
  onCommit: () => void
  onEdit: (item: BasketItem) => void
}

/** Översikt över korgen: ändra mängder, ta bort, spara som måltid eller lägg till allt. */
export function BasketSheet({ open, onClose, date, meal, today, onCommit, onEdit }: BasketSheetProps) {
  const items = useBasketStore((s) => s.items)
  const remove = useBasketStore((s) => s.remove)
  const clear = useBasketStore((s) => s.clear)
  const meals = useProfileStore((s) => s.settings.meals)
  const mindful = useProfileStore((s) => s.settings.mindfulMode)
  const { saveTemplate } = useAddFood()
  const totals = useMemo(() => itemTotals(items), [items])
  const [saving, setSaving] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const name = mealName(meals, meal)

  const save = (e: FormEvent) => {
    e.preventDefault()
    const t = saveTemplate(templateName || `Min ${name.toLocaleLowerCase('sv-SE')}`, items, meal)
    if (t) {
      setSaving(false)
      setTemplateName('')
      toast(`${t.name} sparad – finns under Måltider`, { tone: 'success' })
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Korgen"
      description={`Läggs till i ${name} · ${relativeDayLabel(date, today)}`}
      footer={
        items.length > 0 ? (
          <Button size="lg" fullWidth iconLeft={Check} onClick={onCommit}>
            Lägg till {countLabel(items.length)}
          </Button>
        ) : undefined
      }
    >
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-gran-soft text-gran">
            <ShoppingBasket className="size-7" aria-hidden />
          </span>
          <p className="max-w-xs text-sm text-ink-2">Korgen är tom. Välj livsmedel och tryck "Lägg i korgen" för att lägga till flera på en gång.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4 pb-2">
          <ul className="divide-y divide-line/70">
            {items.map((item) => {
              const n = nutrientsForGrams(item.food.nutrients, item.grams)
              return (
                <li key={item.key} className={cx(mindful && '[&>div>button:first-child>span:last-child]:hidden')}>
                  <FoodRow
                    name={item.food.name}
                    brand={item.food.brand}
                    category={item.food.category}
                    imageUrl={item.food.imageUrl}
                    amountText={describeAmount(item.food, item.amount, item.unit)}
                    kcal={mindful ? undefined : n.kcal}
                    macros={{ protein: n.protein, carbs: n.carbs, fat: n.fat }}
                    showMacros={!mindful}
                    compact
                    onClick={() => onEdit(item)}
                    actionLabel={`${item.food.name}, ${describeAmount(item.food, item.amount, item.unit)}. Ändra mängd.`}
                    trailing={<IconButton icon={X} size="sm" aria-label={`Ta bort ${item.food.name} ur korgen`} onClick={() => remove(item.key)} noTooltip />}
                  />
                </li>
              )
            })}
          </ul>

          {!mindful && (
            <div className="flex items-center justify-between rounded-2xl bg-surface-2 px-4 py-3 text-sm">
              <span className="font-semibold text-ink">Totalt</span>
              <span className="flex items-center gap-3 tabular-nums text-ink-2">
                <span>P {formatNumber(totals.nutrients.protein ?? 0)} g</span>
                <span>K {formatNumber(totals.nutrients.carbs ?? 0)} g</span>
                <span>F {formatNumber(totals.nutrients.fat ?? 0)} g</span>
                <span className="font-semibold text-ink">
                  <EnergyValue kcal={totals.kcal} />
                </span>
              </span>
            </div>
          )}

          {saving ? (
            <form onSubmit={save} className="flex items-end gap-2">
              <TextField
                label="Namn på måltiden"
                value={templateName}
                onValueChange={setTemplateName}
                placeholder={`Min ${name.toLocaleLowerCase('sv-SE')}`}
                className="flex-1"
                autoFocus
                enterKeyHint="done"
              />
              <Button type="submit" variant="soft" className="h-12">
                Spara
              </Button>
            </form>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" iconLeft={BookmarkPlus} onClick={() => setSaving(true)}>
                Spara som måltid
              </Button>
              <Button variant="ghost" size="sm" iconLeft={Trash2} onClick={clear}>
                Töm korgen
              </Button>
            </div>
          )}
        </div>
      )}
    </Sheet>
  )
}
