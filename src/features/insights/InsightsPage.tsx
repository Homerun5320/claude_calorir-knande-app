/**
 * Insikter (/insikter?flik=oversikt|naring|kostrad|tallrik|klimat|monster&period=vecka|30|90&vecka=-1)
 *
 * Analyser som bygger på dagarna du faktiskt har loggat: energi mot budget, näring mot NNR 2023,
 * Livsmedelsverkets kostråd, Tallriksmodellen, klimat och mönster över tid. Flik och period sparas
 * i adressen så att de finns kvar när man går till en dag i dagboken och tillbaka.
 *
 * Medvetet läge döljer energisiffror och visar kvalitativa beskrivningar i stället.
 */
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  LayoutDashboard,
  Leaf,
  Plus,
  Printer,
  Salad,
  Share2,
  UtensilsCrossed,
} from 'lucide-react'
import {
  Button,
  EmptyState,
  IconButton,
  PageHeader,
  SegmentedControl,
  Skeleton,
  Tabs,
  tabPanelProps,
  toast,
  type TabItem,
} from '../../components/ui'
import { isNativeApp } from '../../config/platform'
import { useToday } from '../../hooks/useToday'
import { evaluateKostrad, kostradScore } from '../../lib/kostrad'
import { NUTRIENTS } from '../../lib/nutrients'
import { useDiaryStore } from '../../stores/diaryStore'
import { useHydrated } from '../../stores/hydration'
import { useProfileStore } from '../../stores/profileStore'
import type { DiaryEntry, ISODate } from '../../types'
import { climateDays, macroVerdicts, rankNutrients, summarizeClimate } from './aggregate'
import { ClimateTab } from './ClimateTab'
import { KostradTab } from './KostradTab'
import { INSIGHT_TABS, readParams, TAB_LABELS, writeParams, type InsightsParams, type InsightsTab } from './nav'
import { NutritionTab } from './NutritionTab'
import { OverviewTab } from './OverviewTab'
import { PatternsTab } from './PatternsTab'
import { makePeriod, MAX_WEEKS_BACK, PERIOD_LABELS, type Period, type PeriodKind } from './period'
import { PlateTab } from './PlateTab'
import { buildReport, shareText } from './report'
import { PeriodEmpty } from './ui'
import { useInsights, type InsightsData } from './useInsights'

const TABS_ID = 'insikter'

const TAB_ICONS: Record<InsightsTab, TabItem<InsightsTab>['icon']> = {
  oversikt: LayoutDashboard,
  naring: Salad,
  kostrad: ClipboardCheck,
  tallrik: UtensilsCrossed,
  klimat: Leaf,
  monster: CalendarDays,
}

const PERIOD_OPTIONS = (['vecka', '30', '90'] as const).map((value) => ({ value, label: PERIOD_LABELS[value] }))

function hasAnyEntries(entries: Record<ISODate, DiaryEntry[]>): boolean {
  for (const key in entries) if ((entries[key]?.length ?? 0) > 0) return true
  return false
}

export default function InsightsPage() {
  const hydrated = useHydrated()
  if (!hydrated) return <InsightsSkeleton />
  return <InsightsContent />
}

function InsightsSkeleton() {
  return (
    <div className="px-4 pt-safe pb-8" aria-busy="true" aria-label="Laddar insikter">
      <div className="pt-16 pb-4">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-3 h-9 w-40" />
        <Skeleton className="mt-5 h-11 w-full" />
      </div>
      <Skeleton className="h-10 w-full rounded-2xl" />
      <div className="mt-4 space-y-4">
        <Skeleton className="h-28 w-full rounded-card" />
        <Skeleton className="h-72 w-full rounded-card" />
        <Skeleton className="h-56 w-full rounded-card" />
      </div>
    </div>
  )
}

