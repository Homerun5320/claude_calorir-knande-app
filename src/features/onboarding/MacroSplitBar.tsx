/** Liten staplad stapel som visar makrofördelningen i energiprocent (protein · kolhydrater · fett). */
import { cx } from '../../components/ui'
import { formatNumber } from '../../lib/format'

export interface MacroSplit {
  protein: number
  carbs: number
  fat: number
}

export function macroSplitText(p: MacroSplit): string {
  return `Protein ${formatNumber(p.protein)}\u00a0%, kolhydrater ${formatNumber(p.carbs)}\u00a0%, fett ${formatNumber(p.fat)}\u00a0% av energin`
}

export function MacroSplitBar({ split, className, showLegend }: { split: MacroSplit; className?: string; showLegend?: boolean }) {
  const total = split.protein + split.carbs + split.fat || 1
  const w = (v: number) => `${(v / total) * 100}%`
  return (
    <div className={className}>
      <div role="img" aria-label={macroSplitText(split)} className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full">
        <span className="h-full rounded-full bg-protein transition-[width] duration-300" style={{ width: w(split.protein) }} />
        <span className="h-full rounded-full bg-carbs transition-[width] duration-300" style={{ width: w(split.carbs) }} />
        <span className="h-full rounded-full bg-fat transition-[width] duration-300" style={{ width: w(split.fat) }} />
      </div>
      {showLegend && (
        <div aria-hidden className={cx('mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[0.75rem] tabular-nums text-ink-3')}>
          <span>
            <span className="mr-1 inline-block size-2 rounded-full bg-protein" />
            Protein {formatNumber(split.protein)}{'\u00a0'}%
          </span>
          <span>
            <span className="mr-1 inline-block size-2 rounded-full bg-carbs" />
            Kolhydrater {formatNumber(split.carbs)}{'\u00a0'}%
          </span>
          <span>
            <span className="mr-1 inline-block size-2 rounded-full bg-fat" />
            Fett {formatNumber(split.fat)}{'\u00a0'}%
          </span>
        </div>
      )}
    </div>
  )
}
