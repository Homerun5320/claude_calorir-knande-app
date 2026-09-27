/**
 * Alkohol i standardglas (12 g) – idag och i veckan, neutral fakta från Socialstyrelsen,
 * Folkhälsomyndigheten och Alkoholhjälpen, och snabbval för öl, vin, cider och snaps.
 *
 * Tonen är saklig och vänlig: inga röda varningar, ingen skuld – bara information och en väg till stöd.
 */
import { memo, useMemo } from 'react'
import { ExternalLink, Info } from 'lucide-react'
import { Card, Stat } from '../../../components/ui'
import { BarChart, type BarDatum } from '../../../components/charts'
import { formatNumber, plural } from '../../../lib/format'
import { useDiaryStore } from '../../../stores/diaryStore'
import type { ISODate } from '../../../types'
import { weekOf } from '../activityLogic'
import { ALCOHOL_STATUS_TEXT, alcoholStatus, alcoholSummary, RISK_DRINKS_PER_OCCASION, RISK_DRINKS_PER_WEEK } from '../drinksLogic'
import { ALCOHOL_OPTIONS, QuickDrinks } from './QuickDrinks'

export interface AlcoholCardProps {
  today: ISODate
  mindful: boolean
  /** Gravid eller ammar – visa rådet att avstå. */
  pregnantOrNursing: boolean
  /**
   * Under 18 år: rådet är att avstå helt. Vuxnas risknivåer och snabbval för öl, vin och sprit
   * visas inte.
   */
  minor?: boolean
}

export const AlcoholCard = memo(function AlcoholCard({ today, mindful, pregnantOrNursing, minor = false }: AlcoholCardProps) {
  const entries = useDiaryStore((s) => s.entries)
  const week = useMemo(() => weekOf(today), [today])
  const summary = useMemo(() => alcoholSummary(entries, week.filter((d) => d <= today)), [entries, week, today])
  const todayDrinks = summary.days.find((d) => d.date === today)?.drinks ?? 0
  const status = alcoholStatus(summary)
  const bars = useMemo<BarDatum[]>(
    () => week.map((date) => ({ date, value: date > today ? undefined : (summary.days.find((d) => d.date === date)?.drinks ?? 0) })),
    [week, today, summary.days],
  )

  return (
    <Card tone="vinbar" eyebrow="Alkohol" title="Standardglas">
      {mindful ? (
        <p className="text-[0.9375rem] leading-relaxed text-ink">
          {summary.daysWithAlcohol === 0 ? 'Ingen alkohol loggad i veckan.' : `Alkohol loggad ${plural(summary.daysWithAlcohol, 'dag', 'dagar')} i veckan.`}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Stat size="sm" label="Idag" value={formatNumber(todayDrinks, 1)} unit="glas" />
            <Stat size="sm" label="Veckan hittills" value={formatNumber(summary.total, 1)} unit="glas" />
          </div>
          {summary.total >= 0.05 && (
            <BarChart
              className="mt-3"
              data={bars}
              highlight={today}
              color="var(--lg-vinbar)"
              height={96}
              unit="glas"
              formatValue={(v) => `${formatNumber(v, 1)} standardglas`}
              valueLabel={false}
              dimOthers={false}
              yTickCount={2}
              legend={false}
              title="Standardglas per dag"
              summary={`${formatNumber(summary.total, 1)} standardglas den här veckan.`}
            />
          )}
        </>
      )}
      {minor ? (
        <p className="mt-3 text-[0.8125rem] leading-relaxed text-ink-2">
          Under 18 år är rådet att avstå från alkohol helt – kroppen och hjärnan utvecklas fortfarande. Har du frågor eller funderingar
          kan du prata med skolsköterskan eller läsa mer på{' '}
          <a href="https://www.1177.se/" target="_blank" rel="noreferrer" className="font-semibold text-vinbar underline underline-offset-2">
            1177
          </a>
          .
        </p>
      ) : (
        <p className="mt-3 text-[0.8125rem] leading-relaxed text-ink-2">{ALCOHOL_STATUS_TEXT[status]}</p>
      )}
      {pregnantOrNursing && !minor && (
        <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-2">Under graviditet och amning är rådet att avstå från alkohol helt.</p>
      )}

      {!minor && (
        <AdultAlcoholInfo today={today} mindful={mindful} />
      )}
      <p className="mt-2 text-xs leading-relaxed text-ink-3">Källor: Socialstyrelsen, Folkhälsomyndigheten och Alkoholhjälpen.</p>
    </Card>
  )
})

/** Risknivåer för vuxna, snabbval och länk till Alkoholhjälpen (visas inte under 18 år). */
function AdultAlcoholInfo({ today, mindful }: { today: ISODate; mindful: boolean }) {
  return (
    <>
      <details className="group mt-4 rounded-2xl bg-surface/70 px-3.5 py-1 [&_summary::-webkit-details-marker]:hidden">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-[0.875rem] font-semibold text-ink">
          <Info aria-hidden className="size-4 shrink-0 text-vinbar" strokeWidth={2.2} />
          Om standardglas och risknivåer
          <span aria-hidden className="ml-auto text-ink-3 transition-transform group-open:rotate-90">
            ›
          </span>
        </summary>
        <ul className="flex list-disc flex-col gap-2 pb-3 pl-5 pt-1 text-[0.8125rem] leading-relaxed text-ink-2 marker:text-ink-3">
          <li>Ett standardglas innehåller 12{'\u00a0'}gram alkohol – ungefär 33{'\u00a0'}cl starköl, 50{'\u00a0'}cl folköl, 12–15{'\u00a0'}cl vin eller 4{'\u00a0'}cl sprit.</li>
          <li>Det finns ingen helt riskfri nivå. Ju mindre alkohol, desto lägre risk för skador och sjukdomar på sikt.</li>
          <li>
            Enligt Socialstyrelsen erbjuder vården stöd från {RISK_DRINKS_PER_WEEK} standardglas i veckan, eller {RISK_DRINKS_PER_OCCASION}{' '}
            standardglas vid ett och samma tillfälle en gång i månaden eller oftare.
          </li>
          <li>Alkohol påverkar sömnen och återhämtningen, och ger 7{'\u00a0'}kcal per gram.</li>
        </ul>
      </details>

      <h3 className="eyebrow mb-2 mt-5">Lägg till</h3>
      <QuickDrinks options={ALCOHOL_OPTIONS} kind="alcohol" date={today} mindful={mindful} label="Snabbval öl, vin, cider och snaps" />

      <a
        href="https://alkoholhjalpen.se"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 flex min-h-11 items-center gap-2 rounded-2xl px-1 text-[0.875rem] font-semibold text-vinbar underline-offset-4 hover:underline"
      >
        Alkoholhjälpen – anonymt stöd och självtest
        <ExternalLink aria-hidden className="size-4" strokeWidth={2.2} />
        <span className="sr-only">(öppnas i ny flik)</span>
      </a>
    </>
  )
}
