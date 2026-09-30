/**
 * Snabbregistrering – när man bara vill notera ungefär: ett namn och energin, makron om man vill.
 * Perfekt för restaurangbesök eller när man inte orkar leta upp varje ingrediens.
 */
import { useId, useState, type FormEvent } from 'react'
import { Zap } from 'lucide-react'
import type { MealId, ISODate } from '../../types'
import { Button, NumberField, Sheet, TextField } from '../../components/ui'
import { useProfileStore } from '../../stores/profileStore'
import { mealName } from '../../lib/meals'
import { formatEnergy } from '../../lib/format'
import { KJ_PER_KCAL } from '../../lib/nutrients'
import { quickNutrients } from './addLogic'
import { useAddFood } from './useAddFood'

export interface QuickAddSheetProps {
  open: boolean
  onClose: () => void
  date: ISODate
  meal: MealId
  /** Anropas efter att posten lagts till. */
  onAdded?: () => void
  /** Förifyllt namn (t.ex. söktexten). */
  initialName?: string
}

export function QuickAddSheet({ open, onClose, date, meal, onAdded, initialName = '' }: QuickAddSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title="Snabbregistrera" description="Notera energin ungefär – det räcker gott.">
      {open && <QuickAddForm date={date} meal={meal} initialName={initialName} onDone={() => { onAdded?.(); onClose() }} />}
    </Sheet>
  )
}

function QuickAddForm({ date, meal, initialName, onDone }: { date: ISODate; meal: MealId; initialName: string; onDone: () => void }) {
  const energyUnit = useProfileStore((s) => s.settings.energyUnit)
  const meals = useProfileStore((s) => s.settings.meals)
  const { addQuick } = useAddFood()
  const formId = useId()
  const [name, setName] = useState(initialName)
  const [energy, setEnergy] = useState<number | undefined>()
  const [protein, setProtein] = useState<number | undefined>()
  const [carbs, setCarbs] = useState<number | undefined>()
  const [fat, setFat] = useState<number | undefined>()
  const [tried, setTried] = useState(false)

  const nutrients = quickNutrients({ energy, protein, carbs, fat }, energyUnit)
  const other = energyUnit === 'kJ' ? 'kcal' : 'kJ'

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (!nutrients) return
    const entry = addQuick(name, nutrients, { date, meal })
    if (entry) onDone()
  }

  return (
    <form id={formId} onSubmit={submit} className="flex flex-col gap-4 pb-2" noValidate>
      <TextField label="Vad åt du?" optional value={name} onValueChange={setName} placeholder="T.ex. Lunch på restaurang" autoComplete="off" enterKeyHint="next" />
      <NumberField
        label="Energi"
        value={energy}
        onChange={setEnergy}
        suffix={energyUnit}
        min={0}
        max={energyUnit === 'kJ' ? 40000 : 10000}
        step={energyUnit === 'kJ' ? 100 : 10}
        required
        placeholder={energyUnit === 'kJ' ? 't.ex. 2 500' : 't.ex. 600'}
        error={tried && !nutrients ? 'Ange energin för att kunna lägga till.' : undefined}
        hint={
          energy !== undefined && energy > 0
            ? `≈ ${formatEnergy(energyUnit === 'kJ' ? energy / KJ_PER_KCAL : energy, other)}`
            : 'Ungefär räcker – Lagom handlar om helheten.'
        }
      />
      <fieldset className="grid grid-cols-3 gap-2.5">
        <legend className="eyebrow mb-2">Makron (valfritt)</legend>
        <NumberField label="Protein" value={protein} onChange={setProtein} suffix="g" min={0} max={1000} />
        <NumberField label="Kolhydr." aria-label="Kolhydrater" value={carbs} onChange={setCarbs} suffix="g" min={0} max={2000} />
        <NumberField label="Fett" value={fat} onChange={setFat} suffix="g" min={0} max={1000} />
      </fieldset>
      <Button type="submit" size="lg" fullWidth iconLeft={Zap}>
        Lägg till i {mealName(meals, meal)}
      </Button>
    </form>
  )
}
