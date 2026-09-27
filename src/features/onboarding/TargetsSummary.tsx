/**
 * Visar hur dagsmålet räknas fram (BMR → förbrukning → justering → dagsmål) och målen för
 * makron, fibrer och vatten. Används i välkomstflödets sammanfattning och i Inställningar.
 */
import type { ReactNode } from 'react'
import { Info } from 'lucide-react'
import { cx, toneVars, type Tone } from '../../components/ui'
import { useEnergyUnit } from '../../components/domain/EnergyValue'
import type { EnergyBreakdown } from '../../lib/energy'
import { formatNumber } from '../../lib/format'
import { KJ_PER_KCAL } from '../../lib/nutrients'
import type { Targets } from '../../types'

interface Row {
  label: string
  hint?: string
  value: string
  strong?: boolean
}

export interface EnergyRows {
  /** Raderna i uträkningen (förbrukning, tillägg, justering …). */
  rows: Row[]
  /** Dagsmålet som raderna summerar till. */
  total: string
}

/** Energi i visningsenheten, avrundad till heltal – samma avrundning som `formatEnergy`. */
function toUnit(kcal: number, unit: 'kcal' | 'kJ'): number {
  return Math.round(unit === 'kJ' ? kcal * KJ_PER_KCAL : kcal)
}

function signed(v: number, unit: 'kcal' | 'kJ'): string {
  if (v === 0) return '±0'
  return `${v > 0 ? '+' : '−'}${formatNumber(Math.abs(v))} ${unit}`
}

/**
 * Uträkningen av dagsmålet, steg för steg. De visade talen går alltid jämnt upp med dagsmålet:
 * dagsmålet avrundas till jämna 10 kcal (och kJ räknas om per rad), så avrundningen läggs på
 * justeringsraden – eller på förbrukningen när ingen justering görs – i stället för att summan
 * blir fel ("2 223 − 550 = 1 670"). När säkerhetsgolvet höjer målet visas det som en egen rad.
 */
export function energyRows(energy: EnergyBreakdown, unit: 'kcal' | 'kJ' = 'kcal'): EnergyRows {
  const u = (kcal: number) => toUnit(kcal, unit)
  const total = u(energy.kcal)
  const life = energy.lifeStageKcal > 0 ? u(energy.lifeStageKcal) : 0
  let tdee = u(energy.tdee)
  let adjustment = energy.adjustment === 0 ? 0 : u(energy.adjustment)
  let floorRaise = 0
  if (energy.atFloor) floorRaise = total - tdee - life - adjustment
  else if (adjustment !== 0) adjustment = total - tdee - life
  else tdee = total - life

  const rows: Row[] = [
    { label: 'Basalomsättning', hint: 'Energin kroppen gör av med i vila', value: `${formatNumber(u(energy.bmr))} ${unit}` },
    {
      label: energy.tdeeSource === 'adaptiv' ? 'Förbrukning (adaptiv)' : 'Förbrukning per dag',
      hint:
        energy.tdeeSource === 'adaptiv'
          ? 'Räknad ur din vikttrend och ditt faktiska intag'
          : `Basalomsättning × ${formatNumber(energy.pal, 2)} för din vardagsaktivitet`,
      value: `${formatNumber(tdee)} ${unit}`,
    },
  ]
  if (life > 0) rows.push({ label: 'Graviditet/amning', hint: 'Extra energi till dig och barnet', value: signed(life, unit) })
  rows.push({
    label: 'Justering för ditt mål',
    hint: adjustment === 0 ? 'Du behåller vikten' : adjustment < 0 ? 'Ett lagom underskott' : 'Ett lagom överskott',
    value: signed(adjustment, unit),
  })
  if (floorRaise > 0) {
    rows.push({ label: 'Säkerhetsgolv', hint: 'Dagsmålet går aldrig under den lägsta rekommenderade nivån', value: signed(floorRaise, unit) })
  }
  return { rows, total: `${formatNumber(total)} ${unit}` }
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
  const unit = useEnergyUnit()
  const { rows, total } = energyRows(energy, unit)
  // Ett eget energimål (Inställningar → Mål och makron) går före det beräknade.
  const custom = targets.kcal !== energy.kcal
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
          {custom && (
            <div className="flex items-baseline justify-between gap-3 border-b border-line/70 py-2.5">
              <dt className="min-w-0">
                <span className="block text-[0.9375rem] text-ink">Beräknat dagsmål</span>
                <span className="block text-[0.75rem] leading-snug text-ink-3">Du har ett eget energimål som gäller i stället</span>
              </dt>
              <dd className="shrink-0 text-[0.9375rem] font-semibold tabular-nums text-ink">{total}</dd>
            </div>
          )}
          <div className="flex items-baseline justify-between gap-3 pt-3">
            <dt className="font-display text-[1.0625rem] font-semibold text-ink">{custom ? 'Ditt dagsmål' : 'Dagsmål'}</dt>
            <dd className="display-num text-[1.75rem] font-semibold text-gran">{custom ? `${formatNumber(Math.round(unit === 'kJ' ? targets.kcal * KJ_PER_KCAL : targets.kcal))} ${unit}` : total}</dd>
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
