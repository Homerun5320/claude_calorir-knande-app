/**
 * Översikt – energi per dag mot budget, snitt, energifördelning mot NNR, loggning,
 * starkaste/svagaste näringsämnen, veckodagsmönster och vikttrend.
 */
import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Share2 } from 'lucide-react'
import { BarChart, DonutChart, LineChart, Sparkline, type BarDatum, type BarStackKey, type DonutSegment } from '../../components/charts'
import { EnergyValue } from '../../components/domain'
import { Badge, Button, Card, Chip, ProgressRing, Stat, type StatTrend } from '../../components/ui'
import { addDays, formatDayLong, lastNDays, WEEKDAYS_SHORT, weekdayIndex } from '../../lib/dates'
import { youngestAge } from '../../lib/energy'
import { formatEnergy, formatKg, formatNumber, formatNutrient, plural } from '../../lib/format'
import { percentText } from './fmt'
import { energyDistribution, KJ_PER_KCAL, NUTRIENTS } from '../../lib/nutrients'
import { useBodyStore } from '../../stores/bodyStore'
import { useProfileStore } from '../../stores/profileStore'
import type { ISODate } from '../../types'
import {
  buildDayStats,
  consistency,
  macroKcal,
  macroVerdicts,
  mindfulAverageLabel,
  rankNutrients,
  RANGE_STATUS_LABELS,
  rollingAverage,
  summarizeDays,
  weightWindow,
  withPersonalProtein,
  type DayStat,
  type MacroRangeKey,
  type RankedNutrient,
} from './aggregate'
import { goodDirection } from '../body/bodyLogic'
import { CareNote } from '../today/CareNote'
import type { InsightsTab } from './nav'
import { weekdayInsight, weekdayPattern, MIN_PATTERN_DAYS } from './patterns'
import { previousPeriod } from './period'
import { CardAction, CardLink, Callout, Columns, Dot, InfoNote, ShareBar, weekdayColumns } from './ui'
import type { InsightsData } from './useInsights'

const MACRO_COLOR: Record<MacroRangeKey | 'alcohol', string> = {
  protein: 'var(--lg-lingon)',
  carbs: 'var(--lg-hjortron)',
  fat: 'var(--lg-blabar)',
  alcohol: 'var(--lg-vinbar)',
}

const STACK: readonly BarStackKey[] = [
  { key: 'protein', label: 'Protein', color: MACRO_COLOR.protein },
  { key: 'carbs', label: 'Kolhydrater', color: MACRO_COLOR.carbs },
  { key: 'fat', label: 'Fett', color: MACRO_COLOR.fat },
]
const STACK_WITH_ALCOHOL: readonly BarStackKey[] = [...STACK, { key: 'alcohol', label: 'Alkohol', color: MACRO_COLOR.alcohol }]

export interface OverviewTabProps {
  data: InsightsData
  onTab: (tab: InsightsTab) => void
  onShare: () => void
  sharing: boolean
}

