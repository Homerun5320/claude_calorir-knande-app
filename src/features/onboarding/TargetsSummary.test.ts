/**
 * Uträkningen av dagsmålet ska alltid gå jämnt upp – även när dagsmålet avrundas till jämna
 * 10 kcal, när säkerhetsgolvet höjer det och när energin visas i kJ.
 */
import { describe, expect, it } from 'vitest'
import { computeEnergy, type EnergyBreakdown } from '../../lib/energy'
import type { Profile } from '../../types'
import { energyRows } from './TargetsSummary'

const TODAY = '2026-09-27'

const base: Profile = {
  sex: 'kvinna',
  birthYear: 1990,
  heightCm: 165,
  startWeightKg: 70,
  activityLevel: 'latt',
  goal: 'ga_ner',
  weeklyRateKg: 0.5,
  lifeStage: 'ingen',
  diet: 'allatare',
  macroPreset: 'nnr',
  createdAt: 0,
}

/** "−2 301 kJ" → −2301, "±0" → 0 */
function num(text: string): number {
  if (text.startsWith('±')) return 0
  const n = Number(text.replace(/[^\d]/g, ''))
  return text.startsWith('−') ? -n : n
}

/** Summan av raderna efter basalomsättningen (som bara är information). */
function sum(energy: EnergyBreakdown, unit: 'kcal' | 'kJ') {
  const { rows, total } = energyRows(energy, unit)
  return { parts: rows.slice(1).reduce((s, r) => s + num(r.value), 0), total: num(total), rows }
}

describe('energyRows', () => {
  it('går jämnt upp trots att dagsmålet avrundas till tiotal (2 223 − 550 ≠ 1 670)', () => {
    // Ett fall där förbrukningen inte är ett jämnt tiotal.
    const energy: EnergyBreakdown = { ...computeEnergy(base, 70, { today: TODAY }), tdee: 2223, adjustment: -550, kcal: 1670, atFloor: false, lifeStageKcal: 0 }
    const { parts, total, rows } = sum(energy, 'kcal')
    expect(total).toBe(1670)
    expect(parts).toBe(total)
    // Den valda justeringen visas som den är, och avrundningen läggs på förbrukningen: ca 2 220 − 550 = 1 670.
    expect(rows.find((r) => r.label === 'Justering för ditt mål')?.value).toBe('−550 kcal')
    expect(rows.find((r) => r.label === 'Förbrukning per dag')?.value).toBe('ca 2\u00a0220 kcal')
  })

  it('i kJ: den valda justeringen räknas om, förbrukningen tar avrundningen', () => {
    const energy: EnergyBreakdown = { ...computeEnergy(base, 70, { today: TODAY }), tdee: 2223, adjustment: -550, kcal: 1670, atFloor: false, lifeStageKcal: 0 }
    const { parts, total, rows } = sum(energy, 'kJ')
    expect(parts).toBe(total)
    // −550 kcal = −2 301 kJ; 1 670 kcal = 6 987 kJ.
    expect(rows.find((r) => r.label === 'Justering för ditt mål')?.value).toBe('−2\u00a0301 kJ')
    expect(rows.find((r) => r.label === 'Förbrukning per dag')?.value).toBe('ca 9\u00a0288 kJ')
  })

  it('går jämnt upp för många profiler, i både kcal och kJ', () => {
    const variants: Array<[Partial<Profile>, number]> = [
      [{}, 70],
      [{ weeklyRateKg: 0.25 }, 83.3],
      [{ goal: 'behalla' }, 61.7],
      [{ goal: 'ga_upp', weeklyRateKg: 0.25 }, 55.1],
      [{ lifeStage: 'gravid' }, 68.4],
      [{ lifeStage: 'ammar', goal: 'behalla' }, 72.9],
      [{ sex: 'man', heightCm: 181 }, 93.6],
      // Golvet höjer målet: liten, äldre och stillasittande.
      [{ heightCm: 150, birthYear: 1950, activityLevel: 'stillasittande', weeklyRateKg: 0.75 }, 60],
    ]
    for (const [patch, kg] of variants) {
      const energy = computeEnergy({ ...base, ...patch }, kg, { today: TODAY })
      for (const unit of ['kcal', 'kJ'] as const) {
        const { parts, total } = sum(energy, unit)
        expect(parts, `${JSON.stringify(patch)} i ${unit}`).toBe(total)
      }
    }
  })

  it('visar säkerhetsgolvet som en egen rad', () => {
    const energy = computeEnergy({ ...base, heightCm: 150, birthYear: 1950, activityLevel: 'stillasittande', weeklyRateKg: 0.75 }, 60, { today: TODAY })
    expect(energy.atFloor).toBe(true)
    const { rows, total } = energyRows(energy, 'kcal')
    expect(total).toBe('1 200 kcal')
    expect(rows.some((r) => r.label === 'Säkerhetsgolv' && r.value.startsWith('+'))).toBe(true)
  })

  it('visar ±0 och "Du behåller vikten" när målet är pausat', () => {
    const energy = computeEnergy({ ...base, targetWeightKg: 72 }, 70, { today: TODAY })
    expect(energy.goalPause).toBe('reached')
    const adj = energyRows(energy, 'kcal').rows.find((r) => r.label === 'Justering för ditt mål')
    expect(adj).toMatchObject({ value: '±0', hint: 'Du behåller vikten' })
  })
})
