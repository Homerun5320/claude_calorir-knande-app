/**
 * Utskrivbar rapport (/rapport) – "Skriv ut eller spara som PDF".
 *
 * En sammanställning av de senaste 7, 14 eller 30 dagarna att ta med till t.ex. en dietist:
 * snitt per dag för energi och näring (mot NNR 2023), vikttrend, Livsmedelsverkets kostråd och
 * tallriksbalansen. Namn och ålder tas inte med. I medvetet läge visas inga energisiffror – bara
 * tallriken och kostråden.
 *
 * Utskriften görs med webbläsarens egen dialog (`window.print()`), där man också kan spara som PDF.
 * Knappar och val döljs vid utskrift (`print:hidden`) och korten delas inte mellan sidor
 * (`break-inside-avoid`). Ljusa färger och dold navigering vid utskrift sköts i index.css.
 */
import { useMemo, useState, type ReactNode } from 'react'
import { Printer } from 'lucide-react'
import { LineChart } from '../../components/charts'
import { NutrientTable } from '../../components/domain'
import { PlateModel } from '../../components/signature'
import { Badge, Button, PageHeader, SegmentedControl, Skeleton } from '../../components/ui'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useToday } from '../../hooks/useToday'
import { formatEnergy, formatKg, formatNumber } from '../../lib/format'
import { KOSTRAD_MIN_WEEKLY_DAYS, isAssessable, isUsable, kostradScore, tooFewDays } from '../../lib/kostrad'
import { PLATE_PART_LABELS, PLATE_VARIANT_LABELS } from '../../lib/plate'
import { useBodyStore } from '../../stores/bodyStore'
import { useHydrated } from '../../stores/hydration'
import { KOSTRAD_STATUS, kostradProgressText, kostradScoreLabel } from './advice'
import { coverageSummary, coverageText, mainMealPlate, reliableReferences, weightWindow } from './aggregate'
import { kostradMetText, usePeriodKostrad } from './KostradTab'
import { makeRollingPeriod, REPORT_DAYS, type ReportDays } from './period'
import { useInsights, type InsightsData } from './useInsights'

const DAY_OPTIONS = REPORT_DAYS.map((d) => ({ value: d, label: `${d} dagar` }))

/** Fast text längst ned i rapporten. */
export const REPORT_FOOTER =
  'Lagom är en allmän kost- och livsstilsdagbok och inte en medicinteknisk produkt. Värden från Livsmedelsverkets livsmedelsdatabas (CC BY 4.0) och Open Food Facts.'

export default function ReportPrintPage() {
  const hydrated = useHydrated()
  useDocumentTitle('Rapport')
  if (!hydrated) {
    return (
      <div className="px-4 pt-safe pb-8" role="status" aria-busy="true">
        <span className="sr-only">Laddar rapporten …</span>
        <Skeleton className="mt-16 h-9 w-56" />
        <Skeleton className="mt-6 h-64 w-full rounded-card" />
      </div>
    )
  }
  return <ReportContent />
}

function ReportContent() {
  const today = useToday()
  const [days, setDays] = useState<ReportDays>(7)
  const basePeriod = useMemo(() => makeRollingPeriod(days, today), [days, today])
  const data = useInsights(basePeriod, today)
  const { period, summary, mindful } = data

  return (
    <div className="mx-auto max-w-3xl px-4 pb-10 print:max-w-none print:px-0 print:pb-0">
      {/* PageHeaders tillbaka-rad döljs själv vid utskrift – rubriken finns kvar. */}
      <PageHeader back backLabel="Till insikter" eyebrow={period.label} title={`Lagom – rapport ${period.range}`} />

      <div className="mb-5 flex flex-col gap-3 print:hidden">
        <SegmentedControl<ReportDays> value={days} onChange={setDays} options={DAY_OPTIONS} fullWidth aria-label="Välj period för rapporten" />
        <Button iconLeft={Printer} size="lg" fullWidth onClick={() => window.print()}>
          Skriv ut eller spara som PDF
        </Button>
        <p className="text-xs leading-relaxed text-ink-3">
          I utskriftsdialogen kan du välja ”Spara som PDF”. Rapporten innehåller inte ditt namn eller din ålder.
        </p>
      </div>

      <p className="mb-4 text-sm text-ink-2">
        {summary.loggedDays === 0
          ? 'Inget loggat under perioden.'
          : `Bygger på ${summary.loggedDays} av ${summary.elapsedDays} ${summary.elapsedDays === 1 ? 'dag' : 'dagar'} med registreringar.`}
        {period.todayExcluded && ' Idag räknas med när dagen är markerad som klar.'}
      </p>

      {summary.loggedDays > 0 && (
        <div className="flex flex-col gap-4">
          {!mindful && <EnergySection data={data} />}
          {!mindful && <WeightSection data={data} />}
          <KostradSection data={data} />
          <PlateSection data={data} />
        </div>
      )}

      <p className="mt-6 border-t border-line pt-3 text-[0.6875rem] leading-relaxed text-ink-3">{REPORT_FOOTER}</p>
    </div>
  )
}

