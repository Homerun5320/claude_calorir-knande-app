/**
 * Klimat – matens ungefärliga klimatavtryck per dag (kg CO2e) mot en klimatsmart nivå,
 * snitt, betyg, bilkilometer, största källorna och konkreta byten. Neutral ton – aldrig skuld.
 */
import { useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Car, Repeat } from 'lucide-react'
import { BarChart, LineChart, type BarDatum } from '../../components/charts'
import { CategoryIcon } from '../../components/domain'
import { Badge, Card, Stat } from '../../components/ui'
import { CAR_KG_CO2E_PER_KM, CLIMATE_REFERENCE, climateRating, co2eEquivalents, swapSuggestions } from '../../lib/climate'
import { formatNumber } from '../../lib/format'
import { percentText } from './fmt'
import type { ISODate } from '../../types'
import { climateDays, summarizeClimate, topEmitters } from './aggregate'
import { Callout, InfoNote, ShareBar, SourceNote } from './ui'
import type { InsightsData } from './useInsights'

const kg = (v: number | undefined, d = 1) => (v === undefined ? '–' : `${formatNumber(v, d)} kg`)

/** Periodens klimatsammanfattning (delas med rapporten). */
export function usePeriodClimate(data: InsightsData) {
  const { period, entriesByDate } = data
  const chartDays = useMemo(() => climateDays(period.dates, entriesByDate), [period.dates, entriesByDate])
  const summary = useMemo(() => summarizeClimate(chartDays.filter((d) => d.date <= data.today)), [chartDays, data.today])
  return { chartDays, summary }
}

