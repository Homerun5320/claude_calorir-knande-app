/**
 * Veckan i miniformat – energi per dag de senaste sju dagarna mot målet, med snitt.
 *
 * Med veckobudget har varje dag sitt eget mål (t.ex. extra på fredag och lördag): staplarna får
 * dagens mål som markering ("Dagsmål"), linjen visar veckans snittmål (`plan.averageKcal` – högre än
 * basmålet om någon dag har höjts till golvet) och en neutral rad under snittet visar veckans budget.
 *
 * Tryck på en stapel för att öppna den dagen i dagboken; "Insikter" leder till trenderna.
 * I medvetet läge visas i stället vilka dagar som har registrerats – helt utan siffror för energi.
 */
import { memo, useCallback, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CalendarRange, Check, ChevronRight } from 'lucide-react'
import { BarChart, type BarDatum } from '../../components/charts'
import { EnergyValue } from '../../components/domain'
import { Card } from '../../components/ui'
import { formatDayLong, lastNDays, WEEKDAYS_SHORT, weekdayIndex } from '../../lib/dates'
import { MIN_KCAL } from '../../lib/energy'
import { formatEnergy, formatNumber } from '../../lib/format'
import { KJ_PER_KCAL } from '../../lib/nutrients'
import { averageKcalFor, kcalForDate, weeklyBudgetSummary, type WeeklyPlan } from '../../lib/weeklyBudget'
import { useDiaryStore } from '../../stores/diaryStore'
import { useProfileStore } from '../../stores/profileStore'
import type { ISODate } from '../../types'
import { CareNote } from './CareNote'
import { SectionLink } from './SectionLink'
import { lowIntakeAverage, weekAverage, weekChartSummary, weekSeries, type WeekDay } from './todayLogic'

export interface WeekCardProps {
  today: ISODate
  /** Dagsmålet utan veckobudget (snittmålet när veckobudgeten används). */
  targetKcal: number
  /** Veckobudgeten (dagsmål per veckodag), eller null. */
  weeklyPlan?: WeeklyPlan | null
  addBackPct: number
  mindful: boolean
  unit: 'kcal' | 'kJ'
}

function MindfulWeek({ series, today }: { series: readonly WeekDay[]; today: ISODate }) {
  const logged = series.filter((d) => d.kcal !== undefined).length
  return (
    <>
      <ul className="grid grid-cols-7 gap-1" aria-label="Loggade dagar den senaste veckan">
        {series.map((d) => {
          const has = d.kcal !== undefined
          const isToday = d.date === today
          return (
            <li key={d.date} className="flex flex-col items-center gap-1.5">
              <span
                className={`grid size-9 place-items-center rounded-full ${has ? 'bg-gran-soft text-gran' : 'bg-surface-2 text-ink-3'} ${
                  isToday ? 'ring-2 ring-gran/50 ring-offset-2 ring-offset-surface' : ''
                }`}
                aria-label={`${formatDayLong(d.date, today)}: ${has ? 'loggad' : 'inget loggat'}`}
                role="img"
              >
                {has && <Check className="size-4" strokeWidth={2.6} aria-hidden="true" />}
              </span>
              <span className={`text-[11px] ${isToday ? 'font-semibold text-gran' : 'text-ink-3'}`}>{WEEKDAYS_SHORT[weekdayIndex(d.date)]}</span>
            </li>
          )
        })}
      </ul>
      <p className="mt-4 text-sm leading-relaxed text-ink-2">
        {logged === 0
          ? 'En ny vecka att fylla med god mat.'
          : `Du har skrivit i dagboken ${logged} av 7 dagar – varje stund du tar dig räknas.`}
      </p>
    </>
  )
}

