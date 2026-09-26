/**
 * Dagsringen med makrostaplar – dagens energi i ett ögonkast.
 *
 * Budgeten är dagsmålet plus den andel av träningen som användaren valt att lägga tillbaka.
 * I medvetet läge visar ringen ett ord i stället för siffror och staplarna saknar siffror.
 */
import { memo, useMemo } from 'react'
import { CalorieRing, summarizeRing } from '../../components/signature'
import { MacroBars } from '../../components/domain'
import { Card } from '../../components/ui'
import { useDay } from '../../hooks/useDay'
import { dailyBudget } from '../../lib/diary'
import type { ISODate, Targets } from '../../types'
import { ringNote } from './todayLogic'
import { SectionLink } from './SectionLink'

export interface DayRingCardProps {
  today: ISODate
  targets: Targets
  mindful: boolean
  unit: 'kcal' | 'kJ'
  addBackPct: number
  showFiber: boolean
  /** Bred layout: ring och detaljerade staplar sida vid sida. */
  wide: boolean
}

export const DayRingCard = memo(function DayRingCard({ today, targets, mindful, unit, addBackPct, showFiber, wide }: DayRingCardProps) {
  const day = useDay(today)
  const eaten = day.totals.kcal ?? 0
  const exerciseAdded = Math.max(0, dailyBudget(targets.kcal, day.exercise, addBackPct) - targets.kcal)
  const protein = day.totals.protein ?? 0
  const carbs = day.totals.carbs ?? 0
  const fat = day.totals.fat ?? 0
  const macros = useMemo(() => ({ protein, carbs, fat }), [protein, carbs, fat])
  const note = mindful ? null : ringNote(summarizeRing(eaten, targets.kcal, exerciseAdded).status)

  return (
    <Card
      as="section"
      padding="lg"
      eyebrow="Dagsringen"
      aria-label="Dagsringen"
      action={<SectionLink to="/insikter" label="Näring och trender i Insikter">Näring</SectionLink>}
    >
      <div className={wide ? 'grid grid-cols-[auto_1fr] items-center gap-8' : 'flex flex-col items-center'}>
        <div className="flex flex-col items-center">
          <CalorieRing
            eatenKcal={eaten}
            budgetKcal={targets.kcal}
            exerciseKcal={exerciseAdded}
            macros={macros}
            mindful={mindful}
            unit={unit}
            size={wide ? 236 : 228}
          />
          {note && <p className="mt-3 max-w-[30ch] text-center text-sm leading-snug text-balance text-ink-2">{note}</p>}
        </div>
        <MacroBars
          totals={day.totals}
          targets={targets}
          showFiber={showFiber}
          hideNumbers={mindful}
          variant={wide ? 'detailed' : 'compact'}
          className={wide ? 'min-w-0' : 'mt-6 w-full'}
        />
      </div>
    </Card>
  )
})
