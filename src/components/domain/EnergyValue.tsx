/**
 * Energi i användarens valda enhet (kcal eller kJ enligt inställningarna).
 *
 * Läser `settings.energyUnit` från profilbutiken – det är den enda domänkomponenten som gör det,
 * så att resten av gränssnittet kan skicka in kcal och slippa tänka på enheter.
 */
import { useCallback } from 'react'
import { useProfileStore } from '../../stores/profileStore'
import { formatEnergy } from '../../lib/format'

export type EnergyUnit = 'kcal' | 'kJ'

/** Användarens valda energienhet. */
export function useEnergyUnit(): EnergyUnit {
  return useProfileStore((s) => s.settings.energyUnit)
}

/**
 * Formateringsfunktion för energi i användarens enhet – praktisk för diagram-tooltips:
 * `const fmt = useEnergyFormatter(); <BarChart formatValue={fmt} />`.
 */
export function useEnergyFormatter(): (kcal: number | undefined, withUnit?: boolean) => string {
  const unit = useEnergyUnit()
  return useCallback((kcal: number | undefined, withUnit = true) => formatEnergy(kcal, unit, withUnit), [unit])
}

export interface EnergyValueProps {
  /** Energi i kcal (lagras alltid i kcal). `undefined` visas som "–". */
  kcal: number | undefined
  /** Tvinga en enhet i stället för användarens val. */
  unit?: EnergyUnit
  /** Visa enheten. Standard true. */
  showUnit?: boolean
  /** Visa tecken (+/−), t.ex. för "kvar"/"över". */
  signed?: boolean
  /** Visa stora siffror i Fraunces (`display-num`). */
  display?: boolean
  className?: string
  /** Klasser för enheten. Standard: mindre och dämpad. */
  unitClassName?: string
}

/**
 * Visar t.ex. "1 850 kcal" eller "7 740 kJ". Enheten blir mindre och dämpad, och ett
 * `title`-attribut visar värdet i den andra enheten.
 */
export function EnergyValue({
  kcal,
  unit,
  showUnit = true,
  signed = false,
  display = false,
  className = '',
  unitClassName = 'text-[0.72em] font-medium text-ink-3',
}: EnergyValueProps) {
  const preferred = useEnergyUnit()
  const u = unit ?? preferred
  const known = kcal !== undefined && Number.isFinite(kcal)
  const abs = known ? Math.abs(kcal) : undefined
  const sign = signed && known && Math.round(kcal) !== 0 ? (kcal > 0 ? '+' : '−') : ''
  const other: EnergyUnit = u === 'kcal' ? 'kJ' : 'kcal'
  return (
    <span
      className={`whitespace-nowrap tabular-nums ${display ? 'display-num' : ''} ${className}`}
      title={known ? `${sign}${formatEnergy(abs, other)}` : undefined}
    >
      {sign}
      {formatEnergy(abs, u, false)}
      {showUnit && known && <span className={unitClassName}>{`\u00a0${u}`}</span>}
    </span>
  )
}
