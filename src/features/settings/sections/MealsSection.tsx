/**
 * Inställningar → Måltider: byt namn, visa/dölj och återställ. Minst en måltid är alltid på.
 */
import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { Button, Switch, TextField, toast } from '../../../components/ui'
import { MealIcon } from '../../../components/domain/MealIcon'
import { MEAL_HOURS } from '../../../lib/meals'
import { DEFAULT_MEALS, useProfileStore } from '../../../stores/profileStore'
import type { MealConfig } from '../../../types'
import { MEAL_NAME_MAX, mealsAreDefault, renameMeal, setMealEnabled } from '../settingsLogic'

function hours(meal: MealConfig): string {
  const [from, to] = MEAL_HOURS[meal.id]
  if (to - from >= 24) return 'När som helst under dagen'
  const pad = (n: number) => String(n).padStart(2, '0')
  const clock = (h: number) => `${pad(Math.floor(h) % 24)}:${pad(Math.round((h % 1) * 60))}`
  return `Föreslås ca ${clock(from)}–${clock(to)}`
}

function MealRow({
  meal,
  onlyEnabled,
  onRename,
  onToggle,
}: {
  meal: MealConfig
  onlyEnabled: boolean
  /** Sparar namnet och returnerar det namn som faktiskt sparades (tomt namn ger standardnamnet). */
  onRename: (name: string) => string
  onToggle: (on: boolean) => void
}) {
  const [name, setName] = useState(meal.name)
  const [synced, setSynced] = useState(meal.name)
  if (synced !== meal.name) {
    setSynced(meal.name)
    setName(meal.name)
  }
  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <MealIcon meal={meal.id} size="md" className={meal.enabled ? '' : 'opacity-50 grayscale'} />
      <div className="min-w-0 flex-1">
        <TextField
          label={`Namn på måltiden ${meal.name}`}
          labelHidden
          value={name}
          maxLength={MEAL_NAME_MAX}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            // Visa det namn som sparades – ett tomt fält får tillbaka standardnamnet.
            if (name !== meal.name) setName(onRename(name))
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
          enterKeyHint="done"
          hint={hours(meal)}
          className={meal.enabled ? '' : 'opacity-60'}
        />
      </div>
      <Switch
        aria-label={`Visa ${meal.name} i dagboken`}
        checked={meal.enabled}
        disabled={onlyEnabled}
        onChange={onToggle}
      />
    </li>
  )
}

export function MealsSection() {
  const meals = useProfileStore((s) => s.settings.meals)
  const updateSettings = useProfileStore((s) => s.updateSettings)
  const enabledCount = meals.filter((m) => m.enabled).length

  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Måltider">
        <ul className="card flex flex-col p-1.5 [&>*+*]:border-t [&>*+*]:border-line/70">
          {meals.map((m) => (
            <MealRow
              key={m.id}
              meal={m}
              onlyEnabled={m.enabled && enabledCount === 1}
              onRename={(name) => {
                const next = renameMeal(meals, m.id, name)
                updateSettings({ meals: next })
                return next.find((x) => x.id === m.id)?.name ?? m.name
              }}
              onToggle={(on) => updateSettings({ meals: setMealEnabled(meals, m.id, on) })}
            />
          ))}
        </ul>
        <p className="mt-2 px-4 text-[0.8125rem] leading-relaxed text-ink-3">
          Dolda måltider syns inte när du lägger till mat. Minst en måltid behöver vara på. Tiderna styr vilken måltid som föreslås.
        </p>
      </section>
      {!mealsAreDefault(meals) && (
        <Button
          variant="secondary"
          iconLeft={RotateCcw}
          className="self-start"
          onClick={() => {
            const prev = meals
            updateSettings({ meals: DEFAULT_MEALS })
            toast('Måltiderna är återställda', { action: { label: 'Ångra', onClick: () => updateSettings({ meals: prev }) } })
          }}
        >
          Återställ standard
        </Button>
      )}
    </div>
  )
}
