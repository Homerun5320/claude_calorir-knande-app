/**
 * Flikar och adressparametrar för Insikter: /insikter?flik=naring&period=30&vecka=-1
 */
import { parsePeriodKind, parseWeekOffset, type PeriodKind } from './period'

export const INSIGHT_TABS = ['oversikt', 'naring', 'kostrad', 'tallrik', 'klimat', 'monster'] as const
export type InsightsTab = (typeof INSIGHT_TABS)[number]

export const TAB_LABELS: Record<InsightsTab, string> = {
  oversikt: 'Översikt',
  naring: 'Näring',
  kostrad: 'Kostråd',
  tallrik: 'Tallriken',
  klimat: 'Klimat',
  monster: 'Mönster',
}

/** Tolka fliken. Klimatfliken finns bara när klimat visas i inställningarna. */
export function parseTab(value: string | null | undefined, showClimate: boolean): InsightsTab {
  const tab = (INSIGHT_TABS as readonly string[]).includes(value ?? '') ? (value as InsightsTab) : 'oversikt'
  return tab === 'klimat' && !showClimate ? 'oversikt' : tab
}

export interface InsightsParams {
  tab: InsightsTab
  kind: PeriodKind
  offset: number
}

export function readParams(params: URLSearchParams, showClimate: boolean): InsightsParams {
  const kind = parsePeriodKind(params.get('period'))
  return {
    tab: parseTab(params.get('flik'), showClimate),
    kind,
    offset: kind === 'vecka' ? parseWeekOffset(params.get('vecka')) : 0,
  }
}

/** Nya adressparametrar – standardvärden utelämnas så att adressen hålls kort. */
export function writeParams(current: URLSearchParams, next: Partial<InsightsParams>): URLSearchParams {
  const p = new URLSearchParams(current)
  if (next.tab !== undefined) {
    if (next.tab === 'oversikt') p.delete('flik')
    else p.set('flik', next.tab)
  }
  if (next.kind !== undefined) {
    if (next.kind === 'vecka') p.delete('period')
    else p.set('period', next.kind)
    if (next.kind !== 'vecka') p.delete('vecka')
  }
  if (next.offset !== undefined) {
    if (next.offset === 0) p.delete('vecka')
    else p.set('vecka', String(next.offset))
  }
  return p
}