export function ClimateTab({ data }: { data: InsightsData }) {
  const navigate = useNavigate()
  const { period, entries, mindful, today } = data
  const { chartDays, summary } = usePeriodClimate(data)
  const top = useMemo(() => topEmitters(entries, 5), [entries])
  const swaps = useMemo(() => swapSuggestions(entries, 3), [entries])
  const rating = climateRating(summary.avgKg ?? 0)
  const eq = co2eEquivalents(summary.totalKg)
  const long = period.kind === '90'
  const openDay = useCallback((date: ISODate) => navigate(`/dagbok/${date}`), [navigate])

  const barData = useMemo<BarDatum[]>(() => chartDays.map((d) => ({ date: d.date, value: d.kg })), [chartDays])
  const lineSeries = useMemo(
    () => [
      {
        id: 'klimat',
        label: 'kg CO₂e per dag',
        points: chartDays.filter((d) => d.logged && d.kg !== undefined).map((d) => ({ date: d.date, value: d.kg ?? 0 })),
        display: 'line+dots' as const,
        color: 'var(--lg-mossa)',
      },
    ],
    [chartDays],
  )
  const fmt = useCallback((v: number) => kg(v), [])

  if (summary.loggedDays === 0) {
    return (
      <Card title="Klimat" eyebrow={period.label}>
        <p className="text-sm leading-relaxed text-ink-2">
          När du har loggat mat under perioden ser du här ett ungefärligt klimatavtryck – och vilka små byten som gör störst skillnad.
        </p>
      </Card>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Card className="md:col-span-2" title="Matens klimatavtryck" eyebrow={period.label}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          {mindful ? (
            <p className="font-display text-2xl font-semibold tracking-tight">{rating.label}</p>
          ) : (
            <Stat size="lg" label="Snitt per loggad dag" value={formatNumber(summary.avgKg, 1)} unit="kg CO₂e" />
          )}
          <Badge tone={rating.tone} size="md" dot>
            {rating.label}
          </Badge>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">{rating.description}</p>

        {!mindful && (
          <>
            <div className="mt-4">
              {long ? (
                <LineChart
                  series={lineSeries}
                  goal={{ value: CLIMATE_REFERENCE.klimatsmartKgPerDay, label: 'Klimatsmart' }}
                  xDomain={[period.start, period.end]}
                  includeZero
                  height={200}
                  formatValue={fmt}
                  weekNumbers
                  legend={false}
                  title="Klimatavtryck per dag de senaste 90 dagarna"
                  onSelectDate={openDay}
                />
              ) : (
                <BarChart
                  data={barData}
                  target={CLIMATE_REFERENCE.klimatsmartKgPerDay}
                  targetLabel="Klimatsmart nivå"
                  highlight={period.dates.includes(today) ? today : undefined}
                  onSelect={openDay}
                  color="var(--lg-mossa)"
                  height={170}
                  formatValue={fmt}
                  title={`Klimatavtryck per dag, ${period.phrase}`}
                  emptyText="Inget loggat under perioden"
                />
              )}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm">
              <div>
                <p className="eyebrow">Klimatsmart nivå</p>
                <p className="mt-1 text-ink-2">{kg(CLIMATE_REFERENCE.klimatsmartKgPerDay)} per dag</p>
              </div>
              <div>
                <p className="eyebrow">Genomsnittlig svensk</p>
                <p className="mt-1 text-ink-2">{kg(CLIMATE_REFERENCE.averageSwedeKgPerDay)} per dag</p>
              </div>
            </div>
            <Callout className="mt-4">
              <p className="flex items-center gap-2">
                <Car className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
                <span>
                  Hela perioden: {kg(summary.totalKg)} CO₂e – ungefär som att köra{' '}
                  <strong className="font-semibold text-ink">{formatNumber(eq.carKm)} km</strong> med en genomsnittlig bil.
                </span>
              </p>
            </Callout>
          </>
        )}
      </Card>

      <Card title="Största källorna" eyebrow="Under perioden">
        {top.length === 0 ? (
          <p className="text-sm text-ink-2">Inga livsmedel med vikt att räkna på ännu.</p>
        ) : (
          <ol className="space-y-3" aria-label="Livsmedel med störst klimatavtryck">
            {top.map((t, i) => (
              <li key={t.id} className="flex items-center gap-3">
                <CategoryIcon category={t.category} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate font-medium text-ink">
                      <span className="sr-only">{i + 1}. </span>
                      {t.name}
                    </span>
                    <span className="shrink-0 text-xs text-ink-3 tabular-nums">
                      {mindful ? percentText(t.share * 100) : `${kg(t.kg)} · ${percentText(t.share * 100)}`}
                    </span>
                  </div>
                  <ShareBar value={t.share} color="var(--lg-mossa)" className="mt-1" />
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <Card title="Smarta byten" eyebrow="Samma näring, mindre klimat">
        {swaps.length === 0 ? (
          <Callout emoji="🌱">Inga större byten att föreslå – din mat är redan klimatsmart där det räknas mest.</Callout>
        ) : (
          <ul className="space-y-2.5">
            {swaps.map((s) => (
              <li key={s.id} className="flex items-start gap-3 rounded-2xl bg-surface-2/70 px-3.5 py-3">
                <Repeat className="mt-0.5 size-4 shrink-0 text-gran" aria-hidden="true" />
                <p className="text-sm leading-relaxed text-ink-2">
                  Byt {s.from} mot {s.to}
                  {!mindful && (
                    <>
                      {' '}
                      – sparar ca <strong className="font-semibold text-ink">{kg(s.savingKg)} CO₂e</strong>
                    </>
                  )}
                  .
                </p>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs leading-relaxed text-ink-3">Förslag, inte regler – välj det som passar dig och din vardag.</p>
      </Card>

      <div className="md:col-span-2">
        <InfoNote>
          Så räknar vi: varje livsmedel får ett ungefärligt värde i kg CO₂e per kg, från RISE Klimatdatabas för livsmedel (2022)
          eller en schablon för kategorin. Värdena gäller från jord till industrins grind och kan skilja sig mycket mellan
          producenter – se dem som en fingervisning. Klimatsmart nivå: WWF One Planet Plate. Genomsnittlig svensk:
          Naturvårdsverket. Bil: {formatNumber(CAR_KG_CO2E_PER_KM * 1000)} g CO₂ per km (Trafikverket).
          {summary.unknownEntries > 0 &&
            ` ${summary.unknownEntries} ${summary.unknownEntries === 1 ? 'snabbpost' : 'snabbposter'} utan vikt kunde inte räknas med.`}
        </InfoNote>
      </div>
      <SourceNote>Klimatdata: RISE, Livsmedelsverket, Naturvårdsverket och WWF. Alla värden är ungefärliga.</SourceNote>
    </div>
  )
}
