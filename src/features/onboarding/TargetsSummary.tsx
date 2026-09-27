/**
 * Visar hur dagsmålet räknas fram (BMR → förbrukning → justering → dagsmål) och målen för
 * makron, fibrer och vatten. Används i välkomstflödets sammanfattning och i Inställningar.
 */
import type { ReactNode } from 'react'
import { Info } from 'lucide-react'
import { cx, toneVars, type Tone } from '../../components/ui'
import { useEnergyFormatter } from '../../components/domain/EnergyValue'
import type { EnergyBreakdown } from '../../lib/energy'
import { formatNumber } from '../../lib/format'
import type { Targets } from '../../types'

interface Row {
  label: string
  hint?: string
  value: string
  strong?: boolean
}

export function energyRows(energy: EnergyBreakdown, fmt: (kcal: number, withUnit?: boolean) => string): Row[] {
  const rows: Row[] = [
    { label: 'Basalomsättning', hint: 'Energin kroppen gör av med i vila', value: fmt(energy.bmr) },
    {
      label: energy.tdeeSource === 'adaptiv' ? 'Förbrukning (adaptiv)' : 'Förbrukning per dag',
      hint:
        energy.tdeeSource === 'adaptiv'
          ? 'Räknad ur din vikttrend och ditt faktiska intag'
          : `Basalomsättning × ${formatNumber(energy.pal, 2)} för din vardagsaktivitet`,
      value: fmt(energy.tdee),
    },
  ]
  if (energy.lifeStageKcal > 0) rows.push({ label: 'Graviditet/amning', hint: 'Extra energi till dig och barnet', value: `+${fmt(energy.lifeStageKcal)}` })
  rows.push({
    label: 'Justering för ditt mål',
    hint: energy.adjustment === 0 ? 'Du behåller vikten' : energy.adjustment < 0 ? 'Ett lagom underskott' : 'Ett lagom överskott',
    value: energy.adjustment === 0 ? '±0' : `${energy.adjustment > 0 ? '+' : '−'}${fmt(Math.abs(energy.adjustment))}`,
  })
  return rows
}

/**
 * Talet i Fraunces och enheten i Inter – i Fraunces liknar ett gement "l" (liter) en etta, så
 * "1,6 l" skulle läsas som "1,61".
 */
function MacroTile({ label, value, unit, tone, sub }: { label: string; value: string; unit: string; tone: Tone; sub?: string }) {
  return (
    <div style={toneVars(tone)} className="min-w-0 rounded-2xl bg-(--tone-soft) px-2.5 py-2.5 min-[400px]:px-3">
      <div className="flex min-w-0 items-center gap-1.5 truncate text-[0.75rem] font-semibold text-(--tone-ink)">
        <span aria-hidden className="hidden size-2 shrink-0 rounded-full bg-(--tone) min-[400px]:inline-block" />
        {label}
      </div>
      <div className="mt-0.5 text-ink">
        <span className="font-display text-[1.25rem] font-semibold tabular-nums tracking-tight">{value}</span>
        <span className="ml-1 text-[0.8125rem] font-medium text-ink-3">{unit}</span>
      </div>
      {sub && <div className="text-[0.6875rem] text-ink-3">{sub}</div>}
    </div>
  )
}

export interface TargetsSummaryProps {
  energy: EnergyBreakdown
  targets: Targets
  /** Visa uträkningen steg för steg (standard true). */
  showBreakdown?: boolean
  /** Extra förklaringar (t.ex. säkerhetsregler) som visas under målen. */
  extraNotes?: ReactNode[]
  className?: string
}

export function TargetsSummary({ energy, targets, showBreakdown = true, extraNotes = [], className }: TargetsSummaryProps) {
  const fmt = useEnergyFormatter()
  const rows = energyRows(energy, (k, u) => fmt(k, u))
  const notes: ReactNode[] = [...extraNotes, ...energy.notes]
  return (
    <div className={cx('flex flex-col gap-4', className)}>
      {showBreakdown && (
        <dl className="flex flex-col">
          {rows.map((r) => (
            <div key={r.label} className="flex items-baseline justify-between gap-3 border-b border-line/70 py-2.5 first:pt-0">
              <dt className="min-w-0">
                <span className="block text-[0.9375rem] text-ink">{r.label}</span>
                {r.hint && <span className="block text-[0.75rem] leading-snug text-ink-3">{r.hint}</span>}
              </dt>
              <dd className="shrink-0 text-[0.9375rem] font-semibold tabular-nums text-ink">{r.value}</dd>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-3 pt-3">
            <dt className="font-display text-[1.0625rem] font-semibold text-ink">Dagsmål</dt>
            <dd className="display-num text-[1.75rem] font-semibold text-gran">{fmt(targets.kcal)}</dd>
          </div>
        </dl>
      )}

      <div className="grid grid-cols-3 gap-2">
        <MacroTile label="Protein" tone="protein" value={formatNumber(targets.proteinG)} unit="g" />
        <MacroTile label="Kolhydrater" tone="carbs" value={formatNumber(targets.carbsG)} unit="g" />
        <MacroTile label="Fett" tone="fat" value={formatNumber(targets.fatG)} unit="g" />
        <MacroTile label="Fibrer" tone="fiber" value={formatNumber(targets.fiberG)} unit="g" sub="minst" />
        <MacroTile label="Dryck" tone="water" value={formatNumber(targets.waterMl / 1000, 2)} unit="liter" sub="per dag" />
        <MacroTile label="Salt" tone="neutral" value={formatNumber(targets.saltMaxG, 1)} unit="g" sub="högst" />
      </div>

      {notes.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Att tänka på">
          {notes.map((n, i) => (
            <li key={i} className="flex gap-2.5 rounded-2xl bg-blabar-soft px-3.5 py-3 text-[0.875rem] leading-relaxed text-ink">
              <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-blabar" strokeWidth={2.2} />
              <span>{n}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
