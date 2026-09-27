/**
 * Nyckeltal: BMI, midjemått (med midja/längd-kvot), förändring sedan start och snittakt.
 * BMI och WHtR presenteras ödmjukt – som grova fingervisningar, inte betyg.
 */
import type { ReactNode } from 'react'
import { Ruler } from 'lucide-react'
import { Badge, Button, Stat } from '../../components/ui'
import { formatDayShort } from '../../lib/dates'
import { formatKg, formatNumber } from '../../lib/format'
import type { GoalType, LifeStage } from '../../types'
import {
  bmiDisplay,
  directionOf,
  formatSigned,
  formatSignedKg,
  OLDER_ADULT_AGE,
  waistToHeight,
  whtrCategory,
  type BodyOverview,
  type LatestMeasure,
} from './bodyLogic'

interface BodyStatsProps {
  overview: BodyOverview
  heightCm: number | undefined
  lifeStage: LifeStage | undefined
  goal: GoalType | undefined
  plannedRateKg: number | undefined
  waist: LatestMeasure | undefined
  onMeasureWaist: () => void
}

function Tile({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="card flex min-w-0 flex-col justify-between gap-2 p-4">
      {children}
      {footer !== undefined && <div className="text-[0.8125rem] leading-snug text-ink-3">{footer}</div>}
    </div>
  )
}

export function BodyStats({ overview, heightCm, lifeStage, goal, plannedRateKg, waist, onMeasureWaist }: BodyStatsProps) {
  const { trendKg, startKg, startDate, rate, good, age, status } = overview
  if (trendKg === undefined) return null

  // Klassningen görs på det visade (avrundade) värdet och tar hänsyn till åldern.
  const bmiShown = heightCm && heightCm > 0 ? bmiDisplay(trendKg, heightCm, age, lifeStage) : undefined
  const bmiValue = bmiShown?.value
  const adult = age === undefined || age >= 18
  const pregnant = lifeStage === 'gravid'
  const category = bmiShown?.category
  const older = age !== undefined && age >= OLDER_ADULT_AGE
  const ratio = waist && heightCm ? waistToHeight(waist.value, heightCm) : undefined
  const whtr = ratio !== undefined ? whtrCategory(ratio) : undefined
  const sinceStart = startKg !== undefined ? trendKg - startKg : undefined
  // Planen visas bara när viktmålet faktiskt gäller (inte pausat eller nått). Tonen är neutral –
  // viktnedgång tonas aldrig grönt (`good` är bara 'up' vid ett mål om att gå upp).
  const planActive = status.kind !== 'paused' && status.kind !== 'reached'
  const showPlan = plannedRateKg !== undefined && plannedRateKg > 0 && (goal === 'ga_ner' || goal === 'ga_upp') && planActive

  return (
    <section aria-labelledby="body-stats-title">
      <h2 id="body-stats-title" className="eyebrow mb-2.5 px-1">
        Nyckeltal
      </h2>
      <div className="grid grid-cols-2 gap-3">
        <Tile
          footer={
            category ? (
              <Badge tone={category.tone === 'good' ? 'mossa' : 'neutral'} size="md">
                {category.label}
              </Badge>
            ) : pregnant ? (
              'Inte meningsfullt under graviditet'
            ) : !adult ? (
              'Andra gränser gäller under 18 år'
            ) : (
              'Längd saknas i profilen'
            )
          }
        >
          <Stat label="BMI" value={bmiValue !== undefined ? formatNumber(bmiValue, 1) : '–'} size="sm" />
        </Tile>

        <Tile
          footer={
            ratio !== undefined && whtr ? (
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="tabular-nums">Midja/längd {formatNumber(ratio, 2)}</span>
                <Badge tone={whtr.tone} size="sm">
                  {whtr.label}
                </Badge>
              </span>
            ) : waist ? (
              'Längd saknas i profilen'
            ) : (
              <Button variant="soft" size="sm" iconLeft={Ruler} onClick={onMeasureWaist}>
                Mät midjan
              </Button>
            )
          }
        >
          <Stat
            label="Midjemått"
            value={waist ? formatNumber(waist.value, 1) : '–'}
            unit={waist ? 'cm' : undefined}
            size="sm"
            sublabel={waist?.change !== undefined ? `${formatSignedKg(waist.change, 1, 'cm')} sedan förra` : undefined}
          />
        </Tile>

        <Tile footer={startKg !== undefined ? `Från ${formatKg(startKg)}${startDate ? ` · ${formatDayShort(startDate)}` : ''}` : undefined}>
          <Stat
            label="Sedan start"
            value={sinceStart !== undefined ? formatSigned(sinceStart) : '–'}
            unit={sinceStart !== undefined && Math.abs(sinceStart) >= 0.05 ? 'kg' : undefined}
            size="sm"
            tone={sinceStart !== undefined && good !== undefined && directionOf(sinceStart) === good ? 'good' : undefined}
          />
        </Tile>

        <Tile
          footer={
            rate
              ? showPlan
                ? `Per vecka, senaste 4 v. Plan: ${formatNumber(plannedRateKg, 2)}\u00a0kg`
                : 'Per vecka, senaste 4 veckorna'
              : 'Väg dig några gånger under ett par veckor'
          }
        >
          <Stat
            label="Snittakt"
            value={rate ? formatSigned(rate.kgPerWeek, 2) : '–'}
            unit={rate && Math.abs(rate.kgPerWeek) >= 0.005 ? 'kg' : undefined}
            size="sm"
            tone={rate && good !== undefined && directionOf(rate.kgPerWeek) === good ? 'good' : undefined}
          />
        </Tile>
      </div>
      <p className="mt-3 px-1 text-[0.8125rem] leading-relaxed text-ink-3">
        BMI och midjemått är grova mått framtagna för grupper. De skiljer inte på muskler och fett och säger inget om hur du
        mår – se dem som en fingervisning, inte ett betyg. Midja/längd under 0,5 brukar förknippas med lägre risk för
        hjärt-kärlsjukdom.
        {older && (
          <>
            {' '}
            Från {OLDER_ADULT_AGE} år brukar BMI 22–27 räknas som normalt – lite marginal skyddar mot undernäring. Läs mer hos{' '}
            <a href="https://www.1177.se/" target="_blank" rel="noreferrer" className="font-semibold text-gran underline underline-offset-2">
              1177
            </a>
            .
          </>
        )}
      </p>
    </section>
  )
}
