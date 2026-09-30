/**
 * Lagoms diagram – handgjorda SVG-komponenter utan diagrambibliotek.
 * Alla är rent presentationella (data via props) och använder designsystemets färgtokens.
 */
export { LineChart } from './LineChart'
export type { LineChartProps, LineSeries, LinePoint, LineBand, LineGoal } from './LineChart'
export { BarChart } from './BarChart'
export type { BarChartProps, BarDatum, BarStackKey, BarLabelMode } from './BarChart'
export { CalendarHeatmap } from './CalendarHeatmap'
export type { CalendarHeatmapProps } from './CalendarHeatmap'
export { DonutChart } from './DonutChart'
export type { DonutChartProps, DonutSegment } from './DonutChart'
export { Sparkline } from './Sparkline'
export type { SparklineProps } from './Sparkline'
export {
  niceTicks,
  niceDomain,
  tickStep,
  formatTicks,
  linearScale,
  bandLayout,
  monotonePath,
  curvePath,
  areaPath,
  heatLevel,
  heatScale,
  tint,
  timeTicks,
  useElementWidth,
  SERIES_COLORS,
} from './chartUtils'
export type { Point, CurveType, LinearScale, BandLayout, TimeTick } from './chartUtils'
