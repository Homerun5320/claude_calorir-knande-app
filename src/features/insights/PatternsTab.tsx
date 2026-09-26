/**
 * Mönster – kalender över loggade dagar, när på dygnet du äter, mående mot intag,
 * alkohol per vecka och koffein. Iakttagelser visas bara när underlaget räcker.
 */
import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarHeatmap } from '../../components/charts'
import { MealIcon } from '../../components/domain'
import { Card, ProgressBar } from '../../components/ui'
import { lastNDays } from '../../lib/dates'
import { formatEnergy, formatNumber, formatNutrient } from '../../lib/format'
import { mealName } from '../../lib/meals'
import { STANDARD_DRINK_G } from '../../lib/nutrients'
import { totals } from '../../lib/diary'
import type { ISODate } from '../../types'
import { buildDayStats } from './aggregate'
import {
  alcoholByWeek,
  ALCOHOL_RISK_PER_WEEK,
  CAFFEINE_PER_CUP_MG,
  formatClock,
  mealTiming,
  MIN_MOOD_DAYS,
  MIN_TIMED_ENTRIES,
  moodInsights,
} from './patterns'
import { Callout, Columns, InfoNote, type ColumnDatum } from './ui'
import type { InsightsData } from './useInsights'

export function PatternsTab({ data }: { data: InsightsData }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="md:col-span-2">
        <CalendarCard data={data} />
      </div>
      <TimingCard data={data} />
      <MoodCard data={data} />
      <AlcoholCard data={data} />
      <CaffeineCard data={data} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Kalender
// ---------------------------------------------------------------------------

function CalendarCard({ data }: { data: InsightsData }) {
  const navigate = useNavigate()
  const { entriesByDate, today, mindful, unit, targets } = data
  const [month, setMonth] = useState<ISODate>(today)

  const firstDate = useMemo(() => {
    let min: ISODate | undefined
    for (const [d, list] of Object.entries(entriesByDate)) if (list.length > 0 && (min === undefined || d < min)) min = d
    return min
  }, [entriesByDate])

  const values = useMemo(() => {
    const out: Partial<Record<ISODate, number>> = {}
    for (const [d, list] of Object.entries(entriesByDate)) {
      if (list.length === 0) continue
      out[d] = mindful ? 1 : (totals(list).kcal ?? 0)
    }
    return out
  }, [entriesByDate, mindful])

  // Färgstyrka efter hur dagen låg mot målet – jämförbart mellan månader, utan röda varningar.
  const level = useCallback(
    (v: number) => {
      if (mindful) return 3
      const r = targets.kcal > 0 ? v / targets.kcal : 0
      if (r <= 0) return 1
      if (r < 0.6) return 1
      if (r < 0.9) return 2
      if (r <= 1.1) return 3
      return 4
    },
    [mindful, targets.kcal],
  )
  const formatValue = useCallback((v: number) => (mindful ? 'Loggad' : formatEnergy(v, unit)), [mindful, unit])
  const openDay = useCallback((date: ISODate) => navigate(`/dagbok/${date}`), [navigate])

  return (
    <Card title="Kalendern" eyebrow="Dina loggade dagar">
      <CalendarHeatmap
        month={month}
        values={values}
        today={today}
        onSelect={openDay}
        onMonthChange={setMonth}
        level={level}
        formatValue={formatValue}
        legendLabels={mindful ? ['Ej loggad', 'Loggad'] : ['Mindre', 'Mer']}
        showLegend={!mindful}
        disableFuture
        maxDate={today}
        minDate={firstDate}
      />
      <p className="mt-3 text-xs text-ink-3">
        {mindful
          ? 'Gröna dagar är loggade. Tryck på en dag för att öppna den i dagboken.'
          : 'Färgen visar hur dagen låg i förhållande till ditt mål. Tryck på en dag för att öppna den i dagboken.'}
      </p>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Måltidstider
// ---------------------------------------------------------------------------

const HOUR_LABELS: Record<number, string> = { 0: '00', 6: '06', 12: '12', 18: '18' }

function TimingCard({ data }: { data: InsightsData }) {
  const { entries, meals } = data
  const t = useMemo(() => mealTiming(entries), [entries])
  const columns = useMemo<ColumnDatum[]>(
    () =>
      t.byHour.map((count, h) => ({
        key: String(h),
        label: HOUR_LABELS[h] ?? '',
        value: count,
        ariaLabel: `Klockan ${String(h).padStart(2, '0')}: ${count} ${count === 1 ? 'post' : 'poster'}`,
        highlight: count > 0 && count === Math.max(...t.byHour),
      })),
    [t.byHour],
  )

  return (
    <Card title="När du äter" eyebrow="Dygnsrytm">
      {t.timedEntries < MIN_TIMED_ENTRIES ? (
        <p className="text-sm leading-relaxed text-ink-2">
          Ange gärna klockslag när du loggar måltider, så ser du här din dygnsrytm – när du brukar äta frukost, lunch och middag.
          {t.timedEntries > 0 && ` (${t.timedEntries} av minst ${MIN_TIMED_ENTRIES} poster har klockslag.)`}
        </p>
      ) : (
        <>
          <Columns data={columns} label="Antal poster per timme på dygnet" height={96} color="var(--lg-blabar)" gap="gap-0.5" />
          {t.firstMedian !== undefined && t.lastMedian !== undefined && (
            <Callout emoji="🕰️" className="mt-3">
              Du brukar äta dagens första måltid runt <strong className="font-semibold text-ink">{formatClock(t.firstMedian)}</strong> och
              den sista runt <strong className="font-semibold text-ink">{formatClock(t.lastMedian)}</strong>.
            </Callout>
          )}
          <ul className="mt-3 space-y-2">
            {t.byMeal.map((m) => (
              <li key={m.meal} className="flex items-center gap-3 text-sm">
                <MealIcon meal={m.meal} size="xs" />
                <span className="flex-1 text-ink-2">{mealName(meals, m.meal)}</span>
                <span className="font-medium text-ink tabular-nums">runt {formatClock(m.median)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Mående
// ---------------------------------------------------------------------------

function MoodCard({ data }: { data: InsightsData }) {
  const { days, metaByDate, period, today, entriesByDate, exerciseByDate, targets, addBackPct } = data
  // En enskild vecka räcker sällan för samband – då tittar vi på de senaste åtta veckorna.
  const weekly = period.kind === 'vecka'
  const sourceDays = useMemo(() => {
    if (!weekly) return days
    const end = period.end < today ? period.end : today
    return buildDayStats(lastNDays(56, end), entriesByDate, exerciseByDate, targets.kcal, addBackPct)
  }, [weekly, days, period.end, today, entriesByDate, exerciseByDate, targets.kcal, addBackPct])
  const a = useMemo(() => moodInsights(sourceDays, metaByDate), [sourceDays, metaByDate])
  const span = weekly ? 'de senaste 8 veckorna' : 'perioden'
  return (
    <Card title="Mående och mat" eyebrow={weekly ? 'Senaste 8 veckorna' : 'Humör, energi och hunger'}>
      {a.ratedDays < MIN_MOOD_DAYS ? (
        <p className="text-sm leading-relaxed text-ink-2">
          Skatta humör, energi och hunger i dagboken (kvällsreflektionen) så letar vi efter mönster när det finns minst{' '}
          {MIN_MOOD_DAYS} dagar att jämföra. Du har {a.ratedDays} {a.ratedDays === 1 ? 'dag' : 'dagar'} under {span}.
        </p>
      ) : a.insights.length === 0 ? (
        <Callout emoji="🌿">
          Inga tydliga samband mellan mat och mående under {span}. Det är också en insikt – kroppen är mer än siffror.
        </Callout>
      ) : (
        <ul className="space-y-2.5">
          {a.insights.map((i) => (
            <li key={i.metric}>
              <Callout emoji={i.emoji}>{i.text}</Callout>
            </li>
          ))}
        </ul>
      )}
      <InfoNote className="mt-3">
        Samband är inte orsak – se det som nyfikna iakttagelser. Oroar du dig för din relation till mat finns stöd hos 1177 och
        Frisk &amp; Fri.
      </InfoNote>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Alkohol och koffein
// ---------------------------------------------------------------------------

function AlcoholCard({ data }: { data: InsightsData }) {
  const { period, entriesByDate } = data
  const weeks = useMemo(() => alcoholByWeek(period.elapsed, entriesByDate), [period.elapsed, entriesByDate])
  const total = weeks.reduce((s, w) => s + w.drinks, 0)
  const perWeek = weeks.length ? total / weeks.length : 0

  return (
    <Card title="Alkohol" eyebrow="Standardglas per vecka">
      {total < 0.05 ? (
        <Callout emoji="🌿">Ingen alkohol registrerad under perioden – bra för både sömn och återhämtning.</Callout>
      ) : (
        <>
          <p className="text-sm text-ink-2">
            I snitt <strong className="font-semibold text-ink">{formatNumber(perWeek, 1)} standardglas</strong> per vecka (ett
            standardglas = {STANDARD_DRINK_G} g alkohol).
          </p>
          <ul className="mt-3 space-y-2" aria-label="Standardglas per vecka">
            {weeks.map((w) => (
              <li key={w.weekStart} className="flex items-center gap-3 text-sm">
                <span className="w-12 shrink-0 text-ink-3">v. {w.week}</span>
                <ProgressBar
                  className="flex-1"
                  value={w.drinks}
                  max={ALCOHOL_RISK_PER_WEEK}
                  size="sm"
                  color="var(--lg-vinbar)"
                  aria-label={`Vecka ${w.week}`}
                  valueText={`${formatNumber(w.drinks, 1)} standardglas`}
                />
                <span className="w-10 shrink-0 text-right text-ink-2 tabular-nums">{formatNumber(w.drinks, 1)}</span>
              </li>
            ))}
          </ul>
          <InfoNote className="mt-3">
            Ju mindre alkohol, desto bättre för hälsan. Stapeln fylls vid {ALCOHOL_RISK_PER_WEEK} glas – Socialstyrelsens gräns för
            riskbruk. Vill du prata med någon finns Alkoholhjälpen på 020-84 44 48.
          </InfoNote>
        </>
      )}
    </Card>
  )
}

function CaffeineCard({ data }: { data: InsightsData }) {
  const { avg, targets, mindful } = data
  const mg = avg.averages.caffeine
  const max = targets.caffeineMaxMg
  return (
    <Card title="Koffein" eyebrow="Snitt per loggad dag">
      {mg === undefined || mg < 1 ? (
        <p className="text-sm leading-relaxed text-ink-2">
          Inget koffein registrerat under perioden. Kaffe, te, energidryck och cola räknas när de loggas.
        </p>
      ) : (
        <>
          {!mindful && (
            <p className="text-sm text-ink-2">
              <strong className="font-semibold text-ink">{formatNutrient('caffeine', mg)}</strong> per dag – ungefär{' '}
              {formatNumber(mg / CAFFEINE_PER_CUP_MG, 1)} koppar bryggkaffe.
            </p>
          )}
          <ProgressBar
            className="mt-3"
            value={mg}
            max={max}
            size="sm"
            color="var(--lg-hjortron)"
            label={mindful ? (mg <= max ? 'Inom en säker nivå' : 'Över den rekommenderade nivån') : undefined}
            aria-label="Koffein per dag"
            valueText={`${formatNumber(mg)} av högst ${formatNumber(max)} mg`}
          />
          <p className="mt-2 text-xs leading-relaxed text-ink-3">
            {mg <= max
              ? `Under ${formatNumber(max)} mg per dag, som EFSA bedömer som säkert för friska vuxna.`
              : `Över ${formatNumber(max)} mg per dag. Kanske värt att prova te eller koffeinfritt ibland, särskilt på eftermiddagen.`}
          </p>
        </>
      )}
    </Card>
  )
}