export function OverviewTab({ data, onTab, onShare, sharing }: OverviewTabProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <ConsistencyCard data={data} />
      <div className="md:col-span-2">{data.mindful ? <MindfulEnergyCard data={data} /> : <EnergyCard data={data} />}</div>
      <DistributionCard data={data} />
      <NutrientHighlightsCard data={data} onTab={onTab} />
      {!data.mindful && <WeekdayCard data={data} />}
      {!data.mindful && <WeightTrendCard data={data} />}
      <div className="md:col-span-2">
        <Button variant="soft" fullWidth iconLeft={Share2} loading={sharing} onClick={onShare}>
          {data.period.kind === 'vecka' ? 'Dela veckorapport' : 'Dela rapport'}
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Loggning
// ---------------------------------------------------------------------------

function ConsistencyCard({ data }: { data: InsightsData }) {
  const c = consistency(data.summary.loggedDays, data.summary.elapsedDays)
  const near = data.summary.nearBudgetDays
  return (
    <Card className="md:col-span-2" padding="md">
      <div className="flex items-center gap-4">
        <ProgressRing
          value={c.logged}
          max={Math.max(1, c.elapsed)}
          size={76}
          thickness={8}
          tone="gran"
          aria-label="Loggade dagar"
          valueText={`${c.logged} av ${plural(c.elapsed, 'dag', 'dagar')}`}
        >
          <span className="display-num text-xl leading-none text-ink">
            {c.logged}
            <span className="text-sm text-ink-3">/{c.elapsed}</span>
          </span>
        </ProgressRing>
        <div className="min-w-0">
          <p className="font-display text-[1.1875rem] leading-snug font-semibold tracking-tight">{c.title}</p>
          <p className="mt-0.5 text-sm leading-relaxed text-ink-2">{c.text}</p>
          {!data.mindful && c.logged > 0 && (
            <p className="mt-1.5 text-xs text-ink-3">
              {near === 0
                ? 'Snitten bygger bara på loggade dagar.'
                : `${near} ${near === 1 ? 'lagom-dag' : 'lagom-dagar'} – inom ±10\u00a0% av dagens mål.`}
            </p>
          )}
          {data.period.todayExcluded && (
            <p className="mt-1.5 text-xs text-ink-3">Idag räknas med i snitten när du markerar dagen som klar i dagboken.</p>
          )}
        </div>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Energi per dag
// ---------------------------------------------------------------------------

/** "120 kcal mer per dag än förra veckan" – neutral jämförelse med perioden innan. */
function useTrend(data: InsightsData): string | undefined {
  const { period, today, entriesByDate, exerciseByDate, targetKcalFor, addBackPct, summary, unit } = data
  return useMemo(() => {
    if (summary.avgKcal === undefined) return undefined
    const prev = previousPeriod(period, today)
    const prevSummary = summarizeDays(buildDayStats(prev.elapsed, entriesByDate, exerciseByDate, targetKcalFor, addBackPct))
    if (prevSummary.avgKcal === undefined || prevSummary.loggedDays < 2) return undefined
    const diff = summary.avgKcal - prevSummary.avgKcal
    const what = period.kind === 'vecka' ? (period.isCurrent ? 'samma dagar förra veckan' : 'veckan innan') : 'perioden innan'
    if (Math.abs(diff) < 20) return `Ungefär som ${what}.`
    return `${formatEnergy(Math.abs(diff), unit)} ${diff > 0 ? 'mer' : 'mindre'} per dag än ${what}.`
  }, [period, today, entriesByDate, exerciseByDate, targetKcalFor, addBackPct, summary.avgKcal, unit])
}

function EnergyCard({ data }: { data: InsightsData }) {
  const navigate = useNavigate()
  const { period, chartDays, days, summary, avg, targets, goalKcal, unit, today, weeklyPlan } = data
  // Med veckobudget har dagarna olika mål – linjen och "mål" är då veckans snitt, och varje dags
  // eget mål heter "Dagsmål".
  const goalWord = weeklyPlan ? 'Snittmål' : 'Mål'
  const [stacked, setStacked] = useState(false)
  const factor = unit === 'kJ' ? KJ_PER_KCAL : 1
  const trend = useTrend(data)
  const long = period.kind === '90'

  const hasAlcohol = useMemo(() => chartDays.some((d) => (d.totals.alcohol ?? 0) > 0), [chartDays])
  const barData = useMemo<BarDatum[]>(
    () =>
      chartDays.map((d) => {
        const target = Math.abs(d.budget - goalKcal) >= 1 ? d.budget * factor : undefined
        if (!stacked) return { date: d.date, target, value: d.kcal === undefined ? undefined : d.kcal * factor }
        if (d.kcal === undefined) return { date: d.date, target }
        const m = macroKcal(d)
        return {
          date: d.date,
          target,
          segments: { protein: m.protein * factor, carbs: m.carbs * factor, fat: m.fat * factor, alcohol: m.alcohol * factor },
        }
      }),
    [chartDays, stacked, factor, goalKcal],
  )
  const lineSeries = useMemo(() => {
    if (!long) return []
    const daily = days.filter((d) => d.logged && d.kcal !== undefined).map((d) => ({ date: d.date, value: (d.kcal ?? 0) * factor }))
    const rolling = rollingAverage(days).map((p) => ({ date: p.date, value: p.value * factor }))
    return [
      { id: 'dag', label: 'Per dag', points: daily, display: 'dots' as const, color: 'var(--lg-ink-3)' },
      { id: 'snitt', label: 'Snitt 7 dagar', points: rolling, color: 'var(--lg-gran)', strokeWidth: 2.5 },
    ]
  }, [long, days, factor])

  const fmt = useCallback((v: number) => `${formatNumber(Math.round(v))} ${unit}`, [unit])
  const openDay = useCallback((date: ISODate) => navigate(`/dagbok/${date}`), [navigate])
  const highlight = period.dates.includes(today) ? today : undefined

  return (
    <Card
      title="Energi per dag"
      eyebrow={period.label}
      action={
        long ? undefined : (
          <Chip size="sm" selected={stacked} onClick={() => setStacked((s) => !s)} aria-label="Visa fördelning på makronäringsämnen">
            Makron
          </Chip>
        )
      }
    >
      {long ? (
        <LineChart
          series={lineSeries}
          goal={{ value: goalKcal * factor, label: `${goalWord} ${formatEnergy(goalKcal, unit)}` }}
          xDomain={[period.start, period.end]}
          includeZero={false}
          height={220}
          formatValue={fmt}
          weekNumbers
          title="Energi per dag de senaste 90 dagarna"
          onSelectDate={openDay}
          emptyText="Inget loggat under perioden"
        />
      ) : (
        <BarChart
          data={barData}
          stack={stacked ? (hasAlcohol ? STACK_WITH_ALCOHOL : STACK) : undefined}
          target={goalKcal * factor}
          targetLabel={goalWord}
          dayTargetLabel={weeklyPlan ? 'Dagsmål' : undefined}
          highlight={highlight}
          onSelect={openDay}
          height={period.kind === '30' ? 190 : 176}
          unit={unit}
          formatValue={fmt}
          title={`Energi per dag, ${period.phrase}`}
          emptyText="Inget loggat under perioden"
          legend={stacked}
        />
      )}
      <p className="mt-2 text-xs text-ink-3">Tryck på en dag för att öppna den i dagboken.</p>

      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4">
        <Stat
          size="sm"
          label="Snitt/dag"
          value={<EnergyValue kcal={summary.avgKcal} showUnit={false} />}
          unit={summary.avgKcal !== undefined ? unit : undefined}
          sublabel={`${weeklyPlan ? 'mål i snitt' : 'mål'} ${formatEnergy(goalKcal, unit)}`}
        />
        <Stat
          size="sm"
          label="Protein"
          tone="protein"
          value={formatNutrient('protein', avg.averages.protein, false)}
          unit={avg.averages.protein !== undefined ? 'g' : undefined}
          sublabel={`mål ${formatNumber(targets.proteinG)}\u00a0g`}
        />
        <Stat
          size="sm"
          label="Fibrer"
          tone="fiber"
          value={formatNutrient('fiber', avg.averages.fiber, false)}
          unit={avg.averages.fiber !== undefined ? 'g' : undefined}
          sublabel={`mål ${formatNumber(targets.fiberG)}\u00a0g`}
        />
      </div>
      {trend && <p className="mt-3 text-xs text-ink-3">{trend}</p>}
      <LowIntakeNote data={data} />
    </Card>
  )
}

/**
 * Varsam notis när de dagar som är markerade som klara i snitt ligger under energigolvet – aldrig
 * beröm för att äta lite. Samma regel och ton som veckokortet på Idag.
 */
function LowIntakeNote({ data }: { data: InsightsData }) {
  if (data.lowIntakeKcal === undefined) return null
  return (
    <CareNote className="mt-4">
      {data.mindful
        ? 'De dagar du markerat som klara har du ätit mindre än kroppen behöver för att orka. Ät gärna lite mer – regelbundna måltider ger energi.'
        : `De dagar du markerat som klara har du i snitt ätit mindre än ${formatEnergy(data.floorKcal, data.unit)} per dag – mindre än kroppen behöver för att orka. Ät gärna lite mer – regelbundna måltider ger energi.`}
    </CareNote>
  )
}

/** Medvetet läge: vilka dagar som är loggade och en kvalitativ etikett – inga energisiffror. */
function MindfulEnergyCard({ data }: { data: InsightsData }) {
  const { chartDays, summary, today, period } = data
  const ratio = summary.avgKcal !== undefined && summary.avgBudget ? summary.avgKcal / summary.avgBudget : undefined
  const label = mindfulAverageLabel(ratio)
  return (
    <Card title="Dina dagar" eyebrow={period.label}>
      <LoggedDays days={chartDays} today={today} />
      {summary.loggedDays > 0 && (
        <Callout emoji="🌿" className="mt-4">
          <p className="font-semibold text-ink">Snittdagen: {label.title}</p>
          <p>{label.hint}</p>
        </Callout>
      )}
      <LowIntakeNote data={data} />
    </Card>
  )
}

function LoggedDays({ days, today }: { days: readonly DayStat[]; today: ISODate }) {
  if (days.length <= 7) {
    return (
      <ul className="grid grid-cols-7 gap-1" aria-label="Loggade dagar">
        {days.map((d) => {
          const future = d.date > today
          return (
            <li key={d.date} className="flex flex-col items-center gap-1.5">
              <span
                role="img"
                aria-label={`${formatDayLong(d.date, today)}: ${d.logged ? 'loggad' : future ? 'kommande dag' : 'inget loggat'}`}
                className={`grid size-9 place-items-center rounded-full ${d.logged ? 'bg-gran-soft text-gran' : 'bg-surface-2 text-ink-3'} ${
                  future ? 'opacity-50' : ''
                } ${d.date === today ? 'ring-2 ring-gran/50 ring-offset-2 ring-offset-surface' : ''}`}
              >
                {d.logged && <Check className="size-4" strokeWidth={2.6} aria-hidden="true" />}
              </span>
              <span className="text-[11px] text-ink-3">{WEEKDAYS_SHORT[weekdayIndex(d.date)]}</span>
            </li>
          )
        })}
      </ul>
    )
  }
  return (
    <ul className="grid grid-cols-10 gap-1.5" aria-label="Loggade dagar">
      {days.map((d) => (
        <li
          key={d.date}
          role="img"
          aria-label={`${formatDayLong(d.date, today)}: ${d.logged ? 'loggad' : 'inget loggat'}`}
          className={`aspect-square rounded-[6px] ${d.logged ? 'bg-gran' : 'bg-surface-2'}`}
        />
      ))}
    </ul>
  )
}

// ---------------------------------------------------------------------------
// Energifördelning
// ---------------------------------------------------------------------------

function DistributionCard({ data }: { data: InsightsData }) {
  const { avg, mindful, summary } = data
  const verdicts = useMemo(() => macroVerdicts(avg.averages), [avg.averages])
  const alcoholPct = useMemo(() => energyDistribution(avg.averages).alcohol, [avg.averages])

  const segments = useMemo<DonutSegment[]>(() => {
    const out: DonutSegment[] = verdicts.map((v) => ({ key: v.key, label: v.label, value: v.pct, color: MACRO_COLOR[v.key] }))
    if (alcoholPct >= 0.5) out.push({ key: 'alcohol', label: 'Alkohol', value: alcoholPct, color: MACRO_COLOR.alcohol })
    return out
  }, [verdicts, alcoholPct])

  return (
    // @container: diagram och lista hamnar sida vid sida först när kortet självt är brett nog –
    // i tvåkolumnsläget (från 768 px) är kortet bara halvbrett.
    <Card title="Energifördelning" eyebrow="Jämfört med NNR 2023" className="@container">
      {verdicts.length === 0 ? (
        <p className="text-sm leading-relaxed text-ink-2">
          När du har loggat mat med protein, fett och kolhydrater ser du här hur energin fördelar sig.
        </p>
      ) : (
        <div className="flex flex-col items-center gap-5 @md:flex-row @md:items-start">
          <DonutChart
            segments={segments}
            size={140}
            thickness={15}
            legend="none"
            title="Energifördelning"
            summary={`Energifördelning: ${segments.map((s) => `${s.label.toLowerCase()} ${formatNumber(s.value)} procent`).join(', ')}.`}
            formatValue={(v) => `${formatNumber(v)}\u00a0E%`}
          >
            {mindful ? (
              <span className="text-3xl" aria-hidden="true">
                🍽️
              </span>
            ) : (
              <span className="flex flex-col items-center">
                <span className="eyebrow">Snitt</span>
                <span className="display-num text-xl leading-tight">{formatEnergy(summary.avgKcal, data.unit, false)}</span>
                <span className="text-[11px] text-ink-3">{data.unit}/dag</span>
              </span>
            )}
          </DonutChart>
          <ul className="w-full min-w-0 space-y-3 @md:flex-1">
            {verdicts.map((v) => (
              <li key={v.key}>
                <div className="flex items-center gap-2">
                  <Dot color={MACRO_COLOR[v.key]} />
                  <span className="text-sm font-semibold text-ink">{v.label}</span>
                  {!mindful && <span className="text-sm text-ink-2 tabular-nums">{percentText(v.pct)}</span>}
                  <Badge className="ml-auto" tone={v.status === 'inom' ? 'good' : 'hjortron'} dot>
                    {RANGE_STATUS_LABELS[v.status]}
                  </Badge>
                </div>
                <p className="mt-1 pl-[1.125rem] text-xs leading-relaxed text-ink-3">
                  {!mindful && <span className="text-ink-2">NNR {v.min}–{v.max}{'\u00a0'}E%. </span>}
                  {v.text}
                </p>
              </li>
            ))}
            {alcoholPct >= 0.5 && !mindful && (
              <li className="flex items-center gap-2 text-xs text-ink-3">
                <Dot color={MACRO_COLOR.alcohol} />
                Alkohol {percentText(alcoholPct)} av energin
              </li>
            )}
          </ul>
        </div>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Näring i korthet
// ---------------------------------------------------------------------------

function NutrientList({ items, tone, mindful }: { items: readonly RankedNutrient[]; tone: 'good' | 'grow'; mindful: boolean }) {
  const color = tone === 'good' ? 'var(--lg-mossa)' : 'var(--lg-hjortron)'
  return (
    <ul className="space-y-2.5">
      {items.map((n) => (
        <li key={n.key}>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate font-medium text-ink">{NUTRIENTS[n.key].name}</span>
            {!mindful && <span className="shrink-0 text-xs text-ink-3 tabular-nums">{formatNumber(n.percent)}{'\u00a0'}%</span>}
          </div>
          <ShareBar value={n.percent / 100} color={color} className="mt-1" />
        </li>
      ))}
    </ul>
  )
}

function NutrientHighlightsCard({ data, onTab }: { data: InsightsData; onTab: (tab: InsightsTab) => void }) {
  const { avg, refs, mindful, targets } = data
  // Protein mäts mot ditt proteinmål, samma som i energikortet ovan.
  const rankRefs = useMemo(() => withPersonalProtein(refs, targets.proteinG), [refs, targets.proteinG])
  const { strongest, weakest } = useMemo(() => rankNutrients(avg.averages, avg.coverage, rankRefs), [avg.averages, avg.coverage, rankRefs])
  return (
    <Card
      title="Näring i korthet"
      eyebrow="Mot rekommendationen"
      action={<CardAction onClick={() => onTab('naring')}>All näring</CardAction>}
      className="@container"
    >
      {strongest.length === 0 && weakest.length === 0 ? (
        <p className="text-sm leading-relaxed text-ink-2">
          Det finns inte tillräckligt med kända näringsvärden för att jämföra ännu. Livsmedel från Lagoms databas har mest
          kompletta värden.
        </p>
      ) : (
        <div className="grid gap-5 @md:grid-cols-2">
          <section aria-label="Starkast">
            <h3 className="eyebrow mb-2">Starkast 💪</h3>
            {strongest.length ? (
              <NutrientList items={strongest} tone="good" mindful={mindful} />
            ) : (
              <p className="text-sm text-ink-3">Inget ämne når hela vägen än – det kommer!</p>
            )}
          </section>
          <section aria-label="Mest att vinna på">
            <h3 className="eyebrow mb-2">Mest att vinna på 🌱</h3>
            {weakest.length ? (
              <NutrientList items={weakest} tone="grow" mindful={mindful} />
            ) : (
              <p className="text-sm text-ink-3">Alla ämnen med kända värden når rekommendationen. Snyggt!</p>
            )}
          </section>
        </div>
      )}
      {!mindful && (
        <InfoNote className="mt-4">Procent av rekommenderat intag (NNR 2023) i snitt per loggad dag. Protein jämförs med ditt proteinmål.</InfoNote>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Veckodagar
// ---------------------------------------------------------------------------

function WeekdayCard({ data }: { data: InsightsData }) {
  const { period, countedEnd, entriesByDate, exerciseByDate, targetKcalFor, addBackPct, days, unit } = data
  const weekly = period.kind === 'vecka'
  // Veckovyn tittar på de senaste åtta veckorna fram till sista dagen som räknas (idag först när den är klar).
  const sourceDays = useMemo(() => {
    if (!weekly) return days
    return buildDayStats(lastNDays(56, countedEnd), entriesByDate, exerciseByDate, targetKcalFor, addBackPct)
  }, [weekly, days, countedEnd, entriesByDate, exerciseByDate, targetKcalFor, addBackPct])
  const pattern = useMemo(() => weekdayPattern(sourceDays), [sourceDays])
  const insight = useMemo(() => weekdayInsight(pattern), [pattern])
  const samples = pattern.reduce((s, p) => s + p.count, 0)
  const columns = useMemo(() => weekdayColumns(pattern, (v) => formatEnergy(v, unit, false), true), [pattern, unit])

  return (
    <Card title="Veckodagar" eyebrow={weekly ? 'Senaste 8 veckorna' : period.label}>
      {samples === 0 ? (
        <p className="text-sm text-ink-2">Här syns veckans rytm när du har loggat några dagar.</p>
      ) : (
        <>
          <Columns data={columns} label={`Snittenergi per veckodag i ${unit}`} height={132} />
          <div className="mt-3">
            {insight ? (
              <Callout emoji={insight.emoji}>{insight.text}</Callout>
            ) : (
              <p className="text-xs leading-relaxed text-ink-3">
                {samples < MIN_PATTERN_DAYS
                  ? `Mönstret blir tydligare efter ett par veckors loggning (${samples} av minst ${MIN_PATTERN_DAYS} dagar).`
                  : 'Logga gärna fler olika veckodagar så blir mönstret tydligare.'}
              </p>
            )}
          </div>
        </>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Vikt
// ---------------------------------------------------------------------------

function WeightTrendCard({ data }: { data: InsightsData }) {
  const weights = useBodyStore((s) => s.weights)
  const goal = useProfileStore((s) => s.profile?.goal)
  const lifeStage = useProfileStore((s) => s.profile?.lifeStage)
  const birthYear = useProfileStore((s) => s.profile?.birthYear)
  const { period, today } = data
  const end = period.end < today ? period.end : today
  const start = period.kind === 'vecka' ? addDays(end, -29) : period.start
  const w = useMemo(() => weightWindow(weights, start, end), [weights, start, end])
  const values = useMemo(() => w.points.map((p) => p.value), [w.points])

  if (w.points.length < 2 || w.measured < 2) {
    return (
      <Card title="Vikttrend" eyebrow={period.kind === 'vecka' ? 'Senaste 30 dagarna' : period.label} action={<CardLink to="/vikt">Vikt</CardLink>}>
        <p className="text-sm leading-relaxed text-ink-2">
          Väg dig gärna några gånger så visar vi en utjämnad trend – dagsvariationer i vätska spelar mindre roll då.
        </p>
      </Card>
    )
  }

  const change = w.change ?? 0
  const direction: StatTrend['direction'] = Math.abs(change) < 0.05 ? 'flat' : change > 0 ? 'up' : 'down'
  // Samma ton som under Vikt: viktnedgång tonas aldrig grönt.
  const good = goodDirection(goal, lifeStage, birthYear !== undefined ? youngestAge(birthYear, today) : undefined)
  const sign = change > 0 ? '+' : change < 0 ? '−' : ''
  return (
    <Card title="Vikttrend" eyebrow={period.kind === 'vecka' ? 'Senaste 30 dagarna' : period.label} action={<CardLink to="/vikt">Vikt</CardLink>}>
      <div className="flex items-end justify-between gap-4">
        <Stat
          label="Trendvikt"
          value={formatNumber(w.latest, 1)}
          unit="kg"
          trend={{ direction, label: direction === 'flat' ? 'stabil' : `${sign}${formatKg(Math.abs(change))}`, good }}
        />
        <Sparkline values={values} width={132} height={44} ariaLabel={`Vikttrend från ${formatKg(values[0])} till ${formatKg(w.latest)}`} />
      </div>
      <p className="mt-3 text-xs leading-relaxed text-ink-3">
        Trenden jämnar ut dagliga svängningar. {w.measured} {w.measured === 1 ? 'vägning' : 'vägningar'} under perioden.
      </p>
    </Card>
  )
}
