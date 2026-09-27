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
import { chartWindow, goalChartPlacement, WEIGHT_RANGES, type WeightRange } from './bodyLogic'

/** Antal intervall på y-axeln – samma värde används för att avgöra om målvikten syns. */
const Y_TICKS = 4

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

  // Om målvikten ritas avgörs av den slutliga (avrundade) y-axeln, inte bara av avståndet till datan.
  const placement = useMemo(
    () => (targetKg === undefined ? undefined : goalChartPlacement(series.flatMap((s) => s.points.map((p) => p.value)), targetKg, Y_TICKS)),
    [series, targetKg],
  )
  const goal = useMemo<LineGoal | undefined>(
    () =>
      targetKg === undefined || !placement
        ? undefined
        : { value: targetKg, label: `Mål ${formatNumber(targetKg, 1)}\u00a0kg`, color: 'var(--lg-mossa)', includeInDomain: placement.includeInDomain },
    [targetKg, placement],
  )

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
        yTickCount={Y_TICKS}
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
        {goal && count > 0 && placement && !placement.visible && ` Målvikten ${formatKg(goal.value)} ligger utanför diagrammet.`}
      </p>
    </Card>
  )
}
