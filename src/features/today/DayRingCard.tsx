/**
 * Dagsringen med makrostaplar – dagens energi i ett ögonkast.
 *
 * Budgeten är dagsmålet plus den andel av träningen som användaren valt att lägga tillbaka.
 * Med veckobudget är dagsmålet dagens mål (t.ex. extra på fredagar) och en diskret rad under
 * ringen berättar det ("Fredagsmys: +300 kcal idag").
 * I medvetet läge visar ringen ett ord i stället för siffror och staplarna saknar siffror.
 */
import { memo, useMemo } from 'react'
import { CalendarRange } from 'lucide-react'
import { CalorieRing, summarizeRing } from '../../components/signature'
import { MacroBars } from '../../components/domain'
import { Card } from '../../components/ui'
import { useDay } from '../../hooks/useDay'
import { dailyBudget } from '../../lib/diary'
import type { ISODate, Targets } from '../../types'
import { roundEnergy } from '../diary/diaryLogic'
import { ringNote } from './todayLogic'
import { SectionLink } from './SectionLink'

export interface DayRingCardProps {
  today: ISODate
  /** Dagens mål (med veckobudgetens förskjutning). */
  targets: Targets
  mindful: boolean
  unit: 'kcal' | 'kJ'
  addBackPct: number
  showFiber: boolean
  /** Bred layout: ring och detaljerade staplar sida vid sida. */
  wide: boolean
  /** Diskret rad om veckobudgeten idag (`weeklyDayNote`), eller null. */
  weeklyNote?: string | null
}

export const DayRingCard = memo(function DayRingCard({ today, targets, mindful, unit, addBackPct, showFiber, wide, weeklyNote }: DayRingCardProps) {
  const day = useDay(today)
  // Avrunda i visningsenheten innan ringen räknar ut "kvar" – då går siffrorna jämnt upp.
  const eaten = roundEnergy(Math.max(0, day.totals.kcal ?? 0), unit)
  const budget = roundEnergy(targets.kcal, unit)
  const exerciseAdded = roundEnergy(Math.max(0, dailyBudget(targets.kcal, day.exercise, addBackPct) - targets.kcal), unit)
  const protein = day.totals.protein ?? 0
  const carbs = day.totals.carbs ?? 0
  const fat = day.totals.fat ?? 0
  const macros = useMemo(() => ({ protein, carbs, fat }), [protein, carbs, fat])
  const note = mindful ? null : ringNote(summarizeRing(eaten, budget, exerciseAdded).status)

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
            budgetKcal={budget}
            exerciseKcal={exerciseAdded}
            macros={macros}
            mindful={mindful}
            unit={unit}
            size={wide ? 236 : 228}
          />
          {note && <p className="mt-3 max-w-[30ch] text-center text-sm leading-snug text-balance text-ink-2">{note}</p>}
          {weeklyNote && (
            <p className="mt-2 inline-flex max-w-[34ch] items-start gap-1.5 text-center text-[0.8125rem] leading-snug text-balance text-ink-3">
              <CalendarRange className="mt-0.5 size-3.5 shrink-0" strokeWidth={2.2} aria-hidden="true" />
              <span>{weeklyNote}</span>
            </p>
          )}
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
