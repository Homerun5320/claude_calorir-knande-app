/**
 * Viktkurvan: enskilda vägningar som punkter, trendvikten (EWMA) som mjuk linje och
 * målvikten som streckad linje. Intervall: 30 dagar, 90 dagar, 1 år eller allt.
 */
import { useMemo, useState } from 'react'
import { Card, SegmentedControl } from '../../components/ui'
import { LineChart, type LineGoal, type LineSeries } from '../../components/charts'
import { formatKg, formatNumber } from '../../lib/format'
import type { TrendPoint } from '../../lib/energy'
import type { ISODate, WeightEntry } from '../../types'
import { chartWindow, WEIGHT_RANGES, type WeightRange } from './bodyLogic'

/** Hur långt från datan målvikten får ligga och ändå dras in i diagrammet (kg). */
const GOAL_DOMAIN_MARGIN = 5

interface WeightChartCardProps {
  /** Vägningar stigande på datum (minst en). */
  weights: readonly WeightEntry[]
  /** Trendserie stigande på datum. */
  points: readonly TrendPoint[]
  targetKg?: number
  today: ISODate
}

export function WeightChartCard({ weights, points, targetKg, today }: WeightChartCardProps) {
  const [range, setRange] = useState<WeightRange>('90')
  const first = weights[0]?.date ?? today
  const lastWeighIn = weights[weights.length - 1]?.date ?? today
  const domain = useMemo(() => chartWindow(range, first, today), [range, first, today])
  const [x0, x1] = domain

  const series = useMemo<LineSeries[]>(() => {
    const dots = weights.filter((w) => w.date >= x0 && w.date <= x1).map((w) => ({ date: w.date, value: w.kg }))
    // Trendlinjen slutar vid senaste vägningen – efter den finns inget nytt att säga.
    const trend = points.filter((p) => p.date >= x0 && p.date <= lastWeighIn).map((p) => ({ date: p.date, value: p.trend }))
    return [
      { id: 'vagning', label: 'Vägning', points: dots, display: 'dots', color: 'var(--lg-ink-3)' },
      { id: 'trend', label: 'Trendvikt', points: trend, color: 'var(--lg-gran)', strokeWidth: 2.75, area: true, endLabel: true },
    ]
  }, [weights, points, x0, x1, lastWeighIn])

  const goal = useMemo<LineGoal | undefined>(() => {
    if (targetKg === undefined) return undefined
    const values = series.flatMap((s) => s.points.map((p) => p.value))
    const lo = Math.min(...values)
    const hi = Math.max(...values)
    const near = values.length > 0 && targetKg >= lo - GOAL_DOMAIN_MARGIN && targetKg <= hi + GOAL_DOMAIN_MARGIN
    return { value: targetKg, label: `Mål ${formatNumber(targetKg, 1)} kg`, color: 'var(--lg-mossa)', includeInDomain: near }
  }, [series, targetKg])

  const count = series[0].points.length

  return (
    <Card title="Viktkurva">
      <SegmentedControl
        aria-label="Tidsintervall"
        value={range}
        onChange={setRange}
        options={WEIGHT_RANGES.map((r) => ({ value: r.value, label: r.label }))}
        size="sm"
        fullWidth
        className="mb-4"
      />
      <LineChart
        series={series}
        goal={goal}
        xDomain={domain}
        height={232}
        unit="kg"
        formatValue={formatKg}
        weekNumbers={range === '30'}
        title="Viktkurva"
        emptyText="Inga vägningar i det här intervallet"
      />
      <p className="mt-3 text-xs leading-relaxed text-ink-3">
        {count === 0
          ? 'Inga vägningar under perioden – välj ett längre intervall.'
          : `${count === 1 ? 'Punkten är din vägning' : `Punkterna är dina ${count} vägningar`}, linjen är trendvikten som jämnar ut dag-till-dag-svängningar.`}
        {goal && !goal.includeInDomain && ` Målvikten ${formatKg(goal.value)} ligger utanför diagrammet.`}
      </p>
    </Card>
  )
}
