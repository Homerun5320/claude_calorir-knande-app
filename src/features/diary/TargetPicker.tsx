/**
 * Välj dag och måltid – för "Kopiera till…" och "Flytta till annan dag".
 * Snabbval (Igår/Idag/Imorgon), ett datumfält för andra dagar och måltidschips.
 */
import { useId } from 'react'
import { CalendarDays } from 'lucide-react'
import { Chip, TextField } from '../../components/ui'
import { MEAL_META } from '../../components/domain'
import { addDays, formatDayLong } from '../../lib/dates'
import type { ISODate, MealConfig, MealId } from '../../types'
import { isValidISODate, MAX_FUTURE_DAYS, quickTargetDates } from './diaryLogic'

export interface Target {
  date: ISODate
  meal: MealId
}

export interface TargetPickerProps {
  value: Target
  onChange: (next: Target) => void
  today: ISODate
  /** Måltider att välja bland (aktiverade, i inställningarnas ordning). */
  meals: readonly MealConfig[]
  /** Dölj snabbvalet för den här dagen (t.ex. källdagen vid flytt). */
  excludeDate?: ISODate
}

export function TargetPicker({ value, onChange, today, meals, excludeDate }: TargetPickerProps) {
  const dayLabelId = useId()
  const mealLabelId = useId()
  const quick = quickTargetDates(today, excludeDate)
  const isQuick = quick.some((q) => q.date === value.date)
  const maxDate = addDays(today, MAX_FUTURE_DAYS)

  return (
    <div className="flex flex-col gap-5">
      <div role="group" aria-labelledby={dayLabelId}>
        <div id={dayLabelId} className="eyebrow mb-2">
          Dag
        </div>
        <div className="flex flex-wrap gap-2">
          {quick.map((q) => (
            <Chip key={q.date} selected={value.date === q.date} onClick={() => onChange({ ...value, date: q.date })}>
              {q.label}
            </Chip>
          ))}
        </div>
        <TextField
          className="mt-3"
          type="date"
          label="Annan dag"
          prefix={CalendarDays}
          value={value.date}
          max={maxDate}
          hint={isQuick ? undefined : formatDayLong(value.date, today)}
          onValueChange={(v) => {
            if (isValidISODate(v) && v <= maxDate) onChange({ ...value, date: v })
          }}
        />
      </div>

      <div role="group" aria-labelledby={mealLabelId}>
        <div id={mealLabelId} className="eyebrow mb-2">
          Måltid
        </div>
        <div className="flex flex-wrap gap-2">
          {meals.map((m) => (
            <Chip
              key={m.id}
              selected={value.meal === m.id}
              onClick={() => onChange({ ...value, meal: m.id })}
              icon={MEAL_META[m.id].icon}
            >
              {m.name}
            </Chip>
          ))}
        </div>
      </div>
    </div>
  )
}
