/**
 * Veckan i miniformat – energi per dag de senaste sju dagarna mot målet, med snitt.
 *
 * Tryck på en stapel för att öppna den dagen i dagboken; "Insikter" leder till trenderna.
 * I medvetet läge visas i stället vilka dagar som har registrerats – helt utan siffror för energi.
 */
import { memo, useCallback, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Check, ChevronRight } from 'lucide-react'
import { BarChart, type BarDatum } from '../../components/charts'
import { EnergyValue } from '../../components/domain'
import { Card } from '../../components/ui'
import { formatDayLong, lastNDays, WEEKDAYS_SHORT, weekdayIndex } from '../../lib/dates'
import { formatNumber } from '../../lib/format'
import { KJ_PER_KCAL } from '../../lib/nutrients'
import { useDiaryStore } from '../../stores/diaryStore'
import type { ISODate } from '../../types'
import { SectionLink } from './SectionLink'
import { weekAverage, weekSeries, type WeekDay } from './todayLogic'

export interface WeekCardProps {
  today: ISODate
  targetKcal: number
  addBackPct: number
  mindful: boolean
  unit: 'kcal' | 'kJ'
}

function MindfulWeek({ series, today }: { series: readonly WeekDay[]; today: ISODate }) {
  const logged = series.filter((d) => d.kcal !== undefined).length
  return (
    <>
      <ul className="grid grid-cols-7 gap-1" aria-label="Dagar med registrering den senaste veckan">
        {series.map((d) => {
          const has = d.kcal !== undefined
          const isToday = d.date === today
          return (
            <li key={d.date} className="flex flex-col items-center gap-1.5">
              <span
                className={`grid size-9 place-items-center rounded-full ${has ? 'bg-gran-soft text-gran' : 'bg-surface-2 text-ink-3'} ${
                  isToday ? 'ring-2 ring-gran/50 ring-offset-2 ring-offset-surface' : ''
                }`}
                aria-label={`${formatDayLong(d.date, today)}: ${has ? 'registrerad' : 'inget registrerat'}`}
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

export const WeekCard = memo(function WeekCard({ today, targetKcal, addBackPct, mindful, unit }: WeekCardProps) {
  const navigate = useNavigate()
  const entries = useDiaryStore((s) => s.entries)
  const exercise = useDiaryStore((s) => s.exercise)
  const todayComplete = useDiaryStore((s) => s.days[today]?.complete === true)

  const dates = useMemo(() => lastNDays(7, today), [today])
  const series = useMemo(() => weekSeries(dates, entries, exercise, targetKcal, addBackPct), [dates, entries, exercise, targetKcal, addBackPct])
  const average = useMemo(() => weekAverage(series, today, todayComplete), [series, today, todayComplete])

  // Diagrammet räknar i vald enhet så att axeln och tooltipen stämmer.
  const factor = unit === 'kJ' ? KJ_PER_KCAL : 1
  const data = useMemo<BarDatum[]>(
    () =>
      series.map((d) => ({
        date: d.date,
        value: d.kcal === undefined ? undefined : d.kcal * factor,
        // Eget mål bara de dagar då träning har höjt budgeten.
        target: Math.abs(d.budget - targetKcal) >= 1 ? d.budget * factor : undefined,
      })),
    [series, factor, targetKcal],
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
            target={targetKcal * factor}
            targetLabel="Mål"
            highlight={today}
            onSelect={openDay}
            height={156}
            unit={unit}
            formatValue={formatValue}
            title="Energi per dag de senaste sju dagarna"
            emptyText="Inget registrerat den här veckan ännu"
            legend={false}
          />
          <Link
            to="/insikter"
            className="-mx-2 mt-2 flex min-h-11 items-center gap-2 rounded-2xl px-2 text-sm transition-colors hover:bg-surface-2"
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
        </>
      )}
    </Card>
  )
})