export const WeekCard = memo(function WeekCard({ today, targetKcal, weeklyPlan = null, addBackPct, mindful, unit }: WeekCardProps) {
  const navigate = useNavigate()
  const entries = useDiaryStore((s) => s.entries)
  const exercise = useDiaryStore((s) => s.exercise)
  const days = useDiaryStore((s) => s.days)
  const todayComplete = days[today]?.complete === true
  const sex = useProfileStore((s) => s.profile?.sex ?? 'kvinna')
  const floorKcal = MIN_KCAL[sex]

  const dates = useMemo(() => lastNDays(7, today), [today])
  // Med veckobudget har varje dag sitt eget mål.
  const targetFor = useMemo(() => (weeklyPlan ? (d: ISODate) => kcalForDate(targetKcal, weeklyPlan, d) : targetKcal), [weeklyPlan, targetKcal])
  // Linjen: målet, eller veckans snittmål med veckobudget.
  const lineKcal = averageKcalFor(targetKcal, weeklyPlan)
  const series = useMemo(() => weekSeries(dates, entries, exercise, targetFor, addBackPct), [dates, entries, exercise, targetFor, addBackPct])
  const average = useMemo(() => weekAverage(series, today, todayComplete), [series, today, todayComplete])
  const summary = useMemo(
    () => weekChartSummary(series, today, todayComplete, lineKcal, unit, weeklyPlan !== null),
    [series, today, todayComplete, lineKcal, unit, weeklyPlan],
  )
  const budgetText = weeklyBudgetSummary(weeklyPlan, unit)
  // Varsam notis om de dagar som markerats som klara ligger under energigolvet.
  const lowIntake = useMemo(() => lowIntakeAverage(today, entries, days, floorKcal) !== undefined, [today, entries, days, floorKcal])

  // Diagrammet räknar i vald enhet så att axeln och tooltipen stämmer.
  const factor = unit === 'kJ' ? KJ_PER_KCAL : 1
  const data = useMemo<BarDatum[]>(
    () =>
      series.map((d) => ({
        date: d.date,
        value: d.kcal === undefined ? undefined : d.kcal * factor,
        // Eget mål bara de dagar då träning eller veckobudgeten gör att dagens mål skiljer sig från linjen.
        target: Math.abs(d.budget - lineKcal) >= 1 ? d.budget * factor : undefined,
      })),
    [series, factor, lineKcal],
  )
  const formatValue = useCallback((v: number) => `${formatNumber(Math.round(v))} ${unit}`, [unit])
  const openDay = useCallback((date: ISODate) => navigate(`/dagbok/${date}`), [navigate])

  return (
    <Card title="Veckan" eyebrow="Senaste 7 dagarna" action={<SectionLink to="/insikter">Insikter</SectionLink>}>
      {mindful ? (
        <MindfulWeek series={series} today={today} />
      ) : (
        <>
          <BarChart
            data={data}
            target={lineKcal * factor}
            targetLabel={weeklyPlan ? 'Snittmål' : 'Mål'}
            dayTargetLabel={weeklyPlan ? 'Dagsmål' : undefined}
            highlight={today}
            onSelect={openDay}
            height={156}
            unit={unit}
            formatValue={formatValue}
            title="Energi per dag de senaste sju dagarna"
            summary={summary}
            emptyText="Inget loggat den här veckan ännu"
            legend={false}
          />
          <Link
            to="/insikter"
            className="-mx-2 mt-2 flex min-h-11 flex-wrap items-center gap-x-2 rounded-2xl px-2 text-sm transition-colors hover:bg-surface-2"
          >
            <span className="text-ink-3">Snitt</span>
            {average !== undefined ? (
              <span className="font-semibold text-ink">
                <EnergyValue kcal={average} />
                <span className="font-normal text-ink-3"> per dag</span>
              </span>
            ) : (
              <span className="text-ink-3">–</span>
            )}
            <span className="ml-auto inline-flex items-center gap-0.5 text-[0.8125rem] font-semibold text-gran">
              Se trender
              <ChevronRight className="size-3.5" strokeWidth={2.6} aria-hidden="true" />
            </span>
          </Link>
          {budgetText && (
            <p className="mt-1 flex items-start gap-2 text-[0.8125rem] leading-snug text-ink-3">
              <CalendarRange className="mt-0.5 size-3.5 shrink-0" strokeWidth={2.2} aria-hidden="true" />
              <span>
                {budgetText}
                {weeklyPlan && !weeklyPlan.clamped && ' Samma energi över veckan, bara fördelad annorlunda.'}
              </span>
            </p>
          )}
        </>
      )}
      {lowIntake && (
        <CareNote className="mt-3">
          {mindful
            ? 'De dagar du markerat som klara har du ätit mindre än kroppen behöver för att orka. Ät gärna lite mer – regelbundna måltider ger energi.'
            : `De dagar du markerat som klara har du i snitt ätit mindre än ${formatEnergy(floorKcal, unit)} per dag – mindre än kroppen behöver för att orka. Ät gärna lite mer – regelbundna måltider ger energi.`}
        </CareNote>
      )}
    </Card>
  )
})