/** Ett avsnitt som inte delas mellan två sidor vid utskrift. */
function Section({ title, eyebrow, children }: { title: string; eyebrow?: string; children: ReactNode }) {
  return (
    <section className="card break-inside-avoid p-4 sm:p-5 print:shadow-none print:ring-1 print:ring-line">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h2 className="mt-0.5 font-display text-[1.25rem] leading-snug font-semibold tracking-tight text-ink">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Energi och näring
// ---------------------------------------------------------------------------

function EnergySection({ data }: { data: InsightsData }) {
  const { avg, refs, summary, goalKcal, unit, weeklyPlan } = data
  const tableRefs = useMemo(() => reliableReferences(avg.averages, avg.coverage, refs), [avg.averages, avg.coverage, refs])
  const coverage = useMemo(() => coverageSummary(avg.coverage), [avg.coverage])
  return (
    <Section title="Energi och näring" eyebrow="Snitt per loggad dag">
      <dl className="mb-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-2xl bg-surface-2 px-3.5 py-2.5">
          <dt className="text-xs text-ink-3">Energi per dag</dt>
          <dd className="mt-0.5 font-display text-lg font-semibold text-ink tabular-nums">{formatEnergy(summary.avgKcal, unit)}</dd>
        </div>
        <div className="rounded-2xl bg-surface-2 px-3.5 py-2.5">
          <dt className="text-xs text-ink-3">{weeklyPlan ? 'Dagsmål i snitt (veckobudget)' : 'Dagsmål'}</dt>
          <dd className="mt-0.5 font-display text-lg font-semibold text-ink tabular-nums">{formatEnergy(goalKcal, unit)}</dd>
        </div>
      </dl>
      <NutrientTable
        nutrients={avg.averages}
        references={tableRefs}
        coverage={avg.coverage}
        caption="Snitt per dag"
        collapsible={false}
        defaultExpanded={['energi', 'makro', 'kolhydrat', 'fett', 'ovrigt', 'vitamin', 'mineral']}
        showCompleteness={false}
      />
      <p className="mt-3 text-xs leading-relaxed text-ink-3">
        {coverageText(coverage)} Jämfört med Nordiska näringsrekommendationer 2023 (NNR 2023). Okända värden visas som ”–”.
      </p>
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Vikt
// ---------------------------------------------------------------------------

function WeightSection({ data }: { data: InsightsData }) {
  const weights = useBodyStore((s) => s.weights)
  const { period, today } = data
  const end = period.end < today ? period.end : today
  const w = useMemo(() => weightWindow(weights, period.start, end), [weights, period.start, end])
  const series = useMemo(
    () => [{ id: 'vikt', label: 'Trendvikt', points: w.points, display: 'line+dots' as const, color: 'var(--lg-blabar)' }],
    [w.points],
  )

  if (w.points.length < 2 || w.measured < 2) {
    return (
      <Section title="Vikttrend" eyebrow={period.label}>
        <p className="text-sm text-ink-2">För få vägningar under perioden för att visa en trend.</p>
      </Section>
    )
  }
  const change = w.change ?? 0
  const changeText =
    Math.abs(change) < 0.05 ? 'stabil' : `${change > 0 ? '+' : '−'}${formatKg(Math.abs(change))} under perioden`
  return (
    <Section title="Vikttrend" eyebrow={period.label}>
      <p className="mb-2 text-sm text-ink-2">
        Trendvikt {formatKg(w.latest)} ({changeText}). {w.measured} {w.measured === 1 ? 'vägning' : 'vägningar'}.
      </p>
      <LineChart
        series={series}
        xDomain={[period.start, end]}
        height={180}
        unit="kg"
        formatValue={(v) => formatKg(v)}
        legend={false}
        title="Vikttrend under perioden"
      />
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Kostråd
// ---------------------------------------------------------------------------

function KostradSection({ data }: { data: InsightsData }) {
  const results = usePeriodKostrad(data)
  const { mindful } = data
  if (results.length === 0) return null
  const usable = results.filter(isAssessable)
  const met = usable.filter((r) => r.status === 'bra').length
  const score = kostradScore(results)
  const label = kostradScoreLabel(score)
  return (
    <Section title="Livsmedelsverkets kostråd" eyebrow={mindful ? label.title : `Kostrådspoäng ${formatNumber(score)} av 100 · ${label.title.toLowerCase()}`}>
      <p className="mb-3 text-sm text-ink-2">{kostradMetText(met, usable.length, results.length - usable.length)}.</p>
      <ul className="divide-y divide-line" aria-label="Kostråden">
        {results.map((r) => {
          const fewDays = tooFewDays(r)
          const uncertain = !isUsable(r) || fewDays
          const status = KOSTRAD_STATUS[r.status]
          return (
            <li key={r.id} className="flex items-start justify-between gap-3 py-2 break-inside-avoid">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">
                  <span aria-hidden="true">{r.emoji} </span>
                  {r.title}
                </p>
                {!mindful && !fewDays && <p className="text-xs text-ink-3 tabular-nums">{kostradProgressText(r)}</p>}
              </div>
              <Badge tone={uncertain ? 'neutral' : status.tone} dot className="mt-0.5 shrink-0">
                {fewDays ? 'För få dagar för att bedöma' : uncertain ? 'Osäkert' : status.label}
              </Badge>
            </li>
          )
        })}
      </ul>
      <p className="mt-3 text-xs leading-relaxed text-ink-3">
        Källa: Livsmedelsverkets kostråd för vuxna (2025) och Folkhälsomyndighetens riktlinjer för fysisk aktivitet. Veckoråd räknas om till
        antalet loggade dagar och bedöms först när minst {KOSTRAD_MIN_WEEKLY_DAYS} dagar är loggade.
      </p>
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Tallriken
// ---------------------------------------------------------------------------

function PlateSection({ data }: { data: InsightsData }) {
  const { entriesByDate, period, plateVariant } = data
  const plate = useMemo(() => mainMealPlate(entriesByDate, period.elapsed, plateVariant), [entriesByDate, period.elapsed, plateVariant])
  const variant = PLATE_VARIANT_LABELS[plateVariant]
  // Tallriken visas likadant i medvetet läge – den säger ingenting om energi.
  return (
    <Section title="Tallriksbalansen" eyebrow="Lunch och middag">
      {plate.meals === 0 ? (
        <p className="text-sm text-ink-2">Inga luncher eller middagar med livsmedel eller recept under perioden.</p>
      ) : (
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <PlateModel fractions={plate.plate.fractions} ideal={plate.plate.ideal} size={220} />
          <div className="min-w-0 flex-1 text-sm text-ink-2">
            <p>{plate.plate.advice}</p>
            <ul className="mt-2 space-y-1 text-xs text-ink-3">
              {(['veg', 'carb', 'protein'] as const).map((part) => (
                <li key={part}>
                  {PLATE_PART_LABELS[part].label}: {formatNumber(plate.plate.fractions[part] * 100)}{' '}% (mål{' '}
                  {formatNumber(plate.plate.ideal[part] * 100)}{' '}%)
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-ink-3">
              {`${plate.lagomMeals} av ${plate.meals} ${plate.meals === 1 ? 'huvudmåltid var lagom fördelad' : 'huvudmåltider var lagom fördelade'}.`} {variant.label}: {variant.description.charAt(0).toLowerCase() + variant.description.slice(1)}
            </p>
          </div>
        </div>
      )}
    </Section>
  )
}
