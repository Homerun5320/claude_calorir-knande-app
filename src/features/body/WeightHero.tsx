/**
 * Överblicken överst på "Vikt & mått": trendvikten, förändring senaste veckan/månaden,
 * vägen från start till mål och en lugn prognos för när målet nås.
 *
 * I medvetet läge visas bara riktningen i ord – siffrorna kan visas på begäran.
 */
import { useMemo } from 'react'
import { Eye, Flag, PencilLine, Sprout } from 'lucide-react'
import { Button, Card, ProgressBar } from '../../components/ui'
import { Sparkline } from '../../components/charts'
import { relativeDayLabel } from '../../lib/dates'
import { formatKg, formatNumber } from '../../lib/format'
import type { GoalType } from '../../types'
import { formatSignedKg, goalDateLabel, trendWord, type BodyOverview } from './bodyLogic'
import { ChangePill } from './parts'

const PROFILE_LINK = '/installningar/profil'

interface WeightHeroProps {
  overview: BodyOverview
  goal: GoalType | undefined
  targetKg: number | undefined
  today: string
}

export function WeightHero({ overview, goal, targetKg, today }: WeightHeroProps) {
  const { trendKg, latest, change7, change30, good, points, daysSinceLast } = overview
  const spark = useMemo(() => points.slice(-30).map((p) => p.trend), [points])
  if (trendKg === undefined || !latest) return null

  return (
    <Card padding="lg" as="section" aria-label="Din trendvikt" className="overflow-hidden">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow">Trendvikt</p>
          <p className="mt-2 flex items-baseline gap-1.5">
            <span className="display-num text-[3.5rem] font-medium leading-none text-ink">{formatNumber(trendKg, 1)}</span>
            <span className="text-lg font-medium text-ink-3">kg</span>
          </p>
        </div>
        {spark.length >= 2 && (
          <Sparkline
            values={spark}
            width={112}
            height={52}
            className="mt-3 shrink-0"
            ariaLabel={`Trendvikten de senaste ${spark.length} dagarna, från ${formatKg(spark[0])} till ${formatKg(spark[spark.length - 1])}`}
          />
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {change7 !== undefined && <ChangePill change={change7} good={good} suffix="senaste veckan" />}
        {change30 !== undefined && <ChangePill change={change30} good={good} suffix="senaste 30 dagarna" />}
        {change7 === undefined && (
          <p className="text-sm leading-relaxed text-ink-2">
            Väg dig några gånger till under veckan, så syns åt vilket håll trenden går.
          </p>
        )}
      </div>

      <p className="mt-3 text-[0.8125rem] text-ink-3">
        Senaste vägning {formatKg(latest.kg)} · {relativeDayLabel(latest.date, today).toLowerCase()}
        {daysSinceLast !== undefined && daysSinceLast > 21 && ' – väg dig gärna igen när det passar, så hålls trenden aktuell.'}
      </p>

      <GoalSection overview={overview} goal={goal} targetKg={targetKg} today={today} />
    </Card>
  )
}

function GoalSection({ overview, goal, targetKg, today }: WeightHeroProps) {
  const { status, startKg, trendKg, progress } = overview
  if (trendKg === undefined) return null

  const editLink = (
    <Button to={PROFILE_LINK} variant="ghost" size="sm" iconLeft={PencilLine} className="-mr-2">
      Ändra mål
    </Button>
  )

  if (goal === undefined) return null

  // Behålla vikten – ingen målvikt att räkna mot.
  if (goal === 'behalla') {
    return (
      <div className="mt-5 border-t border-line pt-4">
        <div className="flex items-center justify-between gap-3">
          <p className="eyebrow">Mål: behålla vikten</p>
          {editLink}
        </div>
        {startKg !== undefined && (
          <p className="mt-1 text-sm leading-relaxed text-ink-2">
            Du ligger {formatSignedKg(trendKg - startKg)} från startvikten {formatKg(startKg)}. Små svängningar upp och ned är
            helt naturliga.
          </p>
        )}
      </div>
    )
  }

  if (status.kind === 'paused') {
    return (
      <div className="mt-5 border-t border-line pt-4">
        <div className="flex items-center justify-between gap-3">
          <p className="eyebrow">Ditt mål</p>
          {editLink}
        </div>
        <p className="mt-1 text-sm leading-relaxed text-ink-2">
          {status.reason === 'under18'
            ? 'För dig under 18 år fokuserar Lagom på att äta bra och må bra – inte på viktnedgång. Kroppen behöver energi för att växa.'
            : 'Under graviditet och amning fokuserar Lagom inte på viktnedgång. Här kan du ändå följa din vikt i lugn och ro.'}
        </p>
      </div>
    )
  }

  if (targetKg === undefined) {
    return (
      <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-4">
        <p className="text-sm leading-relaxed text-ink-2">Ingen målvikt är satt – det behövs inte heller.</p>
        <Button to={PROFILE_LINK} variant="soft" size="sm" iconLeft={Flag}>
          Sätt mål
        </Button>
      </div>
    )
  }

  const pct = progress !== undefined ? Math.round(progress * 100) : undefined

  return (
    <div className="mt-5 border-t border-line pt-4">
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow">Mot målet</p>
        {editLink}
      </div>
      {startKg !== undefined && pct !== undefined && (
        <div className="mt-2">
          <ProgressBar
            value={pct}
            max={100}
            tone="gran"
            size="md"
            aria-label="Vägen från startvikt till målvikt"
            valueText={`${pct} procent av vägen från ${formatKg(startKg)} till ${formatKg(targetKg)}`}
          />
          <div className="mt-1.5 flex justify-between text-xs tabular-nums text-ink-3">
            <span>Start {formatKg(startKg)}</span>
            <span className="font-semibold text-ink-2">{pct} %</span>
            <span>Mål {formatKg(targetKg)}</span>
          </div>
        </div>
      )}
      <p className="mt-3 flex items-start gap-2 text-sm leading-relaxed text-ink-2">
        <Sprout aria-hidden className="mt-0.5 size-4 shrink-0 text-mossa" strokeWidth={2.2} />
        <span>{goalSentence(overview, targetKg, today)}</span>
      </p>
    </div>
  )
}

function goalSentence(overview: BodyOverview, targetKg: number, today: string): string {
  const { status } = overview
  const target = formatKg(targetKg)
  switch (status.kind) {
    case 'projected':
      return status.weeks < 1
        ? `Du är nästan framme – med nuvarande takt når du ${target} inom en vecka.`
        : `Med nuvarande takt når du ${target} omkring ${goalDateLabel(status.date, today)}.`
    case 'reached':
      return `Du har nått din målvikt ${target} – starkt jobbat! Vill du nu hålla vikten kan du byta mål i profilen.`
    case 'early':
      return 'Väg dig några gånger till under ett par veckor, så kan Lagom uppskatta när du når målet.'
    case 'steady':
      return 'Trenden står still just nu – det är helt okej. Kroppen har sin egen rytm, och små vanor gör skillnad över tid.'
    default:
      return ''
  }
}

/** Medvetet läge: riktningen i ord, inga siffror. */
export function MindfulHero({ overview, onReveal }: { overview: BodyOverview; onReveal: () => void }) {
  const perWeek = overview.rate?.kgPerWeek ?? overview.change7
  return (
    <Card padding="lg" tone="mossa" as="section" aria-label="Din trend">
      <p className="eyebrow">Din trend</p>
      <p className="mt-2 font-display text-[2rem] font-semibold leading-tight tracking-tight text-ink">
        {overview.latest ? trendWord(perWeek) : 'Ingen vägning ännu'}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-ink-2">
        Medvetet läge är på, så vikten visas utan siffror. Fokus ligger på riktningen över tid – och på hur du mår.
      </p>
      {overview.latest && (
        <Button variant="secondary" size="sm" iconLeft={Eye} onClick={onReveal} className="mt-4">
          Visa siffror
        </Button>
      )}
    </Card>
  )
}
