/**
 * "Beskriv måltiden" – skriv vad du åt, ge måltiden ett namn och få ett enda ungefärligt svar.
 *
 * Det är ingen AI-tjänst: texten tolkas på enheten med samma fritextläsare som sökfältet (`resolveFreeText`)
 * mot Lagoms livsmedel, och värdena läggs ihop till en snabbregistrerad post. Inget skickas någonstans.
 */
import { useId, useMemo, useState, type FormEvent } from 'react'
import { HelpCircle, Sparkles } from 'lucide-react'
import type { ISODate, MealId, Nutrients } from '../../types'
import { Button, Sheet, TextField } from '../../components/ui'
import { useProfileStore } from '../../stores/profileStore'
import { mealName } from '../../lib/meals'
import { formatEnergy, formatNutrient } from '../../lib/format'
import { NUTRIENTS, nutrientsForGrams, sumNutrients, type NutrientKey } from '../../lib/nutrients'
import { formatAmount } from '../../lib/units'
import { freeTextRows } from './FreeTextCard'
import { useFreeTextItems } from './useFreeText'
import { useAddFood } from './useAddFood'

export interface DescribeMealSheetProps {
  open: boolean
  onClose: () => void
  date: ISODate
  meal: MealId
  onAdded?: () => void
}

export function DescribeMealSheet({ open, onClose, date, meal, onAdded }: DescribeMealSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title="Beskriv måltiden" description="Skriv vad du åt – Lagom räknar ut ett ungefärligt värde.">
      {open && (
        <DescribeForm
          date={date}
          meal={meal}
          onDone={() => {
            onAdded?.()
            onClose()
          }}
        />
      )}
    </Sheet>
  )
}

/** Avrundade totalvärden: hela kcal och en decimal för övriga ämnen. */
export function roundedTotals(list: Nutrients[]): Nutrients {
  const sum = sumNutrients(list)
  const out: Nutrients = {}
  for (const key of Object.keys(sum) as NutrientKey[]) {
    const v = sum[key]
    if (v === undefined) continue
    out[key] = key === 'kcal' ? Math.round(v) : Math.round(v * 10) / 10
  }
  return out
}

function DescribeForm({ date, meal, onDone }: { date: ISODate; meal: MealId; onDone: () => void }) {
  const mindful = useProfileStore((s) => s.settings.mindfulMode)
  const energyUnit = useProfileStore((s) => s.settings.energyUnit)
  const meals = useProfileStore((s) => s.settings.meals)
  const { addQuick } = useAddFood()
  const formId = useId()
  const [text, setText] = useState('')
  const [name, setName] = useState('')
  const items = useFreeTextItems(text, meal, { single: true })
  const rows = useMemo(() => freeTextRows(items, {}), [items])
  const ready = rows.filter((r) => r.food && r.grams > 0)
  const missing = rows.filter((r) => !r.food)
  const totals = useMemo(() => roundedTotals(ready.map((r) => nutrientsForGrams(r.food!.nutrients, r.grams))), [ready])
  const hasResult = ready.length > 0 && totals.kcal !== undefined

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!hasResult) return
    const label = name.trim() || text.trim().slice(0, 60)
    if (addQuick(label, totals, { date, meal })) onDone()
  }

  return (
    <form id={formId} onSubmit={submit} className="flex flex-col gap-4 pb-2" noValidate>
      <TextField
        label="Vad åt du?"
        multiline
        minRows={3}
        value={text}
        onValueChange={setText}
        placeholder="T.ex. två ägg, två mackor med ost och ett glas mjölk"
        autoComplete="off"
        hint="Skriv flera saker med komma eller ”och”. Mängder som ”2 dl” och ”3 skivor” går bra."
      />
      <TextField label="Namn på måltiden" optional value={name} onValueChange={setName} placeholder="T.ex. Frukost på söndag" autoComplete="off" enterKeyHint="done" />

      {text.trim() && (
        <section aria-live="polite" aria-label="Så tolkade Lagom det du skrev" className="flex flex-col gap-3 rounded-2xl bg-surface-2 p-4">
          {ready.length > 0 && (
            <>
              <p className="flex items-start gap-2 text-sm text-ink-2">
                <Sparkles className="mt-0.5 size-4 shrink-0 text-gran" aria-hidden />
                <span>
                  {ready.map((r) => formatAmount(r.food!, r.amount, r.unit, true) + ' ' + r.food!.name.toLowerCase()).join(', ')}
                </span>
              </p>
              {!mindful && hasResult && (
                <div>
                  <p className="font-display text-[1.75rem] font-semibold leading-none text-ink">ca {formatEnergy(totals.kcal ?? 0, energyUnit)}</p>
                  <p className="mt-1.5 text-sm text-ink-2">
                    {(['protein', 'carbs', 'fat'] as const)
                      .map((k) => `${NUTRIENTS[k].name.toLowerCase()} ${formatNutrient(k, totals[k])}`)
                      .join(' · ')}
                  </p>
                </div>
              )}
            </>
          )}
          {missing.length > 0 && (
            <p className="flex items-start gap-2 text-sm text-ink-2">
              <HelpCircle className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
              <span>Hittade inget för {missing.map((r) => `”${r.item.quantity.name || r.item.raw}”`).join(', ')} – det räknas inte med.</span>
            </p>
          )}
          <p className="text-xs text-ink-3">Ett ungefärligt värde. Mängder och livsmedel gissas, så det kan skilja en del.</p>
        </section>
      )}

      <Button type="submit" size="lg" fullWidth disabled={!hasResult}>
        Lägg till i {mealName(meals, meal)}
      </Button>
    </form>
  )
}
