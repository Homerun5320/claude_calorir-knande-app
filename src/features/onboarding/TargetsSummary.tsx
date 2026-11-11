/**
 * Visar hur dagsmålet räknas fram (BMR → förbrukning → justering → dagsmål) och målen för
 * makron, fibrer och vatten. Används i välkomstflödets sammanfattning och i Inställningar.
 */
import type { ReactNode } from 'react'
import { Info } from 'lucide-react'
import { ExternalLink, cx, toneVars, type Tone } from '../../components/ui'
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
 * dagsmålet avrundas till jämna 10 kcal (och kJ räknas om per rad). Justeringen visas som den
 * är (t.ex. −550 kcal, det man valt), och avrundningen läggs på förbrukningen, som ändå är en
 * uppskattning: "ca 2 220 − 550 = 1 670" i stället för "2 223 − 553 = 1 670". När säkerhetsgolvet
 * höjer målet visas förbrukningen som den är och höjningen som en egen rad.
 */
export function energyRows(energy: EnergyBreakdown, unit: 'kcal' | 'kJ' = 'kcal'): EnergyRows {
  const u = (kcal: number) => toUnit(kcal, unit)
  const total = u(energy.kcal)
  const life = energy.lifeStageKcal > 0 ? u(energy.lifeStageKcal) : 0
  let tdee = u(energy.tdee)
  const adjustment = energy.adjustment === 0 ? 0 : u(energy.adjustment)
  let floorRaise = 0
  if (energy.atFloor) floorRaise = total - tdee - life - adjustment
  else tdee = total - life - adjustment

  const rows: Row[] = [
    { label: 'Basalomsättning', hint: 'Energin kroppen gör av med i vila', value: `${formatNumber(u(energy.bmr))} ${unit}` },
    {
      label: energy.tdeeSource === 'adaptiv' ? 'Förbrukning (adaptiv)' : 'Förbrukning per dag',
      hint:
        energy.tdeeSource === 'adaptiv'
          ? 'Räknad ur din vikttrend och ditt faktiska intag'
          : `Basalomsättning × ${formatNumber(energy.pal, 2)} för din vardagsaktivitet`,
      value: `ca ${formatNumber(tdee)} ${unit}`,
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
function MacroTile({ label, ariaLabel, value, unit, tone, sub }: { label: ReactNode; ariaLabel: string; value: string; unit: string; tone: Tone; sub?: string }) {
  return (
    <div role="group" aria-label={ariaLabel} style={toneVars(tone)} className="min-w-0 rounded-2xl bg-(--tone-soft) px-2.5 py-2.5 min-[400px]:px-3">
      {/* Etiketten radbryts (inte "…"): vid stor text (200 %) ska "Protein" och "Kolhydrater" gå att läsa. */}
      <div className="flex min-w-0 items-center gap-1.5 text-[0.75rem] font-semibold text-(--tone-ink)">
        <span aria-hidden className="hidden size-2 shrink-0 rounded-full bg-(--tone) min-[400px]:inline-block" />
        <span className="min-w-0 break-words">{label}</span>
      </div>
      <div className="mt-0.5 text-ink">
        <span className="font-display text-[1.25rem] font-semibold tabular-nums tracking-tight">{value}</span>
        {/* Ett riktigt (fast) mellanslag: skärmläsare och kopiering får "115 g" i stället för "115g". */}
        {'\u00a0'}
        <span className="text-[0.8125rem] font-medium text-ink-3">{unit}</span>
      </div>
      {sub && <div className="text-[0.6875rem] text-ink-3">{sub}</div>}
    </div>
  )
}

/**
 * En rad i uträkningen: etikett till vänster och värde till höger. Vid stor text (200 %) ryms de inte bredvid
 * varandra – då hamnar värdet under etiketten (`flex-wrap`; etikettens bas 8 rem gör att raden bara bryts när det behövs).
 */
const ROW = 'flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line/70 py-2.5 first:pt-0'
const ROW_LABEL = 'min-w-0 flex-1 basis-32'
const ROW_VALUE = 'ml-auto shrink-0 text-[0.9375rem] font-semibold tabular-nums text-ink'

export interface TargetsSummaryProps {
  energy: EnergyBreakdown
  targets: Targets
  /** Visa uträkningen steg för steg (standard true). */
  showBreakdown?: boolean
  /** Extra förklaringar (t.ex. säkerhetsregler) som visas under målen. */
  extraNotes?: ReactNode[]
  /**
   * Påminnelsen om att målen är uppskattningar och att rådgöra med vården (standard true). Stängs av
   * där en fullständig ansvarsfriskrivning redan står intill, som i välkomstflödets sammanfattning.
   */
  careNote?: boolean
  className?: string
}

export function TargetsSummary({ energy, targets, showBreakdown = true, extraNotes = [], careNote = true, className }: TargetsSummaryProps) {
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
            <div key={r.label} className={ROW}>
              <dt className={ROW_LABEL}>
                <span className="block text-[0.9375rem] text-ink">{r.label}</span>
                {r.hint && <span className="block text-[0.75rem] leading-snug text-ink-3">{r.hint}</span>}
              </dt>
              <dd className={ROW_VALUE}>{r.value}</dd>
            </div>
          ))}
          {custom && (
            <div className={ROW}>
              <dt className={ROW_LABEL}>
                <span className="block text-[0.9375rem] text-ink">Beräknat dagsmål</span>
                <span className="block text-[0.75rem] leading-snug text-ink-3">Du har ett eget energimål som gäller i stället</span>
              </dt>
              <dd className={ROW_VALUE}>{total}</dd>
            </div>
          )}
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 pt-3">
            <dt className="min-w-0 break-words font-display text-[1.0625rem] font-semibold text-ink">{custom ? 'Ditt dagsmål' : 'Dagsmål'}</dt>
            <dd className="ml-auto display-num text-[1.75rem] font-semibold text-gran">{custom ? `${formatNumber(Math.round(unit === 'kJ' ? targets.kcal * KJ_PER_KCAL : targets.kcal))} ${unit}` : total}</dd>
          </div>
        </dl>
      )}

      {careNote && (
        <p className="text-[0.8125rem] leading-snug text-ink-3">
          Målen är uppskattningar. Rådgör med vården om du har en sjukdom, är gravid eller ammar, eller funderar på att ändra din vikt. Läs mer på{' '}
          <ExternalLink href="https://www.1177.se">1177.se</ExternalLink>.
        </p>
      )}

      {/* Containerfråga i rem (följer rotens teckenstorlek): vid stor text ryms inte tre rutor bredvid varandra. */}
      <div className="@container">
        <div className="grid grid-cols-3 gap-2 @max-[15rem]:grid-cols-2 @max-[11rem]:grid-cols-1">
          <MacroTile label="Protein" ariaLabel="Protein" tone="protein" value={formatNumber(targets.proteinG)} unit="g" />
          <MacroTile
            // "Kolhydrater" får inte plats i en tredjedel av en smal skärm (under 360 px).
            label={
              <>
                <span className="min-[360px]:hidden">Kolhydr.</span>
                <span className="hidden min-[360px]:inline">Kolhydrater</span>
              </>
            }
            ariaLabel="Kolhydrater"
            tone="carbs"
            value={formatNumber(targets.carbsG)}
            unit="g"
          />
          <MacroTile label="Fett" ariaLabel="Fett" tone="fat" value={formatNumber(targets.fatG)} unit="g" />
          <MacroTile label="Fibrer" ariaLabel="Fibrer" tone="fiber" value={formatNumber(targets.fiberG)} unit="g" sub="minst" />
          <MacroTile label="Dryck" ariaLabel="Dryck" tone="water" value={formatNumber(targets.waterMl / 1000, 2)} unit="liter" sub="per dag" />
          <MacroTile label="Salt" ariaLabel="Salt" tone="neutral" value={formatNumber(targets.saltMaxG, 1)} unit="g" sub="högst" />
        </div>
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