function InsightsContent() {
  const today = useToday()
  const [params, setParams] = useSearchParams()
  const showClimate = useProfileStore((s) => s.settings.showClimate)
  const hasAny = useDiaryStore((s) => hasAnyEntries(s.entries))
  const { tab, kind, offset } = readParams(params, showClimate)
  const period = useMemo(() => makePeriod(kind, offset, today), [kind, offset, today])
  const data = useInsights(period, today)
  const [sharing, setSharing] = useState(false)
  const reduce = useReducedMotion()

  const update = (next: Partial<InsightsParams>) => setParams(writeParams(params, next), { replace: true })

  const tabs = useMemo<ReadonlyArray<TabItem<InsightsTab>>>(
    () =>
      INSIGHT_TABS.filter((t) => t !== 'klimat' || showClimate).map((t) => ({
        value: t,
        label: TAB_LABELS[t],
        icon: TAB_ICONS[t],
      })),
    [showClimate],
  )

  const onShare = async () => {
    if (sharing) return
    setSharing(true)
    try {
      const report = buildReportFor(data, showClimate)
      const outcome = await shareText(report.title, report.text)
      if (outcome === 'copied') toast('Rapporten är kopierad – klistra in den där du vill', { tone: 'success' })
      else if (outcome === 'failed') toast('Det gick inte att dela just nu. Försök igen om en stund.', { tone: 'error' })
    } finally {
      setSharing(false)
    }
  }

  const shareLabel = kind === 'vecka' ? 'Dela veckorapport' : 'Dela rapport'
  const empty = data.summary.loggedDays === 0 && tab !== 'monster'

  return (
    <div className="px-4 pb-8">
      <PageHeader
        eyebrow="Trender och mönster"
        title="Insikter"
        subtitle="Bygger bara på dagar du har loggat – utan pekpinnar."
        actions={
          hasAny ? <IconButton icon={Share2} aria-label={shareLabel} variant="ghost" loading={sharing} onClick={onShare} /> : undefined
        }
      >
        <Tabs<InsightsTab> id={TABS_ID} value={tab} onChange={(t) => update({ tab: t })} tabs={tabs} aria-label="Insikter" />
      </PageHeader>

      {!hasAny ? (
        <div className="card mt-2 p-2">
          <EmptyState
            illustration="chart"
            title="Dina insikter växer fram här"
            text="Logga några dagar så visar vi mönster, näring, kostråd, tallrik och klimat – alltid baserat på dagarna du faktiskt loggat."
            action={
              <Button iconLeft={Plus} to="/lagg-till">
                Lägg till mat
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <PeriodPicker
            kind={kind}
            period={period}
            loggedDays={data.summary.loggedDays}
            onKind={(k) => update({ kind: k, offset: 0 })}
            onOffset={(o) => update({ offset: o })}
          />
          <div {...tabPanelProps(TABS_ID, tab)} className="mt-4 rounded-card">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`${tab}-${period.start}-${period.kind}`}
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? undefined : { opacity: 0, y: -4 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              >
                {empty ? (
                  <PeriodEmpty
                    period={period}
                    onPrevious={kind === 'vecka' && offset === 0 ? () => update({ offset: -1 }) : undefined}
                    onLonger={kind !== '90' ? () => update({ kind: '90', offset: 0 }) : undefined}
                  />
                ) : (
                  <TabContent tab={tab} data={data} onTab={(t) => update({ tab: t })} onShare={onShare} sharing={sharing} />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
          {/* Utskrift finns inte i den inbyggda appen – där delas rapporten som text i stället. */}
          {!isNativeApp() && (
            <div className="mt-4 flex justify-center">
              <Button variant="ghost" size="sm" iconLeft={Printer} to="/rapport">
                Rapport att skriva ut
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function TabContent({
  tab,
  data,
  onTab,
  onShare,
  sharing,
}: {
  tab: InsightsTab
  data: InsightsData
  onTab: (t: InsightsTab) => void
  onShare: () => void
  sharing: boolean
}) {
  switch (tab) {
    case 'naring':
      return <NutritionTab data={data} />
    case 'kostrad':
      return <KostradTab data={data} />
    case 'tallrik':
      return <PlateTab data={data} />
    case 'klimat':
      return <ClimateTab data={data} />
    case 'monster':
      return <PatternsTab data={data} />
    default:
      return <OverviewTab data={data} onTab={onTab} onShare={onShare} sharing={sharing} />
  }
}

// ---------------------------------------------------------------------------
// Periodväljare
// ---------------------------------------------------------------------------

function PeriodPicker({
  kind,
  period,
  loggedDays,
  onKind,
  onOffset,
}: {
  kind: PeriodKind
  period: Period
  loggedDays: number
  onKind: (k: PeriodKind) => void
  onOffset: (o: number) => void
}) {
  const weekly = period.kind === 'vecka'
  const sub = weekly && period.label !== period.title ? `${period.title} · ${period.range}` : period.range
  const based =
    loggedDays === 0 ? 'Inga loggade dagar' : `Baserat på ${loggedDays} ${loggedDays === 1 ? 'loggad dag' : 'loggade dagar'}`
  return (
    <section aria-label="Period" className="mt-1">
      <SegmentedControl<PeriodKind> value={kind} onChange={onKind} options={PERIOD_OPTIONS} fullWidth aria-label="Välj period" />
      <div className="mt-3 flex min-h-11 items-center justify-between gap-2">
        {weekly ? (
          <IconButton
            icon={ChevronLeft}
            aria-label="Föregående vecka"
            variant="ghost"
            disabled={period.offset <= -MAX_WEEKS_BACK}
            onClick={() => onOffset(period.offset - 1)}
          />
        ) : (
          <span className="size-11" aria-hidden="true" />
        )}
        <div className="min-w-0 text-center" aria-live="polite">
          <p className="font-display text-lg leading-tight font-semibold tracking-tight">{period.label}</p>
          <p className="mt-0.5 text-xs text-ink-2">{sub}</p>
          <p className="mt-0.5 text-xs text-ink-3">{based}</p>
        </div>
        {weekly ? (
          <IconButton
            icon={ChevronRight}
            aria-label="Nästa vecka"
            variant="ghost"
            disabled={period.offset >= 0}
            onClick={() => onOffset(period.offset + 1)}
          />
        ) : (
          <span className="size-11" aria-hidden="true" />
        )}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Rapport
// ---------------------------------------------------------------------------

function buildReportFor(data: InsightsData, showClimate: boolean) {
  const { period, entriesByDate, exerciseByDate, refProfile, summary, avg, targets, goalKcal, unit, mindful, refs, weeklyPlan } = data
  const results = evaluateKostrad({ entriesByDate, exerciseByDate, dates: period.elapsed, sex: refProfile.sex })
  const climate = showClimate ? summarizeClimate(climateDays(period.elapsed, entriesByDate)).avgKg : undefined
  const best = rankNutrients(avg.averages, avg.coverage, refs, 1).strongest[0]
  return buildReport({
    period,
    summary,
    averages: avg.averages,
    targets: { kcal: goalKcal, proteinG: targets.proteinG, fiberG: targets.fiberG },
    weeklyBudget: weeklyPlan !== null,
    verdicts: macroVerdicts(avg.averages),
    unit,
    mindful,
    kostradScore: results.length > 0 ? kostradScore(results) : undefined,
    climateKgPerDay: climate,
    highlight: best ? `💪 Starkast: ${NUTRIENTS[best.key].name.toLowerCase()}` : undefined,
  })
}
